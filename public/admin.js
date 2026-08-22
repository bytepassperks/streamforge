/* Videokr admin portal. Dependency-free, talks to /api/admin. */
(function () {
  'use strict';

  var state = { me: null, users: [], selected: null };

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
        if (res.status === 401) {
          location.href = '/login.html';
          throw new Error('unauthorized');
        }
        if (res.status === 403) {
          location.href = '/app.html';
          throw new Error('forbidden');
        }
        return res.json().then(function (body) {
          if (!res.ok) throw new Error(body.error || 'Request failed');
          return body;
        });
      },
      function (err) {
        throw new Error(err && err.name === 'AbortError' ? 'the request timed out' : 'network error');
      },
    );
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
    if (!seconds) return '—';
    return new Date(Number(seconds) * 1000).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function money(cents, currency) {
    return (currency || 'USD') + ' ' + (Number(cents || 0) / 100).toFixed(2);
  }

  function empty(message) {
    return text('div', 'empty', message);
  }

  function table(headers, rows) {
    var el = document.createElement('table');
    el.className = 'data';
    var thead = document.createElement('thead');
    var tr = document.createElement('tr');
    headers.forEach(function (h) {
      tr.appendChild(text('th', null, h));
    });
    thead.appendChild(tr);
    el.appendChild(thead);
    var tbody = document.createElement('tbody');
    rows.forEach(function (row) {
      tbody.appendChild(row);
    });
    el.appendChild(tbody);
    return el;
  }

  function cell(row, value, className) {
    row.appendChild(text('td', className || null, value));
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

  /* -------------------------------------------------------------- overview -- */

  function loadOverview() {
    return api('/admin/overview').then(function (data) {
      var stats = [
        ['users', data.users],
        ['lifetime', data.lifetime],
        ['unlimited', data.unlimited],
        ['suspended', data.suspended],
        ['videos', data.videos],
        ['playlists', data.playlists],
        ['leads', data.leads],
        ['plays (all time)', data.plays],
        ['plays (30d)', data.plays_30d],
        ['paid purchases', data.paid_purchases],
        ['revenue', money(data.revenue_cents, 'USD')],
      ];
      var wrap = $('overview-stats');
      wrap.textContent = '';
      stats.forEach(function (pair) {
        var box = text('div', 'stat');
        box.appendChild(text('div', 'k', pair[0]));
        box.appendChild(text('div', 'v', String(pair[1])));
        wrap.appendChild(box);
      });
      var offer = $('overview-offer');
      offer.textContent = '';
      offer.appendChild(text('h3', null, 'Current lifetime offer'));
      offer.appendChild(
        text(
          'p',
          'muted tiny',
          'Seat ' +
            (data.offer.seats_sold + 1) +
            ' sells at $' +
            data.offer.usd +
            ' / ₹' +
            data.offer.inr +
            '. ' +
            (data.offer.seats_left ? data.offer.seats_left + ' seats left at this price' : 'anchor price reached') +
            (data.offer.next_usd ? ', then $' + data.offer.next_usd + '.' : '.'),
        ),
      );
      offer.appendChild(
        text(
          'p',
          'muted tiny',
          'Free tier: ' +
            data.free_limits.videos +
            ' videos, ' +
            Math.round(data.free_limits.storageBytes / (1024 * 1024 * 1024)) +
            ' GB storage, ' +
            data.free_limits.playsPerMonth +
            ' plays/month. Admins and unlimited overrides ignore all three.',
        ),
      );
    });
  }

  /* ----------------------------------------------------------------- users -- */

  function planPill(user) {
    if (Number(user.unlimited) === 1) return ['pill pill-ok', 'unlimited'];
    if (user.plan === 'lifetime') return ['pill', 'lifetime'];
    if (user.plan === 'starter' || user.plan === 'agency') return ['pill', user.plan];
    return ['chip', 'free'];
  }

  function loadUsers() {
    var q = $('users-q').value.trim();
    return api('/admin/users?q=' + encodeURIComponent(q)).then(function (data) {
      state.users = data.users;
      var body = $('users-body');
      body.textContent = '';
      if (!data.users.length) {
        body.appendChild(empty('No users match that search.'));
        return;
      }
      var rows = data.users.map(function (user) {
        var tr = document.createElement('tr');
        var who = document.createElement('td');
        who.appendChild(text('div', null, user.email));
        who.appendChild(text('div', 'tiny muted', user.name || '—'));
        tr.appendChild(who);

        var planCell = document.createElement('td');
        var pill = planPill(user);
        planCell.appendChild(text('span', pill[0], pill[1]));
        if (user.role === 'admin') planCell.appendChild(text('span', 'chip chip-hot', 'admin'));
        if (Number(user.suspended) === 1) planCell.appendChild(text('span', 'chip', 'suspended'));
        tr.appendChild(planCell);

        cell(tr, String(user.videos));
        cell(tr, String(user.leads));
        cell(tr, String(user.paid));
        cell(tr, fmtDate(user.created_at), 'tiny muted');

        var actions = document.createElement('td');
        var manage = text('button', 'btn btn-ghost btn-sm', 'Manage');
        manage.type = 'button';
        manage.addEventListener('click', function () {
          openUser(user.id);
        });
        actions.appendChild(manage);
        var toggle = text('button', 'btn btn-ghost btn-sm', user.plan === 'lifetime' ? 'Downgrade' : 'Upgrade');
        toggle.type = 'button';
        toggle.style.marginLeft = '6px';
        toggle.addEventListener('click', function () {
          api('/admin/users/' + user.id, {
            method: 'PATCH',
            body: { plan: user.plan === 'lifetime' ? 'free' : 'lifetime' },
          })
            .then(function () {
              toast(user.plan === 'lifetime' ? 'Downgraded to free' : 'Upgraded to lifetime');
              return loadUsers();
            })
            .catch(fail);
        });
        actions.appendChild(toggle);
        tr.appendChild(actions);
        return tr;
      });
      body.appendChild(table(['User', 'Plan', 'Videos', 'Leads', 'Paid', 'Joined', ''], rows));
    });
  }

  function openUser(id) {
    api('/admin/users/' + id)
      .then(function (data) {
        state.selected = data.user;
        $('mu-title').textContent = data.user.email;
        $('mu-name').value = data.user.name || '';
        $('mu-plan').value = data.user.plan;
        $('mu-role').value = data.user.role;
        $('mu-unlimited').value = String(Number(data.user.unlimited) || 0);
        $('mu-suspended').value = String(Number(data.user.suspended) || 0);
        $('mu-notes').value = data.user.notes || '';
        $('mu-password').value = '';
        $('mu-usage-period').value = data.plays.period;
        $('mu-usage-plays').value = String(data.plays.plays);
        $('mu-error').textContent = '';
        $('mu-meta').textContent =
          data.user.id +
          ' · joined ' +
          fmtDate(data.user.created_at) +
          ' · lifetime since ' +
          fmtDate(data.user.lifetime_at) +
          ' · ' +
          data.videos.length +
          ' videos · ' +
          data.purchases.length +
          ' purchases · ' +
          data.plays.plays +
          ' plays this month on ' +
          data.plays.plan_name +
          (data.plays.allowance === null ? ' (unlimited)' : ' of ' + data.plays.allowance) +
          (data.plays.blocked ? ' · BLOCKED, over allowance' : '') +
          (data.plays.over && !data.plays.blocked ? ' · ' + data.plays.over + ' over ($' + data.plays.overage_usd + ')' : '');
        openModal('modal-user');
      })
      .catch(fail);
  }

  function saveUser() {
    var user = state.selected;
    if (!user) return;
    var patch = {
      name: $('mu-name').value,
      plan: $('mu-plan').value,
      role: $('mu-role').value,
      unlimited: $('mu-unlimited').value === '1',
      suspended: $('mu-suspended').value === '1',
      notes: $('mu-notes').value,
    };
    var password = $('mu-password').value.trim();
    api('/admin/users/' + user.id, { method: 'PATCH', body: patch })
      .then(function () {
        if (!password) return null;
        return api('/admin/users/' + user.id + '/password', { method: 'POST', body: { password: password } });
      })
      .then(function () {
        toast('Saved' + (password ? ' — password reset, their sessions were signed out' : ''));
        closeModal('modal-user');
        return loadUsers();
      })
      .catch(function (error) {
        $('mu-error').textContent = error.message;
      });
  }

  /* ---------------------------------------------------------------- videos -- */

  function loadVideos() {
    var q = $('videos-q').value.trim();
    return api('/admin/videos?q=' + encodeURIComponent(q)).then(function (data) {
      var body = $('videos-body');
      body.textContent = '';
      if (!data.videos.length) {
        body.appendChild(empty('No videos yet.'));
        return;
      }
      var rows = data.videos.map(function (video) {
        var tr = document.createElement('tr');
        var titleCell = document.createElement('td');
        var link = document.createElement('a');
        link.href = '/v/' + video.slug;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = video.title;
        titleCell.appendChild(link);
        titleCell.appendChild(text('div', 'tiny muted', '/v/' + video.slug));
        tr.appendChild(titleCell);
        cell(tr, video.owner_email, 'tiny');
        cell(tr, video.source_type);
        cell(tr, video.visibility);
        cell(tr, String(video.plays));
        cell(tr, fmtDate(video.created_at), 'tiny muted');
        var actions = document.createElement('td');
        var del = text('button', 'btn btn-danger btn-sm', 'Delete');
        del.type = 'button';
        del.addEventListener('click', function () {
          if (!confirm('Delete "' + video.title + '" and all of its analytics?')) return;
          api('/admin/videos/' + video.id, { method: 'DELETE' })
            .then(function () {
              toast('Video deleted');
              return loadVideos();
            })
            .catch(fail);
        });
        actions.appendChild(del);
        tr.appendChild(actions);
        return tr;
      });
      body.appendChild(table(['Video', 'Owner', 'Source', 'Visibility', 'Plays', 'Created', ''], rows));
    });
  }

  /* ------------------------------------------------------------- purchases -- */

  function loadPurchases() {
    return api('/admin/purchases').then(function (data) {
      var body = $('purchases-body');
      body.textContent = '';
      if (!data.purchases.length) {
        body.appendChild(empty('No purchases yet.'));
        return;
      }
      var rows = data.purchases.map(function (purchase) {
        var tr = document.createElement('tr');
        cell(tr, purchase.user_email, 'tiny');
        cell(tr, purchase.provider);
        cell(tr, money(purchase.amount_cents, purchase.currency));
        var statusCell = document.createElement('td');
        var select = document.createElement('select');
        ['pending', 'paid', 'refunded', 'failed'].forEach(function (value) {
          var option = document.createElement('option');
          option.value = value;
          option.textContent = value;
          if (value === purchase.status) option.selected = true;
          select.appendChild(option);
        });
        select.addEventListener('change', function () {
          api('/admin/purchases/' + purchase.id, {
            method: 'PATCH',
            body: { status: select.value, sync_plan: true },
          })
            .then(function () {
              toast('Purchase marked ' + select.value + ' and the plan moved with it');
              return loadPurchases();
            })
            .catch(fail);
        });
        statusCell.appendChild(select);
        tr.appendChild(statusCell);
        cell(tr, fmtDate(purchase.created_at), 'tiny muted');
        cell(tr, purchase.provider_ref || '—', 'tiny muted');
        return tr;
      });
      body.appendChild(table(['User', 'Provider', 'Amount', 'Status', 'Created', 'Reference'], rows));
    });
  }

  function openSale() {
    api('/admin/users').then(function (data) {
      var select = $('ms-user');
      select.textContent = '';
      data.users.forEach(function (user) {
        var option = document.createElement('option');
        option.value = user.id;
        option.textContent = user.email + ' (' + user.plan + ')';
        select.appendChild(option);
      });
      $('ms-error').textContent = '';
      openModal('modal-sale');
    }).catch(fail);
  }

  /* --------------------------------------------------------------- overage -- */

  function overageStatusPill(status) {
    if (status === 'paid') return 'pill pill-ok';
    if (status === 'failed') return 'chip chip-hot';
    if (status === 'waived') return 'chip';
    return 'pill';
  }

  function loadOverage() {
    return api('/admin/overage').then(function (data) {
      var summary = $('overage-summary');
      summary.textContent = '';
      [
        ['owed', money(data.owed_cents, 'USD')],
        ['collected', money(data.collected_cents, 'USD')],
        ['open period', data.current_period],
        ['last closed', data.last_closed_period],
      ].forEach(function (pair) {
        var box = text('div', 'stat');
        box.appendChild(text('div', 'k', pair[0]));
        box.appendChild(text('div', 'v', String(pair[1])));
        summary.appendChild(box);
      });
      if (!$('overage-period').value) $('overage-period').value = data.last_closed_period;

      var body = $('overage-body');
      body.textContent = '';
      if (!data.charges.length) {
        body.appendChild(empty('Nothing owed yet — no paid account has gone past its allowance.'));
        return;
      }
      var rows = data.charges.map(function (charge) {
        var tr = document.createElement('tr');
        var who = document.createElement('td');
        who.appendChild(text('div', null, charge.user_email));
        who.appendChild(
          text(
            'div',
            'tiny muted',
            charge.plan +
              ' · renews ' +
              fmtDate(charge.plan_renews_at) +
              (charge.subscription_id ? ' · ' + charge.subscription_id : ' · no subscription'),
          ),
        );
        tr.appendChild(who);
        cell(tr, charge.period, 'tiny');
        cell(tr, String(charge.plays) + ' / ' + String(charge.allowance), 'tiny');
        cell(tr, String(charge.over), 'tiny');
        cell(tr, money(charge.amount_cents, charge.currency));

        var statusCell = document.createElement('td');
        statusCell.appendChild(text('span', overageStatusPill(charge.status), charge.status));
        if (charge.attempts) statusCell.appendChild(text('div', 'tiny muted', charge.attempts + ' attempts'));
        if (charge.error) statusCell.appendChild(text('div', 'tiny muted', charge.error));
        tr.appendChild(statusCell);
        cell(tr, charge.payment_id || '—', 'tiny muted');

        var actions = document.createElement('td');
        if (charge.status !== 'paid' && charge.status !== 'waived') {
          var collect = text('button', 'btn btn-sm', charge.status === 'failed' ? 'Retry charge' : 'Charge now');
          collect.type = 'button';
          collect.addEventListener('click', function () {
            api('/admin/overage/' + charge.id + '/charge', { method: 'POST' })
              .then(function (result) {
                toast(
                  result.status === 'paid'
                    ? 'Collected ' + money(charge.amount_cents, charge.currency)
                    : 'Not collected: ' + (result.error || result.status),
                  result.status !== 'paid',
                );
                return loadOverage();
              })
              .catch(fail);
          });
          actions.appendChild(collect);

          var waive = text('button', 'btn btn-ghost btn-sm', 'Waive');
          waive.type = 'button';
          waive.style.marginLeft = '6px';
          waive.addEventListener('click', function () {
            var note = prompt('Why is ' + charge.user_email + "'s " + charge.period + ' overage waived?', '');
            if (note === null) return;
            api('/admin/overage/' + charge.id + '/waive', { method: 'POST', body: { note: note } })
              .then(function () {
                toast('Waived');
                return loadOverage();
              })
              .catch(fail);
          });
          actions.appendChild(waive);
        }
        tr.appendChild(actions);
        return tr;
      });
      body.appendChild(
        table(['Account', 'Period', 'Plays / allowance', 'Over', 'Amount', 'Status', 'Payment', ''], rows),
      );
    });
  }

  /* ----------------------------------------------------------------- audit -- */

  function loadAudit() {
    return api('/admin/audit').then(function (data) {
      var body = $('audit-body');
      body.textContent = '';
      if (!data.audit.length) {
        body.appendChild(empty('No admin actions recorded yet.'));
        return;
      }
      var rows = data.audit.map(function (entry) {
        var tr = document.createElement('tr');
        cell(tr, fmtDate(entry.created_at), 'tiny muted');
        cell(tr, entry.actor_email, 'tiny');
        cell(tr, entry.action);
        cell(tr, entry.target, 'tiny muted');
        cell(tr, entry.detail, 'tiny muted');
        return tr;
      });
      body.appendChild(table(['When', 'Admin', 'Action', 'Target', 'Detail'], rows));
    });
  }

  /* ------------------------------------------------------------------ wire -- */

  var loaders = {
    overview: loadOverview,
    users: loadUsers,
    videos: loadVideos,
    purchases: loadPurchases,
    overage: loadOverage,
    audit: loadAudit,
  };

  function show(view) {
    var buttons = $('side-nav').querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle('active', buttons[i].getAttribute('data-view') === view);
    }
    var views = document.querySelectorAll('.view');
    for (var j = 0; j < views.length; j++) {
      views[j].classList.toggle('active', views[j].id === 'view-' + view);
    }
    loaders[view]().catch(fail);
  }

  $('side-nav').addEventListener('click', function (event) {
    var button = event.target.closest ? event.target.closest('button[data-view]') : null;
    if (button) show(button.getAttribute('data-view'));
  });

  $('refresh-overview').addEventListener('click', function () {
    loadOverview().catch(fail);
  });

  var searchTimer = null;
  function debounce(fn) {
    return function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        fn().catch(fail);
      }, 220);
    };
  }
  $('users-q').addEventListener('input', debounce(loadUsers));
  $('videos-q').addEventListener('input', debounce(loadVideos));

  $('mu-save').addEventListener('click', saveUser);

  $('overage-close').addEventListener('click', function () {
    var period = $('overage-period').value.trim();
    if (!confirm('Close ' + period + '? Every paid account past its allowance is billed for that month.')) return;
    api('/admin/overage/close', { method: 'POST', body: { period: period } })
      .then(function (data) {
        toast(
          data.summary.recorded +
            ' owed, ' +
            data.summary.charged +
            ' collected, ' +
            data.summary.failed +
            ' failed, ' +
            data.summary.manual +
            ' to collect by hand',
        );
        return loadOverage();
      })
      .catch(fail);
  });

  $('mu-usage-save').addEventListener('click', function () {
    var user = state.selected;
    if (!user) return;
    api('/admin/usage/' + user.id, {
      method: 'POST',
      body: { period: $('mu-usage-period').value.trim(), plays: Number($('mu-usage-plays').value || 0) },
    })
      .then(function (data) {
        toast('Play count for ' + data.period + ' set to ' + data.plays);
      })
      .catch(function (error) {
        $('mu-error').textContent = error.message;
      });
  });

  $('mu-overage-record').addEventListener('click', function () {
    var user = state.selected;
    if (!user) return;
    api('/admin/overage/users/' + user.id, {
      method: 'POST',
      body: { period: $('mu-usage-period').value.trim() },
    })
      .then(function (data) {
        toast('Recorded ' + money(data.charge.amount_cents, data.charge.currency) + ' owed for ' + data.charge.period);
      })
      .catch(function (error) {
        $('mu-error').textContent = error.message;
      });
  });

  $('mu-delete').addEventListener('click', function () {
    var user = state.selected;
    if (!user) return;
    if (!confirm('Permanently delete ' + user.email + ' with every video, lead and analytic they own?')) return;
    api('/admin/users/' + user.id, { method: 'DELETE' })
      .then(function () {
        toast('User deleted');
        closeModal('modal-user');
        return loadUsers();
      })
      .catch(function (error) {
        $('mu-error').textContent = error.message;
      });
  });

  $('mu-impersonate').addEventListener('click', function () {
    var user = state.selected;
    if (!user) return;
    if (!confirm('Sign in as ' + user.email + '? Your own admin session ends until you sign back in.')) return;
    api('/admin/users/' + user.id + '/impersonate', { method: 'POST' })
      .then(function () {
        location.href = '/app.html';
      })
      .catch(fail);
  });

  $('new-user').addEventListener('click', function () {
    $('nu-email').value = '';
    $('nu-name').value = '';
    $('nu-password').value = '';
    $('nu-error').textContent = '';
    openModal('modal-new-user');
  });

  $('nu-create').addEventListener('click', function () {
    api('/admin/users', {
      method: 'POST',
      body: {
        email: $('nu-email').value,
        name: $('nu-name').value,
        password: $('nu-password').value,
        plan: $('nu-plan').value,
        role: $('nu-role').value,
      },
    })
      .then(function () {
        toast('User created');
        closeModal('modal-new-user');
        return loadUsers();
      })
      .catch(function (error) {
        $('nu-error').textContent = error.message;
      });
  });

  $('new-purchase').addEventListener('click', openSale);

  $('ms-create').addEventListener('click', function () {
    api('/admin/purchases', {
      method: 'POST',
      body: {
        user_id: $('ms-user').value,
        amount_cents: Math.round(Number($('ms-amount').value || 0) * 100),
        currency: $('ms-currency').value,
        note: $('ms-note').value,
      },
    })
      .then(function () {
        toast('Lifetime granted and the sale recorded');
        closeModal('modal-sale');
        return loadPurchases();
      })
      .catch(function (error) {
        $('ms-error').textContent = error.message;
      });
  });

  api('/auth/me')
    .then(function (data) {
      if (!data.user) {
        location.href = '/login.html';
        return;
      }
      if (data.user.role !== 'admin') {
        location.href = '/app.html';
        return;
      }
      state.me = data.user;
      $('who').textContent = data.user.email;
      show('overview');
    })
    .catch(fail);
})();
