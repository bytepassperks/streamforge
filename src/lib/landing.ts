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

// These are the pages that carry plan cards today; extend this set when that changes.
const PLAN_CARD_PATHS = new Set(['/', '/pricing']);
const SIGNUP_CLICK_SCRIPT =
  '<script>document.addEventListener("click",function(e){var t=e.target;var a=t&&t.closest?t.closest("a[data-videokr-signup]"):null;if(!a)return;e.preventDefault();e.stopPropagation();window.location.assign(a.getAttribute("href"));},true);</script>';

function rewriteSignupCtas(html: string, base: string, path: string): [string, number] {
  const contactHref = /href\s*=\s*(["'])\.\/contact\1/gi;
  const contactAnchor =
    /<a\b(?=[^>]*\bhref\s*=\s*(["'])\.\/contact\1)[^>]*>[\s\S]*?<\/a>/gi;
  const contactCount = html.match(contactHref)?.length ?? 0;
  if (!contactCount) return [html, 0];

  const signupUrl = new URL('/login?mode=signup', absoluteBase(base)).toString();
  let rewritten = 0;
  const result = html.replace(contactAnchor, (anchor) => {
    const label = anchor.slice(anchor.indexOf('>') + 1);
    if (!label.includes('Get started')) return anchor;
    rewritten += 1;
    const rewrittenAnchor = anchor.replace(contactHref, `href="${escapeAttribute(signupUrl)}"`);
    return rewrittenAnchor.replace(/^<a\b[^>]*>/i, (opening) =>
      opening.replace(/>$/, ' data-videokr-signup="">'),
    );
  });

  /* Paid-plan CTAs currently point at the contact form; warn if a republish
     changes the markup and silently removes the signup match. */
  if (!rewritten && PLAN_CARD_PATHS.has(path)) {
    console.warn(`[landing] no Get started CTA matched at ${path}`);
  }
  return [result, rewritten];
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

function absolutePath(base: string, path: string): string {
  const site = new URL(base);
  const url = new URL(path || '/', `${site.origin}/`);
  url.search = '';
  url.hash = '';
  /* The request path is attacker-controlled; reject protocol-relative paths
     rather than allowing them to replace the site's origin. */
  return url.origin === site.origin ? url.toString() : absoluteBase(base);
}

export function mergeLanding(
  html: string,
  base: string,
  source: string,
  schema: string,
  path = '/',
): string {
  const closeHead = /<\/head\s*>/i;
  if (!closeHead.test(html)) return html;

  const target = absolutePath(base, path);
  /* Origins, not the full urls: a link the published page writes as
     `<origin>/pricing` has to come out as `<base>/pricing`, so the part being
     swapped must stop before the path. */
  const [rewrittenHtml, rewrittenCtas] = rewriteSignupCtas(
    html.replaceAll(new URL(source).origin, new URL(base).origin),
    base,
    path,
  );
  let merged = rewrittenHtml;
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
  if (rewrittenCtas) {
    const closeBody = /<\/body\s*>/i;
    merged = closeBody.test(merged)
      ? merged.replace(closeBody, `${SIGNUP_CLICK_SCRIPT}$&`)
      : merged.replace(closeHead, `${SIGNUP_CLICK_SCRIPT}$&`);
  }
  return merged;
}

export async function landingHtml(env: Env, source: string, path: string): Promise<string | null> {
  try {
    const sourceOrigin = new URL(source).origin;
    const upstream = new URL(path || '/', `${sourceOrigin}/`);
    upstream.search = '';
    upstream.hash = '';
    /* The request path is attacker-controlled; never fetch a different
       origin, even when URL resolution accepts a protocol-relative path. */
    if (upstream.origin !== sourceOrigin) return null;
    const response = await fetch(upstream, {
      cf: { cacheTtl: 300, cacheEverything: true },
      signal: AbortSignal.timeout(5000),
    });
    const type = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!response.ok || !type.startsWith('text/html')) return null;
    const html = await response.text();
    if (!html) return null;
    const schema = path === '/' ? await landingSchema(env) : '';
    return mergeLanding(html, env.PUBLIC_BASE_URL, source, schema, path);
  } catch {
    return null;
  }
}
