// App instalada (PWA): aviso de versión nueva, número en el ícono de la app, guardar los datos de forma
// persistente y recibir fotos o PDF compartidos desde otra app.
//
// Versión nueva: el service worker (sw.js) la descarga completa y la deja «en espera». Aquí se muestra
// «Hay una versión nueva · Actualizar»; al tocarlo se le pide que tome el control y la página se recarga.

export const state = { waiting: null };
let onChange = () => {};
let applying = false;

function setWaiting(w) {
  if (state.waiting === w) return;
  state.waiting = w;
  try { onChange(); } catch { /* la vista aún no está lista */ }
}

export function register(changed) {
  if (changed) onChange = changed;
  if (!('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;
  const hadController = !!sw.controller;
  sw.register('./sw.js').then(reg => {
    const track = w => {
      if (!w) return;
      const check = () => { if (w.state === 'installed' && sw.controller) setWaiting(w); };
      check();
      w.addEventListener('statechange', check);
    };
    if (reg.waiting && sw.controller) setWaiting(reg.waiting);
    track(reg.installing);
    reg.addEventListener('updatefound', () => track(reg.installing));
    // Al volver a la app (como mucho una vez por hora) se revisa si hay una versión nueva
    let last = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Date.now() - last > 3600e3) { last = Date.now(); reg.update().catch(() => {}); }
    });
  }).catch(err => console.warn('Service worker no registrado', err));
  // Cuando la versión nueva toma el control (aquí o en otra pestaña), se recarga para no mezclar versiones
  let reloading = false;
  sw.addEventListener('controllerchange', () => {
    if (reloading || (!hadController && !applying)) return;
    reloading = true;
    location.reload();
  });
}

// «Actualizar»: la versión en espera toma el control y la página se recarga (ver controllerchange)
export function applyUpdate() {
  const w = state.waiting;
  if (!w) return location.reload();
  applying = true;
  w.postMessage({ type: 'SKIP_WAITING' });
  setTimeout(() => location.reload(), 4000);   // por si el aviso de cambio no llega
}

// Aviso para Hoy y Ajustes (vacío si no hay versión nueva)
export const updateBanner = () => state.waiting
  ? '<button type="button" class="log-now app-up" data-a="sw-update">🔄 <span><b>Hay una versión nueva · Actualizar</b><small>Toca para usarla ahora. No se pierde nada de lo que guardaste.</small></span></button>'
  : '';

// Pide al navegador que no borre los datos guardados en este dispositivo cuando falte espacio (una sola vez)
let persistAsked = false;
export function persistOnce() {
  if (persistAsked) return;
  persistAsked = true;
  try { navigator.storage?.persist?.().catch(() => {}); } catch { /* no disponible */ }
}

// Número en el ícono de la app (tareas atrasadas + rutinas de hoy sin hacer)
let lastBadge = -1;
export function setBadge(n) {
  n = Math.max(0, Number(n) || 0);
  if (n === lastBadge || !('setAppBadge' in navigator)) return;
  lastBadge = n;
  try { (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {}); } catch { /* no disponible */ }
}

// Fotos o PDF que llegaron con «Compartir» (los guarda sw.js); se entregan una sola vez
export async function takeShared() {
  const out = [];
  try {
    if (!('caches' in window)) return out;
    const cache = await caches.open('agenda-compartido');
    for (const req of await cache.keys()) {
      const res = await cache.match(req);
      if (res) {
        const blob = await res.blob();
        let name = 'archivo';
        try { name = decodeURIComponent(res.headers.get('X-Nombre') || name); } catch { /* nombre raro */ }
        out.push(new File([blob], name, { type: blob.type || res.headers.get('Content-Type') || '' }));
      }
      await cache.delete(req);
    }
  } catch (e) { console.warn('No se pudo leer lo compartido', e); }
  return out;
}
