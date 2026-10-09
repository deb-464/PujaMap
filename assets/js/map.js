/* Leaflet map: tiles, clustered Puja markers, user marker, camera moves */
(function (PM) {
  'use strict';

  let map = null;
  let markerLayer = null;
  let userMarker = null;
  let selectedId = null;
  let tileErrorShown = false;
  const markers = new Map();

  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const pinIcon = () => L.divIcon({
    className: 'pm-pin-wrap',
    html: '<div class="pm-pin"><span>🛕</span></div>',
    iconSize: [38, 38],
    iconAnchor: [19, 46],
    popupAnchor: [0, -44]
  });

  function createLayer() {
    // Group nearby pins into numbered clusters (if the plugin loaded), otherwise plain layer.
    if (typeof L.markerClusterGroup === 'function') {
      return L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 44,
        disableClusteringAtZoom: 16,
        spiderfyOnMaxZoom: true,
        iconCreateFunction: (cluster) => L.divIcon({
          className: 'pm-cluster-wrap',
          html: '<div class="pm-cluster" aria-label="' + cluster.getChildCount() + 'টি পূজা">' + cluster.getChildCount() + '</div>',
          iconSize: [42, 42]
        })
      });
    }
    return L.layerGroup();
  }

  function moveTo(latlng, zoom) {
    if (reduceMotion()) map.setView(latlng, zoom, { animate: false });
    else map.flyTo(latlng, zoom, { duration: 0.6 });
  }

  function init(el, handlers) {
    if (typeof L === 'undefined') throw new Error('Leaflet not loaded');
    const cfg = PM.CONFIG;
    map = L.map(el, { zoomControl: false, zoomSnap: 0.5 }).setView(cfg.DEFAULT_CENTER, cfg.DEFAULT_ZOOM);
    map._pmHandlers = handlers;
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    }).addTo(map);
    tiles.on('tileerror', () => {
      if (tileErrorShown) return;
      tileErrorShown = true;
      if (handlers.onTileError) handlers.onTileError();
    });
    tiles.on('tileload', () => { tileErrorShown = false; });
    markerLayer = createLayer().addTo(map);
    map.on('click', () => { if (handlers.onMapClick) handlers.onMapClick(); });
  }

  function sync(pujas) {
    if (!map) return;
    const keep = new Set(pujas.map((p) => p.id));
    const remove = [];
    markers.forEach((m, id) => { if (!keep.has(id)) { remove.push(m); markers.delete(id); } });
    if (remove.length) markerLayer.removeLayers ? markerLayer.removeLayers(remove) : remove.forEach((m) => markerLayer.removeLayer(m));
    const add = [];
    pujas.forEach((p) => {
      if (markers.has(p.id)) return;
      const label = PM.Puja.title(p);
      const m = L.marker([p.latitude, p.longitude], { icon: pinIcon(), title: label, alt: label, riseOnHover: true });
      m.on('click', () => { if (map._pmHandlers.onMarkerClick) map._pmHandlers.onMarkerClick(p.id); });
      markers.set(p.id, m);
      add.push(m);
    });
    if (add.length) markerLayer.addLayers ? markerLayer.addLayers(add) : add.forEach((m) => markerLayer.addLayer(m));
    setSelected(selectedId);
  }

  function setSelected(id) {
    selectedId = id;
    markers.forEach((m, mid) => {
      const el = m.getElement && m.getElement(); // null while hidden inside a cluster
      if (el) el.classList.toggle('is-selected', mid === id);
      m.setZIndexOffset(mid === id ? 1000 : 0);
    });
  }

  function setUser(lat, lng) {
    if (!map) return;
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'pm-user-wrap',
        html: '<div class="pm-user"><span class="pm-user__pulse"></span><span class="pm-user__dot"></span></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      }),
      zIndexOffset: 2000,
      title: 'আপনার লোকেশন',
      alt: 'আপনার লোকেশন'
    }).addTo(map).bindPopup('আপনি এখানে আছেন');
  }

  /* opts.minZoom: if the fitted view would be zoomed out further than this, keep the default view instead */
  function fitTo(latlngs, pad, opts) {
    if (!map || !latlngs.length) return;
    pad = pad || {};
    opts = opts || {};
    if (latlngs.length === 1) { moveTo(latlngs[0], 15); return; }
    const bounds = L.latLngBounds(latlngs);
    if (opts.minZoom && map.getBoundsZoom(bounds) < opts.minZoom) {
      map.setView(PM.CONFIG.DEFAULT_CENTER, PM.CONFIG.DEFAULT_ZOOM, { animate: false });
      return;
    }
    map.fitBounds(bounds, {
      paddingTopLeft: pad.topLeft || [40, 40],
      paddingBottomRight: pad.bottomRight || [40, 40],
      maxZoom: 16,
      animate: !reduceMotion()
    });
  }

  function anyInView(latlngs) {
    if (!map) return true;
    const b = map.getBounds();
    return latlngs.some((ll) => b.contains(ll));
  }

  function flyToUser(user) { if (map) moveTo([user.lat, user.lng], 15); }

  function flyToPuja(p, offset) {
    if (!map) return;
    offset = offset || {};
    const z = Math.max(map.getZoom(), 16); // ≥16 so the pin is out of any cluster
    const pt = map.project([p.latitude, p.longitude], z).add([offset.x || 0, offset.y || 0]);
    moveTo(map.unproject(pt, z), z);
  }

  function openPopup(p, html) {
    if (!map) return;
    L.popup({ offset: [0, -2], autoPanPadding: [30, 80] })
      .setLatLng([p.latitude, p.longitude])
      .setContent(html)
      .openOn(map);
  }

  const closePopup = () => map && map.closePopup();
  const zoomIn = () => map && map.zoomIn();
  const zoomOut = () => map && map.zoomOut();
  const invalidate = () => map && map.invalidateSize();

  PM.MapView = { init, sync, setSelected, setUser, fitTo, anyInView, flyToUser, flyToPuja, openPopup, closePopup, zoomIn, zoomOut, invalidate };
})(window.PujaMap = window.PujaMap || {});
