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
- Short, always-available clip for end-screen/related tests: upload one through the **New
  video** modal and reuse the returned same-origin `/media/<user>/<id>.mp4` (external
  `test-videos.co.uk` MP4s still fail in the sandbox browser with media `error.code 4`).
  Delete such uploads afterwards so production keeps no test media.
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
  issue (fixed in later builds): `embed.js` used a fixed 16/11 ratio for playlists, so there
  was a large empty black band under the stage. The current mechanism is the bare `/ep/` page
  posting `{videokr:'height', height}` to the parent every 500ms and `embed.js` setting
  `wrap.style.height` from it — only when the script tag has **no** `data-ratio`. Check sizing,
  not just mounting: put the embed in a `file://` host page with a brightly-outlined container
  and a footer right below it, so dead space is obvious in a screenshot.
- Free-tier accounts render a small "Videokr" `.sf-badge` pill bottom-right above the
  controls on public pages and embeds; verify it does not overlap the controls/watermark.

## Player control bar (Plyr-style rebuild) and responsive checks

The control bar is a single flex row inside `.sf-controls` (`.sf-controls-row`/`.sf-group` are
gone), order: `.sf-rewind`, `.sf-play`, `.sf-forward`, `.sf-progress-wrap`, current time,
duration, `.sf-volume`, `.sf-cc`, `.sf-pip`, `.sf-settings` gear, `.sf-share`, `.sf-fs`,
`a.sf-badge` (badge lives **inside** the bar). Icons are inline 18px SVGs; tooltips are pure
CSS `.sf-btn[data-tip]:hover::after` and are suppressed while `aria-expanded="true"`.
Rewind/forward are ±10s (not ±5s). Speed/quality/chapters all live in the one gear panel
stack (home row with a `.sf-menu-value`, sub panel with a `.sf-back` row and
`role=menuitemradio` rows); keyboard `>`/`<` must update the Speed row value too.

Gotcha when driving the gear/PIP/share buttons while the video is **playing**: the first
click after the bar has faded frequently registers as a play/pause toggle instead of hitting
the button. Move the mouse over the player, wait for the bar, then click — and if the panel
did not open, click the same button again before calling it a bug.

Testing ~390px widths: the Chrome window cannot be resized below ~532px on this box, so
simulate a phone viewport by loading the embed in a fixed-width iframe from a local page:

```html
<div style="width:390px;border:3px solid #ff2d78">
  <iframe src="https://<base>/e/<slug>" width="390" height="220"
          allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
</div>
```

The iframe document's viewport is then 390px, so `@media (max-width: 420px)` in
`public/player/player.css` applies. Known trap: that media block is declared **before** the
base `.sf-volume` / `.sf-volume input[type=range]` rules, so the later base rules win and the
volume slider stays visible at mobile widths while the progress rail gets squeezed to ~0px
and the badge overflows past the right edge. When a mobile-layout rule looks ignored, check
rule order in `player.css` before assuming the media query does not match.

## Skins vs. the settings gear (a real bug class here)

Skins are `videokr` (default), `frame`, `pop`, `studio`, set in the editor's **Player** section
(`Skin` select) → *Save changes* → hard-reload the public page. Per-skin bar expectations:
`videokr` and `pop` hide the bar's own `.sf-rewind`/`.sf-forward` (pop also hides `.sf-pip`),
while `frame` and `studio` show both skip buttons plus time labels; `videokr` hides `.sf-time`
so speed changes cannot be measured on it — measure a rate change on `frame`/`studio`
(e.g. pick `2x`, play, note the elapsed label advance ≈ 2× wall time).

