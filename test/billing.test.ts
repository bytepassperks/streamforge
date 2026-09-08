import { describe, expect, it } from 'vitest';
import type { Env } from '../src/lib/types';
import {
  LIFETIME_TIERS,
  grantedPlanId,
  isAdmin,
  isEntitled,
  isLifetime,
  isPaid,
  lifetimeDiscount,
  offerForSeats,
  planFor,
  verifyDodoSignature,
} from '../src/lib/billing';

describe('offerForSeats', () => {
  it('walks the launch ladder as real seats sell', () => {
    expect(offerForSeats(0)).toMatchObject({ usd: 79, seats_total: 100, seats_left: 100, next_usd: 99 });
    expect(offerForSeats(13)).toMatchObject({ usd: 79, seats_left: 87, seats_sold: 13 });
    expect(offerForSeats(100)).toMatchObject({ usd: 99, seats_total: 400, seats_left: 400, next_usd: 149 });
    expect(offerForSeats(250)).toMatchObject({ usd: 99, seats_left: 250 });
  });

  it('settles on the anchor price once every seat tier is gone', () => {
    const last = LIFETIME_TIERS[LIFETIME_TIERS.length - 1];
    expect(offerForSeats(500)).toMatchObject({ usd: last.usd, inr: last.inr, seats_total: 0, next_usd: null });
    expect(offerForSeats(9999)).toMatchObject({ usd: last.usd, seats_left: 0 });
  });

  it('quotes the net price when a promo is configured, and the list price when not', () => {
    const env = {
      LIFETIME_DISCOUNT_CODE: 'VIDEOKR10',
      LIFETIME_DISCOUNT_USD: '10',
      LIFETIME_DISCOUNT_INR: '850',
    } as Env;
    const promo = lifetimeDiscount(env);
    expect(promo).toEqual({ code: 'VIDEOKR10', usd: 10, inr: 850 });
    expect(offerForSeats(0, promo)).toMatchObject({
      usd: 79,
      net_usd: 69,
      inr: 6849,
      net_inr: 5999,
      discount_usd: 10,
      discount_code: 'VIDEOKR10',
    });
    expect(offerForSeats(0)).toMatchObject({ net_usd: 79, net_inr: 6849, discount_usd: 0, discount_code: null });
  });

  it('ignores a promo with no code or a zero amount, so nothing is quoted for free', () => {
    expect(lifetimeDiscount({ LIFETIME_DISCOUNT_USD: '10' } as Env)).toBeNull();
    expect(lifetimeDiscount({ LIFETIME_DISCOUNT_CODE: 'X', LIFETIME_DISCOUNT_USD: '0' } as Env)).toBeNull();
    expect(lifetimeDiscount({} as Env)).toBeNull();
  });
});

describe('isLifetime', () => {
  it('recognises the lifetime plan', () => {
    expect(isLifetime({ plan: 'lifetime' })).toBe(true);
    expect(isLifetime({ plan: 'free' })).toBe(false);
  });

  it('treats a manual override and admins as unlimited', () => {
    expect(isLifetime({ plan: 'free', unlimited: 1 })).toBe(true);
    expect(isLifetime({ plan: 'free', role: 'admin' })).toBe(true);
    expect(isLifetime({ plan: 'free', unlimited: 0, role: 'user' })).toBe(false);
  });

  it('lets a live grant lift free without changing purchase ownership', () => {
    const user = { plan: 'free', role: 'user', unlimited: 0, grant_plan: 'starter', grant_until: 9_999_999_999 };
    expect(grantedPlanId(user, 1_700_000_000)).toBe('starter');
    expect(planFor(user, 1_700_000_000).id).toBe('starter');
    expect(isEntitled(user, 1_700_000_000)).toBe(true);
    expect(isPaid(user)).toBe(false);
    expect(isLifetime(user)).toBe(false);
  });

  it('ignores a lapsed grant, preserves never-lapsing grants, and lets ownership win ties', () => {
    expect(grantedPlanId({ grant_plan: 'starter', grant_until: 1_699_999_999 }, 1_700_000_000)).toBe('');
    expect(planFor({ plan: 'free', grant_plan: 'starter', grant_until: 0 }, 1_700_000_000).id).toBe('starter');
    expect(planFor({ plan: 'agency', grant_plan: 'starter', grant_until: 9_999_999 }, 1_700_000_000).id).toBe('agency');
    const lapsed = { plan: 'free', role: 'user', unlimited: 0, grant_plan: 'starter', grant_until: 1_699_999_999 };
    expect(isEntitled(lapsed, 1_700_000_000)).toBe(false);
    expect(isPaid(lapsed)).toBe(false);
    expect(isLifetime(lapsed)).toBe(false);
  });

  it('leaves admin and unlimited accounts unaffected by grants', () => {
    expect(planFor({ plan: 'free', role: 'admin', unlimited: 0, grant_plan: 'starter' }).id).toBe('unlimited');
    expect(planFor({ plan: 'free', role: 'user', unlimited: 1, grant_plan: 'starter' }).id).toBe('unlimited');
  });
});

describe('isAdmin', () => {
  it('is the role check alone, not the plan', () => {
    expect(isAdmin({ role: 'admin' })).toBe(true);
    expect(isAdmin({ role: 'user' })).toBe(false);
  });
});

const SECRET = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';

async function sign(id: string, timestamp: string, body: string): Promise<string> {
  const raw = SECRET.slice(6);
  const binary = atob(raw);
  const keyBytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) keyBytes[i] = binary.charCodeAt(i);
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)),
  );
  let out = '';
  for (let i = 0; i < signed.length; i += 1) out += String.fromCharCode(signed[i]);
  return `v1,${btoa(out)}`;
}

describe('verifyDodoSignature', () => {
  const body = JSON.stringify({ type: 'payment.succeeded', data: { payment_id: 'pay_1' } });

  it('accepts a correctly signed, fresh delivery', async () => {
    const id = 'msg_1';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = await sign(id, timestamp, body);
    expect(await verifyDodoSignature(SECRET, { id, timestamp, signature }, body)).toBe(true);
  });

  it('rejects a tampered body, a wrong secret and missing headers', async () => {
    const id = 'msg_2';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = await sign(id, timestamp, body);
    expect(await verifyDodoSignature(SECRET, { id, timestamp, signature }, `${body} `)).toBe(false);
    expect(await verifyDodoSignature('whsec_AAAA', { id, timestamp, signature }, body)).toBe(false);
    expect(await verifyDodoSignature('', { id, timestamp, signature }, body)).toBe(false);
    expect(await verifyDodoSignature(SECRET, { id, timestamp, signature: '' }, body)).toBe(false);
  });

  it('rejects replays outside the timestamp window', async () => {
    const id = 'msg_3';
    const timestamp = String(Math.floor(Date.now() / 1000) - 3600);
    const signature = await sign(id, timestamp, body);
    expect(await verifyDodoSignature(SECRET, { id, timestamp, signature }, body)).toBe(false);
  });
});
