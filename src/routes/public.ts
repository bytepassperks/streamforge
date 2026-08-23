import { Hono } from 'hono';
import type { Chapter, Cta, Env, PlayerConfig, Playlist, Video } from '../lib/types';
import {
  deviceFromUserAgent,
  escapeHtml,
  hostnameAllowed,
  mergePlayerConfig,
  newId,
  now,
  retentionBucket,
} from '../lib/util';
import { stamp } from '../lib/assets';
import { verifyPassword } from '../lib/auth';
import { signAccessToken, verifyAccessToken } from '../lib/tokens';
import { dispatchWebhooks } from '../lib/webhooks';
import { sendMail } from '../lib/email';
import {
  SITE,
  absoluteUrl,
  baseUrl,
  breadcrumbLd,
  graphLd,
  organizationLd,
  videoObjectLd,
  webSiteLd,
} from '../lib/seo';
import {
  countPlay,
  isLifetime,
  offerForSeats,
  planForProduct,
  playUsage,
  seatsSold,
  verifyDodoSignature,
} from '../lib/billing';

export const pub = new Hono<{ Bindings: Env }>();

/**
 * Embeds may be loaded from any customer site, so the config endpoint is CORS
 * open; access control is enforced per video via domain allowlist + password.
 */
pub.use('/api/embed/*', async (c, next) => {
  await next();
  c.header('access-control-allow-origin', '*');
  c.header('access-control-allow-headers', 'content-type');
});

/* ---------------------------------------------------------- lifetime ---- */

/** Seat counter for the landing page — derived from real paid purchases. */
pub.get('/api/public/offer', async (c) => {
  const offer = offerForSeats(await seatsSold(c.env));
  c.header('cache-control', 'public, max-age=60');
  return c.json({ offer });
});

const SUBSCRIPTION_ACTIVE = new Set([
  'subscription.active',
  'subscription.renewed',
  'subscription.plan_changed',
  'subscription.unpaused',
]);
const SUBSCRIPTION_ENDED = new Set([
  'subscription.cancelled',
  'subscription.canceled',
  'subscription.expired',
  'subscription.failed',
  'subscription.on_hold',
  'subscription.paused',
]);
/** `subscription.updated` carries any field change, so it is read from status. */
const ACTIVE_STATUSES = new Set(['active']);
const ENDED_STATUSES = new Set(['cancelled', 'canceled', 'expired', 'failed', 'on_hold', 'paused']);

/**
 * Dodo Payments delivers Standard Webhooks. A verified one-time
 * `payment.succeeded` for the lifetime product grants lifetime; subscription
 * events move the account between the metered plans and back to free when a
 * subscription lapses. A lifetime licence is never revoked by a lapse.
 */
