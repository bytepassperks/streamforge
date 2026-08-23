import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/lib/types';
import { desiredPricing, syncLifetimePricing } from '../src/lib/pricing-sync';

const PRODUCT = 'pdt_lifetime';

function env(extra: Partial<Env> = {}): Env {
  return {
    DODO_PAYMENTS_API_KEY: 'key',
    DODO_LIFETIME_PRODUCT_ID: PRODUCT,
    LIFETIME_DISCOUNT_CODE: 'VIDEOKR10',
    LIFETIME_DISCOUNT_USD: '10',
    LIFETIME_DISCOUNT_INR: '850',
    DB: {
      prepare: () => ({ first: async () => ({ n: 0 }) }),
    },
    ...extra,
  } as unknown as Env;
}

/** The provider as it looks when it already agrees with the site. */
function provider(overrides: { usd?: number; mode?: string | null; inr?: number; discountUsd?: number; discountInr?: number } = {}) {
  const state = {
    usd: overrides.usd ?? 7900,
    mode: 'mode' in overrides ? overrides.mode : 'by_currency',
    inr: overrides.inr ?? 684900,
    discountUsd: overrides.discountUsd ?? 1000,
    discountInr: overrides.discountInr ?? 85000,
  };
  const writes: { path: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace('https://live.dodopayments.com', '');
    if (init?.method) {
      writes.push({ path, body: JSON.parse(String(init.body)) });
      return new Response('{}', { status: 200 });
    }
    if (path === `/products/${PRODUCT}`) {
      return Response.json({ price: { type: 'one_time_price', price: state.usd, currency: 'USD' }, pricing_mode: state.mode });
    }
    if (path === `/products/${PRODUCT}/localized-prices`) {
      return Response.json({ items: state.inr ? [{ id: 'lcp_1', currency: 'INR', amount: state.inr }] : [] });
    }
    if (path === '/discounts/code/VIDEOKR10') {
      return Response.json({
        discount_id: 'dsc_1',
        code: 'VIDEOKR10',
        type: 'flat',
        amount: state.discountUsd,
        currency_options: [
          { currency: 'USD', max_amount_possible: state.discountUsd, is_default: true },
          { currency: 'INR', max_amount_possible: state.discountInr },
        ],
      });
    }
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return writes;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('desiredPricing', () => {
  it('converts advertised prices to the provider’s minor units', () => {
    expect(desiredPricing(79, 6849, { code: 'VIDEOKR10', usd: 10, inr: 850 })).toEqual({
      productUsd: 7900,
      productInr: 684900,
      code: 'VIDEOKR10',
      discountUsd: 1000,
      discountInr: 85000,
    });
  });

  it('asks for no promo when none is configured', () => {
    expect(desiredPricing(79, 6849, null)).toMatchObject({ code: null, discountUsd: 0, discountInr: 0 });
  });
});

describe('syncLifetimePricing', () => {
  it('writes nothing when the provider already charges the advertised price', async () => {
    const writes = provider();
    const outcome = await syncLifetimePricing(env());
    expect(outcome).toEqual({ ok: true, changed: [], problems: [] });
    expect(writes).toEqual([]);
  });

  it('corrects a stale dollar price', async () => {
    const writes = provider({ usd: 6900 });
    const outcome = await syncLifetimePricing(env());
    expect(outcome.ok).toBe(true);
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe(`/products/${PRODUCT}`);
    expect(writes[0].body).toMatchObject({ price: { price: 7900, currency: 'USD' } });
  });

  /* The failure this whole module exists to prevent: a dollar-priced product
     makes the provider convert, so India is charged an FX amount the site never
     quoted. */
  it('restores fixed-currency mode and the rupee price', async () => {
    const writes = provider({ mode: null, inr: 0 });
    const outcome = await syncLifetimePricing(env());
    expect(outcome.ok).toBe(true);
    expect(writes.map((write) => write.body)).toEqual([{ pricing_mode: 'by_currency' }, { currency: 'INR', amount: 684900 }]);
  });

  it('corrects a rupee price that drifted from the advertised one', async () => {
    const writes = provider({ inr: 514900 });
    await syncLifetimePricing(env());
    expect(writes).toEqual([{ path: `/products/${PRODUCT}/localized-prices/lcp_1`, body: { amount: 684900 } }]);
  });

  it('brings the promo code back to the advertised discount in both currencies', async () => {
    const writes = provider({ discountUsd: 500, discountInr: 40000 });
    await syncLifetimePricing(env());
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe('/discounts/dsc_1');
    expect(writes[0].body).toMatchObject({
      amount: 1000,
      currency_options: [
        { currency: 'USD', max_amount_possible: 1000 },
        { currency: 'INR', max_amount_possible: 85000 },
      ],
    });
  });

  it('reports, rather than invents, a promo code the provider does not have', async () => {
    provider();
    const outcome = await syncLifetimePricing(env({ LIFETIME_DISCOUNT_CODE: 'NOPE' } as Partial<Env>));
    expect(outcome.ok).toBe(false);
    expect(outcome.problems).toEqual(['no discount code NOPE exists at the provider']);
  });

  it('touches nothing when checkout is not configured', async () => {
    const writes = provider();
    const outcome = await syncLifetimePricing(env({ DODO_LIFETIME_PRODUCT_ID: '' } as Partial<Env>));
    expect(outcome).toMatchObject({ ok: false, problems: ['lifetime checkout is not configured'] });
    expect(writes).toEqual([]);
  });

  it('surfaces a provider that refuses the write instead of claiming success', async () => {
    provider({ usd: 6900 });
    const failing = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method) return new Response('nope', { status: 500 });
      return Response.json({ price: { price: 6900, currency: 'USD' }, pricing_mode: 'by_currency' });
    });
    vi.stubGlobal('fetch', failing);
    const outcome = await syncLifetimePricing(env());
    expect(outcome.ok).toBe(false);
    expect(outcome.problems[0]).toContain('could not set the product price to 7900');
  });
});
