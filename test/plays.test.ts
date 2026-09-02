import { beforeEach, describe, expect, it } from 'vitest';
import {
  FREE_LIMITS,
  PLANS,
  countPlay,
  periodKey,
  planFor,
  planForProduct,
  playUsage,
  productIdFor,
} from '../src/lib/billing';
import type { Env } from '../src/lib/types';

/**
 * A minimal stand-in for the three statements the play ledger runs, so the
 * counter, its de-duplication and the plan gates can be tested without D1.
 */
interface Store {
  usage: Map<string, number>;
  dedup: Set<string>;
}

function fakeEnv(store: Store): Env {
  const prepare = (sql: string) => {
    let args: unknown[] = [];
    const statement = {
      bind(...values: unknown[]) {
        args = values;
        return statement;
      },
      async first<T>(): Promise<T | null> {
        const key = `${String(args[0])}|${String(args[1])}`;
        const plays = store.usage.get(key);
        return plays === undefined ? null : ({ plays } as T);
      },
      async run() {
        if (sql.includes('play_dedup')) {
          const key = `${String(args[0])}|${String(args[1])}|${String(args[2])}`;
          if (store.dedup.has(key)) return { meta: { changes: 0 } };
          store.dedup.add(key);
          return { meta: { changes: 1 } };
        }
        const key = `${String(args[0])}|${String(args[1])}`;
        store.usage.set(key, (store.usage.get(key) ?? 0) + 1);
        return { meta: { changes: 1 } };
      },
    };
    return statement;
  };
  return { DB: { prepare } } as unknown as Env;
}

describe('periodKey', () => {
  it('is the UTC calendar month', () => {
    expect(periodKey(Date.UTC(2026, 7, 18, 23, 59))).toBe('2026-08');
    expect(periodKey(Date.UTC(2026, 8, 1, 0, 0))).toBe('2026-09');
  });
});

describe('planFor', () => {
  it('maps the stored plan, defaulting unknown plans to free', () => {
    expect(planFor({ plan: 'starter' }).plays).toBe(10000);
    expect(planFor({ plan: 'agency' }).plays).toBe(Infinity);
    expect(planFor({ plan: 'lifetime' }).plays).toBe(10000);
    expect(planFor({ plan: 'free' }).plays).toBe(500);
    expect(planFor({ plan: 'nonsense' }).id).toBe('free');
  });

  it('gives admins and manual overrides an unlimited allowance', () => {
    expect(planFor({ plan: 'free', role: 'admin' }).plays).toBe(Infinity);
    expect(planFor({ plan: 'free', unlimited: 1 }).plays).toBe(Infinity);
  });

  it('keeps free as the only plan that stops at its allowance', () => {
    expect(PLANS.free.hardStop).toBe(true);
    for (const id of ['starter', 'agency', 'lifetime']) expect(PLANS[id].hardStop).toBe(false);
  });
});

describe('play ledger', () => {
  let store: Store;
  let env: Env;

  beforeEach(() => {
    store = { usage: new Map(), dedup: new Set() };
    env = fakeEnv(store);
  });

  it('counts a viewer once per video per month', async () => {
    expect(await countPlay(env, 'usr_1', 'vid_1', 'view_a')).toBe(true);
    expect(await countPlay(env, 'usr_1', 'vid_1', 'view_a')).toBe(false);
    expect(await countPlay(env, 'usr_1', 'vid_1', 'view_b')).toBe(true);
    expect(await countPlay(env, 'usr_1', 'vid_2', 'view_a')).toBe(true);
    const usage = await playUsage(env, { id: 'usr_1', plan: 'free', role: 'user', unlimited: 0 });
    expect(usage.plays).toBe(3);
  });

  it('bills each owner separately and resets on the month boundary', async () => {
    await countPlay(env, 'usr_1', 'vid_1', 'view_a', Date.UTC(2026, 7, 10));
    await countPlay(env, 'usr_2', 'vid_9', 'view_a', Date.UTC(2026, 7, 10));
    await countPlay(env, 'usr_1', 'vid_1', 'view_a', Date.UTC(2026, 8, 2));

    const owner = { id: 'usr_1', plan: 'free', role: 'user', unlimited: 0 };
    expect((await playUsage(env, owner, '2026-08')).plays).toBe(1);
    expect((await playUsage(env, owner, '2026-09')).plays).toBe(1);
    expect((await playUsage(env, { ...owner, id: 'usr_2' }, '2026-08')).plays).toBe(1);
  });

  it('blocks a free account past its allowance and no one else', async () => {
    store.usage.set(`usr_1|${periodKey()}`, 501);
    const free = await playUsage(env, { id: 'usr_1', plan: 'free', role: 'user', unlimited: 0 });
    expect(free).toMatchObject({ allowance: 500, over: 1, blocked: true });

    const starter = await playUsage(env, { id: 'usr_1', plan: 'starter', role: 'user', unlimited: 0 });
    expect(starter).toMatchObject({ allowance: 10000, over: 0, blocked: false });
  });

  it('accrues overage on paid plans at a dollar per ten thousand plays', async () => {
    store.usage.set(`usr_1|${periodKey()}`, 35000);
    const starter = await playUsage(env, { id: 'usr_1', plan: 'starter', role: 'user', unlimited: 0 });
    expect(starter).toMatchObject({ over: 25000, blocked: false, overage_usd: 2.5 });

    const lifetime = await playUsage(env, { id: 'usr_1', plan: 'lifetime', role: 'user', unlimited: 0 });
    expect(lifetime).toMatchObject({ over: 25000, blocked: false, overage_usd: 2.5 });

    const agency = await playUsage(env, { id: 'usr_1', plan: 'agency', role: 'user', unlimited: 0 });
    expect(agency).toMatchObject({ over: 0, blocked: false, overage_usd: 0 });
  });

  it('treats Agency as unlimited and keeps free limits focused on plays and videos', async () => {
    store.usage.set(`usr_1|${periodKey()}`, 900000);
    const agency = await playUsage(env, { id: 'usr_1', plan: 'agency', role: 'user', unlimited: 0 });
    expect(agency).toMatchObject({ allowance: null, over: 0, blocked: false, overage_usd: 0 });
    expect('storageBytes' in FREE_LIMITS).toBe(false);
  });

  it('never meters an admin or an unlimited override', async () => {
    store.usage.set(`usr_1|${periodKey()}`, 900000);
    const admin = await playUsage(env, { id: 'usr_1', plan: 'free', role: 'admin', unlimited: 0 });
    expect(admin).toMatchObject({ allowance: null, over: 0, blocked: false, overage_usd: 0 });
  });
});

describe('Dodo product mapping', () => {
  const env = {
    DODO_LIFETIME_PRODUCT_ID: 'pdt_life',
    DODO_STARTER_PRODUCT_ID: 'pdt_start_m',
    DODO_STARTER_ANNUAL_PRODUCT_ID: 'pdt_start_y',
    DODO_AGENCY_PRODUCT_ID: 'pdt_agency_m',
  } as unknown as Env;

  it('resolves a product per plan and cycle, and back again', () => {
    expect(productIdFor(env, 'starter', 'annual')).toBe('pdt_start_y');
    expect(productIdFor(env, 'agency', 'monthly')).toBe('pdt_agency_m');
    expect(productIdFor(env, 'agency', 'annual')).toBe('');
    expect(planForProduct(env, 'pdt_start_m')).toBe('starter');
    expect(planForProduct(env, 'pdt_life')).toBe('lifetime');
    expect(planForProduct(env, 'pdt_unknown')).toBe(null);
    expect(planForProduct(env, '')).toBe(null);
  });
});
