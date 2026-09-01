import { Hono } from 'hono';
import type { Env, User } from '../lib/types';
import { createSession, hashPassword, randomSalt } from '../lib/auth';
import { FREE_LIMITS, PLANS, isAdmin, lifetimeDiscount, offerForSeats, periodKey, playUsage, seatsSold } from '../lib/billing';
import type { OverageRow } from '../lib/overage';
import { closePeriod, collectOverage, previousPeriod, recordOverage } from '../lib/overage';
import { siteTargets, submitChanged } from '../lib/indexnow';
import { syncLifetimePricing } from '../lib/pricing-sync';
import { headBucket, listObjects, sumObjects, validateBucketName } from '../lib/s3';
import {
  bucketView,
  encryptSecret,
  regionFromEndpoint,
  targetFor,
  type StorageBucketRow,
} from '../lib/storage';
import { newId, now } from '../lib/util';

type Vars = { user: User };

export const admin = new Hono<{ Bindings: Env; Variables: Vars }>();

const ASSIGNABLE_PLANS = new Set(Object.keys(PLANS));
const ROLES = new Set(['user', 'admin']);
const PURCHASE_STATUSES = new Set(['pending', 'paid', 'refunded', 'failed']);
const STORAGE_STATUSES = new Set(['active', 'disabled', 'draining']);

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

/* --------------------------------------------------------- storage pool ---- */

function storageError(error: unknown, secrets: string[] = []): string {
  let message = error instanceof Error ? error.message : 'storage provider request failed';
  for (const secret of secrets) {
    if (secret) message = message.split(secret).join('[redacted]');
  }
  return message.slice(0, 300);
}

async function probeStorageTarget(
  target: Parameters<typeof headBucket>[0],
  full = false,
): Promise<{ used: number; objects: number; truncated: boolean }> {
  const head = await headBucket(target);
  if (!head.ok) {
    const message = await head.text().catch(() => '');
    const providerMessage = /<Message>([\s\S]*?)<\/Message>/i.exec(message)?.[1]?.trim();
    throw new Error(providerMessage || message || `provider returned ${head.status}`);
  }
  if (!full) {
    await listObjects(target, { maxKeys: 1, limit: 1 });
    return { used: 0, objects: 0, truncated: false };
  }
  const summary = await sumObjects(target);
  return { used: summary.bytes, objects: summary.count, truncated: summary.truncated };
}

async function storageRow(env: Env, id: string): Promise<StorageBucketRow | null> {
  return env.DB.prepare(
    `SELECT id, label, provider, endpoint, region, bucket_name, bucket_id, key_id, secret_cipher,
            capacity_bytes, used_bytes, object_count, status, last_probe_at, last_error, created_at
       FROM storage_buckets WHERE id = ?`,
  )
    .bind(id)
    .first<StorageBucketRow>();
}

