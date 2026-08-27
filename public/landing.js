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
  var currentNav = null;
  Array.prototype.forEach.call(navLinks, function (link) {
    var section = document.querySelector(link.getAttribute('href'));
    if (section) watched.push({ link: link, section: section, top: 0 });
  });

  var compare = document.getElementById('why');
  var stage = compare && compare.querySelector('.lp-compare-stage');
  var scrollArea = compare && compare.querySelector('.lp-compare-scroll');
  var scrollSide = null;
  var rail = document.getElementById('rail');
  var track = document.getElementById('rail-track');
  var heroClouds = document.querySelector('.lp-hero-clouds');
  var prop = document.querySelector('.lp-prop');
  var clouds = document.querySelectorAll('.lp-cloud-shift');
  var compareVisible = !!scrollArea;
  var railVisible = !!rail;
  var cloudsVisible = !!heroClouds;
  var metrics = {
    stickyTop: 0,
    compareTravel: 1,
    railOverflow: 0
  };

  function measure() {
    watched.forEach(function (pair) {
      pair.top = pair.section.offsetTop;
    });
    if (stage && scrollArea) {
      metrics.stickyTop = parseFloat(window.getComputedStyle(stage).top) || 0;
      metrics.compareTravel = Math.max(1, scrollArea.offsetHeight - stage.offsetHeight);
    }
    if (rail && track) {
      metrics.railOverflow = Math.max(0, track.scrollWidth - rail.clientWidth);
    }
  }

  function lightNav(scrollY, innerHeight) {
    var line = scrollY + innerHeight * 0.32;
    var current = null;
    watched.forEach(function (pair) {
      if (line >= pair.top) current = pair;
    });
    if (current === currentNav) return;
    currentNav = current;
    watched.forEach(function (pair) {
      if (pair === current) pair.link.setAttribute('aria-current', 'true');
      else pair.link.removeAttribute('aria-current');
    });
  }

  function turnDial(box) {
    if (!stage || !scrollArea || reduce || !compareVisible || !box) return;
    var progress = Math.min(1, Math.max(0, (metrics.stickyTop - box.top) / metrics.compareTravel));
    var nextSide = progress > 0.35 ? 'after' : 'before';
    if (nextSide === scrollSide) return;
    scrollSide = nextSide;
    compare.dataset.state = nextSide;
    syncTabs();
  }

  function syncTabs() {
    Array.prototype.forEach.call(compare.querySelectorAll('.lp-compare-tab'), function (tab) {
      tab.setAttribute('aria-selected', tab.dataset.tab === compare.dataset.state ? 'true' : 'false');
    });
  }

  if (compare) {
    if (reduce) compare.classList.add('lp-compare-static');
    Array.prototype.forEach.call(compare.querySelectorAll('.lp-compare-tab'), function (tab) {
      tab.addEventListener('click', function () {
        compare.dataset.state = tab.dataset.tab;
        syncTabs();
      });
    });
  }

  /* ---- the drifting clouds follow the scroll a little ---- */
  function driftClouds(y) {
    if (reduce || !cloudsVisible) return;
    if (y > 1400) return;
    Array.prototype.forEach.call(clouds, function (cloud, index) {
      cloud.style.transform = 'translate3d(0, ' + (y * (0.06 + index * 0.04)).toFixed(1) + 'px, 0)';
    });
  }

  /* ---- the use-case rail slides as the section passes ---- */
  function slideRail(box, innerHeight) {
    if (!rail || !track || reduce || !railVisible || !box) return;
    var overflow = metrics.railOverflow;
    if (overflow <= 0) { track.style.transform = 'none'; return; }
    var progress = (innerHeight - box.top) / (innerHeight + box.height);
    progress = Math.min(1, Math.max(0, progress));
    track.style.transform = 'translate3d(' + (-overflow * progress).toFixed(1) + 'px,0,0)';
  }

  function readScrollFrame() {
    var frame = {
      scrollY: window.scrollY,
      innerHeight: window.innerHeight,
      compareBox: null,
      railBox: null
    };
    if (compareVisible) frame.compareBox = scrollArea.getBoundingClientRect();
    if (railVisible) frame.railBox = rail.getBoundingClientRect();
    return frame;
  }

  var queued = false;
  function onScroll() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(function () {
      queued = false;
      var frame = readScrollFrame();
      lightNav(frame.scrollY, frame.innerHeight);
      turnDial(frame.compareBox);
      driftClouds(frame.scrollY);
      slideRail(frame.railBox, frame.innerHeight);
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  var measureTimer = null;
  function scheduleMeasure() {
    if (measureTimer) window.clearTimeout(measureTimer);
    measureTimer = window.setTimeout(function () {
      measureTimer = null;
      measure();
      onScroll();
    }, 150);
  }
  window.addEventListener('resize', scheduleMeasure);
  window.addEventListener('load', function () {
    measure();
    onScroll();
  });

  if ('IntersectionObserver' in window) {
    var visibilityObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.target === heroClouds) cloudsVisible = entry.isIntersecting;
        if (entry.target === scrollArea) compareVisible = entry.isIntersecting;
        if (entry.target === rail) railVisible = entry.isIntersecting;
      });
    });
    if (heroClouds) visibilityObserver.observe(heroClouds);
    if (scrollArea) visibilityObserver.observe(scrollArea);
    if (rail) visibilityObserver.observe(rail);

    var animationObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        entry.target.classList.toggle('lp-animation-paused', !entry.isIntersecting);
      });
    });
    if (heroClouds) animationObserver.observe(heroClouds);
    if (prop) animationObserver.observe(prop);
    Array.prototype.forEach.call(document.querySelectorAll('.lp-orbit-node'), function (node) {
      animationObserver.observe(node);
    });
  }

  measure();
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
