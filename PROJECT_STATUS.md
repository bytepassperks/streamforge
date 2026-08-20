# Videokr — project status

Repo: `bytepassperks/streamforge` · branch `devin/1787054418-streamforge-app` · PR
https://github.com/bytepassperks/streamforge/pull/1

Live: https://streamforge.getlaunchpod.workers.dev (Cloudflare Worker, free tier)
Last deployed Worker version: `eda3ec59-b216-40e3-87de-e4459f9a164c`
Last updated: 2026-08-20 (control-bar rebuild + Vimeo/playlist-embed verification)

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

**Billing (Free, Starter, Agency, Lifetime — Dodo Payments) — LIVE and connected.**
`src/lib/billing.ts`. Plans are metered on plays, not on storage:

| Plan | Price | Plays / month | Videos | Fair-use storage | Over allowance |
| --- | --- | --- | --- | --- | --- |
| Free | $0 | 500 | 5 | 2 GB | playback stops until the month rolls over |
| Starter | $5/mo or $29/yr | 10,000 | unlimited | 25 GB | keeps playing, $1 per 10,000 |
| Agency | $29/mo or $290/yr | 150,000 | unlimited | 250 GB | keeps playing, $1 per 10,000 |
| Lifetime | $69 → $99 → $149 one-time, on sale permanently | 10,000 forever | unlimited | 25 GB | keeps playing, $1 per 10,000 |

- Dodo live products: Lifetime `pdt_0NlkABQZHg1IEe8PHKx3j`; recurring Starter monthly
  `pdt_0NlpHnWuphLGAtw5NnKzA`, Starter annual `pdt_0NlpHnaEHSuVDufu3ixr7`, Agency monthly
  `pdt_0NlpHneTyTAjGlTkQUOF1`, Agency annual `pdt_0NlpHnhoCRnim1RNH55Z2`, business
  `bus_0NXyVkuVr1dqXmP1O5TeG` (the same Dodo account as your other products).
- Dodo webhook endpoint `ep_3I8tZZ4roabAgAxgULbFN08MsvK` pointing at
  `/api/billing/dodo/webhook`, with its own signing secret.
- Worker secrets set: `DODO_PAYMENTS_API_KEY`, `DODO_WEBHOOK_SECRET`,
  `DODO_LIFETIME_PRODUCT_ID`, `DODO_STARTER_PRODUCT_ID`, `DODO_STARTER_ANNUAL_PRODUCT_ID`,
  `DODO_AGENCY_PRODUCT_ID`, `DODO_AGENCY_ANNUAL_PRODUCT_ID`. `GET /api/billing` reports
  `checkout_ready` and `subscription_ready`, and real checkout sessions were created against
  live Dodo for Lifetime and for Starter, so both buy paths work today.
- `POST /api/billing/subscribe` takes `{plan: starter|agency, cycle: monthly|annual}` and
  returns a hosted Dodo subscription checkout url.
- Subscription lifecycle is handled from Dodo's documented events —
  `subscription.active`, `renewed`, `plan_changed`, `unpaused` grant the plan mapped from
  the product id; `cancelled`, `expired`, `failed`, `paused`, `on_hold` fall back to Free;
  `subscription.updated` is classified from its `status` field. `users.subscription_id` and
  `users.plan_renews_at` are stored. A Lifetime account is never downgraded by a
  subscription event. Verified in production with signed synthetic events: active → Starter,
  plan change → Agency, `updated/on_hold` → Free, and all three ignored on a Lifetime
  account.
- Fixed while verifying: the deployed `DODO_WEBHOOK_SECRET` did not match the signing
  secret of the live Dodo endpoint, so real webhooks would have been rejected with 401. The
  secret was re-read from the Dodo API and re-uploaded.
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
- Free tier: 5 videos (`POST /api/videos` returns `402 {upgrade:true}` past the cap) and a
  small "Videokr" badge on the player — the embed payload sets
  `badge: owner.plan !== 'lifetime'`, so it is removed by buying, not by editing client
  config.

**Play metering** — migration `0006_plays.sql` adds `play_usage` (per account, per UTC
calendar month, `YYYY-MM`) and `play_dedup` keyed `(video_id, view_id, period)`, so a
viewer who reloads or rewatches the same video inside a month is counted once. Usage is
attributed to the video's owner. `/api/track` counts the play synchronously and answers
`{capped:true}` once a hard-stop plan is over its allowance; the player then stops and
shows the monthly-limit card. Paid plans keep serving and accrue displayed overage.
`role='admin'` or `unlimited=1` bypasses every allowance. Usage shows in the dashboard
billing view and on each user in the admin portal. Verified in production: duplicate
`view_id` did not increment, a new viewer did, Free blocked at 500, Starter kept playing
past its allowance with overage shown.

