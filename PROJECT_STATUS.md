# Videokr — project status

Repo: `bytepassperks/streamforge` · branch `devin/1787054418-streamforge-app` · PR
https://github.com/bytepassperks/streamforge/pull/1

Live: https://streamforge.getlaunchpod.workers.dev (Cloudflare Worker, free tier)
Last deployed Worker version: `f2ab6702-aa71-4725-826d-8bde2e980dda`

Product: a self-owned alternative to videoo.org / Wistia / Vidyard. Host or link video,
brand the player, embed it anywhere, gate it, and see who watched what — two tiers, Free
forever and a one-time Lifetime licence.

---

## 1. Infrastructure

| Thing | Value |
| --- | --- |
| Cloudflare account | `ed43fb9aedda947029c20ca03959f8da` (Hardy.lebsack@warpfix.org) |
| Worker | `streamforge` |
| D1 database | `streamforge` — `0d0cb759-f16a-4c56-a10c-e5a9843673ab` |
| R2 bucket | `streamforge-media` |
| Deploy token | env var `CLOUDFLARE_GETLAUNCHPOD_API_TOKEN` |

Deploy: `CLOUDFLARE_API_TOKEN="$CLOUDFLARE_GETLAUNCHPOD_API_TOKEN" CLOUDFLARE_ACCOUNT_ID=ed43fb9aedda947029c20ca03959f8da npx wrangler deploy`

Note: a plain `npx wrangler` picks up the unrelated `CLOUDFLARE_API_TOKEN` already in the
shell and fails with an auth error on this account — always pass the token inline as above.

Migrations 0001–0003 are applied to the production D1. `wrangler d1 migrations apply`
was silently failing in this environment, so 0003 was applied statement-by-statement
through the Cloudflare D1 REST query API and recorded in `d1_migrations` manually. If a
future migration behaves the same way, do the same or upgrade wrangler to v4.

## 2. What is built and working

Stack: Cloudflare Worker (Hono, `src/index.ts`) + D1 + R2, static assets in `public/`,
no build step for the frontend and no runtime dependencies in the player.

**Sources and playback** — `youtube`, `vimeo`, `mp4`, `hls`, plus own-file uploads to R2
served through a range-aware `/media/*` route. `parseSource()` normalises the input URL;
the player picks an adapter per source so skins, chapters, CTAs, hotkeys and tracking are
identical across all four.

**Player** (`public/player/player.js`, `player.css`) — skins, accent colour, corner
radius, logo watermark, title bar, per-control toggles, speed menu, captions, chapters,
picture-in-picture, fullscreen, resume, sticky/miniplayer, keyboard shortcuts. Exposed as
both `window.Videokr` and `window.StreamForge`.

**Delivery** — script embed (`public/embed.js`), standalone iframe embed `/e/<key>`,
public SEO video page `/v/<slug>` (Open Graph, Twitter player card, VideoObject JSON-LD),
playlist page `/pl/<slug>` with autoplay-next.

**Access control** — password-protected videos never ship the source to the browser:
`/api/embed/:key` returns `password_required`, `/api/embed/:key/unlock` verifies and
returns a short-lived HMAC access token. Domain allowlists (with `*.example.com`
wildcards) are checked against `referer`/`origin`. Visibility modes per video.

**Marketing layer** — timed overlay / lower-third CTAs, end screens, email lead gate that
pauses playback, lead CSV export, A/B thumbnail variants.

**Analytics** — impressions, plays, completions, play rate, second-level retention
buckets (drop-off), devices, referrers, countries.

**Webhooks** — CRUD, optional HMAC signing, and last-delivery status (`last_status`,
`last_attempt_at`, `last_error`) so failures are visible. Delivery + signature verified
end-to-end against a live receiver.

**Billing (Free + Lifetime, Dodo Payments) — LIVE and connected.** `src/lib/billing.ts`:
- Dodo live product `Videokr Lifetime`, `pdt_0NlkABQZHg1IEe8PHKx3j`, one-time $69, business
  `bus_0NXyVkuVr1dqXmP1O5TeG` (the same Dodo account as your other products).
- Dodo webhook endpoint `ep_3I8tZZ4roabAgAxgULbFN08MsvK` pointing at
  `/api/billing/dodo/webhook`, with its own signing secret.
- Worker secrets set: `DODO_PAYMENTS_API_KEY`, `DODO_WEBHOOK_SECRET`,
  `DODO_LIFETIME_PRODUCT_ID`. `GET /api/billing` reports `checkout_ready: true` and a real
  checkout session was created against live Dodo, so the buy button works today.
- The product is in LIVE mode: the next step is a real card payment, which is why the
  successful-payment path (plan flip, badge removal, seat increment) is the one thing still
  unproven — see "What is left".
