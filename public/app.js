/* Videokr dashboard. Dependency-free, talks to /api and previews the real player. */
(function () {
  'use strict';

  var state = { user: null, projects: [], videos: [], playlists: [], video: null, config: null, publicBase: '' };

  /* Every link a customer copies out of the dashboard has to point at the
     canonical public host, which the server knows and this page may not. */
  function shareBase() {
    return state.publicBase || location.origin;
  }
  var SVG_NS = 'http://www.w3.org/2000/svg';

  /* ------------------------------------------------------------- helpers -- */

  function $(id) {
    return document.getElementById(id);
  }

  function api(path, options) {
    var opts = options || {};
    var init = { method: opts.method || 'GET', credentials: 'same-origin', headers: {} };
    if (opts.body !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    if (opts.form) init.body = opts.form;
    /* Without a deadline a stalled request leaves a pane on "Loading…" for ever,
       which reads as a dead button. */
    if (typeof window.AbortController === 'function') {
      var controller = new window.AbortController();
      init.signal = controller.signal;
      setTimeout(function () {
        controller.abort();
      }, opts.timeout || 20000);
    }
    return fetch('/api' + path, init).then(
      function (res) {
        if (res.status === 401 && path.indexOf('/auth/') !== 0) {
          location.href = '/login.html';
          throw new Error('unauthorized');
        }
        // An error page is not always JSON, and a parse failure must not look like
        // a hang either.
        return res.text().then(function (raw) {
          var body = {};
          try {
            body = raw ? JSON.parse(raw) : {};
          } catch (err) {
            if (res.ok) throw new Error('unexpected response from the server');
          }
          if (!res.ok) throw new Error(body.error || 'Request failed (' + res.status + ')');
          return body;
        });
      },
      function (err) {
        throw new Error(err && err.name === 'AbortError' ? 'the request timed out' : 'network error');
      },
    );
  }

  /* Every blank pane says what would be here and how to fill it, rather than
     one grey line of prose. */
  function emptyState(title, hint, kind) {
    var box = text('div', 'empty' + (kind ? ' is-' + kind : ''));
    box.appendChild(text('b', null, title));
    if (hint) box.appendChild(text('span', null, hint));
    return box;
  }

  function setLoading(host, label) {
    host.textContent = '';
    host.appendChild(text('div', 'loading', label || 'Loading'));
  }

  function panelError(host, error, retry) {
    host.textContent = '';
    var box = text('div', 'empty is-bad');
    box.appendChild(text('b', null, 'That did not load'));
    box.appendChild(text('span', null, (error && error.message) || 'Could not load this.'));
    if (retry) {
      var again = text('button', 'btn btn-ghost btn-sm', 'Try again');
      again.type = 'button';
      again.addEventListener('click', retry);
      box.appendChild(again);
    }
    host.appendChild(box);
  }

  /* Library posters: a source url that 404s has to fall back, not leave a blank tile. */
  function thumbNode(video) {
    if (!video.thumbnail_url) return text('div', 'thumb-ph');
    var img = document.createElement('img');
    img.src = video.thumbnail_url;
    img.alt = '';
    img.addEventListener('error', function () {
      var ph = text('div', 'thumb-ph');
      if (img.parentNode) img.parentNode.replaceChild(ph, img);
    });
    return img;
  }

  /* Auto posters -------------------------------------------------------------
     An uploaded film has no artwork of its own, and an empty tile reads as a
     broken video. A frame out of the film itself is a better first poster, and
     the browser can take it: the file (or our own /media url) is already
     readable here, so nothing has to be decoded server-side. */
  // Films open on black, and a black poster reads as a missing thumbnail, so
  // several points in the film are tried and the first bright frame wins.
  var POSTER_AT = [0.1, 0.25, 0.45, 0.7];
  var POSTER_MAX_WIDTH = 1280;
  var POSTER_MIN_LUMA = 34; // out of 255, measured over the whole frame

  function frameLuma(paper, canvas) {
    // A coarse sample is enough to tell a black frame from a picture, and it
    // keeps the read off the main thread's critical path on large frames.
    var pixels;
    try {
      pixels = paper.getImageData(0, 0, canvas.width, canvas.height).data;
    } catch (err) {
      return POSTER_MIN_LUMA; // tainted canvas: treated as good enough to try
    }
    var total = 0;
    var seen = 0;
    for (var i = 0; i < pixels.length; i += 160) {
      total += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
      seen += 1;
    }
    return seen ? total / seen : 0;
  }

  function grabFrame(src) {
    return new Promise(function (resolve, reject) {
      var video = document.createElement('video');
      var settled = false;
      var attempt = 0;
      var best = null;
      var timer = window.setTimeout(function () {
        if (best) finish(best);
        else finish(null, 'reading the video took too long');
      }, 20000);

      function finish(shot, reason) {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        video.removeAttribute('src');
        video.load();
        if (shot) resolve(shot);
        else reject(new Error(reason));
      }

      function seekTo(index) {
        var length = isFinite(video.duration) ? video.duration : 0;
        if (!length) {
          video.currentTime = 0.1;
          return;
        }
        video.currentTime = Math.min(length * POSTER_AT[index], length - 0.05);
      }

      video.muted = true;
      video.preload = 'auto';
      video.crossOrigin = 'anonymous';
      video.addEventListener('loadeddata', function () {
        seekTo(0);
      });
      video.addEventListener('seeked', function () {
        var width = video.videoWidth;
        var height = video.videoHeight;
        if (!width || !height) {
          finish(null, 'this video has no picture to grab');
          return;
        }
        var scale = Math.min(1, POSTER_MAX_WIDTH / width);
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        var paper = canvas.getContext('2d');
        if (!paper) {
          finish(null, 'this browser cannot copy a frame');
          return;
        }
        paper.drawImage(video, 0, 0, canvas.width, canvas.height);
        var luma = frameLuma(paper, canvas);
        var length = isFinite(video.duration) ? video.duration : 0;
        // A cross-origin frame taints the canvas, which throws here rather than
        // silently handing back a blank poster.
        try {
          canvas.toBlob(
            function (blob) {
              if (!blob) {
                finish(null, 'the frame could not be saved');
                return;
              }
              var shot = { blob: blob, duration: length ? Math.round(length) : 0, luma: luma };
              if (!best || shot.luma > best.luma) best = shot;
              attempt += 1;
              if (best.luma >= POSTER_MIN_LUMA || attempt >= POSTER_AT.length || !length) {
                finish(best);
                return;
              }
              seekTo(attempt);
            },
            'image/jpeg',
            0.82,
          );
        } catch (err) {
          finish(null, 'this video does not allow frames to be copied');
        }
      });
      video.addEventListener('error', function () {
        finish(null, 'this video could not be read');
      });
      video.src = src;
    });
  }

  function uploadFrame(shot) {
    var form = new FormData();
    form.append('file', new File([shot.blob], 'poster.jpg', { type: 'image/jpeg' }));
    return api('/uploads', { method: 'POST', form: form });
  }

  /* Grabs a poster out of a source and stores it on the video. Resolves either
     way: artwork is a nicety and must never fail a video that already exists. */
  function autoPoster(videoId, src, revoke) {
    return grabFrame(src)
      .then(function (shot) {
        return uploadFrame(shot).then(function (result) {
          var patch = { thumbnail_url: result.url };
          if (shot.duration) patch.duration = shot.duration;
          return api('/videos/' + videoId, { method: 'PATCH', body: patch }).then(function () {
            return result.url;
          });
        });
      })
      .catch(function () {
        return '';
      })
      .then(function (url) {
        if (revoke) window.URL.revokeObjectURL(src);
        return url;
      });
  }

  /* The poster the customer picked in the composer, stored on the video the same
     way a grabbed frame is. Failure only costs the artwork, never the video. */
  function uploadThumb(videoId, file) {
    var form = new FormData();
    form.append('file', file);
    return api('/uploads', { method: 'POST', form: form })
      .then(function (result) {
        return api('/videos/' + videoId, {
          method: 'PATCH',
          body: { thumbnail_url: result.url },
        }).then(function () {
          if (state.video && state.video.id === videoId) {
            state.video.thumbnail_url = result.url;
            $('ed-thumb').value = result.url;
            renderThumbPreviews();
          }
          return result.url;
        });
      })
      .catch(function () {
        toast('Thumbnail upload failed — the video was created', true);
        return '';
      });
  }

  /* Videos already in the library that never got artwork heal themselves the
     next time the library is drawn, but only for files we host: a third-party
     url would either taint the canvas or cost the customer a download. */
  var POSTER_BACKFILL_PER_RENDER = 3;
  var posterTried = {};

  function backfillPosters() {
    var pending = state.videos.filter(function (video) {
      return (
        !video.thumbnail_url &&
        !posterTried[video.id] &&
        video.source_type === 'mp4' &&
        String(video.source_ref || '').indexOf('/media/') === 0
      );
    });
    if (!pending.length) return;
    pending.slice(0, POSTER_BACKFILL_PER_RENDER).reduce(function (chain, video) {
      posterTried[video.id] = true;
      return chain.then(function () {
        return autoPoster(video.id, video.source_ref).then(function (url) {
          if (!url) return;
          video.thumbnail_url = url;
          renderVideoTable();
        });
      });
    }, Promise.resolve());
  }

  function toast(message, isError) {
    var node = document.createElement('div');
    node.className = 'toast' + (isError ? ' toast-err' : '');
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(function () {
      node.remove();
    }, 3200);
  }

  function fail(error) {
    toast(error && error.message ? error.message : 'Something went wrong', true);
  }

  function text(tag, className, value) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = value;
    return node;
  }

  function fmtDate(seconds) {
    return new Date(Number(seconds) * 1000).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function fmtClock(seconds) {
    var whole = Math.max(0, Math.floor(Number(seconds) || 0));
    var mins = Math.floor(whole / 60);
    var secs = whole % 60;
    return mins + ':' + (secs < 10 ? '0' : '') + secs;
  }

  /* "3 days ago" reads better than a date on a library card. */
  function fmtAgo(seconds) {
    var diff = Math.max(0, Math.floor(Date.now() / 1000 - Number(seconds || 0)));
    var steps = [
      [60, 'second'],
      [3600, 'minute'],
      [86400, 'hour'],
      [2592000, 'day'],
      [31536000, 'month'],
    ];
    for (var i = 0; i < steps.length; i += 1) {
      if (diff < steps[i][0]) {
        var size = i === 0 ? 1 : steps[i - 1][0];
        var count = Math.max(1, Math.floor(diff / size));
        return count + ' ' + steps[i][1] + (count === 1 ? '' : 's') + ' ago';
      }
    }
    return fmtDate(seconds);
  }

  function openModal(id) {
    $(id).classList.remove('hidden');
  }

  function closeModal(id) {
    $(id).classList.add('hidden');
  }

  document.addEventListener('click', function (event) {
    if (event.target.hasAttribute && event.target.hasAttribute('data-close')) {
      var backdrop = event.target.closest('.modal-backdrop');
      if (backdrop) backdrop.classList.add('hidden');
      return;
    }
    /* Clicking the dimmed area outside a dialog closes it, as dialogs elsewhere do. */
    if (event.target.classList && event.target.classList.contains('modal-backdrop')) {
      event.target.classList.add('hidden');
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    var open = document.querySelectorAll('.modal-backdrop:not(.hidden)');
    if (!open.length) return;
    open[open.length - 1].classList.add('hidden');
  });

  /* ---------------------------------------------------------------- views -- */

  var loaders = {
    videos: loadVideos,
    playlists: loadPlaylists,
    projects: loadProjects,
    leads: loadLeads,
    integrations: function () {
      loadApiKeys();
      loadWebhooks();
    },
    billing: loadBilling,
    account: loadAccount,
  };

  function showView(name) {
    /* A key is shown once: leaving Integrations drops the plaintext copy. */
    if (name !== 'integrations') {
      $('key-fresh-value').value = '';
      $('key-fresh').classList.add('hidden');
    }
    document.querySelectorAll('.view').forEach(function (view) {
      view.classList.toggle('active', view.id === 'view-' + name);
    });
    document.querySelectorAll('#side-nav button').forEach(function (button) {
      button.classList.toggle('active', button.dataset.view === name);
    });
    if (loaders[name]) loaders[name]();
  }

  document.querySelectorAll('[data-view]').forEach(function (node) {
    node.addEventListener('click', function (event) {
      if (node.tagName === 'A') event.preventDefault();
      showView(node.dataset.view);
    });
  });

  /* Sidebar collapse: icons only, the way the reference dashboard does it. */
  $('side-collapse').addEventListener('click', function () {
    $('app-shell').classList.toggle('side-collapsed');
  });
  $('side-more').addEventListener('click', function () {
    showView('billing');
  });

  /* Videos view has two panes: the composer and the analytics summary. */
  document.querySelectorAll('#videos-seg button').forEach(function (button) {
    button.addEventListener('click', function () {
      document.querySelectorAll('#videos-seg button').forEach(function (other) {
        other.classList.toggle('active', other === button);
      });
      $('pane-control').classList.toggle('hidden', button.dataset.pane !== 'control');
      $('pane-analytics').classList.toggle('hidden', button.dataset.pane !== 'analytics');
    });
  });

  /* --------------------------------------------------------------- videos -- */

  function renderStats(totals) {
    var host = $('stats');
    host.textContent = '';
    var plays = Number(totals.plays || 0);
    var impressions = Number(totals.impressions || 0);
    var cards = [
      ['Videos', totals.videos || 0],
      ['Impressions', impressions],
      ['Plays', plays],
      ['Play rate', impressions ? Math.round((plays / impressions) * 100) + '%' : '—'],
      ['Completions', totals.completions || 0],
      ['Leads', totals.leads || 0],
    ];
    cards.forEach(function (pair) {
      var card = text('div', 'stat');
      card.appendChild(text('div', 'k', pair[0]));
      card.appendChild(text('div', 'v', String(pair[1])));
      host.appendChild(card);
    });
    renderStatsNote(plays, impressions);
  }

  /* Six zeroes on their own read as a broken page, so say why they are zero;
     once there is traffic, show which videos it belongs to. */
  function renderStatsNote(plays, impressions) {
    var note = $('stats-note');
    if (!note) return;
    note.textContent = '';
    if (!plays && !impressions) {
      note.appendChild(
        emptyState(
          'No plays yet',
          'Open or embed a video and its impressions, plays, completions and leads land here.',
          'chart',
        ),
      );
      return;
    }
    var top = state.videos
      .slice()
      .sort(function (a, b) {
        return Number(b.plays || 0) - Number(a.plays || 0);
      })
      .slice(0, 5);
    if (!top.length) return;
    var card = text('div', 'card');
    card.appendChild(text('h3', null, 'Most played'));
    var table = text('table', 'data');
    var head = document.createElement('tr');
    ['Video', 'Plays'].forEach(function (label) {
      head.appendChild(text('th', null, label));
    });
    table.appendChild(head);
    top.forEach(function (video) {
      var row = document.createElement('tr');
      row.appendChild(text('td', null, video.title || 'Untitled'));
      row.appendChild(text('td', 'num', thousands(video.plays || 0)));
      table.appendChild(row);
    });
    card.appendChild(table);
    note.appendChild(card);
  }

  function loadVideos() {
    Promise.all([api('/videos'), api('/analytics/summary'), api('/projects')])
      .then(function (results) {
        state.videos = results[0].videos;
        state.projects = results[2].projects;
        renderStats(results[1].totals || {});
        fillProjectSelects();
        renderVideoTable();
        backfillPosters();
      })
      .catch(function (error) {
        panelError($('videos-body'), error, loadVideos);
      });
  }

  var libLayout = 'grid';

  document.querySelectorAll('#lib-layout button').forEach(function (button) {
    button.addEventListener('click', function () {
      libLayout = button.dataset.layout;
      document.querySelectorAll('#lib-layout button').forEach(function (other) {
        other.classList.toggle('active', other === button);
      });
      renderVideoTable();
    });
  });

  function renderLibCount() {
    var chip = $('lib-count');
    if (!chip) return;
    var count = state.videos.length;
    chip.textContent = count + (count === 1 ? ' video' : ' videos');
    chip.classList.toggle('hidden', !count);
  }

  function renderVideoTable() {
    var host = $('videos-body');
    host.textContent = '';
    renderLibCount();
    if (!state.videos.length) {
      host.appendChild(
        emptyState('No videos yet', 'Paste a link or choose a file above to add your first one.'),
      );
      return;
    }
    if (libLayout === 'grid') {
      host.appendChild(videoGrid());
      return;
    }
    var table = text('table', 'data');
    var head = document.createElement('thead');
    var headRow = document.createElement('tr');
    ['', 'Title', 'Source', 'Visibility', 'Plays', 'Leads', 'Added', ''].forEach(function (label) {
      headRow.appendChild(text('th', null, label));
    });
    head.appendChild(headRow);
    table.appendChild(head);

    var body = document.createElement('tbody');
    state.videos.forEach(function (video) {
      var row = document.createElement('tr');

      var thumbCell = text('td', 'thumb-cell');
      thumbCell.appendChild(thumbNode(video));
      row.appendChild(thumbCell);

      var titleCell = document.createElement('td');
      var link = text('a', null, video.title);
      link.href = '#';
      link.style.fontWeight = '600';
      link.addEventListener('click', function (event) {
        event.preventDefault();
        openEditor(video.id);
      });
      titleCell.appendChild(link);
      titleCell.appendChild(text('div', 'tiny muted', '/v/' + video.slug));
      row.appendChild(titleCell);

      row.appendChild(text('td', null, video.source_type));
      var visCell = document.createElement('td');
      var pillClass = video.visibility === 'public' ? 'pill pill-ok' : 'pill pill-warn';
      visCell.appendChild(text('span', pillClass, video.visibility));
      row.appendChild(visCell);
      row.appendChild(text('td', 'num', String(video.plays || 0)));
      row.appendChild(text('td', 'num', String(video.leads || 0)));
      row.appendChild(text('td', 'tiny muted', fmtDate(video.created_at)));

      var actions = document.createElement('td');
      var edit = text('button', 'btn btn-ghost btn-sm', 'Edit');
      edit.type = 'button';
      edit.addEventListener('click', function () {
        openEditor(video.id);
      });
      actions.appendChild(edit);
      row.appendChild(actions);

      body.appendChild(row);
    });
    table.appendChild(body);
    host.appendChild(table);
  }

  /* Card layout for the library: poster, then the meta a customer scans for
     (when it went up, how it is doing, how long it runs, where it came from). */
  function videoGrid() {
    var grid = text('div', 'vid-grid');
    state.videos.forEach(function (video) {
      var card = text('article', 'vid-card');

      var shot = text('button', 'vid-shot');
      shot.type = 'button';
      shot.setAttribute('aria-label', 'Edit ' + video.title);
      shot.appendChild(thumbNode(video));
      if (video.duration) shot.appendChild(text('span', 'vid-dur', fmtClock(video.duration)));
      shot.addEventListener('click', function () {
        openEditor(video.id);
      });
      card.appendChild(shot);

      var body = text('div', 'vid-body');
      var title = text('button', 'vid-title', video.title);
      title.type = 'button';
      title.addEventListener('click', function () {
        openEditor(video.id);
      });
      body.appendChild(title);
      body.appendChild(text('div', 'vid-meta', fmtAgo(video.created_at) + ' · ' + (video.plays || 0) + ' plays'));

      var tags = text('div', 'vid-tags');
      tags.appendChild(text('span', 'pill', video.source_type));
      tags.appendChild(
        text('span', video.visibility === 'public' ? 'pill pill-ok' : 'pill pill-warn', video.visibility),
      );
      if (video.leads) tags.appendChild(text('span', 'pill', video.leads + ' leads'));
      body.appendChild(tags);

      var actions = text('div', 'vid-actions');
      var edit = text('button', 'btn btn-ghost btn-sm', 'Edit');
      edit.type = 'button';
      edit.addEventListener('click', function () {
        openEditor(video.id);
      });
      var open = text('a', 'btn btn-ghost btn-sm', 'Open');
      open.href = '/v/' + video.slug;
      open.target = '_blank';
      open.rel = 'noopener';
      var copy = text('button', 'btn btn-ghost btn-sm', 'Copy link');
      copy.type = 'button';
      copy.addEventListener('click', function () {
        navigator.clipboard.writeText(shareBase() + '/v/' + video.slug).then(function () {
          toast('Link copied');
        });
      });
      actions.appendChild(edit);
      actions.appendChild(open);
      actions.appendChild(copy);
      body.appendChild(actions);

      card.appendChild(body);
      grid.appendChild(card);
    });
    return grid;
  }

  function fillProjectSelects() {
    ['cv-project', 'ed-project'].forEach(function (id) {
      var select = $(id);
      if (!select) return;
      var current = select.value;
      select.textContent = '';
      select.appendChild(new Option('No project', ''));
      state.projects.forEach(function (project) {
        select.appendChild(new Option(project.name, project.id));
      });
      select.value = current;
    });
  }

  /* ------------------------------------------------------------- composer -- */

  function showComposerTab(name) {
    document.querySelectorAll('#cv-tabs button').forEach(function (button) {
      button.classList.toggle('active', button.dataset.tab === name);
    });
    document.querySelectorAll('.composer-panel').forEach(function (panel) {
      panel.classList.toggle('active', panel.dataset.panel === name);
    });
  }

  document.querySelectorAll('#cv-tabs button').forEach(function (button) {
    button.addEventListener('click', function () {
      showComposerTab(button.dataset.tab);
    });
  });

  /* "Create video" stays disabled until there is something to create from. */
  function syncComposer() {
    var file = $('cv-upload').files[0];
    var thumb = $('cv-thumb').files[0];
    var source = $('cv-source').value.trim();
    $('cv-save').disabled = !file && !source;
    // Only a chosen file gets a tick; an empty square just looks like a dead control.
    [[$('cv-file-state'), $('cv-upload'), file], [$('cv-thumb-state'), $('cv-thumb'), thumb]].forEach(
      function (row) {
        var box = row[0];
        var picked = row[2];
        box.classList.toggle('on', Boolean(picked));
        box.textContent = picked ? '✓' : '';
        box.title = picked ? picked.name : '';
        showPickedName(row[1], picked ? picked.name : '');
      },
    );
  }

  $('cv-source').addEventListener('input', syncComposer);
  $('cv-upload').addEventListener('change', syncComposer);
  /* Thumbnails are pictures, and small ones: rejecting here keeps an oversized
     file from being uploaded only to be refused. */
  $('cv-thumb').addEventListener('change', function () {
    var picker = $('cv-thumb');
    var file = picker.files[0];
    if (file && !/^image\/(png|jpeg|webp)$/.test(file.type)) {
      picker.value = '';
      toast('Choose a PNG, JPG or WebP image', true);
    } else if (file && file.size > IMAGE_LIMIT_BYTES) {
      picker.value = '';
      toast('Images have to be 5 MB or smaller', true);
    }
    syncComposer();
  });
  $('cv-focus-source').addEventListener('click', function () {
    showComposerTab('source');
    $('cv-source').focus();
  });
  $('cv-clear').addEventListener('click', function () {
    $('cv-title').value = '';
    $('cv-source').value = '';
    $('cv-upload').value = '';
    $('cv-thumb').value = '';
    $('cv-error').textContent = '';
    syncComposer();
  });
  $('cv-preview').addEventListener('click', function () {
    var source = $('cv-source').value.trim();
    if (!source) {
      showComposerTab('source');
      $('cv-error').textContent = 'Paste a link first to preview it.';
      return;
    }
    window.open(source, '_blank', 'noopener');
  });

  $('cv-save').addEventListener('click', function () {
    var button = $('cv-save');
    var error = $('cv-error');
    error.textContent = '';
    var file = $('cv-upload').files[0];
    var thumb = $('cv-thumb').files[0];
    var source = $('cv-source').value.trim();
    if (!source && !file) {
      error.textContent = 'Paste a video link or choose a file to upload.';
      return;
    }
    button.disabled = true;

    var ready = Promise.resolve(source);
    if (file) {
      var form = new FormData();
      form.append('file', file);
      ready = api('/uploads', { method: 'POST', form: form }).then(function (result) {
        return result.url;
      });
    }
    ready
      .then(function (resolvedSource) {
        return api('/videos', {
          method: 'POST',
          body: {
            title: $('cv-title').value.trim(),
            source: resolvedSource,
            project_id: $('cv-project').value || null,
          },
        });
      })
      .then(function (result) {
        $('cv-title').value = '';
        $('cv-source').value = '';
        $('cv-upload').value = '';
        $('cv-thumb').value = '';
        syncComposer();
        toast('Video created');
        // A chosen thumbnail wins over the automatic frame grab. Where there is
        // none, the chosen file is still in memory here, so the poster comes off
        // it rather than downloading what we just uploaded.
        var poster;
        if (thumb) {
          poster = uploadThumb(result.video.id, thumb);
        } else if (file) {
          poster = autoPoster(result.video.id, window.URL.createObjectURL(file), true);
        } else {
          poster = Promise.resolve('');
        }
        poster.then(function () {
          loadVideos();
        });
        openEditor(result.video.id);
      })
      .catch(function (err) {
        button.disabled = false;
        error.textContent = err.message;
      });
  });

  /* --------------------------------------------------------------- editor -- */

  var CONTROL_LABELS = {
    playPause: 'Play / pause',
    progress: 'Progress bar',
    volume: 'Volume',
    time: 'Time display',
    speed: 'Speed menu',
    quality: 'Quality menu',
    captions: 'Captions',
    chapters: 'Chapters menu',
    pip: 'Picture-in-picture',
    fullscreen: 'Fullscreen',
    keyboard: 'Keyboard shortcuts',
    share: 'Share button',
  };

  /* Each skin ships with the palette it was designed around. Choosing one loads
     those values into the fields, which the customer can then override. */
  var SKIN_PRESETS = {
    videokr: { accent: '#ff6106', background: '#0b0908', borderRadius: 14, bigPlayButton: false },
    frame: { accent: '#ff5a1f', background: '#000000', borderRadius: 12, bigPlayButton: true },
    pop: { accent: '#2f7d5b', background: '#0b1210', borderRadius: 12, bigPlayButton: true },
    studio: { accent: '#3f76ff', background: '#0d0f14', borderRadius: 8, bigPlayButton: true },
  };

  $('pc-skin').addEventListener('change', function () {
    var preset = SKIN_PRESETS[$('pc-skin').value];
    if (!preset) return;
    $('pc-accent').value = preset.accent;
    $('pc-bg').value = preset.background;
    $('pc-radius').value = preset.borderRadius;
    $('pc-bigplay').checked = preset.bigPlayButton;
    renderPreview();
  });

  /* Single entry point for showing an editor section, so a section that is
     already active when the editor opens still runs its loader. */
  function showEditorTab(name) {
    document.querySelectorAll('#ed-tabs button').forEach(function (button) {
      button.classList.toggle('active', button.dataset.tab === name);
    });
    document.querySelectorAll('#modal-editor .tab-panel').forEach(function (panel) {
      panel.classList.toggle('active', panel.dataset.panel === name);
    });
    if (name === 'stats') loadVideoStats();
    if (name === 'form') loadFormSubmissions();
  }

  document.querySelectorAll('#ed-tabs button').forEach(function (button) {
    button.addEventListener('click', function () {
      showEditorTab(button.dataset.tab);
    });
  });

  function openEditor(id) {
    api('/videos/' + id)
      .then(function (result) {
        state.video = result.video;
        state.config = result.player_config;
        fillEditor(result);
        openModal('modal-editor');
        showEditorTab('stats');
        renderPreview();
      })
      .catch(fail);
  }

  function fillEditor(result) {
    var video = result.video;
    var config = result.player_config;
    $('ed-title').textContent = video.title;
    $('ed-name').value = video.title;
    $('ed-desc').value = video.description || '';
    $('ed-source').value = video.source_ref || '';
    $('ed-project').value = video.project_id || '';
    $('ed-thumb').value = video.thumbnail_url || '';
    $('ed-thumb-b').value = video.thumbnail_url_b || '';
    $('ed-captions').value = video.captions_url || '';
    $('ed-duration').value = video.duration || 0;
    $('ed-transcript').value = video.transcript || '';
    $('ed-visibility').value = video.visibility;
    $('ed-password').value = '';
    $('ed-domains').value = video.allowed_domains || '';
    $('ed-password-state').textContent = video.has_password
      ? 'A password is currently set. Type a new one to replace it.'
      : 'No password set.';

    $('pc-skin').value = config.skin;
    $('pc-accent').value = config.accent;
    $('pc-bg').value = config.background;
    $('pc-radius').value = config.borderRadius;
    $('pc-logo').value = config.logoUrl || '';
    $('pc-logo-pos').value = config.logoPosition;
    $('pc-speeds').value = config.speeds.join(',');
    $('pc-start').value = config.startAt || 0;
    $('pc-autoplay').checked = config.autoplay;
    $('pc-muted').checked = config.muted;
    $('pc-loop').checked = config.loop;
    $('pc-resume').checked = config.resume;
    $('pc-title').checked = config.title;
    $('pc-bigplay').checked = config.bigPlayButton;
    $('pc-srccaptions').checked = config.sourceCaptions;
    $('pc-sticky').checked = config.sticky;
    $('pc-related').checked = config.related;

    var controlsHost = $('pc-controls');
    controlsHost.textContent = '';
    Object.keys(CONTROL_LABELS).forEach(function (key) {
      var label = text('label', 'checkbox');
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = Boolean(config.controls[key]);
      input.dataset.control = key;
      label.appendChild(input);
      label.appendChild(document.createTextNode(' ' + CONTROL_LABELS[key]));
      controlsHost.appendChild(label);
    });

    renderChapterRows(result.chapters || []);
    renderCtaRows(result.ctas || []);
    renderThumbPreviews();
    $('ed-thumb-grab-state').textContent =
      video.source_type === 'mp4'
        ? 'Takes the poster straight from the video'
        : 'Frames can only be grabbed from uploads and MP4 links';
    $('ed-form-export').href = '/api/leads.csv?video=' + video.id;
    setLoading($('ed-form-leads'), 'Loading submissions');
    renderSnippets(video);
  }

  function renderThumbPreviews() {
    var host = $('ed-thumb-previews');
    host.textContent = '';
    [
      ['A', $('ed-thumb').value.trim()],
      ['B', $('ed-thumb-b').value.trim()],
    ].forEach(function (pair) {
      if (!pair[1]) return;
      var card = text('div', 'thumb-preview');
      var img = document.createElement('img');
      img.src = pair[1];
      img.alt = 'Thumbnail ' + pair[0];
      card.appendChild(img);
      card.appendChild(text('span', 'tiny muted', 'Thumbnail ' + pair[0]));
      host.appendChild(card);
    });
  }

  ['ed-thumb', 'ed-thumb-b'].forEach(function (id) {
    $(id).addEventListener('change', renderThumbPreviews);
  });

  /** An export link with nothing to export reads as broken, so it goes flat. */
  function setExportState(id, count) {
    $(id).classList.toggle('is-disabled', !count);
    $(id).title = count ? '' : 'Nothing to export yet';
  }

  function loadFormSubmissions() {
    if (!state.video) return;
    var host = $('ed-form-leads');
    setLoading(host, 'Loading submissions');
    api('/leads?video=' + state.video.id)
      .then(function (data) {
        var leads = data.leads || [];
        host.textContent = '';
        setExportState('ed-form-export', leads.length);
        if (!leads.length) {
          host.appendChild(text('div', 'empty', 'No submissions yet.'));
          return;
        }
        var table = text('table', 'data');
        var head = document.createElement('tr');
        ['Email', 'Name', 'Phone', 'At', 'Received'].forEach(function (label) {
          head.appendChild(text('th', null, label));
        });
        table.appendChild(head);
        leads.forEach(function (lead) {
          var row = document.createElement('tr');
          row.appendChild(text('td', null, lead.email || '—'));
          row.appendChild(text('td', null, lead.name || '—'));
          row.appendChild(text('td', null, lead.phone || '—'));
          row.appendChild(text('td', 'tiny muted', fmtClock(Number(lead.position) || 0)));
          row.appendChild(text('td', 'tiny muted', fmtDate(lead.created_at)));
          table.appendChild(row);
        });
        host.appendChild(table);
      })
      .catch(function (err) {
        panelError(host, err, loadFormSubmissions);
      });
  }

  function renderSnippets(video) {
    var base = shareBase();
    $('snip-script').textContent =
      '<script src="' + base + '/embed.js" data-video="' + video.id + '" async></' + 'script>';
    $('snip-iframe').textContent =
      '<iframe src="' +
      base +
      '/e/' +
      video.id +
      '" style="width:100%;aspect-ratio:16/9;border:0" ' +
      'allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>';
    $('snip-page').textContent = base + '/v/' + video.slug;
    $('open-page').href = '/v/' + video.slug;
  }

  [
    ['copy-script', 'snip-script', 'Embed code copied'],
    ['copy-iframe', 'snip-iframe', 'Iframe code copied'],
    ['copy-page', 'snip-page', 'Public link copied'],
  ].forEach(function (pair) {
    $(pair[0]).addEventListener('click', function () {
      var value = $(pair[1]).textContent;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(value).then(function () {
          toast(pair[2]);
        });
      } else {
        toast('Copy manually: ' + value);
      }
    });
  });

  function chapterRow(chapter) {
    var row = text('div', 'repeater-row');
    var start = document.createElement('input');
    start.type = 'number';
    start.min = '0';
    start.placeholder = 'Seconds';
    start.value = chapter ? chapter.start_seconds : 0;
    start.dataset.field = 'start';
    var title = document.createElement('input');
    title.placeholder = 'Chapter title';
    title.value = chapter ? chapter.title : '';
    title.dataset.field = 'title';
    var remove = text('button', 'btn btn-ghost btn-sm', 'Remove');
    remove.type = 'button';
    remove.addEventListener('click', function () {
      row.remove();
    });
    row.appendChild(start);
    row.appendChild(title);
    row.appendChild(remove);
    return row;
  }

  function renderChapterRows(chapters) {
    var host = $('chapters-rows');
    host.textContent = '';
    chapters.forEach(function (chapter) {
      host.appendChild(chapterRow(chapter));
    });
  }

  $('add-chapter').addEventListener('click', function () {
    $('chapters-rows').appendChild(chapterRow(null));
  });

  /* One row shape serves both sections: an email gate is a CTA whose kind is "gate",
     so the Form section only ever renders and adds gate rows. */
  function ctaRow(cta, gate) {
    var card = text('div', 'card');
    card.style.marginBottom = '12px';
    var grid = text('div', 'grid-2');

    function field(label, node) {
      var wrap = text('div', 'field');
      wrap.appendChild(text('label', null, label));
      wrap.appendChild(node);
      return wrap;
    }

    var kind = document.createElement('select');
    (gate
      ? [['gate', 'Email gate (pauses playback)']]
      : [
          ['overlay', 'Overlay card'],
          ['banner', 'Bottom banner'],
          ['endscreen', 'End screen'],
        ]
    ).forEach(function (pair) {
      kind.appendChild(new Option(pair[1], pair[0]));
    });
    kind.value = cta ? cta.kind : gate ? 'gate' : 'overlay';
    kind.dataset.field = 'kind';

    function input(fieldName, placeholder, value, type) {
      var node = document.createElement('input');
      node.dataset.field = fieldName;
      node.placeholder = placeholder || '';
      if (type) node.type = type;
      node.value = value == null ? '' : value;
      return node;
    }

    var position = document.createElement('select');
    ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'center'].forEach(function (value) {
      position.appendChild(new Option(value, value));
    });
    position.value = cta ? cta.position : 'bottom-right';
    position.dataset.field = 'position';

    grid.appendChild(field('Type', kind));
    grid.appendChild(field('Position', position));
    grid.appendChild(field('Start (s)', input('start_seconds', '0', cta ? cta.start_seconds : 0, 'number')));
    grid.appendChild(field('End (s)', input('end_seconds', '0 = until the end', cta ? cta.end_seconds : 0, 'number')));
    grid.appendChild(
      field(gate ? 'Title' : 'Headline', input('headline', gate ? 'Watch the rest' : 'Book a demo', cta ? cta.headline : '')),
    );
    grid.appendChild(field('Description', input('body', 'Short supporting line', cta ? cta.body : '')));
    grid.appendChild(
      field('Button text', input('button_text', gate ? 'Continue watching' : 'Get started', cta ? cta.button_text : '')),
    );
    if (gate) {
      grid.appendChild(field('Fields to collect', input('fields', 'email,name,phone', cta ? cta.fields : 'email')));
    } else {
      grid.appendChild(field('Button url', input('button_url', 'https://example.com', cta ? cta.button_url : '')));
    }
    card.appendChild(grid);

    var skippable = text('label', 'checkbox');
    var skipInput = document.createElement('input');
    skipInput.type = 'checkbox';
    skipInput.dataset.field = 'skippable';
    skipInput.checked = cta ? cta.skippable !== 0 : true;
    skippable.appendChild(skipInput);
    skippable.appendChild(document.createTextNode(gate ? ' Viewer can skip the form' : ' Viewer can skip / dismiss'));
    card.appendChild(skippable);

    var remove = text('button', 'btn btn-ghost btn-sm', gate ? 'Remove form' : 'Remove CTA');
    remove.type = 'button';
    remove.addEventListener('click', function () {
      card.remove();
      renderPreview();
    });
    card.appendChild(remove);
    return card;
  }

  function renderCtaRows(ctas) {
    var overlays = $('ctas-rows');
    var forms = $('forms-rows');
    overlays.textContent = '';
    forms.textContent = '';
    ctas.forEach(function (cta) {
      var gate = cta.kind === 'gate';
      (gate ? forms : overlays).appendChild(ctaRow(cta, gate));
    });
  }

  $('add-cta').addEventListener('click', function () {
    $('ctas-rows').appendChild(ctaRow(null, false));
  });

  $('add-form').addEventListener('click', function () {
    $('forms-rows').appendChild(ctaRow(null, true));
  });

  function collectConfig() {
    var speeds = $('pc-speeds')
      .value.split(',')
      .map(function (value) {
        return parseFloat(value.trim());
      })
      .filter(function (value) {
        return value > 0;
      });
    var controls = {};
    document.querySelectorAll('#pc-controls input[data-control]').forEach(function (input) {
      controls[input.dataset.control] = input.checked;
    });
    return {
      skin: $('pc-skin').value,
      accent: $('pc-accent').value,
      background: $('pc-bg').value,
      controls: controls,
      autoplay: $('pc-autoplay').checked,
      muted: $('pc-muted').checked,
      loop: $('pc-loop').checked,
      startAt: Number($('pc-start').value) || 0,
      resume: $('pc-resume').checked,
      speeds: speeds.length ? speeds : [1],
      logoUrl: $('pc-logo').value.trim(),
      logoLink: '',
      logoPosition: $('pc-logo-pos').value,
      title: $('pc-title').checked,
      bigPlayButton: $('pc-bigplay').checked,
      sourceCaptions: $('pc-srccaptions').checked,
      sticky: $('pc-sticky').checked,
      related: $('pc-related').checked,
      borderRadius: Number($('pc-radius').value) || 0,
    };
  }

  function collectChapters() {
    var rows = [];
    $('chapters-rows')
      .querySelectorAll('.repeater-row')
      .forEach(function (row) {
        var title = row.querySelector('[data-field="title"]').value.trim();
        if (!title) return;
        rows.push({
          start_seconds: Number(row.querySelector('[data-field="start"]').value) || 0,
          title: title,
        });
      });
    return rows;
  }

  function collectCtas() {
    var rows = [];
    ['ctas-rows', 'forms-rows'].forEach(function (id) {
      $(id)
        .querySelectorAll('.card')
        .forEach(function (card) {
          var cta = {};
          card.querySelectorAll('[data-field]').forEach(function (node) {
            var key = node.dataset.field;
            if (node.type === 'checkbox') cta[key] = node.checked;
            else if (node.type === 'number') cta[key] = Number(node.value) || 0;
            else cta[key] = node.value.trim();
          });
          rows.push(cta);
        });
    });
    return rows;
  }

  /* Posters and logos are pictures, not video: only image types are accepted and the
     5 MB ceiling is checked here as well so an oversized file never leaves the browser. */
  var IMAGE_LIMIT_BYTES = 5 * 1024 * 1024;

  /* The name slot doubles as the hint line, so it has to be able to go back to
     the hint once a picker is cleared. */
  function pickName(picker) {
    var row = picker.closest('.filepick') || picker.parentNode;
    return row ? row.querySelector('.filepick-name') : null;
  }

  function showPickedName(picker, name) {
    var slot = pickName(picker);
    if (!slot) return;
    if (slot.dataset.hint === undefined) slot.dataset.hint = slot.textContent;
    slot.textContent = name || slot.dataset.hint;
    slot.title = name || '';
    slot.classList.toggle('chosen', Boolean(name));
  }

  function bindImagePicker(pickerId, targetId) {
    $(pickerId).addEventListener('change', function () {
      var picker = $(pickerId);
      var file = picker.files[0];
      showPickedName(picker, file ? file.name : '');
      if (!file) return;
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
        picker.value = '';
        showPickedName(picker, '');
        toast('Choose a PNG, JPG or WebP image', true);
        return;
      }
      if (file.size > IMAGE_LIMIT_BYTES) {
        picker.value = '';
        showPickedName(picker, '');
        toast('Images have to be 5 MB or smaller', true);
        return;
      }
      var form = new FormData();
      form.append('file', file);
      picker.disabled = true;
      showPickedName(picker, 'Uploading ' + file.name + '…');
      api('/uploads', { method: 'POST', form: form })
        .then(function (result) {
          $(targetId).value = result.url;
          if (targetId.indexOf('ed-thumb') === 0) renderThumbPreviews();
          showPickedName(picker, file.name + ' — save to apply');
          toast('Image uploaded — save to apply');
        })
        .catch(function (err) {
          showPickedName(picker, '');
          toast(err.message || 'Upload failed', true);
        })
        .then(function () {
          picker.disabled = false;
          picker.value = '';
        });
    });
  }

  bindImagePicker('ed-thumb-file', 'ed-thumb');
  bindImagePicker('ed-thumb-b-file', 'ed-thumb-b');
  bindImagePicker('pc-logo-file', 'pc-logo');

  /* Manual version of the automatic poster, for videos that were added before
     we grabbed frames — or when the customer wants a different frame. */
  $('ed-thumb-grab').addEventListener('click', function () {
    var video = state.video;
    var status = $('ed-thumb-grab-state');
    var button = $('ed-thumb-grab');
    if (!video) return;
    if (video.source_type !== 'mp4') {
      status.textContent = 'Only uploads and MP4 links can hand over a frame.';
      return;
    }
    button.disabled = true;
    status.textContent = 'Reading the video…';
    grabFrame(video.source_ref)
      .then(function (shot) {
        return uploadFrame(shot).then(function (result) {
          $('ed-thumb').value = result.url;
          renderThumbPreviews();
          status.textContent = 'Frame grabbed — save to apply.';
        });
      })
      .catch(function (err) {
        status.textContent = err.message || 'That frame could not be grabbed.';
      })
      .then(function () {
        button.disabled = false;
      });
  });

  $('ed-captions-file').addEventListener('change', function () {
    var picker = $('ed-captions-file');
    showPickedName(picker, picker.files[0] ? picker.files[0].name : '');
  });

  /* Captions live in R2 like any other asset, so the editor uploads the file and fills
     in the url it gets back instead of asking for a url the customer has to host. */
  $('ed-captions-upload').addEventListener('click', function () {
    var file = $('ed-captions-file').files[0];
    var status = $('ed-captions-state');
    if (!file) {
      status.textContent = 'Choose a .vtt file first.';
      return;
    }
    var button = $('ed-captions-upload');
    button.disabled = true;
    status.textContent = 'Uploading…';
    var form = new FormData();
    form.append('file', file);
    api('/uploads', { method: 'POST', form: form })
      .then(function (result) {
        $('ed-captions').value = result.url;
        status.textContent = 'Uploaded — save to apply.';
      })
      .catch(function (err) {
        status.textContent = err.message || 'Upload failed.';
      })
      .then(function () {
        button.disabled = false;
      });
  });

  $('ed-save').addEventListener('click', function () {
    if (!state.video) return;
    var id = state.video.id;
    var button = $('ed-save');
    button.disabled = true;

    var patch = {
      title: $('ed-name').value.trim(),
      description: $('ed-desc').value,
      thumbnail_url: $('ed-thumb').value.trim(),
      thumbnail_url_b: $('ed-thumb-b').value.trim(),
      captions_url: $('ed-captions').value.trim(),
      transcript: $('ed-transcript').value,
      duration: Number($('ed-duration').value) || 0,
      allowed_domains: $('ed-domains').value.trim(),
      project_id: $('ed-project').value || null,
      visibility: $('ed-visibility').value,
      player_config: collectConfig(),
    };
    var source = $('ed-source').value.trim();
    if (source && source !== state.video.source_ref) patch.source = source;
    var password = $('ed-password').value;
    if (password) patch.password = password;

    api('/videos/' + id, { method: 'PATCH', body: patch })
      .then(function () {
        return api('/videos/' + id + '/chapters', { method: 'PUT', body: { chapters: collectChapters() } });
      })
      .then(function () {
        return api('/videos/' + id + '/ctas', { method: 'PUT', body: { ctas: collectCtas() } });
      })
      .then(function () {
        button.disabled = false;
        toast('Saved');
        loadVideos();
        return openEditorRefresh(id);
      })
      .catch(function (err) {
        button.disabled = false;
        fail(err);
      });
  });

  function openEditorRefresh(id) {
    return api('/videos/' + id).then(function (result) {
      state.video = result.video;
      state.config = result.player_config;
      fillEditor(result);
      renderPreview();
    });
  }

  $('ed-delete').addEventListener('click', function () {
    if (!state.video) return;
    if (!confirm('Delete “' + state.video.title + '”? This also removes its analytics.')) return;
    api('/videos/' + state.video.id, { method: 'DELETE' })
      .then(function () {
        closeModal('modal-editor');
        toast('Video deleted');
        loadVideos();
      })
      .catch(fail);
  });

  function renderPreview() {
    if (!state.video) return;
    var host = $('preview');
    host.textContent = '';
    var mount = document.createElement('div');
    host.appendChild(mount);
    window.Videokr.mount(mount, {
      tracking: false,
      video: {
        id: state.video.id,
        slug: state.video.slug,
        title: $('ed-name').value,
        description: '',
        source_type: state.video.source_type,
        source_ref: $('ed-source').value.trim() || state.video.source_ref,
        duration: Number($('ed-duration').value) || 0,
        thumbnail_url: $('ed-thumb').value.trim(),
        captions_url: $('ed-captions').value.trim(),
      },
      player: collectConfig(),
      chapters: collectChapters(),
      ctas: collectCtas(),
      variant: 'a',
    });
  }

  $('refresh-preview').addEventListener('click', renderPreview);

  /* ------------------------------------------------------- video analytics -- */

  function loadVideoStats() {
    if (!state.video) return;
    var host = $('stats-body');
    setLoading(host, 'Loading analytics');
    api('/analytics/videos/' + state.video.id)
      .then(function (data) {
        host.textContent = '';
        var counts = data.counts || {};
        var impressions = counts.load || 0;
        var plays = counts.play || 0;

        var head = text('div', 'an-head');
        var hero = text('div', 'an-hero');
        hero.appendChild(text('span', 'an-hero-k', 'Plays'));
        hero.appendChild(text('span', 'an-hero-v', String(plays)));
        hero.appendChild(
          text(
            'p',
            'hand an-note',
            impressions
              ? plays + ' of ' + impressions + ' people who saw it pressed play'
              : 'nobody has loaded this video yet',
          ),
        );
        head.appendChild(hero);

        var facts = text('dl', 'an-facts');
        [
          ['Impressions', String(impressions)],
          ['Play rate', impressions ? Math.round((plays / impressions) * 100) + '%' : '—'],
          ['Watched to the end', String(counts.complete || 0)],
          ['CTA clicks', String(counts.cta_click || 0)],
          ['Leads captured', String(counts.lead || 0)],
        ].forEach(function (pair) {
          facts.appendChild(text('dt', null, pair[0]));
          facts.appendChild(text('dd', null, pair[1]));
        });
        head.appendChild(facts);
        host.appendChild(head);

        var retention = data.retention || [];
        var block = text('section', 'an-block');
        var blockHead = text('div', 'an-block-head');
        blockHead.appendChild(text('h3', null, 'Audience retention'));
        blockHead.appendChild(text('span', 'tiny muted', 'share of viewers still watching'));
        block.appendChild(blockHead);
        if (!retention.length) {
          block.appendChild(text('p', 'muted tiny', 'No playback data yet — retention appears after the first play.'));
        } else {
          block.appendChild(retentionChart(retention));
          var quit = biggestDrop(retention);
          if (quit != null) {
            block.appendChild(text('p', 'hand an-note', 'sharpest drop-off around ' + quit + '% of the video'));
          }
        }
        host.appendChild(block);

        appendBars(host, 'Devices', data.devices, 'device');
        appendBars(host, 'Top referrers', data.referrers, 'referrer');

        if ((data.variants || []).length > 1) {
          host.appendChild(text('h3', null, 'Thumbnail A/B test'));
          var table = text('table', 'data');
          var headRow = document.createElement('tr');
          ['Variant', 'Impressions', 'Plays', 'Play rate'].forEach(function (label) {
            headRow.appendChild(text('th', null, label));
          });
          table.appendChild(headRow);
          data.variants.forEach(function (row) {
            var tr = document.createElement('tr');
            tr.appendChild(text('td', null, row.variant.toUpperCase()));
            tr.appendChild(text('td', null, String(row.impressions)));
            tr.appendChild(text('td', null, String(row.plays)));
            tr.appendChild(
              text('td', null, row.impressions ? Math.round((row.plays / row.impressions) * 100) + '%' : '—'),
            );
            table.appendChild(tr);
          });
          host.appendChild(table);
        }
      })
      .catch(function (err) {
        panelError(host, err, loadVideoStats);
      });
  }

  function appendBars(host, title, rows, key) {
    if (!rows || !rows.length) return;
    var block = text('section', 'an-block');
    var head = text('div', 'an-block-head');
    head.appendChild(text('h3', null, title));
    block.appendChild(head);
    var total = rows.reduce(function (acc, row) {
      return acc + row.n;
    }, 0);
    var max = rows.reduce(function (acc, row) {
      return Math.max(acc, row.n);
    }, 1);
    var wrap = text('div', 'bars');
    rows.forEach(function (row) {
      var line = text('div', 'bar-row');
      var label = text('span', 'bar-label', row[key] || 'unknown');
      label.title = row[key] || 'unknown';
      line.appendChild(label);
      var track = text('div', 'bar-track');
      var fill = text('div', 'bar-fill');
      fill.style.width = Math.round((row.n / max) * 100) + '%';
      track.appendChild(fill);
      line.appendChild(track);
      line.appendChild(
        text('span', 'bar-value', total ? row.n + ' · ' + Math.round((row.n / total) * 100) + '%' : String(row.n)),
      );
      wrap.appendChild(line);
    });
    block.appendChild(wrap);
    host.appendChild(block);
  }

  /* Retention as one drawn curve rather than a row of loose sticks: a filled area
     over a dashed baseline, with the quarter marks written under it. */
  function retentionChart(rows) {
    var W = 100;
    var H = 34;
    var byBucket = {};
    var max = 1;
    rows.forEach(function (row) {
      byBucket[row.bucket] = row.views;
      max = Math.max(max, row.views);
    });
    var points = [];
    for (var b = 0; b <= 100; b += 2) {
      var views = byBucket[b] || 0;
      points.push([(b / 100) * W, H - (views / max) * H]);
    }
    var line = points
      .map(function (point, i) {
        return (i ? 'L' : 'M') + point[0].toFixed(2) + ' ' + point[1].toFixed(2);
      })
      .join(' ');

    var wrap = text('div', 'an-chart');
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    var area = document.createElementNS(SVG_NS, 'path');
    area.setAttribute('class', 'an-area');
    area.setAttribute('d', line + ' L' + W + ' ' + H + ' L0 ' + H + ' Z');
    svg.appendChild(area);
    var stroke = document.createElementNS(SVG_NS, 'path');
    stroke.setAttribute('class', 'an-line');
    stroke.setAttribute('d', line);
    svg.appendChild(stroke);
    wrap.appendChild(svg);

    var axis = text('div', 'an-axis');
    ['0%', '25%', '50%', '75%', '100%'].forEach(function (mark) {
      axis.appendChild(text('span', null, mark));
    });
    var box = text('div', 'an-chart-box');
    box.appendChild(wrap);
    box.appendChild(axis);
    return box;
  }

  /** The bucket where the audience falls away fastest, in percent of the video. */
  function biggestDrop(rows) {
    var byBucket = {};
    rows.forEach(function (row) {
      byBucket[row.bucket] = row.views;
    });
    var worst = null;
    var drop = 0;
    for (var b = 0; b < 100; b += 2) {
      var here = byBucket[b] || 0;
      var next = byBucket[b + 2] || 0;
      if (here - next > drop) {
        drop = here - next;
        worst = b + 2;
      }
    }
    return drop > 0 ? worst : null;
  }

  /* ------------------------------------------------------------ playlists -- */

  function loadPlaylists() {
    Promise.all([api('/playlists'), api('/videos')])
      .then(function (results) {
        state.playlists = results[0].playlists;
        state.videos = results[1].videos;
        renderPlaylists();
      })
      .catch(function (error) {
        panelError($('playlists-body'), error, loadPlaylists);
      });
  }

  function renderPlaylists() {
    var host = $('playlists-body');
    host.textContent = '';
    if (!state.playlists.length) {
      host.appendChild(
        emptyState('No playlists yet', 'Group videos into one public page viewers can binge.', 'list'),
      );
      return;
    }
    state.playlists.forEach(function (playlist) {
      var card = text('div', 'card');
      card.style.marginBottom = '14px';
      var head = text('div', 'row spread');
      var left = document.createElement('div');
      left.appendChild(text('h3', null, playlist.title));
      var link = text('a', 'tiny muted', shareBase() + '/pl/' + playlist.slug);
      link.href = '/pl/' + playlist.slug;
      link.target = '_blank';
      link.rel = 'noopener';
      left.appendChild(link);
      head.appendChild(left);
      var remove = text('button', 'btn btn-danger btn-sm', 'Delete');
      remove.type = 'button';
      remove.addEventListener('click', function () {
        api('/playlists/' + playlist.id, { method: 'DELETE' }).then(loadPlaylists).catch(fail);
      });
      head.appendChild(remove);
      card.appendChild(head);

      card.appendChild(text('p', 'tiny muted', 'Tick the videos to include, in order of selection.'));
      var picker = text('div', 'grid-2');
      var members = playlist.video_ids || [];
      state.videos.forEach(function (video) {
        var label = text('label', 'checkbox');
        var input = document.createElement('input');
        input.type = 'checkbox';
        input.value = video.id;
        // Ticked from the saved playlist, so a re-render never loses the selection.
        input.checked = members.indexOf(video.id) !== -1;
        label.appendChild(input);
        label.appendChild(document.createTextNode(' ' + video.title));
        picker.appendChild(label);
      });
      card.appendChild(picker);

      var save = text('button', 'btn btn-sm', 'Save items');
      save.type = 'button';
      save.style.marginTop = '10px';
      save.addEventListener('click', function () {
        var ids = [];
        picker.querySelectorAll('input:checked').forEach(function (input) {
          ids.push(input.value);
        });
        api('/playlists/' + playlist.id + '/items', { method: 'PUT', body: { video_ids: ids } })
          .then(function (result) {
            toast(result.count + ' video(s) in playlist');
            loadPlaylists();
          })
          .catch(fail);
      });
      card.appendChild(save);

      /* Page-level privacy: the playlist page can be public, unlisted or gated,
         independently of the videos on it. */
      var privacy = text('div', 'grid-2');
      privacy.style.marginTop = '12px';
      var visLabel = text('label', null, 'Page privacy');
      var vis = document.createElement('select');
      [
        ['public', 'Public — indexable'],
        ['unlisted', 'Unlisted — link only'],
        ['password', 'Password protected'],
      ].forEach(function (option) {
        var node = document.createElement('option');
        node.value = option[0];
        node.textContent = option[1];
        vis.appendChild(node);
      });
      vis.value = playlist.visibility || 'public';
      visLabel.appendChild(vis);
      privacy.appendChild(visLabel);

      var passLabel = text('label', null, 'Page password');
      var pass = document.createElement('input');
      pass.type = 'password';
      pass.placeholder = playlist.has_password ? 'Set — type to replace' : 'Set a password';
      passLabel.appendChild(pass);
      privacy.appendChild(passLabel);
      card.appendChild(privacy);

      var savePrivacy = text('button', 'btn btn-sm btn-ghost', 'Save privacy');
      savePrivacy.type = 'button';
      savePrivacy.style.marginTop = '8px';
      savePrivacy.addEventListener('click', function () {
        api('/playlists/' + playlist.id, {
          method: 'PATCH',
          body: { visibility: vis.value, password: pass.value },
        })
          .then(function () {
            toast('Playlist privacy saved');
            loadPlaylists();
          })
          .catch(fail);
      });
      card.appendChild(savePrivacy);

      var snippet = text('pre', 'snippet');
      snippet.style.marginTop = '12px';
      snippet.textContent =
        '<script src="' + shareBase() + '/embed.js" data-playlist="' + playlist.slug + '" async></' + 'script>';
      card.appendChild(text('p', 'tiny muted', 'Embed this playlist on any site:'));
      card.appendChild(snippet);

      host.appendChild(card);
    });
  }

  $('new-playlist').addEventListener('click', function () {
    var title = prompt('Playlist title');
    if (!title) return;
    api('/playlists', { method: 'POST', body: { title: title } })
      .then(function () {
        toast('Playlist created');
        loadPlaylists();
      })
      .catch(fail);
  });

  /* ------------------------------------------------------------- projects -- */

  function loadProjects() {
    api('/projects')
      .then(function (result) {
        state.projects = result.projects;
        fillProjectSelects();
        var host = $('projects-body');
        host.textContent = '';
        if (!state.projects.length) {
          host.appendChild(
            emptyState('No projects yet', 'Projects keep videos sorted by client, campaign or product.', 'folder'),
          );
          return;
        }
        var table = text('table', 'data');
        var headRow = document.createElement('tr');
        ['Project', 'Videos', 'Created', ''].forEach(function (label) {
          headRow.appendChild(text('th', null, label));
        });
        table.appendChild(headRow);
        state.projects.forEach(function (project) {
          var row = document.createElement('tr');
          row.appendChild(text('td', null, project.name));
          row.appendChild(text('td', null, String(project.video_count || 0)));
          row.appendChild(text('td', 'tiny muted', fmtDate(project.created_at)));
          var actions = document.createElement('td');
          var remove = text('button', 'btn btn-danger btn-sm', 'Delete');
          remove.type = 'button';
          remove.addEventListener('click', function () {
            api('/projects/' + project.id, { method: 'DELETE' }).then(loadProjects).catch(fail);
          });
          actions.appendChild(remove);
          row.appendChild(actions);
          table.appendChild(row);
        });
        host.appendChild(table);
      })
      .catch(function (error) {
        panelError($('projects-body'), error, loadProjects);
      });
  }

  $('new-project').addEventListener('click', function () {
    var name = prompt('Project name');
    if (!name) return;
    api('/projects', { method: 'POST', body: { name: name } })
      .then(function () {
        toast('Project created');
        loadProjects();
      })
      .catch(fail);
  });

  /* ---------------------------------------------------------------- leads -- */

  function loadLeads() {
    api('/leads')
      .then(function (result) {
        var host = $('leads-body');
        host.textContent = '';
        setExportState('export-leads', result.leads.length);
        if (!result.leads.length) {
          host.appendChild(
            emptyState(
              'No leads captured yet',
              'Add a form or an email gate to a video and submissions land here.',
              'mail',
            ),
          );
          return;
        }
        var table = text('table', 'data');
        var headRow = document.createElement('tr');
        ['Email', 'Name', 'Phone', 'Video', 'At second', 'Source', 'Captured'].forEach(function (label) {
          headRow.appendChild(text('th', null, label));
        });
        table.appendChild(headRow);
        result.leads.forEach(function (lead) {
          var row = document.createElement('tr');
          row.appendChild(text('td', null, lead.email));
          row.appendChild(text('td', null, lead.name || '—'));
          row.appendChild(text('td', null, lead.phone || '—'));
          row.appendChild(text('td', null, lead.video_title));
          row.appendChild(text('td', null, String(Math.round(lead.position))));
          row.appendChild(text('td', null, lead.referrer || 'direct'));
          row.appendChild(text('td', 'tiny muted', fmtDate(lead.created_at)));
          table.appendChild(row);
        });
        host.appendChild(table);
      })
      .catch(function (error) {
        panelError($('leads-body'), error, loadLeads);
      });
  }

  /* ------------------------------------------------------------ api keys -- */

  function loadApiKeys() {
    api('/keys')
      .then(function (result) {
        var host = $('keys-body');
        host.textContent = '';
        if (!result.keys.length) {
          host.appendChild(
            emptyState('No API keys yet', 'Create one to connect the Videokr plugin for WordPress.', 'hook'),
          );
          return;
        }
        var table = text('table', 'data');
        var headRow = document.createElement('tr');
        ['Label', 'Key', 'Created', 'Last used', ''].forEach(function (label) {
          headRow.appendChild(text('th', null, label));
        });
        table.appendChild(headRow);
        result.keys.forEach(function (key) {
          var row = document.createElement('tr');
          row.appendChild(text('td', null, key.name || 'Untitled key'));
          row.appendChild(text('td', 'tiny', key.prefix + '••••••••'));
          row.appendChild(text('td', 'tiny muted', fmtDate(key.created_at)));
          row.appendChild(text('td', 'tiny muted', key.last_used_at ? fmtDate(key.last_used_at) : 'never'));
          var actions = document.createElement('td');
          var revoke = text('button', 'btn btn-danger btn-sm', 'Revoke');
          revoke.type = 'button';
          revoke.addEventListener('click', function () {
            if (!confirm('Revoke this key? Any site using it stops working immediately.')) return;
            api('/keys/' + key.id, { method: 'DELETE' })
              .then(function () {
                toast('Key revoked');
                loadApiKeys();
              })
              .catch(fail);
          });
          actions.appendChild(revoke);
          row.appendChild(actions);
          table.appendChild(row);
        });
        host.appendChild(table);
      })
      .catch(function (error) {
        panelError($('keys-body'), error, loadApiKeys);
      });
  }

  $('key-create').addEventListener('click', function () {
    api('/keys', { method: 'POST', body: { name: $('key-name').value.trim() } })
      .then(function (result) {
        $('key-name').value = '';
        $('key-fresh-value').value = result.key;
        $('key-fresh').classList.remove('hidden');
        toast('Key created — copy it now, it is not shown again');
        loadApiKeys();
      })
      .catch(fail);
  });

  $('key-copy').addEventListener('click', function () {
    var value = $('key-fresh-value').value;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(value).then(function () {
        toast('Key copied');
      });
    } else {
      $('key-fresh-value').select();
      toast('Press Ctrl+C to copy');
    }
  });

  /* ------------------------------------------------------------- webhooks -- */

  /** Human summary of a webhook's last delivery attempt. */
  function deliveryLabel(hook) {
    if (!hook.last_attempt_at) return 'no deliveries yet';
    if (hook.last_error) return hook.last_error + ' — ' + fmtDate(hook.last_attempt_at);
    return hook.last_status + ' OK — ' + fmtDate(hook.last_attempt_at);
  }

  function loadWebhooks() {
    api('/webhooks')
      .then(function (result) {
        var host = $('webhooks-body');
        host.textContent = '';
        if (!result.webhooks.length) {
          host.appendChild(
            emptyState(
              'No webhooks yet',
              'Add an endpoint above to receive play, complete, cta_click and lead events.',
              'hook',
            ),
          );
          return;
        }
        var table = text('table', 'data');
        var headRow = document.createElement('tr');
        ['Endpoint', 'Events', 'Last delivery', 'Added', ''].forEach(function (label) {
          headRow.appendChild(text('th', null, label));
        });
        table.appendChild(headRow);
        result.webhooks.forEach(function (hook) {
          var row = document.createElement('tr');
          row.appendChild(text('td', null, hook.url));
          row.appendChild(text('td', null, hook.events));
          row.appendChild(text('td', 'tiny', deliveryLabel(hook)));
          row.appendChild(text('td', 'tiny muted', fmtDate(hook.created_at)));
          var actions = document.createElement('td');
          var probe = text('button', 'btn btn-ghost btn-sm', 'Test');
          probe.type = 'button';
          probe.addEventListener('click', function () {
            probe.disabled = true;
            api('/webhooks/' + hook.id + '/test', { method: 'POST' })
              .then(function (result) {
                toast('Test delivered — endpoint returned ' + result.status);
              })
              .catch(fail)
              .then(function () {
                probe.disabled = false;
                loadWebhooks();
              });
          });
          actions.appendChild(probe);
          var remove = text('button', 'btn btn-danger btn-sm', 'Delete');
          remove.type = 'button';
          remove.addEventListener('click', function () {
            api('/webhooks/' + hook.id, { method: 'DELETE' }).then(loadWebhooks).catch(fail);
          });
          actions.appendChild(remove);
          row.appendChild(actions);
          table.appendChild(row);
        });
        host.appendChild(table);
      })
      .catch(function (error) {
        panelError($('webhooks-body'), error, loadWebhooks);
      });
  }

  $('wh-save').addEventListener('click', function () {
    api('/webhooks', {
      method: 'POST',
      body: {
        url: $('wh-url').value.trim(),
        events: $('wh-events').value.trim(),
        secret: $('wh-secret').value,
      },
    })
      .then(function () {
        $('wh-url').value = '';
        $('wh-secret').value = '';
        toast('Webhook added');
        loadWebhooks();
      })
      .catch(fail);
  });

  /* -------------------------------------------------------------- billing -- */

  function money(cents, currency) {
    return (currency || 'USD') + ' ' + (Number(cents || 0) / 100).toFixed(2);
  }

  function planChip(billing) {
    var chip = $('plan-chip');
    var name = billing.lifetime ? 'Lifetime' : billing.plan_name || 'Free';
    if (chip) chip.textContent = 'Currently on Videokr ' + name.toLowerCase();
    var badge = $('plan-badge');
    if (badge) {
      badge.textContent = name;
      badge.classList.toggle('is-paid', Boolean(billing.lifetime || billing.paid));
    }
  }

  /* The top-bar pill quotes the live lifetime price and disappears once the
     account already owns lifetime, so it never advertises what it cannot sell. */
  function offerPill(billing) {
    var pill = $('top-offer');
    if (!pill) return;
    pill.classList.toggle('hidden', Boolean(billing.lifetime));
    if (billing.lifetime || !billing.offer) return;
    $('top-offer-label').textContent = 'Get lifetime — $' + billing.offer.usd;
  }

  function thousands(value) {
    return Number(value || 0).toLocaleString('en-US');
  }

  /** Plays used this month, what is left, and any overage already accrued. */
  function usageCard(billing) {
    var plays = billing.plays;
    var card = text('div', 'card usage-card');
    card.appendChild(text('h3', null, 'Plays this month'));
    var line = plays.allowance === null
      ? thousands(plays.plays) + ' plays · unlimited'
      : thousands(plays.plays) + ' of ' + thousands(plays.allowance) + ' plays';
    card.appendChild(text('p', 'usage-line', line));
    if (plays.allowance !== null) {
      var used = plays.plays / plays.allowance;
      var bar = text('div', 'meter');
      var fill = text('div', 'meter-fill' + (used >= 1 ? ' is-full' : ''));
      fill.style.width = Math.min(100, Math.round(used * 100)) + '%';
      bar.appendChild(fill);
      card.appendChild(bar);
    }
    var note;
    if (plays.blocked) {
      note = 'Your videos are paused until ' + plays.period + ' rolls over. Upgrade to keep them playing.';
    } else if (plays.over > 0) {
      note =
        thousands(plays.over) +
        ' plays over your allowance — $' +
        plays.overage_usd.toFixed(2) +
        ' overage so far, billed at $' +
        billing.overage_per_10k_usd +
        ' per 10,000 plays.';
    } else if (plays.allowance !== null) {
      note = thousands(plays.allowance - plays.plays) + ' plays left in ' + plays.period + '.';
    } else {
      note = 'No play limit on your plan.';
    }
    var foot = text('div', 'usage-foot');
    foot.appendChild(text('span', 'muted tiny', note));
    foot.appendChild(
      text(
        'span',
        'lib-count',
        billing.usage.videos +
          (billing.usage.video_limit === null ? ' videos · unlimited' : ' of ' + billing.usage.video_limit + ' videos'),
      ),
    );
    card.appendChild(foot);
    return card;
  }

  function subscribeButton(billing, planId, cycle, label) {
    var button = text('button', 'btn' + (cycle === 'annual' ? '' : ' btn-ghost'), label);
    button.type = 'button';
    if (!billing.subscription_ready) button.disabled = true;
    button.addEventListener('click', function () {
      button.disabled = true;
      api('/billing/subscribe', { method: 'POST', body: { plan: planId, cycle: cycle } })
        .then(function (result) {
          location.href = result.url;
        })
        .catch(function (error) {
          button.disabled = false;
          fail(error);
        });
    });
    return button;
  }

  /** The plan you are on, so the ladder starts from where you actually stand. */
  function freeCard(billing) {
    var plan = billing.plans.free;
    var card = text('div', 'card plan-card is-current');
    card.appendChild(text('h3', null, plan.name));
    var price = text('div', 'plan-price', '$0');
    price.appendChild(text('span', null, 'forever'));
    card.appendChild(price);
    card.appendChild(
      text(
        'p',
        'muted tiny',
        thousands(plan.plays) +
          ' plays a month, ' +
          plan.videos +
          ' videos, ' +
          Math.round(plan.storageBytes / (1024 * 1024 * 1024)) +
          ' GB fair-use storage. Playback pauses once the allowance runs out.',
      ),
    );
    card.appendChild(text('p', 'pill pill-ok', 'Your current plan'));
    return card;
  }

  /** One card per metered plan, with monthly and annual checkout. */
  function planCard(billing, planId) {
    var plan = billing.plans[planId];
    var card = text('div', 'card plan-card');
    card.appendChild(text('h3', null, plan.name));
    var price = text('div', 'plan-price', '$' + plan.usd);
    price.appendChild(text('span', null, '/mo'));
    card.appendChild(price);
    card.appendChild(
      text(
        'p',
        'muted tiny',
        thousands(plan.plays) +
          ' plays a month, unlimited videos, ' +
          Math.round(plan.storageBytes / (1024 * 1024 * 1024)) +
          ' GB fair-use storage. Extra plays are $' +
          billing.overage_per_10k_usd +
          ' per 10,000.',
      ),
    );
    if (billing.plan === planId) {
      card.classList.add('is-current');
      card.appendChild(text('p', 'pill pill-ok', 'Your current plan'));
      return card;
    }
    var row = text('div', 'row');
    row.appendChild(subscribeButton(billing, planId, 'annual', 'Get ' + plan.name + ' — $' + plan.usdAnnual + '/yr'));
    row.appendChild(subscribeButton(billing, planId, 'monthly', '$' + plan.usd + ' monthly'));
    card.appendChild(row);
    if (!billing.subscription_ready) {
      card.appendChild(text('p', 'tiny muted', 'Checkout for this plan is not connected yet.'));
    }
    return card;
  }

  function loadBilling() {
    api('/billing')
      .then(function (billing) {
        planChip(billing);
        offerPill(billing);
        var host = $('billing-body');
        host.textContent = '';

        host.appendChild(usageCard(billing));
        /* Plans sit side by side so they can be compared, instead of one
           full-width card per plan stacked down the page. */
        var grid = text('div', 'plan-grid');
        host.appendChild(grid);
        if (!billing.lifetime) {
          if (billing.plan === 'free') grid.appendChild(freeCard(billing));
          grid.appendChild(planCard(billing, 'starter'));
          grid.appendChild(planCard(billing, 'agency'));
        }

        var card = text('div', 'card plan-card plan-card-lt');
        if (billing.lifetime) {
          card.appendChild(text('h3', null, 'You own Videokr for life'));
          card.appendChild(
            text(
              'p',
              'muted tiny',
              'Unlimited videos and embeds, no badge, 10,000 plays a month included forever, and every feature we ship from here on.',
            ),
          );
        } else {
          card.appendChild(text('h3', null, 'Lifetime'));
          var once = text('div', 'plan-price', '$' + billing.offer.usd);
          once.appendChild(text('span', null, 'once'));
          card.appendChild(once);
          card.appendChild(
            text(
              'p',
              'muted tiny',
              'Pay once, keep it forever: unlimited videos, no badge, 10,000 plays a month included for life. No refunds — the free plan is the trial.',
            ),
          );
          if (billing.offer.seats_total) {
            card.appendChild(
              text(
                'p',
                'tiny',
                billing.offer.seats_left +
                  ' of ' +
                  billing.offer.seats_total +
                  ' seats left at this price' +
                  (billing.offer.next_usd ? ', then $' + billing.offer.next_usd : ''),
              ),
            );
          }
          var buy = text('button', 'btn btn-lg', 'Buy lifetime — $' + billing.offer.usd);
          buy.type = 'button';
          if (!billing.checkout_ready) {
            buy.disabled = true;
            card.appendChild(
              text('p', 'tiny muted', 'Checkout is not connected yet (missing Dodo product id or api key).'),
            );
          }
          buy.addEventListener('click', function () {
            buy.disabled = true;
            api('/billing/checkout', { method: 'POST' })
              .then(function (result) {
                location.href = result.url;
              })
              .catch(function (error) {
                buy.disabled = false;
                fail(error);
              });
          });
          card.appendChild(buy);
        }
        grid.appendChild(card);

        if (billing.purchases.length) {
          var history = text('div', 'card');
          history.appendChild(text('h3', null, 'Purchases'));
          host.appendChild(history);
          var table = text('table', 'data');
          var head = document.createElement('tr');
          ['Purchase', 'Status', 'Amount', 'Date'].forEach(function (label) {
            head.appendChild(text('th', null, label));
          });
          table.appendChild(head);
          billing.purchases.forEach(function (purchase) {
            var row = document.createElement('tr');
            row.appendChild(text('td', 'tiny', purchase.id));
            row.appendChild(text('td', 'tiny', purchase.status));
            row.appendChild(text('td', 'tiny', money(purchase.amount_cents, purchase.currency)));
            row.appendChild(text('td', 'tiny muted', fmtDate(purchase.created_at)));
            table.appendChild(row);
          });
          history.appendChild(table);
        }
      })
      .catch(function (error) {
        panelError($('billing-body'), error, loadBilling);
      });
  }

  /* ----------------------------------------------------------------- boot -- */

  $('logout').addEventListener('click', function () {
    api('/auth/logout', { method: 'POST' }).then(function () {
      location.href = '/';
    });
  });

  /* ------------------------------------------------------------- account -- */

  function loadAccount() {
    if (!state.user) return;
    $('ac-name').value = state.user.name || '';
    $('ac-email').value = state.user.email || '';
    $('ac-password').value = '';
    $('ac-current').value = '';
    $('ac-lead-emails').checked = Number(state.user.lead_emails) !== 0;
    $('ac-state').textContent = '';
  }

  $('ac-save').addEventListener('click', function () {
    var button = $('ac-save');
    var status = $('ac-state');
    var patch = {
      name: $('ac-name').value.trim(),
      email: $('ac-email').value.trim(),
      lead_emails: $('ac-lead-emails').checked
    };
    if ($('ac-password').value) patch.password = $('ac-password').value;
    if ($('ac-current').value) patch.current_password = $('ac-current').value;
    button.disabled = true;
    status.textContent = 'Saving…';
    api('/auth/profile', { method: 'PATCH', body: patch })
      .then(function (result) {
        state.user = result.user;
        var label = result.user.name || result.user.email;
        $('who').textContent = label;
        $('user-initial').textContent = label.slice(0, 1).toUpperCase();
        $('ac-password').value = '';
        $('ac-current').value = '';
        status.textContent = 'Saved.';
        toast('Profile updated');
      })
      .catch(function (err) {
        status.textContent = err.message || 'Could not save your profile.';
        toast(err.message || 'Could not save your profile', true);
      })
      .then(function () {
        button.disabled = false;
      });
  });

  api('/auth/me')
    .then(function (result) {
      if (!result.user) {
        location.href = '/login.html';
        return;
      }
      state.user = result.user;
      state.publicBase = String(result.public_base || '').replace(/\/$/, '');
      var label = result.user.name || result.user.email;
      $('who').textContent = label;
      $('user-initial').textContent = label.slice(0, 1).toUpperCase();
      var lifetime = result.user.plan === 'lifetime' || Number(result.user.unlimited) === 1;
      planChip({ lifetime: lifetime });
      offerPill({ lifetime: lifetime });
      if (!lifetime) {
        fetch('/api/public/offer')
          .then(function (response) {
            return response.ok ? response.json() : null;
          })
          .then(function (data) {
            if (data && data.offer) offerPill({ offer: data.offer });
          })
          .catch(function () {});
      }
      if (result.user.role === 'admin') $('admin-link').classList.remove('hidden');
      var params = new URLSearchParams(location.search);
      if (params.get('purchase')) {
        // Dodo returns here after checkout; the webhook is what actually grants
        // the plan, so reflect whatever the server says rather than assuming.
        showView('billing');
        toast(result.user.plan === 'lifetime' ? 'Lifetime unlocked' : 'Payment received — unlocking shortly');
      } else if (params.get('view') === 'billing') {
        showView('billing');
      } else {
        showView('videos');
      }
    })
    .catch(function () {
      location.href = '/login.html';
    });
})();