The remote migration was applied with `wrangler d1 execute --file` rather than
`migrations apply`, because the remote `d1_migrations` ledger was missing entries for
`0004`/`0005` and re-running them failed on an already-present `role` column. The ledger
was then reconciled by hand — do not blindly re-run the old migration sequence.

**Design + brand** — "Broadcast Coal" dark system across landing, login and dashboard:
Instrument Serif display, Inter Tight UI, Caveat annotations, JetBrains Mono metadata,
coal/cream/ember/lime palette. Brand assets (logo lockup, favicon set, hero, six feature
illustrations) in `public/brand/`. The five design explorations have been removed now that
the chosen direction (v1) ships as the real landing page.

**Admin** — `harryroger798@gmail.com` is `role='admin'` with `unlimited=1`. Portal at
`/admin.html`: user list, upgrade/downgrade to lifetime, unlimited override, suspend
(blocks login), create/delete user, password reset, manual sale grant, refund sync,
purchases, videos, stats and an audit log. Non-admins get 403 on every admin route.
Verified in production; video deletion was never fired against real customer videos.

**Player isolation (source chrome)** — the third-party frame is never visible to the
viewer, and the reason is geometry rather than timing. A linked source letterboxes its
16:9 picture inside whatever box it is handed and anchors its title, channel, watermark,
suggestion grid and control bar to the top and bottom edges of that box. So `.sf-yt-frame`
is 240% of its width tall and pulled up by 38.28125% of its own height inside a 16:9
`.sf-yt-crop` with `overflow: hidden`: the picture lands exactly in the visible stage at
full size, and every one of those strips sits far outside the crop. Nothing is scaled, so
no part of the picture is lost. This is the same construction Plyr uses for embeds, which
is how videoo.org keeps its frames clean.

Masking is now only a second line of defence for the source's centred play/pause ripple:
`.sf-yt-cover` shows our still whenever playback is not genuinely running (a 150 ms poll of
the real state plus a moving playback clock, because the source's own state events lie —
a seek reports PLAYING while the frame is still painted paused), holding 1.2 s after a
start and 0.9 s after a seek. `.sf-yt-shield` swallows every pointer event so the frame is
never interactive. On end the frame is masked and rewound. Verified with the still forcibly
disabled: paused and hovered, the frame shows no title, channel, logo or "More videos".

The `/v/demo` record was also switched from a linked source to the hosted MP4, because the
clip's *content* was a screen recording of a video site and read as leakage even when the
frame was fully masked. Source captions are unloaded by default and only loaded when the
video's `sourceCaptions` setting is on (dashboard: "Show the source's own subtitles").
Subtitles burned into the video's pixels cannot be removed by any player — that is the
file, not a track.

**Player badge / logo** — free accounts show the real Videokr mark linking to the site;
lifetime accounts replace it with their own `logoUrl`, `logoLink` and `logoPosition`.

**Quality** — `npm run lint`, `npm run typecheck` and `npm test` (34 unit tests, including
the seat ladder and webhook signature rejection of tampered bodies, wrong secrets, missing
headers and stale timestamps) all pass.

**Production checks run against the live Worker (2026-08-19):** signup 201; `GET /api/billing`
→ `checkout_ready: true`; `POST /api/billing/checkout` → a real
`checkout.dodopayments.com/session/...` URL; a bogus-signature webhook → 401 with no plan
granted; video create → `/v/<slug>` 200 and the page renders `sf-player` + `sf-controls` +
the free-tier `sf-badge` in a real browser, which closes the earlier blank-player P0; the
test project, video and rows were deleted afterwards (`/v/` now 404s).

## 2b. Player interaction audit (2026-08-18, run against production)

Every control was driven in a real browser on `/v/demo` (YouTube-backed) and on the landing
demo (`/#demo`, direct MP4). Console errors on both pages: none.

