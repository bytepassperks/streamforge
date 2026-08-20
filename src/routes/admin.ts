import { Hono } from 'hono';
import type { Env, User } from '../lib/types';
import { createSession, hashPassword, randomSalt } from '../lib/auth';
import { FREE_LIMITS, isAdmin, offerForSeats, seatsSold } from '../lib/billing';
import { newId, now } from '../lib/util';

type Vars = { user: User };

export const admin = new Hono<{ Bindings: Env; Variables: Vars }>();

const PLANS = new Set(['free', 'lifetime']);
const ROLES = new Set(['user', 'admin']);
const PURCHASE_STATUSES = new Set(['pending', 'paid', 'refunded', 'failed']);

async function audit(
  env: Env,
  actor: User,
  action: string,
  target: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO admin_audit (id, actor_id, actor_email, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(newId('aud'), actor.id, actor.email, action, target, JSON.stringify(detail), now())
    .run();
}

admin.use('*', async (c, next) => {
  const user = c.get('user');
  if (!user || !isAdmin(user)) return c.json({ error: 'forbidden' }, 403);
  await next();
});

/* ------------------------------------------------------------- overview ---- */

admin.get('/overview', async (c) => {
  const single = async (sql: string): Promise<number> => {
    const row = await c.env.DB.prepare(sql).first<{ n: number }>();
    return row?.n ?? 0;
  };
  const monthAgo = now() - 60 * 60 * 24 * 30;
  const [users, lifetime, unlimitedUsers, suspended, videos, playlists, leads, plays, plays30, paid, revenue] =
    await Promise.all([
      single('SELECT COUNT(*) AS n FROM users'),
      single("SELECT COUNT(*) AS n FROM users WHERE plan = 'lifetime'"),
      single('SELECT COUNT(*) AS n FROM users WHERE unlimited = 1'),
      single('SELECT COUNT(*) AS n FROM users WHERE suspended = 1'),
      single('SELECT COUNT(*) AS n FROM videos'),
      single('SELECT COUNT(*) AS n FROM playlists'),
      single('SELECT COUNT(*) AS n FROM leads'),
      single("SELECT COUNT(*) AS n FROM events WHERE kind = 'play'"),
      single(`SELECT COUNT(*) AS n FROM events WHERE kind = 'play' AND created_at >= ${monthAgo}`),
      single("SELECT COUNT(*) AS n FROM purchases WHERE status = 'paid'"),
      single("SELECT COALESCE(SUM(amount_cents), 0) AS n FROM purchases WHERE status = 'paid'"),
    ]);
  return c.json({
    users,
    lifetime,
    unlimited: unlimitedUsers,
    suspended,
    videos,
    playlists,
    leads,
    plays,
    plays_30d: plays30,
    paid_purchases: paid,
    revenue_cents: revenue,
    offer: offerForSeats(await seatsSold(c.env)),
    free_limits: FREE_LIMITS,
  });
});

/* ---------------------------------------------------------------- users ---- */

admin.get('/users', async (c) => {
  const q = `%${(c.req.query('q') ?? '').trim().toLowerCase()}%`;
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.plan, u.role, u.unlimited, u.suspended, u.notes,
            u.created_at, u.lifetime_at,
            (SELECT COUNT(*) FROM videos v WHERE v.user_id = u.id) AS videos,
            (SELECT COUNT(*) FROM leads l WHERE l.user_id = u.id) AS leads,
            (SELECT COUNT(*) FROM purchases p WHERE p.user_id = u.id AND p.status = 'paid') AS paid
       FROM users u
      WHERE lower(u.email) LIKE ? OR lower(u.name) LIKE ?
      ORDER BY u.created_at DESC
      LIMIT 200`,
  )
    .bind(q, q)
    .all();
  return c.json({ users: results ?? [] });
});

admin.get('/users/:id', async (c) => {
  const id = c.req.param('id');
  const user = await c.env.DB.prepare(
    `SELECT id, email, name, plan, role, unlimited, suspended, notes, created_at, lifetime_at
       FROM users WHERE id = ?`,
  )
    .bind(id)
    .first();
  if (!user) return c.json({ error: 'no such user' }, 404);
  const videos = await c.env.DB.prepare(
    'SELECT id, slug, title, source_type, visibility, created_at FROM videos WHERE user_id = ? ORDER BY created_at DESC',
  )
    .bind(id)
    .all();
  const purchases = await c.env.DB.prepare(
    'SELECT id, provider, provider_ref, status, amount_cents, currency, created_at FROM purchases WHERE user_id = ? ORDER BY created_at DESC',
  )
    .bind(id)
    .all();
  return c.json({ user, videos: videos.results ?? [], purchases: purchases.results ?? [] });
});

admin.post('/users', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string; name?: string; plan?: string; role?: string }>();
  const email = (body.email ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ error: 'invalid email' }, 400);
  if (!body.password || body.password.length < 8) return c.json({ error: 'password must be at least 8 characters' }, 400);
  const plan = PLANS.has(body.plan ?? '') ? (body.plan as string) : 'free';
  const role = ROLES.has(body.role ?? '') ? (body.role as string) : 'user';
  const exists = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (exists) return c.json({ error: 'an account with that email already exists' }, 409);
  const id = newId('usr');
  const salt = randomSalt();
  const hash = await hashPassword(body.password, salt);
  const ts = now();
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, name, password_hash, password_salt, plan, created_at, role, unlimited, suspended, notes, lifetime_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, '', ?)`,
  )
    .bind(id, email, (body.name ?? '').trim(), hash, salt, plan, ts, role, plan === 'lifetime' ? ts : 0)
    .run();
  await audit(c.env, c.get('user'), 'user.create', id, { email, plan, role });
  return c.json({ user: { id, email, plan, role } }, 201);
});

