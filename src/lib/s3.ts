export interface S3Target {
  endpoint: string;
  region: string;
  bucket: string;
  keyId: string;
  secret: string;
}

export interface S3Object {
  key: string;
  size: number;
  etag?: string;
  lastModified?: string;
}

export interface ListObjectsOptions {
  maxKeys?: number;
  limit?: number;
}

const encoder = new TextEncoder();

function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: string | ArrayBuffer | Uint8Array): Promise<string> {
  const input = typeof value === 'string' ? encoder.encode(value) : value;
  return hex(await crypto.subtle.digest('SHA-256', input));
}

async function hmac(key: ArrayBuffer | Uint8Array, value: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(value));
}

function keyPath(key: string): string {
  return '/' + key.split('/').map(rfc3986).join('/');
}

// Hostnames are case-insensitive and the runtime lowercases them before the
// request goes out, so sign the lowercased host or B2 rejects the signature.
function hostFor(target: S3Target): string {
  return `${target.bucket}.${target.endpoint}`.toLowerCase();
}

function endpointFor(target: S3Target, key = ''): string {
  return `https://${hostFor(target)}${keyPath(key)}`;
}

function canonicalQuery(query: Record<string, string>): string {
  return Object.entries(query)
    .map(([name, value]) => [rfc3986(name), rfc3986(value)] as const)
    .sort(([nameA, valueA], [nameB, valueB]) => nameA.localeCompare(nameB) || valueA.localeCompare(valueB))
    .map(([name, value]) => `${name}=${value}`)
    .join('&');
}

