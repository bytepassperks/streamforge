/**
 * A playlist's real height depends on its layout and item count, so the
 * playlist page measures itself and posts its height back. Only embeds that
 * were rendered without an explicit ratio listen for it.
 */
(function () {
  'use strict';

  function boxes() {
    return document.querySelectorAll('.videokr-embed.videokr-autoheight');
  }

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || data.videokr !== 'height' || !data.height) return;
    Array.prototype.forEach.call(boxes(), function (box) {
      var frame = box.querySelector('iframe');
      if (!frame || event.source !== frame.contentWindow) return;
      box.style.paddingBottom = '0';
      box.style.height = Math.round(data.height) + 'px';
    });
  });
})();
