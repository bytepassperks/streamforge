import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closePeriod, collectOverage, overageCents, previousPeriod, recordOverage } from '../src/lib/overage';
import type { OverageRow } from '../src/lib/overage';
import type { Env } from '../src/lib/types';

interface Account {
  id: string;
  plan: string;
  role: string;
  unlimited: number;
  subscription_id: string;
}

/**
 * A stand-in for the handful of statements the overage ledger runs, so the
 * eligibility rules, the one-charge-per-period guard and the retry path can be
 * tested without D1.
 */
interface Store {
  usage: Map<string, number>;
  charges: OverageRow[];
  accounts: Account[];
}

function fakeEnv(store: Store, key = 'sk_test'): Env {
  const prepare = (sql: string) => {
    let args: unknown[] = [];
    const statement = {
      bind(...values: unknown[]) {
        args = values;
        return statement;
      },
      async first<T>(): Promise<T | null> {
        if (sql.includes('FROM play_usage')) {
          const plays = store.usage.get(`${String(args[0])}|${String(args[1])}`);
          return plays === undefined ? null : ({ plays } as T);
        }
        const found = store.charges.find((row) => row.user_id === args[0] && row.period === args[1]);
        return (found ?? null) as T | null;
      },
      async all<T>() {
        return { results: store.accounts as unknown as T[] };
      },
      async run() {
        if (sql.includes('INSERT INTO overage_charges')) {
          const [
            id,
            userId,
            period,
            plan,
            allowance,
            plays,
            over,
            amountCents,
            status,
            subscriptionId,
            createdAt,
          ] = args as [string, string, string, string, number, number, number, number, string, string, number];
          if (!store.charges.some((row) => row.user_id === userId && row.period === period)) {
            store.charges.push({
              id,
              user_id: userId,
              period,
              plan,
              allowance,
              plays,
              over,
              amount_cents: amountCents,
              currency: 'USD',
              status,
              subscription_id: subscriptionId,
              payment_id: '',
              attempts: 0,
              error: '',
              created_at: createdAt,
              updated_at: createdAt,
            });
          }
          return { meta: { changes: 1 } };
        }
        if (sql.includes('UPDATE overage_charges')) {
          const [status, error, paymentId, , attempt, updatedAt, id] = args as [
            string,
            string,
            string,
            string,
            number,
            number,
            string,
          ];
          const row = store.charges.find((entry) => entry.id === id);
          if (row) {
            row.status = status;
            row.error = error;
            if (paymentId) row.payment_id = paymentId;
            row.attempts += attempt;
            row.updated_at = updatedAt;
          }
          return { meta: { changes: 1 } };
        }
        const key = `${String(args[0])}|${String(args[1])}`;
        store.usage.set(key, Number(args[2]));
        return { meta: { changes: 1 } };
      },
    };
    return statement;
  };
  return { DB: { prepare }, DODO_PAYMENTS_API_KEY: key, DODO_ENVIRONMENT: 'test_mode' } as unknown as Env;
}

const paid = { id: 'usr_1', plan: 'starter', role: 'user', unlimited: 0, subscription_id: 'sub_1' };

describe('overageCents', () => {
  it('bills a dollar per ten thousand plays, rounded up to the cent', () => {
    expect(overageCents(0)).toBe(0);
    expect(overageCents(-5)).toBe(0);
    expect(overageCents(10000)).toBe(100);
    expect(overageCents(25000)).toBe(250);
    expect(overageCents(1)).toBe(1);
  });
});

describe('previousPeriod', () => {
  it('is the month before, crossing the year boundary', () => {
    expect(previousPeriod(Date.UTC(2026, 8, 1, 4))).toBe('2026-08');
    expect(previousPeriod(Date.UTC(2027, 0, 3))).toBe('2026-12');
  });
});