| Control | Result |
| --- | --- |
| Big play / play-pause | works on both sources |
| Progress click-to-seek | works (16:17 clip: click 75% → 12:13, click 20% → 3:15) |
| Progress drag-scrub | **fixed this pass** — only a click handler existed, so dragging did nothing; a document-level drag now follows the pointer after it leaves the 5px rail |
| Time readout | tracks playback and seeks |
| Volume slider | works (0.35 applied, icon state correct) |
| Mute button and `M` | works, icon flips both ways |
| Speed menu | works (1x → 1.5x applied to real playback) |
| Chapters menu | works (jumps and resumes) |
| Captions button | toggles; **fixed this pass** — the `C` key now goes through the same `Player.toggleCaptions()`, so the button's active state stays in sync instead of changing the track silently |
| Quality menu | built after load, only when the source exposes 2+ renditions (earlier fix: it was appended before the control bar existed). Not exercised against a real multi-rendition HLS manifest |
| Picture-in-picture | works on MP4 (enter and exit verified); hidden on YouTube/Vimeo, which do not expose it |
| Fullscreen and `F` | enters and exits |
| Keyboard seek (`J`/`L`/arrows) | works |
| Sticky miniplayer | **fixed this pass** — the IntersectionObserver watched the player itself, so turning `position: fixed` made it intersect again and instantly cancelled the state it had just entered; it now measures an in-flow sentinel and reserves the vacated height |
| End of video | pauses, clears the playing state, masks and rewinds the source frame |
| Source chrome | **fixed again this pass** — verified frame-by-frame on a linked source across start, first 4 s of playback, hover during playback, mid-drag, after-drag, keyboard pause, hover while paused, seek-while-paused and resume: masked in every non-playing state, no source title, channel, logo, "More videos" or native control bar |

Landing demo: direct MP4 at `/media/demo/videokr-demo-16x9.mp4` with a real 16:9 poster
(`videokr-demo-16x9.jpg`) — the original clip was letterboxed, so it was cropped
(`crop=1280:544:0:88`) and rescaled to true 16:9 rather than stretched.

Still unproven in the player: a real multi-rendition HLS quality switch, the Vimeo adapter's
controls and captions (no Vimeo test video exists in the account), and mobile (~390px) plus
reduced-motion passes.

## 2c. videoo.org parity audit (2026-08-20)

Their public feature list was taken from videoo.org's own marketing pages and player, then
each item was checked against Videokr in production. "Verified" means a real request or a
real browser interaction against the live Worker, not the presence of a route.

| videoo.org feature | Videokr | Evidence |
| --- | --- | --- |
| Video management, projects | yes | verified (CRUD + projects API) |
| Stream from anywhere (YouTube, Vimeo, S3/any URL) | yes — YouTube, Vimeo, MP4, HLS, own upload | YouTube + uploaded media verified; **Vimeo and multi-rendition HLS still untested** |
| Embed on site / email / social | yes | script embed, `/e/<key>` iframe, share sheet with X, LinkedIn, Facebook, WhatsApp, email |
| Full player customisation, custom colours, skins | yes | per-control toggles, accent, background, radius, skins |
| Custom branding / own logo | yes | lifetime accounts set logo, link, corner; free shows the Videokr mark |
| Custom thumbnails, editable | yes | verified |
| Custom end screens | yes | end-screen CTA |
| Interactive CTAs / action ads | yes | overlay, lower-third, end screen — **browser interaction not re-verified this pass** |
| Lead capture | yes | email gate pauses playback, CSV export |
| Password protection | yes | verified in production (`password_required` → unlock token) |
| Private / unlisted link sharing | yes | verified |
| Domain embed restrictions | yes | verified (allowlist + wildcards) |
| Visitor analytics and tracking | yes | plays, completions, retention buckets, devices, referrers, countries |
| SEO-friendly video pages | yes | `/v/<slug>` with OG, Twitter player card, VideoObject JSON-LD |
| Playback speed, hotkeys, PiP | yes | verified in the interaction audit |
| Related video suggestions | **added this pass** | `player.related` opt-in; end screen lists up to 6 of the *owner's own* public videos, verified in the embed payload |
| Video sharing options | **added this pass** | share button + copy link / copy iframe, verified in the payload (`share.url`, `share.embed`) |
| Playlists, up to 50 per page | yes | `/pl/<slug>`, sidebar / grid / filmstrip, autoplay-next |
| Embeddable playlists | **added this pass** | `/ep/<slug>` bare iframe target + `embed.js data-playlist`, verified 200 with no site chrome |
| Page-level privacy for playlists | **added this pass** | migration `0005`; verified live: public 200, unlisted `noindex`, password → 401 lock form, wrong password 401, correct password redirects with a signed token, bad token 401 |
| No hosting costs for the customer | yes | free tier is permanent |
| User profile / channel page | **missing** | a public per-user channel listing is not built |
| Unlimited videos | **intentionally different** | free tier caps at 5 videos (402); lifetime is uncapped |

Not claimed as parity yet: a public channel page. Vimeo playback, HLS quality switching,
the share sheet and the playlist embed were all verified in a browser in the control-bar
pass below.

## 2d. Control-bar rebuild (2026-08-20, verified in a browser on production)

The reference player we are measured against runs Plyr 3.6.8 with its default skin. Its
layout was reproduced in our own player rather than adopting a third-party runtime, so all
Videokr behaviour (source isolation, CTAs, gates, analytics, playlists, sticky miniplayer,
branding) is untouched.

