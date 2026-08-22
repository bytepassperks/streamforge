/**
 * Videokr embed loader.
 *
 *   <script src="https://your-host/embed.js" data-video="vid_xxx" async></script>
 *   <script src="https://your-host/embed.js" data-playlist="my-playlist" async></script>
 *
 * Optional attributes: data-target (CSS selector), data-width, data-ratio,
 * data-autoplay, data-muted, data-start, data-token (password protected pages).
 */
(function () {
  'use strict';

  function origin(script) {
    try {
      return new URL(script.src).origin;
    } catch (e) {
      return '';
    }
  }

  function build(script) {
    var videoId = script.getAttribute('data-video');
    var playlistId = script.getAttribute('data-playlist');
    var key = videoId || playlistId;
    if (!key || script.dataset.mounted === '1') return;
    script.dataset.mounted = '1';

    var base = origin(script);
    /* A playlist page carries its own queue beside the stage, so it needs a taller box. */
    var ratio = script.getAttribute('data-ratio') || (videoId ? '16/9' : '16/11');
    var parts = ratio.split('/');
    var aspect =
      parseFloat(parts[0]) > 0 && parseFloat(parts[1]) > 0
        ? parseFloat(parts[0]) + ' / ' + parseFloat(parts[1])
        : '16 / 9';

    var params = [];
    ['autoplay', 'muted', 'start', 'token'].forEach(function (name) {
      var value = script.getAttribute('data-' + name);
      if (value != null) params.push(name + '=' + encodeURIComponent(value));
    });

    var wrap = document.createElement('div');
    wrap.className = 'videokr-embed';
    wrap.style.position = 'relative';
    wrap.style.width = script.getAttribute('data-width') || '100%';
    /* The shape lives on the box itself: percentage padding would resolve
       against the host's containing block and mis-size a fixed-width embed. */
    wrap.style.maxWidth = '100%';
    wrap.style.aspectRatio = aspect;

    var frame = document.createElement('iframe');
    frame.src =
      base +
      (videoId ? '/e/' : '/ep/') +
      encodeURIComponent(key) +
      (params.length ? '?' + params.join('&') : '');
    frame.title = videoId ? 'Videokr video player' : 'Videokr playlist';
    frame.loading = 'lazy';
    frame.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
    frame.allowFullscreen = true;
    frame.style.position = 'absolute';
    frame.style.inset = '0';
    frame.style.width = '100%';
    frame.style.height = '100%';
    frame.style.border = '0';
    wrap.appendChild(frame);

    /* A playlist's real height depends on its layout and on how many items it holds, so
       the ratio above is only the box it starts in: the page reports its own height. */
    if (playlistId && !script.getAttribute('data-ratio')) {
      window.addEventListener('message', function (event) {
        if (event.source !== frame.contentWindow) return;
        var data = event.data;
        if (!data || data.videokr !== 'height' || !data.height) return;
        wrap.style.aspectRatio = 'auto';
        wrap.style.height = Math.round(data.height) + 'px';
      });
    }

    var target = script.getAttribute('data-target');
    var host = target ? document.querySelector(target) : null;
    if (host) host.appendChild(wrap);
    else if (script.parentNode) script.parentNode.insertBefore(wrap, script);
  }

  function boot() {
    var scripts = document.querySelectorAll('script[data-video], script[data-playlist]');
    Array.prototype.forEach.call(scripts, build);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
