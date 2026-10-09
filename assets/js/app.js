/* PujaMap main controller: state, rendering, events (index.html) */
(function (PM) {
  'use strict';
  const { toast } = PM.UI;
  const { MapView, Puja, Favorites, Search, Location } = PM;

  const RADIUS_STEPS = [500, 1000, 2000, 5000, 10000, Infinity];
  const state = {
    pujas: [], visible: [], distances: new Map(),
    userLoc: null, locError: '',
    radius: Infinity, query: '', sort: 'name', sortTouched: false, favOnly: false,
    selectedId: null, lastFocus: null,
    locating: false, loaded: false, loadFailed: false
  };
  const $ = (id) => document.getElementById(id);
  const els = {};
  const mqMobile = window.matchMedia('(max-width: 991.98px)');
  const isMobile = () => mqMobile.matches;
  const byId = (id) => state.pujas.find((p) => p.id === String(id));
  const distOf = (p) => (state.distances.has(p.id) ? state.distances.get(p.id) : null);
  const radiusActive = () => !!state.userLoc && isFinite(state.radius);
  const filtersActive = () => !!state.query.trim() || radiusActive() || state.favOnly;
  const bnNum = (n) => { try { return n.toLocaleString('bn-BD'); } catch (e) { return String(n); } };

  /* ---------- derived data ---------- */
  function recomputeDistances() {
    state.distances.clear();
    if (!state.userLoc) return;
    state.pujas.forEach((p) => state.distances.set(
      p.id, PM.calculateDistance(state.userLoc.lat, state.userLoc.lng, p.latitude, p.longitude)));
  }

  function compute() {
    let list = state.pujas.filter((p) => Search.matches(p, state.query));
    if (state.favOnly) list = list.filter((p) => Favorites.has(p.id));
    if (radiusActive()) list = list.filter((p) => distOf(p) <= state.radius);

    const byName = (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
    const byNearest = (a, b) => {
      const da = distOf(a), db = distOf(b);
      return da != null && db != null ? da - db : byName(a, b);
    };
    const sorters = {
      nearest: byNearest,
      name: byName,
      name_bn: (a, b) => (a.name_bn || a.name).localeCompare(b.name_bn || b.name, 'bn'),
      verified: (a, b) => (Number(b.verified) - Number(a.verified)) || byNearest(a, b)
    };
    list.sort(sorters[state.sort] || byName);
    return list.map((p) => ({ p, d: distOf(p) }));
  }

  /* ---------- rendering ---------- */
  // fit: 'always' = move map to results (explicit search), 'smart' = only if no result is on screen
  function render(fit) {
    state.visible = compute();
    els.list.innerHTML = state.visible.map(({ p, d }) =>
      Puja.cardHTML(p, { distance: d, saved: Favorites.has(p.id) })).join('');
    highlightCard(state.selectedId, false);
    MapView.sync(state.visible.map((v) => v.p));
    renderEmpty();
    updateChrome();
    if (fit === 'always') fitVisible();
    else if (fit === 'smart') {
      const pts = state.visible.map((v) => [v.p.latitude, v.p.longitude]);
      if (pts.length && !MapView.anyInView(pts)) fitVisible();
    }
  }

  function updateChrome() {
    els.count.textContent = state.loaded ? bnNum(state.visible.length) + 'টি পূজা পাওয়া গেছে' : '';
    els.title.textContent = state.userLoc ? 'কাছের পূজা' : 'পূজার তালিকা';
    els.favToggle.setAttribute('aria-pressed', String(state.favOnly));
    els.favToggle.textContent = state.favOnly ? '❤️' : '🤍';
    els.resetBtn.hidden = !filtersActive();
    els.clear.hidden = !els.search.value;
    els.chips.querySelectorAll('.chip').forEach((c) => {
      const on = (c.dataset.radius === 'all' ? Infinity : Number(c.dataset.radius)) === state.radius;
      c.classList.toggle('active', on);
      c.setAttribute('aria-pressed', String(on));
    });
    // "Nearest" only makes sense with a real location
    const nearestOpt = els.sort.querySelector('option[value="nearest"]');
    nearestOpt.disabled = !state.userLoc;
    nearestOpt.textContent = state.userLoc ? 'Nearest' : 'Nearest (লোকেশন লাগবে)';
    if (!state.userLoc && state.sort === 'nearest') state.sort = 'name';
    els.sort.value = state.sort;
    // location hint
    els.hint.hidden = !!state.userLoc;
    els.hint.classList.toggle('is-alert', !!state.locError);
    els.hintText.textContent = state.locError || 'লোকেশন অনুমতি দিলে আপনার কাছাকাছি পূজা দেখানো হবে।';
    els.hintRetry.hidden = !state.locError;
  }

  function renderEmpty() {
    let html = '';
    if (state.loadFailed) {
      html = '<p>পূজার তথ্য লোড করা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।</p>' +
        '<button type="button" class="btn btn-sm btn-pm" data-action="reload-data">আবার চেষ্টা করুন</button>';
    } else if (state.loaded && !state.pujas.length) {
      html = '<p>এখনো কোনো পূজার তথ্য যোগ করা হয়নি।</p>';
    } else if (state.loaded && !state.visible.length) {
      const widenable = radiusActive();
      if (state.query.trim()) html = '<p>কোনো পূজা পাওয়া যায়নি।</p>';
      else if (widenable) html = '<p>এই এলাকায় এখনো কোনো পূজার তথ্য পাওয়া যায়নি।</p>';
      else if (state.favOnly) html = '<p>আপনার কোনো পছন্দের পূজা সংরক্ষণ করা হয়নি।</p>';
      else html = '<p>কোনো পূজা পাওয়া যায়নি।</p>';
      html += '<div class="empty__btns">' +
        (state.query.trim() ? '<button type="button" class="btn btn-sm btn-pm-outline" data-action="clear-search">সার্চ মুছুন</button>' : '') +
        (widenable ? '<button type="button" class="btn btn-sm btn-pm-outline" data-action="widen">বড় এলাকা দেখুন</button>' : '') +
        '<button type="button" class="btn btn-sm btn-pm" data-action="reset-filters">সব পূজা দেখুন</button></div>';
    }
    els.empty.innerHTML = html;
    els.empty.hidden = !html;
  }

  function highlightCard(id, scroll) {
    els.list.querySelectorAll('.puja-card.is-selected').forEach((c) => c.classList.remove('is-selected'));
    if (id == null) return;
    const card = els.list.querySelector('[data-id="' + CSS.escape(String(id)) + '"]');
    if (!card) return;
    card.classList.add('is-selected');
    if (scroll && card.scrollIntoView) card.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }

  function updateFavMarks() {
    els.list.querySelectorAll('.puja-card').forEach((c) => {
      const m = c.querySelector('.fav-mark');
      if (m) m.hidden = !Favorites.has(c.dataset.id);
    });
  }

  /* ---------- map camera ---------- */
  const pad = () => (isMobile()
    ? { topLeft: [30, 70], bottomRight: [60, 30] }
    : { topLeft: [40, 40], bottomRight: [40, 40] });

  function fitVisible() {
    const pts = state.visible.map((v) => [v.p.latitude, v.p.longitude]);
    if (radiusActive()) pts.push([state.userLoc.lat, state.userLoc.lng]);
    MapView.fitTo(pts, pad());
  }

  function resetMap() {
    closeQuick(); closeDetail();
    const pts = state.pujas.map((p) => [p.latitude, p.longitude]);
    if (state.userLoc) pts.push([state.userLoc.lat, state.userLoc.lng]);
    MapView.fitTo(pts, pad());
  }

  /* ---------- location ---------- */
  const showLoading = (on) => { els.loading.hidden = !on; };
  const hideWelcome = () => { els.welcome.hidden = true; };

  function frameUser() {
    const user = [state.userLoc.lat, state.userLoc.lng];
    const near = state.visible.filter((v) => v.d != null).sort((a, b) => a.d - b.d);
    const close = near.filter((n) => n.d <= 3000).slice(0, 3);
    if (close.length) {
      MapView.fitTo([user].concat(close.map((n) => [n.p.latitude, n.p.longitude])), pad());
      return Location.MESSAGES.success;
    }
    if (near.length && near[0].d <= 50000) {
      MapView.fitTo([user, [near[0].p.latitude, near[0].p.longitude]], pad());
      return 'আপনার ৩ কিমির মধ্যে কোনো পূজার তথ্য নেই। সবচেয়ে কাছেরটি ' + PM.formatDistance(near[0].d) + ' দূরে।';
    }
    MapView.flyToUser(state.userLoc);
    return near.length ? 'আপনার কাছাকাছি কোনো পূজার তথ্য নেই।' : Location.MESSAGES.success;
  }

  async function locate(auto) {
    if (state.locating) return false;
    state.locating = true;
    hideWelcome();
    showLoading(true);
    els.locateBtn.setAttribute('aria-busy', 'true');
    try {
      const pos = await Location.request({ cached: auto === true });
      state.userLoc = { lat: pos.lat, lng: pos.lng };
      state.locError = '';
      recomputeDistances();
      MapView.setUser(pos.lat, pos.lng);
      if (!state.sortTouched) state.sort = 'nearest';
      render();
      els.locateBtn.classList.add('is-active');
      refreshOpenPanels();
      toast(frameUser(), 5000);
      return true;
    } catch (err) {
      const msg = (err && err.message) || Location.MESSAGES.unavailable;
      if (!state.userLoc) state.locError = msg;
      updateChrome();
      toast(msg, 5500);
      return false;
    } finally {
      state.locating = false;
      showLoading(false);
      els.locateBtn.removeAttribute('aria-busy');
    }
  }

  /* ---------- detail / quick sheets ---------- */
  const pujaUrl = (id) => location.href.split('#')[0] + '#puja-' + encodeURIComponent(id);

  function openQuick(id) {
    const p = byId(id);
    if (!p) return;
    els.quick.innerHTML = Puja.quickHTML(p, distOf(p));
    els.quick.hidden = false;
  }
  function closeQuick() { els.quick.hidden = true; }

  function renderDetail(id) {
    const p = byId(id);
    if (!p) return;
    const prev = els.detail.querySelector('.detail__scroll');
    const top = prev ? prev.scrollTop : 0;
    els.detail.innerHTML = Puja.detailHTML(p, { distance: distOf(p), saved: Favorites.has(p.id), hasLocation: !!state.userLoc });
    const sc = els.detail.querySelector('.detail__scroll');
    if (sc) sc.scrollTop = top;
  }

  function clearFilters() {
    state.radius = Infinity; state.query = ''; state.favOnly = false; els.search.value = '';
  }

  function openDetail(id) {
    const p = byId(id);
    if (!p) { toast('এই পূজার তথ্য পাওয়া যায়নি।'); return; }
    // a filtered-out Puja has no marker: clear filters so map, list and panel agree
    if (!state.visible.some((v) => v.p.id === p.id)) { clearFilters(); render(); }
    if (els.detail.hidden) state.lastFocus = document.activeElement;
    state.selectedId = p.id;
    closeQuick();
    MapView.closePopup();
    renderDetail(p.id);
    els.detail.hidden = false;
    MapView.setSelected(p.id);
    highlightCard(p.id, true);
    if (!isMobile()) MapView.flyToPuja(p, { x: 208 });
    history.replaceState(null, '', '#puja-' + encodeURIComponent(p.id));
    const close = els.detail.querySelector('[data-action="close-detail"]');
    if (close) close.focus({ preventScroll: true });
  }

  function closeDetail() {
    if (els.detail.hidden) return;
    els.detail.hidden = true;
    state.selectedId = null;
    MapView.setSelected(null);
    highlightCard(null);
    if (/^#puja-/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
    const f = state.lastFocus;
    state.lastFocus = null;
    if (f && f.focus && document.contains(f)) f.focus({ preventScroll: true });
  }

  function deselect() {
    state.selectedId = null; MapView.setSelected(null); highlightCard(null);
  }

  function refreshOpenPanels() {
    if (!els.detail.hidden && state.selectedId) renderDetail(state.selectedId);
    if (!els.quick.hidden && state.selectedId) openQuick(state.selectedId);
  }

  function onMarkerClick(id) {
    const p = byId(id);
    if (!p) return;
    state.selectedId = p.id;
    MapView.setSelected(p.id);
    highlightCard(p.id, true);
    if (!els.detail.hidden) { renderDetail(p.id); history.replaceState(null, '', '#puja-' + encodeURIComponent(p.id)); return; }
    if (isMobile()) {
      openQuick(p.id);
      MapView.flyToPuja(p, { y: 90 });
    } else {
      MapView.openPopup(p, Puja.popupHTML(p, distOf(p)));
    }
  }

  /* ---------- share / save ---------- */
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  async function share(id) {
    const p = byId(id);
    if (!p) return;
    const url = pujaUrl(p.id);
    const data = {
      title: 'Check out this Durga Puja on PujaMap',
      text: Puja.title(p) + ' — ' + (p.address || p.location || ''),
      url
    };
    if (navigator.share) {
      try { await navigator.share(data); return; } catch (err) { if (err && err.name === 'AbortError') return; }
    }
    toast((await copyText(url)) ? 'Link copied!' : 'লিংক কপি করা যায়নি। ঠিকানা বারের লিংকটি কপি করুন।', 4500);
  }

  function toggleSave(id) {
    const saved = Favorites.toggle(id);
    toast(saved ? 'পছন্দের তালিকায় যোগ হয়েছে' : 'পছন্দের তালিকা থেকে সরানো হয়েছে');
  }

  /* ---------- sheet panel ---------- */
  function expandPanel(force) {
    const on = typeof force === 'boolean' ? force : !els.panel.classList.contains('expanded');
    els.panel.classList.toggle('expanded', on);
    els.handle.setAttribute('aria-expanded', String(on));
    if (on) els.scroll.scrollTop = 0;
  }

  /* ---------- events ---------- */
  function applyChip(chip) {
    const radius = chip.dataset.radius === 'all' ? Infinity : Number(chip.dataset.radius);
    state.radius = radius;
    if (isFinite(radius) && !state.userLoc) {
      render();
      locate().then((ok) => {
        if (!ok) { state.radius = Infinity; render(); } // never leave a filter "on" that cannot work
      });
      return;
    }
    render('smart');
  }

  function bindEvents() {
    document.addEventListener('click', (e) => {
      const card = e.target.closest('.puja-card[data-id]');
      const btn = e.target.closest('[data-action]');
      const action = btn ? btn.dataset.action : card ? 'view' : null;
      if (!action) return;
      const id = (btn && btn.dataset.id) || (card && card.dataset.id);
      switch (action) {
        case 'view': openDetail(id); break;
        case 'close-detail': closeDetail(); break;
        case 'close-quick': closeQuick(); deselect(); break;
        case 'share': share(id); break;
        case 'save': toggleSave(id); break;
        case 'locate': case 'find-nearby': locate(false); break;
        case 'reset': resetMap(); break;
        case 'zoom-in': MapView.zoomIn(); break;
        case 'zoom-out': MapView.zoomOut(); break;
        case 'expand': expandPanel(); break;
        case 'dismiss-welcome': hideWelcome(); break;
        case 'toggle-fav': state.favOnly = !state.favOnly; render('smart'); break;
        case 'clear-search':
          els.search.value = ''; state.query = ''; render('smart'); els.search.focus();
          break;
        case 'widen': {
          const next = RADIUS_STEPS.find((r) => r > state.radius);
          state.radius = next == null ? Infinity : next;
          render('smart');
          break;
        }
        case 'reset-filters': clearFilters(); render('smart'); break;
        case 'reload-data': loadData(); break;
        default: break;
      }
    });

    els.chips.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (chip) applyChip(chip);
    });

    const runSearch = Search.debounce(() => {
      state.query = els.search.value;
      render(state.query.trim() ? 'always' : 'smart');
    }, 120);
    els.search.addEventListener('input', () => { els.clear.hidden = !els.search.value; runSearch(); });
    els.searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      state.query = els.search.value;
      render('always');
      if (state.visible.length === 1) openDetail(state.visible[0].p.id);
      else if (state.visible.length > 1 && isMobile()) { expandPanel(true); els.search.blur(); }
    });

    els.sort.addEventListener('change', () => { state.sort = els.sort.value; state.sortTouched = true; render(); });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!els.detail.hidden) closeDetail();
      else if (!els.quick.hidden) { closeQuick(); deselect(); }
      else MapView.closePopup();
    });

    window.addEventListener('pujamap:favorites-changed', () => {
      if (state.favOnly) render('smart'); else updateFavMarks();
      refreshOpenPanels();
    });
    window.addEventListener('hashchange', routeFromHash);
    mqMobile.addEventListener('change', () => {
      closeQuick(); MapView.closePopup(); setTimeout(MapView.invalidate, 60);
    });

    const menu = $('menu');
    if (menu) menu.addEventListener('click', (e) => {
      if (!e.target.closest('a[href$="#nearby"]')) return;
      const oc = window.bootstrap && bootstrap.Offcanvas.getInstance(menu);
      if (oc) oc.hide();
      setTimeout(() => expandPanel(true), 50);
    });

    // PWA install button (only shown if the browser offers it)
    let deferred = null;
    const installBtn = $('installBtn');
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault(); deferred = e;
      if (installBtn) installBtn.hidden = false;
    });
    if (installBtn) installBtn.addEventListener('click', async () => {
      if (!deferred) return;
      deferred.prompt();
      await deferred.userChoice.catch(() => {});
      deferred = null; installBtn.hidden = true;
    });
  }

  function routeFromHash() {
    const m = /^#puja-(.+)$/.exec(location.hash);
    if (m) { openDetail(decodeURIComponent(m[1])); return; }
    if (location.hash === '#nearby') { expandPanel(true); return; }
    if (!els.detail.hidden) closeDetail();
  }

  /* ---------- start ---------- */
  async function loadData() {
    state.loaded = false; state.loadFailed = false;
    els.list.innerHTML = '<p class="list-loading">পূজার তথ্য লোড হচ্ছে…</p>';
    els.empty.hidden = true;
    try {
      state.pujas = await Puja.load();
    } catch (err) {
      console.warn('PujaMap: data failed to load', err);
      state.loadFailed = true;
    }
    state.loaded = true;
    recomputeDistances();
    render();
    if (!state.loadFailed && !location.hash && !state.userLoc) {
      MapView.fitTo(state.pujas.map((p) => [p.latitude, p.longitude]), pad(), { minZoom: 12 });
    }
    routeFromHash();
  }

  async function init() {
    const ids = {
      list: 'pujaList', empty: 'emptyState', count: 'resultCount', title: 'listTitle', hint: 'locHint',
      hintText: 'locHintText', hintRetry: 'locRetry', search: 'searchInput', searchForm: 'searchForm',
      clear: 'searchClear', resetBtn: 'resetBtn', sort: 'sortSelect', chips: 'chips', favToggle: 'favToggle',
      quick: 'quick', detail: 'detail', loading: 'loading', welcome: 'welcome', panel: 'nearby',
      handle: 'sheetHandle', scroll: 'listScroll', mapError: 'mapError', locateBtn: 'locateBtn'
    };
    Object.keys(ids).forEach((k) => { els[k] = $(ids[k]); });
    bindEvents();

    try {
      MapView.init($('map'), {
        onMarkerClick,
        onMapClick: () => { if (isMobile() && !els.quick.hidden) { closeQuick(); deselect(); } },
        onTileError: () => toast('মানচিত্রের টাইল লোড হচ্ছে না। ইন্টারনেট সংযোগ দেখুন।', 5000)
      });
    } catch (err) {
      console.warn('PujaMap: map failed to start', err);
      els.mapError.hidden = false;
      els.welcome.hidden = true;
    }

    await loadData();

    const perm = await Location.permissionState();
    if (perm === 'granted') locate(true);
    else if (perm === 'denied') {
      $('welcomeText').textContent = 'এই সাইটের জন্য লোকেশন বন্ধ আছে। ব্রাউজারের সাইট সেটিংস থেকে লোকেশন চালু করে আবার চেষ্টা করুন।';
      $('welcomeCta').textContent = '🔄 আবার চেষ্টা করুন';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})(window.PujaMap = window.PujaMap || {});