Regression to always re-check after CSS changes: the settings menu's home rows are also
`button.sf-menu-item.sf-forward`, so any **unscoped** `.sf-forward { display: none }` (skin
rules, or the `@media (max-width:420px)` block) empties the gear panel into a thin white
sliver that still reports `aria-expanded="true"`. Hides must be scoped to
`.sf-controls > .sf-forward`. Likewise an absolutely-positioned `::after` pointer on
`.sf-menu-list` forces a scrollbar inside the scrollable list — it belongs on
`.sf-menu.sf-open`. So "the gear opens" is never a sufficient assertion: name the rows that
must be *visibly* present (`Speed` with its value, `Chapters`, `Quality` on HLS), drive the
sub-panel, and check the same thing at 390px in the iframe harness.

`Quality` only appears when the adapter reports ≥2 HLS levels. Quick fixture: create a video
whose Source URL is `https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8` (hls.js is pulled
from jsdelivr; both hosts are reachable), press play once so the manifest parses, then open
the gear — expect `Auto / 184p / 288p / 480p / 720p / 1080p`.

PIP can only open a real floating window on an `HtmlAdapter` source (MP4/HLS); on a YouTube
iframe there is no `<video>` to hand to the PIP API. Use the HLS/MP4 fixture for PIP: the
inline area then reads "Playing in picture-in-picture" and a separate always-on-top window
appears over the desktop; clicking the button again returns it inline.

`Escape` closes an open settings panel (since `94f71ca`); when no panel is open the handler
sets `handled = false` so the browser still exits fullscreen. Test both, in that order.

## Faded control bar and the "first click is swallowed" class of bug

`show()` in `public/player/player.js` adds `.sf-active` and arms a 2.5 s fade timer that only
fires `if (!overBar && !paused)` — so **the bar never fades while the video is paused**. To
reach the faded state you must be playing, then leave the pointer still for >2.5 s. `overBar`
is bound to `mouseenter`/`mouseleave` on `.sf-controls` only; the right-hand `.sf-rail` has no
such binding, so parking over the rail *does* let the bar fade.

The guard (`overHiddenControl`) only runs on the overlay's own click, i.e. when the pointer
lands on a **hidden** control's footprint from outside. Two traps that bit real fixes here:
the hidden bar is `transform: translateY(100%)`, so mid-slide its own `getBoundingClientRect()`
sits *below* the stage and a footprint test against the bar never matches — the check must be
measured off the **player** (bottom strip `controls.offsetHeight` tall); and it must be
time-boxed (`wokeAt` + `WAKE_MS = 450`) so it does not swallow legitimate clicks once the bar
is already visible. As of `c608527` this works on `videokr`, `frame` and at 390px.

Since `0e12bc7` the same rule also covers the right rail, via a **capture-phase** `click`
listener on the player root: within `WAKE_MS` of a wake and only while playing, a click whose
target is inside `.sf-rail, .sf-controls` is swallowed (`stopPropagation` + `preventDefault`)
and only re-shows the controls. Consequences when testing:
- The rail's first click is wake-only (no share sheet, no PIP) and the second activates it.
- Since `308cdae` the `mouseenter`/`mouseleave` → `overBar` pair is bound to **both**
  `.sf-controls` and `.sf-rail` (loop over `[this.controls, this.rail]`), so resting the pointer
  on the rail keeps the controls awake indefinitely and the second click can come much later
  (verified with a ~5 s gap). The discriminating evidence for that fix is a screenshot taken
  *during* the wait **without moving the mouse**: bar and rail must still be visible.
- Before `308cdae` the rail was not part of `overBar`, so the controls refaded after 2.5 s and a
  later click was *again* just a wake click. If you are testing an older build (or the hover
  binding regresses), issue both clicks in the same tool call ~1 s apart, otherwise "the button
  never works" is a test artefact, not a bug.
- To test the visible-controls single-click path, hover the **bottom bar** (`.sf-controls`) for
  ~4 s first, then click the rail button; that keeps `.sf-active` on and `wokeAt` stale.
- The listener must stay inert while paused: a stopped/paused player must start on one click on
  the centre/bar play button, and paused gear/share/PIP must activate on one click.

