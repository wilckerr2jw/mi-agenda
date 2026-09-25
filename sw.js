// Service worker: hace que la app abra rápido y funcione sin internet.
//  · Archivos de la app: se muestran AL INSTANTE desde la copia guardada y, en segundo plano, se revisa si hay
//    una versión nueva en internet (así la app no espera a la red para abrir, aunque la señal sea lenta).
//    Cuando se publica una versión nueva (sube VERSION), se descarga completa y la app avisa «Actualizar».
//  · SDK de Firebase (gstatic.com): se guarda la primera vez y se reutiliza.
//  · Datos y sesión (Firestore / Auth): no se tocan; Firestore tiene su propia caché sin conexión.
// Al añadir archivos nuevos a la app, agrégalos a SHELL y sube el número de VERSION.

const VERSION = 'agenda-v5.4';
const CDN = 'agenda-cdn';
const SHELL = [
  './', 'index.html', 'guia.html', 'manifest.webmanifest',
  'css/styles.css',
  'js/agenda.js', 'js/app.js', 'js/config.js', 'js/guide.js', 'js/tour.js', 'js/junta.js', 'js/keep.js', 'js/lock.js', 'js/notify.js', 'js/reports.js', 'js/model.js', 'js/sheets.js', 'js/store.js', 'js/theme.js', 'js/util.js', 'js/views.js', 'js/weekimg.js', 'js/weekcal.js', 'js/native.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/n-badge.png', 'sonidos/campanita.mp3',
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
// El servidor manda solo datos { title, body, url, tag, kind, eid, day }; aquí se arma el aviso:
// ícono según el tipo, vibración y, en las rutinas, el botón «✓ Ya lo hice» (se marca sin entrar a la app).
const KIND_ICON = { soon: 'n-soon', routine: 'n-routine', streak: 'n-streak', task: 'n-task', meeting: 'n-meeting', partner: 'n-partner',
  tomorrow: 'n-tomorrow', report: 'n-report', shared: 'n-shared', update: 'n-update', daily: 'n-daily', test: 'n-test', log: 'n-log' };
const KIND_VIBRATE = { log: [400, 150, 400, 150, 400], soon: [200, 100, 200], meeting: [300, 120, 300], streak: [120, 60, 120, 60, 260], routine: [150, 80, 150], test: [100, 60, 100, 60, 100] };

self.addEventListener('push', e => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch { p = { data: { body: e.data?.text() || '' } }; }
  const d = p.data || p.notification || p;
  const icon = `icons/${KIND_ICON[d.kind] || 'icon-192'}.png`;
  const actions = d.kind === 'log' ? [{ action: 'log', title: '📝 Registrar ahora' }, { action: 'none', title: 'Hoy no salí' }]
    : d.eid && d.day ? [{ action: 'done', title: '✓ Ya lo hice' }, { action: 'open', title: 'Abrir' }] : [];
  // Si la app está abierta en pantalla, que suene el sonido que elegiste
  self.clients.matchAll({ type: 'window' }).then(list => list.forEach(c => c.postMessage({ type: 'aviso', kind: d.kind || '' })));
  e.waitUntil(self.registration.showNotification(d.title || 'Mi Agenda Teocrática', {
    body: d.body || '',
    icon,
    badge: 'icons/n-badge.png',
    tag: d.tag || 'agenda-diaria',
    renotify: true,
    vibrate: KIND_VIBRATE[d.kind] || [180, 90, 180],
    requireInteraction: d.kind === 'soon' || d.kind === 'meeting' || d.kind === 'log',
    actions,
    timestamp: Date.now(),
    data: { url: d.url || './', eid: d.eid || '', day: d.day || '', kind: d.kind || '' },
  }));
});

// Al tocar el aviso: abre la app (o la trae al frente). «✓ Ya lo hice» abre la app marcando esa rutina.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const nd = e.notification.data || {};
  let url = new URL(nd.url || './', self.registration.scope);
  if (e.action === 'done' && nd.eid) { url.searchParams.set('hecho', nd.eid); url.searchParams.set('dia', nd.day); }
  if (e.action === 'log' || (!e.action && nd.kind === 'log')) url.searchParams.set('accion', 'registrar');
  if (e.action === 'none') url.searchParams.set('accion', 'nosali');
  url = url.href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(self.registration.scope));
    if (open) {
      if (e.action === 'done') open.postMessage({ type: 'hecho', eid: nd.eid, day: nd.day });
      if (url.includes('accion=registrar')) { open.postMessage({ type: 'registrar' }); open.focus(); return; }
      if (url.includes('accion=nosali')) { open.postMessage({ type: 'nosali' }); return; }
      open.focus();
      if (e.action !== 'done' && 'navigate' in open && url !== open.url) return open.navigate(url).catch(() => {});
      return;
    }
    return self.clients.openWindow(url);
  }));
});
