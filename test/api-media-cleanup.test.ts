import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env, User } from '../src/lib/types';

vi.mock('../src/lib/media-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/media-store')>();
  return {
    ...actual,
    deleteMedia: vi.fn(),
    getMedia: vi.fn(),
    listMedia: vi.fn(),
    putMedia: vi.fn(),
  };
});

import * as mediaStore from '../src/lib/media-store';
import { api } from '../src/routes/api';

const owner: User = {
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

const retryMessage = 'upload could not be completed, please retry';

function envFor(video: Record<string, string | null> | null = null): Env {
  const prepare = (sql: string) => {
    const statement = {
      bind() {
        return statement;
      },
      async first<T>() {
        if (sql.includes('FROM sessions')) return { ...owner, expires_at: 1_800_000_000 } as T;
        if (sql.includes('source_ref, fallback_ref, thumbnail_url')) return video as T;
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
      async all<T>() {
        return { results: [] as T[] };
      },
    };
    return statement;
  };
  return {
    PUBLIC_BASE_URL: 'https://videokr.com',
    DB: { prepare },
    MEDIA: {},
  } as unknown as Env;
}

function sessionHeaders(): HeadersInit {
  return { cookie: 'sf_session=test-session' };
}

beforeEach(() => {
  vi.mocked(mediaStore.deleteMedia).mockReset();
  vi.mocked(mediaStore.getMedia).mockReset();
  vi.mocked(mediaStore.listMedia).mockReset();
  vi.mocked(mediaStore.putMedia).mockReset();
});

describe('customer-safe media upload failures', () => {
  it('returns 400 when a large single upload cannot be completed', async () => {
    vi.mocked(mediaStore.putMedia).mockRejectedValue(new Error(retryMessage));
    const form = new FormData();
    form.append('file', new File([new Uint8Array(25 * 1024 * 1024)], 'large.mp4', { type: 'video/mp4' }));
    const response = await api.request(
      new Request('https://videokr.com/uploads', { method: 'POST', headers: sessionHeaders(), body: form }),
      {},
      envFor(),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: retryMessage });
  });

  it('returns 400 when HLS completion cannot rewrite the master', async () => {
    vi.mocked(mediaStore.getMedia).mockImplementation(async (_env, key) => ({
      body: new Response(
        key.endsWith('/master.m3u8')
          ? '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nv0/index.m3u8\n'
          : '#EXTM3U\n#EXTINF:2,\nseg_000.ts\n',
      ).body,
      size: 50,
      contentType: 'application/vnd.apple.mpegurl',
      etag: '"master"',
      range: null,
    }));
    vi.mocked(mediaStore.listMedia).mockResolvedValue([
      { key: 'usr_1/vid_1/hls/v0/seg_000.ts', size: 100 },
    ]);
    vi.mocked(mediaStore.putMedia).mockRejectedValue(new Error(retryMessage));
    const response = await api.request(
      new Request('https://videokr.com/videos/vid_1/hls/complete', {
        method: 'POST',
        headers: sessionHeaders(),
      }),
      {},
      envFor(),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: retryMessage });
  });
});

describe('video media cleanup', () => {
  it('deletes referenced media and every HLS object after deleting a video', async () => {
    vi.mocked(mediaStore.listMedia).mockResolvedValue([
      { key: 'usr_1/vid_1/hls/master.m3u8', size: 10 },
      { key: 'usr_1/vid_1/hls/v0/seg.ts', size: 20 },
    ]);
    const video = {
      source_ref: '/media/usr_1/source.mp4',
      fallback_ref: 'usr_1/fallback.mp4',
      thumbnail_url: '/media/usr_1/poster.jpg',
      thumbnail_url_b: '',
    };
    const waits: Promise<unknown>[] = [];
    const response = await api.request(
      new Request('https://videokr.com/videos/vid_1', { method: 'DELETE', headers: sessionHeaders() }),
      {},
      envFor(video),
      { waitUntil: (promise: Promise<unknown>) => waits.push(promise), passThroughOnException: vi.fn() },
    );
    expect(response.status).toBe(200);
    await Promise.all(waits);
    expect(vi.mocked(mediaStore.deleteMedia).mock.calls.map(([, key]) => key).sort()).toEqual([
      'usr_1/fallback.mp4',
      'usr_1/poster.jpg',
      'usr_1/source.mp4',
      'usr_1/vid_1/hls/master.m3u8',
      'usr_1/vid_1/hls/v0/seg.ts',
    ]);
  });

  it('does not delete media for a link-only video', async () => {
    vi.mocked(mediaStore.listMedia).mockResolvedValue([]);
    const waits: Promise<unknown>[] = [];
    const response = await api.request(
      new Request('https://videokr.com/videos/vid_1', { method: 'DELETE', headers: sessionHeaders() }),
      {},
      envFor({
        source_ref: 'https://cdn.example/video.mp4',
        fallback_ref: '',
        thumbnail_url: '',
        thumbnail_url_b: '',
      }),
      { waitUntil: (promise: Promise<unknown>) => waits.push(promise), passThroughOnException: vi.fn() },
    );
    expect(response.status).toBe(200);
    await Promise.all(waits);
    expect(mediaStore.deleteMedia).not.toHaveBeenCalled();
  });

  it('does not delete another user’s object from a crafted source reference', async () => {
    vi.mocked(mediaStore.listMedia).mockResolvedValue([]);
    const waits: Promise<unknown>[] = [];
    const response = await api.request(
      new Request('https://videokr.com/videos/vid_1', { method: 'DELETE', headers: sessionHeaders() }),
      {},
      envFor({
        source_ref: '/media/usr_other/private.mp4',
        fallback_ref: '',
        thumbnail_url: '',
        thumbnail_url_b: '',
      }),
      { waitUntil: (promise: Promise<unknown>) => waits.push(promise), passThroughOnException: vi.fn() },
    );
    expect(response.status).toBe(200);
    await Promise.all(waits);
    expect(mediaStore.deleteMedia).not.toHaveBeenCalled();
  });

  it('keeps the delete response successful when media cleanup fails', async () => {
    vi.mocked(mediaStore.listMedia).mockRejectedValue(new Error('provider unavailable'));
    vi.mocked(mediaStore.deleteMedia).mockRejectedValue(new Error('provider unavailable'));
    const waits: Promise<unknown>[] = [];
    const response = await api.request(
      new Request('https://videokr.com/videos/vid_1', { method: 'DELETE', headers: sessionHeaders() }),
      {},
      envFor({
        source_ref: '/media/usr_1/source.mp4',
        fallback_ref: '',
        thumbnail_url: '',
        thumbnail_url_b: '',
      }),
      { waitUntil: (promise: Promise<unknown>) => waits.push(promise), passThroughOnException: vi.fn() },
    );
    expect(response.status).toBe(200);
    await Promise.all(waits);
  });
});