admin.patch('/users/:id', async (c) => {
  const id = c.req.param('id');
  const actor = c.get('user');
  const body = await c.req.json<{
    plan?: string;
    role?: string;
    unlimited?: boolean;
    suspended?: boolean;
    name?: string;
    notes?: string;
  }>();
  const target = await c.env.DB.prepare('SELECT id, email, plan, role FROM users WHERE id = ?')
    .bind(id)
    .first<{ id: string; email: string; plan: string; role: string }>();
  if (!target) return c.json({ error: 'no such user' }, 404);

  const sets: string[] = [];
  const binds: (string | number)[] = [];
  const changed: Record<string, unknown> = {};

  if (body.plan !== undefined) {
    if (!PLANS.has(body.plan)) return c.json({ error: 'plan must be free or lifetime' }, 400);
    sets.push('plan = ?');
    binds.push(body.plan);
    sets.push('lifetime_at = ?');
    binds.push(body.plan === 'lifetime' ? now() : 0);
    changed.plan = body.plan;
  }
  if (body.role !== undefined) {
    if (!ROLES.has(body.role)) return c.json({ error: 'role must be user or admin' }, 400);
    if (target.id === actor.id && body.role !== 'admin') {
      return c.json({ error: 'you cannot remove your own admin role' }, 400);
    }
    sets.push('role = ?');
    binds.push(body.role);
    changed.role = body.role;
  }
  if (body.unlimited !== undefined) {
    sets.push('unlimited = ?');
    binds.push(body.unlimited ? 1 : 0);
    changed.unlimited = Boolean(body.unlimited);
  }
  if (body.suspended !== undefined) {
    if (target.id === actor.id && body.suspended) return c.json({ error: 'you cannot suspend yourself' }, 400);
    sets.push('suspended = ?');
    binds.push(body.suspended ? 1 : 0);
    changed.suspended = Boolean(body.suspended);
  }
  if (body.name !== undefined) {
    sets.push('name = ?');
    binds.push(body.name.trim());
    changed.name = body.name.trim();
  }
  if (body.notes !== undefined) {
    sets.push('notes = ?');
    binds.push(body.notes);
    changed.notes = true;
  }
  if (!sets.length) return c.json({ error: 'nothing to update' }, 400);

  binds.push(id);
  await c.env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run();
  if (changed.suspended === true) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
  }
  await audit(c.env, actor, 'user.update', id, { email: target.email, ...changed });
  return c.json({ ok: true, changed });
});

admin.post('/users/:id/password', async (c) => {
  const id = c.req.param('id');
  const { password } = await c.req.json<{ password?: string }>();
  if (!password || password.length < 8) return c.json({ error: 'password must be at least 8 characters' }, 400);
  const target = await c.env.DB.prepare('SELECT id, email FROM users WHERE id = ?')
    .bind(id)
    .first<{ id: string; email: string }>();
  if (!target) return c.json({ error: 'no such user' }, 404);
  const salt = randomSalt();
  const hash = await hashPassword(password, salt);
  await c.env.DB.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?')
    .bind(hash, salt, id)
    .run();
  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
  await audit(c.env, c.get('user'), 'user.password', id, { email: target.email });
  return c.json({ ok: true });
});

admin.delete('/users/:id', async (c) => {
  const id = c.req.param('id');
  const actor = c.get('user');
  if (id === actor.id) return c.json({ error: 'you cannot delete your own account' }, 400);
  const target = await c.env.DB.prepare('SELECT id, email FROM users WHERE id = ?')
    .bind(id)
    .first<{ id: string; email: string }>();
  if (!target) return c.json({ error: 'no such user' }, 404);
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  await audit(c.env, actor, 'user.delete', id, { email: target.email });
  return c.json({ ok: true });
});

/** Sign in as another account to reproduce what they see. */
admin.post('/users/:id/impersonate', async (c) => {
  const id = c.req.param('id');
  const target = await c.env.DB.prepare('SELECT id, email FROM users WHERE id = ?')
    .bind(id)
    .first<{ id: string; email: string }>();
  if (!target) return c.json({ error: 'no such user' }, 404);
  await audit(c.env, c.get('user'), 'user.impersonate', id, { email: target.email });
  await createSession(c, id);
  return c.json({ ok: true, email: target.email });
});

