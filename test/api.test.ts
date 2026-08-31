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
        if (sql.includes('FROM sessions')) {
          return { ...user, expires_at: 1_800_000_000 } as T;
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

function editableSlugEnv(conflictingSlug = ''): { env: Env; video: Record<string, unknown> } {
  const video: Record<string, unknown> = {
    id: 'vid_1',
    user_id: user.id,
    slug: 'old-slug',
    title: 'Demo video',
    visibility: 'unlisted',
  };
  const prepare = (sql: string) => {
    let values: unknown[] = [];
    const statement = {
      bind(...args: unknown[]) {
        values = args;
        return statement;
      },
      async first<T>() {
        if (sql.includes('FROM sessions')) return { ...user, expires_at: 1_800_000_000 } as T;
        if (sql.includes('SELECT id FROM videos WHERE slug = ? AND id != ?')) {
          return conflictingSlug && values[0] === conflictingSlug ? ({ id: 'vid_2' } as T) : null;
        }
        if (sql.includes('SELECT * FROM videos WHERE id = ? AND user_id = ?')) return video as T;
        return null;
      },
      async run() {
        if (sql.includes('UPDATE videos SET') && sql.includes('slug = ?')) video.slug = values[0];
        return {};
      },
    };
    return statement;
  };
  return {
    video,
    env: {
      PUBLIC_BASE_URL: 'https://videokr.com',
      DB: { prepare },
    } as unknown as Env,
  };
}

function editableSlugRequest(slug: string): Request {
  return new Request('https://videokr.com/videos/vid_1', {
    method: 'PATCH',
    headers: { cookie: 'sf_session=session-1', 'content-type': 'application/json' },
    body: JSON.stringify({ slug }),
  });
}

function ctaEnv(): { env: Env; inserts: unknown[][] } {
  const inserts: unknown[][] = [];
  const statement = (sql: string) => {
    let values: unknown[] = [];
    const chain = {
      bind(...args: unknown[]) {
        values = args;
        return chain;
      },
      async first<T>() {
        if (sql.includes('FROM sessions')) return { ...user, expires_at: 1_800_000_000 } as T;
        if (sql === 'SELECT id FROM videos WHERE id = ? AND user_id = ?') return { id: 'vid_1' } as T;
        return null;
      },
      async run() {
        return {};
      },
      values() {
        return values;
      },
    };
    return chain;
  };
  const env = {
    PUBLIC_BASE_URL: 'https://videokr.com',
    DB: {
      prepare(sql: string) {
        return statement(sql);
      },
      async batch(statements: Array<{ values?: () => unknown[] }>) {
        statements.forEach((item) => {
          if (item.values) inserts.push(item.values());
        });
      },
    },
  } as unknown as Env;
  return { env, inserts };
}

function ctaRequest(ctas: Record<string, unknown>[]): Request {
  return new Request('https://videokr.com/videos/vid_1/ctas', {
    method: 'PUT',
    headers: { cookie: 'sf_session=session-1', 'content-type': 'application/json' },
    body: JSON.stringify({ ctas }),
  });
}

describe('editable video slugs', () => {
  it('normalizes and renames a video slug', async () => {
    const { env, video } = editableSlugEnv();
    const response = await api.request(editableSlugRequest(' New Client URL! '), {}, env);
    expect(response.status).toBe(200);
    expect(video.slug).toBe('new-client-url');
  });

  it('allows re-saving the current slug', async () => {
    const { env, video } = editableSlugEnv();
    const response = await api.request(editableSlugRequest(String(video.slug)), {}, env);
    expect(response.status).toBe(200);
    expect(video.slug).toBe('old-slug');
  });

  it('rejects a slug already used by another video', async () => {
    const { env } = editableSlugEnv('taken-slug');
    const response = await api.request(editableSlugRequest('Taken slug'), {}, env);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'that URL is already taken' });
  });

  it('rejects a slug that normalizes to empty', async () => {
    const { env } = editableSlugEnv();
    const response = await api.request(editableSlugRequest('!!!'), {}, env);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'slug must contain letters or numbers' });
  });
});

