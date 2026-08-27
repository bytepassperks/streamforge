import type { Env } from './types';

let schemaCache: string | null = null;

function absoluteBase(base: string): string {
  return `${base.replace(/\/+$/, '')}/`;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function setAttribute(tag: string, name: string, value: string): string {
  const attribute = new RegExp(`(\\b${name}\\s*=\\s*)(["'])(.*?)\\2`, 'i');
  const escaped = escapeAttribute(value);
  if (attribute.test(tag)) return tag.replace(attribute, `$1"${escaped}"`);
  return tag.replace(/\/?>$/, ` ${name}="${escaped}"$&`);
}

function forceTag(html: string, pattern: RegExp, name: string, value: string): [string, boolean] {
  let found = false;
  const result = html.replace(pattern, (tag) => {
    found = true;
    return setAttribute(tag, name, value);
  });
  return [result, found];
}

function extractSchema(html: string): string {
  const scripts =
    html.match(
      /<script\b(?=[^>]*\btype\s*=\s*(["'])application\/ld\+json\1)[^>]*>[\s\S]*?<\/script>/gi,
    ) ?? [];
  return scripts.join('');
}

async function landingSchema(env: Env): Promise<string> {
  if (schemaCache !== null) return schemaCache;
  try {
    const response = await env.ASSETS.fetch(new Request('https://assets.local/index.html'));
    schemaCache = response.ok ? extractSchema(await response.text()) : '';
  } catch {
    schemaCache = '';
  }
  return schemaCache;
}

export function mergeLanding(html: string, base: string, source: string, schema: string): string {
  const closeHead = /<\/head\s*>/i;
  if (!closeHead.test(html)) return html;

  const target = absoluteBase(base);
  /* Origins, not the full urls: a link the published page writes as
     `<origin>/pricing` has to come out as `<base>/pricing`, so the part being
     swapped must stop before the path. */
  let merged = html.replaceAll(new URL(source).origin, new URL(base).origin);
  let found: boolean;

  [merged, found] = forceTag(
    merged,
    /<link\b(?=[^>]*\brel\s*=\s*(["'])canonical\1)[^>]*>/gi,
    'href',
    target,
  );
  if (!found) merged = merged.replace(closeHead, `<link rel="canonical" href="${escapeAttribute(target)}">$&`);

  [merged, found] = forceTag(
    merged,
    /<meta\b(?=[^>]*\bproperty\s*=\s*(["'])og:url\1)[^>]*>/gi,
    'content',
    target,
  );
  if (!found) merged = merged.replace(closeHead, `<meta property="og:url" content="${escapeAttribute(target)}">$&`);

  if (schema) merged = merged.replace(closeHead, `${schema}$&`);
  return merged;
}

export async function landingHtml(env: Env, source: string): Promise<string | null> {
  try {
    const response = await fetch(source, {
      cf: { cacheTtl: 300, cacheEverything: true },
      signal: AbortSignal.timeout(5000),
    });
    const type = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!response.ok || !type.startsWith('text/html')) return null;
    const html = await response.text();
    if (!html) return null;
    return mergeLanding(html, env.PUBLIC_BASE_URL, source, await landingSchema(env));
  } catch {
    return null;
  }
}