function canonicalHeaders(headers: Headers): { canonical: string; signed: string } {
  const entries = [...headers.entries()]
    .map(([name, value]) => [name.toLowerCase(), value.trim().replace(/\s+/g, ' ')] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  return {
    canonical: entries.map(([name, value]) => `${name}:${value}\n`).join(''),
    signed: entries.map(([name]) => name).join(';'),
  };
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function xmlText(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return match?.[1] ?? '';
}

function xmlUnescape(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
}

async function throwS3Error(response: Response): Promise<never> {
  const body = await response.text().catch(() => '');
  const message = xmlText(body, 'Message') || xmlText(body, 'message') || body.slice(0, 300) || response.statusText;
  throw new Error(message);
}

export async function s3Fetch(
  target: S3Target,
  init: {
    method: string;
    key?: string;
    query?: Record<string, string>;
    headers?: Record<string, string>;
    body?: BodyInit | null;
    payloadHash?: string;
  },
): Promise<Response> {
  const method = init.method.toUpperCase();
  const query = init.query ?? {};
  const host = hostFor(target);
  const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const date = amzDate.slice(0, 8);
  const payloadHash = init.payloadHash ?? 'UNSIGNED-PAYLOAD';
  const headers = new Headers(init.headers);
  headers.set('host', host);
  headers.set('x-amz-content-sha256', payloadHash);
  headers.set('x-amz-date', amzDate);
  const signed = canonicalHeaders(headers);
  const canonicalRequest = [
    method,
    keyPath(init.key ?? ''),
    canonicalQuery(query),
    signed.canonical,
    signed.signed,
    payloadHash,
  ].join('\n');
  const scope = `${date}/${target.region}/s3/aws4_request`;
  const signingKey = await hmac(encoder.encode(`AWS4${target.secret}`), date)
    .then((value) => hmac(value, target.region))
    .then((value) => hmac(value, 's3'))
    .then((value) => hmac(value, 'aws4_request'));
  const signature = hex(await hmac(signingKey, `${'AWS4-HMAC-SHA256'}\n${amzDate}\n${scope}\n${await sha256(canonicalRequest)}`));
  headers.set(
    'authorization',
    `AWS4-HMAC-SHA256 Credential=${target.keyId}/${scope}, SignedHeaders=${signed.signed}, Signature=${signature}`,
  );
  return fetch(`${endpointFor(target, init.key)}${canonicalQuery(query) ? `?${canonicalQuery(query)}` : ''}`, {
    method,
    headers,
    body: init.body,
  });
}

export async function headBucket(target: S3Target): Promise<Response> {
  return s3Fetch(target, { method: 'HEAD' });
}

export async function putObject(
  target: S3Target,
  key: string,
  body: BodyInit,
  contentType?: string,
): Promise<Response> {
  return s3Fetch(target, {
    method: 'PUT',
    key,
    body,
    headers: contentType ? { 'content-type': contentType } : undefined,
  });
}

export async function getObject(target: S3Target, key: string, range?: string): Promise<Response> {
  return s3Fetch(target, { method: 'GET', key, headers: range ? { range } : undefined });
}

export async function deleteObject(target: S3Target, key: string): Promise<Response> {
  return s3Fetch(target, { method: 'DELETE', key });
}

export async function listObjects(target: S3Target, options: ListObjectsOptions = {}): Promise<S3Object[]> {
  const maxKeys = String(Math.max(1, Math.min(1000, Math.floor(options.maxKeys ?? 1000))));
  const objects: S3Object[] = [];
  let token = '';
  do {
    const query: Record<string, string> = { 'list-type': '2', 'max-keys': maxKeys };
    if (token) query['continuation-token'] = token;
    const response = await s3Fetch(target, { method: 'GET', query });
    if (!response.ok) await throwS3Error(response);
    const body = await response.text();
    const contents = [...body.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)];
    for (const content of contents) {
      const item = content[1];
      objects.push({
        key: xmlUnescape(xmlText(item, 'Key')),
        size: Number(xmlText(item, 'Size')) || 0,
        etag: xmlUnescape(xmlText(item, 'ETag')) || undefined,
        lastModified: xmlText(item, 'LastModified') || undefined,
      });
      if (options.limit !== undefined && objects.length >= options.limit) return objects.slice(0, options.limit);
    }
    token = xmlUnescape(xmlText(body, 'NextContinuationToken'));
  } while (token);
  return objects;
}

export async function createMultipartUpload(target: S3Target, key: string, contentType?: string): Promise<string> {
  const response = await s3Fetch(target, {
    method: 'POST',
    key,
    query: { uploads: '' },
    headers: contentType ? { 'content-type': contentType } : undefined,
  });
  if (!response.ok) await throwS3Error(response);
  const uploadId = xmlUnescape(xmlText(await response.text(), 'UploadId'));
  if (!uploadId) throw new Error('multipart upload did not return an upload id');
  return uploadId;
}

export async function uploadPart(target: S3Target, key: string, uploadId: string, partNumber: number, body: BodyInit): Promise<Response> {
  const response = await s3Fetch(target, {
    method: 'PUT',
    key,
    query: { partNumber: String(partNumber), uploadId },
    body,
  });
  if (!response.ok) await throwS3Error(response);
  return response;
}

export async function completeMultipartUpload(
  target: S3Target,
  key: string,
  uploadId: string,
  parts: Array<{ partNumber: number; etag: string }>,
): Promise<Response> {
  const body = `<CompleteMultipartUpload>${parts
    .map((part) => `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${xmlEscape(part.etag)}</ETag></Part>`)
    .join('')}</CompleteMultipartUpload>`;
  const response = await s3Fetch(target, {
    method: 'POST',
    key,
    query: { uploadId },
    headers: { 'content-type': 'application/xml' },
    body,
  });
  if (!response.ok) await throwS3Error(response);
  const text = await response.clone().text();
  if (/<(?:Error|error)>/.test(text)) await throwS3Error(new Response(text, { status: 400 }));
  return response;
}

export async function abortMultipartUpload(target: S3Target, key: string, uploadId: string): Promise<Response> {
  const response = await s3Fetch(target, { method: 'DELETE', key, query: { uploadId } });
  if (!response.ok) await throwS3Error(response);
  return response;
}
