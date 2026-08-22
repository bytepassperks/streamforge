/**
 * API keys for integrations (the WordPress plugin, scripts, other CMSes).
 *
 * The key is shown once at creation and stored only as a SHA-256 hash, so a
 * dump of the table cannot be replayed against the API.
 */
import type { Env, User } from './types';
import { now } from './util';

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  created_at: number;
  last_used_at: number;
  revoked_at: number;
}

const PREFIX = 'vk_live_';

export function generateApiKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return PREFIX + hex;
}

export async function hashApiKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The part of the key that is safe to show again later. */
export function keyPrefix(key: string): string {
  return key.slice(0, PREFIX.length + 6);
}

/**
 * Resolves a bearer key to its (not suspended) owner and stamps its last use.
 * Returns null for an unknown, revoked or suspended key.
 */
export async function userForApiKey(env: Env, key: string): Promise<User | null> {
  if (!key.startsWith(PREFIX)) return null;
  const hash = await hashApiKey(key);
  const row = await env.DB.prepare(
    `SELECT k.id AS key_id, u.id, u.email, u.name, u.plan, u.role, u.unlimited, u.suspended,
            u.subscription_id, u.plan_renews_at, u.created_at
       FROM api_keys k JOIN users u ON u.id = k.user_id
      WHERE k.key_hash = ? AND k.revoked_at = 0`,
  )
    .bind(hash)
    .first<User & { key_id: string }>();
  if (!row) return null;
  if (Number(row.suspended) === 1) return null;
  await env.DB.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').bind(now(), row.key_id).run();
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    plan: row.plan,
    role: row.role,
    unlimited: row.unlimited,
    suspended: row.suspended,
    subscription_id: row.subscription_id,
    plan_renews_at: row.plan_renews_at,
    created_at: row.created_at,
  };
}