pub.post('/api/billing/dodo/webhook', async (c) => {
  const body = await c.req.text();
  const id = c.req.header('webhook-id') ?? '';
  const verified = await verifyDodoSignature(
    c.env.DODO_WEBHOOK_SECRET ?? '',
    { id, timestamp: c.req.header('webhook-timestamp') ?? '', signature: c.req.header('webhook-signature') ?? '' },
    body,
  );
  if (!verified) return c.json({ error: 'invalid signature' }, 401);

  const seen = await c.env.DB.prepare('SELECT id FROM webhook_events WHERE id = ?').bind(id).first();
  if (seen) return c.json({ ok: true, duplicate: true });

  let event: {
    type?: string;
    data?: {
      payment_id?: string;
      subscription_id?: string;
      product_id?: string;
      next_billing_date?: string;
      product_cart?: { product_id?: string }[];
      metadata?: Record<string, string>;
      total_amount?: number;
      currency?: string;
      customer?: { email?: string };
      status?: string;
    };
  };
  try {
    event = JSON.parse(body);
  } catch {
    return c.json({ error: 'invalid json' }, 400);
  }
  // Recorded only once the payload parses, so a malformed body can be retried.
  await c.env.DB.prepare('INSERT INTO webhook_events (id, received_at) VALUES (?, ?)').bind(id, now()).run();
  const kind = event.type ?? '';
  const data = event.data ?? {};
  const status = (data.status ?? '').toLowerCase();
  const ended =
    SUBSCRIPTION_ENDED.has(kind) || (kind === 'subscription.updated' && ENDED_STATUSES.has(status));
  const active =
    SUBSCRIPTION_ACTIVE.has(kind) || (kind === 'subscription.updated' && ACTIVE_STATUSES.has(status));
  const subscriptionEvent = active || ended;
  if (kind !== 'payment.succeeded' && !subscriptionEvent) return c.json({ ok: true, ignored: kind });

  const userId = data.metadata?.user_id ?? '';
  const email = (data.customer?.email ?? '').trim().toLowerCase();
  const user = userId
    ? await c.env.DB.prepare('SELECT id, plan FROM users WHERE id = ?')
        .bind(userId)
        .first<{ id: string; plan: string }>()
    : email
      ? await c.env.DB.prepare('SELECT id, plan FROM users WHERE email = ?')
          .bind(email)
          .first<{ id: string; plan: string }>()
      : null;
  if (!user) return c.json({ ok: true, unmatched: true });

  const ts = now();

  if (subscriptionEvent) {
    /* Lifetime outranks a subscription, so a lapse can never take it away. */
    if (user.plan === 'lifetime') return c.json({ ok: true, ignored: 'lifetime account' });
    if (ended) {
      await c.env.DB.prepare(
        "UPDATE users SET plan = 'free', subscription_id = '', plan_renews_at = 0 WHERE id = ?",
      )
        .bind(user.id)
        .run();
      return c.json({ ok: true, plan: 'free' });
    }
    const productId = data.product_id ?? data.product_cart?.[0]?.product_id ?? '';
    const plan = data.metadata?.plan ?? planForProduct(c.env, productId) ?? '';
    if (plan !== 'starter' && plan !== 'agency') return c.json({ ok: true, unmatched: 'product' });
    const renews = Date.parse(data.next_billing_date ?? '');
    await c.env.DB.prepare('UPDATE users SET plan = ?, subscription_id = ?, plan_renews_at = ? WHERE id = ?')
      .bind(plan, data.subscription_id ?? '', Number.isNaN(renews) ? 0 : Math.floor(renews / 1000), user.id)
      .run();
    return c.json({ ok: true, plan });
  }

  /* One-time payment: only the lifetime product grants the lifetime licence. */
  const paidProduct = data.product_cart?.[0]?.product_id ?? data.product_id ?? '';
  const paidPlan = data.metadata?.plan ?? planForProduct(c.env, paidProduct) ?? 'lifetime';
  if (paidPlan !== 'lifetime') return c.json({ ok: true, ignored: `payment for ${paidPlan}` });
  await c.env.DB.prepare("UPDATE users SET plan = 'lifetime', lifetime_at = ? WHERE id = ?")
    .bind(ts, user.id)
    .run();
  await c.env.DB.prepare(
    `INSERT INTO purchases (id, user_id, provider, provider_ref, status, amount_cents, currency, created_at, updated_at)
     VALUES (?, ?, 'dodo', ?, 'paid', ?, ?, ?, ?)
     ON CONFLICT(provider, provider_ref) DO UPDATE SET status = 'paid', updated_at = excluded.updated_at`,
  )
    .bind(
      newId('pur'),
      user.id,
      data.payment_id ?? id,
      Math.round(data.total_amount ?? 0),
      (data.currency ?? 'USD').toUpperCase(),
      ts,
      ts,
    )
    .run();
  await c.env.DB.prepare(
    "UPDATE purchases SET status = 'superseded', updated_at = ? WHERE user_id = ? AND status = 'pending'",
  )
    .bind(ts, user.id)
    .run();
  return c.json({ ok: true });
});

function embedderHostname(c: { req: { header: (n: string) => string | undefined } }): string | null {
  const source = c.req.header('referer') || c.req.header('origin') || '';
  if (!source) return null;
  try {
    return new URL(source).hostname;
  } catch {
    return null;
  }
}

async function loadVideoBySlugOrId(env: Env, key: string): Promise<Video | null> {
  return env.DB.prepare('SELECT * FROM videos WHERE id = ? OR slug = ? LIMIT 1')
    .bind(key, key)
    .first<Video>();
}

interface EmbedPayload {
  video: {
    id: string;
    slug: string;
    title: string;
    description: string;
    source_type: string;
    source_ref: string;
    duration: number;
    thumbnail_url: string;
    captions_url: string;
  };
  player: ReturnType<typeof mergePlayerConfig>;
  chapters: Pick<Chapter, 'start_seconds' | 'title'>[];
  ctas: Omit<Cta, 'video_id'>[];
  variant: 'a' | 'b';
  badge: boolean;
  share: { url: string; embed: string };
  related: { slug: string; title: string; thumbnail_url: string; duration: number }[];
  /** The owner is a free account past its monthly play allowance. */
  capped: boolean;
}

function shareLinks(env: Env, slug: string, kind: 'video' | 'playlist' = 'video'): { url: string; embed: string } {
  const base = env.PUBLIC_BASE_URL.replace(/\/$/, '');
  const page = kind === 'video' ? 'v' : 'pl';
  const frame = kind === 'video' ? 'e' : 'ep';
  const height = kind === 'video' ? 360 : 440;
  return {
    url: `${base}/${page}/${slug}`,
    embed: `<iframe src="${base}/${frame}/${slug}" width="640" height="${height}" frameborder="0" allowfullscreen allow="autoplay; picture-in-picture"></iframe>`,
  };
}

