/**
 * "Sign in with Google" — the standard OAuth 2.0 code flow, implemented
 * against Google's token endpoints so the app keeps one session system. The
 * routes are session-free like every other /api path; sign-in is simply
 * unavailable when GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are unset.
 */
import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Env } from '../lib/types';
import { newId, now } from '../lib/util';
import { createSession } from '../lib/auth';

export const oauth = new Hono<{ Bindings: Env }>();

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const STATE_COOKIE = 'sf_gstate';
const STATE_TTL_SECONDS = 600;

interface GoogleClaims {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  aud?: string | string[];
  iss?: string;
  exp?: number;
}

function b64urlDecode(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return [...bytes].map((b) => String.fromCharCode(b.charCodeAt(0))).join('');
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function oauthConfigured(c: { env: Env }): boolean {
  return Boolean(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET);
}

function redirectUri(c: { req: { url: string } }): string {
  return new URL('/api/auth/google/callback', c.req.url).toString();
}

function safeNextPath(next: string | undefined): string {
  /* Only a same-origin path may be honoured; anything absolute, protocol
     relative or odd falls back to the dashboard. */
  if (next && next.startsWith('/') && !next.startsWith('//') && !/[\\\r\n]/.test(next)) return next;
  return '/app.html';
}

function errorPage(title: string, detail: string): Response {
  const body = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Videokr</title><meta name="robots" content="noindex">
<link rel="stylesheet" href="/styles.css"></head>
<body class="sf-page"><main class="sf-page-main sf-page-missing">
<h1>${title}</h1><p class="sf-page-desc">${detail}</p>
<p><a class="btn" href="/login">Back to sign in</a></p>
</main></body></html>`;
  return new Response(body, {
    status: 400,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store' },
  });
}

oauth.get('/auth/google/start', (c) => {
  if (!oauthConfigured(c)) {
    return c.json({ error: 'Google sign-in is not configured' }, 503);
  }
  const nonce = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const exp = now() + STATE_TTL_SECONDS;
  return (async () => {
    const state = `${nonce}.${exp}.${await hmacHex(c.env.GOOGLE_CLIENT_SECRET!, `${nonce}.${exp}`)}`;
    setCookie(c, STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/api/auth/google',
      maxAge: STATE_TTL_SECONDS,
      secure: new URL(c.req.url).protocol === 'https:',
    });
    const params = new URLSearchParams({
      client_id: c.env.GOOGLE_CLIENT_ID!,
      redirect_uri: redirectUri(c),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    const next = c.req.query('next');
    if (next && next !== safeNextPath(next)) {
      /* A non-same-origin next value is dropped rather than followed. */
    }
    return c.redirect(`${AUTH_ENDPOINT}?${params.toString()}`, 302);
  })();
});

oauth.get('/auth/google/callback', async (c) => {
  const oauthError = c.req.query('error');
  if (oauthError) {
    return errorPage('Sign-in declined', 'Google returned: ' + oauthError);
  }
  const code = c.req.query('code') ?? '';
  const state = c.req.query('state') ?? '';
  const cookieState = getCookie(c, STATE_COOKIE) ?? '';
  deleteCookie(c, STATE_COOKIE, { path: '/api/auth/google' });

  const [nonce, expRaw, sig] = state.split('.');
  const expectedSig = nonce && expRaw ? await hmacHex(c.env.GOOGLE_CLIENT_SECRET ?? '', `${nonce}.${expRaw}`) : '';
  const stateValid =
    oauthConfigured(c) &&
    state.length > 0 &&
    cookieState.length > 0 &&
    state === cookieState &&
    sig === expectedSig &&
    Number(expRaw) > now();
  if (!stateValid || !code) {
    return errorPage('Sign-in failed', 'The sign-in request expired or was tampered with. Please try again.');
  }

  const tokenResponse = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID!,
      client_secret: c.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(c),
      grant_type: 'authorization_code',
    }).toString(),
  });
  if (!tokenResponse.ok) {
    return errorPage('Sign-in failed', 'Google did not issue a token. Please try again.');
  }
  const tokens = (await tokenResponse.json()) as { id_token?: string };
  if (!tokens.id_token) {
    return errorPage('Sign-in failed', 'Google did not issue an identity token. Please try again.');
  }

  const payloadPart = tokens.id_token.split('.')[1];
  let claims: GoogleClaims = {};
  try {
    claims = JSON.parse(b64urlDecode(payloadPart)) as GoogleClaims;
  } catch {
    return errorPage('Sign-in failed', 'The identity token could not be read. Please try again.');
  }
  const issOk = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
  const audOk = Array.isArray(claims.aud) ? claims.aud.includes(c.env.GOOGLE_CLIENT_ID!) : claims.aud === c.env.GOOGLE_CLIENT_ID;
  const email = (claims.email ?? '').trim().toLowerCase();
  if (!issOk || !audOk || !(Number(claims.exp) > now()) || !claims.sub || !email || claims.email_verified !== true) {
    return errorPage('Sign-in failed', 'Google did not confirm a verified email for this account.');
  }

  const claimedByGoogle = await c.env.DB.prepare('SELECT id FROM users WHERE google_sub = ?')
    .bind(claims.sub)
    .first<{ id: string }>();
  let userId = claimedByGoogle?.id ?? '';

  if (!userId) {
    const existing = await c.env.DB.prepare('SELECT id, suspended FROM users WHERE email = ?')
      .bind(email)
      .first<{ id: string; suspended: number }>();
    if (existing) {
      /* Same verified email: the Google account links to the password account
         so both sign-ins land in one workspace. */
      if (Number(existing.suspended) === 1) return errorPage('Account suspended', 'This account cannot sign in.');
      await c.env.DB.prepare('UPDATE users SET google_sub = ? WHERE id = ?').bind(claims.sub, existing.id).run();
      userId = existing.id;
    } else {
      userId = newId('usr');
      /* The password fields are set explicitly: the live schema predates their
         DEFAULT '' and an omitted NOT NULL column rejects the row. Empty hash
         and salt mean the account has no usable password until one is set. */
      await c.env.DB.prepare(
        'INSERT INTO users (id, email, name, password_hash, password_salt, google_sub, plan, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
        .bind(userId, email, (claims.name ?? '').trim().slice(0, 120), '', '', claims.sub, 'free', now())
        .run();
    }
  }

  await createSession(c, userId);
  return c.redirect(safeNextPath(c.req.query('next')), 302);
});
