import type { R2Object, R2ObjectBody, R2Bucket, R2MultipartUpload } from '@cloudflare/workers-types';
import type { Env } from './types';
import type { Backend, StorageBucketRow } from './storage';
import { pickBucket, targetFor } from './storage';
import {
  abortMultipartUpload as abortB2MultipartUpload,
  completeMultipartUpload as completeB2MultipartUpload,
  createMultipartUpload as createB2MultipartUpload,
  deleteObject as deleteB2Object,
  listObjectsPage,
  putObject as putB2Object,
  s3Fetch,
  uploadPart as uploadB2Part,
} from './s3';

export interface MediaLocation {
  key: string;
  backend: Backend;
  bucketId: string;
}

export interface MediaRead {
  body: ReadableStream | null;
  size: number;
  contentType: string;
  etag: string;
  range: { offset: number; length: number } | null;
}

type ObjectRow = {
  key: string;
  user_id: string;
  backend: Backend;
  bucket_id: string;
  size_bytes: number;
  content_type: string;
};

const PAID_PLANS = new Set(['starter', 'agency', 'lifetime']);

function db(env: Env): D1Database {
  return env.DB;
}

async function objectRow(env: Env, key: string): Promise<ObjectRow | null> {
  const database = db(env);
  return database
    .prepare('SELECT key, user_id, backend, bucket_id, size_bytes, content_type FROM media_objects WHERE key = ?')
    .bind(key)
    .first<ObjectRow>();
}

async function bucketRow(env: Env, id: string): Promise<StorageBucketRow | null> {
  const database = db(env);
  return database
    .prepare(
      `SELECT id, label, provider, endpoint, region, bucket_name, bucket_id, key_id, secret_cipher,
              capacity_bytes, used_bytes, object_count, status, last_probe_at, last_error, created_at
         FROM storage_buckets WHERE id = ?`,
    )
    .bind(id)
    .first<StorageBucketRow>();
}

async function bucketRows(env: Env): Promise<StorageBucketRow[]> {
  const database = db(env);
  const result = await database
    .prepare(
      `SELECT id, label, provider, endpoint, region, bucket_name, bucket_id, key_id, secret_cipher,
              capacity_bytes, used_bytes, object_count, status, last_probe_at, last_error, created_at
         FROM storage_buckets`,
    )
    .all<StorageBucketRow>();
  return result.results;
}

async function rememberFailure(env: Env, bucketId: string, error: unknown): Promise<void> {
  const database = db(env);
  const message = error instanceof Error ? error.message : String(error);
  await database
    .prepare('UPDATE storage_buckets SET last_error = ? WHERE id = ?')
    .bind(message.slice(0, 500), bucketId)
    .run();
}

async function updateAccounting(
  env: Env,
  previous: ObjectRow | null,
  next: { key: string; userId: string; backend: Backend; bucketId: string; size: number; contentType: string },
): Promise<void> {
  const database = db(env);
  const statements: D1PreparedStatement[] = [];
  if (previous?.backend === 'b2' && previous.bucket_id) {
    const sameBucket = next.backend === 'b2' && previous.bucket_id === next.bucketId;
    if (!sameBucket) {
      statements.push(
        database
          .prepare(
            `UPDATE storage_buckets
                SET used_bytes = MAX(0, used_bytes - ?),
                    object_count = MAX(0, object_count - ?)
              WHERE id = ?`,
          )
          .bind(previous.size_bytes, previous.size_bytes > 0 ? 1 : 0, previous.bucket_id),
      );
    }
  }
  if (next.backend === 'b2' && next.bucketId) {
    const sameBucket = previous?.backend === 'b2' && previous.bucket_id === next.bucketId;
    const sizeDelta = sameBucket ? next.size - previous.size_bytes : next.size;
    const countDelta = (next.size > 0 ? 1 : 0) - (sameBucket && previous && previous.size_bytes > 0 ? 1 : 0);
    statements.push(
      database
        .prepare(
          `UPDATE storage_buckets
              SET used_bytes = MAX(0, used_bytes + ?),
                  object_count = MAX(0, object_count + ?)
            WHERE id = ?`,
        )
        .bind(sizeDelta, countDelta, next.bucketId),
    );
  }
  statements.push(
    database
      .prepare(
        `INSERT INTO media_objects (key, user_id, backend, bucket_id, size_bytes, content_type, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           user_id = excluded.user_id,
           backend = excluded.backend,
           bucket_id = excluded.bucket_id,
           size_bytes = excluded.size_bytes,
           content_type = excluded.content_type`,
      )
      .bind(next.key, next.userId, next.backend, next.bucketId, next.size, next.contentType, Math.floor(Date.now() / 1000)),
  );
  await database.batch(statements);
}