async function buildEmbedPayload(env: Env, video: Video, variant: 'a' | 'b'): Promise<EmbedPayload> {
  const chapters = await env.DB.prepare(
    'SELECT start_seconds, title FROM chapters WHERE video_id = ? ORDER BY start_seconds',
  )
    .bind(video.id)
    .all<Pick<Chapter, 'start_seconds' | 'title'>>();
  const ctas = await env.DB.prepare(
    `SELECT id, kind, start_seconds, end_seconds, headline, body, button_text, button_url, fields,
            skippable, position
       FROM ctas WHERE video_id = ? ORDER BY start_seconds`,
  )
    .bind(video.id)
    .all<Omit<Cta, 'video_id'>>();
  const thumbnail = variant === 'b' && video.thumbnail_url_b ? video.thumbnail_url_b : video.thumbnail_url;
  const owner = await env.DB.prepare('SELECT id, plan, role, unlimited FROM users WHERE id = ?')
    .bind(video.user_id)
    .first<{ id: string; plan: string; role: string; unlimited: number }>();
  /* Free accounts stop at their monthly play allowance; paid plans keep serving and
     accrue overage instead, so a customer's audience is never cut off mid-campaign. */
  const usage = owner ? await playUsage(env, owner) : null;
  const player = mergePlayerConfig(video.player_config);
  /* Suggestions are drawn only from the owner's own public library, so a viewer is
     never handed somebody else's video at the end of playback. */
  const related = player.related
    ? await env.DB.prepare(
        `SELECT slug, title, thumbnail_url, duration FROM videos
          WHERE user_id = ? AND id != ? AND visibility = 'public'
          ORDER BY created_at DESC LIMIT 6`,
      )
        .bind(video.user_id, video.id)
        .all<{ slug: string; title: string; thumbnail_url: string; duration: number }>()
    : null;
  return {
    video: {
      id: video.id,
      slug: video.slug,
      title: video.title,
      description: video.description,
      source_type: video.source_type,
      source_ref: video.source_ref,
      duration: video.duration,
      thumbnail_url: thumbnail,
      captions_url: video.captions_url,
    },
    player,
    chapters: chapters.results ?? [],
    ctas: ctas.results ?? [],
    variant,
    badge: !(owner && isLifetime(owner)),
    share: shareLinks(env, video.slug),
    related: related?.results ?? [],
    capped: Boolean(usage?.blocked),
  };
}

/**
 * An embed may carry playback overrides in its URL (`?autoplay=1&muted=1&start=30`),
 * which is what the embed loader and the WordPress plugin emit. An explicit start
 * also turns resume off, otherwise a saved position would win over the request.
 */
function applyEmbedQuery(url: string, player: PlayerConfig): PlayerConfig {
  const params = new URL(url).searchParams;
  const on = (name: string): boolean => {
    const value = params.get(name);
    return value !== null && value !== '0' && value !== 'false';
  };
  if (on('autoplay')) player.autoplay = true;
  if (on('muted')) player.muted = true;
  const start = Number(params.get('start'));
  if (Number.isFinite(start) && start > 0) {
    player.startAt = Math.floor(start);
    player.resume = false;
  }
  return player;
}

pub.get('/api/embed/:key', async (c) => {
  const video = await loadVideoBySlugOrId(c.env, c.req.param('key'));
  if (!video) return c.json({ error: 'not found' }, 404);

  const host = embedderHostname(c);
  if (video.allowed_domains && host && !hostnameAllowed(host, video.allowed_domains)) {
    return c.json({ error: 'this video is not allowed to play on this domain', code: 'domain_blocked' }, 403);
  }

  if (video.visibility === 'password' && video.password_hash) {
    const token = c.req.query('token') ?? '';
    const ok = token && (await verifyAccessToken(video.password_hash, video.id, token));
    if (!ok) return c.json({ error: 'password required', code: 'password_required', title: video.title }, 401);
  }

  const variant: 'a' | 'b' = video.thumbnail_url_b && Math.random() < 0.5 ? 'b' : 'a';
  const payload = await buildEmbedPayload(c.env, video, variant);
  payload.player = applyEmbedQuery(c.req.url, payload.player);
  return c.json(payload);
});

pub.post('/api/embed/:key/unlock', async (c) => {
  const video = await loadVideoBySlugOrId(c.env, c.req.param('key'));
  if (!video) return c.json({ error: 'not found' }, 404);
  if (!video.password_hash) return c.json({ error: 'video is not password protected' }, 400);
  const { password } = await c.req.json<{ password?: string }>();
  const ok = await verifyPassword(password ?? '', video.password_salt, video.password_hash);
  if (!ok) return c.json({ error: 'incorrect password' }, 401);
  return c.json({ token: await signAccessToken(video.password_hash, video.id) });
});

/* -------------------------------------------------------------- tracking --- */

const TRACKED_KINDS = new Set(['load', 'play', 'pause', 'progress', 'complete', 'seek', 'cta_view', 'cta_click']);

