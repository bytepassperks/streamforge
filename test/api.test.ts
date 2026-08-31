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

  it('follows truncated listings when counting uploaded parts', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      key: `usr_1/vid_1/hls/v0/old_${index}.ts`,
      size: 1,
    }));
    const listCalls: Array<Record<string, unknown>> = [];
    const env = hlsEnv({
      async list(options: Record<string, unknown>) {
        listCalls.push(options);
        return options.cursor
          ? { objects: Array.from({ length: 500 }, (_, index) => ({
              key: `usr_1/vid_1/hls/v0/old_${index + 1000}.ts`,
              size: 1,
            })) }
          : { objects: firstPage, truncated: true, cursor: 'page-2' };
      },
    });
    const part = new FormData();
    part.append('path', 'v0/new.ts');
    part.append('file', new File(['part'], 'new.ts', { type: 'video/mp2t' }));

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
    expect(listCalls).toEqual([
      { prefix: 'usr_1/vid_1/hls', limit: 1000 },
      { prefix: 'usr_1/vid_1/hls', limit: 1000, cursor: 'page-2' },
    ]);
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