admin.get('/storage', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, label, provider, endpoint, region, bucket_name, bucket_id, key_id, secret_cipher,
            capacity_bytes, used_bytes, object_count, status, last_probe_at, last_error, created_at
       FROM storage_buckets ORDER BY created_at DESC`,
  ).all<StorageBucketRow>();
  const rows = results ?? [];
  return c.json({
    buckets: rows.map(bucketView),
    totals: {
      capacity_bytes: rows.reduce((total, row) => total + (Number(row.capacity_bytes) || 0), 0),
      used_bytes: rows.reduce((total, row) => total + (Number(row.used_bytes) || 0), 0),
      object_count: rows.reduce((total, row) => total + (Number(row.object_count) || 0), 0),
    },
  });
});

admin.post('/storage', async (c) => {
  const body = await c.req.json<{
    label?: string;
    endpoint?: string;
    bucket_name?: string;
    bucket_id?: string;
    key_id?: string;
    application_key?: string;
    capacity_bytes?: number;
  }>();
  const label = (body.label ?? '').trim();
  const endpoint = (body.endpoint ?? '').trim();
  const bucketName = (body.bucket_name ?? '').trim();
  const bucketId = (body.bucket_id ?? '').trim();
  const keyId = (body.key_id ?? '').trim();
  const applicationKey = body.application_key ?? '';
  if (!endpoint || !bucketName || !keyId || !applicationKey) {
    return c.json({ error: 'endpoint, bucket name, key id and application key are required' }, 400);
  }
  try {
    validateBucketName(bucketName);
  } catch (error) {
    return c.json({ error: storageError(error) }, 400);
  }
  let region: string;
  try {
    region = regionFromEndpoint(endpoint);
  } catch (error) {
    return c.json({ error: storageError(error) }, 400);
  }
  const capacity = body.capacity_bytes === undefined ? 0 : Number(body.capacity_bytes);
  if (!Number.isFinite(capacity) || capacity < 0) return c.json({ error: 'capacity must be a non-negative number' }, 400);
  try {
    await probeStorageTarget({ endpoint, region, bucket: bucketName, keyId, secret: applicationKey });
    const secretCipher = await encryptSecret(c.env, applicationKey);
    const id = newId('bucket');
    const created = now();
    await c.env.DB.prepare(
      `INSERT INTO storage_buckets
       (id, label, provider, endpoint, region, bucket_name, bucket_id, key_id, secret_cipher,
        capacity_bytes, used_bytes, object_count, status, last_probe_at, last_error, created_at)
       VALUES (?, ?, 'b2', ?, ?, ?, ?, ?, ?, ?, 0, 0, 'active', ?, '', ?)`,
    )
      .bind(id, label, endpoint, region, bucketName, bucketId, keyId, secretCipher, Math.floor(capacity), created, created)
      .run();
    await audit(c.env, c.get('user'), 'storage.create', id, { label, endpoint, bucket: bucketName });
    const row = await storageRow(c.env, id);
    return c.json({ bucket: row ? bucketView(row) : null }, 201);
  } catch (error) {
    const message = storageError(error, [applicationKey]);
    if (message === 'storage encryption key is not configured') return c.json({ error: message }, 503);
    if (message.includes('UNIQUE') || message.includes('unique')) return c.json({ error: 'that storage bucket is already registered' }, 409);
    return c.json({ error: message }, 400);
  }
});

admin.post('/storage/:id/probe', async (c) => {
  const id = c.req.param('id');
  const row = await storageRow(c.env, id);
  if (!row) return c.json({ error: 'no such storage bucket' }, 404);
  const probedAt = now();
  try {
    const target = await targetFor(c.env, row);
    const stats = await probeStorageTarget(target, true);
    const lastError = stats.truncated ? 'object listing truncated after 200 pages' : '';
    await c.env.DB.prepare(
      'UPDATE storage_buckets SET used_bytes = ?, object_count = ?, last_probe_at = ?, last_error = ? WHERE id = ?',
    )
      .bind(stats.used, stats.objects, probedAt, lastError, id)
      .run();
    await audit(c.env, c.get('user'), 'storage.probe', id, {
      endpoint: row.endpoint,
      objects: stats.objects,
      truncated: stats.truncated,
    });
    const updated = await storageRow(c.env, id);
    return c.json({ bucket: updated ? bucketView(updated) : null });
  } catch (error) {
    const message = storageError(error);
    await c.env.DB.prepare('UPDATE storage_buckets SET last_probe_at = ?, last_error = ? WHERE id = ?')
      .bind(probedAt, message, id)
      .run();
    await audit(c.env, c.get('user'), 'storage.probe', id, { endpoint: row.endpoint, error: message });
    if (message === 'storage encryption key is not configured') return c.json({ error: message }, 503);
    return c.json({ error: message }, 400);
  }
});

admin.patch('/storage/:id', async (c) => {
  const id = c.req.param('id');
  const row = await storageRow(c.env, id);
  if (!row) return c.json({ error: 'no such storage bucket' }, 404);
  const body = await c.req.json<{ label?: string; capacity_bytes?: number; status?: string }>();
  const sets: string[] = [];
  const values: (string | number)[] = [];
  if (body.label !== undefined) {
    sets.push('label = ?');
    values.push(body.label.trim());
  }
  if (body.capacity_bytes !== undefined) {
    const capacity = Number(body.capacity_bytes);
    if (!Number.isFinite(capacity) || capacity < 0) return c.json({ error: 'capacity must be a non-negative number' }, 400);
    sets.push('capacity_bytes = ?');
    values.push(Math.floor(capacity));
  }
  if (body.status !== undefined) {
    if (!STORAGE_STATUSES.has(body.status)) return c.json({ error: 'status must be active, disabled or draining' }, 400);
    sets.push('status = ?');
    values.push(body.status);
  }
  if (!sets.length) return c.json({ error: 'nothing to update' }, 400);
  values.push(id);
  await c.env.DB.prepare(`UPDATE storage_buckets SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();
  await audit(c.env, c.get('user'), 'storage.update', id, { label: body.label, capacity_bytes: body.capacity_bytes, status: body.status });
  const updated = await storageRow(c.env, id);
  return c.json({ bucket: updated ? bucketView(updated) : null });
});

