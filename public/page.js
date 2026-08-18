/* Public video page bootstrap: mounts the player and wires transcript search. */
(function () {
  'use strict';

  var payload = window.__SF_EMBED__;
  var root = document.getElementById('sf-player');
  if (payload && root) {
    payload.captureDocumentKeys = true;
    window.StreamForge.mount(root, payload);
  }

  var search = document.getElementById('sf-transcript-search');
  var body = document.getElementById('sf-transcript-body');
  if (search && body) {
    var original = body.textContent;
    search.addEventListener('input', function () {
      var term = search.value.trim();
      if (!term) {
        body.textContent = original;
        return;
      }
      var safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var lines = original.split('\n').filter(function (line) {
        return new RegExp(safe, 'i').test(line);
      });
      body.textContent = lines.length ? lines.join('\n') : 'No lines matched “' + term + '”.';
    });
  }
})();
