import { describe, expect, it, vi } from 'vitest';
import type { Env, User } from '../src/lib/types';
import { api } from '../src/routes/api';

const key = `vk_live_${'a'.repeat(48)}`;
const user: User = {
  id: 'usr_1',
  email: 'owner@example.com',
  name: 'Owner',
  plan: 'free',
  role: 'user',
  unlimited: 0,
  suspended: 0,
  lead_emails: 1,
  subscription_id: '',
  plan_renews_at: 0,
  created_at: 1_700_000_000,
};

function hlsEnv(mediaOverrides: Record<string, unknown> = {}): Env {
  const statement = (sql: string) => {
    const chain = {
      bind: vi.fn(() => chain),
      async first<T>() {
        if (sql.includes('FROM api_keys')) {
          return { ...user, key_id: 'key_1' } as T;
        }
        if (sql === 'SELECT id FROM videos WHERE id = ? AND user_id = ?') {
          return { id: 'vid_1' } as T;
        }
        if (sql.includes('source_type, source_ref, fallback_ref')) {
          return {
            id: 'vid_1',
            source_type: 'mp4',
            source_ref: '/media/usr_1/source.mp4',
            fallback_ref: '',
          } as T;
        }
        return null;
      },
      async run() {
        return {};
      },
    };
    return chain;
  };
  const env = {
    PUBLIC_BASE_URL: 'https://videokr.com',
    DB: {
      prepare(sql: string) {
        if (sql.includes('FROM api_keys')) {
          return {
            bind(hash: string) {
              expect(hash).toMatch(/^[a-f0-9]{64}$/);
              return statement(sql);
            },
          };
        }
        return statement(sql);
      },
    },
    MEDIA: {
      async list() {
        return { objects: [] };
      },
      async get(key: string) {
        if (key.endsWith('/master.m3u8')) {
          return {
            async text() {
              return '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nv0/index.m3u8\n';
            },
          };
        }
        return {
          async text() {
            return '#EXTM3U\n#EXTINF:4,\nseg_000.ts\n';
          },
        };
      },
      async put() {},
      ...mediaOverrides,
    },
  } as unknown as Env;
  return env;
}

describe('HLS API-key authentication scope', () => {
  it('does not let an API key authenticate non-HLS API routes', async () => {
    const env = hlsEnv();
    const response = await api.request(
      new Request('https://videokr.com/api/billing', {
        headers: { authorization: `Bearer ${key}` },
      }),
      {},
      env,
    );
    expect(response.status).toBe(401);
  });

  it('accepts an API key for both HLS endpoints', async () => {
    const env = hlsEnv();
    const part = new FormData();
    part.append('path', 'v0/index.m3u8');
    part.append('file', new File(['#EXTM3U'], 'index.m3u8', { type: 'text/plain' }));
    const partResponse = await api.request(
      new Request('https://videokr.com/videos/vid_1/hls/parts', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}` },
        body: part,
      }),
      {},
      env,
    );
    expect(partResponse.status).toBe(200);

    const completeResponse = await api.request(
      new Request('https://videokr.com/videos/vid_1/hls/complete', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}` },
      }),
      {},
      env,
    );
    expect(completeResponse.status).toBe(200);
    expect(await completeResponse.json()).toMatchObject({ source_type: 'hls' });
  });

  it('repairs measured master bandwidth and is idempotent', async () => {
    let master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nv0/index.m3u8\n';
    let writes = 0;
    const env = hlsEnv({
      async get(path: string) {
        return {
          async text() {
            return path.endsWith('/master.m3u8')
              ? master
              : '#EXTM3U\n#EXTINF:4,\nseg_000.ts\n';
          },
        };
      },
      async list() {
        return { objects: [{ key: 'usr_1/vid_1/hls/v0/seg_000.ts', size: 50_000 }] };
      },
      async put(_path: string, body: string) {
        writes += 1;
        master = body;
      },
    });
    const request = () =>
      api.request(
        new Request('https://videokr.com/videos/vid_1/hls/complete', {
          method: 'POST',
          headers: { authorization: `Bearer ${key}` },
        }),
        {},
        env,
      );

    expect((await request()).status).toBe(200);
    expect(master).toContain('BANDWIDTH=100000,AVERAGE-BANDWIDTH=100000');
    expect((await request()).status).toBe(200);
    expect(writes).toBe(1);
  });
});
