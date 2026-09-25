// Service worker: hace que la app abra rápido y funcione sin internet.
//  · Archivos de la app: se muestran AL INSTANTE desde la copia guardada y, en segundo plano, se revisa si hay
//    una versión nueva en internet (así la app no espera a la red para abrir, aunque la señal sea lenta).
//    Cuando se publica una versión nueva (sube VERSION), se descarga completa y la app avisa «Actualizar».
//  · SDK de Firebase (gstatic.com): se guarda la primera vez y se reutiliza.
//  · Datos y sesión (Firestore / Auth): no se tocan; Firestore tiene su propia caché sin conexión.
// Al añadir archivos nuevos a la app, agrégalos a SHELL y sube el número de VERSION.

const VERSION = 'agenda-v4.7';
const CDN = 'agenda-cdn';
const SHELL = [
  './', 'index.html', 'guia.html', 'manifest.webmanifest',
  'css/styles.css',
  'js/agenda.js', 'js/app.js', 'js/config.js', 'js/guide.js', 'js/tour.js', 'js/junta.js', 'js/keep.js', 'js/lock.js', 'js/notify.js', 'js/reports.js', 'js/model.js', 'js/sheets.js', 'js/store.js', 'js/theme.js', 'js/util.js', 'js/views.js', 'js/weekimg.js', 'js/weekcal.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== CDN).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) e.respondWith(staleWhileRevalidate(req, e));
  else if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) e.respondWith(cacheFirst(req));
});

// Responde con la copia guardada y actualiza la copia en segundo plano; si no hay copia, va a la red
async function staleWhileRevalidate(req, e) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req, { ignoreSearch: true });
  const update = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  if (hit) { e.waitUntil(update); return hit; }
  const res = await update;
  return res || (await caches.match('index.html')) || Response.error();
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
    return res;
  } catch {
    return (await caches.match(req, { ignoreSearch: true })) || (await caches.match('index.html')) || Response.error();
  }
}

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(CDN)).put(req, res.clone());
  return res;
}

// ───── Avisos (notificaciones push) ─────
// El servidor manda solo datos { title, body, url }; aquí se muestra el aviso.
self.addEventListener('push', e => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch { p = { data: { body: e.data?.text() || '' } }; }
  const d = p.data || p.notification || p;
  e.waitUntil(self.registration.showNotification(d.title || 'Mi Agenda Teocrática', {
    body: d.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: d.tag || 'agenda-diaria',
    renotify: true,
    data: { url: d.url || './' },
  }));
});

// Al tocar el aviso: abre la app (o la trae al frente si ya estaba abierta)
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(self.registration.scope));
    if (open) { open.focus(); if ('navigate' in open && url !== open.url) return open.navigate(url).catch(() => {}); return; }
    return self.clients.openWindow(url);
  }));
});
