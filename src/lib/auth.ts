import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Env, User } from './types';
import { newId, now } from './util';

const SESSION_COOKIE = 'sf_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const PBKDF2_ITERATIONS = 100_000;

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes.buffer);
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: new TextEncoder().encode(salt),
      iterations: PBKDF2_ITERATIONS,
    },
    key,
    256,
  );
  return toHex(bits);
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(password: string, salt: string, expected: string): Promise<boolean> {
  const actual = await hashPassword(password, salt);
  return constantTimeEqual(actual, expected);
}

type AuthEnv = { Bindings: Env };

export async function createSession<E extends AuthEnv>(c: Context<E>, userId: string): Promise<string> {
  const id = newId('ses');
  const created = now();
  await c.env.DB.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(id, userId, created, created + SESSION_TTL_SECONDS)
    .run();
  setCookie(c, SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
    secure: new URL(c.req.url).protocol === 'https:',
  });
  return id;
}

export async function destroySession<E extends AuthEnv>(c: Context<E>): Promise<void> {
  const id = getCookie(c, SESSION_COOKIE);
  if (id) await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

export async function currentUser<E extends AuthEnv>(c: Context<E>): Promise<User | null> {
  const id = getCookie(c, SESSION_COOKIE);
  if (!id) return null;
  const row = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.plan, u.role, u.unlimited, u.suspended, u.subscription_id,
            u.plan_renews_at, u.created_at, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ?`,
  )
    .bind(id)
    .first<User & { expires_at: number }>();
  if (!row) return null;
  if (row.expires_at < now()) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
    return null;
  }
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
