/**
 * Integration API (`/api/v1`), authenticated with an account API key rather
 * than a browser session. This is what the Videokr WordPress plugin talks to:
 * it needs to list an account's library to build a picker, and it needs the
 * embed base URL so the shortcode can render without hardcoding a host.
 */
import { Hono } from 'hono';
import type { Env, User } from '../lib/types';
import { userForApiKey } from '../lib/apikeys';
import { planFor, playUsage } from '../lib/billing';

type Vars = { user: User };

interface LibraryVideo {
  id: string;
  slug: string;
  title: string;
  source_type: string;
  thumbnail_url: string;
  visibility: string;
  duration: number;
  created_at: number;
}

interface LibraryPlaylist {
  id: string;
  slug: string;
  title: string;
  visibility: string;
  layout: string;
  created_at: number;
  item_count: number;
}

export const plugin = new Hono<{ Bindings: Env; Variables: Vars }>();

function bearer(header: string | undefined): string {
  if (!header) return '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : header.trim();
}

/* A plugin can also call this from the browser (the block editor preview), so
   the key-authenticated endpoints answer preflight and allow any origin: the
   key is the credential, cookies are never used. */
plugin.options('*', (c) =>
  c.body(null, 204, {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-max-age': '86400',
  }),
);

plugin.use('*', async (c, next) => {
  const key = bearer(c.req.header('authorization')) || (c.req.query('api_key') ?? '');
  const user = key ? await userForApiKey(c.env, key) : null;
  if (!user) return c.json({ error: 'invalid or revoked API key' }, 401);
  c.set('user', user);
  await next();
  c.header('access-control-allow-origin', '*');
});

/** Used by the plugin's "Connect" button to prove the key works. */
plugin.get('/account', async (c) => {
  const user = c.get('user');
  const plan = planFor(user);
  const usage = await playUsage(c.env, user);
  return c.json({
    account: { email: user.email, name: user.name, plan: user.plan, plan_name: plan.name },
    usage: { plays: usage.plays, allowance: usage.allowance, blocked: usage.blocked },
    /* The origin the key was presented to, so an integration echoes back the
       host it is actually talking to rather than a configured default. */
    base_url: new URL(c.req.url).origin,
  });
});

plugin.get('/videos', async (c) => {
  const search = (c.req.query('search') ?? '').trim().toLowerCase();
  const { results } = await c.env.DB.prepare(
    `SELECT id, slug, title, source_type, thumbnail_url, visibility, duration, created_at
       FROM videos WHERE user_id = ? ORDER BY created_at DESC`,
  )
    .bind(c.get('user').id)
    .all<LibraryVideo>();
  const videos = (results ?? []).filter(
    (video) => !search || video.title.toLowerCase().includes(search) || video.slug.includes(search),
  );
  return c.json({ videos, base_url: c.env.PUBLIC_BASE_URL });
});

plugin.get('/playlists', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.slug, p.title, p.visibility, p.layout, p.created_at,
            (SELECT COUNT(*) FROM playlist_items i WHERE i.playlist_id = p.id) AS item_count
       FROM playlists p WHERE p.user_id = ? ORDER BY p.created_at DESC`,
  )
    .bind(c.get('user').id)
    .all<LibraryPlaylist>();
  return c.json({ playlists: results ?? [], base_url: c.env.PUBLIC_BASE_URL });
});