### Proving rail CC end to end (needs a real `<video>` + a captions track)
The YouTube-sourced probe video has no `<video>` and no `captions_url`, so the CC button is
hidden (`hasCaptions()` false → `display:none`, player.js ~1179). Use the MP4/HLS video
(`/v/hls-check`), and give it captions through the UI: editor → **Subtitles** → `Choose File`
(`#ed-captions-file`, accepts `.vtt`) → **Upload .vtt** → status reads `Uploaded — save to apply.`
and `Captions .vtt url` fills with `/media/....vtt` → **Save changes**. A useful fixture is a
VTT with back-to-back 4 s cues across the whole duration and distinctive text (e.g.
`SF CAPTION TEST cue 78`), generated with a few lines of Python — then a cue is on screen no
matter where playback happens to be. Cues are painted by Chrome natively and lifted
`line = -3` clear of the bar, so a screenshot is valid proof. The 1 MB vtt upload cap applies.

When testing it, always assert the playback state *across* the click (centre play glyph absent
+ progress fill/elapsed still advancing); "the bar came back" is not sufficient, because a
pausing click also brings the bar back (see the fade rule above). Also test the inverse in the
same pass — a click on the picture away from the bottom strip/rail must still toggle play on
the very first press, and a single click on the gear of an already-hovered bar must open the
panel immediately — otherwise an over-eager wake guard looks like a pass.

## Profile view and image uploads (dashboard)

The top-bar user chip (`#user-chip[data-view="account"]`) opens the **Profile** view
(`#ac-name`, `#ac-email`, `#ac-password`, `#ac-current`, `#ac-save`, status in `#ac-state`).
A name-only save needs no password; an email or password change without the right
`current_password` is refused with `current password is incorrect`. Never trust the success
toast for a password change — prove it by signing out and checking that the **new** password
is accepted *and* the old one is rejected, then restore the original password.

File pickers `#ed-thumb-file`, `#ed-thumb-b-file` (Thumbnail section) and `#pc-logo-file`
(Player section) accept PNG/JPEG/WebP up to 5 MB, fill the sibling url input with a
`/media/...` url and toast `Image uploaded — save to apply`; oversize files toast
`Images have to be 5 MB or smaller` client-side with no request. The composer's video picker
keeps its own `(max 200 MB)` cap — check it did not inherit the image limit. Fixtures:
`python3 -c` with Pillow for small PNG/JPG/WebP, and a valid PNG padded with zero bytes past
5 MB for the oversize case. Chrome's native file chooser does work in this sandbox (unlike
`confirm()`/`prompt()`), so uploads can be driven fully through the UI.

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

## Proving captions (CC) and chapters

Two fixtures work, both same-origin (`HtmlAdapter` sets `crossorigin="anonymous"` whenever
`captionsUrl` exists, so a cross-origin .vtt without CORS silently yields no track and the CC
button is hidden entirely):

1. Landing page demo (`/#demo`) is the hosted product film, which already carries captions
   and eight chapters — fastest read-only fixture, needs no setup.
2. Own video: the editor Details tab has only a **"Captions .vtt url" text field**, no file
   picker. Upload the .vtt through the **New video** modal's file input (`POST /api/uploads`
   accepts `text/vtt`, and falls back to the `.vtt` extension), copy the returned
   `/media/<user>/<id>.vtt` and paste it into the captions field. Set **Duration (seconds)**
   too, otherwise marker positions cannot be predicted. Chapters live on the editor's Chapters
   tab (repeater rows); one "Save changes" click PATCHes the video and PUTs the chapters.

What to assert: CC button present (its presence already proves the track loaded), dimmed and
no text at load; click → cue text over the picture at the cue's timestamp; a deliberate gap
between cues shows **no** text (guards against a static overlay); second click removes it;
keyboard `c` toggles it too (click the stage first to focus the player root). Chapters: markers
at `start/duration` %, hover tooltip reads `m:ss · Chapter title` and flips exactly at the
boundary second, gear home shows a `Chapters` row, sub panel rows read `m:ss  Title`, selecting
one seeks + plays, and the title bar reads `Video title — Chapter title`.

