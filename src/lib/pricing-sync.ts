import type { Env } from './types';
import { apiBase, lifetimeDiscount, offerForSeats, productIdFor, seatsSold } from './billing';

/**
 * Money at the payment provider is always an integer in the currency's smallest
 * unit: 7900 is $79.00, 684900 is ₹6,849.00.
 */
function minorUnits(amount: number): number {
  return Math.round(amount * 100);
}

export interface DesiredPricing {
  /** Product base price in USD cents — the current rung of the seat ladder. */
  productUsd: number;
  /** Fixed rupee price, so India is charged a round number instead of an FX conversion. */
  productInr: number;
  /** Flat promo amounts, or null when no promo is configured. */
  code: string | null;
  discountUsd: number;
  discountInr: number;
}

/**
 * What the provider should be charging, derived from the same offer the site
 * quotes — so there is exactly one place a price is decided.
 */
export function desiredPricing(usd: number, inr: number, discount: { code: string; usd: number; inr: number } | null): DesiredPricing {
  return {
    productUsd: minorUnits(usd),
    productInr: minorUnits(inr),
    code: discount ? discount.code : null,
    discountUsd: discount ? minorUnits(discount.usd) : 0,
    discountInr: discount ? minorUnits(discount.inr) : 0,
  };
}

interface DodoProduct {
  price?: { type?: string; price?: number; currency?: string; tax_inclusive?: boolean };
  pricing_mode?: string | null;
}

interface DodoLocalizedPrice {
  id: string;
  currency: string;
  amount: number;
  country_code?: string | null;
}

interface DodoDiscount {
  discount_id: string;
  code: string;
  type: string;
  amount: number;
  currency_options?: { currency: string; max_amount_possible?: number; minimum_subtotal?: number; is_default?: boolean }[];
}

async function call<T>(env: Env, path: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(`${apiBase(env)}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.DODO_PAYMENTS_API_KEY}`,
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) return null;
    // A successful write may answer with an empty body; only the status matters.
    return ((await response.json().catch(() => ({}))) ?? {}) as T;
  } catch {
    return null;
  }
}

/**
 * Brings the payment provider in line with the prices the site advertises: the
 * lifetime product's USD price, its fixed rupee price, and the promo code's
 * amount in both currencies. Everything is compared before it is written, so a
 * run that finds nothing wrong costs three reads and changes nothing — which is
 * what makes it safe to call on a cron and after every deploy.
 *
 * The reason it exists: a price lives in three places at the provider, and a
 * quote the site paints from config while the provider still charges the old
 * amount is invisible until a customer reaches the payment page.
 */
export async function syncLifetimePricing(env: Env): Promise<{ ok: boolean; changed: string[]; problems: string[] }> {
  const changed: string[] = [];
  const problems: string[] = [];
  const productId = productIdFor(env, 'lifetime', 'monthly');
  if (!env.DODO_PAYMENTS_API_KEY || !productId) {
    return { ok: false, changed, problems: ['lifetime checkout is not configured'] };
  }

  const offer = offerForSeats(await seatsSold(env), lifetimeDiscount(env));
  const want = desiredPricing(offer.usd, offer.inr, lifetimeDiscount(env));

  const product = await call<DodoProduct>(env, `/products/${productId}`);
  if (!product) {
    return { ok: false, changed, problems: ['could not read the lifetime product'] };
  }

  if (product.price?.price !== want.productUsd || product.price?.currency !== 'USD') {
    const body = {
      price: {
        type: 'one_time_price',
        price: want.productUsd,
        currency: 'USD',
        tax_inclusive: product.price?.tax_inclusive ?? false,
        discount: 0,
        purchasing_power_parity: false,
        pay_what_you_want: false,
      },
    };
    const done = await call(env, `/products/${productId}`, { method: 'PATCH', body: JSON.stringify(body) });
    if (done === null) problems.push(`could not set the product price to ${want.productUsd}`);
    else changed.push(`product price → ${want.productUsd} USD minor units`);
  }

  // Fixed rupee pricing only applies while the product is in by_currency mode;
  // without it the provider silently falls back to converting the dollar price.
  if (product.pricing_mode !== 'by_currency') {
    const done = await call(env, `/products/${productId}`, {
      method: 'PATCH',
      body: JSON.stringify({ pricing_mode: 'by_currency' }),
    });
    if (done === null) problems.push('could not put the product in by_currency pricing mode');
    else changed.push('pricing mode → by_currency');
  }

  const rules = await call<{ items?: DodoLocalizedPrice[] }>(env, `/products/${productId}/localized-prices`);
  // Country rules are a separate, narrower mechanism; the site quotes one rupee
  // price for everyone, so only the currency-wide rule is ours to manage.
  const inrRule = rules?.items?.find((rule) => rule.currency === 'INR' && !rule.country_code);
  if (!inrRule) {
    const done = await call(env, `/products/${productId}/localized-prices`, {
      method: 'POST',
      body: JSON.stringify({ currency: 'INR', amount: want.productInr }),
    });
    if (done === null) problems.push('could not create the INR price rule');
    else changed.push(`INR price rule → ${want.productInr}`);
  } else if (inrRule.amount !== want.productInr) {
    const done = await call(env, `/products/${productId}/localized-prices/${inrRule.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ amount: want.productInr }),
    });
    if (done === null) problems.push(`could not set the INR price rule to ${want.productInr}`);
    else changed.push(`INR price rule → ${want.productInr}`);
  }

  if (want.code) {
    const promo = await call<DodoDiscount>(env, `/discounts/code/${encodeURIComponent(want.code)}`);
    if (!promo) {
      problems.push(`no discount code ${want.code} exists at the provider`);
    } else {
      const usdOption = promo.currency_options?.find((option) => option.currency === 'USD');
      const inrOption = promo.currency_options?.find((option) => option.currency === 'INR');
      const stale =
        promo.amount !== want.discountUsd ||
        usdOption?.max_amount_possible !== want.discountUsd ||
        inrOption?.max_amount_possible !== want.discountInr;
      if (stale) {
        const body = {
          amount: want.discountUsd,
          currency_options: [
            { currency: 'USD', max_amount_possible: want.discountUsd, minimum_subtotal: 0, is_default: true },
            { currency: 'INR', max_amount_possible: want.discountInr, minimum_subtotal: 0 },
          ],
        };
        const done = await call(env, `/discounts/${promo.discount_id}`, { method: 'PATCH', body: JSON.stringify(body) });
        if (done === null) problems.push(`could not set ${want.code} to ${want.discountUsd}/${want.discountInr}`);
        else changed.push(`${want.code} → ${want.discountUsd} USD / ${want.discountInr} INR minor units`);
      }
    }
  }

  return { ok: problems.length === 0, changed, problems };
}