- Ladder `offerForSeats()`: `$69 / ₹5,999` for the first 100 seats → `$99 / ₹8,499` for
  the next 400 → `$149 / ₹12,999`. Seats counted from real `purchases WHERE status='paid'`,
  surfaced by `GET /api/public/offer`; the landing page and dashboard read it, so no
  invented urgency.
- `POST /api/billing/checkout` creates a hosted Dodo checkout session and records a
  `pending` purchase.
- `POST /api/billing/dodo/webhook` is the only thing that grants the plan: Standard
  Webhooks HMAC-SHA256 verification, 5-minute timestamp window, dedupe by `webhook-id`,
  then `payment.succeeded` → `users.plan = 'lifetime'`. The browser return URL only
  re-reads the server's plan, so it cannot be spoofed into an unlock.
- Free tier: 5 videos (`POST /api/videos` returns `402 {upgrade:true}` past the cap),
  3 GB, 10k plays/month, and a small "Videokr" badge on the player — the embed payload
  sets `badge: owner.plan !== 'lifetime'`, so it is removed by buying, not by editing
  client config.

**Design + brand** — "Broadcast Coal" dark system across landing, login and dashboard:
Instrument Serif display, Inter Tight UI, Caveat annotations, JetBrains Mono metadata,
coal/cream/ember/lime palette. Brand assets (logo lockup, favicon set, hero, six feature
illustrations) in `public/brand/`. Five design explorations remain at `/design/v1`…`/v5`;
v1 is the one shipped.

**Quality** — `npm run lint`, `npm run typecheck` and `npm test` (32 unit tests, including
the seat ladder and webhook signature rejection of tampered bodies, wrong secrets, missing
headers and stale timestamps) all pass.

**Production checks run against the live Worker (2026-08-19):** signup 201; `GET /api/billing`
→ `checkout_ready: true`; `POST /api/billing/checkout` → a real
`checkout.dodopayments.com/session/...` URL; a bogus-signature webhook → 401 with no plan
granted; video create → `/v/<slug>` 200 and the page renders `sf-player` + `sf-controls` +
the free-tier `sf-badge` in a real browser, which closes the earlier blank-player P0; the
test project, video and rows were deleted afterwards (`/v/` now 404s).

## 3. What is left

Ordered by what blocks revenue.

1. **Buy it once yourself (the only untested path).** Everything up to Dodo's payment page
   is verified; the post-payment half is not, because it needs a real live charge. Buy the
   $69 lifetime from the dashboard with your own card, then confirm your account shows
   lifetime, the player badge disappears, the 5-video cap lifts and the seat counter moves
   to 1 of 100. The webhook field names (`data.metadata.user_id`, `data.customer.email`,
   `data.payment_id`, `data.total_amount`) come from Dodo's docs; if the grant does not
   happen, the webhook body will be in the Dodo dashboard's delivery log and it is a
   one-line mapping fix. Refunding yourself in Dodo afterwards costs only Dodo's fee.
   (If you would rather rehearse for free, set `DODO_ENVIRONMENT=test_mode` plus test-mode
   key/product/webhook secrets, run a test card, then remove the override.)
2. **Remaining UI checks I did not spend credits on:** mobile layout at ~390px,
   reduced-motion behaviour, and whether every brand PNG is clean on the dark background
   (they came from the supplied images and may retain dark edges or halos).
3. **Attach the custom domain** (your call — deliberately left undone). `videokr.com` was
   in pending-delete on 2026-08-18, so it needs a backorder/drop-catch, not a normal
   registration. After pointing DNS, update `PUBLIC_BASE_URL` in `wrangler.toml` and the
   Dodo webhook URL.
4. **Seeded demo account.** `demo@streamforge.app` still exists in production but its
   seeded password no longer works (login returns 401) — delete the row when convenient.
5. **Backend naming.** Worker, D1, R2 bucket, package and repo are still named
   `streamforge`, and the legacy `x-streamforge-signature` webhook header remains. All are
   compatibility-sensitive and invisible to customers; rename only deliberately.
6. **Nice-to-haves not built.** Storage and monthly-play enforcement (the numbers are
   advertised and stored in `FREE_LIMITS` but only the video cap is enforced), transcript
   search, auto-captions, and localised INR checkout in Dodo.

## 4. Honest caveats to keep in the copy

- Hiding YouTube's controls and branding conflicts with YouTube's terms. Own-media mode
  (R2 MP4/HLS) exists for that reason and is the recommendation for branding-critical
  embeds.
- "Runs on Cloudflare's free tier" is true, and R2 egress is free, but the free quotas
  (roughly 100k Worker requests/day) are real; extremely high traffic can eventually need
  a paid Cloudflare plan. That is a bill from Cloudflare, never a subscription from us.
- Externally hosted MP4 playback could not be proven from the test sandbox (the host was
  blocked there). YouTube and uploaded R2 media both play.