Cosmetic thing seen on prod: caption cues render at the video's bottom edge, so while the
control bar is visible the cue text overlaps the bar/time label. Take caption screenshots with
the bar faded (mouse off the player) if you want clean evidence.

Uploaded .vtt objects in R2 have no delete UI — deleting the video leaves the object; call that
out as retained instead of hunting for a cleanup path.

## Auditing production

Base url `https://streamforge.getlaunchpod.workers.dev`. `/app.html` and `/login.html` 307 to
`/app` and `/login`, and `/` redirects to `/app` while a session cookie exists — sign out
(Plans → Sign out) before auditing the landing page. Sign up a throwaway account rather than
using a customer's; note the credentials in the report.

Unlike local `wrangler dev`, native `prompt()`/`confirm()` **do** render against production in
this Chrome session, so New project, New playlist and Delete video are all clickable there.

Two traps that cost real time: MP4 fixture urls `https://test-streams.mux.dev/...mp4` (404) and
`https://www.w3schools.com/html/mov_bbb.mp4` (403) are dead from this machine — `curl -I` a
fixture before blaming the player. And a pane stuck on `Loading…` used to be a silent request
failure (the toast had already expired); panes now render an error with a **Try again** button,
so a bare `Loading…` that never resolves is a genuine new bug worth reporting.

### The editor's default-open pane may never call its loader

Editor tab panels load their data from the tab **click** handler (`app.js`, the
`data-tab === 'stats'` / `'form'` branches calling `loadVideoStats()` /
`loadFormSubmissions()`), while `app.html` ships `#stats-body` pre-filled with the literal text
`Loading…` and `data-panel="stats"` already `active`. So the pane you see when the editor
*opens* can sit on `Loading…` for ever without any request being made — no console error, no
`Try again`, because `panelError()` only runs if the loader ran. Discriminator: click any other
section then click back; if the data appears instantly, the loader was never invoked on open
and this is a wiring bug, not a slow/failing request. Never judge "the pane hangs" from the
first open alone, and conversely never accept a `Loading…` on first open as normal latency.

### Forcing the error panel through the UI (no devtools)

To make a stats request legitimately fail: open a video's editor in tab A, then in tab B delete
that same video (card → Edit → `Delete video` → accept the native confirm), then back in tab A
click another section and click **Analytics**. `GET /videos/:id/stats` 404s and the pane renders
`not found` + a working **Try again**. The 20s `AbortController` timeout copy
(`the request timed out`) shares the same renderer but cannot be forced through the UI alone —
report it as untested rather than implying you saw it.

### Modal buttons move when a row is removed — re-screenshot before clicking Save

`Remove CTA` / `Remove form` / removing a chapter shrinks the editor modal, so `Save changes`
jumps up by ~60px. If you click the old coordinates the save silently never happens and the
row "comes back" after a reload, which looks exactly like a removal-persistence bug. Always
take a fresh screenshot after removing a row, click the button where it now is, and confirm the
`Saved` toast before reloading. (Verified in prod: CTA and Form removal *do* persist.)

### Prod fixture values that work

Vimeo `https://vimeo.com/1084537` (Big Buck Bunny) returns a real oEmbed poster — the old
`76979871` is dead. `https://postman-echo.com/post` is a reliable **200** target for the
webhook `Test` button; `https://<base>/api/no-such-route` is a reliable failure target (the
worker's own fetch sees **404**, so expect `endpoint returned 404 — <date>` in the LAST
DELIVERY column). Missing/broken posters render a dashed tile reading `no art` in both Grid and
List, so a blank grey box is a regression. Library `Copy link` really does put
`https://<base>/v/<slug>` on the clipboard — prove it by pasting into the composer's
**Source URL** field, not from the toast.

## Devin Secrets Needed

None for local runs (simulated D1/R2). For production runs you need the deployed base URL
plus the seeded prod demo password (kept in a local file, e.g. `prod_demo_login.txt`), and
`ffmpeg` to generate a test MP4 for the own-media upload path.
