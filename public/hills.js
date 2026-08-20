/* Shared hand-drawn forest band used along the bottom of every Videokr
   surface. Pages opt in with <div class="hills" data-hills> (add
   .hills--full when there is no sidebar to sit beside). */
(function () {
  var markup =
    '<svg viewBox="0 0 1200 420" preserveAspectRatio="none">' +
    '<defs>' +
    '<filter id="grass-speckle">' +
    '<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="7"/>' +
    '<feColorMatrix type="saturate" values="0"/>' +
    '</filter>' +
    '<filter id="grass-edge">' +
    '<feTurbulence type="fractalNoise" baseFrequency="0.05 0.9" numOctaves="2" seed="3" result="t"/>' +
    '<feDisplacementMap in="SourceGraphic" in2="t" scale="8" xChannelSelector="R" yChannelSelector="G"/>' +
    '</filter>' +
    '<clipPath id="grass-clip">' +
    '<path d="M0 224c86-11 168-33 262-31 118 3 214 27 336 28 118 1 210-22 320-29 105-7 196 8 282 21v207H0z"/>' +
    '</clipPath>' +
    '</defs>' +
    '<g filter="url(#grass-edge)">' +
    '<path d="M0 200c92-8 176-24 268-22 116 3 210 24 330 26 118 2 212-20 322-27 104-7 196 6 280 17v226H0z" fill="#1b5142"/>' +
    '<path d="M0 224c86-11 168-33 262-31 118 3 214 27 336 28 118 1 210-22 320-29 105-7 196 8 282 21v207H0z" fill="#124236"/>' +
    '</g>' +
    '<g clip-path="url(#grass-clip)" opacity=".2" style="mix-blend-mode:overlay">' +
    '<rect x="0" y="0" width="1200" height="420" filter="url(#grass-speckle)"/>' +
    '</g>' +
    '</svg>' +
    '<img class="prop-glass" src="/brand/prop-glass.png" alt="">' +
    '<img class="prop-specs" src="/brand/prop-specs.png" alt="">';

  document.querySelectorAll('[data-hills]').forEach(function (band) {
    band.setAttribute('aria-hidden', 'true');
    band.innerHTML = markup;
  });
})();
