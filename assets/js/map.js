/* Leaflet map: tiles, Puja markers, user marker, camera moves */
(function (PM) {
  'use strict';

  let map = null;
  let markerLayer = null;
  let userMarker = null;
  let selectedId = null;
  let tileErrorShown = false;
  const markers = new Map();

  const pinIcon = () => L.divIcon({
    className: 'pm-pin-wrap',
    html: '<div class="pm-pin"><span>🛕</span></div>',
    iconSize: [38, 38],
    iconAnchor: [19, 46],
    popupAnchor: [0, -44]
  });

  function init(el, handlers) {
    if (typeof L === 'undefined') throw new Error('Leaflet not loaded');
    const cfg = PM.CONFIG;
    map = L.map(el, { zoomControl: false, zoomSnap: 0.5 }).setView(cfg.DEFAULT_CENTER, cfg.DEFAULT_ZOOM);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    }).addTo(map);
    tiles.on('tileerror', () => {
      if (tileErrorShown) return;
      tileErrorShown = true;
      handlers.onTileError && handlers.onTileError();
    });
    markerLayer = L.layerGroup().addTo(map);
    map.on('click', () => handlers.onMapClick && handlers.onMapClick());
    map._pmHandlers = handlers;
  }

  function sync(pujas) {
    if (!map) return;
    const keep = new Set(pujas.map((p) => p.id));
    markers.forEach((m, id) => {
      if (!keep.has(id)) { markerLayer.removeLayer(m); markers.delete(id); }
    });
    pujas.forEach((p) => {
      if (markers.has(p.id)) return;
      const label = PM.Puja.title(p);
      const m = L.marker([p.latitude, p.longitude], { icon: pinIcon(), title: label, alt: label, riseOnHover: true });
      m.on('click', () => map._pmHandlers.onMarkerClick && map._pmHandlers.onMarkerClick(p.id));
      markerLayer.addLayer(m);
      markers.set(p.id, m);
    });
    setSelected(selectedId);
  }

  function setSelected(id) {
    selectedId = id;
    markers.forEach((m, mid) => {
      const el = m.getElement && m.getElement();
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
      zIndexOffset: 500,
      title: 'আপনার লোকেশন',
      alt: 'আপনার লোকেশন'
    }).addTo(map).bindPopup('আপনি এখানে আছেন');
  }

  function fitTo(latlngs, pad) {
    if (!map || !latlngs.length) return;
    pad = pad || {};
    if (latlngs.length === 1) {
      map.flyTo(latlngs[0], 15, { duration: 0.6 });
      return;
    }
    map.fitBounds(L.latLngBounds(latlngs), {
      paddingTopLeft: pad.topLeft || [40, 40],
      paddingBottomRight: pad.bottomRight || [40, 40],
      maxZoom: 16,
      animate: true
    });
  }

  function flyToUser(user, pad) {
    if (!map) return;
    map.flyTo([user.lat, user.lng], 15, { duration: 0.7 });
  }

  function flyToPuja(p, offset) {
    if (!map) return;
    offset = offset || {};
    const z = Math.max(map.getZoom(), 16);
    const pt = map.project([p.latitude, p.longitude], z).add([offset.x || 0, offset.y || 0]);
    map.flyTo(map.unproject(pt, z), z, { duration: 0.6 });
  }

  function openPopup(p, html) {
    if (!map) return;
    L.popup({ offset: [0, 0], autoPanPadding: [30, 80] })
      .setLatLng([p.latitude, p.longitude])
      .setContent(html)
      .openOn(map);
    // anchor popup above the pin tip
    const el = map.getContainer().querySelector('.leaflet-popup');
    if (el) el.style.marginBottom = '44px';
  }

  const closePopup = () => map && map.closePopup();
  const zoomIn = () => map && map.zoomIn();
  const zoomOut = () => map && map.zoomOut();
  const invalidate = () => map && map.invalidateSize();
  const ready = () => !!map;

  PM.MapView = { init, sync, setSelected, setUser, fitTo, flyToUser, flyToPuja, openPopup, closePopup, zoomIn, zoomOut, invalidate, ready };
})(window.PujaMap = window.PujaMap || {});