- One flex row: rewind 10s, play/pause, forward 10s, progress, current time, duration,
  volume, captions, PIP, settings gear, share, fullscreen, Videokr badge (the badge now
  lives in the bar instead of floating over the picture).
- Reference metrics: 10px control spacing, 18px inline-SVG icons, 3px control radius, 5px
  range track with a 13px handle, translucent-white menus and tooltips, gradient bar that
  fades in on hover or while paused, circular accent centre play button.
- Speed, quality and chapters now live in one settings gear with a panel stack (home list →
  sub-panel with a back row and radio rows), so the bar width no longer grows with the
  number of renditions or chapters.
- Progress markup: `.sf-progress` (19px hit area) wraps `.sf-progress-rail` (5px) holding
  buffer, played, chapter markers and handle.

Verified in a recorded browser pass on production (`561781ba`, then `eda3ec59` for the
narrow fix): every control in the bar including click and drag seeking with the scrub
tooltip, ±10s, volume/mute, PIP, the gear (speed radio rows, keyboard speed updating the
row, HLS quality Auto→1080p applied without a stall), share sheet, fullscreen; YouTube
source isolation still clean in stopped, first seconds, hover-while-playing, paused,
mid-drag, seek-while-paused and resume; **Vimeo natural end now masked** (no "More from …",
no recommendation grid, no "+ Follow"); **playlist script embed auto-height** hugs its
content with no dead band; landing demo 16:9 with its poster; and the ≤420px layout
(rail keeps a usable width, volume slider/rewind/forward/PIP dropped, badge mark-only and
not clipped). No console errors, no 5xx.

Still unproven in a browser: the captions toggle and the chapters gear row — no source in
the test account carries a `.vtt` track or chapters.

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
2. **Remaining UI checks:** reduced-motion behaviour, and whether every brand PNG is clean
   on the dark background (they came from the supplied images and may retain dark edges or
   halos). Also unproven: the captions toggle and the chapters row (needs a video with a
   `.vtt` track and chapters). Minor known UX nit: while playing, the first click on the
   gear/PIP/share can land as play/pause because the bar is still faded.
   The ~390px layout is now verified.
3. **Attach the custom domain** (your call — deliberately left undone). `videokr.com` was
   in pending-delete on 2026-08-18, so it needs a backorder/drop-catch, not a normal
   registration. After pointing DNS, update `PUBLIC_BASE_URL` in `wrangler.toml` and the
   Dodo webhook URL.
4. **Seeded demo account.** `demo@streamforge.app` still exists in production but its
   seeded password no longer works (login returns 401) — delete the row when convenient.
5. **Backend naming.** Worker, D1, R2 bucket, package and repo are still named
   `streamforge`, and the legacy `x-streamforge-signature` webhook header remains. All are
   compatibility-sensitive and invisible to customers; rename only deliberately.
6. **Overage is calculated but never collected.** Plays past a paid allowance are counted
   and displayed to the customer and in the admin portal, but nothing bills them — there is
   no Dodo usage-charge or invoice call yet. Until that exists, overage is a reporting
   number, not revenue.
7. **Storage is metadata only.** Each plan carries a fair-use storage ceiling, but uploaded
   bytes are not totalled per account and nothing enforces the ceiling. The cold-storage
   lifecycle (move media with no plays for 60 days to infrequent-access) is also not built.
8. **View identity is weak.** `view_id` comes from the client, so a determined caller can
   rotate it to inflate an owner's counted plays, or reuse one to suppress them. Fine for
   billing at this scale, not fine as an anti-abuse control — a server-derived, salted
   fingerprint should replace it before overage is actually charged.
9. **Real subscription payments are unproven.** The lifecycle was verified with signed
   synthetic events; no live card has been run through a Starter or Agency checkout, so the
   real payload field names are still assumed from Dodo's docs.
10. **Nice-to-haves not built.** A public per-user channel page (the only remaining
    videoo.org parity gap), transcript search, auto-captions, and localised INR checkout in
    Dodo.

## 4. Honest caveats to keep in the copy

- Hiding YouTube's controls and branding conflicts with YouTube's terms. Own-media mode
  (R2 MP4/HLS) exists for that reason and is the recommendation for branding-critical
  embeds.
- "Runs on Cloudflare's free tier" is true, and R2 egress is free, but the free quotas
  (roughly 100k Worker requests/day) are real; extremely high traffic can eventually need
  a paid Cloudflare plan. That is a bill from Cloudflare, never a subscription from us.
- Externally hosted MP4 playback could not be proven from the test sandbox (the host was
  blocked there). YouTube and uploaded R2 media both play.