pub.post('/api/track', async (c) => {
  const body = await c.req.json<{
    video_id?: string;
    view_id?: string;
    kind?: string;
    position?: number;
    value?: string;
    variant?: string;
    duration?: number;
  }>();
  const kind = String(body.kind ?? '');
  if (!TRACKED_KINDS.has(kind)) return c.json({ error: 'unknown event' }, 400);
  const video = await c.env.DB.prepare('SELECT id, user_id, duration FROM videos WHERE id = ?')
    .bind(String(body.video_id ?? ''))
    .first<{ id: string; user_id: string; duration: number }>();
  if (!video) return c.json({ error: 'not found' }, 404);

  const referrerRaw = c.req.header('referer') ?? '';
  let referrer = '';
  try {
    referrer = referrerRaw ? new URL(referrerRaw).hostname : '';
  } catch {
    referrer = '';
  }
  const position = Number(body.position ?? 0) || 0;
  const duration = Number(body.duration ?? 0) || video.duration;
  const variant = body.variant === 'b' ? 'b' : 'a';

  const statements = [
    c.env.DB.prepare(
      `INSERT INTO events (id, video_id, view_id, kind, position, value, referrer, country, device, variant, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      newId('evt'),
      video.id,
      String(body.view_id ?? 'anon').slice(0, 40),
      kind,
      position,
      String(body.value ?? '').slice(0, 200),
      referrer,
      (c.req.raw as unknown as { cf?: { country?: string } }).cf?.country ?? '',
      deviceFromUserAgent(c.req.header('user-agent') ?? ''),
      variant,
      now(),
    ),
  ];

  if (kind === 'progress' && duration > 0) {
    const bucket = retentionBucket(position, duration);
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO retention (video_id, bucket, views) VALUES (?, ?, 1)
         ON CONFLICT(video_id, bucket) DO UPDATE SET views = views + 1`,
      ).bind(video.id, bucket),
    );
  }
  if (duration > 0 && !(video.duration > 0)) {
    statements.push(
      c.env.DB.prepare('UPDATE videos SET duration = ? WHERE id = ?').bind(duration, video.id),
    );
  }
  await c.env.DB.batch(statements);

  /* The play that crosses a hard-stop allowance has to be refused while it can still
     be stopped, so the counter is claimed inline and the verdict travels back. */
  let capped = false;
  if (kind === 'play') {
    await countPlay(c.env, video.user_id, video.id, String(body.view_id ?? 'anon').slice(0, 40));
    const owner = await c.env.DB.prepare(
      'SELECT id, plan, role, unlimited FROM users WHERE id = ?',
    )
      .bind(video.user_id)
      .first<{ id: string; plan: string; role: string; unlimited: number }>();
    capped = owner ? (await playUsage(c.env, owner)).blocked : false;
  }
  if (kind === 'play' || kind === 'complete' || kind === 'cta_click') {
    c.executionCtx.waitUntil(
      dispatchWebhooks(c.env, video.user_id, kind, { video_id: video.id, position, referrer }),
    );
  }
  return c.json({ ok: true, capped });
});

const LEAD_EMAIL_HOURLY_CAP = 30;

/**
 * Emails the owner a captured lead. A lead is worthless if it sits unseen in a
 * dashboard nobody opened, so this is on by default and turned off per account
 * in Settings; failures stay silent because the viewer already got their 201.
 */
async function notifyOwnerOfLead(
  env: Env,
  video: { id: string; title: string; slug: string; user_id: string },
  lead: { email: string; name: string; phone: string; referrer: string },
): Promise<void> {
  const owner = await env.DB.prepare('SELECT email, name, lead_emails FROM users WHERE id = ?')
    .bind(video.user_id)
    .first<{ email: string; name: string; lead_emails: number }>();
  if (!owner || Number(owner.lead_emails) === 0) return;
  // A public form must never turn into an outbound relay: past a burst in the
  // last hour the leads still land in the dashboard, the mail simply stops.
  const burst = await env.DB.prepare('SELECT COUNT(*) AS n FROM leads WHERE user_id = ? AND created_at > ?')
    .bind(video.user_id, now() - 3600)
    .first<{ n: number }>();
  if (Number(burst?.n ?? 0) > LEAD_EMAIL_HOURLY_CAP) return;
  const base = env.PUBLIC_BASE_URL.replace(/\/$/, '');
  const details = [
    `Email: ${lead.email}`,
    lead.name ? `Name: ${lead.name}` : '',
    lead.phone ? `Phone: ${lead.phone}` : '',
    lead.referrer ? `Watched on: ${lead.referrer}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  await sendMail(env, {
    to: owner.email,
    subject: `New lead from ${video.title || 'your video'}`,
    replyTo: lead.email,
    text: [
      `Someone filled in the form on "${video.title || video.slug}".`,
      details,
      `Every lead for this video: ${base}/app.html#leads`,
      'Reply straight to this email to reach them. Turn these off in Settings whenever you like.',
    ].join('\n\n'),
  });
}

