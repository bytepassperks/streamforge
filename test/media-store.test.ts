import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/lib/types';
import { encryptSecret } from '../src/lib/storage';
import {
  abortUpload,
  backendFor,
  completeUpload,
  deleteMedia,
  getMedia,
  listMedia,
  putMedia,
  createUpload,
  uploadPart,
} from '../src/lib/media-store';
import { pub } from '../src/routes/public';

type Bucket = Record<string, unknown>;
const numeric = (row: Bucket, key: string) => Number(row[key] ?? 0);

function bytes(value: string | Uint8Array): Uint8Array {
  return typeof value === 'string' ? new TextEncoder().encode(value) : value;
}

function memoryEnv(bucketValues: Bucket[] = [], r2Values: Record<string, Uint8Array> = {}) {
  const buckets = bucketValues;
  const objects = new Map<string, Bucket>();
  const r2 = new Map(Object.entries(r2Values));
  const uploads = new Map<string, { key: string; parts: Map<number, Uint8Array>; aborted: boolean }>();
  let uploadNumber = 0;
  const r2Bucket = {
    async put(key: string, body: BodyInit, options?: { httpMetadata?: Record<string, string> }) {
      const value = new Uint8Array(await new Response(body).arrayBuffer());
      r2.set(key, value);
      return {
        size: value.byteLength,
        httpEtag: '"etag-r2"',
        httpMetadata: options?.httpMetadata,
        body: new Response(value).body,
      };
    },
    async get(key: string, options?: { range?: Headers }) {
      const value = r2.get(key);
      if (!value) return null;
      const range = options?.range?.get('range');
      if (!range) {
        return {
          body: new Response(value).body,
          size: value.byteLength,
          httpEtag: '"etag-r2"',
          httpMetadata: { contentType: 'video/mp4' },
          writeHttpMetadata(headers: Headers) {
            headers.set('content-type', 'video/mp4');
          },
        };
      }
      const match = range.match(/bytes=(\d+)-(\d*)/);
      const start = Number(match?.[1] ?? 0);
      const end = match?.[2] ? Number(match[2]) + 1 : value.byteLength;
      const sliced = value.slice(start, end);
      return {
        body: new Response(sliced).body,
        size: value.byteLength,
        range: { offset: start, length: sliced.byteLength },
        httpEtag: '"etag-r2"',
        httpMetadata: { contentType: 'video/mp4' },
      };
    },
    async head(key: string) {
      const value = r2.get(key);
      return value ? { size: value.byteLength, httpEtag: '"etag-r2"', httpMetadata: { contentType: 'video/mp4' } } : null;
    },
    async list(options?: { prefix?: string }) {
      const prefix = options?.prefix ?? '';
      return {
        objects: [...r2.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([key, value]) => ({ key, size: value.byteLength })),
        truncated: false,
      };
    },
    async delete(key: string) {
      r2.delete(key);
    },
    async createMultipartUpload(key: string) {
      const uploadId = `r2-${++uploadNumber}`;
      const upload = { key, parts: new Map<number, Uint8Array>(), aborted: false };
      uploads.set(uploadId, upload);
      return {
        uploadId,
        async uploadPart(partNumber: number, body: BodyInit) {
          upload.parts.set(partNumber, new Uint8Array(await new Response(body).arrayBuffer()));
          return { etag: `etag-${partNumber}` };
        },
        async complete(parts: Array<{ partNumber: number }>) {
          const value = new Uint8Array(parts.reduce((sum, part) => sum + (upload.parts.get(part.partNumber)?.byteLength ?? 0), 0));
          let offset = 0;
          for (const part of parts) {
            const partValue = upload.parts.get(part.partNumber) ?? new Uint8Array();
            value.set(partValue, offset);
            offset += partValue.byteLength;
          }
          r2.set(key, value);
        },
        async abort() {
          upload.aborted = true;
          upload.parts.clear();
        },
      };
    },
    resumeMultipartUpload(key: string, uploadId: string) {
      const upload = uploads.get(uploadId);
      if (!upload || upload.key !== key) throw new Error('missing upload');
      return {
        async uploadPart(partNumber: number, body: BodyInit) {
          upload.parts.set(partNumber, new Uint8Array(await new Response(body).arrayBuffer()));
          return { etag: `etag-${partNumber}` };
        },
        async complete(parts: Array<{ partNumber: number }>) {
          const value = new Uint8Array(parts.reduce((sum, part) => sum + (upload.parts.get(part.partNumber)?.byteLength ?? 0), 0));
          let offset = 0;
          for (const part of parts) {
            const partValue = upload.parts.get(part.partNumber) ?? new Uint8Array();
            value.set(partValue, offset);
            offset += partValue.byteLength;
          }
          r2.set(key, value);
        },
        async abort() {
          upload.aborted = true;
          upload.parts.clear();
        },
      };
    },
  };

  const prepare = (sql: string) => {
    let values: unknown[] = [];
    const statement = {
      bind(...args: unknown[]) {
        values = args;
        return statement;
      },
      async first<T>() {
        if (sql.includes('FROM storage_buckets')) {
          if (sql.includes("status = 'active'")) {
            return (buckets
              .filter((row) => row.status === 'active' && (numeric(row, 'capacity_bytes') === 0 || numeric(row, 'used_bytes') < numeric(row, 'capacity_bytes')))
              .sort((a, b) => numeric(a, 'used_bytes') - numeric(b, 'used_bytes'))[0] ?? null) as T;
          }
          return (buckets.find((row) => row.id === values[0]) ?? null) as T;
        }
        if (sql.includes('FROM media_objects')) {
          const value = String(values[0] ?? '');
          if (sql.includes('key LIKE')) {
            const prefix = value.replace(/%$/, '');
            return ([...objects.values()].find(
              (row) => String(row.key).startsWith(prefix) && row.backend === 'b2' && numeric(row, 'size_bytes') > 0,
            ) ?? null) as T;
          }
          return (objects.get(value) ?? null) as T;
        }
        return null;
      },
      async all<T>() {
        if (sql.includes('FROM storage_buckets')) return { results: buckets as T[] };
        const prefix = String(values[0] ?? '').replace(/%$/, '');
        return { results: [...objects.values()].filter((row) => String(row.key).startsWith(prefix)) as T[] };
      },
      async run() {
        if (sql.startsWith('UPDATE storage_buckets SET last_error')) {
          const row = buckets.find((item) => item.id === values[1]);
          if (row) row.last_error = values[0];
        } else if (sql.includes('UPDATE storage_buckets') && sql.includes('used_bytes = MAX(0, used_bytes + ?')) {
          const row = buckets.find((item) => item.id === values[2]);
          if (row) {
            row.used_bytes = Math.max(0, numeric(row, 'used_bytes') + Number(values[0]));
            row.object_count = Math.max(0, numeric(row, 'object_count') + Number(values[1]));
          }
        } else if (sql.includes('UPDATE storage_buckets') && sql.includes('used_bytes = MAX(0, used_bytes - ?')) {
          const row = buckets.find((item) => item.id === values[2]);
          if (row) {
            row.used_bytes = Math.max(0, numeric(row, 'used_bytes') - Number(values[0]));
            row.object_count = Math.max(0, numeric(row, 'object_count') - Number(values[1]));
          }
        } else if (sql.startsWith('INSERT INTO media_objects')) {
          objects.set(String(values[0]), {
            key: values[0],
            user_id: values[1],
            backend: values[2],
            bucket_id: values[3],
            size_bytes: values[4],
            content_type: values[5],
          });
        } else if (sql.startsWith('DELETE FROM media_objects')) {
          objects.delete(String(values[0]));
        }
        return {};
      },
    };
    return statement;
  };
  const env = {
    DB: {
      prepare,
      async batch(statements: Array<{ run: () => Promise<unknown> }>) {
        for (const statement of statements) await statement.run();
      },
    },
    MEDIA: r2Bucket,
    STORAGE_ENC_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  } as unknown as Env;
  return { env, buckets, objects, r2, uploads, b2: new Map<string, Uint8Array>() };
}

