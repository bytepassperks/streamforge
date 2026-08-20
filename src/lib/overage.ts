import type { Env, User } from './types';
import { OVERAGE_PER_10K_USD, apiBase, periodKey, planFor } from './billing';
import { newId } from './util';

export interface OverageRow {
  id: string;
  user_id: string;
  period: string;
  plan: string;
  allowance: number;
  plays: number;
  over: number;
  amount_cents: number;
  currency: string;
  status: string;
  subscription_id: string;
  payment_id: string;
  attempts: number;
  error: string;
  created_at: number;
  updated_at: number;
}

type Account = Pick<User, 'id' | 'plan' | 'role' | 'unlimited' | 'subscription_id'>;

/** Cents owed for plays past the allowance, rounded up to the nearest cent. */
export function overageCents(over: number): number {
  if (over <= 0) return 0;
  return Math.ceil((over / 10000) * OVERAGE_PER_10K_USD * 100);
}

/** The month before the one `at` falls in — the period a month-close bills for. */
export function previousPeriod(at: number = Date.now()): string {
  const date = new Date(at);
  return periodKey(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
}

/**
 * Charges an existing subscription for an extra amount. Dodo exposes this as a
 * one-off charge against the subscription, priced in the smallest currency unit,
 * and answers with the payment it created.
 */
export async function chargeSubscription(
  env: Env,
  subscriptionId: string,
  amountCents: number,
): Promise<{ ok: true; paymentId: string } | { ok: false; error: string }> {
  if (!env.DODO_PAYMENTS_API_KEY) return { ok: false, error: 'the payment provider is not configured' };
  let response: Response;
  try {
    response = await fetch(`${apiBase(env)}/subscriptions/${subscriptionId}/charge`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.DODO_PAYMENTS_API_KEY}`,
      },
      body: JSON.stringify({ product_price: amountCents }),
    });
  } catch {
    return { ok: false, error: 'could not reach the payment provider' };
  }
  const body = (await response.json().catch(() => null)) as { payment_id?: string; message?: string } | null;
  if (!response.ok || !body?.payment_id) {
    return { ok: false, error: body?.message ?? `the payment provider returned ${response.status}` };
  }
  return { ok: true, paymentId: body.payment_id };
}

/**
 * Writes the amount owed for a closed period, exactly once per account and
 * period. Free accounts are stopped at their allowance rather than billed, and
 * admin/unlimited accounts are never metered, so neither ever gets a row.
 */
export async function recordOverage(
  env: Env,
  account: Account,
  period: string,
  at: number = Date.now(),
): Promise<OverageRow | null> {
  const plan = planFor(account);
  if (plan.hardStop || !Number.isFinite(plan.plays)) return null;
  const usage = await env.DB.prepare('SELECT plays FROM play_usage WHERE user_id = ? AND period = ?')
    .bind(account.id, period)
    .first<{ plays: number }>();
  const plays = usage?.plays ?? 0;
  const over = Math.max(0, plays - plan.plays);
  if (over <= 0) return null;
  const ts = Math.floor(at / 1000);
  const status = account.subscription_id ? 'pending' : 'manual';
  await env.DB.prepare(
    `INSERT INTO overage_charges
       (id, user_id, period, plan, allowance, plays, over, amount_cents, currency, status,
        subscription_id, payment_id, attempts, error, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'USD', ?, ?, '', 0, '', ?, ?)
     ON CONFLICT(user_id, period) DO NOTHING`,
  )
    .bind(
      newId('ovg'),
      account.id,
      period,
      plan.id,
      plan.plays,
      plays,
      over,
      overageCents(over),
      status,
      account.subscription_id ?? '',
      ts,
      ts,
    )
    .run();
  return await env.DB.prepare('SELECT * FROM overage_charges WHERE user_id = ? AND period = ?')
    .bind(account.id, period)
    .first<OverageRow>();
}

/**
 * Attempts collection for one recorded charge. Only `pending` and `failed` rows
 * are ever charged, so a paid or waived period can never be billed twice, and a
 * row with no subscription stays `manual` instead of hitting the provider.
 */
export async function collectOverage(
  env: Env,
  row: OverageRow,
  at: number = Date.now(),
): Promise<{ status: string; error?: string; payment_id?: string }> {
  if (row.status === 'paid' || row.status === 'waived') return { status: row.status };
  if (!row.subscription_id) {
    await setStatus(env, row.id, 'manual', { error: 'no subscription to charge', at });
    return { status: 'manual', error: 'no subscription to charge' };
  }
  if (row.amount_cents <= 0) {
    await setStatus(env, row.id, 'waived', { error: '', at });
    return { status: 'waived' };
  }
  const result = await chargeSubscription(env, row.subscription_id, row.amount_cents);
  if (!result.ok) {
    await setStatus(env, row.id, 'failed', { error: result.error, attempt: true, at });
    return { status: 'failed', error: result.error };
  }
  await setStatus(env, row.id, 'paid', { paymentId: result.paymentId, attempt: true, at });
  return { status: 'paid', payment_id: result.paymentId };
}

async function setStatus(
  env: Env,
  id: string,
  status: string,
  options: { error?: string; paymentId?: string; attempt?: boolean; at?: number } = {},
): Promise<void> {
  await env.DB.prepare(
    `UPDATE overage_charges
        SET status = ?, error = ?, payment_id = CASE WHEN ? = '' THEN payment_id ELSE ? END,
            attempts = attempts + ?, updated_at = ?
      WHERE id = ?`,
  )
    .bind(
      status,
      options.error ?? '',
      options.paymentId ?? '',
      options.paymentId ?? '',
      options.attempt ? 1 : 0,
      Math.floor((options.at ?? Date.now()) / 1000),
      id,
    )
    .run();
}

export interface CloseSummary {
  period: string;
  recorded: number;
  charged: number;
  failed: number;
  manual: number;
  amount_cents: number;
}

/**
 * Month close: records what every paid account owes for `period`, then collects
 * it. Safe to run repeatedly — recording is idempotent per account and period,
 * and collection only touches rows that are still owed.
 */
export async function closePeriod(env: Env, period: string, at: number = Date.now()): Promise<CloseSummary> {
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.plan, u.role, u.unlimited, u.subscription_id
       FROM users u JOIN play_usage p ON p.user_id = u.id
      WHERE p.period = ? AND u.unlimited = 0 AND u.role != 'admin' AND u.plan != 'free'`,
  )
    .bind(period)
    .all<Account>();
  const summary: CloseSummary = { period, recorded: 0, charged: 0, failed: 0, manual: 0, amount_cents: 0 };
  for (const account of results ?? []) {
    const row = await recordOverage(env, account, period, at);
    if (!row || row.status === 'paid' || row.status === 'waived') continue;
    summary.recorded += 1;
    const outcome = await collectOverage(env, row, at);
    if (outcome.status === 'paid') {
      summary.charged += 1;
      summary.amount_cents += row.amount_cents;
    } else if (outcome.status === 'failed') {
      summary.failed += 1;
    } else if (outcome.status === 'manual') {
      summary.manual += 1;
    }
  }
  return summary;
}