admin.post('/storage/:id/rotate', async (c) => {
  const id = c.req.param('id');
  const row = await storageRow(c.env, id);
  if (!row) return c.json({ error: 'no such storage bucket' }, 404);
  const body = await c.req.json<{ key_id?: string; application_key?: string }>();
  const keyId = (body.key_id ?? '').trim();
  const applicationKey = body.application_key ?? '';
  if (!keyId || !applicationKey) return c.json({ error: 'key id and application key are required' }, 400);
  try {
    await probeStorageTarget({
      endpoint: row.endpoint,
      region: row.region,
      bucket: row.bucket_name,
      keyId,
      secret: applicationKey,
    });
    const secretCipher = await encryptSecret(c.env, applicationKey);
    await c.env.DB.prepare('UPDATE storage_buckets SET key_id = ?, secret_cipher = ?, last_error = ? WHERE id = ?')
      .bind(keyId, secretCipher, '', id)
      .run();
    await audit(c.env, c.get('user'), 'storage.rotate', id, { endpoint: row.endpoint, bucket: row.bucket_name });
    const updated = await storageRow(c.env, id);
    return c.json({ bucket: updated ? bucketView(updated) : null });
  } catch (error) {
    const message = storageError(error, [applicationKey]);
    if (message === 'storage encryption key is not configured') return c.json({ error: message }, 503);
    return c.json({ error: message }, 400);
  }
});

admin.delete('/storage/:id', async (c) => {
  const id = c.req.param('id');
  const row = await storageRow(c.env, id);
  if (!row) return c.json({ error: 'no such storage bucket' }, 404);
  const objects = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM media_objects WHERE bucket_id = ?')
    .bind(id)
    .first<{ n: number }>();
  if (Number(row.object_count) > 0 || Number(objects?.n ?? 0) > 0) {
    return c.json({ error: 'storage bucket is not empty; drain it before deleting' }, 409);
  }
  await c.env.DB.prepare('DELETE FROM storage_buckets WHERE id = ?').bind(id).run();
  await audit(c.env, c.get('user'), 'storage.delete', id, { endpoint: row.endpoint, bucket: row.bucket_name });
  return c.json({ ok: true });
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
    offer: offerForSeats(await seatsSold(c.env), lifetimeDiscount(c.env)),
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
    `SELECT id, email, name, plan, role, unlimited, suspended, notes, created_at, lifetime_at,
            subscription_id, plan_renews_at
       FROM users WHERE id = ?`,
  )
    .bind(id)
    .first<{ id: string; plan: string; role: string; unlimited: number }>();
  if (!user) return c.json({ error: 'no such user' }, 404);
  const plays = await playUsage(c.env, user);
  const videos = await c.env.DB.prepare(
    'SELECT id, slug, title, source_type, source_ref, fallback_ref, visibility, created_at FROM videos WHERE user_id = ? ORDER BY created_at DESC',
  )
    .bind(id)
    .all();
  const purchases = await c.env.DB.prepare(
    'SELECT id, provider, provider_ref, status, amount_cents, currency, created_at FROM purchases WHERE user_id = ? ORDER BY created_at DESC',
  )
    .bind(id)
    .all();
  return c.json({ user, plays, videos: videos.results ?? [], purchases: purchases.results ?? [] });
});

