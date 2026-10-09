/* Instant client-side search (name, Bangla name, location, address) */
(function (PM) {
  'use strict';
  const norm = (s) => String(s || '').normalize('NFC').toLowerCase().trim();

  function matches(puja, query) {
    const tokens = norm(query).split(/\s+/).filter(Boolean);
    if (!tokens.length) return true;
    const hay = norm([puja.name, puja.name_bn, puja.location, puja.address, puja.category].join(' '));
    return tokens.every((t) => hay.includes(t));
  }

  function debounce(fn, wait) {
    let t;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), wait);
    };
  }

  PM.Search = { matches, debounce };
})(window.PujaMap = window.PujaMap || {});
