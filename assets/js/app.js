/* PujaMap main controller: state, rendering, events */
(function (PM) {
  'use strict';
  const { esc, toast } = PM.UI;
  const { MapView, Puja, Favorites, Search, Location } = PM;

  const RADIUS_STEPS = [500, 1000, 2000, 5000, 10000, Infinity];
  const state = {
    pujas: [], visible: [], distances: new Map(),
    userLoc: null, radius: Infinity, query: '', sort: 'nearest', favOnly: false,
    selectedId: null, locating: false, loaded: false, loadFailed: false
  };
  const $ = (id) => document.getElementById(id);
  const els = {};
  const isMobile = () => window.matchMedia('(max-width: 991.98px)').matches;
  const byId = (id) => state.pujas.find((p) => p.id === String(id));
  const distOf = (p) => (state.distances.has(p.id) ? state.distances.get(p.id) : null);
  const bnNum = (n) => { try { return n.toLocaleString('bn-BD'); } catch (e) { return String(n); } };

  /* ---------- data derivation ---------- */
  function recomputeDistances() {
    state.distances.clear();
    if (!state.userLoc) return;
    state.pujas.forEach((p) => state.distances.set(
      p.id, PM.calculateDistance(state.userLoc.lat, state.userLoc.lng, p.latitude, p.longitude)));
  }

  function compute() {
    let list = state.pujas.filter((p) => Search.matches(p, state.query));
    if (state.favOnly) list = list.filter((p) => Favorites.has(p.id));
    if (state.userLoc && isFinite(state.radius)) list = list.filter((p) => distOf(p) <= state.radius);

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
    list.sort(sorters[state.sort] || byNearest);
    return list.map((p) => ({ p, d: distOf(p) }));
  }

  /* ---------- rendering ---------- */
  function render(opts) {
    opts = opts || {};
    state.visible = compute();
    els.list.innerHTML = state.visible.map(({ p, d }) => Puja.cardHTML(p, { distance: d })).join('');
    highlightCard(state.selectedId, false);
    MapView.sync(state.visible.map((v) => v.p));
    renderEmpty();
    els.count.textContent = state.loaded ? bnNum(state.visible.length) + 'টি পূজা পাওয়া গেছে' : '';
    els.title.textContent = state.userLoc ? 'কাছের পূজা' : 'পূজার তালিকা';
    els.hint.hidden = !!state.userLoc;
    els.favToggle.setAttribute('aria-pressed', String(state.favOnly));
    els.favToggle.classList.toggle('active', state.favOnly);
    els.chips.querySelectorAll('.chip').forEach((c) => {
      const on = (c.dataset.radius === 'all' ? Infinity : Number(c.dataset.radius)) === state.radius;
      c.classList.toggle('active', on);
      c.setAttribute('aria-pressed', String(on));
    });
    if (opts.fit) fitVisible();
  }

  function renderEmpty() {
    let html = '';
    if (state.loadFailed) {
      html = '<p>পূজার তথ্য লোড করা যায়নি। ইন্টারনেট সংযোগ দেখে পেজটি রিফ্রেশ করুন।</p>';
    } else if (state.loaded && !state.pujas.length) {
      html = '<p>এখনো কোনো পূজার তথ্য যোগ করা হয়নি।</p>';
    } else if (state.loaded && !state.visible.length) {
      const radiusOn = state.userLoc && isFinite(state.radius);
      if (state.query) html = '<p>কোনো পূজা পাওয়া যায়নি।</p>';
      else if (radiusOn) html = '<p>এই এলাকায় এখনো কোনো পূজার তথ্য পাওয়া যায়নি।</p>';
      else if (state.favOnly) html = '<p>আপনার কোনো পছন্দের পূজা সংরক্ষণ করা হয়নি।</p>';
      else html = '<p>কোনো পূজা পাওয়া যায়নি।</p>';
      html += '<div class="empty__btns">' +
        (radiusOn ? '<button type="button" class="btn btn-sm btn-pm-outline" data-action="widen">বড় এলাকা দেখুন</button>' : '') +
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

  /* ---------- map camera helpers ---------- */
  function pad() {
    return isMobile()
      ? { topLeft: [30, 120], bottomRight: [30, 40] }
      : { topLeft: [40, 40], bottomRight: [40, 40] };
  }
  function fitVisible() {
    const pts = state.visible.map((v) => [v.p.latitude, v.p.longitude]);
    if (state.userLoc && isFinite(state.radius)) pts.push([state.userLoc.lat, state.userLoc.lng]);
    MapView.fitTo(pts, pad());
  }
  function resetMap() {
    closeQuick(); closeDetail();
    const pts = state.pujas.map((p) => [p.latitude, p.longitude]);
    if (state.userLoc) pts.push([state.userLoc.lat, state.userLoc.lng]);
    MapView.fitTo(pts, pad());
  }

  /* ---------- location ---------- */
  function showLoading(on) { els.loading.hidden = !on; }
  function hideWelcome() { els.welcome.hidden = true; }

  async function locate() {
    if (state.locating) return;
    state.locating = true;
    showLoading(true);
    try {
      const pos = await Location.request();
      state.userLoc = { lat: pos.lat, lng: pos.lng };
      recomputeDistances();
      MapView.setUser(pos.lat, pos.lng);
      hideWelcome();
      render();
      const near = state.visible.filter((v) => v.d != null).sort((a, b) => a.d - b.d).slice(0, 3);
      const pts = [[pos.lat, pos.lng]].concat(near.filter((n) => n.d <= 3000).map((n) => [n.p.latitude, n.p.longitude]));
      if (pts.length > 1) MapView.fitTo(pts, pad()); else MapView.flyToUser(state.userLoc);
      els.locateBtn.classList.add('is-active');
      refreshOpenPanels();
      toast(Location.MESSAGES.success);
    } catch (err) {
      hideWelcome();
      toast((err && err.message) || Location.MESSAGES.unavailable, 5200);
    } finally {
      state.locating = false;
      showLoading(false);
    }
  }

  /* ---------- detail / quick ---------- */
  function pujaUrl(id) { return location.href.split('#')[0] + '#puja-' + id; }

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
    els.detail.innerHTML = Puja.detailHTML(p, { distance: distOf(p), saved: Favorites.has(p.id) });
    const sc = els.detail.querySelector('.detail__scroll');
    if (sc) sc.scrollTop = top;
  }

  function openDetail(id) {
    const p = byId(id);
    if (!p) { toast('এই পূজার তথ্য পাওয়া যায়নি।'); return; }
    state.selectedId = p.id;
    closeQuick();
    MapView.closePopup();
    renderDetail(p.id);
    els.detail.hidden = false;
    MapView.setSelected(p.id);
    highlightCard(p.id, true);
    if (!isMobile()) MapView.flyToPuja(p, { x: 208 });
    history.replaceState(null, '', '#puja-' + p.id);
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
    if (isMobile()) {
      if (!els.detail.hidden) { renderDetail(p.id); return; }
      openQuick(p.id);
      MapView.flyToPuja(p, { y: 110 });
    } else {
      if (!els.detail.hidden) { openDetail(p.id); return; }
      MapView.openPopup(p, Puja.popupHTML(p, distOf(p)));
    }
  }

  /* ---------- share / save ---------- */
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (err) { /* ignore */ }
      ta.remove();
    }
    toast('Link copied!');
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
      try { await navigator.share(data); } catch (err) { if (err && err.name !== 'AbortError') copyText(url); }
    } else {
      copyText(url);
    }
  }

  function toggleSave(id) {
    const saved = Favorites.toggle(id);
    toast(saved ? 'পছন্দের তালিকায় যোগ হয়েছে' : 'পছন্দের তালিকা থেকে সরানো হয়েছে');
  }

  /* ---------- panel ---------- */
  function expandPanel(force) {
    const on = typeof force === 'boolean' ? force : !els.panel.classList.contains('expanded');
    els.panel.classList.toggle('expanded', on);
    els.handle.setAttribute('aria-expanded', String(on));
    if (on) els.scroll.scrollTop = 0;
  }

  /* ---------- events ---------- */
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
        case 'close-quick': closeQuick(); state.selectedId = null; MapView.setSelected(null); highlightCard(null); break;
        case 'share': share(id); break;
        case 'save': toggleSave(id); break;
        case 'locate': case 'find-nearby': locate(); break;
        case 'reset': resetMap(); break;
        case 'zoom-in': MapView.zoomIn(); break;
        case 'zoom-out': MapView.zoomOut(); break;
        case 'expand': expandPanel(); break;
        case 'dismiss-welcome': hideWelcome(); toast('লোকেশন অনুমতি দিলে আপনার কাছাকাছি পূজা দেখানো হবে।', 4200); break;
        case 'toggle-fav': state.favOnly = !state.favOnly; render({ fit: true }); break;
        case 'widen': {
          const next = RADIUS_STEPS.find((r) => r > state.radius);
          state.radius = next == null ? Infinity : next;
          render({ fit: true });
          break;
        }
        case 'reset-filters':
          state.radius = Infinity; state.query = ''; state.favOnly = false; els.search.value = '';
          render({ fit: true });
          break;
        case 'install': break;
        default: break;
      }
    });

    els.chips.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      state.radius = chip.dataset.radius === 'all' ? Infinity : Number(chip.dataset.radius);
      if (isFinite(state.radius) && !state.userLoc) {
        toast('দূরত্ব ফিল্টারের জন্য আপনার লোকেশন দরকার।');
        locate();
      }
      render({ fit: true });
    });

    els.search.addEventListener('input', Search.debounce(() => {
      state.query = els.search.value;
      render({ fit: !!state.query.trim() });
    }, 120));
    els.searchForm.addEventListener('submit', (e) => e.preventDefault());

    els.sort.addEventListener('change', () => { state.sort = els.sort.value; render(); });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!els.detail.hidden) closeDetail();
      else if (!els.quick.hidden) closeQuick();
      else MapView.closePopup();
    });

    window.addEventListener('pujamap:favorites-changed', () => {
      if (state.favOnly) render();
      refreshOpenPanels();
    });

    window.addEventListener('hashchange', routeFromHash);
    window.matchMedia('(max-width: 991.98px)').addEventListener('change', () => {
      closeQuick(); MapView.closePopup(); setTimeout(MapView.invalidate, 50);
    });

    const menu = $('menu');
    if (menu) menu.addEventListener('click', (e) => {
      const link = e.target.closest('a[href$="#nearby"]');
      if (!link) return;
      const oc = window.bootstrap && bootstrap.Offcanvas.getInstance(menu);
      if (oc) oc.hide();
      setTimeout(() => expandPanel(true), 50);
    });

    // PWA install button
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
  async function init() {
    [
      'list', 'empty', 'count', 'hint', 'search', 'sort', 'chips', 'favToggle', 'quick', 'detail',
      'loading', 'welcome', 'panel', 'handle', 'scroll', 'mapError', 'locateBtn', 'searchForm'
    ].forEach((id) => { els[id] = $(id); });
    els.title = $('listTitle');
    els.list = $('pujaList');
    els.empty = $('emptyState');
    els.count = $('resultCount');
    els.hint = $('locHint');
    els.search = $('searchInput');
    els.sort = $('sortSelect');
    els.chips = $('chips');
    els.panel = $('nearby');
    els.handle = $('sheetHandle');
    els.scroll = $('listScroll');

    bindEvents();
    els.list.innerHTML = '<p class="list-loading">পূজার তথ্য লোড হচ্ছে…</p>';

    try {
      MapView.init($('map'), {
        onMarkerClick,
        onMapClick: () => {
          if (isMobile() && !els.quick.hidden) { closeQuick(); state.selectedId = null; MapView.setSelected(null); highlightCard(null); }
        },
        onTileError: () => toast('মানচিত্রের টাইল লোড হচ্ছে না। ইন্টারনেট সংযোগ দেখুন।', 5000)
      });
    } catch (err) {
      console.warn('PujaMap: map failed to start', err);
      els.mapError.hidden = false;
      els.welcome.hidden = true;
    }

    try {
      state.pujas = await Puja.load();
    } catch (err) {
      console.warn('PujaMap: data failed to load', err);
      state.loadFailed = true;
    }
    state.loaded = true;
    render();
    if (!state.loadFailed && !location.hash) resetMapSoft();
    routeFromHash();

    if ((await Location.permissionState()) === 'granted') locate();
  }

  // initial framing: fit all Puja markers (no user location yet)
  function resetMapSoft() {
    MapView.fitTo(state.pujas.map((p) => [p.latitude, p.longitude]), pad());
  }

  document.addEventListener('DOMContentLoaded', init);
})(window.PujaMap = window.PujaMap || {});
