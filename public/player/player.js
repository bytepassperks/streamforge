/**
 * StreamForge player — a single custom control surface on top of several video
 * sources (YouTube, Vimeo, MP4, HLS). No dependencies, no build step.
 */
(function () {
  'use strict';

  var SPEED_FALLBACK = [0.5, 0.75, 1, 1.25, 1.5, 2];

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
    var mount = el('div');
    crop.appendChild(mount);
    host.appendChild(crop);
    /* The shield keeps every pointer event off the frame, so the source's own
       title bar, watermark and suggestion overlays never get a chance to appear. */
    host.appendChild(el('div', 'sf-yt-shield'));
    /* Until playback is genuinely running, the frame is masked by our own still, so
       the source's unstarted screen — its title, avatar and watch-elsewhere link —
       is never on screen. */
    var cover = el('div', 'sf-yt-cover');
    var still = this._options.poster || 'https://i.ytimg.com/vi/' + this._source + '/maxresdefault.jpg';
    cover.style.backgroundImage = 'url("' + still + '")';
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
                self._dropCaptions();
                self._duration = self._yt.getDuration() || 0;
                self.emit('ready');
                resolve();
              },
              onStateChange: function (e) {
                var YTS = window.YT.PlayerState;
                if (e.data === YTS.PLAYING) {
                  self._dropCaptions();
                  /* A short mask keeps the source's start-up chrome off screen. */
                  clearTimeout(self._unmask);
                  self._unmask = setTimeout(function () {
                    self._host.classList.remove('sf-yt-blank');
                  }, 900);
                  self.emit('play');
                }
                if (e.data === YTS.PAUSED) self.emit('pause');
                if (e.data === YTS.ENDED) {
                  /* Blank and rewind the frame so a suggestion grid can never render. */
                  clearTimeout(self._unmask);
                  self._host.classList.add('sf-yt-blank');
                  self._yt.seekTo(0, true);
                  self._yt.pauseVideo();
                  self.emit('ended');
                }
              },
            },
          });
        });
      });
  };

  /** A viewer's own caption preference must not burn text over our player. */
  YouTubeAdapter.prototype._dropCaptions = function () {
    if (!this._yt) return;
    var self = this;
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
    if (this._yt) this._yt.pauseVideo();
  };
  YouTubeAdapter.prototype.currentTime = function () {
    return this._yt && this._ready ? this._yt.getCurrentTime() || 0 : 0;
  };
  YouTubeAdapter.prototype.duration = function () {
    if (this._yt && this._ready) this._duration = this._yt.getDuration() || this._duration;
    return this._duration;
  };
  YouTubeAdapter.prototype.seek = function (t) {
    if (this._yt) this._yt.seekTo(Math.max(0, t), true);
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
    video.setAttribute('crossorigin', 'anonymous');
    if (this._options.poster) video.poster = this._options.poster;
    if (this._options.captionsUrl) {
      var track = document.createElement('track');
      track.kind = 'subtitles';
      track.label = 'Captions';
      track.srclang = 'en';
      track.src = this._options.captionsUrl;
      track.default = false;
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
    return !on;
  };
  HtmlAdapter.prototype.hasCaptions = function () {
    return !!(this._video.textTracks && this._video.textTracks.length);
  };
  HtmlAdapter.prototype.element = function () {
    return this._video;
  };

  /** Vimeo player adapter driven over postMessage. */
  function VimeoAdapter(container, source) {
    Emitter.call(this);
    this.kind = 'vimeo';
    this._container = container;
    this._source = source;
    this._time = 0;
    this._duration = 0;
    this._paused = true;
  }
  VimeoAdapter.prototype = Object.create(Emitter.prototype);

  VimeoAdapter.prototype.load = function () {
    var self = this;
    var host = el('div', 'sf-media');
    var frame = document.createElement('iframe');
    frame.src =
      'https://player.vimeo.com/video/' + encodeURIComponent(this._source) + '?controls=0&title=0&byline=0&portrait=0';
    frame.allow = 'autoplay; fullscreen; picture-in-picture';
    frame.frameBorder = '0';
    host.appendChild(frame);
    this._container.appendChild(host);
    this._frame = frame;

    window.addEventListener('message', function (event) {
      if (!self._frame || event.source !== self._frame.contentWindow) return;
      var data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      if (data.event === 'ready') {
        self._post('addEventListener', 'playProgress');
        self._post('addEventListener', 'play');
        self._post('addEventListener', 'pause');
        self._post('addEventListener', 'finish');
        self.emit('ready');
      } else if (data.event === 'playProgress' && data.data) {
        self._time = data.data.seconds;
        self._duration = data.data.duration;
      } else if (data.event === 'play') {
        self._paused = false;
        self.emit('play');
      } else if (data.event === 'pause') {
        self._paused = true;
        self.emit('pause');
      } else if (data.event === 'finish') {
        self.emit('ended');
      }
    });
    return Promise.resolve();
  };

  VimeoAdapter.prototype._post = function (method, value) {
    if (!this._frame || !this._frame.contentWindow) return;
    this._frame.contentWindow.postMessage(JSON.stringify({ method: method, value: value }), '*');
  };
  VimeoAdapter.prototype.play = function () {
    this._post('play');
  };
  VimeoAdapter.prototype.pause = function () {
    this._post('pause');
  };
  VimeoAdapter.prototype.currentTime = function () {
    return this._time;
  };
  VimeoAdapter.prototype.duration = function () {
    return this._duration;
  };
  VimeoAdapter.prototype.seek = function (t) {
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
  VimeoAdapter.prototype.element = function () {
    return this._frame;
  };

  function createAdapter(container, payload) {
    var v = payload.video;
    var cfg = payload.player;
    if (v.source_type === 'youtube')
      return new YouTubeAdapter(container, v.source_ref, { poster: v.thumbnail_url });
    if (v.source_type === 'vimeo') return new VimeoAdapter(container, v.source_ref);
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
    this.root.classList.add('sf-player', 'sf-skin-' + (cfg.skin || 'forge-dark'));
    this.root.style.setProperty('--sf-accent', cfg.accent || '#4f7cff');
    this.root.style.setProperty('--sf-bg', cfg.background || '#0b0d12');
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
      this.overlay.appendChild(badge);
    }

    if (cfg.bigPlayButton) {
      this.bigPlay = el('button', 'sf-bigplay', '<span class="sf-ico-play"></span>');
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

    this.adapter.on('ready', function () {
      self._onReady();
    });
    this.adapter.on('play', function () {
      self.root.classList.add('sf-playing');
      if (self.bigPlay) self.bigPlay.style.display = 'none';
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

    if (cfg.controls.playPause) {
      this.playBtn = el('button', 'sf-btn sf-play', '<span class="sf-ico-play"></span>');
      this.playBtn.setAttribute('aria-label', 'Play');
      this.playBtn.setAttribute('data-sf', 'play');
      this.playBtn.addEventListener('click', function () {
        self.togglePlay();
      });
      bar.appendChild(this.playBtn);
    }

    if (cfg.controls.progress) {
      var wrap = el('div', 'sf-progress-wrap');
      this.progress = el('div', 'sf-progress');
      this.progress.setAttribute('data-sf', 'progress');
      this.buffer = el('div', 'sf-buffer');
      this.played = el('div', 'sf-played');
      this.handle = el('div', 'sf-handle');
      this.markers = el('div', 'sf-markers');
      this.progress.appendChild(this.buffer);
      this.progress.appendChild(this.played);
      this.progress.appendChild(this.markers);
      this.progress.appendChild(this.handle);
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
      this.timeLabel = el('div', 'sf-time', '0:00 / 0:00');
      this.timeLabel.setAttribute('data-sf', 'time');
      bar.appendChild(this.timeLabel);
    }

    if (cfg.controls.volume) {
      var volWrap = el('div', 'sf-volume');
      this.muteBtn = el('button', 'sf-btn sf-mute', '<span class="sf-ico-vol"></span>');
      this.muteBtn.setAttribute('aria-label', 'Mute');
      this.muteBtn.setAttribute('data-sf', 'mute');
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

    if (cfg.controls.chapters && this.chapters.length) {
      bar.appendChild(
        this._menu('sf-chapters', 'Chapters', '<span class="sf-ico-list"></span>', this.chapters.map(function (ch) {
          return {
            label: fmtTime(ch.start_seconds) + '  ' + ch.title,
            onSelect: function () {
              self.adapter.seek(ch.start_seconds);
              self.adapter.play();
            },
          };
        })),
      );
    }

    if (cfg.controls.speed) {
      var speeds = (cfg.speeds && cfg.speeds.length ? cfg.speeds : SPEED_FALLBACK).slice();
      this.speedBtn = this._menu(
        'sf-speed',
        'Playback speed',
        '<span class="sf-speed-label">1x</span>',
        speeds.map(function (rate) {
          return {
            label: rate + 'x',
            onSelect: function () {
              self.adapter.setRate(rate);
              var label = self.speedBtn.querySelector('.sf-speed-label');
              if (label) label.textContent = rate + 'x';
            },
          };
        }),
      );
      bar.appendChild(this.speedBtn);
    }

    if (cfg.controls.captions) {
      this.ccBtn = el('button', 'sf-btn sf-cc', '<span class="sf-ico-cc"></span>');
      this.ccBtn.setAttribute('aria-label', 'Captions');
      this.ccBtn.setAttribute('data-sf', 'captions');
      this.ccBtn.addEventListener('click', function () {
        if (self.adapter.toggleCaptions) {
          var on = self.adapter.toggleCaptions();
          self.ccBtn.classList.toggle('sf-active', !!on);
        }
      });
      bar.appendChild(this.ccBtn);
    }

    if (cfg.controls.pip) {
      this.pipBtn = el('button', 'sf-btn sf-pip', '<span class="sf-ico-pip"></span>');
      this.pipBtn.setAttribute('aria-label', 'Picture in picture');
      this.pipBtn.setAttribute('data-sf', 'pip');
      this.pipBtn.addEventListener('click', function () {
        if (self.adapter.togglePip) self.adapter.togglePip();
      });
      bar.appendChild(this.pipBtn);
    }

    if (cfg.controls.fullscreen) {
      this.fsBtn = el('button', 'sf-btn sf-fs', '<span class="sf-ico-fs"></span>');
      this.fsBtn.setAttribute('aria-label', 'Fullscreen');
      this.fsBtn.setAttribute('data-sf', 'fullscreen');
      this.fsBtn.addEventListener('click', function () {
        self.toggleFullscreen();
      });
      bar.appendChild(this.fsBtn);
    }

    return bar;
  };

  Player.prototype._menu = function (cls, label, iconHtml, items) {
    var host = el('div', 'sf-menu ' + cls);
    var btn = el('button', 'sf-btn', iconHtml);
    btn.setAttribute('aria-label', label);
    btn.setAttribute('data-sf', cls.replace('sf-', ''));
    var list = el('div', 'sf-menu-list');
    items.forEach(function (item) {
      var row = el('button', 'sf-menu-item');
      row.textContent = item.label;
      row.addEventListener('click', function (event) {
        event.stopPropagation();
        item.onSelect();
        host.classList.remove('sf-open');
      });
      list.appendChild(row);
    });
    btn.addEventListener('click', function (event) {
      event.stopPropagation();
      host.classList.toggle('sf-open');
    });
    document.addEventListener('click', function () {
      host.classList.remove('sf-open');
    });
    host.appendChild(btn);
    host.appendChild(list);
    return host;
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
    if (this.timeLabel) this.timeLabel.textContent = fmtTime(t) + ' / ' + fmtTime(duration);
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

  Player.prototype._showEndscreen = function () {
    var self = this;
    var end = this.ctas.filter(function (cta) {
      return cta.kind === 'endscreen';
    })[0];
    if (!end) return;
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
    this.playBtn.innerHTML = playing ? '<span class="sf-ico-pause"></span>' : '<span class="sf-ico-play"></span>';
    this.playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  };

  Player.prototype._setVolIcon = function (muted) {
    if (!this.muteBtn) return;
    this.muteBtn.innerHTML = muted ? '<span class="sf-ico-mute"></span>' : '<span class="sf-ico-vol"></span>';
    this.muteBtn.classList.toggle('sf-active', !muted);
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
          if (self.adapter.toggleCaptions) self.adapter.toggleCaptions();
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
    var speeds = this.config.speeds && this.config.speeds.length ? this.config.speeds : SPEED_FALLBACK;
    this._rateIndex = this._rateIndex == null ? speeds.indexOf(1) : this._rateIndex;
    this._rateIndex = Math.min(speeds.length - 1, Math.max(0, this._rateIndex + direction));
    var rate = speeds[this._rateIndex];
    this.adapter.setRate(rate);
    if (this.speedBtn) {
      var label = this.speedBtn.querySelector('.sf-speed-label');
      if (label) label.textContent = rate + 'x';
    }
  };

  Player.prototype._bindPointer = function () {
    var self = this;
    var hide;
    var show = function () {
      self.root.classList.add('sf-active');
      clearTimeout(hide);
      hide = setTimeout(function () {
        if (!self.adapter.paused()) self.root.classList.remove('sf-active');
      }, 2500);
    };
    this.root.addEventListener('mousemove', show);
    this.root.addEventListener('touchstart', show);
    this.overlay.addEventListener('click', function (event) {
      if (event.target === self.overlay) self.togglePlay();
    });
    this.overlay.addEventListener('dblclick', function (event) {
      if (event.target === self.overlay) self.toggleFullscreen();
    });
    show();
  };

  Player.prototype._bindSticky = function () {
    var self = this;
    if (!('IntersectionObserver' in window)) return;
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var offscreen = !entry.isIntersecting && !self.adapter.paused();
          self.root.classList.toggle('sf-sticky', offscreen);
        });
      },
      { threshold: 0.15 },
    );
    observer.observe(this.root);
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

  Player.prototype.destroy = function () {
    clearInterval(this._tick);
    this.root.innerHTML = '';
  };

  /* ------------------------------------------------------------ password -- */

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