describe('CTA persistence', () => {
  it('normalizes scheme-less urls and unknown styles', async () => {
    const { env, inserts } = ctaEnv();
    const response = await api.request(
      ctaRequest([
        {
          kind: 'overlay',
          button_text: 'Book a demo',
          button_url: 'example.com',
          style: 'not-a-style',
        },
      ]),
      {},
      env,
    );
    expect(response.status).toBe(200);
    expect(inserts[1]).toEqual([
      expect.stringMatching(/^cta_[a-z0-9]+$/i),
      'vid_1',
      'overlay',
      0,
      0,
      '',
      '',
      'Book a demo',
      'https://example.com',
      'email',
      1,
      'bottom-right',
      'card',
    ]);
  });

  it('preserves valid ids and regenerates invalid or duplicate ids', async () => {
    const { env, inserts } = ctaEnv();
    const response = await api.request(
      ctaRequest([
        { id: 'cta_keep123', kind: 'overlay' },
        { id: 'not-an-id', kind: 'banner' },
        { id: 'cta_keep123', kind: 'endscreen' },
      ]),
      {},
      env,
    );
    expect(response.status).toBe(200);
    expect(inserts[1][0]).toBe('cta_keep123');
    expect(inserts[2][0]).toMatch(/^cta_[a-z0-9]+$/i);
    expect(inserts[2][0]).not.toBe('not-an-id');
    expect(inserts[3][0]).toMatch(/^cta_[a-z0-9]+$/i);
    expect(inserts[3][0]).not.toBe('cta_keep123');
    expect(inserts[3][0]).not.toBe(inserts[2][0]);
  });
});

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
    const list = vi.fn(async () => ({
      objects: [{ key: 'usr_1/vid_1/hls/v0/seg_000.ts', size: 50_000 }],
    }));
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
      list,
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
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('uploads parts without listing and allows re-uploading a part', async () => {
    const list = vi.fn();
    let puts = 0;
    const env = hlsEnv({
      list,
      async put() {
        puts += 1;
      },
    });
    for (const value of ['first', 'second']) {
      const part = new FormData();
      part.append('path', 'v0/seg_001.ts');
      part.append('file', new File([value], 'seg_001.ts', { type: 'video/mp2t' }));
      const response = await api.request(
        new Request('https://videokr.com/videos/vid_1/hls/parts', {
          method: 'POST',
          headers: { authorization: `Bearer ${key}` },
          body: part,
        }),
        {},
        env,
      );
      expect(response.status).toBe(200);
    }
    expect(puts).toBe(2);
    expect(list).not.toHaveBeenCalled();
  });

  it('rejects a completed ladder over the part limit', async () => {
    const env = hlsEnv({
      async list() {
        return {
          objects: Array.from({ length: 3001 }, (_, index) => ({
            key: `usr_1/vid_1/hls/v0/part_${index}.ts`,
            size: 1,
          })),
        };
      },
    });
    const response = await api.request(
      new Request('https://videokr.com/videos/vid_1/hls/complete', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}` },
      }),
      {},
      env,
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'an HLS ladder cannot contain more than 3000 parts' });
  });

  it('follows truncated listings when repairing segment measurements', async () => {
    let master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nv0/index.m3u8\n';
    const firstPage = [
      { key: 'usr_1/vid_1/hls/v0/seg_000.ts', size: 100 },
      ...Array.from({ length: 999 }, (_, index) => ({
        key: `usr_1/vid_1/hls/v0/other_${index}.ts`,
        size: 1,
      })),
    ];
    const env = hlsEnv({
      async get(path: string) {
        return {
          async text() {
            return path.endsWith('/master.m3u8')
              ? master
              : '#EXTM3U\n#EXTINF:2,\nseg_000.ts\n#EXTINF:2,\nseg_001.ts\n';
          },
        };
      },
      async list(options: Record<string, unknown>) {
        return options.cursor
          ? { objects: [{ key: 'usr_1/vid_1/hls/v0/seg_001.ts', size: 100 }] }
          : { objects: firstPage, truncated: true, cursor: 'page-2' };
      },
      async put(_path: string, body: string) {
        master = body;
      },
    });

    const response = await api.request(
      new Request('https://videokr.com/videos/vid_1/hls/complete', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}` },
      }),
      {},
      env,
    );

    expect(response.status).toBe(200);
    expect(master).toContain('BANDWIDTH=400,AVERAGE-BANDWIDTH=400');
  });
});