function installB2Fetch(state: ReturnType<typeof memoryEnv>, failures: Set<string> = new Set()) {
  const b2 = state.b2;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const parsed = new URL(url);
    const key = decodeURIComponent(parsed.pathname.slice(1));
    const query = parsed.searchParams;
    const method = init.method ?? 'GET';
    const id = query.get('uploadId') ?? '';
    const op = id ? `${method}:${query.get('partNumber') ? 'part' : query.has('uploads') ? 'create' : 'multipart'}` : `${method}:object`;
    if (failures.has(op)) return new Response('failure', { status: 500 });
    if (method === 'PUT' && query.has('partNumber')) {
      const partKey = `${key}?${id}:${query.get('partNumber')}`;
      b2.set(partKey, new Uint8Array(await new Response(init.body).arrayBuffer()));
      return new Response(null, { status: 200, headers: { etag: `"part-${query.get('partNumber')}"` } });
    }
    if (method === 'POST' && query.has('uploads')) return new Response('<InitiateMultipartUploadResult><UploadId>b2-upload</UploadId></InitiateMultipartUploadResult>', { status: 200 });
    if (method === 'POST' && id) {
      const parts = [...b2.entries()]
        .filter(([partKey]) => partKey.startsWith(`${key}?${id}:`))
        .sort(([a], [b]) => Number(a.split(':').pop()) - Number(b.split(':').pop()))
        .map(([, value]) => value);
      const value = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
      let offset = 0;
      for (const part of parts) {
        value.set(part, offset);
        offset += part.byteLength;
      }
      b2.set(key, value);
      return new Response('<CompleteMultipartUploadResult/>', { status: 200 });
    }
    if (method === 'DELETE' && id) {
      for (const partKey of [...b2.keys()]) if (partKey.startsWith(`${key}?${id}:`)) b2.delete(partKey);
      return new Response(null, { status: 204 });
    }
    if (method === 'PUT') {
      b2.set(key, new Uint8Array(await new Response(init.body).arrayBuffer()));
      return new Response(null, { status: 200 });
    }
    if (method === 'HEAD') {
      const value = b2.get(key);
      return value ? new Response(null, { status: 200, headers: { 'content-length': String(value.byteLength), 'content-type': 'video/mp4', etag: '"etag-b2"' } }) : new Response(null, { status: 404 });
    }
    if (method === 'GET') {
      if (query.has('list-type')) {
        const listed = [...b2.entries()]
          .filter(([objectKey]) => !objectKey.includes('?'))
          .map(([objectKey, value]) => `<Contents><Key>${objectKey}</Key><Size>${value.byteLength}</Size></Contents>`)
          .join('');
        return new Response(`<ListBucketResult>${listed}</ListBucketResult>`, { status: 200 });
      }
      const value = b2.get(key);
      if (!value) return new Response(null, { status: 404 });
      const range = new Headers(init.headers).get('range');
      if (!range) return new Response(value, { status: 200, headers: { 'content-length': String(value.byteLength), 'content-type': 'video/mp4', etag: '"etag-b2"', 'x-amz-provider': 'must-not-leak' } });
      const match = range.match(/bytes=(\d+)-(\d*)/);
      const start = Number(match?.[1] ?? 0);
      const end = match?.[2] ? Number(match[2]) + 1 : value.byteLength;
      const sliced = value.slice(start, end);
      return new Response(sliced, { status: 206, headers: { 'content-length': String(sliced.byteLength), 'content-range': `bytes ${start}-${start + sliced.byteLength - 1}/${value.byteLength}`, 'content-type': 'video/mp4', etag: '"etag-b2"' } });
    }
    return new Response(null, { status: 200 });
  }));
}