pub.post('/api/leads/:videoId', async (c) => {
  const video = await c.env.DB.prepare('SELECT id, title, slug, user_id FROM videos WHERE id = ?')
    .bind(c.req.param('videoId'))
    .first<{ id: string; title: string; slug: string; user_id: string }>();
  if (!video) return c.json({ error: 'not found' }, 404);
  const body = await c.req.json<{
    email?: string;
    name?: string;
    phone?: string;
    position?: number;
    view_id?: string;
  }>();
  const email = (body.email ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ error: 'a valid email is required' }, 400);

  let referrer = '';
  try {
    const raw = c.req.header('referer') ?? '';
    referrer = raw ? new URL(raw).hostname : '';
  } catch {
    referrer = '';
  }
  const id = newId('led');
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO leads (id, video_id, user_id, email, name, phone, position, referrer, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      video.id,
      video.user_id,
      email,
      (body.name ?? '').trim().slice(0, 120),
      (body.phone ?? '').trim().slice(0, 40),
      Number(body.position ?? 0) || 0,
      referrer,
      now(),
    ),
    c.env.DB.prepare(
      `INSERT INTO events (id, video_id, view_id, kind, position, value, referrer, country, device, variant, created_at)
       VALUES (?, ?, ?, 'lead', ?, ?, ?, '', ?, 'a', ?)`,
    ).bind(
      newId('evt'),
      video.id,
      String(body.view_id ?? 'anon').slice(0, 40),
      Number(body.position ?? 0) || 0,
      email,
      referrer,
      deviceFromUserAgent(c.req.header('user-agent') ?? ''),
      now(),
    ),
  ]);
  c.executionCtx.waitUntil(
    dispatchWebhooks(c.env, video.user_id, 'lead', { lead_id: id, video_id: video.id, email, referrer }),
  );
  c.executionCtx.waitUntil(
    notifyOwnerOfLead(c.env, video, {
      email,
      name: (body.name ?? '').trim(),
      phone: (body.phone ?? '').trim(),
      referrer,
    }),
  );
  return c.json({ ok: true }, 201);
});

/* ------------------------------------------------------------ delivery ----- */

