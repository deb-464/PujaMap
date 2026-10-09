/* Browser geolocation. Location stays in memory only; nothing is stored or sent. */
(function (PM) {
  'use strict';

  const MESSAGES = {
    success: 'আপনার লোকেশন পাওয়া গেছে',
    denied: 'লোকেশন permission দেওয়া হয়নি। আপনি map থেকে নিজে explore করতে পারেন।',
    unavailable: 'আপনার লোকেশন পাওয়া যাচ্ছে না। আবার চেষ্টা করুন।',
    timeout: 'লোকেশন খুঁজতে বেশি সময় লাগছে। আবার চেষ্টা করুন।',
    unsupported: 'এই ব্রাউজারে লোকেশন সুবিধা নেই। আপনি map থেকে নিজে explore করতে পারেন।',
    insecure: 'লোকেশন ব্যবহার করতে সাইটটি HTTPS (বা localhost) এ খুলতে হবে।'
  };

  let pending = null;

  /* opts.cached = true allows a recent position (used only for silent auto-locate);
     an explicit tap always asks for a fresh fix. */
  function request(opts) {
    if (pending) return pending;
    const maxAge = opts && opts.cached ? 60000 : 0;
    pending = new Promise((resolve, reject) => {
      const fail = (type) => reject({ type, message: MESSAGES[type] });
      if (window.isSecureContext === false) return fail('insecure');
      if (!('geolocation' in navigator)) return fail('unsupported');
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        (err) => fail(err && err.code === 1 ? 'denied' : err && err.code === 3 ? 'timeout' : 'unavailable'),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: maxAge }
      );
    }).finally(() => { pending = null; });
    return pending;
  }

  async function permissionState() {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        return (await navigator.permissions.query({ name: 'geolocation' })).state;
      }
    } catch (e) { /* ignore */ }
    return 'unknown';
  }

  PM.Location = { request, permissionState, MESSAGES };
})(window.PujaMap = window.PujaMap || {});
