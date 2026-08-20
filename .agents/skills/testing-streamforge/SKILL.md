---
name: testing-streamforge
description: How to run browser E2E tests of the StreamForge/Videokr Cloudflare Worker app (Hono + D1 + R2) locally or against the deployed Worker — dev server, seeded logins, sandbox media limitations, source-provider (YouTube/Vimeo/HLS) chrome-isolation checks, playlist privacy/embeds, and UI selectors for the dashboard and player.
---

# Testing StreamForge locally (browser E2E)

## Bring the app up

```bash
cd /home/ubuntu/repos/streamforge
npm install
npm run db:migrate:local
npm run seed:local
npm run dev            # wrangler dev -> http://localhost:8787 (local D1 + R2 simulated)
```

If port 8787 is already in use it is usually an existing dev server for the same
checkout — reuse it (`curl -s localhost:8787/healthz` returns `{"ok":true,...}`)
rather than killing it blindly.

Seeded account: `demo@streamforge.test` / `streamforge123`
(overridable via `SEED_EMAIL` / `SEED_PASSWORD`, see `scripts/seed.mjs`).
Seeded content: `/v/streamforge-product-tour` (YouTube) and `/v/open-media-sample`
(external MP4), one playlist, one project, one lead, one webhook.

## Sandbox media limitation (important)

External media hosts may be reachable from the shell (`curl` gets 206) but still
fail inside the sandboxed Chrome — e.g. `test-videos.co.uk` MP4s produce a
`<video>` with `error.code 4`, `readyState 0` and a stuck `0:00 / 0:00` display,
with **no JS console error**. That looks like a product bug but is an environment
limitation. YouTube embeds (id `c65tLZVgkcY`) did load and play.

Reliable workaround: create a same-origin asset by uploading your own file through
the dashboard "New video" file picker (goes to local R2, served from `/media/...`):

```bash
ffmpeg -f lavfi -i testsrc=size=640x360:rate=25:duration=12 \
  -f lavfi -i sine=frequency=440:duration=12 \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -movflags +faststart -y /tmp/e2e_sample.mp4
```

In the native GTK file chooser, press `Ctrl+L` (or just type `/`) and enter the
absolute path `/tmp/e2e_sample.mp4`, then Open.

When a video element shows no picture, verify real playback state instead of
guessing: read `error.code / readyState / networkState / currentTime / duration`
of the `video` element via the console once — don't use the console for clicking
or navigation.

## Useful selectors

Dashboard (`public/app.html` / `public/app.js`):
- side nav: `nav button[data-view="videos|playlists|projects|leads|integrations"]`
- new video modal: `#new-video`, `#nv-title`, `#nv-source`, file input, `#nv-save`, `#nv-error`
- editor tabs: `button[data-tab="details|player|chapters|ctas|access|embed|stats"]`
- player tab: `#pc-skin`, `#pc-accent` (native colour picker — set it with the
  keyboard after clicking, then verify the input value after an F5 reload),
  `#pc-controls` checkboxes
- chapters/CTAs: `#add-chapter`, `#add-cta`, `#chapters-rows`, `#ctas-rows`
- access: `#ed-visibility`, `#ed-password`; embed: `#snip-iframe`, `#copy-script`
- save: `#ed-save` (PATCH video, then PUT chapters, then PUT ctas — check all three persisted after reload)
- playlists and projects are created through `window.prompt` — type the title and press Enter
- webhooks: `#wh-url`, `#wh-events`, `#wh-secret`

Player (`public/player/player.js`): `.sf-play`, `.sf-mute`, `.sf-fs`, `.sf-bigplay`,
`.sf-progress`, lock card `[data-sf="lock-password"]` / `[data-sf="lock-submit"]`.

Progress-bar drag: `mouse_move` to the bar first, then `left_mouse_down` with **no**
coordinate (the tool rejects a coordinate on `left_mouse_down`), move, then
`left_mouse_up`.

## Keyboard handler vs. typing (regression-prone area)