const bucket = () => ({
  id: 'bucket-1',
  label: 'fixture',
  provider: 'b2',
  endpoint: 's3.us-east-005.backblazeb2.com',
  region: 'us-east-005',
  bucket_name: 'local-media-bucket',
  bucket_id: 'bucket-id',
  key_id: 'key-id',
  secret_cipher: '',
  capacity_bytes: 0,
  used_bytes: 0,
  object_count: 0,
  status: 'active',
  last_probe_at: 0,
  last_error: '',
  created_at: 1,
});

describe('media store routing', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('keeps free and unknown plans on R2 and routes all paid plans to B2', async () => {
    const state = memoryEnv([bucket()]);
    expect(await backendFor(state.env, { id: 'u', plan: 'free' })).toMatchObject({ backend: 'r2' });
    expect(await backendFor(state.env, { id: 'u', plan: 'unknown' })).toMatchObject({ backend: 'r2' });
    for (const plan of ['starter', 'agency', 'lifetime']) {
      expect(await backendFor(state.env, { id: 'u', plan })).toMatchObject({ backend: 'b2', bucket: { id: 'bucket-1' } });
    }
  });

  it('does not create a location row for a new free-plan put', async () => {
    const state = memoryEnv();
    await expect(
      putMedia(state.env, {
        key: 'u/video.mp4',
        userId: 'u',
        plan: 'free',
        body: bytes('video').buffer,
        contentType: 'video/mp4',
      }),
    ).resolves.toBe('r2');
    expect(state.objects.has('u/video.mp4')).toBe(false);
    expect(state.r2.has('u/video.mp4')).toBe(true);
  });

  it('does not create a location row for a new free-plan multipart upload', async () => {
    const state = memoryEnv();
    const upload = await createUpload(state.env, {
      key: 'u/video.mp4',
      userId: 'u',
      plan: 'free',
      contentType: 'video/mp4',
    });
    const part = await uploadPart(state.env, 'u/video.mp4', upload.uploadId, 1, bytes('video').buffer);
    await completeUpload(state.env, 'u/video.mp4', upload.uploadId, [{ partNumber: 1, etag: part.etag }]);
    expect(state.objects.has('u/video.mp4')).toBe(false);
    expect(state.r2.has('u/video.mp4')).toBe(true);
  });

  it('falls back to R2 when the pool has no eligible bucket', async () => {
    const state = memoryEnv([{ ...bucket(), status: 'draining' }]);
    expect(await backendFor(state.env, { id: 'u', plan: 'starter' })).toMatchObject({ backend: 'r2' });
  });

  it('keeps an existing unrecorded R2 object on R2 for paid overwrites', async () => {
    const state = memoryEnv([bucket()], { 'u/video.mp4': bytes('old') });
    state.buckets[0].secret_cipher = await encryptSecret(state.env, 'secret');
    installB2Fetch(state);
    await expect(
      putMedia(state.env, {
        key: 'u/video.mp4',
        userId: 'u',
        plan: 'starter',
        body: bytes('new').buffer,
        contentType: 'video/mp4',
      }),
    ).resolves.toBe('r2');
    expect(state.r2.get('u/video.mp4')).toEqual(bytes('new'));
    expect(state.objects.get('u/video.mp4')).toMatchObject({ backend: 'r2' });
    expect(state.b2.has('u/video.mp4')).toBe(false);
  });

  it('records B2 placement, updates overwrite deltas, and deletes accounting', async () => {
    const state = memoryEnv([bucket()]);
    state.buckets[0].secret_cipher = await encryptSecret(state.env, 'secret');
    installB2Fetch(state);
    await expect(putMedia(state.env, { key: 'u/video.mp4', userId: 'u', plan: 'starter', body: bytes('1234').buffer, contentType: 'video/mp4' })).resolves.toBe('b2');
    expect(state.objects.get('u/video.mp4')).toMatchObject({ backend: 'b2', size_bytes: 4 });
    expect(state.buckets[0]).toMatchObject({ used_bytes: 4, object_count: 1 });
    await putMedia(state.env, { key: 'u/video.mp4', userId: 'u', plan: 'starter', body: bytes('12').buffer, contentType: 'video/mp4' });
    expect(state.buckets[0]).toMatchObject({ used_bytes: 2, object_count: 1 });
    await deleteMedia(state.env, 'u/video.mp4');
    expect(state.objects.has('u/video.mp4')).toBe(false);
    expect(state.buckets[0]).toMatchObject({ used_bytes: 0, object_count: 0 });
  });

  it('falls back after a B2 put failure and records the error', async () => {
    const state = memoryEnv([bucket()]);
    state.buckets[0].secret_cipher = await encryptSecret(state.env, 'secret');
    installB2Fetch(state, new Set(['PUT:object']));
    await expect(putMedia(state.env, { key: 'u/video.mp4', userId: 'u', plan: 'starter', body: bytes('video').buffer, contentType: 'video/mp4' })).resolves.toBe('r2');
    expect(state.r2.has('u/video.mp4')).toBe(true);
    expect(state.objects.get('u/video.mp4')).toMatchObject({ backend: 'r2' });
    expect(state.buckets[0].last_error).toContain('B2 put failed');
  });

  it('delivers B2 bytes and ranges without provider headers', async () => {
    const state = memoryEnv([bucket()]);
    state.buckets[0].secret_cipher = await encryptSecret(state.env, 'secret');
    installB2Fetch(state);
    state.b2.set('u/video.mp4', bytes('abcdef'));
    state.objects.set('u/video.mp4', { key: 'u/video.mp4', user_id: 'u', backend: 'b2', bucket_id: 'bucket-1', size_bytes: 6, content_type: 'video/mp4' });
    const full = await getMedia(state.env, 'u/video.mp4');
    expect(full?.size).toBe(6);
    expect(await new Response(full?.body).text()).toBe('abcdef');
    const ranged = await getMedia(state.env, 'u/video.mp4', 'bytes=2-4');
    expect(ranged).toMatchObject({ size: 6, range: { offset: 2, length: 3 } });
    expect(await new Response(ranged?.body).text()).toBe('cde');
    expect(ranged).not.toHaveProperty('headers');
  });

  it('proxies B2 delivery through the ordinary media response', async () => {
    const state = memoryEnv([bucket()]);
    state.buckets[0].secret_cipher = await encryptSecret(state.env, 'secret');
    installB2Fetch(state);
    state.b2.set('u/video.mp4', bytes('abcdef'));
    state.objects.set('u/video.mp4', {
      key: 'u/video.mp4',
      user_id: 'u',
      backend: 'b2',
      bucket_id: 'bucket-1',
      size_bytes: 6,
      content_type: 'video/mp4',
    });
    const full = await pub.request(new Request('https://videokr.com/media/u/video.mp4'), {}, state.env);
    expect(full.status).toBe(200);
    expect(await full.text()).toBe('abcdef');
    expect(full.headers.get('content-type')).toBe('video/mp4');
    expect([...full.headers.keys()].some((key) => key.startsWith('x-amz-') || key.startsWith('x-bz-'))).toBe(false);
    const ranged = await pub.request(
      new Request('https://videokr.com/media/u/video.mp4', { headers: { range: 'bytes=2-4' } }),
      {},
      state.env,
    );
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get('content-range')).toBe('bytes 2-4/6');
    expect(await ranged.text()).toBe('cde');
  });

  it('lists the R2 and B2 union for a prefix', async () => {
    const state = memoryEnv([bucket()], { 'u/r2.mp4': bytes('r2') });
    state.buckets[0].secret_cipher = await encryptSecret(state.env, 'secret');
    installB2Fetch(state);
    state.b2.set('u/b2.mp4', bytes('b2'));
    state.objects.set('u/b2.mp4', {
      key: 'u/b2.mp4',
      user_id: 'u',
      backend: 'b2',
      bucket_id: 'bucket-1',
      size_bytes: 2,
      content_type: 'video/mp4',
    });
    await expect(listMedia(state.env, 'u/')).resolves.toEqual(
      expect.arrayContaining([
        { key: 'u/r2.mp4', size: 2 },
        { key: 'u/b2.mp4', size: 2 },
      ]),
    );
  });

  it('returns 500 when a recorded B2 object cannot decrypt its credentials', async () => {
    const state = memoryEnv([bucket()]);
    state.buckets[0].secret_cipher = 'invalid';
    state.objects.set('u/video.mp4', {
      key: 'u/video.mp4',
      user_id: 'u',
      backend: 'b2',
      bucket_id: 'bucket-1',
      size_bytes: 6,
      content_type: 'video/mp4',
    });
    const response = await pub.request(new Request('https://videokr.com/media/u/video.mp4'), {}, state.env);
    expect(response.status).toBe(500);
  });

  it('cleans up a failed B2 multipart part', async () => {
    const state = memoryEnv([bucket()]);
    state.buckets[0].secret_cipher = await encryptSecret(state.env, 'secret');
    installB2Fetch(state, new Set(['PUT:part']));
    const upload = await createUpload(state.env, { key: 'u/video.mp4', userId: 'u', plan: 'starter', contentType: 'video/mp4' });
    await expect(uploadPart(state.env, 'u/video.mp4', upload.uploadId, 1, bytes('part').buffer)).rejects.toThrow(
      'upload could not be completed, please retry',
    );
    expect(state.objects.has('u/video.mp4')).toBe(false);
    expect(state.buckets[0].last_error).toContain('failure');
  });

  it('cleans up a failed B2 multipart completion', async () => {
    const state = memoryEnv([bucket()]);
    state.buckets[0].secret_cipher = await encryptSecret(state.env, 'secret');
    installB2Fetch(state, new Set(['POST:multipart']));
    const upload = await createUpload(state.env, { key: 'u/video.mp4', userId: 'u', plan: 'starter', contentType: 'video/mp4' });
    const part = await uploadPart(state.env, 'u/video.mp4', upload.uploadId, 1, bytes('part').buffer);
    await expect(completeUpload(state.env, 'u/video.mp4', upload.uploadId, [{ partNumber: 1, etag: part.etag }])).rejects.toThrow(
      'upload could not be completed, please retry',
    );
    expect(state.objects.has('u/video.mp4')).toBe(false);
    expect(state.b2.has('u/video.mp4')).toBe(false);
    expect(state.buckets[0].last_error).toContain('failure');
  });

  it('completes a mocked B2 multipart upload and records its size', async () => {
    const state = memoryEnv([bucket()]);
    state.buckets[0].secret_cipher = await encryptSecret(state.env, 'secret');
    installB2Fetch(state);
    const upload = await createUpload(state.env, { key: 'u/video.mp4', userId: 'u', plan: 'starter', contentType: 'video/mp4' });
    const part = await uploadPart(state.env, 'u/video.mp4', upload.uploadId, 1, bytes('part').buffer);
    await expect(completeUpload(state.env, 'u/video.mp4', upload.uploadId, [{ partNumber: 1, etag: part.etag }])).resolves.toEqual({ size: 4 });
    expect(state.objects.get('u/video.mp4')).toMatchObject({ backend: 'b2', size_bytes: 4 });
    expect(state.buckets[0]).toMatchObject({ used_bytes: 4, object_count: 1 });
  });

  it('keeps multipart accounting idempotent across retries', async () => {
    const state = memoryEnv([bucket()]);
    state.buckets[0].secret_cipher = await encryptSecret(state.env, 'secret');
    installB2Fetch(state);
    const first = await createUpload(state.env, {
      key: 'u/video.mp4',
      userId: 'u',
      plan: 'starter',
      contentType: 'video/mp4',
    });
    await createUpload(state.env, {
      key: 'u/video.mp4',
      userId: 'u',
      plan: 'starter',
      contentType: 'video/mp4',
    });
    const part = await uploadPart(state.env, 'u/video.mp4', first.uploadId, 1, bytes('part').buffer);
    await completeUpload(state.env, 'u/video.mp4', first.uploadId, [{ partNumber: 1, etag: part.etag }]);
    await completeUpload(state.env, 'u/video.mp4', first.uploadId, [{ partNumber: 1, etag: part.etag }]);
    expect(state.objects.get('u/video.mp4')).toMatchObject({ size_bytes: 4 });
    expect(state.buckets[0]).toMatchObject({ used_bytes: 4, object_count: 1 });
  });

  it('pins HLS placement to the first B2 bucket for the ladder prefix', async () => {
    const firstBucket = bucket();
    const secondBucket = { ...bucket(), id: 'bucket-2', bucket_id: 'bucket-id-2' };
    const state = memoryEnv([firstBucket, secondBucket]);
    state.buckets[0].secret_cipher = await encryptSecret(state.env, 'secret');
    state.buckets[1].secret_cipher = state.buckets[0].secret_cipher;
    installB2Fetch(state);
    await putMedia(state.env, {
      key: 'u/video/hls/v0/000.ts',
      userId: 'u',
      plan: 'starter',
      body: bytes('first').buffer,
      contentType: 'video/mp2t',
    });
    state.buckets[0].used_bytes = 100;
    await putMedia(state.env, {
      key: 'u/video/hls/v1/000.ts',
      userId: 'u',
      plan: 'starter',
      body: bytes('second').buffer,
      contentType: 'video/mp2t',
    });
    expect(state.objects.get('u/video/hls/v1/000.ts')).toMatchObject({ bucket_id: 'bucket-1', backend: 'b2' });
    expect(state.buckets[1].object_count).toBe(0);
  });

  it('does not retain an oversized stream for a failed B2 fallback', async () => {
    const state = memoryEnv([bucket()]);
    state.buckets[0].secret_cipher = await encryptSecret(state.env, 'secret');
    installB2Fetch(state, new Set(['PUT:object']));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes('video'));
        controller.close();
      },
    });
    await expect(
      putMedia(state.env, {
        key: 'u/large.mp4',
        userId: 'u',
        plan: 'starter',
        body,
        contentType: 'video/mp4',
        size: 25 * 1024 * 1024,
      }),
    ).rejects.toThrow('upload could not be completed, please retry');
    expect(state.r2.has('u/large.mp4')).toBe(false);
    expect(state.buckets[0].last_error).toContain('B2 put failed');
  });

  it('buffers a small stream once for a failed B2 fallback', async () => {
    const state = memoryEnv([bucket()]);
    state.buckets[0].secret_cipher = await encryptSecret(state.env, 'secret');
    installB2Fetch(state, new Set(['PUT:object']));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes('video'));
        controller.close();
      },
    });
    await expect(
      putMedia(state.env, {
        key: 'u/small.mp4',
        userId: 'u',
        plan: 'starter',
        body,
        contentType: 'video/mp4',
        size: 5,
      }),
    ).resolves.toBe('r2');
    expect(state.r2.get('u/small.mp4')).toEqual(bytes('video'));
  });

  it('fills a B2 cache miss from the streamed body without a second provider GET', async () => {
    const state = memoryEnv([bucket()]);
    state.buckets[0].secret_cipher = await encryptSecret(state.env, 'secret');
    installB2Fetch(state);
    const providerFetch = globalThis.fetch;
    const countedFetch = vi.fn(providerFetch);
    vi.stubGlobal('fetch', countedFetch);
    state.b2.set('u/video.mp4', bytes('abcdef'));
    state.objects.set('u/video.mp4', {
      key: 'u/video.mp4',
      user_id: 'u',
      backend: 'b2',
      bucket_id: 'bucket-1',
      size_bytes: 6,
      content_type: 'video/mp4',
    });
    const match = vi.fn(async () => undefined);
    const put = vi.fn(async () => undefined);
    vi.stubGlobal('caches', { default: { match, put } });
    try {
      const response = await pub.request(
        new Request('https://videokr.com/media/u/video.mp4'),
        {},
        state.env,
        { waitUntil: vi.fn(), passThroughOnException: vi.fn() },
      );
      expect(await response.text()).toBe('abcdef');
      expect(countedFetch).toHaveBeenCalledTimes(1);
      expect(countedFetch.mock.calls[0][1]?.method).toBe('GET');
      expect(put).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not turn a B2 credential decryption failure into a missing object', async () => {
    const state = memoryEnv([bucket()]);
    state.buckets[0].secret_cipher = 'not-a-valid-cipher';
    state.objects.set('u/video.mp4', {
      key: 'u/video.mp4',
      user_id: 'u',
      backend: 'b2',
      bucket_id: 'bucket-1',
      size_bytes: 4,
      content_type: 'video/mp4',
    });
    await expect(getMedia(state.env, 'u/video.mp4')).rejects.toThrow('invalid encrypted storage credential');
  });

  it('aborts pending R2 uploads and removes their location row', async () => {
    const state = memoryEnv();
    const upload = await createUpload(state.env, { key: 'u/video.mp4', userId: 'u', plan: 'free', contentType: 'video/mp4' });
    await abortUpload(state.env, 'u/video.mp4', upload.uploadId);
    expect(state.objects.has('u/video.mp4')).toBe(false);
  });
});
