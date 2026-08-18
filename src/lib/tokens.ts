/**
 * Short-lived HMAC tokens used to unlock password protected videos without
 * storing anything on the viewer's device.
 */

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return b64url(new Uint8Array(sig));
}

export async function signAccessToken(secret: string, videoId: string, ttlSeconds = 3600): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${videoId}.${exp}`;
  return `${payload}.${await hmac(secret, payload)}`;
}

export async function verifyAccessToken(secret: string, videoId: string, token: string): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [id, expRaw, sig] = parts;
  if (id !== videoId) return false;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = await hmac(secret, `${id}.${exp}`);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