describe('recordOverage', () => {
  let store: Store;
  let env: Env;

  beforeEach(() => {
    store = { usage: new Map([['usr_1|2026-08', 35000]]), charges: [], accounts: [] };
    env = fakeEnv(store);
  });

  it('records what a paid account owes once per period', async () => {
    const first = await recordOverage(env, paid, '2026-08');
    expect(first).toMatchObject({ over: 25000, amount_cents: 250, status: 'pending', plan: 'starter' });
    await recordOverage(env, paid, '2026-08');
    expect(store.charges).toHaveLength(1);
  });

  it('never bills a free account, an admin or an unlimited override', async () => {
    store.usage.set('usr_2|2026-08', 90000);
    const shapes = [
      { id: 'usr_2', plan: 'free', role: 'user', unlimited: 0, subscription_id: '' },
      { id: 'usr_2', plan: 'starter', role: 'admin', unlimited: 0, subscription_id: 'sub_2' },
      { id: 'usr_2', plan: 'agency', role: 'user', unlimited: 1, subscription_id: 'sub_2' },
    ];
    for (const account of shapes) expect(await recordOverage(env, account, '2026-08')).toBe(null);
    expect(store.charges).toHaveLength(0);
  });

  it('records nothing when the account stayed inside its allowance', async () => {
    store.usage.set('usr_1|2026-08', 9000);
    expect(await recordOverage(env, paid, '2026-08')).toBe(null);
  });

  it('marks a lifetime account with no subscription for manual collection', async () => {
    const row = await recordOverage(
      env,
      { id: 'usr_1', plan: 'lifetime', role: 'user', unlimited: 0, subscription_id: '' },
      '2026-08',
    );
    expect(row).toMatchObject({ status: 'manual', over: 25000 });
  });
});

describe('collectOverage', () => {
  let store: Store;
  let env: Env;
  const fetchMock = vi.fn();

  beforeEach(() => {
    store = { usage: new Map([['usr_1|2026-08', 35000]]), charges: [], accounts: [] };
    env = fakeEnv(store);
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function ok(paymentId: string) {
    return { ok: true, status: 200, json: async () => ({ payment_id: paymentId }) } as unknown as Response;
  }

  it('charges the subscription and keeps the payment id', async () => {
    fetchMock.mockResolvedValue(ok('pay_1'));
    const row = (await recordOverage(env, paid, '2026-08')) as OverageRow;
    expect(await collectOverage(env, row)).toMatchObject({ status: 'paid', payment_id: 'pay_1' });
    expect(store.charges[0]).toMatchObject({ status: 'paid', payment_id: 'pay_1', attempts: 1 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://test.dodopayments.com/subscriptions/sub_1/charge');
    expect(JSON.parse(String(init.body))).toEqual({ product_price: 250 });
  });

  it('never charges an already collected or waived period twice', async () => {
    fetchMock.mockResolvedValue(ok('pay_1'));
    const row = (await recordOverage(env, paid, '2026-08')) as OverageRow;
    await collectOverage(env, row);
    fetchMock.mockClear();
    await collectOverage(env, store.charges[0]);
    await collectOverage(env, { ...store.charges[0], status: 'waived' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('leaves a rejected charge retryable and collects on the retry', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 402,
      json: async () => ({ message: 'card declined' }),
    } as unknown as Response);
    const row = (await recordOverage(env, paid, '2026-08')) as OverageRow;
    expect(await collectOverage(env, row)).toMatchObject({ status: 'failed', error: 'card declined' });
    expect(store.charges[0]).toMatchObject({ status: 'failed', attempts: 1, payment_id: '' });

    fetchMock.mockResolvedValue(ok('pay_2'));
    expect(await collectOverage(env, store.charges[0])).toMatchObject({ status: 'paid' });
    expect(store.charges[0]).toMatchObject({ status: 'paid', payment_id: 'pay_2', attempts: 2 });
  });

  it('does not call the provider without a subscription', async () => {
    const row = (await recordOverage(
      env,
      { ...paid, plan: 'lifetime', subscription_id: '' },
      '2026-08',
    )) as OverageRow;
    expect(await collectOverage(env, row)).toMatchObject({ status: 'manual' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('closePeriod', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('bills every eligible account once and totals what it collected', async () => {
    const store: Store = {
      usage: new Map([
        ['usr_1|2026-08', 35000],
        ['usr_2|2026-08', 9000],
        ['usr_3|2026-08', 20000],
      ]),
      charges: [],
      accounts: [
        paid,
        { id: 'usr_2', plan: 'starter', role: 'user', unlimited: 0, subscription_id: 'sub_2' },
        { id: 'usr_3', plan: 'lifetime', role: 'user', unlimited: 0, subscription_id: '' },
      ],
    };
    const env = fakeEnv(store);
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ payment_id: 'pay_1' }) } as unknown as Response);

    const summary = await closePeriod(env, '2026-08');
    expect(summary).toMatchObject({ recorded: 2, charged: 1, failed: 0, manual: 1, amount_cents: 250 });

    fetchMock.mockClear();
    const again = await closePeriod(env, '2026-08');
    expect(again).toMatchObject({ recorded: 1, charged: 0, manual: 1 });
    expect(store.charges).toHaveLength(2);
  });
});
