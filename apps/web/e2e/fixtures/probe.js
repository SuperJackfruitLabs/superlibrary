// Tries everything an artifact must not be able to do (spec §15 "Content origin"), and writes what
// happened into #results for the test to read. It is an external file so it also proves that an
// artifact's own scripts load from its signed path (plan D2); inline script would run too (plan D3).
const out = {};
const attempt = async (name, fn) => {
  try {
    const v = await fn();
    out[name] = 'allowed:' + String(v);
  } catch (e) {
    out[name] = 'blocked:' + ((e && e.name) || 'Error');
  }
};
(async () => {
  await attempt('localStorage', () => localStorage.getItem('secret'));
  await attempt('sessionStorage', () => sessionStorage.getItem('secret'));
  await attempt('cookie', () => document.cookie);
  await attempt('indexedDB', () => new Promise((res, rej) => { const r = indexedDB.open('probe'); r.onsuccess = () => res('opened'); r.onerror = () => rej(r.error); }));
  await attempt('parentStorage', () => parent.localStorage.getItem('secret'));
  await attempt('parentDocument', () => parent.document.title);
  await attempt('topLocation', () => top.location.href);
  await attempt('fetchExternal', () => fetch('https://example.com/').then((r) => r.status));
  await attempt('fetchSelf', () => fetch(location.href).then((r) => r.status));
  await attempt('xhr', () => new Promise((res, rej) => { const x = new XMLHttpRequest(); x.open('GET', 'https://example.com/'); x.onload = () => res(x.status); x.onerror = () => rej(new Error('xhr')); x.send(); }));
  await attempt('websocket', () => new Promise((res, rej) => { const w = new WebSocket('wss://example.com/'); w.onopen = () => res('open'); w.onerror = () => rej(new Error('ws')); }));
  await attempt('popup', () => { const w = window.open('https://example.com/'); if (!w) throw new Error('null'); return 'opened'; });
  await attempt('beacon', () => navigator.sendBeacon('https://example.com/beacon', 'x'));
  await attempt('topNavigation', () => { top.location.href = 'https://example.com/'; return 'assigned'; });
  document.getElementById('results').textContent = JSON.stringify(out);
})();