`Player.prototype._bindKeys` binds a keydown handler on the player root
(`tabIndex = 0`) and, when `payload.captureDocumentKeys` is set (`public/page.js`,
`public/playlist.js`) or the player is inside an iframe, the *same* handler on
`document`. The handler must (a) return early for `INPUT|TEXTAREA|SELECT` targets
and (b) mark `event.__sfHandled` so root + document listeners cannot both act.
A regression in either guard is easy to miss and very damaging: text inputs
rendered *inside* the player root (CTA email gate, `[data-sf="lock-password"]`,
volume `input[type=range]`) silently lose every character that is also a shortcut
(`m f j k l p c`, digits, space) because the handler calls `preventDefault()`.

Always re-test with strings that contain those characters — a weak string like
`a@b.co` passes even when broken:
- lead gate: type `milk.jack@example.com` → the field must read exactly that, the
  time display must not jump, and no picture-in-picture window may open. When
  broken it lands as `i.a@exae.o`, the clip jumps to the end, and `p` opens PiP.
- password lock: set a password like `pfm123pass` and type it into the lock card →
  must unlock. Broken builds submit `as` and show "incorrect password". Always run
  a wrong-password attempt too, so "unlock succeeded" means something.
- single-fire spot-check with focus **not** in an input: `space` must toggle
  play/pause (double-fire looks like nothing happening), `ArrowRight` must move the
  position by exactly 5s (double-fire = 10s), `m` toggles the mute icon, `f`
  toggles fullscreen.

Gotchas when driving this in the browser:
- Clicking "empty" space in the control bar often lands on the volume slider
  (`input[type=range]`), which now correctly *ignores* player hotkeys — hotkeys will
  look dead. Click the play button or the page `<h1>` instead to control focus.
- The control bar auto-hides during playback; `mouse_move` over the player before
  screenshotting the mute/time indicators, and zoom into the bar region.
- Verify state while paused: pause first, note the exact time, then press the key.

Post-unlock hotkeys: the unlock path rebuilds the payload, so it must copy
`captureDocumentKeys` onto it (`public/player/player.js`, near the unlock handler) or
body-focused hotkeys die after a correct password. This regressed once and was fixed;
always re-verify it explicitly — unlock, click the page `<h1>`, then `ArrowRight`
(exactly +5s), `space` (single toggle), `m` (mute icon toggles). Verified working on
the deployed Worker.

To see the mute icon at all, the "Volume" control must be enabled on the Player tab —
if an earlier customization test unchecked it, re-enable and save before testing `m`.

## Testing the deployed Worker (production)

Base URL pattern: `https://<worker>.workers.dev` (e.g.
`https://streamforge.getlaunchpod.workers.dev`), backed by real D1 + R2. Sanity check
`/healthz` → `{"ok":true,"service":"streamforge"}`.

- Remote seed: `node scripts/seed.mjs --remote`. Prod demo credentials may be written to
  a local file (e.g. `/home/ubuntu/prod_demo_login.txt`, `SEEDPW=` line). Never print it;
  type it with
  `PW=$(grep '^SEEDPW=' file | cut -d= -f2-); xdotool type --delay 40 -- "$PW"`.
- `wrangler.toml` `PUBLIC_BASE_URL` drives the public page's OG/twitter/JSON-LD URLs
  (`src/routes/public.ts` `pageShell`), while the dashboard Embed snippets use
  `location.origin` (`public/app.js`) — check both if a host looks wrong.
- Uploaded media is served from `/media/<userId>/<id>.<ext>` with range support; confirm
  seeking out of band: `curl -r 0-1023 -o /dev/null -D - <media url>` must return
  `HTTP/2 206` + `content-range`.
- Testing on prod leaves real rows (videos, playlist, leads, analytics events). Note them
  in the report so the owner can clean up; prefer clearly-prefixed titles like `Prod ...`.
- Note `/e/<key>` accepts both the video id and the slug (both return 200).
- xdotool key names: use `Right`/`Left`/`space`, **not** `ArrowRight` (the tool errors).

