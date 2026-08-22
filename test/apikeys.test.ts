import { describe, expect, it } from 'vitest';
import { generateApiKey, hashApiKey, keyPrefix } from '../src/lib/apikeys';

describe('api keys', () => {
  it('mints prefixed, unique keys', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a).toMatch(/^vk_live_[0-9a-f]{48}$/);
    expect(a).not.toBe(b);
  });

  it('hashes deterministically and differently per key', async () => {
    const key = generateApiKey();
    expect(await hashApiKey(key)).toBe(await hashApiKey(key));
    expect(await hashApiKey(key)).not.toBe(await hashApiKey(generateApiKey()));
    expect(await hashApiKey(key)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('keeps only enough of the key to recognise it in a list', () => {
    const key = generateApiKey();
    const prefix = keyPrefix(key);
    expect(key.startsWith(prefix)).toBe(true);
    expect(prefix).toHaveLength('vk_live_'.length + 6);
  });
});
