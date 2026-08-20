import type { Env, User } from './types';

/** Launch ladder. Seats are counted from real paid purchases, never invented. */
export const LIFETIME_TIERS = [
  { seats: 100, usd: 69, inr: 5999 },
  { seats: 400, usd: 99, inr: 8499 },
  { seats: 0, usd: 149, inr: 12999 },
];

export interface Plan {
  id: string;
  name: string;
  /** Plays included each calendar month. */
  plays: number;
  /** null means unlimited. */
  videos: number | null;
  /** Fair-use storage ceiling, in bytes. */
  storageBytes: number;
  /** Free stops at its allowance; paid plans keep serving and accrue overage. */
  hardStop: boolean;
  usd: number;
  usdAnnual: number;
  inr: number;
}

/**
 * Plays are what we charge for; storage is the cost that accrues whether a video
 * is watched or not, so every plan carries a fair-use ceiling on it.
 */
export const PLANS: Record<string, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    plays: 500,
    videos: 5,
    storageBytes: 2 * 1024 * 1024 * 1024,
    hardStop: true,
    usd: 0,
    usdAnnual: 0,
    inr: 0,
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    plays: 10000,
    videos: null,
    storageBytes: 25 * 1024 * 1024 * 1024,
    hardStop: false,
    usd: 5,
    usdAnnual: 29,
    inr: 399,
  },
  agency: {
    id: 'agency',
    name: 'Agency',
    plays: 150000,
    videos: null,
    storageBytes: 250 * 1024 * 1024 * 1024,
    hardStop: false,
    usd: 29,
    usdAnnual: 290,
    inr: 2499,
  },
  lifetime: {
    id: 'lifetime',
    name: 'Lifetime',
    plays: 10000,
    videos: null,
    storageBytes: 25 * 1024 * 1024 * 1024,
    hardStop: false,
    usd: 0,
    usdAnnual: 0,
    inr: 0,
  },
};

/** Overage, once a paid plan is past its allowance: $1 per 10,000 plays. */
export const OVERAGE_PER_10K_USD = 1;

export const FREE_LIMITS = {
  videos: PLANS.free.videos ?? 5,
  storageBytes: PLANS.free.storageBytes,
  playsPerMonth: PLANS.free.plays,
};

/** The plan an account is actually entitled to, honouring admin overrides. */
export function planFor(user: Partial<Pick<User, 'plan' | 'role' | 'unlimited'>>): Plan {
  if (Number(user.unlimited) === 1 || user.role === 'admin') {
    return { ...PLANS.agency, id: 'unlimited', name: 'Unlimited', plays: Infinity, hardStop: false };
  }
  return PLANS[user.plan ?? 'free'] ?? PLANS.free;
}

/** Billing period key: the UTC calendar month, as 'YYYY-MM'. */
export function periodKey(at: number = Date.now()): string {
  return new Date(at).toISOString().slice(0, 7);
}

export interface PlayUsage {
  plan: string;
  plan_name: string;
  period: string;
  plays: number;
  /** null when the allowance is unlimited. */
  allowance: number | null;
  over: number;
  /** True once a hard-stop plan is past its allowance. */
  blocked: boolean;
  overage_usd: number;
}

export async function playUsage(
  env: Env,
  user: Pick<User, 'id' | 'plan' | 'role' | 'unlimited'>,
  period: string = periodKey(),
): Promise<PlayUsage> {
  const plan = planFor(user);
  const row = await env.DB.prepare('SELECT plays FROM play_usage WHERE user_id = ? AND period = ?')
    .bind(user.id, period)
    .first<{ plays: number }>();
  const plays = row?.plays ?? 0;
  const unlimited = !Number.isFinite(plan.plays);
  const over = unlimited ? 0 : Math.max(0, plays - plan.plays);
  return {
    plan: plan.id,
    plan_name: plan.name,
    period,
    plays,
    allowance: unlimited ? null : plan.plays,
    over,
    blocked: plan.hardStop && over > 0,
    overage_usd: Math.round((over / 10000) * OVERAGE_PER_10K_USD * 100) / 100,
  };
}

