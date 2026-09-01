import type { Env } from './types';
import type { S3Target } from './s3';

export type Backend = 'r2' | 'b2';

export interface StorageBucketRow {
  id: string;
  label: string;
  provider: string;
  endpoint: string;
  region: string;
  bucket_name: string;
  bucket_id: string;
  key_id: string;
  secret_cipher: string;
  capacity_bytes: number;
  used_bytes: number;
  object_count: number;
  status: string;
  last_probe_at: number;
  last_error: string;
  created_at: number;
}

export interface StorageBucketView {
  id: string;
  label: string;
  provider: string;
  endpoint: string;
  region: string;
  bucket_name: string;
  bucket_id: string;
  key_id_masked: string;
  capacity_bytes: number;
  used_bytes: number;
  object_count: number;
  status: string;
  last_probe_at: number;
  last_error: string;
  created_at: number;
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function bytes(value: string): Uint8Array {
  const binary = atob(value);
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) output[index] = binary.charCodeAt(index);
  return output;
}

function encryptionKey(env: Env): Promise<CryptoKey> {
  const raw = env.STORAGE_ENC_KEY;
  if (!raw) throw new Error('storage encryption key is not configured');
  let key: Uint8Array;
  try {
    key = bytes(raw);
  } catch {
    throw new Error('storage encryption key is not configured');
  }
  if (key.length !== 32) throw new Error('storage encryption key is not configured');
  return crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export function bucketView(row: StorageBucketRow): StorageBucketView {
  const keyId = row.key_id ?? '';
  return {
    id: row.id,
    label: row.label,
    provider: row.provider,
    endpoint: row.endpoint,
    region: row.region,
    bucket_name: row.bucket_name,
    bucket_id: row.bucket_id,
    key_id_masked: keyId.length > 4 ? `****${keyId.slice(-4)}` : '****',
    capacity_bytes: Number(row.capacity_bytes) || 0,
    used_bytes: Number(row.used_bytes) || 0,
    object_count: Number(row.object_count) || 0,
    status: row.status,
    last_probe_at: Number(row.last_probe_at) || 0,
    last_error: row.last_error,
    created_at: Number(row.created_at) || 0,
  };
}

export async function encryptSecret(env: Env, plain: string): Promise<string> {
  const key = await encryptionKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)));
  const joined = new Uint8Array(iv.length + ciphertext.length);
  joined.set(iv);
  joined.set(ciphertext, iv.length);
  return base64(joined);
}

export async function decryptSecret(env: Env, cipher: string): Promise<string> {
  const key = await encryptionKey(env);
  let joined: Uint8Array;
  try {
    joined = bytes(cipher);
  } catch {
    throw new Error('invalid encrypted storage credential');
  }
  if (joined.length <= 12) throw new Error('invalid encrypted storage credential');
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: joined.slice(0, 12) },
      key,
      joined.slice(12),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error('invalid encrypted storage credential');
  }
}

export async function targetFor(env: Env, row: StorageBucketRow): Promise<S3Target> {
  return {
    endpoint: row.endpoint,
    region: row.region,
    bucket: row.bucket_name,
    keyId: row.key_id,
    secret: await decryptSecret(env, row.secret_cipher),
  };
}

export function regionFromEndpoint(endpoint: string): string {
  const match = /^s3\.([a-z0-9-]+)\.backblazeb2\.com$/i.exec(endpoint.trim());
  if (!match) throw new Error('endpoint must be a Backblaze S3 endpoint');
  return match[1].toLowerCase();
}

export async function pickBucket(env: Env): Promise<StorageBucketRow | null> {
  return env.DB.prepare(
    `SELECT id, label, provider, endpoint, region, bucket_name, bucket_id, key_id, secret_cipher,
            capacity_bytes, used_bytes, object_count, status, last_probe_at, last_error, created_at
       FROM storage_buckets
      WHERE status = 'active' AND (capacity_bytes = 0 OR used_bytes < capacity_bytes)
      ORDER BY used_bytes ASC
      LIMIT 1`,
  ).first<StorageBucketRow>();
}
