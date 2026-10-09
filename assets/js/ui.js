/* Shared UI helpers: escaping, toast, image fallback, contribute button */
(function (PM) {
  'use strict';

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ESC[c]);

  let toastTimer;
  function toast(message, duration) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), duration || 3200);
  }

  function safeUrl(url) {
    try {
      const u = new URL(url, location.href);
      return /^https?:$/.test(u.protocol) ? u.href : '';
    } catch (e) {
      return '';
    }
  }

  // Broken images never show: swap to the placeholder once.
  function installImageFallback() {
    document.addEventListener('error', (e) => {
      const img = e.target;
      if (img && img.tagName === 'IMG' && !img.dataset.fallback) {
        img.dataset.fallback = '1';
        img.src = PM.CONFIG.PLACEHOLDER;
      }
    }, true);
  }

  // "Add Puja Information" buttons open the Google Form (configurable constant).
  function bindContribute() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-contribute]');
      if (!btn) return;
      e.preventDefault();
      const url = PM.CONFIG.FORM_URL;
      if (/^https?:\/\//i.test(url)) {
        window.open(url, '_blank', 'noopener');
      } else {
        toast('তথ্য পাঠানোর ফর্মের লিংক এখনো যোগ করা হয়নি।', 4200);
      }
    });
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js').catch(() => {});
      });
    }
  }

  PM.UI = { esc, toast, safeUrl, installImageFallback, bindContribute, registerServiceWorker };
  installImageFallback();
  bindContribute();
  registerServiceWorker();
})(window.PujaMap = window.PujaMap || {});