async function removeAccounting(env: Env, row: ObjectRow | null): Promise<void> {
  const database = db(env);
  if (!row) return;
  const statements: D1PreparedStatement[] = [];
  if (row.backend === 'b2' && row.bucket_id) {
    statements.push(
      database
        .prepare(
          `UPDATE storage_buckets
              SET used_bytes = MAX(0, used_bytes - ?),
                  object_count = MAX(0, object_count - ?)
            WHERE id = ?`,
        )
        .bind(row.size_bytes, row.size_bytes > 0 ? 1 : 0, row.bucket_id),
    );
  }
  statements.push(database.prepare('DELETE FROM media_objects WHERE key = ?').bind(row.key));
  await database.batch(statements);
}

async function recordObject(
  env: Env,
  key: string,
  userId: string,
  backend: Backend,
  bucketId: string,
  size: number,
  contentType: string,
): Promise<void> {
  await updateAccounting(env, await objectRow(env, key), { key, userId, backend, bucketId, size, contentType });
}

async function forgetObject(env: Env, key: string): Promise<void> {
  await removeAccounting(env, await objectRow(env, key));
}

function r2(env: Env): R2Bucket {
  return env.MEDIA;
}

function isStream(body: ReadableStream | ArrayBuffer | string): body is ReadableStream {
  return typeof ReadableStream !== 'undefined' && body instanceof ReadableStream;
}

function r2Size(object: R2Object): number {
  return Number(object.size) || 0;
}

function rangeFromHeaders(headers: Headers): { offset: number; length: number } | null {
  const value = headers.get('content-range');
  const match = value?.match(/^bytes\s+(\d+)-(\d+)\/(\d+)$/i);
  if (!match) return null;
  const offset = Number(match[1]);
  const end = Number(match[2]);
  return { offset, length: end - offset + 1 };
}

export async function locationFor(env: Env, key: string): Promise<MediaLocation> {
  const row = await objectRow(env, key);
  return row?.backend === 'b2'
    ? { key, backend: 'b2', bucketId: row.bucket_id }
    : { key, backend: 'r2', bucketId: '' };
}

export async function backendFor(
  env: Env,
  user: { id: string; plan: string },
): Promise<{ backend: Backend; bucket: StorageBucketRow | null }> {
  if (!PAID_PLANS.has(user.plan)) return { backend: 'r2', bucket: null };
  const bucket = await pickBucket(env);
  return bucket ? { backend: 'b2', bucket } : { backend: 'r2', bucket: null };
}

async function targetForBucket(env: Env, bucketId: string) {
  const bucket = await bucketRow(env, bucketId);
  if (!bucket) throw new Error('storage bucket is no longer available');
  return { bucket, target: await targetFor(env, bucket) };
}

async function bucketForPrefix(env: Env, key: string): Promise<StorageBucketRow | null> {
  const marker = key.indexOf('/hls/');
  if (marker < 0) return null;
  const prefix = key.slice(0, marker + 4);
  const row = await db(env)
    .prepare(
      `SELECT bucket_id
         FROM media_objects
        WHERE backend = 'b2' AND key LIKE ? AND size_bytes > 0
        LIMIT 1`,
    )
    .bind(`${prefix}/%`)
    .first<{ bucket_id: string }>();
  return row?.bucket_id ? bucketRow(env, row.bucket_id) : null;
}

