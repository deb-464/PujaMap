/* Puja data loading, distance maths and HTML templates */
(function (PM) {
  'use strict';
  const { esc, safeUrl } = PM.UI;

  const CONFIG = {
    DATA_URL: 'data/pujas.csv', // CSV (or .json) file with all Puja records
    PLACEHOLDER: 'assets/images/placeholder.jpg',
    FORM_URL: 'YOUR_GOOGLE_FORM_URL', // replace with your Google Form link
    DEFAULT_CENTER: [22.3569, 91.7832], // Chattogram
    DEFAULT_ZOOM: 13
  };
  PM.CONFIG = CONFIG;

  /* ---------- distance ---------- */
  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // metres
    const rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(lat2 - lat1);
    const dLon = rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function formatDistance(meters) {
    if (meters == null || !isFinite(meters)) return '';
    if (meters < 1000) return Math.max(10, Math.round(meters / 10) * 10) + ' m';
    const km = meters / 1000;
    return (km >= 10 ? Math.round(km) : km.toFixed(1)) + ' km';
  }

  PM.calculateDistance = calculateDistance;
  PM.formatDistance = formatDistance;
  window.calculateDistance = calculateDistance;

  /* ---------- data ---------- */
  function isValidCoord(lat, lng) {
    return Number.isFinite(lat) && Number.isFinite(lng) &&
      Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
  }

  function str(v) { return typeof v === 'string' ? v.trim() : ''; }

  function normalize(raw, index) {
    if (!raw || typeof raw !== 'object') return null;
    const lat = Number(raw.latitude);
    const lng = Number(raw.longitude);
    if (!isValidCoord(lat, lng)) {
      console.warn('PujaMap: skipped record with invalid coordinates:', raw.id != null ? raw.id : index);
      return null;
    }
    const name = str(raw.name) || str(raw.name_bn);
    if (!name) return null;
    return {
      id: String(raw.id != null ? raw.id : index + 1),
      name,
      name_bn: str(raw.name_bn),
      location: str(raw.location),
      address: str(raw.address),
      latitude: lat,
      longitude: lng,
      description: str(raw.description),
      image: str(raw.image),
      category: str(raw.category),
      phone: str(raw.phone),
      facebook: str(raw.facebook),
      opening_time: str(raw.opening_time),
      closing_time: str(raw.closing_time),
      events: (Array.isArray(raw.events) ? raw.events : []).filter((e) => e && str(e.title)),
      facilities: (Array.isArray(raw.facilities) ? raw.facilities : []).map(str).filter(Boolean),
      verified: raw.verified === true,
      demo: raw.demo === true
    };
  }

  /* ---------- CSV parsing ---------- */
  // Handles quoted cells, commas/newlines inside quotes, "" escapes, UTF-8 BOM.
  function parseCSV(text) {
    text = String(text).replace(/^\uFEFF/, '');
    const rows = [];
    let row = [], cell = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
        } else cell += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.some((v) => v.trim() !== '')) rows.push(row);
        row = [];
      } else cell += c;
    }
    row.push(cell);
    if (row.some((v) => v.trim() !== '')) rows.push(row);
    return rows;
  }

  const truthy = (v) => /^(true|yes|1|y|হ্যাঁ)$/i.test(String(v || '').trim());
  const splitList = (v) => String(v || '').split('|').map((x) => x.trim()).filter(Boolean);

  // events cell format:  title~date~time | title2~date2~time2
  function parseEvents(v) {
    return splitList(v).map((item) => {
      const [title, date, time] = item.split('~').map((x) => x.trim());
      return { title: title || '', date: date || '', time: time || '' };
    });
  }

  function csvToRecords(text) {
    const rows = parseCSV(text);
    if (rows.length < 2) return [];
    const header = rows[0].map((h) => h.trim().toLowerCase());
    return rows.slice(1).map((cells) => {
      const o = {};
      header.forEach((h, i) => { o[h] = (cells[i] || '').trim(); });
      o.events = parseEvents(o.events);
      o.facilities = splitList(o.facilities);
      o.verified = truthy(o.verified);
      o.demo = truthy(o.demo);
      return o;
    });
  }

  async function load() {
    const res = await fetch(CONFIG.DATA_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    let rows;
    if (/\.json(\?|$)/i.test(CONFIG.DATA_URL)) {
      const json = await res.json();
      rows = Array.isArray(json) ? json : (json && json.pujas) || [];
    } else {
      rows = csvToRecords(await res.text());
    }
    const seen = new Set();
    return rows.map(normalize).filter((p) => {
      if (!p || seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }

  /* ---------- formatting ---------- */
  const title = (p) => p.name_bn || p.name;
  const subtitle = (p) => (p.name_bn && p.name !== p.name_bn ? p.name : '');
  const placeLine = (p) => p.location || p.address;
  const imgSrc = (p) => p.image || CONFIG.PLACEHOLDER;

  function directionsUrl(p) {
    return 'https://www.google.com/maps/dir/?api=1&destination=' + p.latitude + ',' + p.longitude;
  }

  function formatTime(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
    if (!m) return '';
    const h = Number(m[1]);
    return ((h + 11) % 12 + 1) + ':' + m[2] + ' ' + (h >= 12 ? 'PM' : 'AM');
  }

  function hoursText(p) {
    const o = formatTime(p.opening_time);
    const c = formatTime(p.closing_time);
    if (o && c) return o + ' – ' + c;
    if (o) return 'শুরু ' + o;
    if (c) return 'শেষ ' + c;
    return '';
  }

  function formatDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return str(iso);
    try {
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
        .toLocaleDateString('bn-BD', { day: 'numeric', month: 'long' });
    } catch (e) {
      return iso;
    }
  }

  const FACILITY_ICONS = {
    'parking': '🅿️', 'food zone': '🍲', 'toilet': '🚻', 'drinking water': '💧',
    'security': '🛡️', 'cultural program': '🎭', 'wheelchair access': '♿', 'emergency help': '🚑'
  };

  /* ---------- templates ---------- */
  function badges(p) {
    return (p.verified ? '<span class="pm-badge pm-badge--verified">✓ Verified</span>' : '') +
      (p.demo ? '<span class="pm-badge pm-badge--sample">নমুনা তথ্য</span>' : '');
  }

  function cardHTML(p, opts) {
    opts = opts || {};
    const dist = formatDistance(opts.distance);
    const sub = subtitle(p);
    const action = opts.href
      ? '<a class="btn btn-sm btn-pm-outline puja-card__view" href="' + esc(opts.href) + '">View</a>'
      : '<button type="button" class="btn btn-sm btn-pm-outline puja-card__view" data-action="view" data-id="' +
        esc(p.id) + '" aria-label="' + esc(title(p)) + ' — বিস্তারিত দেখুন">View</button>';
    const remove = opts.removable
      ? '<button type="button" class="btn btn-sm btn-link text-danger puja-card__remove" data-action="remove" data-id="' +
        esc(p.id) + '">সরান</button>'
      : '';
    return '<article class="puja-card" role="listitem" data-id="' + esc(p.id) + '">' +
      '<img class="puja-card__img" src="' + esc(imgSrc(p)) + '" alt="' + esc(title(p)) + '" loading="lazy" width="88" height="88">' +
      '<div class="puja-card__body">' +
        '<h3 class="puja-card__title">' + esc(title(p)) + '</h3>' +
        (sub ? '<p class="puja-card__sub">' + esc(sub) + '</p>' : '') +
        (placeLine(p) ? '<p class="puja-card__loc">📍 ' + esc(placeLine(p)) + '</p>' : '') +
        '<div class="puja-card__meta">' +
          (dist ? '<span class="puja-card__dist">📏 ' + esc(dist) + ' away</span>' : '') +
          badges(p) +
        '</div>' +
      '</div>' +
      '<div class="puja-card__actions">' + action + remove + '</div>' +
    '</article>';
  }

  function popupHTML(p, distance) {
    const dist = formatDistance(distance);
    return '<div class="pm-popup">' +
      '<strong>' + esc(title(p)) + '</strong>' +
      (dist ? '<div class="pm-popup__dist">📏 ' + esc(dist) + ' away</div>' : '') +
      (placeLine(p) ? '<div class="pm-popup__addr">📍 ' + esc(placeLine(p)) + '</div>' : '') +
      '<button type="button" class="btn btn-sm btn-pm mt-2" data-action="view" data-id="' + esc(p.id) + '">View Details</button>' +
    '</div>';
  }

  function quickHTML(p, distance) {
    const dist = formatDistance(distance);
    return '<button type="button" class="sheet-close" data-action="close-quick" aria-label="বন্ধ করুন">×</button>' +
      '<div class="quick__row">' +
        '<img src="' + esc(imgSrc(p)) + '" alt="' + esc(title(p)) + '" width="72" height="72">' +
        '<div class="quick__text">' +
          '<h3>' + esc(title(p)) + '</h3>' +
          (placeLine(p) ? '<p>📍 ' + esc(placeLine(p)) + '</p>' : '') +
          '<p class="puja-card__meta">' + (dist ? '<span class="puja-card__dist">📏 ' + esc(dist) + '</span>' : '') + badges(p) + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="quick__actions">' +
        '<a class="btn btn-pm" href="' + esc(directionsUrl(p)) + '" target="_blank" rel="noopener">🧭 Directions</a>' +
        '<button type="button" class="btn btn-pm-outline" data-action="view" data-id="' + esc(p.id) + '">Details</button>' +
      '</div>';
  }

  function eventsHTML(p) {
    if (!p.events.length) {
      return '<p class="detail__muted">অনুষ্ঠানের তথ্য শীঘ্রই যোগ করা হবে।</p>';
    }
    return '<ul class="event-list">' + p.events.map((e) => {
      const when = [formatDate(e.date), formatTime(str(e.time))].filter(Boolean).join(' · ');
      return '<li><span class="event-list__title">' + esc(e.title) + '</span>' +
        (when ? '<span class="event-list__when">' + esc(when) + '</span>' : '') + '</li>';
    }).join('') + '</ul>';
  }

  function facilitiesHTML(p) {
    return '<div class="facility-list">' + p.facilities.map((f) =>
      '<span class="badge facility">' + (FACILITY_ICONS[f.toLowerCase()] || '✨') + ' ' + esc(f) + '</span>'
    ).join('') + '</div>';
  }

  function detailHTML(p, opts) {
    opts = opts || {};
    const dist = formatDistance(opts.distance);
    const sub = subtitle(p);
    const hours = hoursText(p);
    const fb = safeUrl(p.facebook);
    const tel = p.phone.replace(/[^\d+]/g, '');
    return '<div class="detail__scroll">' +
      '<button type="button" class="sheet-close" data-action="close-detail" aria-label="বন্ধ করুন">×</button>' +
      '<img class="detail__img" src="' + esc(imgSrc(p)) + '" alt="' + esc(title(p)) + '">' +
      '<div class="detail__body">' +
        (p.demo ? '<p class="detail__notice">এটি নমুনা তথ্য (demo)। বাস্তব কোনো পূজার তথ্য নয়।</p>' : '') +
        '<h2 class="detail__title" id="detailTitle">' + esc(title(p)) + '</h2>' +
        (sub ? '<p class="detail__sub">' + esc(sub) + '</p>' : '') +
        '<div class="puja-card__meta mb-3">' + badges(p) +
          (p.category ? '<span class="pm-badge">' + esc(p.category) + '</span>' : '') + '</div>' +
        '<ul class="detail__facts">' +
          (p.address || p.location ? '<li><span>📍</span><div>' + esc(p.address || p.location) + '</div></li>' : '') +
          (dist ? '<li><span>📏</span><div>' + esc(dist) + ' away</div></li>' : '') +
          (hours ? '<li><span>🕐</span><div>' + esc(hours) + '</div></li>' : '') +
          (tel ? '<li><span>📞</span><div><a href="tel:' + esc(tel) + '">' + esc(p.phone) + '</a></div></li>' : '') +
          (fb ? '<li><span>🔗</span><div><a href="' + esc(fb) + '" target="_blank" rel="noopener">Facebook</a></div></li>' : '') +
        '</ul>' +
        '<h3 class="detail__h">🎵 অনুষ্ঠান</h3>' + eventsHTML(p) +
        (p.facilities.length ? '<h3 class="detail__h">✨ সুবিধা</h3>' + facilitiesHTML(p) : '') +
        (p.description ? '<h3 class="detail__h">বিবরণ</h3><p>' + esc(p.description) + '</p>' : '') +
      '</div>' +
    '</div>' +
    '<div class="detail__actions">' +
      '<a class="btn btn-pm" href="' + esc(directionsUrl(p)) + '" target="_blank" rel="noopener">🧭 Get Directions</a>' +
      '<button type="button" class="btn btn-pm-outline" data-action="share" data-id="' + esc(p.id) + '">📤 Share</button>' +
      '<button type="button" class="btn btn-pm-outline' + (opts.saved ? ' is-saved' : '') + '" data-action="save" data-id="' +
        esc(p.id) + '" aria-pressed="' + (opts.saved ? 'true' : 'false') + '">' + (opts.saved ? '❤️ Saved' : '🤍 Save') + '</button>' +
    '</div>';
  }

  PM.Puja = {
    load, parseCSV, csvToRecords, normalize, title, directionsUrl, cardHTML, popupHTML, quickHTML, detailHTML, isValidCoord
  };
})(window.PujaMap = window.PujaMap || {});
