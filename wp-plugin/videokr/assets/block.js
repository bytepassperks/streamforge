/**
 * Videokr block: pick a video or playlist from the connected account, then
 * preview the real embed through the server renderer so the editor shows
 * exactly what a visitor gets.
 *
 * Written against the runtime `wp.*` globals on purpose — the plugin ships
 * without a build step so it stays readable in the WordPress plugin directory.
 */
(function (wp, config) {
  'use strict';

  var el = wp.element.createElement;
  var Fragment = wp.element.Fragment;
  var useState = wp.element.useState;
  var useEffect = wp.element.useEffect;
  var __ = wp.i18n.__;
  var components = wp.components;
  var blockEditor = wp.blockEditor;
  var ServerSideRender = wp.serverSideRender;

  var RATIOS = [
    { label: __('Default', 'videokr'), value: '' },
    { label: '16:9', value: '16/9' },
    { label: '4:3', value: '4/3' },
    { label: '1:1', value: '1/1' },
    { label: '9:16', value: '9/16' }
  ];

  function useLibrary() {
    var state = useState({ loading: true, error: '', videos: [], playlists: [] });
    var library = state[0];
    var setLibrary = state[1];

    function load(fresh) {
      setLibrary({ loading: true, error: '', videos: [], playlists: [] });
      wp.apiFetch({ path: '/videokr/v1/library' + (fresh ? '?fresh=1' : '') })
        .then(function (data) {
          setLibrary({
            loading: false,
            error: '',
            videos: data.videos || [],
            playlists: data.playlists || []
          });
        })
        .catch(function (error) {
          setLibrary({
            loading: false,
            error: (error && error.message) || __('Could not reach Videokr.', 'videokr'),
            videos: [],
            playlists: []
          });
        });
    }

    useEffect(function () {
      if (config.connected) load(false);
      else setLibrary({ loading: false, error: '', videos: [], playlists: [] });
    }, []);

    return [library, load];
  }

  function absolute(url) {
    if (!url || /^https?:\/\//i.test(url)) return url;
    return String(config.host || '').replace(/\/+$/, '') + '/' + String(url).replace(/^\/+/, '');
  }

  function Thumb(item) {
    if (item.thumbnail_url) {
      return el('img', { src: absolute(item.thumbnail_url), alt: '', className: 'videokr-pick__art' });
    }
    return el('span', { className: 'videokr-pick__art videokr-pick__art--empty' }, '▶');
  }

  function duration(seconds) {
    var total = Math.round(Number(seconds) || 0);
    if (!total) return '';
    var mins = Math.floor(total / 60);
    var secs = total % 60;
    return mins + ':' + (secs < 10 ? '0' : '') + secs;
  }

  function Picker(props) {
    var searchState = useState('');
    var search = searchState[0];
    var setSearch = searchState[1];
    var library = props.library;
    var isPlaylist = props.kind === 'playlist';
    var items = isPlaylist ? library.playlists : library.videos;
    var needle = search.trim().toLowerCase();
    var shown = items.filter(function (item) {
      if (!needle) return true;
      return (
        String(item.title || '').toLowerCase().indexOf(needle) > -1 ||
        String(item.slug || '').toLowerCase().indexOf(needle) > -1
      );
    });

    if (!config.connected) {
      return el(
        'div',
        { className: 'videokr-pick__empty' },
        el('p', null, __('Connect your Videokr account to list your videos here.', 'videokr')),
        el(components.Button, { variant: 'primary', href: config.settings }, __('Open Videokr settings', 'videokr'))
      );
    }
    if (library.loading) {
      return el('div', { className: 'videokr-pick__empty' }, el(components.Spinner, null));
    }
    if (library.error) {
      return el(
        'div',
        { className: 'videokr-pick__empty' },
        el(components.Notice, { status: 'error', isDismissible: false }, library.error),
        el(components.Button, { variant: 'secondary', onClick: function () { props.reload(true); } }, __('Try again', 'videokr'))
      );
    }

    return el(
      Fragment,
      null,
      el(components.ButtonGroup, { className: 'videokr-pick__kinds' },
        el(components.Button, {
          variant: isPlaylist ? 'secondary' : 'primary',
          onClick: function () { props.setKind('video'); }
        }, __('Videos', 'videokr')),
        el(components.Button, {
          variant: isPlaylist ? 'primary' : 'secondary',
          onClick: function () { props.setKind('playlist'); }
        }, __('Playlists', 'videokr'))
      ),
      el(components.TextControl, {
        className: 'videokr-pick__search',
        value: search,
        placeholder: __('Search by title or slug…', 'videokr'),
        onChange: setSearch,
        __nextHasNoMarginBottom: true
      }),
      shown.length
        ? el(
            'ul',
            { className: 'videokr-pick__list' },
            shown.map(function (item) {
              return el(
                'li',
                { key: item.id },
                el(
                  'button',
                  {
                    type: 'button',
                    className: 'videokr-pick__item',
                    onClick: function () { props.onPick(item); }
                  },
                  Thumb(item),
                  el(
                    'span',
                    { className: 'videokr-pick__meta' },
                    el('strong', null, item.title || item.slug),
                    el(
                      'span',
                      { className: 'videokr-pick__sub' },
                      isPlaylist
                        ? /* translators: %d: number of videos. */
                          wp.i18n.sprintf(wp.i18n._n('%d video', '%d videos', Number(item.item_count) || 0, 'videokr'), Number(item.item_count) || 0)
                        : [duration(item.duration), item.visibility].filter(Boolean).join(' · ')
                    )
                  )
                )
              );
            })
          )
        : el(
            'div',
            { className: 'videokr-pick__empty' },
            el('p', null, isPlaylist
              ? __('No playlists in this account yet.', 'videokr')
              : __('No videos in this account yet. Upload one in Videokr, then refresh.', 'videokr')),
            el(components.Button, { variant: 'secondary', onClick: function () { props.reload(true); } }, __('Refresh', 'videokr'))
          )
    );
  }

  function Edit(props) {
    var attributes = props.attributes;
    var setAttributes = props.setAttributes;
    var result = useLibrary();
    var library = result[0];
    var reload = result[1];
    var chosen = attributes.videoId || attributes.playlistId;
    var blockProps = blockEditor.useBlockProps({ className: chosen ? 'videokr-preview' : 'videokr-pick' });

    function pick(item) {
      setAttributes(
        attributes.kind === 'playlist'
          ? { playlistId: item.slug || item.id, videoId: '', title: item.title || '' }
          : { videoId: item.slug || item.id, playlistId: '', title: item.title || '' }
      );
    }

    var inspector = el(
      blockEditor.InspectorControls,
      null,
      el(
        components.PanelBody,
        { title: __('Embed', 'videokr'), initialOpen: true },
        el(components.SelectControl, {
          label: __('Aspect ratio', 'videokr'),
          value: attributes.ratio,
          options: RATIOS,
          onChange: function (value) { setAttributes({ ratio: value }); },
          __nextHasNoMarginBottom: true
        }),
        el(components.TextControl, {
          label: __('Width', 'videokr'),
          help: __('100% by default. Accepts 640, 640px or 80%.', 'videokr'),
          value: attributes.width,
          onChange: function (value) { setAttributes({ width: value }); },
          __nextHasNoMarginBottom: true
        }),
        el(components.ToggleControl, {
          label: __('Autoplay', 'videokr'),
          help: __('Browsers only allow autoplay when the player is muted.', 'videokr'),
          checked: !!attributes.autoplay,
          onChange: function (value) { setAttributes({ autoplay: value, muted: value ? true : attributes.muted }); },
          __nextHasNoMarginBottom: true
        }),
        el(components.ToggleControl, {
          label: __('Start muted', 'videokr'),
          checked: !!attributes.muted,
          onChange: function (value) { setAttributes({ muted: value }); },
          __nextHasNoMarginBottom: true
        }),
        el(components.TextControl, {
          label: __('Start at (seconds)', 'videokr'),
          type: 'number',
          value: attributes.start,
          onChange: function (value) { setAttributes({ start: value }); },
          __nextHasNoMarginBottom: true
        }),
        chosen
          ? el(components.Button, {
              variant: 'secondary',
              onClick: function () { setAttributes({ videoId: '', playlistId: '', title: '' }); }
            }, __('Choose another', 'videokr'))
          : null
      )
    );

    if (!chosen) {
      return el(
        Fragment,
        null,
        inspector,
        el(
          'div',
          blockProps,
          el(
            'div',
            { className: 'videokr-pick__head' },
            el('span', { className: 'videokr-pick__mark' }, 'Videokr'),
            el('p', null, __('Pick a video or playlist from your account.', 'videokr'))
          ),
          el(Picker, {
            kind: attributes.kind,
            setKind: function (kind) { setAttributes({ kind: kind }); },
            library: library,
            reload: reload,
            onPick: pick
          })
        )
      );
    }

    return el(
      Fragment,
      null,
      inspector,
      el(
        'div',
        blockProps,
        el('div', { className: 'videokr-preview__bar' },
          el('span', { className: 'videokr-pick__mark' }, 'Videokr'),
          el('span', { className: 'videokr-preview__title' }, attributes.title || chosen),
          el(components.Button, {
            variant: 'tertiary',
            isSmall: true,
            onClick: function () { setAttributes({ videoId: '', playlistId: '', title: '' }); }
          }, __('Change', 'videokr'))
        ),
        el(ServerSideRender, { block: 'videokr/embed', attributes: attributes })
      )
    );
  }

  wp.blocks.registerBlockType('videokr/embed', { edit: Edit, save: function () { return null; } });
})(window.wp, window.videokrBlock || { connected: false, settings: '', host: '' });