async function destinationFor(
  env: Env,
  key: string,
  user: { id: string; plan: string },
): Promise<{ backend: Backend; bucket: StorageBucketRow | null }> {
  const location = await locationFor(env, key);
  if (location.backend === 'b2') {
    const bucket = await bucketRow(env, location.bucketId);
    if (!bucket) throw new Error('storage bucket is no longer available');
    return { backend: 'b2', bucket };
  }
  if (await objectRow(env, key)) return { backend: 'r2', bucket: null };
  const media = r2(env);
  if (await media.head(key)) return { backend: 'r2', bucket: null };
  const pinned = await bucketForPrefix(env, key);
  if (pinned) return { backend: 'b2', bucket: pinned };
  return backendFor(env, user);
}

export async function putMedia(
  env: Env,
  opts: {
    key: string;
    userId: string;
    plan: string;
    body: ReadableStream | ArrayBuffer | string;
    contentType: string;
    size?: number;
  },
): Promise<Backend> {
  const previous = await objectRow(env, opts.key);
  const destination = await destinationFor(env, opts.key, { id: opts.userId, plan: opts.plan });
  if (destination.backend === 'r2') {
    const object = await r2(env).put(opts.key, opts.body, { httpMetadata: { contentType: opts.contentType } });
    const size = r2Size(object);
    if (previous || PAID_PLANS.has(opts.plan)) {
      await recordObject(env, opts.key, opts.userId, 'r2', '', size, opts.contentType);
    }
    return 'r2';
  }

  const bucket = destination.bucket!;
  let b2Body: ReadableStream | ArrayBuffer;
  let r2Body: ArrayBuffer | null;
  if (isStream(opts.body)) {
    if (opts.size !== undefined && opts.size <= 24 * 1024 * 1024) {
      r2Body = await new Response(opts.body).arrayBuffer();
      b2Body = r2Body;
    } else {
      r2Body = null;
      b2Body = opts.body;
    }
  } else if (typeof opts.body === 'string') {
    r2Body = new TextEncoder().encode(opts.body).buffer;
    b2Body = r2Body;
  } else {
    r2Body = opts.body;
    b2Body = opts.body;
  }
  try {
    const { target } = await targetForBucket(env, bucket.id);
    const response = await putB2Object(target, opts.key, b2Body, opts.contentType);
    if (!response.ok) throw new Error(`B2 put failed with HTTP ${response.status}`);
    const metadata = await headB2Object(target, opts.key);
    if (!metadata) throw new Error('B2 object is missing after upload');
    await recordObject(env, opts.key, opts.userId, 'b2', bucket.id, metadata.size, opts.contentType);
    return 'b2';
  } catch (error) {
    await rememberFailure(env, bucket.id, error);
    if (!r2Body) throw new Error('upload could not be completed, please retry');
    const object = await r2(env).put(opts.key, r2Body, { httpMetadata: { contentType: opts.contentType } });
    const size = r2Size(object);
    await recordObject(env, opts.key, opts.userId, 'r2', '', size, opts.contentType);
    return 'r2';
  }
}

async function readFromR2(object: R2ObjectBody | null): Promise<MediaRead | null> {
  if (!object) return null;
  const range = object.range && 'offset' in object.range
    ? { offset: object.range.offset ?? 0, length: object.range.length ?? object.size - (object.range.offset ?? 0) }
    : null;
  return {
    body: object.body,
    size: object.size,
    contentType: object.httpMetadata?.contentType ?? '',
    etag: object.httpEtag,
    range,
  };
}

