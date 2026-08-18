/**
 * StreamForge embed loader.
 *
 *   <script src="https://your-host/embed.js" data-video="vid_xxx" async></script>
 *
 * Optional attributes: data-target (CSS selector), data-width, data-ratio,
 * data-autoplay, data-muted, data-start.
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
    if (!videoId || script.dataset.mounted === '1') return;
    script.dataset.mounted = '1';

    var base = origin(script);
    var ratio = script.getAttribute('data-ratio') || '16/9';
    var parts = ratio.split('/');
    var aspect = (parseFloat(parts[1]) / parseFloat(parts[0])) * 100 || 56.25;

    var params = [];
    ['autoplay', 'muted', 'start'].forEach(function (key) {
      var value = script.getAttribute('data-' + key);
      if (value != null) params.push(key + '=' + encodeURIComponent(value));
    });

    var wrap = document.createElement('div');
    wrap.className = 'streamforge-embed';
    wrap.style.position = 'relative';
    wrap.style.width = script.getAttribute('data-width') || '100%';
    wrap.style.paddingBottom = aspect + '%';
    wrap.style.height = '0';

    var frame = document.createElement('iframe');
    frame.src = base + '/e/' + encodeURIComponent(videoId) + (params.length ? '?' + params.join('&') : '');
    frame.title = 'StreamForge video player';
    frame.loading = 'lazy';
    frame.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
    frame.allowFullscreen = true;
    frame.style.position = 'absolute';
    frame.style.inset = '0';
    frame.style.width = '100%';
    frame.style.height = '100%';
    frame.style.border = '0';
    wrap.appendChild(frame);

    var target = script.getAttribute('data-target');
    var host = target ? document.querySelector(target) : null;
    if (host) host.appendChild(wrap);
    else if (script.parentNode) script.parentNode.insertBefore(wrap, script);
  }

  function boot() {
    var scripts = document.querySelectorAll('script[data-video]');
    Array.prototype.forEach.call(scripts, build);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
