/** Copy-to-clipboard and client-side filtering on the Videokr library screen. */
(function (strings) {
  'use strict';

  function copy(text, button) {
    function done() {
      var original = button.textContent;
      button.textContent = strings.copied;
      window.setTimeout(function () {
        button.textContent = original;
      }, 1600);
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () {
        fallback(text, done);
      });
    } else {
      fallback(text, done);
    }
  }

  function fallback(text, done) {
    var field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', 'readonly');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    try {
      document.execCommand('copy');
      done();
    } catch (error) {
      window.prompt(strings.copy, text);
    }
    document.body.removeChild(field);
  }

  document.addEventListener('click', function (event) {
    var button = event.target.closest('.videokr-copy');
    if (!button) return;
    event.preventDefault();
    copy(button.getAttribute('data-copy') || '', button);
  });

  var filter = document.getElementById('videokr-filter');
  if (filter) {
    filter.addEventListener('input', function () {
      var needle = filter.value.trim().toLowerCase();
      var items = document.querySelectorAll('.videokr-item');
      Array.prototype.forEach.call(items, function (item) {
        var title = item.getAttribute('data-title') || '';
        item.style.display = !needle || title.indexOf(needle) > -1 ? '' : 'none';
      });
    });
  }
})(window.videokrAdmin || { copied: 'Copied', copy: 'Copy shortcode' });