/** R2-backed media delivery with range support so seeking works in the player. */
pub.get('/media/*', async (c) => {
  const key = decodeURIComponent(c.req.path.replace(/^\/media\//, ''));
  if (!key) return c.text('not found', 404);
  const range = c.req.header('range');
  const object = range
    ? await c.env.MEDIA.get(key, { range: c.req.raw.headers })
    : await c.env.MEDIA.get(key);
  if (!object) return c.text('not found', 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  if (range && object.range && 'offset' in object.range) {
    const offset = object.range.offset ?? 0;
    const length = object.range.length ?? object.size - offset;
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    return new Response(object.body, { status: 206, headers });
  }
  return new Response(object.body, { headers });
});

function playerShell(payloadJson: string, title: string, extraBody = '', canonical = ''): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
${canonical ? `<link rel="canonical" href="${canonical}">` : ''}
<link rel="stylesheet" href="${stamp('/player/player.css')}">
<style>html,body{margin:0;height:100%;background:transparent}</style>
</head>
<body>
<div id="sf-player" class="sf-fill"></div>
${extraBody}
<script>window.__SF_EMBED__ = ${payloadJson};</script>
<script src="${stamp('/player/player.js')}"></script>
<script>Videokr.mount(document.getElementById('sf-player'), window.__SF_EMBED__);</script>
</body>
</html>`;
}

/** iframe target for embeds. */
pub.get('/e/:key', async (c) => {
  const video = await loadVideoBySlugOrId(c.env, c.req.param('key'));
  if (!video) return c.html(notFoundPage('Video'), 404);
  /* The frame must stay crawlable so video indexing can fetch the player, but the
     page that should rank is /v/<slug>, never the bare iframe. */
  c.header('x-robots-tag', 'noindex, indexifembedded');

  const host = embedderHostname(c);
  if (video.allowed_domains && host && !hostnameAllowed(host, video.allowed_domains)) {
    return c.html(
      `<div style="font:14px/1.5 system-ui;padding:24px;color:#fff;background:#111">
         This video is not authorised to play on <b>${escapeHtml(host)}</b>.
       </div>`,
      403,
    );
  }
  if (video.visibility === 'password' && video.password_hash) {
    const payload = JSON.stringify({
      locked: true,
      video: { id: video.id, slug: video.slug, title: video.title, thumbnail_url: video.thumbnail_url },
    });
    return c.html(playerShell(payload, video.title, '', `${baseUrl(c.env)}/v/${video.slug}`));
  }
  const variant: 'a' | 'b' = video.thumbnail_url_b && Math.random() < 0.5 ? 'b' : 'a';
  const payload = await buildEmbedPayload(c.env, video, variant);
  payload.player = applyEmbedQuery(c.req.url, payload.player);
  return c.html(playerShell(JSON.stringify(payload), video.title, '', `${baseUrl(c.env)}/v/${video.slug}`));
});

/** Public, SEO-friendly video page. */
pub.get('/v/:slug', async (c) => {
  const video = await loadVideoBySlugOrId(c.env, c.req.param('slug'));
  if (!video) return c.html(notFoundPage('Video'), 404);
  const [chapters, plays] = await Promise.all([chaptersFor(c.env, video.id), playCount(c.env, video.id)]);
  const extras: PageExtras = { chapters, plays };
  if (video.visibility === 'password' && video.password_hash) {
    const payload = JSON.stringify({
      locked: true,
      video: { id: video.id, slug: video.slug, title: video.title, thumbnail_url: video.thumbnail_url },
    });
    return c.html(pageShell(video, payload, c.env, { chapters: [], plays: 0 }));
  }
  const payload = await buildEmbedPayload(c.env, video, 'a');
  return c.html(pageShell(video, JSON.stringify(payload), c.env, extras));
});

/* The type and mark the rest of the product is drawn in. Without them a public page
   falls back to a browser serif and a bare word, reading as a different product.
   Self-hosted so a public page costs no third-party connection and cannot shift
   its layout waiting on someone else's CDN. */
const FONTS = `<link rel="preload" href="/fonts/figtree-400-800-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/kalam-700-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/fonts/fonts.css">
<link rel="icon" href="/brand/mark-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/brand/mark-180.png">
<meta name="theme-color" content="#fdfbfc">`;

const PAGE_HEAD =
  '<header class="sf-page-head"><a class="sf-brand" href="/"><img src="/brand/logo-ink-330.webp" alt="Videokr" width="102" height="28"></a></header>';

/** Every public page links home in words a crawler can read. */
const PAGE_FOOT = `<footer class="sf-page-foot">
  <p>Hosted on <a href="/">Videokr</a> — brandable video hosting with lead capture and retention analytics.
     <a href="/#pricing">See plans</a>.</p>
</footer>`;

function metaDescription(video: Video): string {
  const text = video.description
    ? video.description
    : `Watch “${video.title}” on Videokr — hosted, ad-free video with chapters, captions and no suggested videos.`;
  return escapeHtml(text.replace(/\s+/g, ' ').trim()).slice(0, 300);
}

interface PageExtras {
  chapters: Pick<Chapter, 'start_seconds' | 'title'>[];
  plays: number;
}

function pageShell(video: Video, payloadJson: string, env: Env, extras: PageExtras): string {
  const base = baseUrl(env);
  const canonical = `${base}/v/${video.slug}`;
  const thumbnail = video.thumbnail_url ? absoluteUrl(base, video.thumbnail_url) : `${base}/brand/hero-dark.png`;
  /* Only a genuinely public video belongs in an index; an unlisted or
     password-locked page is shared by link and stays out of search. */
  const indexable = video.visibility === 'public';
  const description = metaDescription(video);
  const ld = graphLd([
    organizationLd(base),
    webSiteLd(base),
    videoObjectLd(base, { video, chapters: extras.chapters, plays: extras.plays }),
    breadcrumbLd(base, [
      { name: 'Videokr', url: '/' },
      { name: video.title, url: `/v/${video.slug}` },
    ]),
  ]);
  const chapterList = extras.chapters.length
    ? `<section class="sf-page-chapters"><h2>Chapters</h2><ol>${extras.chapters
        .map((chapter) => {
          const seconds = Math.round(chapter.start_seconds);
          const stamp = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
          return `<li><a href="?t=${seconds}" data-seek="${seconds}"><span>${stamp}</span> ${escapeHtml(
            chapter.title,
          )}</a></li>`;
        })
        .join('')}</ol></section>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(video.title)} — Videokr</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="${
    indexable ? 'index, follow, max-image-preview:large, max-video-preview:-1, max-snippet:-1' : 'noindex, follow'
  }">
<link rel="alternate" type="text/markdown" href="${canonical}.md" title="${escapeHtml(video.title)} in Markdown">
<meta property="og:type" content="video.other">
<meta property="og:site_name" content="${SITE.name}">
<meta property="og:locale" content="en_US">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${escapeHtml(video.title)}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${escapeHtml(thumbnail)}">
<meta property="og:image:alt" content="${escapeHtml(video.title)}">
<meta property="og:video" content="${base}/e/${escapeHtml(video.slug)}">
<meta property="og:video:secure_url" content="${base}/e/${escapeHtml(video.slug)}">
<meta property="og:video:type" content="text/html">
<meta property="og:video:width" content="1280">
<meta property="og:video:height" content="720">
${video.duration ? `<meta property="video:duration" content="${Math.round(video.duration)}">` : ''}
<meta property="video:release_date" content="${new Date(video.created_at * 1000).toISOString()}">
<meta name="twitter:card" content="player">
<meta name="twitter:title" content="${escapeHtml(video.title)}">
<meta name="twitter:description" content="${description.slice(0, 200)}">
<meta name="twitter:image" content="${escapeHtml(thumbnail)}">
<meta name="twitter:player" content="${base}/e/${escapeHtml(video.slug)}">
<meta name="twitter:player:width" content="1280">
<meta name="twitter:player:height" content="720">
<link rel="stylesheet" href="${stamp('/player/player.css')}">
<link rel="stylesheet" href="${stamp('/styles.css')}">
${FONTS}
${ld}
</head>
<body class="sf-page">
<a class="sf-skip" href="#sf-main">Skip to the video</a>
${PAGE_HEAD}
<main class="sf-page-main" id="sf-main">
  <nav class="sf-crumbs" aria-label="Breadcrumb"><a href="/">Videokr</a> <span aria-hidden="true">/</span> <span>${escapeHtml(
    video.title,
  )}</span></nav>
  <div class="sf-page-player"><div id="sf-player" class="sf-fill"></div></div>
  <h1>${escapeHtml(video.title)}</h1>
  ${video.description ? `<p class="sf-page-desc">${escapeHtml(video.description)}</p>` : ''}
  ${chapterList}
  ${
    video.transcript
      ? `<section class="sf-transcript"><h2>Transcript</h2>
           <input id="sf-transcript-search" placeholder="Search this transcript…" aria-label="Search transcript">
           <pre id="sf-transcript-body">${escapeHtml(video.transcript)}</pre></section>`
      : ''
  }
</main>
${PAGE_FOOT}
<script>window.__SF_EMBED__ = ${payloadJson};</script>
<script src="${stamp('/player/player.js')}" defer></script>
<script src="${stamp('/page.js')}" defer></script>
</body>
</html>`;
}

/** A missing page still has to look like the product and stay out of the index. */
function notFoundPage(kind: 'Video' | 'Playlist'): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${kind} not found — Videokr</title>
<meta name="robots" content="noindex, follow">
<link rel="stylesheet" href="${stamp('/styles.css')}">
${FONTS}
</head>
<body class="sf-page">
${PAGE_HEAD}
<main class="sf-page-main sf-page-missing">
  <h1>This ${kind.toLowerCase()} isn’t here.</h1>
  <p class="sf-page-desc">The link may be wrong, or the owner may have removed it or made it private.</p>
  <p><a class="btn" href="/">Go to Videokr</a></p>
</main>
${PAGE_FOOT}
</body>
</html>`;
}

