/* Public playlist page: one player + a clickable queue with autoplay-next. */
(function () {
  'use strict';

  var data = window.__SF_PLAYLIST__;
  var stage = document.getElementById('sf-player');
  var list = document.getElementById('sf-playlist-list');
  if (!data || !stage || !list || !data.items.length) return;

  var index = 0;
  var player = null;

  function render() {
    list.textContent = '';
    data.items.forEach(function (item, i) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'sf-pl-item' + (i === index ? ' sf-pl-current' : '');

      var thumb = document.createElement('span');
      thumb.className = 'sf-pl-thumb';
      if (item.video.thumbnail_url) thumb.style.backgroundImage = 'url("' + item.video.thumbnail_url + '")';
      button.appendChild(thumb);

      var meta = document.createElement('span');
      meta.className = 'sf-pl-meta';
      var title = document.createElement('span');
      title.className = 'sf-pl-item-title';
      title.textContent = item.video.title;
      meta.appendChild(title);
      if (item.video.duration) {
        var dur = document.createElement('span');
        dur.className = 'sf-pl-item-dur';
        dur.textContent = window.StreamForge.formatTime(item.video.duration);
        meta.appendChild(dur);
      }
      button.appendChild(meta);

      button.addEventListener('click', function () {
        play(i, true);
      });
      list.appendChild(button);
    });
  }

  function play(i, autoplay) {
    index = i;
    var payload = JSON.parse(JSON.stringify(data.items[i]));
    payload.captureDocumentKeys = true;
    if (autoplay) {
      payload.player.autoplay = true;
      payload.player.bigPlayButton = false;
    }
    stage.textContent = '';
    window.StreamForge.mount(stage, payload).then(function (mounted) {
      player = mounted;
      if (!player) return;
      player.onEnded = function () {
        if (data.playlist.autoplay_next && index + 1 < data.items.length) play(index + 1, true);
      };
    });
    render();
  }

  play(0, false);
})();