/**
 * Records a billable play. A viewer watching the same video repeatedly inside a
 * month counts once, so the meter cannot be inflated by reloads — and the number
 * shown in the dashboard is the number we bill from.
 */
export async function countPlay(
  env: Env,
  userId: string,
  videoId: string,
  viewId: string,
  at: number = Date.now(),
): Promise<boolean> {
  const period = periodKey(at);
  const ts = Math.floor(at / 1000);
  const claim = await env.DB.prepare(
    `INSERT INTO play_dedup (video_id, view_id, period, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(video_id, view_id, period) DO NOTHING`,
  )
    .bind(videoId, viewId, period, ts)
    .run();
  if (!claim.meta.changes) return false;
  await env.DB.prepare(
    `INSERT INTO play_usage (user_id, period, plays, updated_at) VALUES (?, ?, 1, ?)
     ON CONFLICT(user_id, period) DO UPDATE SET plays = plays + 1, updated_at = excluded.updated_at`,
  )
    .bind(userId, period, ts)
    .run();
  return true;
}

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

export function isAdmin(user: Pick<User, 'role'>): boolean {
  return user.role === 'admin';
}

/** Paid lifetime, a manual admin override, or an admin account: all unlimited. */
export function isLifetime(user: Partial<Pick<User, 'plan' | 'role' | 'unlimited'>>): boolean {
  return user.plan === 'lifetime' || Number(user.unlimited) === 1 || user.role === 'admin';
}

/** Anything that lifts the free-tier caps: a subscription, lifetime or an override. */
export function isPaid(user: Partial<Pick<User, 'plan' | 'role' | 'unlimited'>>): boolean {
  return isLifetime(user) || user.plan === 'starter' || user.plan === 'agency';
}

export type Cycle = 'monthly' | 'annual';

/** Dodo product ids, one per plan and billing cycle. */
export function productIdFor(env: Env, plan: string, cycle: Cycle): string {
  if (plan === 'lifetime') return env.DODO_LIFETIME_PRODUCT_ID ?? '';
  if (plan === 'starter') {
    return (cycle === 'annual' ? env.DODO_STARTER_ANNUAL_PRODUCT_ID : env.DODO_STARTER_PRODUCT_ID) ?? '';
  }
  if (plan === 'agency') {
    return (cycle === 'annual' ? env.DODO_AGENCY_ANNUAL_PRODUCT_ID : env.DODO_AGENCY_PRODUCT_ID) ?? '';
  }
  return '';
}

/**
 * Reverse of productIdFor: which plan a paid Dodo product grants. Used by the
 * webhook, so a Starter payment can never be mistaken for a lifetime purchase.
 */
export function planForProduct(env: Env, productId: string): string | null {
  if (!productId) return null;
  for (const plan of ['lifetime', 'starter', 'agency']) {
    for (const cycle of ['monthly', 'annual'] as Cycle[]) {
      if (productIdFor(env, plan, cycle) && productIdFor(env, plan, cycle) === productId) return plan;
    }
  }
  return null;
}

export function apiBase(env: Env): string {
  return env.DODO_ENVIRONMENT === 'test_mode' ? 'https://test.dodopayments.com' : 'https://live.dodopayments.com';
}

export interface CheckoutSession {
  checkout_url: string;
  session_id?: string;
}

/**
 * Creates a hosted Dodo checkout session for a plan and returns the url the
 * browser should be sent to. The plan and cycle travel in the metadata so the
 * webhook can grant the right entitlement even if products are renamed.
 */
export async function createCheckout(
  env: Env,
  user: User,
  returnUrl: string,
  plan = 'lifetime',
  cycle: Cycle = 'monthly',
): Promise<{ ok: true; url: string } | { ok: false; error: string; status: number }> {
  const productId = productIdFor(env, plan, cycle);
  if (!env.DODO_PAYMENTS_API_KEY || !productId) {
    return { ok: false, error: `checkout for ${plan} is not configured yet`, status: 503 };
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
        product_cart: [{ product_id: productId, quantity: 1 }],
        customer: { email: user.email, name: user.name || user.email },
        return_url: returnUrl,
        metadata: { user_id: user.id, plan, cycle },
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
