import type { Env, User } from './types';
import { PLAN_RANK, PLANS } from './billing';
import type { Grant } from './billing';
import { newId, now } from './util';

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,31}$/;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function normaliseCode(input: string): string | null {
  const code = input.trim().toUpperCase().replace(/\s+/g, '');
  return CODE_PATTERN.test(code) ? code : null;
}

export function generateCode(prefix = 'PROMO'): string {
  const cleanPrefix = (normaliseCode(prefix) ?? 'PROMO').replace(/-+$/, '').slice(0, 25) || 'PROMO';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let suffix = '';
  for (const byte of bytes) suffix += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return `${cleanPrefix}-${suffix}`;
}

export async function settleGrant<T extends Grant>(env: Env, user: T): Promise<T> {
  const plan = (user.grant_plan ?? '').trim();
  const until = Number(user.grant_until ?? 0);
  if (plan && until !== 0 && until <= now()) {
    await env.DB.prepare(
      "UPDATE users SET grant_plan = '', grant_until = 0, grant_code = '' WHERE id = ? AND grant_plan = ? AND grant_until = ? AND grant_code = ?",
    )
      .bind((user as Partial<User>).id, plan, until, user.grant_code ?? '')
      .run();
    return { ...user, grant_plan: '', grant_until: 0, grant_code: '' };
  }
  return user;
}

export type RedeemResult =
  | { ok: true; plan: string; granted_until: number; code: string }
  | { ok: false; status: 404 | 409; error: string };

export async function redeemCode(env: Env, user: User, rawCode: string): Promise<RedeemResult> {
  const code = normaliseCode(rawCode);
  if (!code) return { ok: false, status: 404, error: 'that code is not valid' };
  const account = await settleGrant(env, user);
  const row = await env.DB.prepare(
    'SELECT id, code, plan, grant_days, redeem_by, max_redemptions, redemptions, active FROM promo_codes WHERE code = ?',
  )
    .bind(code)
    .first<{
      id: string;
      code: string;
      plan: string;
      grant_days: number;
      redeem_by: number;
      max_redemptions: number;
      redemptions: number;
      active: number;
    }>();
  if (!row) return { ok: false, status: 404, error: 'that code is not valid' };
  if (Number(row.active) === 0) return { ok: false, status: 409, error: 'that code is no longer active' };
  if (Number(row.redeem_by) !== 0 && Number(row.redeem_by) <= now()) {
    return { ok: false, status: 409, error: 'that code has expired' };
  }
  const prior = await env.DB.prepare(
    'SELECT id FROM promo_redemptions WHERE code_id = ? AND user_id = ?',
  )
    .bind(row.id, account.id)
    .first();
  if (prior) return { ok: false, status: 409, error: 'you have already used that code' };
  if (Number(row.max_redemptions) !== 0 && Number(row.redemptions) >= Number(row.max_redemptions)) {
    return { ok: false, status: 409, error: 'that code has been fully claimed' };
  }
  const owned = PLANS[account.plan] ?? PLANS.free;
  const target = PLANS[row.plan];
  if (!target) return { ok: false, status: 404, error: 'that code is not valid' };
  if (PLAN_RANK[owned.id] >= PLAN_RANK[target.id]) {
    return { ok: false, status: 409, error: 'your plan already includes this' };
  }
  const claimed = await env.DB.prepare(
    'UPDATE promo_codes SET redemptions = redemptions + 1 WHERE id = ? AND active = 1 AND (max_redemptions = 0 OR redemptions < max_redemptions)',
  )
    .bind(row.id)
    .run();
  if (!claimed.meta?.changes) return { ok: false, status: 409, error: 'that code has been fully claimed' };
  const created = now();
  const grantedUntil = Number(row.grant_days) === 0 ? 0 : created + Number(row.grant_days) * 86400;
  try {
    await env.DB.prepare(
      'INSERT INTO promo_redemptions (id, code_id, code, user_id, plan, granted_until, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(newId('red'), row.id, row.code, account.id, row.plan, grantedUntil, created)
      .run();
  } catch {
    await env.DB.prepare('UPDATE promo_codes SET redemptions = redemptions - 1 WHERE id = ?').bind(row.id).run();
    return { ok: false, status: 409, error: 'you have already used that code' };
  }
  await env.DB.prepare('UPDATE users SET grant_plan = ?, grant_until = ?, grant_code = ? WHERE id = ?')
    .bind(row.plan, grantedUntil, row.code, account.id)
    .run();
  return { ok: true, plan: row.plan, granted_until: grantedUntil, code: row.code };
}
