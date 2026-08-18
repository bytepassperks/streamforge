import { Hono } from 'hono';
import type { Env } from './lib/types';
import { api } from './routes/api';
import { pub } from './routes/public';

const app = new Hono<{ Bindings: Env }>();

// Public viewer routes are registered first: they own a few /api/* paths
// (embed config, tracking, lead capture) that must stay session-free.
app.route('/', pub);
app.route('/api', api);

app.get('/healthz', (c) => c.json({ ok: true, service: 'streamforge' }));

// Anything not handled above falls through to the static assets bundle.
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