## Source providers: chrome isolation, Vimeo and HLS

The product's promise is that the source player's own chrome is never visible. Only the
**YouTube** adapter wraps its iframe in `.sf-yt-crop` / `.sf-yt-frame` (geometry crop);
the **Vimeo** adapter mounts a plain `.sf-media` iframe and relies only on
`?controls=0&title=0&byline=0&portrait=0`. Consequence observed on prod: Vimeo is clean
while stopped/playing/hovered/paused/mid-drag/after-seek, but at **natural end** Vimeo's
own "More from <channel>" suggestion grid + "+ Follow" button render on top of the stage.
Always test the *end* state explicitly for every provider; a crop wrapper (or
`?endscreen=0`-style params / an opaque overlay at `ended`) may be needed for Vimeo.

Picking test sources:
- Many Vimeo ids fail for reasons unrelated to the product: `76979871` shows Vimeo's own
  "Rights issue — we're having trouble authorizing playback", `148751763` shows "This video
  does not exist". Verify a candidate id standalone at
  `https://player.vimeo.com/video/<id>` before blaming the player. `1084537` worked.
- HLS: `https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8` plays in the sandbox and exposes
  6 quality entries (Auto/184p/288p/480p/720p/1080p) via hls.js loaded from jsDelivr, so the
  quality menu needs outbound CDN access. The quality button label is the current selection.
- Short, always-available clip for end-screen/related tests: the same-origin hosted
  `/media/demo/videokr-demo-16x9.mp4` (external `test-videos.co.uk` MP4s still fail in the
  sandbox browser with media `error.code 4`).
- Duration must often be typed manually in the editor for non-HTML sources, otherwise the
  queue/progress UI shows the stored value rather than the real one.

## Playlist privacy and embeds

- Playlists tab: "Page privacy" select (public/unlisted/password) + password field +
  **Save privacy** (separate from "Save items"). `GET /pl/:slug` renders a lock form on
  `password`; `POST /pl/:slug/unlock` returns 401 + "Incorrect password."; unlisted loads
  normally. Hard-reload between privacy changes — the page is server-rendered.
- Cross-origin script embed works from a `file://` page:
  `<script src="<base>/embed.js" data-playlist="<slug>" async></script>`. It mounts
  `/ep/<slug>` in an iframe with no site chrome (`sf-page-bare`) and plays. Known cosmetic
  issue: `embed.js` uses a fixed 16/11 ratio for playlists, so there is a large empty black
  band under the stage — check sizing, not just mounting.
- Free-tier accounts render a small "Videokr" `.sf-badge` pill bottom-right above the
  controls on public pages and embeds; verify it does not overlap the controls/watermark.

## Share sheet clipboard check

Player Share button opens `.sf-share` with X / LinkedIn / Facebook / WhatsApp / Email plus
"Copy link" and "Copy embed code". Values come from `shareLinks()` in
`src/routes/public.ts` and use `PUBLIC_BASE_URL` (videos `/v/` + `/e/` 640x360, playlists
`/pl/` + `/ep/` 640x440). Prove the clipboard by pasting into a scratch tab's URL bar or a
textarea — do not trust the toast.

## Deployed-asset caching gotcha

After a Worker deploy, fetch static assets with the **plain** URL. A cache-buster query
string (`/player/player.js?v=123`) can return a *stale* edge-cached copy, which makes a
shipped fix look missing. Hard-reload the browser (Ctrl+Shift+R) before re-testing.
Historical bug worth re-checking after refactors: `/v/` and `/pl/` pages went blank because
`player.js` exposed only `window.StreamForge` while `page.js`/`playlist.js` call
`window.Videokr`; the file must end by assigning **both** globals.

## Devin Secrets Needed

None for local runs (simulated D1/R2). For production runs you need the deployed base URL
plus the seeded prod demo password (kept in a local file, e.g. `prod_demo_login.txt`), and
`ffmpeg` to generate a test MP4 for the own-media upload path.