admin.post('/users', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string; name?: string; plan?: string; role?: string }>();
  const email = (body.email ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ error: 'invalid email' }, 400);
  if (!body.password || body.password.length < 8) return c.json({ error: 'password must be at least 8 characters' }, 400);
  const plan = ASSIGNABLE_PLANS.has(body.plan ?? '') ? (body.plan as string) : 'free';
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
    if (!ASSIGNABLE_PLANS.has(body.plan)) {
      return c.json({ error: `plan must be one of ${[...ASSIGNABLE_PLANS].join(', ')}` }, 400);
    }
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
    `SELECT v.id, v.slug, v.title, v.source_type, v.source_ref, v.fallback_ref, v.visibility, v.created_at,
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

/* -------------------------------------------------------------- pricing ---- */

/**
 * Push the advertised lifetime price to the payment provider now, rather than
 * waiting for the nightly run — for the minute after a price is changed and
 * deployed, when someone may already be at the payment page.
 */
admin.post('/pricing/sync', async (c) => {
  const outcome = await syncLifetimePricing(c.env);
  if (outcome.changed.length || !outcome.ok) {
    await audit(c.env, c.get('user'), 'pricing.sync', 'lifetime', { ...outcome });
  }
  return c.json(outcome, outcome.ok ? 200 : 502);
});

/**
 * Announce every public URL to the IndexNow engines now. Pages whose modified
 * date has not moved since their last announcement are skipped, so pressing this
 * twice costs one request and no goodwill.
 */
admin.post('/indexnow', async (c) => {
  const report = await submitChanged(c.env, await siteTargets(c.env));
  if (report.submitted.length) {
    await audit(c.env, c.get('user'), 'indexnow.submit', 'site', { urls: report.submitted.length });
  }
  return c.json(report);
});

/* -------------------------------------------------------------- overage ---- */

/** Everything owed or collected for extra plays, newest period first. */
admin.get('/overage', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT o.*, u.email AS user_email, u.plan AS user_plan, u.plan_renews_at
       FROM overage_charges o JOIN users u ON u.id = o.user_id
      ORDER BY o.period DESC, o.created_at DESC
      LIMIT 300`,
  ).all();
  const owed = await c.env.DB.prepare(
    "SELECT COALESCE(SUM(amount_cents), 0) AS n FROM overage_charges WHERE status IN ('pending', 'failed', 'manual')",
  ).first<{ n: number }>();
  const collected = await c.env.DB.prepare(
    "SELECT COALESCE(SUM(amount_cents), 0) AS n FROM overage_charges WHERE status = 'paid'",
  ).first<{ n: number }>();
  return c.json({
    charges: results ?? [],
    owed_cents: owed?.n ?? 0,
    collected_cents: collected?.n ?? 0,
    current_period: periodKey(),
    last_closed_period: previousPeriod(),
  });
});

/** Run the month close by hand, for a period of the admin's choosing. */
admin.post('/overage/close', async (c) => {
  const { period } = await c.req.json<{ period?: string }>().catch(() => ({ period: undefined }));
  const target = /^\d{4}-\d{2}$/.test(period ?? '') ? (period as string) : previousPeriod();
  if (target >= periodKey()) return c.json({ error: 'that period has not closed yet' }, 400);
  const summary = await closePeriod(c.env, target);
  await audit(c.env, c.get('user'), 'overage.close', target, { ...summary });
  return c.json({ ok: true, summary });
});

