# Videokr

Free-tier video hosting, custom player, embeds, and viewer analytics — a VIDEOO-style
product built entirely on Cloudflare's free plan (Workers + static assets + D1 + R2).

Videos can come from four sources: YouTube, Vimeo, a direct MP4/WebM URL, or HLS.
Own-media files can be uploaded to R2 and are served from `/media/*` with HTTP range
support so seeking works.

## Features

- Auth (PBKDF2-SHA256, D1-backed sessions), projects, videos, playlists
- Dependency-free custom player: skins, accent/background/radius, logo watermark,
  chapters, captions, speed, PiP, fullscreen, sticky mini-player, resume, hotkeys
- Embeds: `<script>` loader (`/embed.js`) and plain iframe (`/e/:key`)
- Public SEO pages (`/v/:slug`), playlist pages (`/pl/:slug`) with Open Graph,
  Twitter player cards, and VideoObject JSON-LD
- Access control: public / unlisted / password-protected, domain allowlists (`*.example.com`)
- Marketing: overlay/lower-third CTAs, lead-capture gate, end screens, CSV lead export
- Analytics: impressions, plays, completions, retention buckets, devices, referrers,
  country (from Cloudflare request metadata), A/B thumbnail variants
- Webhooks with optional HMAC-SHA256 signatures

## Local development

```bash
npm install
npm run db:migrate:local     # apply migrations to the local D1 instance
npm run seed:local           # demo user + sample videos (demo@videokr.test / videokr123)
npm run dev                  # http://localhost:8787
```

Checks:

```bash
npm run lint
npm run typecheck
npm test
```

## Deploying

1. `npx wrangler d1 create streamforge` and put the returned id in `wrangler.toml`.
2. `npx wrangler r2 bucket create streamforge-media`.
3. Set `PUBLIC_BASE_URL` in `wrangler.toml` to your deployed origin.
4. `npm run db:migrate:remote && npm run deploy`.
5. Optional: `SEED_EMAIL=... SEED_PASSWORD=... npm run seed:remote` for a demo account.

This repo is deployed at <https://videokr.com>.

## Optional offline HLS encoding

Owners who keep a PC running can generate adaptive HLS without paid hosting. Install native
`ffmpeg`, create an API key in Dashboard → Integrations, and run:

```bash
export VIDEOKR_API_KEY='vk_live_…'
node scripts/encoder-agent.mjs --base-url https://videokr.com --video VIDEO_ID
# Or process every progressive upload owned by that key:
node scripts/encoder-agent.mjs --base-url https://videokr.com --all
```

The agent keeps the original progressive source as a fallback, uploads a three-rung VOD
ladder, and is safe to re-run. It never prints the API key.

## Note on YouTube sources

Hiding YouTube's controls/branding on embedded videos conflicts with YouTube's Terms of
Service. YouTube mode is supported because it is free hosting, but for branding-critical
embeds prefer own-media (R2 MP4 or HLS) mode.
