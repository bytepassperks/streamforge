/**
 * Password reset tokens.
 *
 * The token travels only in the emailed link. The row keeps its SHA-256 hash,
 * an expiry and a used stamp, so a token works once and a dump of the table
 * cannot be replayed.
 */
import type { Env } from './types';
import { now } from './util';

export const RESET_TTL_SECONDS = 60 * 60;

export function generateResetToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

export async function hashResetToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function resetUrl(publicBase: string, token: string): string {
  return `${publicBase.replace(/\/$/, '')}/reset.html?token=${token}`;
}

/** Consumes a token, returning the user it belonged to, or null if it is unusable. */
export async function claimReset(env: Env, token: string): Promise<string | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const stamp = now();
  // Marking it used and reading its owner in one statement means two clicks on
  // the same link cannot both come back with a user to reset.
  const row = await env.DB.prepare(
    `UPDATE password_resets SET used_at = ?
      WHERE token_hash = ? AND used_at = 0 AND expires_at >= ?
      RETURNING user_id`,
  )
    .bind(stamp, await hashResetToken(token), stamp)
    .first<{ user_id: string }>();
  return row?.user_id ?? null;
}
