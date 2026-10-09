/* favorites.html controller */
(function (PM) {
  'use strict';
  const { toast } = PM.UI;
  let pujas = [];
  let userLoc = null;
  const $ = (id) => document.getElementById(id);

  function render() {
    const ids = PM.Favorites.list();
    const saved = ids.map((id) => pujas.find((p) => p.id === id)).filter(Boolean);
    const list = $('favList');
    const empty = $('favEmpty');
    saved.forEach((p) => {
      p._d = userLoc ? PM.calculateDistance(userLoc.lat, userLoc.lng, p.latitude, p.longitude) : null;
    });
    if (userLoc) saved.sort((a, b) => a._d - b._d);
    list.innerHTML = saved.map((p) => PM.Puja.cardHTML(p, {
      distance: p._d, removable: true, href: 'index.html#puja-' + encodeURIComponent(p.id)
    })).join('');
    empty.hidden = saved.length > 0;
    $('favDistBtn').hidden = !saved.length || !!userLoc;
    $('favCount').textContent = saved.length ? saved.length + ' saved' : '';
  }

  async function locate() {
    try {
      const pos = await PM.Location.request();
      userLoc = { lat: pos.lat, lng: pos.lng };
      render();
    } catch (err) {
      toast(err.message, 5000);
    }
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'remove') { PM.Favorites.remove(btn.dataset.id); render(); }
    if (btn.dataset.action === 'locate') locate();
  });

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      pujas = await PM.Puja.load();
    } catch (err) {
      toast('পূজার তথ্য লোড করা যায়নি।', 4500);
    }
    render();
    if ((await PM.Location.permissionState()) === 'granted') locate();
  });
})(window.PujaMap = window.PujaMap || {});
