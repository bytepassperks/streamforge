/**
 * Embeds that were rendered without an explicit ratio let the player tell
 * them their real shape: a playlist measures itself and posts its height, a
 * video posts its intrinsic ratio once its metadata has loaded.
 */
(function () {
  'use strict';

  function clamp(ratio) {
    var value = Number(ratio);
    if (!isFinite(value) || value < 0.2 || value > 6) return 0;
    return Math.round(value * 1000) / 1000;
  }

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || !data.videokr) return;

    if (data.videokr === 'height' && data.height) {
      Array.prototype.forEach.call(
        document.querySelectorAll('.videokr-embed.videokr-autoheight'),
        function (box) {
          var frame = box.querySelector('iframe');
          if (!frame || event.source !== frame.contentWindow) return;
          box.classList.add('videokr-sized');
          box.style.height = Math.round(data.height) + 'px';
        }
      );
      return;
    }

    if (data.videokr === 'ratio' && data.ratio) {
      var ratio = clamp(data.ratio);
      if (!ratio) return;
      Array.prototype.forEach.call(
        document.querySelectorAll('.videokr-embed.videokr-autoratio'),
        function (box) {
          var frame = box.querySelector('iframe');
          if (!frame || event.source !== frame.contentWindow) return;
          box.style.aspectRatio = String(ratio);
        }
      );
    }
  });
})();
