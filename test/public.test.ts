import { describe, expect, it } from 'vitest';
import type { Env, Video } from '../src/lib/types';
import { embedBlocked, pub } from '../src/routes/public';

function request(
  headers: Record<string, string> = {},
  url = 'https://videokr.com/api/embed/vid_1',
): Parameters<typeof embedBlocked>[0] {
  return {
    env: { PUBLIC_BASE_URL: 'https://videokr.com' } as Env,
    req: {
      url,
      header: (name: string) => headers[name.toLowerCase()],
    },
  };
}

function video(allowed_domains: string): Pick<Video, 'allowed_domains'> {
  return { allowed_domains };
}

describe('embedBlocked', () => {
  it('allows the canonical site host', () => {
    expect(embedBlocked(request({ referer: 'https://videokr.com/v/the-film' }), video('partner.example'))).toBe(false);
  });

  it('allows the www variant and incoming request host', () => {
    expect(embedBlocked(request({ referer: 'https://www.videokr.com/v/the-film' }), video('partner.example'))).toBe(false);
    expect(
      embedBlocked(request({ referer: 'https://localhost:8787/page' }, 'http://localhost:8787/api/embed/vid_1'), video('partner.example')),
    ).toBe(false);
  });

  it('blocks an off-list third-party host with the domain_blocked response', async () => {
    const blockedVideo = {
      id: 'vid_1',
      allowed_domains: 'partner.example',
    };
    const env = {
      PUBLIC_BASE_URL: 'https://videokr.com',
      DB: {
        prepare: () => ({
          bind: () => ({
            first: async <T>() => blockedVideo as T,
          }),
        }),
      },
    } as unknown as Env;
    const response = await pub.request(
      new Request('https://videokr.com/api/embed/vid_1', {
        headers: { referer: 'https://other.example/page' },
      }),
      {},
      env,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'this video is not allowed to play on this domain',
      code: 'domain_blocked',
    });
  });

  it('allows empty allowlists and missing referers', () => {
    expect(embedBlocked(request({ referer: 'https://other.example/page' }), video(''))).toBe(false);
    expect(embedBlocked(request(), video('partner.example'))).toBe(false);
  });
});
