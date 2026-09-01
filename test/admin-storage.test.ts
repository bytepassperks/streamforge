import { describe, expect, it, vi } from 'vitest';
import type { Env, User } from '../src/lib/types';
import { api } from '../src/routes/api';
import { decryptSecret } from '../src/lib/storage';

const KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const APP_KEY = 'K005liveapplicationkeySECRET';
const actor: User = {
  id: 'usr_admin',
  email: 'admin@example.com',
  name: 'Admin',
  plan: 'free',
  role: 'admin',
  unlimited: 0,
  suspended: 0,
  lead_emails: 1,
  subscription_id: '',
  plan_renews_at: 0,
  created_at: 1_700_000_000,
};

type Row = Record<string, unknown>;

function poolEnv(rows: Row[] = [], mediaObjects = 0): { env: Env; rows: Row[]; audits: Row[] } {
  const audits: Row[] = [];
  const env = {
    STORAGE_ENC_KEY: KEY,
    DB: {
      prepare(sql: string) {
        let values: unknown[] = [];
        const statement = {
          bind(...args: unknown[]) {
            values = args;
            return statement;
          },
          async all<T>() {
            return { results: rows as T[] };
          },
          async first<T>() {
            if (sql.includes('FROM sessions')) return { ...actor, expires_at: 1_800_000_000 } as T;
            if (sql.includes('FROM media_objects')) return { n: mediaObjects } as T;
            return (rows.find((row) => row.id === values[values.length - 1]) ?? null) as T;
          },
          async run() {
            if (sql.startsWith('INSERT INTO storage_buckets')) {
              rows.push({
                id: values[0],
                label: values[1],
                provider: 'b2',
                endpoint: values[2],
                region: values[3],
                bucket_name: values[4],
                bucket_id: values[5],
                key_id: values[6],
                secret_cipher: values[7],
                capacity_bytes: values[8],
                used_bytes: 0,
                object_count: 0,
                status: 'active',
                last_probe_at: values[9],
                last_error: '',
                created_at: values[10],
              });
            }
            if (sql.startsWith('INSERT INTO admin_audit')) {
              audits.push({ action: values[3], target: values[4], detail: values[5] });
            }
            if (sql.startsWith('UPDATE storage_buckets SET key_id = ?')) {
              const row = rows.find((candidate) => candidate.id === values[3]);
              if (row) {
                row.key_id = values[0];
                row.secret_cipher = values[1];
              }
            }
            if (sql.startsWith('DELETE FROM storage_buckets')) {
              rows.splice(rows.findIndex((row) => row.id === values[0]), 1);
            }
            return {};
          },
        };
        return statement;
      },
    },
  } as unknown as Env;
  return { env, rows, audits };
}

async function request(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('cookie', 'sf_session=test-session');
  return api.request('/admin' + path, { ...init, headers }, env);
}

function stubProvider(ok: boolean, message = 'Signature validation failed'): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) =>
      ok
        ? new Response(
            init.method === 'HEAD'
              ? null
              : '<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>',
            { status: 200 },
          )
        : new Response(`<Error><Code>SignatureDoesNotMatch</Code><Message>${message}</Message></Error>`, {
            status: 403,
          }),
    ),
  );
}

const payload = {
  label: 'Primary B2',
  endpoint: 's3.us-east-005.backblazeb2.com',
  bucket_name: 'videokr-media',
  bucket_id: 'abc123',
  key_id: '005abcdef0123456789012345',
  application_key: APP_KEY,
  capacity_bytes: 1024,
};

function post(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

describe('admin storage pool routes', () => {
  it('probes, encrypts and never returns secret material', async () => {
    stubProvider(true);
    const { env, rows, audits } = poolEnv();
    const response = await request(env, '/storage', post(payload));
    expect(response.status).toBe(201);
    const body = await response.json<{ bucket: Record<string, unknown> }>();
    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain(APP_KEY);
    expect(serialised).not.toContain(String(rows[0].secret_cipher));
    expect(serialised).not.toContain(payload.key_id);
    expect(body.bucket.key_id_masked).toBe('****2345');
    expect(rows).toHaveLength(1);
    expect(rows[0].region).toBe('us-east-005');
    expect(String(rows[0].secret_cipher)).not.toContain(APP_KEY);
    await expect(decryptSecret(env, String(rows[0].secret_cipher))).resolves.toBe(APP_KEY);
    expect(JSON.stringify(audits)).not.toContain(APP_KEY);
    expect(audits[0]).toMatchObject({ action: 'storage.create' });

    const listed = await request(env, '/storage');
    const listBody = await listed.json<{ totals: Record<string, number> }>();
    expect(JSON.stringify(listBody)).not.toContain(APP_KEY);
    expect(listBody.totals).toMatchObject({ capacity_bytes: 1024, used_bytes: 0, object_count: 0 });
    vi.unstubAllGlobals();
  });

  it('stores nothing when the provider probe fails', async () => {
    stubProvider(false);
    const { env, rows, audits } = poolEnv();
    const response = await request(env, '/storage', post(payload));
    expect(response.status).toBe(400);
    expect((await response.json<{ error: string }>()).error).toContain('Signature validation failed');
    expect(rows).toHaveLength(0);
    expect(audits).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it('rejects hostile bucket names before making a provider request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    for (const bucket_name of ['evil.example.com/', 'bucket@evil']) {
      const { env, rows } = poolEnv();
      const response = await request(env, '/storage', post({ ...payload, bucket_name }));
      expect(response.status).toBe(400);
      expect(rows).toHaveLength(0);
    }
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('rejects a delete while the bucket still holds objects', async () => {
    const { env } = poolEnv([{ id: 'bkt_1', object_count: 3, endpoint: 'e', bucket_name: 'b', status: 'active' }]);
    const response = await request(env, '/storage/bkt_1', { method: 'DELETE' });
    expect(response.status).toBe(409);
    const indexed = poolEnv([{ id: 'bkt_2', object_count: 0, endpoint: 'e', bucket_name: 'b', status: 'active' }], 2);
    expect((await request(indexed.env, '/storage/bkt_2', { method: 'DELETE' })).status).toBe(409);
    expect(indexed.rows).toHaveLength(1);
  });

  it('probes the new credentials before replacing the stored pair', async () => {
    stubProvider(false);
    const existing = {
      id: 'bkt_1',
      endpoint: 's3.us-east-005.backblazeb2.com',
      region: 'us-east-005',
      bucket_name: 'videokr-media',
      key_id: 'old-key-id',
      secret_cipher: 'old-cipher',
      status: 'active',
      object_count: 0,
    };
    const { env, rows } = poolEnv([existing]);
    const failed = await request(env, '/storage/bkt_1/rotate', post({ key_id: 'new', application_key: 'rotated' }));
    expect(failed.status).toBe(400);
    expect(rows[0]).toMatchObject({ key_id: 'old-key-id', secret_cipher: 'old-cipher' });
    stubProvider(true);
    const rotated = await request(env, '/storage/bkt_1/rotate', post({ key_id: 'new-key-id', application_key: 'rotated' }));
    expect(rotated.status).toBe(200);
    expect(rows[0].key_id).toBe('new-key-id');
    await expect(decryptSecret(env, String(rows[0].secret_cipher))).resolves.toBe('rotated');
    expect(JSON.stringify(await rotated.json())).not.toContain('rotated');
    vi.unstubAllGlobals();
  });

  it('validates status transitions', async () => {
    const { env } = poolEnv([{ id: 'bkt_1', status: 'active', object_count: 0 }]);
    const bad = await request(env, '/storage/bkt_1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'gone' }),
    });
    expect(bad.status).toBe(400);
  });
});
