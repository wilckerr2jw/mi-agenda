// Service worker: hace que la app abra rápido y funcione sin internet.
//  · Archivos de la app (SHELL): se guardan TODOS juntos al instalar cada versión, en su propia caché (VERSION),
//    y se sirven desde ahí. Así nunca se mezclan archivos de dos versiones.
//    Cuando se publica una versión nueva (sube VERSION), se descarga completa y queda «en espera»: la app muestra
//    «Hay una versión nueva · Actualizar» y solo cambia cuando la persona toca Actualizar (mensaje SKIP_WAITING).
//  · Lectores de fotos y PDF (vendor/, unos 10 MB): no se descargan al instalar; se guardan la primera vez que
//    se usan (o con «Guardar para usar sin internet») en una caché aparte que no se borra con cada versión.
//  · SDK de Firebase (gstatic.com): se guarda la primera vez y se reutiliza.
//  · «Compartir» desde otra app (share_target): la foto o el PDF se guarda un momento y se abre el importador.
//  · Datos y sesión (Firestore / Auth): no se tocan; Firestore tiene su propia caché sin conexión.
// Al añadir archivos nuevos a la app, agrégalos a SHELL y sube el número de VERSION
// (node herramientas/version.mjs revisa que todo js/*.js esté en SHELL y que cada archivo exista).

const VERSION = 'agenda-v10.2.0';
const CDN = 'agenda-cdn';
const VENDOR = 'vendor-v1';
const SHARED = 'agenda-compartido';
const RUNTIME = 'agenda-otros';
const SHELL = [
  './', 'index.html', 'guia.html', 'ver.html', 'manifest.webmanifest',
  'css/styles.css',
  'js/agenda.js', 'js/app.js', 'js/config.js', 'js/guide.js', 'js/tour.js', 'js/junta.js', 'js/keep.js', 'js/lock.js', 'js/notify.js', 'js/reports.js', 'js/model.js', 'js/sheets.js', 'js/store.js', 'js/theme.js', 'js/util.js', 'js/views.js', 'js/weekimg.js', 'js/orgimg.js', 'js/weekcal.js', 'js/native.js', 'js/mecas.js', 'js/comite.js', 'js/ics.js', 'js/voz.js', 'js/borrador.js', 'js/visita.js', 'js/pastoreo.js', 'js/compartir.js', 'js/gcal.js', 'js/gcal-script.js', 'js/recordar.js', 'js/corregir.js', 'js/ver.js', 'js/pwa.js',
  'js/perms.js', 'js/admin.js', 'js/mover.js', 'js/compartido.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/n-badge.png', 'sonidos/campanita.mp3',
];
const KEEP = [VERSION, CDN, VENDOR, SHARED, RUNTIME];
const SHELL_URLS = new Set(SHELL.map(f => new URL(f, self.registration.scope).href));

self.addEventListener('install', e => {
  // cache: 'reload' = directo del servidor (no de la caché HTTP), para que la versión quede completa y pareja.
  // Sin skipWaiting: la versión nueva espera a que la persona toque «Actualizar».
  e.waitUntil((async () => {
    // Paso único desde las versiones de antes (se cambiaban solas): esas páginas no saben mostrar «Actualizar»,
    // así que esta vez la versión nueva entra sola, como antes. La caché RUNTIME marca el sistema nuevo.
    const fromOld = !!self.registration.active && !(await caches.has(RUNTIME));
    await caches.open(VERSION).then(c => c.addAll(SHELL.map(f => new Request(f, { cache: 'reload' }))));
    await caches.open(RUNTIME);
    if (fromOld) self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !KEEP.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === 'POST' && url.origin === location.origin && url.pathname.endsWith('/compartir-recibir')) return e.respondWith(receiveShare(req));
  if (req.method !== 'GET') return;
  if (url.origin === location.origin) {
    if (url.pathname.includes('/vendor/')) e.respondWith(cacheFirst(req, VENDOR));
    else if (req.mode === 'navigate' || SHELL_URLS.has(url.origin + url.pathname)) e.respondWith(fromShell(req));
    else if (!url.pathname.endsWith('/version.json') && !url.pathname.endsWith('/sw.js')) e.respondWith(staleWhileRevalidate(req, e));
  }
  else if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) e.respondWith(cacheFirst(req, CDN));
});

// Archivos de la app: siempre de la caché de ESTA versión (sin mezclar). Si falta, a la red; sin red, la portada.
async function fromShell(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok || req.mode !== 'navigate') return res;
  } catch { /* sin conexión */ }
  return (await cache.match('index.html')) || Response.error();
}

// Otros archivos del sitio (sonidos, íconos de avisos…): copia guardada aparte y se actualiza en segundo plano
async function staleWhileRevalidate(req, e) {
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(req, { ignoreSearch: true });
  const update = fetch(req).then(res => { if (res.ok && res.type === 'basic') cache.put(req, res.clone()); return res; }).catch(() => null);
  if (hit) { e.waitUntil(update); return hit; }
  return (await update) || Response.error();
}

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

// «Compartir» una foto o un PDF desde otra app: se guarda y se abre la app con ?compartido=1
async function receiveShare(req) {
  try {
    const fd = await req.formData();
    const files = fd.getAll('archivos').filter(f => f && typeof f === 'object' && f.size);
    const cache = await caches.open(SHARED);
    (await cache.keys()).forEach(k => cache.delete(k));
    await Promise.all(files.slice(0, 5).map((f, i) => cache.put(`compartido/${i}`, new Response(f, {
      headers: { 'Content-Type': f.type || 'application/octet-stream', 'X-Nombre': encodeURIComponent(f.name || `archivo-${i + 1}`) },
    }))));
  } catch (err) { console.warn('No se pudo recibir lo compartido', err); }
  return Response.redirect(new URL('./?compartido=1', self.registration.scope).href, 303);
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
