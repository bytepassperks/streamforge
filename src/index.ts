import { Hono } from 'hono';
import type { Env } from './lib/types';
import { closePeriod, previousPeriod } from './lib/overage';
import { canonicalRedirect } from './lib/util';
import { api } from './routes/api';
import { plugin } from './routes/plugin';
import { pub } from './routes/public';

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

// Public viewer routes are registered first: they own a few /api/* paths
// (embed config, tracking, lead capture) that must stay session-free.
app.route('/', pub);
// Key-authenticated integration API, mounted before the session API so it is
// never subject to the cookie check.
app.route('/api/v1', plugin);
app.route('/api', api);

app.get('/healthz', (c) => c.json({ ok: true, service: 'videokr' }));

// Anything not handled above falls through to the static assets bundle.
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

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
