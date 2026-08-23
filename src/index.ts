import { Hono } from 'hono';
import type { Env } from './lib/types';
import { isStamped, stampHtml } from './lib/assets';
import { closePeriod, previousPeriod } from './lib/overage';
import { syncLifetimePricing } from './lib/pricing-sync';
import { canonicalRedirect } from './lib/util';
import { api } from './routes/api';
import { content } from './routes/content';
import { plugin } from './routes/plugin';
import { pub } from './routes/public';
import { seo } from './routes/seo';

const app = new Hono<{ Bindings: Env }>();

// One canonical host. The old workers.dev name keeps serving so embeds and
// installed plugins never break, but it sends every request on to the domain so
// links, cookies and analytics all belong to one origin.
app.use('*', async (c, next) => {
  const target = canonicalRedirect(c.req.url, c.env.PUBLIC_BASE_URL);
  if (!target) return next();
  const method = c.req.method;
  return c.redirect(target, method === 'GET' || method === 'HEAD' ? 301 : 308);
});

/* Server-rendered HTML (a video page, an embed frame, a guide) is regenerated on
   every request and carries stamped assets, so it must be revalidated rather
   than left to whatever default an intermediary picks. */
app.use('*', async (c, next) => {
  await next();
  const type = c.res.headers.get('content-type');
  if (type?.includes('text/html') && !c.res.headers.get('cache-control')) {
    c.res.headers.set('cache-control', 'public, max-age=0, must-revalidate');
  }
});

// Crawler-facing resources are cheap and must never be shadowed by an asset.
app.route('/', seo);

// Docs, guides, comparisons and the blog: server-rendered from the content
// library, so they cannot be shadowed by a static asset of the same name.
app.route('/', content);

// Public viewer routes are registered first: they own a few /api/* paths
// (embed config, tracking, lead capture) that must stay session-free.
app.route('/', pub);
// Key-authenticated integration API, mounted before the session API so it is
// never subject to the cookie check.
app.route('/api/v1', plugin);
app.route('/api', api);

app.get('/healthz', (c) => c.json({ ok: true, service: 'videokr' }));

/* Browsers ask for this path on any page that does not name an icon — an embed
   in someone else's iframe, a bare error page — and a 404 for it is a failed
   request in every one of their consoles. */
app.get('/favicon.ico', async (c) => {
  const icon = new URL(c.req.url);
  icon.pathname = '/brand/mark-32.png';
  icon.search = '';
  const response = await c.env.ASSETS.fetch(new Request(icon.toString(), { headers: c.req.raw.headers }));
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'public, max-age=604800, stale-while-revalidate=86400');
  return new Response(response.body, { status: response.status, headers });
});

// Anything not handled above falls through to the static assets bundle.
app.all('*', async (c) => {
  const response = await c.env.ASSETS.fetch(c.req.raw);
  const path = c.req.path;
  /* Content type, not the path: the assets layer redirects `/login.html` to the
     extensionless `/login`, so an HTML page arrives here with no extension to
     match on, and it still needs its stamps and its headers. */
  const isHtml = Boolean(response.headers.get('content-type')?.includes('text/html'));
  if (isHtml && response.ok) {
    const html = stampHtml(await response.text());
    return withAssetHeaders(path, new Response(html, { status: response.status, headers: response.headers }), c.req.query('v'), true);
  }
  return withAssetHeaders(path, response, c.req.query('v'), isHtml);
});

/** Signed-in surfaces are behind a session, so an indexed copy is only ever noise. */
const UNINDEXED_ASSETS = new Set(['/app', '/admin', '/login', '/reset']);

/** `/login.html` and `/login` are the same page; both must stay out of an index. */
function isUnindexed(path: string): boolean {
  return UNINDEXED_ASSETS.has(path.replace(/\.html$/, ''));
}
/** Immutable in practice: brand art, the player runtime and the fonts it draws in. */
const LONG_CACHE = /^\/(brand|fonts|player)\//;

function withAssetHeaders(path: string, response: Response, version?: string, isHtml = false): Response {
  const headers = new Headers(response.headers);
  if (isUnindexed(path)) {
    headers.set('x-robots-tag', 'noindex, nofollow');
    headers.set('cache-control', 'private, no-store');
  } else if (isStamped(path, version)) {
    // The URL carries this exact file's content hash, so it can be kept for a
    // year: a change to the file changes the URL every page asks for.
    headers.set('cache-control', 'public, max-age=31536000, immutable');
  } else if (LONG_CACHE.test(path)) {
    headers.set('cache-control', 'public, max-age=604800, stale-while-revalidate=86400');
  } else if (path.endsWith('.css') || path.endsWith('.js') || path.endsWith('.webmanifest')) {
    // Reached without a stamp — a hand-typed URL or an old page out of someone's
    // cache. Short TTL so it self-heals rather than pinning last week's file.
    headers.set('cache-control', 'public, max-age=600, stale-while-revalidate=604800');
  } else if (isHtml || path === '/' || path.endsWith('.html')) {
    headers.set('cache-control', 'public, max-age=0, must-revalidate');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  fetch: app.fetch,
  /**
   * Month close. The cron runs daily so a failed collection is retried on the
   * next run without waiting a month; both recording and collection are
   * idempotent per account and period, so extra runs cost nothing.
   *
   * The same run reconciles the payment provider with the price the site
   * quotes, which also carries the seat ladder over: when the hundredth
   * lifetime seat sells and the advertised price steps up, the provider follows
   * without anyone editing it by hand.
   */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(closePeriod(env, previousPeriod()));
    ctx.waitUntil(syncLifetimePricing(env));
  },
};
