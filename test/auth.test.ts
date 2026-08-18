import { describe, expect, it } from 'vitest';
import { hashPassword, randomSalt, verifyPassword } from '../src/lib/auth';
import { signAccessToken, verifyAccessToken } from '../src/lib/tokens';

describe('password hashing', () => {
  it('verifies a correct password and rejects a wrong one', async () => {
    const salt = randomSalt();
    const hash = await hashPassword('correct horse battery', salt);
    expect(await verifyPassword('correct horse battery', salt, hash)).toBe(true);
    expect(await verifyPassword('wrong password', salt, hash)).toBe(false);
  });

  it('salts so identical passwords hash differently', async () => {
    const a = await hashPassword('same', randomSalt());
    const b = await hashPassword('same', randomSalt());
    expect(a).not.toBe(b);
  });

  it('rejects verification against an empty stored hash', async () => {
    expect(await verifyPassword('anything', '', '')).toBe(false);
  });
});

describe('access tokens', () => {
  it('round-trips a token for the signed video', async () => {
    const token = await signAccessToken('secret-material', 'vid_abc');
    expect(await verifyAccessToken('secret-material', 'vid_abc', token)).toBe(true);
  });

  it('rejects another video, another secret and garbage', async () => {
    const token = await signAccessToken('secret-material', 'vid_abc');
    expect(await verifyAccessToken('secret-material', 'vid_other', token)).toBe(false);
    expect(await verifyAccessToken('other-secret', 'vid_abc', token)).toBe(false);
    expect(await verifyAccessToken('secret-material', 'vid_abc', 'nonsense')).toBe(false);
  });

  it('rejects an expired token', async () => {
    const token = await signAccessToken('secret-material', 'vid_abc', -10);
    expect(await verifyAccessToken('secret-material', 'vid_abc', token)).toBe(false);
  });
});
