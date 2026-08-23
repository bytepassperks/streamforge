import { Hono } from 'hono';
import type { Env } from './lib/types';
import { closePeriod, previousPeriod } from './lib/overage';
import { canonicalRedirect } from './lib/util';
import { api } from './routes/api';
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

// Crawler-facing resources are cheap and must never be shadowed by an asset.
app.route('/', seo);

// Public viewer routes are registered first: they own a few /api/* paths
// (embed config, tracking, lead capture) that must stay session-free.
app.route('/', pub);
// Key-authenticated integration API, mounted before the session API so it is
// never subject to the cookie check.
app.route('/api/v1', plugin);
app.route('/api', api);

app.get('/healthz', (c) => c.json({ ok: true, service: 'videokr' }));

// Anything not handled above falls through to the static assets bundle.
app.all('*', async (c) => {
  const response = await c.env.ASSETS.fetch(c.req.raw);
  return withAssetHeaders(c.req.path, response);
});

/** Signed-in surfaces are behind a session, so an indexed copy is only ever noise. */
const UNINDEXED_ASSETS = new Set(['/app.html', '/admin.html', '/login.html', '/reset.html']);
/** Immutable in practice: brand art, the player runtime and the fonts it draws in. */
const LONG_CACHE = /^\/(brand|fonts|player)\//;

function withAssetHeaders(path: string, response: Response): Response {
  const headers = new Headers(response.headers);
  if (UNINDEXED_ASSETS.has(path)) {
    headers.set('x-robots-tag', 'noindex, nofollow');
    headers.set('cache-control', 'private, no-store');
  } else if (LONG_CACHE.test(path)) {
    headers.set('cache-control', 'public, max-age=604800, stale-while-revalidate=86400');
  } else if (path.endsWith('.css') || path.endsWith('.js') || path.endsWith('.webmanifest')) {
    headers.set('cache-control', 'public, max-age=86400, stale-while-revalidate=604800');
  } else if (path === '/' || path.endsWith('.html')) {
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
   */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(closePeriod(env, previousPeriod()));
  },
};