async function playCount(env: Env, videoId: string): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE video_id = ? AND kind = 'play'")
    .bind(videoId)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

async function chaptersFor(env: Env, videoId: string): Promise<Pick<Chapter, 'start_seconds' | 'title'>[]> {
  const { results } = await env.DB.prepare(
    'SELECT start_seconds, title FROM chapters WHERE video_id = ? ORDER BY start_seconds',
  )
    .bind(videoId)
    .all<Pick<Chapter, 'start_seconds' | 'title'>>();
  return results ?? [];
}

/** Public playlist page: a collection of videos on one page. */
async function loadPlaylist(env: Env, key: string): Promise<Playlist | null> {
  return env.DB.prepare('SELECT * FROM playlists WHERE slug = ? OR id = ? LIMIT 1')
    .bind(key, key)
    .first<Playlist>();
}

async function playlistVideos(env: Env, playlist: Playlist): Promise<Video[]> {
  const { results } = await env.DB.prepare(
    `SELECT v.* FROM playlist_items i JOIN videos v ON v.id = i.video_id
      WHERE i.playlist_id = ? ORDER BY i.position`,
  )
    .bind(playlist.id)
    .all<Video>();
  return results ?? [];
}

async function playlistData(env: Env, playlist: Playlist, videos: Video[]): Promise<string> {
  const payloads = await Promise.all(videos.map((v) => buildEmbedPayload(env, v, 'a')));
  return JSON.stringify({
    playlist: {
      title: playlist.title,
      layout: playlist.layout,
      autoplay_next: Boolean(playlist.autoplay_next),
      share: shareLinks(env, playlist.slug, 'playlist'),
    },
    items: payloads,
  });
}

function playlistLocked(playlist: Playlist, error: boolean): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, follow">
<title>${escapeHtml(playlist.title)} — Videokr</title>
<link rel="stylesheet" href="${stamp('/styles.css')}">
${FONTS}
</head>
<body class="sf-page">
${PAGE_HEAD}
<main class="sf-page-main">
  <form class="sf-lock" method="post" action="/pl/${escapeHtml(playlist.slug)}/unlock">
    <h1>${escapeHtml(playlist.title)}</h1>
    <p>This page is password protected.</p>
    ${error ? '<p class="sf-lock-error">Incorrect password.</p>' : ''}
    <input type="password" name="password" placeholder="Password" aria-label="Password" autofocus>
    <button type="submit">Unlock</button>
  </form>
