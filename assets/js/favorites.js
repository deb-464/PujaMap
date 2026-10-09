/* Favorites stored locally in the browser (no login, nothing sent anywhere) */
(function (PM) {
  'use strict';
  const KEY = 'pujamap:favorites';

  function read() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(v) ? v.map(String) : [];
    } catch (e) {
      return [];
    }
  }
  function write(ids) {
    try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch (e) { /* private mode: ignore */ }
    window.dispatchEvent(new CustomEvent('pujamap:favorites-changed'));
  }

  let cache = read();
  const has = (id) => cache.includes(String(id));
  function toggle(id) {
    id = String(id);
    cache = has(id) ? cache.filter((x) => x !== id) : cache.concat(id);
    write(cache);
    return has(id);
  }
  function remove(id) {
    cache = cache.filter((x) => x !== String(id));
    write(cache);
  }

  PM.Favorites = { has, toggle, remove, list: () => cache.slice() };
})(window.PujaMap = window.PujaMap || {});
