import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/lib/types';
import {
  canonicalHeaders,
  canonicalQuery,
  completeMultipartUpload,
  listObjects,
  s3Fetch,
  sumObjects,
  validateBucketName,
} from '../src/lib/s3';
import { decryptSecret, encryptSecret, pickBucket, regionFromEndpoint } from '../src/lib/storage';

const target = {
  endpoint: 's3.amazonaws.com',
  region: 'us-east-1',
  bucket: 'examplebucket',
  keyId: 'AKIAIOSFODNN7EXAMPLE',
  secret: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
};

function envWithKey(key = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='): Env {
  return {
    STORAGE_ENC_KEY: key,
  } as unknown as Env;
}

/* A pool query is only correct if the database applies its clauses, so the fake
   refuses to filter anything the SQL does not actually ask for. */
function poolEnv(rows: Array<Record<string, unknown>>): Env {
  return {
    DB: {
      prepare(sql: string) {
        return {
          async first<T>() {
            let candidates = [...rows];
            if (sql.includes("status = 'active'")) candidates = candidates.filter((row) => row.status === 'active');
            if (sql.includes('capacity_bytes = 0 OR used_bytes < capacity_bytes')) {
              candidates = candidates.filter(
                (row) => Number(row.capacity_bytes) === 0 || Number(row.used_bytes) < Number(row.capacity_bytes),
              );
            }
            if (sql.includes('ORDER BY used_bytes ASC')) {
              candidates.sort((a, b) => Number(a.used_bytes) - Number(b.used_bytes));
            }
            return (candidates[0] ?? null) as T;
          },
        };
      },
    },
  } as unknown as Env;
}