/** Record what a single account owes for a period without waiting for the cron. */
admin.post('/overage/users/:id', async (c) => {
  const id = c.req.param('id');
  const { period } = await c.req.json<{ period?: string }>().catch(() => ({ period: undefined }));
  const target = /^\d{4}-\d{2}$/.test(period ?? '') ? (period as string) : previousPeriod();
  const account = await c.env.DB.prepare(
    'SELECT id, plan, role, unlimited, subscription_id FROM users WHERE id = ?',
  )
    .bind(id)
    .first<{ id: string; plan: string; role: string; unlimited: number; subscription_id: string }>();
  if (!account) return c.json({ error: 'no such user' }, 404);
  const row = await recordOverage(c.env, account, target);
  if (!row) return c.json({ error: 'that account owes nothing for that period' }, 400);
  await audit(c.env, c.get('user'), 'overage.record', id, { period: target, amount_cents: row.amount_cents });
  return c.json({ charge: row });
});

/** Charge or retry a recorded overage against the account's subscription. */
admin.post('/overage/:id/charge', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM overage_charges WHERE id = ?')
    .bind(c.req.param('id'))
    .first<OverageRow>();
  if (!row) return c.json({ error: 'no such charge' }, 404);
  if (row.status === 'paid') return c.json({ error: 'that period is already collected' }, 409);
  if (row.status === 'waived') return c.json({ error: 'that period was waived' }, 409);
  const outcome = await collectOverage(c.env, row);
  await audit(c.env, c.get('user'), 'overage.charge', row.id, {
    period: row.period,
    amount_cents: row.amount_cents,
    ...outcome,
  });
  return c.json({ ok: outcome.status === 'paid', ...outcome });
});

/** Write a period off. A waived row is never charged again. */
admin.post('/overage/:id/waive', async (c) => {
  const id = c.req.param('id');
  const { note } = await c.req.json<{ note?: string }>().catch(() => ({ note: '' }));
  const row = await c.env.DB.prepare('SELECT id, status, period, user_id FROM overage_charges WHERE id = ?')
    .bind(id)
    .first<{ id: string; status: string; period: string; user_id: string }>();
  if (!row) return c.json({ error: 'no such charge' }, 404);
  if (row.status === 'paid') return c.json({ error: 'that period is already collected' }, 409);
  await c.env.DB.prepare("UPDATE overage_charges SET status = 'waived', error = ?, updated_at = ? WHERE id = ?")
    .bind((note ?? '').slice(0, 300), now(), id)
    .run();
  await audit(c.env, c.get('user'), 'overage.waive', id, { period: row.period, user_id: row.user_id, note: note ?? '' });
  return c.json({ ok: true });
});

/** Correct a metered play count, e.g. after removing bot traffic. */
admin.post('/usage/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ period?: string; plays?: number }>();
  const period = /^\d{4}-\d{2}$/.test(body.period ?? '') ? (body.period as string) : periodKey();
  const plays = Math.max(0, Math.floor(Number(body.plays)));
  if (!Number.isFinite(plays)) return c.json({ error: 'plays must be a number' }, 400);
  const target = await c.env.DB.prepare('SELECT id, email FROM users WHERE id = ?')
    .bind(id)
    .first<{ id: string; email: string }>();
  if (!target) return c.json({ error: 'no such user' }, 404);
  await c.env.DB.prepare(
    `INSERT INTO play_usage (user_id, period, plays, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, period) DO UPDATE SET plays = excluded.plays, updated_at = excluded.updated_at`,
  )
    .bind(id, period, plays, now())
    .run();
  await audit(c.env, c.get('user'), 'usage.adjust', id, { email: target.email, period, plays });
  return c.json({ ok: true, period, plays });
});

/* ---------------------------------------------------------------- audit ---- */

admin.get('/audit', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, actor_email, action, target, detail, created_at FROM admin_audit ORDER BY created_at DESC LIMIT 200',
  ).all();
  return c.json({ audit: results ?? [] });
});
