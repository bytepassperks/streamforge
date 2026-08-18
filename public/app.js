/* StreamForge dashboard. Dependency-free, talks to /api and previews the real player. */
(function () {
  'use strict';

  var state = { user: null, projects: [], videos: [], playlists: [], video: null, config: null };

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
    return fetch('/api' + path, init).then(function (res) {
      if (res.status === 401 && path.indexOf('/auth/') !== 0) {
        location.href = '/login.html';
        throw new Error('unauthorized');
      }
      return res.json().then(function (body) {
        if (!res.ok) throw new Error(body.error || 'Request failed');
        return body;
      });
    });
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
    }
  });

  /* ---------------------------------------------------------------- views -- */

  var loaders = {
    videos: loadVideos,
    playlists: loadPlaylists,
    projects: loadProjects,
    leads: loadLeads,
    integrations: loadWebhooks,
  };

  function showView(name) {
    document.querySelectorAll('.view').forEach(function (view) {
      view.classList.toggle('active', view.id === 'view-' + name);
    });
    document.querySelectorAll('#side-nav button').forEach(function (button) {
      button.classList.toggle('active', button.dataset.view === name);
    });
    if (loaders[name]) loaders[name]();
  }

  document.querySelectorAll('#side-nav button').forEach(function (button) {
    button.addEventListener('click', function () {
      showView(button.dataset.view);
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
  }

  function loadVideos() {
    Promise.all([api('/videos'), api('/analytics/summary'), api('/projects')])
      .then(function (results) {
        state.videos = results[0].videos;
        state.projects = results[2].projects;
        renderStats(results[1].totals || {});
        fillProjectSelects();
        renderVideoTable();
      })
      .catch(fail);
  }

  function renderVideoTable() {
    var host = $('videos-body');
    host.textContent = '';
    if (!state.videos.length) {
      host.appendChild(
        text('div', 'empty', 'No videos yet. Click “New video” to add your first source.'),
      );
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
      if (video.thumbnail_url) {
        var img = document.createElement('img');
        img.src = video.thumbnail_url;
        img.alt = '';
        thumbCell.appendChild(img);
      } else {
        thumbCell.appendChild(text('div', 'thumb-ph'));
      }
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
      row.appendChild(text('td', null, String(video.plays || 0)));
      row.appendChild(text('td', null, String(video.leads || 0)));
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

  function fillProjectSelects() {
    ['nv-project', 'ed-project'].forEach(function (id) {
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

  $('new-video').addEventListener('click', function () {
    $('nv-title').value = '';
    $('nv-source').value = '';
    $('nv-upload').value = '';
    $('nv-error').textContent = '';
    openModal('modal-new-video');
  });

  $('nv-save').addEventListener('click', function () {
    var button = $('nv-save');
    var error = $('nv-error');
    error.textContent = '';
    var file = $('nv-upload').files[0];
    var source = $('nv-source').value.trim();
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
            title: $('nv-title').value.trim(),
            source: resolvedSource,
            project_id: $('nv-project').value || null,
          },
        });
      })
      .then(function (result) {
        button.disabled = false;
        closeModal('modal-new-video');
        toast('Video created');
        loadVideos();
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
  };

  document.querySelectorAll('#ed-tabs button').forEach(function (button) {
    button.addEventListener('click', function () {
      document.querySelectorAll('#ed-tabs button').forEach(function (other) {
        other.classList.toggle('active', other === button);
      });
      document.querySelectorAll('#modal-editor .tab-panel').forEach(function (panel) {
        panel.classList.toggle('active', panel.dataset.panel === button.dataset.tab);
      });
      if (button.dataset.tab === 'stats') loadVideoStats();
    });
  });

  function openEditor(id) {
    api('/videos/' + id)
      .then(function (result) {
        state.video = result.video;
        state.config = result.player_config;
        fillEditor(result);
        openModal('modal-editor');
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
    $('pc-sticky').checked = config.sticky;

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
    renderSnippets(video);
  }

  function renderSnippets(video) {
    var base = location.origin;
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

  $('copy-script').addEventListener('click', function () {
    var value = $('snip-script').textContent;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(value).then(function () {
        toast('Embed code copied');
      });
    } else {
      toast('Copy manually: ' + value);
    }
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

  function ctaRow(cta) {
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
    [
      ['overlay', 'Overlay card'],
      ['banner', 'Bottom banner'],
      ['gate', 'Email gate (pauses playback)'],
      ['endscreen', 'End screen'],
    ].forEach(function (pair) {
      kind.appendChild(new Option(pair[1], pair[0]));
    });
    kind.value = cta ? cta.kind : 'overlay';
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
    grid.appendChild(field('Headline', input('headline', 'Book a demo', cta ? cta.headline : '')));
    grid.appendChild(field('Body', input('body', 'Short supporting line', cta ? cta.body : '')));
    grid.appendChild(field('Button text', input('button_text', 'Get started', cta ? cta.button_text : '')));
    grid.appendChild(field('Button url', input('button_url', 'https://example.com', cta ? cta.button_url : '')));
    grid.appendChild(field('Gate fields', input('fields', 'email,name,phone', cta ? cta.fields : 'email')));
    card.appendChild(grid);

    var skippable = text('label', 'checkbox');
    var skipInput = document.createElement('input');
    skipInput.type = 'checkbox';
    skipInput.dataset.field = 'skippable';
    skipInput.checked = cta ? cta.skippable !== 0 : true;
    skippable.appendChild(skipInput);
    skippable.appendChild(document.createTextNode(' Viewer can skip / dismiss'));
    card.appendChild(skippable);

    var remove = text('button', 'btn btn-ghost btn-sm', 'Remove CTA');
    remove.type = 'button';
    remove.addEventListener('click', function () {
      card.remove();
    });
    card.appendChild(remove);
    return card;
  }

  function renderCtaRows(ctas) {
    var host = $('ctas-rows');
    host.textContent = '';
    ctas.forEach(function (cta) {
      host.appendChild(ctaRow(cta));
    });
  }

  $('add-cta').addEventListener('click', function () {
    $('ctas-rows').appendChild(ctaRow(null));
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
      sticky: $('pc-sticky').checked,
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
    $('ctas-rows')
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
    return rows;
  }

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
    window.StreamForge.mount(mount, {
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
    host.textContent = 'Loading…';
    api('/analytics/videos/' + state.video.id)
      .then(function (data) {
        host.textContent = '';
        var counts = data.counts || {};
        var impressions = counts.load || 0;
        var plays = counts.play || 0;

        var grid = text('div', 'stat-grid');
        [
          ['Impressions', impressions],
          ['Plays', plays],
          ['Play rate', impressions ? Math.round((plays / impressions) * 100) + '%' : '—'],
          ['Completions', counts.complete || 0],
          ['CTA clicks', counts.cta_click || 0],
          ['Leads', counts.lead || 0],
        ].forEach(function (pair) {
          var card = text('div', 'stat');
          card.appendChild(text('div', 'k', pair[0]));
          card.appendChild(text('div', 'v', String(pair[1])));
          grid.appendChild(card);
        });
        host.appendChild(grid);

        host.appendChild(text('h3', null, 'Audience retention'));
        var retention = text('div', 'retention');
        var max = 1;
        (data.retention || []).forEach(function (row) {
          max = Math.max(max, row.views);
        });
        var byBucket = {};
        (data.retention || []).forEach(function (row) {
          byBucket[row.bucket] = row.views;
        });
        if (!(data.retention || []).length) {
          host.appendChild(text('p', 'muted tiny', 'No playback data yet.'));
        } else {
          for (var i = 0; i < 100; i += 2) {
            var bar = document.createElement('span');
            var views = byBucket[i] || 0;
            bar.style.height = Math.round((views / max) * 100) + '%';
            bar.title = i + '–' + (i + 2) + '% · ' + views + ' views';
            retention.appendChild(bar);
          }
          host.appendChild(retention);
        }

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
      .catch(fail);
  }

  function appendBars(host, title, rows, key) {
    if (!rows || !rows.length) return;
    host.appendChild(text('h3', null, title));
    var wrap = text('div', 'bars');
    var max = rows.reduce(function (acc, row) {
      return Math.max(acc, row.n);
    }, 1);
    rows.forEach(function (row) {
      var line = text('div', 'bar-row');
      line.appendChild(text('span', null, row[key] || 'unknown'));
      var track = text('div', 'bar-track');
      var fill = text('div', 'bar-fill');
      fill.style.width = Math.round((row.n / max) * 100) + '%';
      track.appendChild(fill);
      line.appendChild(track);
      line.appendChild(text('span', 'tiny muted', String(row.n)));
      wrap.appendChild(line);
    });
    host.appendChild(wrap);
  }

  /* ------------------------------------------------------------ playlists -- */

  function loadPlaylists() {
    Promise.all([api('/playlists'), api('/videos')])
      .then(function (results) {
        state.playlists = results[0].playlists;
        state.videos = results[1].videos;
        renderPlaylists();
      })
      .catch(fail);
  }

  function renderPlaylists() {
    var host = $('playlists-body');
    host.textContent = '';
    if (!state.playlists.length) {
      host.appendChild(text('div', 'empty', 'No playlists yet.'));
      return;
    }
    state.playlists.forEach(function (playlist) {
      var card = text('div', 'card');
      card.style.marginBottom = '14px';
      var head = text('div', 'row spread');
      var left = document.createElement('div');
      left.appendChild(text('h3', null, playlist.title));
      var link = text('a', 'tiny muted', location.origin + '/pl/' + playlist.slug);
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
      state.videos.forEach(function (video) {
        var label = text('label', 'checkbox');
        var input = document.createElement('input');
        input.type = 'checkbox';
        input.value = video.id;
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
          host.appendChild(text('div', 'empty', 'No projects yet.'));
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
      .catch(fail);
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
        if (!result.leads.length) {
          host.appendChild(text('div', 'empty', 'No leads captured yet.'));
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
      .catch(fail);
  }

  /* ------------------------------------------------------------- webhooks -- */

  function loadWebhooks() {
    api('/webhooks')
      .then(function (result) {
        var host = $('webhooks-body');
        host.textContent = '';
        if (!result.webhooks.length) {
          host.appendChild(text('div', 'empty', 'No webhooks configured.'));
          return;
        }
        var table = text('table', 'data');
        var headRow = document.createElement('tr');
        ['Endpoint', 'Events', 'Added', ''].forEach(function (label) {
          headRow.appendChild(text('th', null, label));
        });
        table.appendChild(headRow);
        result.webhooks.forEach(function (hook) {
          var row = document.createElement('tr');
          row.appendChild(text('td', null, hook.url));
          row.appendChild(text('td', null, hook.events));
          row.appendChild(text('td', 'tiny muted', fmtDate(hook.created_at)));
          var actions = document.createElement('td');
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
      .catch(fail);
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

  /* ----------------------------------------------------------------- boot -- */

  $('logout').addEventListener('click', function () {
    api('/auth/logout', { method: 'POST' }).then(function () {
      location.href = '/';
    });
  });

  api('/auth/me')
    .then(function (result) {
      if (!result.user) {
        location.href = '/login.html';
        return;
      }
      state.user = result.user;
      $('who').textContent = result.user.name || result.user.email;
      showView('videos');
    })
    .catch(function () {
      location.href = '/login.html';
    });
})();