/* --------------------------------------------------------------- videos ---- */

admin.get('/videos', async (c) => {
  const q = `%${(c.req.query('q') ?? '').trim().toLowerCase()}%`;
  const { results } = await c.env.DB.prepare(
    `SELECT v.id, v.slug, v.title, v.source_type, v.visibility, v.created_at,
            u.email AS owner_email, u.id AS owner_id,
            (SELECT COUNT(*) FROM events e WHERE e.video_id = v.id AND e.kind = 'play') AS plays
       FROM videos v JOIN users u ON u.id = v.user_id
      WHERE lower(v.title) LIKE ? OR lower(v.slug) LIKE ? OR lower(u.email) LIKE ?
      ORDER BY v.created_at DESC
      LIMIT 200`,
  )
    .bind(q, q, q)
    .all();
  return c.json({ videos: results ?? [] });
});

admin.delete('/videos/:id', async (c) => {
  const id = c.req.param('id');
  const video = await c.env.DB.prepare('SELECT id, slug FROM videos WHERE id = ?')
    .bind(id)
    .first<{ id: string; slug: string }>();
  if (!video) return c.json({ error: 'no such video' }, 404);
  await c.env.DB.prepare('DELETE FROM videos WHERE id = ?').bind(id).run();
  await audit(c.env, c.get('user'), 'video.delete', id, { slug: video.slug });
  return c.json({ ok: true });
});

/* ------------------------------------------------------------ purchases ---- */

admin.get('/purchases', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.status, p.provider, p.provider_ref, p.amount_cents, p.currency, p.created_at,
            u.email AS user_email, u.id AS user_id
       FROM purchases p JOIN users u ON u.id = p.user_id
      ORDER BY p.created_at DESC LIMIT 200`,
  ).all();
  return c.json({ purchases: results ?? [] });
});

/** Manual ledger control: mark a purchase paid/refunded and move the plan with it. */
admin.patch('/purchases/:id', async (c) => {
  const id = c.req.param('id');
  const { status, sync_plan } = await c.req.json<{ status?: string; sync_plan?: boolean }>();
  if (!status || !PURCHASE_STATUSES.has(status)) {
    return c.json({ error: 'status must be pending, paid, refunded or failed' }, 400);
  }
  const purchase = await c.env.DB.prepare('SELECT id, user_id FROM purchases WHERE id = ?')
    .bind(id)
    .first<{ id: string; user_id: string }>();
  if (!purchase) return c.json({ error: 'no such purchase' }, 404);
  const ts = now();
  await c.env.DB.prepare('UPDATE purchases SET status = ?, updated_at = ? WHERE id = ?').bind(status, ts, id).run();
  if (sync_plan) {
    if (status === 'paid') {
      await c.env.DB.prepare("UPDATE users SET plan = 'lifetime', lifetime_at = ? WHERE id = ?")
        .bind(ts, purchase.user_id)
        .run();
    } else {
      await c.env.DB.prepare("UPDATE users SET plan = 'free', lifetime_at = 0 WHERE id = ?")
        .bind(purchase.user_id)
        .run();
    }
  }
  await audit(c.env, c.get('user'), 'purchase.update', id, { status, sync_plan: Boolean(sync_plan) });
  return c.json({ ok: true });
});

/** Record an off-platform sale (WhatsApp, UPI, bank transfer) and grant lifetime. */
admin.post('/purchases', async (c) => {
  const body = await c.req.json<{ user_id?: string; amount_cents?: number; currency?: string; note?: string }>();
  const userId = (body.user_id ?? '').trim();
  const target = await c.env.DB.prepare('SELECT id, email FROM users WHERE id = ?')
    .bind(userId)
    .first<{ id: string; email: string }>();
  if (!target) return c.json({ error: 'no such user' }, 404);
  const id = newId('pur');
  const ts = now();
  await c.env.DB.prepare(
    `INSERT INTO purchases (id, user_id, provider, provider_ref, status, amount_cents, currency, created_at, updated_at)
     VALUES (?, ?, 'manual', ?, 'paid', ?, ?, ?, ?)`,
  )
    .bind(id, userId, id, Math.max(0, Number(body.amount_cents) || 0), (body.currency ?? 'USD').toUpperCase(), ts, ts)
    .run();
  await c.env.DB.prepare("UPDATE users SET plan = 'lifetime', lifetime_at = ? WHERE id = ?").bind(ts, userId).run();
  await audit(c.env, c.get('user'), 'purchase.manual', id, {
    email: target.email,
    amount_cents: body.amount_cents ?? 0,
    note: body.note ?? '',
  });
  return c.json({ purchase: { id } }, 201);
});

/* ---------------------------------------------------------------- audit ---- */

admin.get('/audit', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, actor_email, action, target, detail, created_at FROM admin_audit ORDER BY created_at DESC LIMIT 200',
  ).all();
  return c.json({ audit: results ?? [] });
});
