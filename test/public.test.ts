import { describe, expect, it } from 'vitest';
import type { Env, User, Video } from '../src/lib/types';
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

function embedVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: 'vid_1',
    user_id: 'usr_1',
    project_id: null,
    slug: 'the-film',
    title: 'The film',
    description: 'A film.',
    source_type: 'mp4',
    source_ref: '/media/usr_1/a.mp4',
    duration: 130,
    thumbnail_url: '/media/usr_1/a.jpg',
    thumbnail_url_b: '',
    captions_url: '',
    transcript: '',
    player_config: '{}',
    visibility: 'public',
    password_hash: '',
    password_salt: '',
    allowed_domains: '',
    created_at: 1_700_000_000,
    updated_at: 1_700_000_500,
    ...overrides,
  };
}

function embedEnv(owner: Partial<Pick<User, 'plan' | 'role' | 'unlimited'>>): Env {
  const storedVideo = embedVideo();
  const storedOwner = { id: 'usr_1', plan: 'free', role: 'user', unlimited: 0, ...owner };
  const prepare = (sql: string) => {
    const statement = {
      bind() {
        return statement;
      },
      async first<T>() {
        if (sql.includes('FROM videos')) return storedVideo as T;
        if (sql.includes('FROM users')) return storedOwner as T;
        if (sql.includes('FROM play_usage')) return { plays: 0 } as T;
        return null;
      },
      async all<T>() {
        return { results: [] as T[] };
      },
    };
    return statement;
  };
  return {
    PUBLIC_BASE_URL: 'https://videokr.com',
    DB: { prepare },
  } as unknown as Env;
}

async function embedPayload(owner: Partial<Pick<User, 'plan' | 'role' | 'unlimited'>>) {
  const response = await pub.request(
    new Request('https://videokr.com/api/embed/vid_1'),
    {},
    embedEnv(owner),
  );
  expect(response.status).toBe(200);
  return (await response.json()) as { badge: boolean };
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

describe('embed payload badge', () => {
  it('hides the player badge for paid and unlimited owners', async () => {
    expect((await embedPayload({ plan: 'starter' })).badge).toBe(false);
    expect((await embedPayload({ plan: 'agency' })).badge).toBe(false);
    expect((await embedPayload({ plan: 'lifetime' })).badge).toBe(false);
    expect((await embedPayload({ plan: 'free', unlimited: 1 })).badge).toBe(false);
    expect((await embedPayload({ plan: 'free', role: 'admin' })).badge).toBe(false);
  });

  it('keeps the player badge for Free owners', async () => {
    expect((await embedPayload({ plan: 'free' })).badge).toBe(true);
  });
});
