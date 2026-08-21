/**
 * Videokr player — a single custom control surface on top of several video
 * sources (YouTube, Vimeo, MP4, HLS). No dependencies, no build step.
 */
(function () {
  'use strict';

  var SPEED_FALLBACK = [0.5, 0.75, 1, 1.25, 1.5, 2];

  /* Shipped skins, plus the retired names still stored on older videos. Kept in
     step with PLAYER_SKINS on the server so an old config never renders unstyled. */
  var SKINS = ['videokr', 'frame', 'pop', 'studio'];
  var LEGACY_SKINS = {
    'forge-dark': 'videokr',
    'forge-light': 'studio',
    minimal: 'studio',
    bold: 'pop',
    glass: 'frame',
  };

  function skinName(skin) {
    if (SKINS.indexOf(skin) !== -1) return skin;
    return LEGACY_SKINS[skin] || SKINS[0];
  }

  /* A linked source flashes a centred play/pause ripple of its own on a state change;
     these are how long our still stays over it. Its edge strips are handled by the
     frame geometry, not by waiting. */
  var TITLE_FADE = 1200;
  var SEEK_FADE = 900;

  /* ------------------------------------------------------------- helpers -- */

  /** Origin this player was served from, so embeds on other domains still resolve assets. */
  function assetBase() {
    var src = '';
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      if (/player\/player\.js/.test(scripts[i].src)) src = scripts[i].src;
    }
    if (!src) return '';
    return src.replace(/\/player\/player\.js.*$/, '');
  }

  function el(tag, cls, html) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  }

  /* 18x18 control glyphs, drawn to the same geometry as the reference player's icon
     sheet so the bar reads identically at any size. */
  var ICONS = {
    play: '<path d="M15.562 8.1L3.87.225c-.818-.562-1.87 0-1.87.9v15.75c0 .9 1.052 1.462 1.87.9L15.563 9.9c.584-.45.584-1.35 0-1.8z"/>',
    pause:
      '<path d="M6 1H3c-.6 0-1 .4-1 1v14c0 .6.4 1 1 1h3c.6 0 1-.4 1-1V2c0-.6-.4-1-1-1zm6 0c-.6 0-1 .4-1 1v14c0 .6.4 1 1 1h3c.6 0 1-.4 1-1V2c0-.6-.4-1-1-1h-3z"/>',
    rewind: '<path d="M10.125 1L0 9l10.125 8v-6.171L18 17V1l-7.875 6.171z"/>',
    forward: '<path d="M7.875 7.171L0 1v16l7.875-6.171V17L18 9 7.875 1z"/>',
    volume:
      '<path d="M15.6 3.3c-.4-.4-1-.4-1.4 0-.4.4-.4 1 0 1.4C15.4 5.9 16 7.4 16 9c0 1.6-.6 3.1-1.8 4.3-.4.4-.4 1 0 1.4.2.2.5.3.7.3.3 0 .5-.1.7-.3C17.1 13.2 18 11.2 18 9s-.9-4.2-2.4-5.7z"/><path d="M11.282 5.282a.909.909 0 000 1.316c.735.735.995 1.458.995 2.402 0 .936-.425 1.917-.995 2.487a.909.909 0 000 1.316c.145.145.636.262 1.018.156a.725.725 0 00.298-.156C13.773 11.733 14.13 10.16 14.13 9c0-.17-.002-.34-.011-.51-.053-.992-.319-2.005-1.522-3.208a.909.909 0 00-1.316 0zm-7.496.726H.714C.286 6.008 0 6.31 0 6.76v4.512c0 .452.286.752.714.752h3.072l4.071 3.858c.5.3 1.143 0 1.143-.602V2.752c0-.601-.643-.977-1.143-.601L3.786 6.008z"/>',
    muted:
      '<path d="M12.4 12.5l2.1-2.1 2.1 2.1 1.4-1.4L15.9 9 18 6.9l-1.4-1.4-2.1 2.1-2.1-2.1L11 6.9 13.1 9 11 11.1zM3.786 6.008H.714C.286 6.008 0 6.31 0 6.76v4.512c0 .452.286.752.714.752h3.072l4.071 3.858c.5.3 1.143 0 1.143-.602V2.752c0-.601-.643-.977-1.143-.601L3.786 6.008z"/>',
    captions:
      '<path d="M1 1c-.6 0-1 .4-1 1v11c0 .6.4 1 1 1h4.6l2.7 2.7c.2.2.4.3.7.3.3 0 .5-.1.7-.3l2.7-2.7H17c.6 0 1-.4 1-1V2c0-.6-.4-1-1-1H1zm4.52 10.15c1.99 0 3.01-1.32 3.28-2.41l-1.29-.39c-.19.66-.78 1.45-1.99 1.45-1.14 0-2.2-.83-2.2-2.34 0-1.61 1.12-2.37 2.18-2.37 1.23 0 1.78.75 1.95 1.43l1.3-.41C8.47 4.96 7.46 3.76 5.5 3.76c-1.9 0-3.61 1.44-3.61 3.7 0 2.26 1.65 3.69 3.63 3.69zm7.57 0c1.99 0 3.01-1.32 3.28-2.41l-1.29-.39c-.19.66-.78 1.45-1.99 1.45-1.14 0-2.2-.83-2.2-2.34 0-1.61 1.12-2.37 2.18-2.37 1.23 0 1.78.75 1.95 1.43l1.3-.41c-.28-1.15-1.29-2.35-3.25-2.35-1.9 0-3.61 1.44-3.61 3.7 0 2.26 1.65 3.69 3.63 3.69z" fill-rule="evenodd"/>',
    settings:
      '<path d="M16.135 7.784a2 2 0 01-1.23-2.969c.322-.536.225-.998-.094-1.316l-.31-.31c-.318-.318-.78-.415-1.316-.094a2 2 0 01-2.969-1.23C10.065 1.258 9.669 1 9.219 1h-.438c-.45 0-.845.258-.997.865a2 2 0 01-2.969 1.23c-.536-.322-.999-.225-1.317.093l-.31.31c-.318.318-.415.781-.093 1.317a2 2 0 01-1.23 2.969C1.26 7.935 1 8.33 1 8.781v.438c0 .45.258.845.865.997a2 2 0 011.23 2.969c-.322.536-.225.998.094 1.316l.31.31c.319.319.782.415 1.316.094a2 2 0 012.969 1.23c.151.607.547.865.997.865h.438c.45 0 .845-.258.997-.865a2 2 0 012.969-1.23c.535.321.997.225 1.316-.094l.31-.31c.318-.318.415-.781.094-1.316a2 2 0 011.23-2.969c.607-.151.865-.547.865-.997v-.438c0-.451-.26-.846-.865-.997zM9 12a3 3 0 110-6 3 3 0 010 6z"/>',
    pip:
      '<path d="M13.293 3.293L7.022 9.564l1.414 1.414 6.271-6.271L17 7V1h-6z"/><path d="M13 15H3V5h5V3H2a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1v-6h-2v5z"/>',
    fullscreen: '<path d="M10 3h3.6l-4 4L11 8.4l4-4V8h2V1h-7zM7 9.6l-4 4V10H1v7h7v-2H4.4l4-4z"/>',
    exitFullscreen: '<path d="M1 12h3.6l-4 4L2 17.4l4-4V17h2v-7H1zM16 .6l-4 4V1h-2v7h7V6h-3.6l4-4z"/>',
    share:
      '<path d="M13.5 12a3.5 3.5 0 00-2.6 1.17L6.9 11.02a3.5 3.5 0 000-2.04l4-2.15A3.5 3.5 0 105.9 4.5c0 .35.05.7.15 1.02l-4 2.15a3.5 3.5 0 100 4.66l4 2.15c-.1.32-.15.67-.15 1.02a3.5 3.5 0 103.5-3.5z"/>',
  };

  function icon(name) {
    return (
      '<svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">' + (ICONS[name] || '') + '</svg>'
    );
  }

  function fmtTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    var s = Math.floor(seconds % 60);
    var m = Math.floor((seconds / 60) % 60);
    var h = Math.floor(seconds / 3600);
    var mm = h > 0 && m < 10 ? '0' + m : String(m);
    return (h > 0 ? h + ':' : '') + mm + ':' + (s < 10 ? '0' + s : s);
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-sf="' + src + '"]');
      if (existing) {
        if (existing.dataset.loaded === '1') return resolve();
        existing.addEventListener('load', function () {
          resolve();
        });
        existing.addEventListener('error', reject);
        return;
      }
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.dataset.sf = src;
      s.addEventListener('load', function () {
        s.dataset.loaded = '1';
        resolve();
      });
      s.addEventListener('error', reject);
      document.head.appendChild(s);
    });
  }

  function viewId() {
    try {
      var key = 'sf_view';
      var existing = sessionStorage.getItem(key);
      if (existing) return existing;
      var id = Math.random().toString(36).slice(2, 12);
      sessionStorage.setItem(key, id);
      return id;
    } catch (e) {
      return Math.random().toString(36).slice(2, 12);
    }
  }

  /* ------------------------------------------------------------ adapters -- */

  function Emitter() {
    this._handlers = {};
  }
  Emitter.prototype.on = function (name, fn) {
    (this._handlers[name] = this._handlers[name] || []).push(fn);
    return this;
  };
  Emitter.prototype.emit = function (name, payload) {
    (this._handlers[name] || []).forEach(function (fn) {
      try {
        fn(payload);
      } catch (e) {
        /* a broken listener must not stop playback */
      }
    });
  };

  /** YouTube IFrame API adapter. */
  function YouTubeAdapter(container, source, options) {
    Emitter.call(this);
    this.kind = 'youtube';
    this._container = container;
    this._source = source;
    this._options = options || {};
    this._ready = false;
    this._duration = 0;
  }
  YouTubeAdapter.prototype = Object.create(Emitter.prototype);

  YouTubeAdapter.prototype.load = function () {
    var self = this;
    var host = el('div', 'sf-media sf-media-yt');
    var crop = el('div', 'sf-yt-crop');
    /* See .sf-yt-frame: the frame is far taller than the picture so the source's own
       strips fall outside the crop instead of over the video. */
    var frame = el('div', 'sf-yt-frame');
    var mount = el('div');
    frame.appendChild(mount);
    crop.appendChild(frame);
    host.appendChild(crop);
    /* The shield keeps every pointer event off the frame, so the source's own
       title bar, watermark and suggestion overlays never get a chance to appear. */
    host.appendChild(el('div', 'sf-yt-shield'));
    /* Until playback is genuinely running, the frame is masked by our own still, so
       the source's unstarted screen — its title, avatar and watch-elsewhere link —
       is never on screen. */
    var cover = el('div', 'sf-yt-cover');
    var still = this._options.poster || '';
    /* A 4:3 default still would letterbox inside our 16:9 stage, so the widescreen
       variant is tried first and only falls back if the source never made one. */
    var wide = 'https://i.ytimg.com/vi/' + this._source + '/maxresdefault.jpg';
    cover.style.backgroundImage = 'url("' + (still || wide) + '")';
    var probe = document.createElement('img');
    probe.onload = function () {
      if (probe.naturalWidth > 600) cover.style.backgroundImage = 'url("' + wide + '")';
    };
    probe.src = wide;
    host.appendChild(cover);
    host.classList.add('sf-yt-blank');
    this._container.appendChild(host);
    this._host = host;

    return loadScript('https://www.youtube.com/iframe_api')
      .then(function () {
        return new Promise(function (resolve) {
          function ready() {
            if (window.YT && window.YT.Player) return resolve();
            setTimeout(ready, 50);
          }
          ready();
        });
      })
      .then(function () {
        return new Promise(function (resolve) {
          self._yt = new window.YT.Player(mount, {
            videoId: self._source,
            width: '100%',
            height: '100%',
            playerVars: {
              controls: 0,
              disablekb: 1,
              modestbranding: 1,
              rel: 0,
              playsinline: 1,
              iv_load_policy: 3,
              cc_load_policy: 0,
              annotations: 3,
              showinfo: 0,
              fs: 0,
              enablejsapi: 1,
              origin: location.origin,
            },
            events: {
              onReady: function () {
                self._ready = true;
                self._watch();
                self._dropCaptions();
                self._duration = self._yt.getDuration() || 0;
                self.emit('ready');
                resolve();
              },
              onStateChange: function (e) {
                var YTS = window.YT.PlayerState;
                if (e.data === YTS.PLAYING) {
                  self._dropCaptions();
                  /* A fresh start paints the source's title, channel and "More videos"
                     strips over the picture for a few seconds before they fade, so the
                     still stays up until they are gone. */
                  if (!self._running) self._mask(TITLE_FADE);
                  self._running = true;
                  self.emit('play');
                }
                if (e.data === YTS.PAUSED) {
                  self._running = false;
                  self._mask();
                  self.emit('pause');
                }
                if (e.data === YTS.ENDED) {
                  /* Rewind so a suggestion grid can never render behind the mask. */
                  self._running = false;
                  self._mask();
                  self._yt.seekTo(0, true);
                  self._yt.pauseVideo();
                  self.emit('ended');
                }
                self._watch();
              },
            },
          });
        });
      });
  };

  YouTubeAdapter.prototype._mask = function (hold) {
    this._maskedUntil = Date.now() + (hold || 700);
    if (this._host) this._host.classList.add('sf-yt-blank');
  };

  /* State events alone cannot be trusted: a seek makes the frame report PLAYING while
     it is still painting its paused chrome, and a pause issued during that seek is
     followed by a late PLAYING event. So the mask is driven by a poll of the real
     state, and the frame is only revealed once playback is actually running and its
     clock has moved. */
  YouTubeAdapter.prototype._watch = function () {
    var self = this;
    if (this._poll) return;
    this._poll = setInterval(function () {
      if (!self._yt || !self._host || !window.YT) return;
      var state = self._yt.getPlayerState ? self._yt.getPlayerState() : -1;
      var t = self._yt.getCurrentTime ? self._yt.getCurrentTime() || 0 : 0;
      var moving = t > (self._lastT || 0) + 0.01;
      self._lastT = t;
      var live = state === window.YT.PlayerState.PLAYING && moving && Date.now() > (self._maskedUntil || 0);
      self._host.classList.toggle('sf-yt-blank', !live);
    }, 150);
  };

  YouTubeAdapter.prototype.destroy = function () {
    clearInterval(this._poll);
    this._poll = null;
    if (this._yt && this._yt.destroy) this._yt.destroy();
  };

  /** A viewer's own caption preference must not burn text over our player. */
  YouTubeAdapter.prototype._dropCaptions = function () {
    if (!this._yt) return;
    var self = this;
    if (this._options.sourceCaptions) {
      try {
        this._yt.loadModule('captions');
      } catch (err) {
        /* the frame decides whether a track exists */
      }
      return;
    }
    ['captions', 'cc'].forEach(function (mod) {
      try {
        self._yt.unloadModule(mod);
      } catch (err) {
        /* module names vary by frame build; failing is harmless */
      }
    });
    try {
      this._yt.setOption('captions', 'track', {});
    } catch (err) {
      /* no captions module loaded yet */
    }
  };

  YouTubeAdapter.prototype.play = function () {
    if (this._yt) this._yt.playVideo();
  };
  YouTubeAdapter.prototype.pause = function () {
    if (!this._yt) return;
    this._running = false;
    this._mask();
    this._yt.pauseVideo();
  };
  YouTubeAdapter.prototype.currentTime = function () {
    return this._yt && this._ready ? this._yt.getCurrentTime() || 0 : 0;
  };
  YouTubeAdapter.prototype.duration = function () {
    if (this._yt && this._ready) this._duration = this._yt.getDuration() || this._duration;
    return this._duration;
  };
  YouTubeAdapter.prototype.seek = function (t) {
    if (!this._yt) return;
    /* A seek repaints the frame's own chrome, so it hides behind the mask until
       playback has demonstrably resumed. */
    this._mask(SEEK_FADE);
    this._lastT = 0;
    this._yt.seekTo(Math.max(0, t), true);
  };
  YouTubeAdapter.prototype.setVolume = function (v) {
    if (this._yt) this._yt.setVolume(Math.round(v * 100));
  };
  YouTubeAdapter.prototype.setMuted = function (m) {
    if (!this._yt) return;
    if (m) this._yt.mute();
    else this._yt.unMute();
  };
  YouTubeAdapter.prototype.muted = function () {
    return this._yt ? this._yt.isMuted() : false;
  };
  YouTubeAdapter.prototype.setRate = function (r) {
    if (this._yt) this._yt.setPlaybackRate(r);
  };
  YouTubeAdapter.prototype.buffered = function () {
    return this._yt && this._ready ? this._yt.getVideoLoadedFraction() || 0 : 0;
  };
  YouTubeAdapter.prototype.paused = function () {
    if (!this._yt || !this._ready || !window.YT) return true;
    return this._yt.getPlayerState() !== window.YT.PlayerState.PLAYING;
  };
  YouTubeAdapter.prototype.supportsPip = function () {
    return false;
  };
  YouTubeAdapter.prototype.hasCaptions = function () {
    return true;
  };
  YouTubeAdapter.prototype.toggleCaptions = function () {
    if (!this._yt) return false;
    this._options.sourceCaptions = !this._options.sourceCaptions;
    this._dropCaptions();
    return this._options.sourceCaptions;
  };
  YouTubeAdapter.prototype.element = function () {
    return this._yt ? this._yt.getIframe() : null;
  };

  /** Native <video> adapter, also used for HLS (native or via hls.js). */
  function HtmlAdapter(container, source, options) {
    Emitter.call(this);
    this.kind = options && options.hls ? 'hls' : 'mp4';
    this._container = container;
    this._source = source;
    this._options = options || {};
  }
  HtmlAdapter.prototype = Object.create(Emitter.prototype);

  HtmlAdapter.prototype.load = function () {
    var self = this;
    var host = el('div', 'sf-media');
    var video = document.createElement('video');
    video.playsInline = true;
    video.preload = 'metadata';
    // Only request CORS when we actually need cross-origin reads (caption
    // tracks). Forcing it on plain MP4 sources breaks playback for hosts that
    // do not send Access-Control-Allow-Origin.
    if (this._options.captionsUrl) video.setAttribute('crossorigin', 'anonymous');
    if (this._options.poster) video.poster = this._options.poster;
    if (this._options.captionsUrl) {
      var track = document.createElement('track');
      track.kind = 'subtitles';
      track.label = 'Captions';
      track.srclang = 'en';
      track.src = this._options.captionsUrl;
      track.default = false;
      // Cues only exist once the file has parsed, which can land after the first toggle.
      track.addEventListener('load', function () {
        liftCues(track.track);
      });
      video.appendChild(track);
    }
    this._video = video;
    host.appendChild(video);
    this._container.appendChild(host);

    video.addEventListener('play', function () {
      self.emit('play');
    });
    video.addEventListener('pause', function () {
      self.emit('pause');
    });
    video.addEventListener('ended', function () {
      self.emit('ended');
    });
    video.addEventListener('loadedmetadata', function () {
      self.emit('ready');
    });

    var isHls = /\.m3u8($|\?)/i.test(this._source);
    if (isHls && !video.canPlayType('application/vnd.apple.mpegurl')) {
      return loadScript('https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js')
        .then(function () {
          if (window.Hls && window.Hls.isSupported()) {
            var hls = new window.Hls();
            hls.loadSource(self._source);
            hls.attachMedia(video);
            self._hls = hls;
          } else {
            video.src = self._source;
          }
        })
        .catch(function () {
          video.src = self._source;
        });
    }
    video.src = this._source;
    return Promise.resolve();
  };

  HtmlAdapter.prototype.play = function () {
    var p = this._video.play();
    if (p && p.catch) p.catch(function () {});
  };
  HtmlAdapter.prototype.pause = function () {
    this._video.pause();
  };
  HtmlAdapter.prototype.currentTime = function () {
    return this._video.currentTime || 0;
  };
  HtmlAdapter.prototype.duration = function () {
    return isFinite(this._video.duration) ? this._video.duration : 0;
  };
  HtmlAdapter.prototype.seek = function (t) {
    this._video.currentTime = Math.max(0, t);
  };
  HtmlAdapter.prototype.setVolume = function (v) {
    this._video.volume = Math.min(1, Math.max(0, v));
  };
  HtmlAdapter.prototype.setMuted = function (m) {
    this._video.muted = !!m;
  };
  HtmlAdapter.prototype.muted = function () {
    return this._video.muted;
  };
  HtmlAdapter.prototype.setRate = function (r) {
    this._video.playbackRate = r;
  };
  HtmlAdapter.prototype.buffered = function () {
    var v = this._video;
    if (!v.buffered || !v.buffered.length || !v.duration) return 0;
    return v.buffered.end(v.buffered.length - 1) / v.duration;
  };
  HtmlAdapter.prototype.paused = function () {
    return this._video.paused;
  };
  HtmlAdapter.prototype.supportsPip = function () {
    return typeof this._video.requestPictureInPicture === 'function';
  };
  HtmlAdapter.prototype.togglePip = function () {
    var v = this._video;
    if (document.pictureInPictureElement) return document.exitPictureInPicture();
    if (v.requestPictureInPicture) return v.requestPictureInPicture();
  };
  HtmlAdapter.prototype.toggleCaptions = function () {
    var tracks = this._video.textTracks;
    if (!tracks || !tracks.length) return false;
    var on = tracks[0].mode === 'showing';
    tracks[0].mode = on ? 'hidden' : 'showing';
    if (!on) liftCues(tracks[0]);
    return !on;
  };

  /* The browser paints cues on the last line of the picture, where the control bar
     sits. Raising them by two lines keeps the text clear of the bar and its labels. */
  function liftCues(track) {
    var cues = track.cues;
    if (!cues) return;
    for (var i = 0; i < cues.length; i += 1) {
      if (cues[i].snapToLines !== false) cues[i].line = -3;
    }
  }
  /** Renditions offered by an adaptive stream; a plain file has none to choose from. */
  HtmlAdapter.prototype.qualities = function () {
    if (!this._hls || !this._hls.levels || this._hls.levels.length < 2) return [];
    var list = [{ label: 'Auto', value: -1 }];
    this._hls.levels.forEach(function (level, index) {
      list.push({ label: (level.height ? level.height + 'p' : Math.round(level.bitrate / 1000) + 'k'), value: index });
    });
    return list;
  };
  HtmlAdapter.prototype.setQuality = function (value) {
    if (this._hls) this._hls.currentLevel = value;
  };
  HtmlAdapter.prototype.hasCaptions = function () {
    return !!(this._video.textTracks && this._video.textTracks.length);
  };
  HtmlAdapter.prototype.element = function () {
    return this._video;
  };

  /** Vimeo player adapter driven over postMessage. */
  function VimeoAdapter(container, source, options) {
    Emitter.call(this);
    this.kind = 'vimeo';
    this._container = container;
    this._source = source;
    this._options = options || {};
    this._time = 0;
    this._duration = 0;
    this._paused = true;
    this._captionsOn = false;
  }
  VimeoAdapter.prototype = Object.create(Emitter.prototype);

  VimeoAdapter.prototype.load = function () {
    var self = this;
    var host = el('div', 'sf-media sf-media-yt sf-yt-blank');
    var frame = document.createElement('iframe');
    frame.src =
      'https://player.vimeo.com/video/' +
      encodeURIComponent(this._source) +
      '?controls=0&title=0&byline=0&portrait=0&badge=0&pip=0&dnt=1&autopause=0';
    frame.allow = 'autoplay; fullscreen; picture-in-picture';
    frame.frameBorder = '0';
    host.appendChild(frame);
    host.appendChild(el('div', 'sf-yt-shield'));
    var cover = el('div', 'sf-yt-cover');
    if (this._options.poster) cover.style.backgroundImage = 'url("' + this._options.poster + '")';
    host.appendChild(cover);
    this._container.appendChild(host);
    this._frame = frame;
    this._host = host;

    window.addEventListener('message', function (event) {
      if (!self._frame || event.source !== self._frame.contentWindow) return;
      var data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      if (data.event === 'ready') {
        self._post('addEventListener', 'playProgress');
        self._post('addEventListener', 'play');
        self._post('addEventListener', 'pause');
        self._post('addEventListener', 'finish');
        self._watch();
        self.emit('ready');
      } else if (data.event === 'playProgress' && data.data) {
        self._time = data.data.seconds;
        self._duration = data.data.duration;
      } else if (data.event === 'play') {
        self._paused = false;
        if (!self._running) self._mask(TITLE_FADE);
        self._running = true;
        self.emit('play');
      } else if (data.event === 'pause') {
        self._paused = true;
        self._running = false;
        self._mask();
        self.emit('pause');
      } else if (data.event === 'finish') {
        /* The frame paints its own "more from this channel" grid the instant it ends, so
           the still goes up first and the frame is rewound and stopped behind it. */
        self._paused = true;
        self._running = false;
        self._mask();
        self._post('seekTo', 0);
        self._post('pause');
        self.emit('ended');
      }
    });
    return Promise.resolve();
  };

  VimeoAdapter.prototype._mask = function (hold) {
    this._maskedUntil = Date.now() + (hold || 700);
    if (this._host) this._host.classList.add('sf-yt-blank');
  };

  /* Same reasoning as the YouTube watchdog: the frame is only revealed once its own
     clock has demonstrably moved, so no source chrome can be on screen while stopped,
     paused, seeking or finished. */
  VimeoAdapter.prototype._watch = function () {
    var self = this;
    if (this._poll) return;
    this._poll = setInterval(function () {
      if (!self._host) return;
      var moving = self._time > (self._lastT || 0) + 0.01;
      self._lastT = self._time;
      var live = !self._paused && moving && Date.now() > (self._maskedUntil || 0);
      self._host.classList.toggle('sf-yt-blank', !live);
    }, 150);
  };

  VimeoAdapter.prototype.destroy = function () {
    clearInterval(this._poll);
    this._poll = null;
  };

  VimeoAdapter.prototype._post = function (method, value) {
    if (!this._frame || !this._frame.contentWindow) return;
    this._frame.contentWindow.postMessage(JSON.stringify({ method: method, value: value }), '*');
  };
  VimeoAdapter.prototype.play = function () {
    this._post('play');
  };
  VimeoAdapter.prototype.pause = function () {
    this._running = false;
    this._mask();
    this._post('pause');
  };
  VimeoAdapter.prototype.currentTime = function () {
    return this._time;
  };
  VimeoAdapter.prototype.duration = function () {
    return this._duration;
  };
  VimeoAdapter.prototype.seek = function (t) {
    this._mask(SEEK_FADE);
    this._lastT = 0;
    this._post('seekTo', Math.max(0, t));
    this._time = t;
  };
  VimeoAdapter.prototype.setVolume = function (v) {
    this._post('setVolume', v);
  };
  VimeoAdapter.prototype.setMuted = function (m) {
    this._muted = !!m;
    this._post('setVolume', m ? 0 : 1);
  };
  VimeoAdapter.prototype.muted = function () {
    return !!this._muted;
  };
  VimeoAdapter.prototype.setRate = function (r) {
    this._post('setPlaybackRate', r);
  };
  VimeoAdapter.prototype.buffered = function () {
    return 0;
  };
  VimeoAdapter.prototype.paused = function () {
    return this._paused;
  };
  VimeoAdapter.prototype.supportsPip = function () {
    return false;
  };
  VimeoAdapter.prototype.hasCaptions = function () {
    return true;
  };
  VimeoAdapter.prototype.toggleCaptions = function () {
    this._captionsOn = !this._captionsOn;
    this._post(this._captionsOn ? 'enableTextTrack' : 'disableTextTrack', this._captionsOn ? 'en' : undefined);
    return this._captionsOn;
  };
  VimeoAdapter.prototype.element = function () {
    return this._frame;
  };

  function createAdapter(container, payload) {
    var v = payload.video;
    var cfg = payload.player;
    if (v.source_type === 'youtube')
      return new YouTubeAdapter(container, v.source_ref, {
        poster: v.thumbnail_url,
        sourceCaptions: !!cfg.sourceCaptions,
      });
    if (v.source_type === 'vimeo')
      return new VimeoAdapter(container, v.source_ref, { poster: v.thumbnail_url });
    return new HtmlAdapter(container, v.source_ref, {
      hls: v.source_type === 'hls',
      poster: v.thumbnail_url,
      captionsUrl: v.captions_url,
      muted: cfg.muted,
    });
  }

  /* -------------------------------------------------------------- player -- */

  function Player(root, payload) {
    this.root = root;
    this.payload = payload;
    this.config = payload.player;
    this.video = payload.video;
    this.chapters = payload.chapters || [];
    this.ctas = payload.ctas || [];
    this.variant = payload.variant || 'a';
    this.viewId = viewId();
    this._seen = {};
    this._gateShown = false;
    this._lastProgressBucket = -1;
    this._started = false;
    this._trackingEnabled = payload.tracking !== false;
  }

  Player.prototype.mount = function () {
    var self = this;
    var cfg = this.config;
    this.root.classList.add('sf-player', 'sf-skin-' + skinName(cfg.skin));
    this.root.style.setProperty('--sf-accent', cfg.accent || '#ff6106');
    this.root.style.setProperty('--sf-bg', cfg.background || '#0b0908');
    this.root.style.setProperty('--sf-radius', (cfg.borderRadius || 0) + 'px');
    this.root.innerHTML = '';

    this.stage = el('div', 'sf-stage');
    this.root.appendChild(this.stage);

    this.adapter = createAdapter(this.stage, this.payload);
    this.overlay = el('div', 'sf-overlay');
    this.stage.appendChild(this.overlay);

    if (cfg.title && this.video.title) {
      this.titleBar = el('div', 'sf-titlebar');
      this.titleBar.textContent = this.video.title;
      this.overlay.appendChild(this.titleBar);
    }
    if (cfg.logoUrl) {
      var logo = el('div', 'sf-logo sf-pos-' + (cfg.logoPosition || 'top-right'));
      var img = document.createElement('img');
      img.src = cfg.logoUrl;
      img.alt = 'brand';
      if (cfg.logoLink) {
        var a = document.createElement('a');
        a.href = cfg.logoLink;
        a.target = '_blank';
        a.rel = 'noopener';
        a.appendChild(img);
        logo.appendChild(a);
      } else {
        logo.appendChild(img);
      }
      this.overlay.appendChild(logo);
    }
    if (cfg.bigPlayButton) {
      this.bigPlay = el('button', 'sf-bigplay', icon('play'));
      this.bigPlay.setAttribute('aria-label', 'Play video');
      this.bigPlay.setAttribute('data-sf', 'bigplay');
      this.bigPlay.addEventListener('click', function () {
        self.togglePlay();
      });
      this.overlay.appendChild(this.bigPlay);
    }

    this.ctaLayer = el('div', 'sf-cta-layer');
    this.overlay.appendChild(this.ctaLayer);

    this.controls = this._buildControls();
    this.overlay.appendChild(this.controls);
    this._buildSideRail();

    this.adapter.on('ready', function () {
      self._onReady();
    });
    this.adapter.on('play', function () {
      self.root.classList.add('sf-playing');
      self._setPlayIcon(true);
      if (!self._started) {
        self._started = true;
        self.track('play');
      }
    });
    this.adapter.on('pause', function () {
      self.root.classList.remove('sf-playing');
      self._setPlayIcon(false);
      self.track('pause');
    });
    this.adapter.on('ended', function () {
      self.root.classList.remove('sf-playing');
      self._setPlayIcon(false);
      self.track('complete');
      self._showEndscreen();
      if (self.config.loop) {
        self.adapter.seek(0);
        self.adapter.play();
      }
      if (self.onEnded) self.onEnded();
    });

    this._bindKeys();
    this._bindPointer();

    return this.adapter.load().then(function () {
      self.track('load');
      self._tick = setInterval(function () {
        self._onTick();
      }, 250);
      if (self.config.sticky) self._bindSticky();
      return self;
    });
  };

  Player.prototype._buildControls = function () {
    var self = this;
    var cfg = this.config;
    var bar = el('div', 'sf-controls');

    var iconButton = function (cls, glyph, label) {
      var btn = el('button', 'sf-btn ' + cls, icon(glyph));
      btn.setAttribute('aria-label', label);
      btn.setAttribute('data-tip', label);
      btn.setAttribute('data-sf', cls.replace('sf-', ''));
      return btn;
    };

    if (cfg.controls.playPause) {
      this.rewindBtn = iconButton('sf-rewind', 'rewind', 'Rewind 10s');
      this.rewindBtn.addEventListener('click', function () {
        self.adapter.seek(Math.max(0, self.adapter.currentTime() - 10));
      });
      bar.appendChild(this.rewindBtn);

      this.playBtn = iconButton('sf-play', 'play', 'Play');
      this.playBtn.addEventListener('click', function () {
        self.togglePlay();
      });
      bar.appendChild(this.playBtn);

      this.forwardBtn = iconButton('sf-forward', 'forward', 'Forward 10s');
      this.forwardBtn.addEventListener('click', function () {
        self.adapter.seek(self.adapter.currentTime() + 10);
      });
      bar.appendChild(this.forwardBtn);
    }

    if (cfg.controls.progress) {
      var wrap = el('div', 'sf-progress-wrap');
      this.progress = el('div', 'sf-progress');
      this.progress.setAttribute('data-sf', 'progress');
      var rail = el('div', 'sf-progress-rail');
      this.buffer = el('div', 'sf-buffer');
      this.played = el('div', 'sf-played');
      this.handle = el('div', 'sf-handle');
      this.markers = el('div', 'sf-markers');
      rail.appendChild(this.buffer);
      rail.appendChild(this.played);
      rail.appendChild(this.markers);
      rail.appendChild(this.handle);
      this.progress.appendChild(rail);
      this.tooltip = el('div', 'sf-tooltip');
      wrap.appendChild(this.progress);
      wrap.appendChild(this.tooltip);
      bar.appendChild(wrap);

      var seekFromEvent = function (event) {
        var rect = self.progress.getBoundingClientRect();
        var ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
        var duration = self.adapter.duration();
        if (duration > 0) {
          self.adapter.seek(ratio * duration);
          self.track('seek', ratio * duration);
        }
      };
      this.progress.addEventListener('click', seekFromEvent);
      /* Scrubbing has to follow the pointer even once it leaves the 5px rail. */
      this.progress.addEventListener('mousedown', function (event) {
        event.preventDefault();
        self._scrubbing = true;
        seekFromEvent(event);
        var move = function (ev) {
          seekFromEvent(ev);
        };
        var up = function (ev) {
          seekFromEvent(ev);
          self._scrubbing = false;
          document.removeEventListener('mousemove', move);
          document.removeEventListener('mouseup', up);
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
      });
      this.progress.addEventListener('mousemove', function (event) {
        var rect = self.progress.getBoundingClientRect();
        var ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
        var duration = self.adapter.duration();
        self.tooltip.style.left = ratio * 100 + '%';
        var label = fmtTime(ratio * duration);
        var chapter = self._chapterAt(ratio * duration);
        self.tooltip.textContent = chapter ? label + ' · ' + chapter.title : label;
        self.tooltip.classList.add('sf-visible');
      });
      this.progress.addEventListener('mouseleave', function () {
        self.tooltip.classList.remove('sf-visible');
      });
    }

    if (cfg.controls.time) {
      this.timeLabel = el('div', 'sf-time sf-time-current', '0:00');
      this.timeLabel.setAttribute('data-sf', 'time');
      this.durationLabel = el('div', 'sf-time sf-time-duration', '0:00');
      this.durationLabel.setAttribute('data-sf', 'duration');
      bar.appendChild(this.timeLabel);
      bar.appendChild(this.durationLabel);
    }

    if (cfg.controls.volume) {
      var volWrap = el('div', 'sf-volume');
      this.muteBtn = iconButton('sf-mute', 'volume', 'Mute');
      this.volInput = document.createElement('input');
      this.volInput.type = 'range';
      this.volInput.min = '0';
      this.volInput.max = '1';
      this.volInput.step = '0.05';
      this.volInput.value = cfg.muted ? '0' : '1';
      this.volInput.setAttribute('aria-label', 'Volume');
      this.muteBtn.addEventListener('click', function () {
        self.toggleMute();
      });
      this.volInput.addEventListener('input', function () {
        var v = parseFloat(self.volInput.value);
        self.adapter.setVolume(v);
        self.adapter.setMuted(v === 0);
        self._setVolIcon(v === 0);
      });
      volWrap.appendChild(this.muteBtn);
      volWrap.appendChild(this.volInput);
      bar.appendChild(volWrap);
    }

    if (cfg.controls.captions) {
      this.ccBtn = iconButton('sf-cc', 'captions', 'Captions');
      this.ccBtn.classList.add('sf-off');
      this.ccBtn.setAttribute('data-sf', 'captions');
      this.ccBtn.addEventListener('click', function () {
        self.toggleCaptions();
      });
      bar.appendChild(this.ccBtn);
    }

    if (cfg.controls.pip) {
      this.pipBtn = iconButton('sf-pip', 'pip', 'PIP');
      this.pipBtn.addEventListener('click', function () {
        if (self.adapter.togglePip) self.adapter.togglePip();
      });
      bar.appendChild(this.pipBtn);
    }

    /* One gear holds speed, quality and chapters, so the bar keeps a fixed width no
       matter how many renditions or chapters a video carries. */
    bar.appendChild(this._buildSettings());

    if (cfg.controls.speed) {
      var speeds = (cfg.speeds && cfg.speeds.length ? cfg.speeds : SPEED_FALLBACK).slice();
      this._speeds = speeds;
      this._rateIndex = speeds.indexOf(1);
      this.speedSetting = this._addSetting(
        'speed',
        'Speed',
        speeds.map(function (rate) {
          return {
            label: rate === 1 ? 'Normal' : rate + 'x',
            onSelect: function () {
              self.adapter.setRate(rate);
              self._rateIndex = speeds.indexOf(rate);
            },
          };
        }),
        Math.max(0, speeds.indexOf(1)),
      );
    }

    if (cfg.controls.chapters && this.chapters.length) {
      this._addSetting(
        'chapters',
        'Chapters',
        this.chapters.map(function (ch) {
          return {
            label: fmtTime(ch.start_seconds) + '  ' + ch.title,
            onSelect: function () {
              self.adapter.seek(ch.start_seconds);
              self.adapter.play();
            },
          };
        }),
        -1,
      );
    }

    if (cfg.controls.share && this.payload.share && this.payload.share.url) {
      this.shareBtn = iconButton('sf-share', 'share', 'Share');
      this.shareBtn.addEventListener('click', function () {
        self.toggleShare();
      });
      bar.appendChild(this.shareBtn);
    }

    if (cfg.controls.fullscreen) {
      this.fsBtn = iconButton('sf-fs', 'fullscreen', 'Fullscreen');
      this.fsBtn.setAttribute('data-sf', 'fullscreen');
      this.fsBtn.addEventListener('click', function () {
        self.toggleFullscreen();
      });
      bar.appendChild(this.fsBtn);
    }

    if (this.payload.badge) {
      // Free-tier attribution; lifetime accounts get badge: false from the api.
      var badge = document.createElement('a');
      badge.className = 'sf-badge';
      badge.href = assetBase() + '/?ref=player';
      badge.target = '_blank';
      badge.rel = 'noopener';
      badge.title = 'Powered by Videokr';
      badge.innerHTML =
        '<img src="' + assetBase() + '/brand/mark-64.png" alt="" /><span>Videokr</span>';
      bar.appendChild(badge);
    }

    /* Kept so the quality menu, built after the source reports its renditions, has
       somewhere to attach. */
    this.bar = bar;
    return bar;
  };

  /**
   * The default skin parks captions, picture-in-picture and share in a vertical
   * rail over the top-right corner instead of the bar. The buttons are moved,
   * not rebuilt, so their handlers and state stay exactly as the bar built them.
   */
  Player.prototype._buildSideRail = function () {
    if (skinName(this.config.skin) !== 'videokr') return;
    var buttons = [this.ccBtn, this.pipBtn, this.shareBtn].filter(Boolean);
    if (!buttons.length) return;
    var rail = el('div', 'sf-rail');
    buttons.forEach(function (button) {
      rail.appendChild(button);
    });
    this.overlay.appendChild(rail);
    this.rail = rail;
  };

  /** Gear button plus a panel stack: a home list of settings and one panel each. */
  Player.prototype._buildSettings = function () {
    var self = this;
    var host = el('div', 'sf-menu sf-settings');
    var btn = el('button', 'sf-btn', icon('settings'));
    btn.setAttribute('aria-label', 'Settings');
    btn.setAttribute('data-tip', 'Settings');
    btn.setAttribute('data-sf', 'settings');
    btn.setAttribute('aria-expanded', 'false');
    var list = el('div', 'sf-menu-list');
    var home = el('div', 'sf-menu-panel');
    list.appendChild(home);
    var close = function () {
      host.classList.remove('sf-open');
      btn.setAttribute('aria-expanded', 'false');
      self._showPanel(home);
    };
    btn.addEventListener('click', function (event) {
      event.stopPropagation();
      var open = !host.classList.contains('sf-open');
      host.classList.toggle('sf-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      self._showPanel(home);
    });
    list.addEventListener('click', function (event) {
      event.stopPropagation();
    });
    document.addEventListener('click', close);
    host.appendChild(btn);
    host.appendChild(list);
    host.style.display = 'none';
    this.settings = { host: host, list: list, home: home, close: close };
    return host;
  };

  Player.prototype._showPanel = function (panel) {
    if (!this.settings) return;
    var kids = this.settings.list.children;
    for (var i = 0; i < kids.length; i++) {
      kids[i].style.display = kids[i] === panel ? 'block' : 'none';
    }
  };

  /**
   * Adds one row to the settings home panel plus its own radio panel. `current` is the
   * index selected on open, or -1 for a plain list of actions such as chapters.
   */
  Player.prototype._addSetting = function (key, label, items, current) {
    if (!this.settings || !items.length) return null;
    var self = this;
    var settings = this.settings;
    var row = el('button', 'sf-menu-item sf-forward');
    row.setAttribute('data-sf', key);
    row.appendChild(document.createTextNode(label));
    var value = el('span', 'sf-menu-value');
    row.appendChild(value);

    var panel = el('div', 'sf-menu-panel');
    panel.style.display = 'none';
    var back = el('button', 'sf-menu-item sf-back');
    back.textContent = label;
    back.addEventListener('click', function () {
      self._showPanel(settings.home);
    });
    panel.appendChild(back);

    var radios = [];
    items.forEach(function (item, index) {
      var option = el('button', 'sf-menu-item sf-radio');
      option.setAttribute('role', 'menuitemradio');
      option.setAttribute('aria-checked', index === current ? 'true' : 'false');
      option.textContent = item.label;
      option.addEventListener('click', function () {
        radios.forEach(function (other) {
          other.setAttribute('aria-checked', 'false');
        });
        option.setAttribute('aria-checked', 'true');
        if (current >= 0) value.textContent = item.label;
        item.onSelect();
        settings.close();
      });
      radios.push(option);
      panel.appendChild(option);
    });

    row.addEventListener('click', function () {
      self._showPanel(panel);
    });
    settings.home.appendChild(row);
    settings.list.appendChild(panel);
    settings.host.style.display = '';
    if (current >= 0 && items[current]) value.textContent = items[current].label;
    return { value: value, radios: radios, items: items };
  };

  /** Keeps a settings row in sync when a shortcut, not the menu, changes the value. */
  Player.prototype._selectSetting = function (setting, index) {
    if (!setting || !setting.items[index]) return;
    setting.radios.forEach(function (option, i) {
      option.setAttribute('aria-checked', i === index ? 'true' : 'false');
    });
    setting.value.textContent = setting.items[index].label;
  };

  Player.prototype._onReady = function () {
    var duration = this.adapter.duration();
    if (this.config.muted) {
      this.adapter.setMuted(true);
      this._setVolIcon(true);
      if (this.volInput) this.volInput.value = '0';
    }
    var start = this.config.startAt || 0;
    if (this.config.resume) {
      var saved = this._savedPosition();
      if (saved > 3 && (!duration || saved < duration - 10)) start = saved;
    }
    if (start > 0) this.adapter.seek(start);
    if (duration > 0) this._renderMarkers(duration);
    if (this.config.autoplay) {
      this.adapter.setMuted(true);
      this.adapter.play();
    }
    if (this.ccBtn && this.adapter.hasCaptions && !this.adapter.hasCaptions()) {
      this.ccBtn.style.display = 'none';
    }
    if (this.pipBtn && !this.adapter.supportsPip()) this.pipBtn.style.display = 'none';
    this._buildQualityMenu();
  };

  /** Only an adaptive source exposes renditions, so the menu is built after load. */
  Player.prototype._buildQualityMenu = function () {
    if (!this.config.controls.quality || this.qualitySetting || !this.settings) return;
    if (!this.adapter.qualities) return;
    var self = this;
    var levels = this.adapter.qualities();
    if (levels.length < 2) return;
    this.qualitySetting = this._addSetting(
      'quality',
      'Quality',
      levels.map(function (level) {
        return {
          label: level.label,
          onSelect: function () {
            self.adapter.setQuality(level.value);
          },
        };
      }),
      0,
    );
  };

  /** Both the CC button and the keyboard shortcut land here so the state stays in sync. */
  Player.prototype.toggleCaptions = function () {
    if (!this.adapter.toggleCaptions) return false;
    var on = this.adapter.toggleCaptions();
    if (this.ccBtn) {
      this.ccBtn.classList.toggle('sf-active', !!on);
      this.ccBtn.classList.toggle('sf-off', !on);
    }
    return on;
  };

  Player.prototype._renderMarkers = function (duration) {
    if (!this.markers) return;
    this.markers.innerHTML = '';
    var self = this;
    this.chapters.forEach(function (ch) {
      if (!(duration > 0)) return;
      var mark = el('span', 'sf-marker');
      mark.style.left = (ch.start_seconds / duration) * 100 + '%';
      mark.title = ch.title;
      self.markers.appendChild(mark);
    });
  };

  Player.prototype._chapterAt = function (t) {
    var found = null;
    this.chapters.forEach(function (ch) {
      if (ch.start_seconds <= t) found = ch;
    });
    return found;
  };

  Player.prototype._onTick = function () {
    var t = this.adapter.currentTime();
    var duration = this.adapter.duration();
    if (duration > 0 && this.played) {
      this.played.style.width = (t / duration) * 100 + '%';
      this.handle.style.left = (t / duration) * 100 + '%';
      this.buffer.style.width = this.adapter.buffered() * 100 + '%';
      if (!this.markers.childNodes.length && this.chapters.length) this._renderMarkers(duration);
    }
    if (this.timeLabel) this.timeLabel.textContent = fmtTime(t);
    if (this.durationLabel) this.durationLabel.textContent = fmtTime(duration);
    if (duration > 0 && t > 0) this._savePosition(t);
    this._evaluateCtas(t, duration);

    if (duration > 0 && !this.adapter.paused()) {
      var bucket = Math.floor((t / duration) * 20);
      if (bucket !== this._lastProgressBucket) {
        this._lastProgressBucket = bucket;
        this.track('progress', t, duration);
      }
    }
    if (this.titleBar && this.chapters.length) {
      var ch = this._chapterAt(t);
      this.titleBar.textContent = ch ? this.video.title + ' — ' + ch.title : this.video.title;
    }
  };

  /* ----------------------------------------------------------------- CTAs -- */

  Player.prototype._evaluateCtas = function (t, duration) {
    var self = this;
    this.ctas.forEach(function (cta) {
      if (cta.kind === 'endscreen') return;
      var start = cta.start_seconds || 0;
      var end = cta.end_seconds && cta.end_seconds > start ? cta.end_seconds : duration || start + 15;
      var active = t >= start && t <= end;
      var node = self.ctaLayer.querySelector('[data-cta="' + cta.id + '"]');
      if (active && !node) {
        if (cta.kind === 'gate') {
          if (self._gateShown) return;
          self._gateShown = true;
          self.adapter.pause();
          self.ctaLayer.appendChild(self._renderGate(cta, t));
        } else {
          self.ctaLayer.appendChild(self._renderCta(cta));
        }
        if (!self._seen[cta.id]) {
          self._seen[cta.id] = true;
          self.track('cta_view', t, duration, cta.id);
        }
      } else if (!active && node && cta.kind !== 'gate') {
        node.remove();
      }
    });
  };

  Player.prototype._renderCta = function (cta) {
    var self = this;
    var node = el('div', 'sf-cta sf-cta-' + cta.kind + ' sf-pos-' + (cta.position || 'bottom-right'));
    node.setAttribute('data-cta', cta.id);
    if (cta.headline) node.appendChild(el('div', 'sf-cta-headline', null)).textContent = cta.headline;
    if (cta.body) node.appendChild(el('div', 'sf-cta-body', null)).textContent = cta.body;
    if (cta.button_text && cta.button_url) {
      var link = document.createElement('a');
      link.className = 'sf-cta-btn';
      link.href = cta.button_url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = cta.button_text;
      link.setAttribute('data-sf', 'cta-click');
      link.addEventListener('click', function () {
        self.track('cta_click', self.adapter.currentTime(), self.adapter.duration(), cta.id);
      });
      node.appendChild(link);
    }
    if (cta.skippable) {
      var close = el('button', 'sf-cta-close', '&times;');
      close.setAttribute('aria-label', 'Dismiss');
      close.addEventListener('click', function () {
        node.remove();
      });
      node.appendChild(close);
    }
    return node;
  };

  Player.prototype._renderGate = function (cta, position) {
    var self = this;
    var node = el('div', 'sf-gate');
    node.setAttribute('data-cta', cta.id);
    node.setAttribute('data-sf', 'gate');
    var card = el('div', 'sf-gate-card');
    card.appendChild(el('h3', null, null)).textContent = cta.headline || 'Continue watching';
    if (cta.body) card.appendChild(el('p', null, null)).textContent = cta.body;
    var form = document.createElement('form');
    form.className = 'sf-gate-form';
    var fields = (cta.fields || 'email').split(',').map(function (f) {
      return f.trim();
    });
    var inputs = {};
    fields.forEach(function (field) {
      if (!field) return;
      var input = document.createElement('input');
      input.name = field;
      input.placeholder = field === 'email' ? 'you@company.com' : field.charAt(0).toUpperCase() + field.slice(1);
      input.type = field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text';
      if (field === 'email') input.required = true;
      input.setAttribute('data-sf', 'gate-' + field);
      form.appendChild(input);
      inputs[field] = input;
    });
    var submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'sf-gate-submit';
    submit.textContent = cta.button_text || 'Continue';
    submit.setAttribute('data-sf', 'gate-submit');
    form.appendChild(submit);
    var error = el('div', 'sf-gate-error');
    form.appendChild(error);

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      error.textContent = '';
      submit.disabled = true;
      fetch('/api/leads/' + encodeURIComponent(self.video.id), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: inputs.email ? inputs.email.value : '',
          name: inputs.name ? inputs.name.value : '',
          phone: inputs.phone ? inputs.phone.value : '',
          position: position,
          view_id: self.viewId,
        }),
      })
        .then(function (res) {
          return res.json().then(function (body) {
            return { ok: res.ok, body: body };
          });
        })
        .then(function (result) {
          submit.disabled = false;
          if (!result.ok) {
            error.textContent = result.body.error || 'Could not save that, please retry.';
            return;
          }
          node.remove();
          self.adapter.play();
        })
        .catch(function () {
          submit.disabled = false;
          error.textContent = 'Network error, please retry.';
        });
    });

    card.appendChild(form);
    if (cta.skippable) {
      var skip = el('button', 'sf-gate-skip', 'Skip for now');
      skip.setAttribute('data-sf', 'gate-skip');
      skip.addEventListener('click', function () {
        node.remove();
        self.adapter.play();
      });
      card.appendChild(skip);
    }
    node.appendChild(card);
    return node;
  };

  /* ------------------------------------------------------------- sharing -- */

  var SHARE_TARGETS = [
    { label: 'X', url: 'https://twitter.com/intent/tweet?url={u}&text={t}' },
    { label: 'LinkedIn', url: 'https://www.linkedin.com/sharing/share-offsite/?url={u}' },
    { label: 'Facebook', url: 'https://www.facebook.com/sharer/sharer.php?u={u}' },
    { label: 'WhatsApp', url: 'https://api.whatsapp.com/send?text={t}%20{u}' },
    { label: 'Email', url: 'mailto:?subject={t}&body={u}' },
  ];

  function copyText(value, button, done) {
    var reset = function () {
      button.textContent = done;
      setTimeout(function () {
        button.textContent = button.getAttribute('data-label') || done;
      }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(reset, reset);
      return;
    }
    var field = document.createElement('textarea');
    field.value = value;
    document.body.appendChild(field);
    field.select();
    try {
      document.execCommand('copy');
    } catch (e) {
      /* clipboard unavailable; the field selection is the fallback */
    }
    document.body.removeChild(field);
    reset();
  }

  Player.prototype.toggleShare = function () {
    if (this.shareSheet) {
      this.shareSheet.remove();
      this.shareSheet = null;
      return;
    }
    var share = this.payload.share || {};
    var title = (this.payload.video && this.payload.video.title) || '';
    var sheet = el('div', 'sf-share-sheet');
    sheet.setAttribute('data-sf', 'share-sheet');
    var card = el('div', 'sf-share-card');
    card.appendChild(el('h4', null, null)).textContent = 'Share';

    var row = el('div', 'sf-share-row');
    SHARE_TARGETS.forEach(function (target) {
      var link = document.createElement('a');
      link.className = 'sf-share-target';
      link.href = target.url
        .replace(/\{u\}/g, encodeURIComponent(share.url || ''))
        .replace(/\{t\}/g, encodeURIComponent(title));
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = target.label;
      row.appendChild(link);
    });
    card.appendChild(row);

    [
      { label: 'Copy link', value: share.url || '' },
      { label: 'Copy embed code', value: share.embed || '' },
    ].forEach(function (item) {
      if (!item.value) return;
      var button = el('button', 'sf-share-copy', null);
      button.textContent = item.label;
      button.setAttribute('data-label', item.label);
      button.addEventListener('click', function () {
        copyText(item.value, button, 'Copied');
      });
      card.appendChild(button);
    });

    var close = el('button', 'sf-share-close', '\u00d7');
    close.setAttribute('aria-label', 'Close share');
    var self = this;
    close.addEventListener('click', function () {
      self.toggleShare();
    });
    card.appendChild(close);
    sheet.appendChild(card);
    this.overlay.appendChild(sheet);
    this.shareSheet = sheet;
  };

  /* --------------------------------------------------------- suggestions -- */

  Player.prototype._showRelated = function () {
    var items = this.payload.related || [];
    if (!this.config.related || !items.length || this.relatedNode) return;
    var self = this;
    var node = el('div', 'sf-related');
    node.setAttribute('data-sf', 'related');
    var head = el('div', 'sf-related-head', null);
    head.textContent = 'Watch next';
    node.appendChild(head);
    var grid = el('div', 'sf-related-grid');
    items.slice(0, 6).forEach(function (item) {
      var link = document.createElement('a');
      link.className = 'sf-related-item';
      link.href = '/v/' + item.slug;
      link.target = '_top';
      if (item.thumbnail_url) {
        var img = document.createElement('img');
        img.src = item.thumbnail_url;
        img.alt = '';
        img.loading = 'lazy';
        link.appendChild(img);
      }
      var caption = el('span', 'sf-related-title', null);
      caption.textContent = item.title;
      link.appendChild(caption);
      grid.appendChild(link);
    });
    node.appendChild(grid);
    var again = el('button', 'sf-related-replay', 'Watch again');
    again.addEventListener('click', function () {
      node.remove();
      self.relatedNode = null;
      self.adapter.seek(0);
      self.adapter.play();
    });
    node.appendChild(again);
    this.ctaLayer.appendChild(node);
    this.relatedNode = node;
  };

  Player.prototype._showEndscreen = function () {
    var self = this;
    var end = this.ctas.filter(function (cta) {
      return cta.kind === 'endscreen';
    })[0];
    if (!end) {
      this._showRelated();
      return;
    }
    var node = el('div', 'sf-endscreen');
    node.setAttribute('data-sf', 'endscreen');
    var card = el('div', 'sf-endscreen-card');
    card.appendChild(el('h3', null, null)).textContent = end.headline || 'Thanks for watching';
    if (end.body) card.appendChild(el('p', null, null)).textContent = end.body;
    if (end.button_text && end.button_url) {
      var link = document.createElement('a');
      link.className = 'sf-cta-btn';
      link.href = end.button_url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = end.button_text;
      link.addEventListener('click', function () {
        self.track('cta_click', self.adapter.duration(), self.adapter.duration(), end.id);
      });
      card.appendChild(link);
    }
    var again = el('button', 'sf-endscreen-replay', 'Watch again');
    again.addEventListener('click', function () {
      node.remove();
      self.adapter.seek(0);
      self.adapter.play();
    });
    card.appendChild(again);
    node.appendChild(card);
    this.ctaLayer.appendChild(node);
  };

  /* ------------------------------------------------------------ controls -- */

  Player.prototype.togglePlay = function () {
    if (this.adapter.paused()) this.adapter.play();
    else this.adapter.pause();
  };

  Player.prototype.toggleMute = function () {
    var muted = !this.adapter.muted();
    this.adapter.setMuted(muted);
    this._setVolIcon(muted);
    if (this.volInput) this.volInput.value = muted ? '0' : '1';
  };

  Player.prototype.toggleFullscreen = function () {
    var node = this.root;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (node.requestFullscreen) {
      node.requestFullscreen();
    }
  };

  Player.prototype._setPlayIcon = function (playing) {
    if (!this.playBtn) return;
    this.playBtn.innerHTML = icon(playing ? 'pause' : 'play');
    this.playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    this.playBtn.setAttribute('data-tip', playing ? 'Pause' : 'Play');
  };

  Player.prototype._setVolIcon = function (muted) {
    if (!this.muteBtn) return;
    this.muteBtn.innerHTML = icon(muted ? 'muted' : 'volume');
    this.muteBtn.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    this.muteBtn.setAttribute('data-tip', muted ? 'Unmute' : 'Mute');
  };

  Player.prototype._bindKeys = function () {
    var self = this;
    if (!this.config.controls.keyboard) return;
    this.root.tabIndex = 0;
    var handler = function (event) {
      // Never hijack typing in form controls (lead gate, password unlock, volume slider).
      if (event.target && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
      if (event.__sfHandled) return;
      var key = event.key;
      var duration = self.adapter.duration();
      var t = self.adapter.currentTime();
      var handled = true;
      switch (key) {
        case ' ':
        case 'k':
          self.togglePlay();
          break;
        case 'ArrowRight':
        case 'l':
          self.adapter.seek(t + (key === 'l' ? 10 : 5));
          break;
        case 'ArrowLeft':
        case 'j':
          self.adapter.seek(Math.max(0, t - (key === 'j' ? 10 : 5)));
          break;
        case 'ArrowUp':
          self._nudgeVolume(0.1);
          break;
        case 'ArrowDown':
          self._nudgeVolume(-0.1);
          break;
        case 'm':
          self.toggleMute();
          break;
        case 'f':
          self.toggleFullscreen();
          break;
        case 'c':
          self.toggleCaptions();
          break;
        case 'p':
          if (self.adapter.togglePip) self.adapter.togglePip();
          break;
        case '>':
          self._stepRate(1);
          break;
        case '<':
          self._stepRate(-1);
          break;
        case 'Escape':
          if (self.settings && self.settings.host.classList.contains('sf-open')) self.settings.close();
          else handled = false;
          break;
        case 'Home':
          self.adapter.seek(0);
          break;
        case 'End':
          if (duration) self.adapter.seek(duration - 1);
          break;
        default:
          if (/^[0-9]$/.test(key) && duration > 0) {
            self.adapter.seek((parseInt(key, 10) / 10) * duration);
          } else {
            handled = false;
          }
      }
      if (handled) {
        event.__sfHandled = true;
        event.preventDefault();
      }
    };
    this.root.addEventListener('keydown', handler);
    // Inside an embed iframe the document itself owns the key events.
    if (window.self !== window.top || this.payload.captureDocumentKeys) {
      document.addEventListener('keydown', handler);
    }
  };

  Player.prototype._nudgeVolume = function (delta) {
    if (!this.volInput) return;
    var next = Math.min(1, Math.max(0, parseFloat(this.volInput.value) + delta));
    this.volInput.value = String(next);
    this.adapter.setVolume(next);
    this.adapter.setMuted(next === 0);
    this._setVolIcon(next === 0);
  };

  Player.prototype._stepRate = function (direction) {
    var speeds = this._speeds || (this.config.speeds && this.config.speeds.length ? this.config.speeds : SPEED_FALLBACK);
    this._rateIndex = this._rateIndex == null ? speeds.indexOf(1) : this._rateIndex;
    this._rateIndex = Math.min(speeds.length - 1, Math.max(0, this._rateIndex + direction));
    this.adapter.setRate(speeds[this._rateIndex]);
    this._selectSetting(this.speedSetting, this._rateIndex);
  };

  Player.prototype._bindPointer = function () {
    var self = this;
    var hide;
    var overBar = false;
    var wokeAt = 0;
    var show = function () {
      if (!self.root.classList.contains('sf-active')) wokeAt = Date.now();
      self.root.classList.add('sf-active');
      clearTimeout(hide);
      hide = setTimeout(function () {
        if (!overBar && !self.adapter.paused()) self.root.classList.remove('sf-active');
      }, 2500);
    };
    this.root.addEventListener('mousemove', show);
    this.root.addEventListener('touchstart', show);
    /* A cursor resting on a control sends no further mousemove, so without this the bar
       fades out underneath it and the next click falls through to the picture. */
    if (this.controls) {
      this.controls.addEventListener('mouseenter', function () {
        overBar = true;
        show();
      });
      this.controls.addEventListener('mouseleave', function () {
        overBar = false;
        show();
      });
    }
    /* A faded bar takes no pointer events and slides off the bottom edge, so a click
       aimed at a control lands on the picture instead — and the pointer move that
       carried it there has already started the bar's 400ms slide back in. Within that
       window a click over the bar's or rail's footprint only wakes the controls; a
       click anywhere else still toggles playback on the first press. */
    var WAKE_MS = 450;
    var inBox = function (event, box) {
      return (
        event.clientX >= box.left &&
        event.clientX <= box.right &&
        event.clientY >= box.top &&
        event.clientY <= box.bottom
      );
    };
    var overHiddenControl = function (event) {
      if (Date.now() - wokeAt > WAKE_MS) return false;
      if (self.rail && inBox(event, self.rail.getBoundingClientRect())) return true;
      if (!self.controls) return false;
      var stage = self.root.getBoundingClientRect();
      var height = self.controls.offsetHeight;
      // Measured off the stage, not the bar: mid-slide the bar's own rect is still
      // partly below the player.
      return inBox(event, {
        left: stage.left,
        right: stage.right,
        top: stage.bottom - height,
        bottom: stage.bottom,
      });
    };
    /* The rail only fades opacity, so the pointer move that wakes it restores its clicks
       before the click arrives and it would fire on a button the viewer could not see.
       Caught here so the rail and the bar behave the same: the first click only wakes. */
    this.root.addEventListener(
      'click',
      function (event) {
        if (Date.now() - wokeAt > WAKE_MS || self.adapter.paused()) return;
        var node = event.target;
        if (!node || !node.closest || !node.closest('.sf-rail, .sf-controls')) return;
        event.stopPropagation();
        event.preventDefault();
        show();
      },
      true,
    );
    this.overlay.addEventListener('click', function (event) {
      if (event.target !== self.overlay) return;
      if (overHiddenControl(event)) {
        show();
        return;
      }
      self.togglePlay();
    });
    this.overlay.addEventListener('dblclick', function (event) {
      if (event.target === self.overlay) self.toggleFullscreen();
    });
    show();
  };

  Player.prototype._bindSticky = function () {
    var self = this;
    /* The trigger has to be a sentinel that stays in the flow: measuring the
       player itself puts it back on screen the moment it turns fixed, which
       cancels the state it just entered. */
    var anchor = el('div', 'sf-sticky-anchor');
    if (!this.root.parentNode) return;
    this.root.parentNode.insertBefore(anchor, this.root);
    var height = 0;
    var update = function () {
      var stuck = self.root.classList.contains('sf-sticky');
      if (!stuck) height = self.root.offsetHeight;
      var top = anchor.getBoundingClientRect().top;
      var gone = top + height < 40 || top > window.innerHeight - 40;
      var next = gone && !self.adapter.paused();
      if (next === stuck) return;
      /* The reserved height keeps the page from jumping when the player leaves the flow. */
      anchor.style.height = next ? height + 'px' : '';
      self.root.classList.toggle('sf-sticky', next);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    this.adapter.on('pause', update);
    this.adapter.on('play', update);
  };

  /* ------------------------------------------------------------ tracking -- */

  Player.prototype._storageKey = function () {
    return 'sf_pos_' + this.video.id;
  };
  Player.prototype._savePosition = function (t) {
    try {
      localStorage.setItem(this._storageKey(), String(Math.floor(t)));
    } catch (e) {
      /* private mode */
    }
  };
  Player.prototype._savedPosition = function () {
    try {
      return parseInt(localStorage.getItem(this._storageKey()) || '0', 10) || 0;
    } catch (e) {
      return 0;
    }
  };

  Player.prototype.track = function (kind, position, duration, value) {
    if (!this._trackingEnabled) return;
    var body = JSON.stringify({
      video_id: this.video.id,
      view_id: this.viewId,
      kind: kind,
      position: position != null ? position : this.adapter ? this.adapter.currentTime() : 0,
      duration: duration != null ? duration : this.adapter ? this.adapter.duration() : 0,
      value: value || '',
      variant: this.variant,
    });
    /* A play has to hear the answer back, because the server refuses the play that
       crosses a hard-stop allowance; beacons are fire-and-forget, so they can't. */
    if (kind === 'play') {
      var self = this;
      fetch('/api/track', { method: 'POST', headers: { 'content-type': 'application/json' }, body: body })
        .then(function (res) { return res.json(); })
        .then(function (result) {
          if (result && result.capped) self.stopForCap();
        })
        .catch(function () {});
      return;
    }
    try {
      if (navigator.sendBeacon && kind !== 'load') {
        navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
        return;
      }
    } catch (e) {
      /* fall through to fetch */
    }
    fetch('/api/track', { method: 'POST', headers: { 'content-type': 'application/json' }, body: body }).catch(
      function () {},
    );
  };

  /* The owning account ran out of plays mid-view: stop the picture and say so. */
  Player.prototype.stopForCap = function () {
    if (this._capped) return;
    this._capped = true;
    this._trackingEnabled = false;
    try {
      if (this.adapter) this.adapter.pause();
    } catch (e) {
      /* the adapter may already be gone */
    }
    var payload = { video: this.video };
    this.destroy();
    mountCapped(this.root, payload);
  };

  Player.prototype.destroy = function () {
    clearInterval(this._tick);
    if (this.adapter && this.adapter.destroy) this.adapter.destroy();
    this.root.innerHTML = '';
  };

  /* ------------------------------------------------------------ password -- */

  /* Shown when the owning account is out of monthly plays on a plan that stops
     at its allowance; paid plans never reach this. */
  function mountCapped(root, payload) {
    root.classList.add('sf-player', 'sf-locked');
    root.innerHTML = '';
    var card = el('div', 'sf-lock-card');
    card.appendChild(el('h3', null, null)).textContent = 'This video is unavailable right now';
    card.appendChild(el('p', null, null)).textContent =
      (payload.video && payload.video.title ? payload.video.title + ' has ' : 'This video has ') +
      'reached the monthly play limit on its plan. Please check back next month.';
    root.appendChild(card);
  }

  function mountLocked(root, payload) {
    root.classList.add('sf-player', 'sf-locked');
    root.innerHTML = '';
    var card = el('div', 'sf-lock-card');
    card.appendChild(el('h3', null, null)).textContent = payload.video.title || 'Protected video';
    card.appendChild(el('p', null, null)).textContent = 'Enter the password to watch this video.';
    var form = document.createElement('form');
    var input = document.createElement('input');
    input.type = 'password';
    input.placeholder = 'Password';
    input.required = true;
    input.setAttribute('data-sf', 'lock-password');
    var submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'Unlock';
    submit.setAttribute('data-sf', 'lock-submit');
    var error = el('div', 'sf-gate-error');
    form.appendChild(input);
    form.appendChild(submit);
    form.appendChild(error);
    card.appendChild(form);
    root.appendChild(card);

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      error.textContent = '';
      submit.disabled = true;
      fetch('/api/embed/' + encodeURIComponent(payload.video.id) + '/unlock', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: input.value }),
      })
        .then(function (res) {
          return res.json().then(function (body) {
            return { ok: res.ok, body: body };
          });
        })
        .then(function (result) {
          submit.disabled = false;
          if (!result.ok) {
            error.textContent = result.body.error || 'Incorrect password';
            return;
          }
          return fetch(
            '/api/embed/' + encodeURIComponent(payload.video.id) + '?token=' + encodeURIComponent(result.body.token),
          )
            .then(function (res) {
              return res.json();
            })
            .then(function (full) {
              root.classList.remove('sf-locked');
              // Carry page-level options (e.g. document key capture) onto the unlocked payload.
              full.captureDocumentKeys = payload.captureDocumentKeys;
              return new Player(root, full).mount();
            });
        })
        .catch(function () {
          submit.disabled = false;
          error.textContent = 'Network error, please retry.';
        });
    });
  }

  /* -------------------------------------------------------------- public -- */

  var StreamForge = {
    mount: function (root, payload) {
      if (!root || !payload) return Promise.resolve(null);
      if (payload.locked) {
        mountLocked(root, payload);
        return Promise.resolve(null);
      }
      if (payload.capped) {
        mountCapped(root, payload);
        return Promise.resolve(null);
      }
      var player = new Player(root, payload);
      return player.mount();
    },
    mountById: function (root, videoId, options) {
      return fetch('/api/embed/' + encodeURIComponent(videoId))
        .then(function (res) {
          return res.json().then(function (body) {
            return { status: res.status, body: body };
          });
        })
        .then(function (result) {
          if (result.status === 401 && result.body.code === 'password_required') {
            return StreamForge.mount(root, { locked: true, video: { id: videoId, title: result.body.title || '' } });
          }
          if (result.status >= 400) {
            root.innerHTML = '<div class="sf-error">' + (result.body.error || 'Unable to load video') + '</div>';
            return null;
          }
          return StreamForge.mount(root, Object.assign(result.body, options || {}));
        });
    },
    Player: Player,
    formatTime: fmtTime,
  };

  // `Videokr` is the current name; `StreamForge` stays for embeds already in the wild.
  window.Videokr = StreamForge;
  window.StreamForge = StreamForge;
})();
