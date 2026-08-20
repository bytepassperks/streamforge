import { describe, expect, it } from 'vitest';
import { LIFETIME_TIERS, isAdmin, isLifetime, offerForSeats, verifyDodoSignature } from '../src/lib/billing';

describe('offerForSeats', () => {
  it('walks the launch ladder as real seats sell', () => {
    expect(offerForSeats(0)).toMatchObject({ usd: 69, seats_total: 100, seats_left: 100, next_usd: 99 });
    expect(offerForSeats(13)).toMatchObject({ usd: 69, seats_left: 87, seats_sold: 13 });
    expect(offerForSeats(100)).toMatchObject({ usd: 99, seats_total: 400, seats_left: 400, next_usd: 149 });
    expect(offerForSeats(250)).toMatchObject({ usd: 99, seats_left: 250 });
  });

  it('settles on the anchor price once every seat tier is gone', () => {
    const last = LIFETIME_TIERS[LIFETIME_TIERS.length - 1];
    expect(offerForSeats(500)).toMatchObject({ usd: last.usd, inr: last.inr, seats_total: 0, next_usd: null });
    expect(offerForSeats(9999)).toMatchObject({ usd: last.usd, seats_left: 0 });
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