</main>
</body>
</html>`;
}

function playlistShell(
  playlist: Playlist,
  data: string,
  chrome: boolean,
  env: Env,
  videos: Video[],
): string {
  const base = baseUrl(env);
  const canonical = `${base}/pl/${playlist.slug}`;
  const indexable = chrome && playlist.visibility === 'public';
  const description = escapeHtml(
    playlist.description ||
      `${videos.length} video${videos.length === 1 ? '' : 's'} in “${playlist.title}”, hosted on Videokr.`,
  ).slice(0, 300);
  const poster = videos.find((video) => video.thumbnail_url);
  const ld = graphLd([
    organizationLd(base),
    webSiteLd(base),
    {
      '@type': 'ItemList',
      '@id': `${canonical}#playlist`,
      name: playlist.title,
      description: playlist.description || undefined,
      url: canonical,
      numberOfItems: videos.length,
      itemListOrder: 'https://schema.org/ItemListOrderAscending',
      itemListElement: videos.map((video, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${base}/v/${video.slug}`,
        name: video.title,
      })),
    },
    breadcrumbLd(base, [
      { name: 'Videokr', url: '/' },
      { name: playlist.title, url: `/pl/${playlist.slug}` },
    ]),
  ]);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(playlist.title)} — Videokr</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="${
    indexable ? 'index, follow, max-image-preview:large, max-video-preview:-1' : 'noindex, follow'
  }">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE.name}">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${escapeHtml(playlist.title)}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${
    poster ? escapeHtml(absoluteUrl(base, poster.thumbnail_url)) : `${base}/brand/hero-dark.png`
  }">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="${stamp('/player/player.css')}">
<link rel="stylesheet" href="${stamp('/styles.css')}">
${FONTS}
${chrome ? ld : ''}
</head>
<body class="sf-page${chrome ? '' : ' sf-page-bare'}">
${chrome ? PAGE_HEAD : ''}
${chrome ? `<h1 class="sf-playlist-title">${escapeHtml(playlist.title)}</h1>` : ''}
${chrome && playlist.description ? `<p class="sf-playlist-desc">${escapeHtml(playlist.description)}</p>` : ''}
<main class="sf-playlist" data-layout="${escapeHtml(playlist.layout)}">
  <div class="sf-playlist-stage"><div id="sf-player" class="sf-fill"></div></div>
  <aside class="sf-playlist-list" id="sf-playlist-list"></aside>
</main>
${
  chrome
    ? `<nav class="sf-playlist-index" aria-label="Videos in this playlist"><h2>In this playlist</h2><ol>${videos
        .map((video) => `<li><a href="/v/${escapeHtml(video.slug)}">${escapeHtml(video.title)}</a></li>`)
        .join('')}</ol></nav>${PAGE_FOOT}`
    : ''
}
<script>window.__SF_PLAYLIST__ = ${data};</script>
<script src="${stamp('/player/player.js')}" defer></script>
<script src="${stamp('/playlist.js')}" defer></script>
</body>
</html>`;
}

/** Playlist pages and their iframe embeds share one gate: page-level privacy. */
async function playlistUnlocked(playlist: Playlist, token: string): Promise<boolean> {
  if (playlist.visibility !== 'password' || !playlist.password_hash) return true;
  if (!token) return false;
  return verifyAccessToken(playlist.password_hash, playlist.id, token);
}

pub.post('/pl/:slug/unlock', async (c) => {
  const playlist = await loadPlaylist(c.env, c.req.param('slug'));
  if (!playlist) return c.html(notFoundPage('Playlist'), 404);
  if (playlist.visibility !== 'password' || !playlist.password_hash) {
    return c.redirect(`/pl/${playlist.slug}`, 302);
  }
  const form = await c.req.formData();
  const password = String(form.get('password') ?? '');
  const ok = await verifyPassword(password, playlist.password_salt, playlist.password_hash);
  if (!ok) return c.html(playlistLocked(playlist, true), 401);
  const token = await signAccessToken(playlist.password_hash, playlist.id);
  return c.redirect(`/pl/${playlist.slug}?token=${encodeURIComponent(token)}`, 302);
});

pub.get('/pl/:slug', async (c) => {
  const playlist = await loadPlaylist(c.env, c.req.param('slug'));
  if (!playlist) return c.html(notFoundPage('Playlist'), 404);
  if (!(await playlistUnlocked(playlist, c.req.query('token') ?? ''))) {
    return c.html(playlistLocked(playlist, false), 401);
  }
  const videos = await playlistVideos(c.env, playlist);
  const data = await playlistData(c.env, playlist, videos);
  return c.html(playlistShell(playlist, data, true, c.env, videos));
});

/** iframe target for playlist embeds. */
pub.get('/ep/:slug', async (c) => {
  const playlist = await loadPlaylist(c.env, c.req.param('slug'));
  if (!playlist) return c.html(notFoundPage('Playlist'), 404);
  if (!(await playlistUnlocked(playlist, c.req.query('token') ?? ''))) {
    return c.html(playlistLocked(playlist, false), 401);
  }
  c.header('x-robots-tag', 'noindex, indexifembedded');
  const videos = await playlistVideos(c.env, playlist);
  const data = await playlistData(c.env, playlist, videos);
  return c.html(playlistShell(playlist, data, false, c.env, videos));
});