export async function getMedia(env: Env, key: string, range?: string): Promise<MediaRead | null> {
  const location = await locationFor(env, key);
  if (location.backend === 'r2') {
    return readFromR2(range ? await r2(env).get(key, { range: new Headers({ range }) }) : await r2(env).get(key));
  }
  const { target } = await targetForBucket(env, location.bucketId);
  const response = await s3Fetch(target, {
    method: 'GET',
    key,
    headers: range ? { range } : undefined,
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`B2 media read failed with HTTP ${response.status}`);
  const row = await objectRow(env, key);
  const size = row && row.size_bytes > 0
    ? row.size_bytes
    : Number(response.headers.get('content-range')?.match(/\/(\d+)$/)?.[1] ?? response.headers.get('content-length') ?? 0);
  return {
    body: response.body,
    size,
    contentType: response.headers.get('content-type') ?? row?.content_type ?? '',
    etag: response.headers.get('etag') ?? '',
    range: rangeFromHeaders(response.headers),
  };
}

async function headB2Object(
  target: Parameters<typeof s3Fetch>[0],
  key: string,
  missingOk = false,
): Promise<{ size: number; contentType: string; etag: string } | null> {
  const response = await s3Fetch(target, { method: 'HEAD', key });
  if (missingOk && response.status === 404) return null;
  if (!response.ok) throw new Error(`B2 media head failed with HTTP ${response.status}`);
  return {
    size: Number(response.headers.get('content-length') ?? 0),
    contentType: response.headers.get('content-type') ?? '',
    etag: response.headers.get('etag') ?? '',
  };
}

export async function headMedia(env: Env, key: string): Promise<{ size: number; contentType: string; etag: string } | null> {
  const location = await locationFor(env, key);
  if (location.backend === 'r2') {
    const object = await r2(env).head(key);
    return object
      ? { size: object.size, contentType: object.httpMetadata?.contentType ?? '', etag: object.httpEtag }
      : null;
  }
  const { target } = await targetForBucket(env, location.bucketId);
  return headB2Object(target, key, true);
}

export async function deleteMedia(env: Env, key: string): Promise<void> {
  const location = await locationFor(env, key);
  if (location.backend === 'b2') {
    const { target } = await targetForBucket(env, location.bucketId);
    const response = await deleteB2Object(target, key);
    if (!response.ok) throw new Error(`B2 media delete failed with HTTP ${response.status}`);
  } else {
    await r2(env).delete(key);
  }
  await forgetObject(env, key);
}

export async function listMedia(env: Env, prefix: string): Promise<Array<{ key: string; size: number }>> {
  const rows = await bucketRows(env);
  const locations = new Map<string, Backend>();
  const database = db(env);
  {
    const result = await database
      .prepare('SELECT key, backend FROM media_objects WHERE key LIKE ?')
      .bind(`${prefix}%`)
      .all<{ key: string; backend: Backend }>();
    for (const row of result.results) locations.set(row.key, row.backend);
  }
  const r2Objects: Array<{ key: string; size: number }> = [];
  let cursor: string | undefined;
  do {
    const page = await r2(env).list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    for (const object of page.objects) {
      if (locations.get(object.key) !== 'b2') r2Objects.push({ key: object.key, size: object.size });
    }
    if (!page.truncated) break;
    cursor = page.cursor;
  } while (cursor);
  const result = [...r2Objects];
  for (const bucket of rows) {
    const target = await targetFor(env, bucket);
    let token: string | undefined;
    do {
      const page = await listObjectsPage(target, { prefix, token });
      for (const object of page.objects) {
        if (locations.get(object.key) !== 'r2') result.push({ key: object.key, size: object.size });
      }
      token = page.nextToken;
    } while (token);
  }
  return result;
}

export async function createUpload(
  env: Env,
  opts: { key: string; userId: string; plan: string; contentType: string },
): Promise<{ uploadId: string; backend: Backend }> {
  const destination = await backendFor(env, { id: opts.userId, plan: opts.plan });
  if (destination.backend === 'r2') {
    const upload = await r2(env).createMultipartUpload(opts.key, { httpMetadata: { contentType: opts.contentType } });
    return { uploadId: upload.uploadId, backend: 'r2' };
  }
  const bucket = destination.bucket!;
  try {
    const { target } = await targetForBucket(env, bucket.id);
    const uploadId = await createB2MultipartUpload(target, opts.key, opts.contentType);
    await recordObject(env, opts.key, opts.userId, 'b2', bucket.id, 0, opts.contentType);
    return { uploadId, backend: 'b2' };
  } catch (error) {
    await rememberFailure(env, bucket.id, error);
    const upload = await r2(env).createMultipartUpload(opts.key, { httpMetadata: { contentType: opts.contentType } });
    await recordObject(env, opts.key, opts.userId, 'r2', '', 0, opts.contentType);
    return { uploadId: upload.uploadId, backend: 'r2' };
  }
}

async function b2UploadFailure(
  env: Env,
  key: string,
  target: Awaited<ReturnType<typeof targetFor>> | null,
  uploadId: string,
  error: unknown,
): Promise<never> {
  const row = await objectRow(env, key);
  if (row?.bucket_id) await rememberFailure(env, row.bucket_id, error);
  try {
    if (target) await abortB2MultipartUpload(target, key, uploadId);
  } catch {
    // The pending row is still removed even if the provider abort is unavailable.
  } finally {
    await forgetObject(env, key);
  }
  throw new Error('upload could not be completed, please retry');
}

export async function uploadPart(
  env: Env,
  key: string,
  uploadId: string,
  partNumber: number,
  body: ReadableStream | ArrayBuffer,
): Promise<{ etag: string }> {
  const location = await locationFor(env, key);
  if (location.backend === 'r2') {
    const upload: R2MultipartUpload = r2(env).resumeMultipartUpload(key, uploadId);
    const part = await upload.uploadPart(partNumber, body);
    return { etag: part.etag };
  }
  let target: Awaited<ReturnType<typeof targetFor>> | null = null;
  try {
    target = (await targetForBucket(env, location.bucketId)).target;
    const response = await uploadB2Part(target, key, uploadId, partNumber, body);
    return { etag: response.headers.get('etag') ?? '' };
  } catch (error) {
    return b2UploadFailure(env, key, target, uploadId, error);
  }
}

export async function completeUpload(
  env: Env,
  key: string,
  uploadId: string,
  parts: Array<{ partNumber: number; etag: string }>,
): Promise<{ size: number }> {
  const location = await locationFor(env, key);
  if (location.backend === 'r2') {
    const upload = r2(env).resumeMultipartUpload(key, uploadId);
    const object = await upload.complete(parts);
    const size = object?.size ?? (await r2(env).head(key))?.size ?? 0;
    const row = await objectRow(env, key);
    if (row) await recordObject(env, key, row.user_id, 'r2', '', size, row.content_type);
    return { size };
  }
  let target: Awaited<ReturnType<typeof targetFor>> | null = null;
  try {
    target = (await targetForBucket(env, location.bucketId)).target;
    await completeB2MultipartUpload(target, key, uploadId, parts);
    const object = await headMedia(env, key);
    if (!object) throw new Error('B2 multipart object is missing after completion');
    const row = await objectRow(env, key);
    await recordObject(env, key, row?.user_id ?? '', 'b2', location.bucketId, object.size, row?.content_type ?? '');
    return { size: object.size };
  } catch (error) {
    return b2UploadFailure(env, key, target, uploadId, error);
  }
}

export async function abortUpload(env: Env, key: string, uploadId: string): Promise<void> {
  const location = await locationFor(env, key);
  if (location.backend === 'r2') {
    const upload = r2(env).resumeMultipartUpload(key, uploadId);
    await upload.abort();
  } else {
    try {
      const { target } = await targetForBucket(env, location.bucketId);
      await abortB2MultipartUpload(target, key, uploadId);
    } finally {
      await forgetObject(env, key);
    }
    return;
  }
  await forgetObject(env, key);
}
