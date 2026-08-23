import { describe, expect, it } from 'vitest';
import { htmlFromText } from '../src/lib/email';
import { generateResetToken, hashResetToken, resetUrl } from '../src/lib/resets';

describe('reset tokens', () => {
  it('mints long random hex tokens', () => {
    const a = generateResetToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(generateResetToken());
  });

  it('hashes deterministically so only the hash needs storing', async () => {
    const token = generateResetToken();
    expect(await hashResetToken(token)).toBe(await hashResetToken(token));
    expect(await hashResetToken(token)).not.toBe(await hashResetToken(generateResetToken()));
    expect(await hashResetToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('builds a link on the canonical host whatever the base looks like', () => {
    expect(resetUrl('https://videokr.com/', 'abc')).toBe('https://videokr.com/reset.html?token=abc');
    expect(resetUrl('https://videokr.com', 'abc')).toBe('https://videokr.com/reset.html?token=abc');
  });
});

describe('email bodies', () => {
  it('keeps blank lines as paragraphs and escapes anything a lead typed', () => {
    const html = htmlFromText('Hello\n\n<script>alert(1)</script>');
    expect(html).toContain('Hello');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
