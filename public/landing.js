/* Landing page behaviour: the scroll reveals, the sticky before/after dial, the
   step switcher, the pricing period toggle, the use-case rail and the mobile menu.
   Everything degrades to a readable static page if this file never loads. */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- mobile menu ---- */
  var burger = document.getElementById('burger');
  var panel = document.getElementById('nav-panel');
  if (burger && panel) {
    burger.addEventListener('click', function () {
      var open = panel.classList.toggle('lp-open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    panel.addEventListener('click', function (event) {
      if (event.target.closest('a')) {
        panel.classList.remove('lp-open');
        burger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---- reveals ---- */
  var reveals = document.querySelectorAll('.lp-reveal');
  if (reduce || !('IntersectionObserver' in window)) {
    Array.prototype.forEach.call(reveals, function (node) { node.classList.add('lp-in'); });
  } else {
    var revealer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('lp-in');
          revealer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    Array.prototype.forEach.call(reveals, function (node) { revealer.observe(node); });
  }

  /* ---- which nav link is lit ---- */
  var navLinks = document.querySelectorAll('#nav-links a');
  var watched = [];
  Array.prototype.forEach.call(navLinks, function (link) {
    var section = document.querySelector(link.getAttribute('href'));
    if (section) watched.push({ link: link, section: section });
  });

  function lightNav() {
    var line = window.scrollY + window.innerHeight * 0.32;
    var current = null;
    watched.forEach(function (pair) {
      var top = pair.section.offsetTop;
      if (line >= top) current = pair;
    });
    watched.forEach(function (pair) {
      if (pair === current) pair.link.setAttribute('aria-current', 'true');
      else pair.link.removeAttribute('aria-current');
    });
  }

  /* ---- before / after dial ---- */
  var compare = document.getElementById('why');
  var stage = compare && compare.querySelector('.lp-compare-stage');
  var pinned = null; /* set once a visitor clicks a tab, so scrolling stops overriding them */

  function turnDial() {
    if (!stage || pinned) return;
    var box = stage.getBoundingClientRect();
    var travelled = (window.innerHeight * 0.5 - box.top) / Math.max(1, box.height);
    compare.dataset.state = travelled > 0.42 ? 'after' : 'before';
    syncTabs();
  }

  function syncTabs() {
    Array.prototype.forEach.call(compare.querySelectorAll('.lp-compare-tab'), function (tab) {
      tab.setAttribute('aria-selected', tab.dataset.tab === compare.dataset.state ? 'true' : 'false');
    });
  }

  if (compare) {
    Array.prototype.forEach.call(compare.querySelectorAll('.lp-compare-tab'), function (tab) {
      tab.addEventListener('click', function () {
        pinned = tab.dataset.tab;
        compare.dataset.state = pinned;
        syncTabs();
      });
    });
  }

  /* ---- the drifting clouds follow the scroll a little ---- */
  var clouds = document.querySelectorAll('.lp-cloud');
  function driftClouds() {
    if (reduce) return;
    var y = window.scrollY;
    if (y > 1400) return;
    Array.prototype.forEach.call(clouds, function (cloud, index) {
      cloud.style.marginTop = (y * (0.06 + index * 0.04)).toFixed(1) + 'px';
    });
  }

  /* ---- the use-case rail slides as the section passes ---- */
  var rail = document.getElementById('rail');
  var track = document.getElementById('rail-track');
  function slideRail() {
    if (!rail || !track || reduce) return;
    var box = rail.getBoundingClientRect();
    if (box.bottom < 0 || box.top > window.innerHeight) return;
    var overflow = track.scrollWidth - rail.clientWidth;
    if (overflow <= 0) { track.style.transform = 'none'; return; }
    var progress = (window.innerHeight - box.top) / (window.innerHeight + box.height);
    progress = Math.min(1, Math.max(0, progress));
    track.style.transform = 'translate3d(' + (-overflow * progress).toFixed(1) + 'px,0,0)';
  }

  var queued = false;
  function onScroll() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(function () {
      queued = false;
      lightNav();
      turnDial();
      driftClouds();
      slideRail();
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  /* ---- how it works ---- */
  var stepArt = {
    0: { webp: '/brand/lp/app-upload.webp', png: '/brand/lp/app-upload.png', alt: 'Uploading a video in Videokr' },
    1: { webp: '/brand/lp/app-library.webp', png: '/brand/lp/app-library.png', alt: 'Branding the player and setting the email gate' },
    2: { webp: '/brand/lp/app-analytics.webp', png: '/brand/lp/app-analytics.png', alt: 'Retention and lead numbers for an embedded video' }
  };
  var steps = document.getElementById('steps');
  var art = document.getElementById('step-art');
  if (steps && art) {
    steps.addEventListener('click', function (event) {
      var button = event.target.closest('.lp-step');
      if (!button) return;
      Array.prototype.forEach.call(steps.querySelectorAll('.lp-step'), function (other) {
        other.setAttribute('aria-expanded', other === button ? 'true' : 'false');
      });
      var next = stepArt[button.dataset.step];
      if (!next) return;
      var source = art.parentNode.querySelector('source');
      if (source) source.srcset = next.webp;
      art.src = next.png;
      art.alt = next.alt;
    });
  }

  /* ---- monthly / yearly ---- */
  var periods = {
    starter: { monthly: ['$5', ' /month'], yearly: ['$29', ' /year'] },
    agency: { monthly: ['$29', ' /month'], yearly: ['$290', ' /year'] }
  };
  var billing = document.getElementById('billing-switch');
  if (billing) {
    billing.addEventListener('click', function () {
      var yearly = billing.getAttribute('aria-checked') !== 'true';
      billing.setAttribute('aria-checked', yearly ? 'true' : 'false');
      Object.keys(periods).forEach(function (plan) {
        var price = document.querySelector('[data-price="' + plan + '"]');
        var period = document.querySelector('[data-period="' + plan + '"]');
        var pair = periods[plan][yearly ? 'yearly' : 'monthly'];
        if (price) price.textContent = pair[0];
        if (period) period.textContent = pair[1];
      });
    });
  }
})();
