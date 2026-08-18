import type { Env, User } from './types';

/** Launch ladder. Seats are counted from real paid purchases, never invented. */
export const LIFETIME_TIERS = [
  { seats: 100, usd: 69, inr: 5999 },
  { seats: 400, usd: 99, inr: 8499 },
  { seats: 0, usd: 149, inr: 12999 },
];

export const FREE_LIMITS = { videos: 5, storageBytes: 3 * 1024 * 1024 * 1024, playsPerMonth: 10000 };

export interface LifetimeOffer {
  seats_sold: number;
  seats_total: number;
  seats_left: number;
  usd: number;
  inr: number;
  next_usd: number | null;
}

export async function seatsSold(env: Env): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM purchases WHERE status = 'paid'").first<{
    n: number;
  }>();
  return row?.n ?? 0;
}

export function offerForSeats(sold: number): LifetimeOffer {
  let cursor = sold;
  for (let i = 0; i < LIFETIME_TIERS.length; i += 1) {
    const tier = LIFETIME_TIERS[i];
    const next = LIFETIME_TIERS[i + 1];
    if (tier.seats === 0 || cursor < tier.seats) {
      return {
        seats_sold: sold,
        seats_total: tier.seats,
        seats_left: tier.seats === 0 ? 0 : tier.seats - cursor,
        usd: tier.usd,
        inr: tier.inr,
        next_usd: next ? next.usd : null,
      };
    }
    cursor -= tier.seats;
  }
  const last = LIFETIME_TIERS[LIFETIME_TIERS.length - 1];
  return { seats_sold: sold, seats_total: 0, seats_left: 0, usd: last.usd, inr: last.inr, next_usd: null };
}

export function isLifetime(user: Pick<User, 'plan'>): boolean {
  return user.plan === 'lifetime';
}

function apiBase(env: Env): string {
  return env.DODO_ENVIRONMENT === 'test_mode' ? 'https://test.dodopayments.com' : 'https://live.dodopayments.com';
}

export interface CheckoutSession {
  checkout_url: string;
  session_id?: string;
}

/**
 * Creates a hosted Dodo checkout session for the lifetime product and returns
 * the url the browser should be sent to.
 */
export async function createCheckout(
  env: Env,
  user: User,
  returnUrl: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string; status: number }> {
  if (!env.DODO_PAYMENTS_API_KEY || !env.DODO_LIFETIME_PRODUCT_ID) {
    return { ok: false, error: 'checkout is not configured yet', status: 503 };
  }
  let response: Response;
  try {
    response = await fetch(`${apiBase(env)}/checkouts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.DODO_PAYMENTS_API_KEY}`,
      },
      body: JSON.stringify({
        product_cart: [{ product_id: env.DODO_LIFETIME_PRODUCT_ID, quantity: 1 }],
        customer: { email: user.email, name: user.name || user.email },
        return_url: returnUrl,
        metadata: { user_id: user.id },
      }),
    });
  } catch {
    return { ok: false, error: 'could not reach the payment provider', status: 502 };
  }
  const body = (await response.json().catch(() => null)) as (CheckoutSession & { message?: string }) | null;
  if (!response.ok || !body?.checkout_url) {
    return { ok: false, error: body?.message ?? 'the payment provider rejected the checkout', status: 502 };
  }
  return { ok: true, url: body.checkout_url };
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Standard Webhooks verification, as used by Dodo: the signature is a base64
 * HMAC-SHA256 of `id.timestamp.body` keyed with the decoded `whsec_` secret,
 * and the header may carry several space-separated `v1,<sig>` candidates.
 */
export async function verifyDodoSignature(
  secret: string,
  headers: { id: string; timestamp: string; signature: string },
  body: string,
): Promise<boolean> {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(headers.timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  const raw = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  let keyBytes: Uint8Array;
  try {
    keyBytes = base64ToBytes(raw);
  } catch {
    keyBytes = new TextEncoder().encode(raw);
  }
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${headers.id}.${headers.timestamp}.${body}`),
  );
  const expected = bytesToBase64(new Uint8Array(signed));
  return headers.signature
    .split(' ')
    .map((part) => (part.includes(',') ? part.slice(part.indexOf(',') + 1) : part))
    .some((candidate) => timingSafeEqual(candidate, expected));
}
