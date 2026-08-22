=== Videokr ===
Contributors: videokr
Tags: video, video player, playlist, embed, video hosting
Requires at least: 6.0
Tested up to: 6.6
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Embed your Videokr-hosted videos and playlists in WordPress with a shortcode or a block — your branded player, your analytics.

== Description ==

Videokr hosts and delivers your video; this plugin puts it on your WordPress site.

* Connect once with an API key, then browse your Videokr library inside WordPress.
* Copy a shortcode, or add the **Videokr** block and pick a video visually with a live preview.
* Embed single videos or playlists, with aspect ratio, width, autoplay, muted start and a start time.
* Your player skin, chapters, captions, CTAs, forms and analytics stay in Videokr, so one change updates every site the video is embedded on.
* The API key never reaches the browser: the library is read server-side and proxied to the editor.

= Getting your API key =

In Videokr open **Integrations → API keys**, create a key, and paste it into **Videokr → Settings** in WordPress. A key is shown only once; if you lose it, revoke it and create another.

== Installation ==

1. Upload the plugin, or install the ZIP through Plugins → Add New → Upload Plugin.
2. Activate it.
3. Go to **Videokr → Settings**, paste your API key and press Connect.

== Usage ==

Shortcode:

`[videokr id="vid_example"]`
`[videokr playlist="launch-week"]`
`[videokr id="vid_example" width="640" ratio="16/9" autoplay="true" muted="true" start="30"]`

Attributes: `id`, `playlist`, `ratio`, `width`, `align`, `autoplay`, `muted`, `start`, `token`.

Block: search for **Videokr** in the inserter, then pick a video or playlist from your account.

== Frequently Asked Questions ==

= Does the video live in WordPress? =

No. Media stays in your Videokr account and is delivered from there, so uploads do not consume your WordPress hosting space or bandwidth.

= Do plays from WordPress count towards my plan? =

Yes — a play is a play wherever the embed lives, and usage is shown in Videokr and on this plugin's screen.

= Can I embed a password protected video? =

Yes, by passing a valid access token with the `token` attribute. Without it the embed asks for the password.

== Changelog ==

= 1.0.0 =
* First release: shortcode, block with library picker, connection screen and playlist embeds.