describe('Backblaze storage helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('matches the AWS SigV4 header vector and encodes object key segments', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2013-05-24T00:00:00.000Z'));
    const request = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toMatch(/^https:\/\/examplebucket\.s3\.amazonaws\.com\/(?:test\.txt|a%20b\/%C3%A9\.txt)$/);
      expect(init.method).toBe('GET');
      const headers = new Headers(init.headers);
      expect(headers.get('x-amz-content-sha256')).toBe('UNSIGNED-PAYLOAD');
      expect(headers.get('host')).toBe('examplebucket.s3.amazonaws.com');
      if (url.endsWith('/test.txt')) {
        expect(headers.get('authorization')).toBe(
          'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, ' +
            'SignedHeaders=host;x-amz-content-sha256;x-amz-date, ' +
            'Signature=17ee2dc4ebe24953b3ebb4aad72c73aada1b27aa77109a55301af128fdcf571f',
        );
      }
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal('fetch', request);
    await s3Fetch(target, { method: 'GET', key: 'test.txt' });
    expect(request).toHaveBeenCalledOnce();
    await s3Fetch(target, { method: 'GET', key: 'a b/é.txt' });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('uses byte order for canonical query and header names', () => {
    expect(canonicalQuery({ 'x-amz-a': '1', 'x-amz-A': '2' })).toBe('x-amz-A=2&x-amz-a=1');
    const headers = canonicalHeaders(
      new Headers({ 'x-amz-Meta-a': 'one', 'x-amz-metadata': 'two', 'x-amz_a': 'three' }),
    );
    expect(headers.signed).toBe('x-amz-meta-a;x-amz-metadata;x-amz_a');
  });

  it('rejects invalid bucket names before signing', () => {
    expect(() => validateBucketName('evil.example.com/')).toThrow('valid S3 bucket name');
    expect(() => validateBucketName('bucket@evil')).toThrow('valid S3 bucket name');
    expect(() => validateBucketName('192.168.1.1')).toThrow('valid S3 bucket name');
  });

  it('round trips encrypted credentials and rejects tampering', async () => {
    const env = envWithKey();
    const cipher = await encryptSecret(env, 'application-key');
    expect(cipher).not.toContain('application-key');
    await expect(decryptSecret(env, cipher)).resolves.toBe('application-key');
    const tampered = cipher.slice(0, -2) + (cipher.endsWith('AA') ? 'BB' : 'AA');
    await expect(decryptSecret(env, tampered)).rejects.toThrow('invalid encrypted storage credential');
  });

  it('rejects missing or malformed encryption keys', async () => {
    await expect(encryptSecret({} as Env, 'secret')).rejects.toThrow('storage encryption key is not configured');
    await expect(encryptSecret(envWithKey('bad'), 'secret')).rejects.toThrow('storage encryption key is not configured');
  });

  it('parses only Backblaze S3 endpoint regions', () => {
    expect(regionFromEndpoint('s3.us-east-005.backblazeb2.com')).toBe('us-east-005');
    expect(() => regionFromEndpoint('https://s3.us-east-005.backblazeb2.com')).toThrow();
    expect(() => regionFromEndpoint('s3.example.com')).toThrow();
  });

  it('walks ListObjectsV2 continuation pages', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        return new Response(
          calls.length === 1
            ? '<ListBucketResult><Contents><Key>one</Key><Size>4</Size></Contents><IsTruncated>true</IsTruncated><NextContinuationToken>next page</NextContinuationToken></ListBucketResult>'
            : '<ListBucketResult><Contents><Key>two</Key><Size>6</Size></Contents><IsTruncated>false</IsTruncated></ListBucketResult>',
          { status: 200 },
        );
      }),
    );
    await expect(listObjects(target)).resolves.toEqual([
      { key: 'one', size: 4, etag: undefined, lastModified: undefined },
      { key: 'two', size: 6, etag: undefined, lastModified: undefined },
    ]);
    expect(calls[1]).toContain('continuation-token=next%20page');
  });

  it('sums paged listings without retaining the listing', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        return new Response(
          calls.length === 1
            ? '<ListBucketResult><Contents><Key>one</Key><Size>4</Size></Contents><IsTruncated>true</IsTruncated><NextContinuationToken>next</NextContinuationToken></ListBucketResult>'
            : '<ListBucketResult><Contents><Key>two</Key><Size>6</Size></Contents><IsTruncated>false</IsTruncated></ListBucketResult>',
          { status: 200 },
        );
      }),
    );
    await expect(sumObjects(target)).resolves.toEqual({ bytes: 10, count: 2, truncated: false });
    expect(calls).toHaveLength(2);
  });

  it('reports a capped listing as truncated with measured totals', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          '<ListBucketResult><Contents><Key>one</Key><Size>4</Size></Contents><IsTruncated>true</IsTruncated><NextContinuationToken>next</NextContinuationToken></ListBucketResult>',
          { status: 200 },
        ),
      ),
    );
    await expect(sumObjects(target, 1)).resolves.toEqual({ bytes: 4, count: 1, truncated: true });
  });

  it('rejects a late S3 multipart error returned with HTTP 200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<Error><Message>late failure</Message></Error>', { status: 200 })));
    await expect(completeMultipartUpload(target, 'video', 'upload', [{ partNumber: 1, etag: '"etag"' }])).rejects.toThrow('late failure');
  });

  it('picks the least-full active bucket and skips unavailable rows', async () => {
    const rows = [
      { id: 'full', status: 'active', used_bytes: 100, capacity_bytes: 100 },
      { id: 'disabled', status: 'disabled', used_bytes: 1, capacity_bytes: 0 },
      { id: 'draining', status: 'draining', used_bytes: 2, capacity_bytes: 0 },
      { id: 'roomy', status: 'active', used_bytes: 40, capacity_bytes: 0 },
      { id: 'emptiest', status: 'active', used_bytes: 30, capacity_bytes: 500 },
    ];
    await expect(pickBucket(poolEnv(rows))).resolves.toMatchObject({ id: 'emptiest' });
    await expect(pickBucket(poolEnv(rows.filter((row) => row.status !== 'active')))).resolves.toBeNull();
    await expect(pickBucket(poolEnv([]))).resolves.toBeNull();
  });
});