describe('chunked video uploads', () => {
  function multipartEnv() {
    type UploadRecord = {
      key: string;
      uploadId: string;
      parts: Map<number, ArrayBuffer>;
      completed?: ArrayBuffer;
      forcedSize?: number;
      aborted: boolean;
      deleted: boolean;
    };
    const uploads = new Map<string, UploadRecord>();
    const media = {
      async createMultipartUpload(key: string) {
        const uploadId = `upload-${uploads.size + 1}`;
        const record: UploadRecord = {
          key,
          uploadId,
          parts: new Map<number, ArrayBuffer>(),
          aborted: false,
          deleted: false,
        };
        uploads.set(uploadId, record);
        return {
          key,
          uploadId,
          async uploadPart(partNumber: number, value: ReadableStream) {
            const data = await new Response(value).arrayBuffer();
            record.parts.set(partNumber, data);
            return { partNumber, etag: `etag-${partNumber}` };
          },
          async complete(parts: Array<{ partNumber: number; etag: string }>) {
            const buffers = parts.map((part) => record.parts.get(part.partNumber) as ArrayBuffer);
            const total = buffers.reduce((size, buffer) => size + buffer.byteLength, 0);
            const combined = new Uint8Array(total);
            let offset = 0;
            for (const buffer of buffers) {
              combined.set(new Uint8Array(buffer), offset);
              offset += buffer.byteLength;
            }
            record.completed = combined.buffer;
          },
          async abort() {
            record.aborted = true;
            record.parts.clear();
          },
        };
      },
      resumeMultipartUpload(key: string, uploadId: string) {
        const record = uploads.get(uploadId);
        if (!record || record.key !== key) throw new Error('missing upload');
        return {
          key,
          uploadId,
          async uploadPart(partNumber: number, value: ReadableStream) {
            const data = await new Response(value).arrayBuffer();
            record.parts.set(partNumber, data);
            return { partNumber, etag: `etag-${partNumber}` };
          },
          async complete(parts: Array<{ partNumber: number; etag: string }>) {
            const buffers = parts.map((part) => record.parts.get(part.partNumber) as ArrayBuffer);
            const total = buffers.reduce((size, buffer) => size + buffer.byteLength, 0);
            const combined = new Uint8Array(total);
            let offset = 0;
            for (const buffer of buffers) {
              combined.set(new Uint8Array(buffer), offset);
              offset += buffer.byteLength;
            }
            record.completed = combined.buffer;
          },
          async abort() {
            record.aborted = true;
            record.parts.clear();
          },
        };
      },
      async get(key: string) {
        const record = [...uploads.values()].find((upload) => upload.key === key);
        return record?.completed ? { async arrayBuffer() { return record.completed as ArrayBuffer; } } : null;
      },
      async head(key: string) {
        const record = [...uploads.values()].find((upload) => upload.key === key);
        if (!record?.completed || record.deleted) return null;
        return { size: record.forcedSize ?? record.completed.byteLength };
      },
      async delete(key: string) {
        const record = [...uploads.values()].find((upload) => upload.key === key);
        if (record) {
          record.deleted = true;
          record.completed = undefined;
        }
      },
    };
    return { env: hlsEnv(media), uploads };
  }

  const sessionHeaders = { cookie: 'sf_session=test-session' };

  it('completes two parts into a working media object', async () => {
    const { env, uploads } = multipartEnv();
    const create = await api.request(
      new Request('https://videokr.com/uploads/create', {
        method: 'POST',
        headers: sessionHeaders,
        body: JSON.stringify({ filename: 'movie.mp4', size: 6 }),
      }),
      {},
      env,
    );
    expect(create.status).toBe(201);
    const created = await create.json<{ key: string; uploadId: string }>();

    for (const [number, value] of [[1, 'abc'], [2, 'def']] as const) {
      const form = new FormData();
      form.append('key', created.key);
      form.append('uploadId', created.uploadId);
      form.append('partNumber', String(number));
      form.append('file', new File([value], `part-${number}`));
      const response = await api.request(
        new Request('https://videokr.com/uploads/part', { method: 'POST', headers: sessionHeaders, body: form }),
        {},
        env,
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ etag: `etag-${number}` });
    }

    const complete = await api.request(
      new Request('https://videokr.com/uploads/complete', {
        method: 'POST',
        headers: { ...sessionHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({
          key: created.key,
          uploadId: created.uploadId,
          parts: [
            { partNumber: 1, etag: 'etag-1' },
            { partNumber: 2, etag: 'etag-2' },
          ],
        }),
      }),
      {},
      env,
    );
    expect(complete.status).toBe(201);
    const result = await complete.json<{ key: string; url: string }>();
    expect(result).toEqual({ key: created.key, url: `/media/${created.key}` });
    const object = await env.MEDIA.get(created.key);
    expect(object && new TextDecoder().decode(await object.arrayBuffer())).toBe('abcdef');
    expect(uploads.get(created.uploadId)?.aborted).toBe(false);
  });

  it('rejects a part addressed to another user', async () => {
    const { env } = multipartEnv();
    const form = new FormData();
    form.append('key', 'usr_other/random.mp4');
    form.append('uploadId', 'upload-1');
    form.append('partNumber', '1');
    form.append('file', new File(['part'], 'part'));
    const response = await api.request(
      new Request('https://videokr.com/uploads/part', { method: 'POST', headers: sessionHeaders, body: form }),
      {},
      env,
    );
    expect(response.status).toBe(403);
  });

  it('rejects a part over the size cap', async () => {
    const { env } = multipartEnv();
    const create = await api.request(
      new Request('https://videokr.com/uploads/create', {
        method: 'POST',
        headers: { ...sessionHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ filename: 'movie.mp4', size: 11 * 1024 * 1024 }),
      }),
      {},
      env,
    );
    const created = await create.json<{ key: string; uploadId: string }>();
    const form = new FormData();
    form.append('key', created.key);
    form.append('uploadId', created.uploadId);
    form.append('partNumber', '1');
    form.append('file', new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'part'));
    const response = await api.request(
      new Request('https://videokr.com/uploads/part', { method: 'POST', headers: sessionHeaders, body: form }),
      {},
      env,
    );
    expect(response.status).toBe(413);
  });

  it('rejects a declared video size over the upload cap', async () => {
    const { env } = multipartEnv();
    const response = await api.request(
      new Request('https://videokr.com/uploads/create', {
        method: 'POST',
        headers: { ...sessionHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ filename: 'movie.webm', size: 200 * 1024 * 1024 + 1 }),
      }),
      {},
      env,
    );
    expect(response.status).toBe(413);
  });

  it('aborts an upload and cleans up its parts', async () => {
    const { env, uploads } = multipartEnv();
    const create = await api.request(
      new Request('https://videokr.com/uploads/create', {
        method: 'POST',
        headers: { ...sessionHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ filename: 'movie.mp4', size: 3 }),
      }),
      {},
      env,
    );
    const created = await create.json<{ key: string; uploadId: string }>();
    const abort = await api.request(
      new Request('https://videokr.com/uploads/abort', {
        method: 'POST',
        headers: { ...sessionHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ key: created.key, uploadId: created.uploadId }),
      }),
      {},
      env,
    );
    expect(abort.status).toBe(200);
    expect(uploads.get(created.uploadId)).toMatchObject({ aborted: true, parts: new Map() });
  });

  it('returns 400 for missing upload sessions and keeps abort idempotent', async () => {
    const { env, uploads } = multipartEnv();
    const part = new FormData();
    part.append('key', 'usr_1/random.mp4');
    part.append('uploadId', 'missing');
    part.append('partNumber', '1');
    part.append('file', new File(['part'], 'part'));
    const partResponse = await api.request(
      new Request('https://videokr.com/uploads/part', { method: 'POST', headers: sessionHeaders, body: part }),
      {},
      env,
    );
    expect(partResponse.status).toBe(400);
    expect(await partResponse.json()).toEqual({ error: 'upload session not found or expired' });

    const completeResponse = await api.request(
      new Request('https://videokr.com/uploads/complete', {
        method: 'POST',
        headers: { ...sessionHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({
          key: 'usr_1/random.mp4',
          uploadId: 'missing',
          parts: [{ partNumber: 1, etag: 'etag-1' }],
        }),
      }),
      {},
      env,
    );
    expect(completeResponse.status).toBe(400);
    expect(await completeResponse.json()).toEqual({ error: 'upload session not found or expired' });

    const abortResponse = await api.request(
      new Request('https://videokr.com/uploads/abort', {
        method: 'POST',
        headers: { ...sessionHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ key: 'usr_1/random.mp4', uploadId: 'missing' }),
      }),
      {},
      env,
    );
    expect(abortResponse.status).toBe(400);
    expect(await abortResponse.json()).toEqual({ error: 'upload session not found or expired' });

    const create = await api.request(
      new Request('https://videokr.com/uploads/create', {
        method: 'POST',
        headers: { ...sessionHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ filename: 'movie.mp4', size: 3 }),
      }),
      {},
      env,
    );
    const created = await create.json<{ key: string; uploadId: string }>();
    const firstAbort = await api.request(
      new Request('https://videokr.com/uploads/abort', {
        method: 'POST',
        headers: { ...sessionHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ key: created.key, uploadId: created.uploadId }),
      }),
      {},
      env,
    );
    const secondAbort = await api.request(
      new Request('https://videokr.com/uploads/abort', {
        method: 'POST',
        headers: { ...sessionHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ key: created.key, uploadId: created.uploadId }),
      }),
      {},
      env,
    );
    expect(firstAbort.status).toBe(200);
    expect(secondAbort.status).toBe(200);
    expect(uploads.get(created.uploadId)?.aborted).toBe(true);
  });

  it('rejects an over-cap completed object and deletes it', async () => {
    const { env, uploads } = multipartEnv();
    const create = await api.request(
      new Request('https://videokr.com/uploads/create', {
        method: 'POST',
        headers: { ...sessionHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ filename: 'movie.mp4', size: 3 }),
      }),
      {},
      env,
    );
    const created = await create.json<{ key: string; uploadId: string }>();
    const part = new FormData();
    part.append('key', created.key);
    part.append('uploadId', created.uploadId);
    part.append('partNumber', '1');
    part.append('file', new File(['abc'], 'part'));
    await api.request(
      new Request('https://videokr.com/uploads/part', { method: 'POST', headers: sessionHeaders, body: part }),
      {},
      env,
    );

    const record = uploads.get(created.uploadId);
    expect(record).toBeDefined();
    record!.forcedSize = 200 * 1024 * 1024 + 1;
    const complete = await api.request(
      new Request('https://videokr.com/uploads/complete', {
        method: 'POST',
        headers: { ...sessionHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({
          key: created.key,
          uploadId: created.uploadId,
          parts: [{ partNumber: 1, etag: 'etag-1' }],
        }),
      }),
      {},
      env,
    );
    expect(complete.status).toBe(413);
    expect(await env.MEDIA.get(created.key)).toBeNull();
    expect(record!.deleted).toBe(true);
  });
});
