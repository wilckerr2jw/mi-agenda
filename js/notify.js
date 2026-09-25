// Avisos en el teléfono (notificaciones push).
// Cada teléfono que los activa guarda su «dirección» (token) en users/{uid}/devices/{id}.
// Un proceso en el servidor (carpeta functions/) revisa cada hora a quién le toca su aviso del día
// y envía UNO solo con lo que tiene pendiente. Por privacidad, el texto es general salvo que el usuario
// elija «Mostrar los títulos».

import * as store from './store.js';
import { isCloud } from './store.js';
import { FIREBASE_VERSION, VAPID_KEY } from './config.js';
import * as M from './model.js';

const KEY = 'miagenda.aviso';        // id de este teléfono (si tiene los avisos activos)
export const SOUNDS = [['campanita', 'Campanita'], ['suave', 'Suave'], ['amanecer', 'Amanecer'], ['alerta', 'Alerta']];
export function playSound(id = prefs().sound) {
  if (!id || id === 'ninguno') return;
  try { const a = new Audio(`sonidos/${id}.mp3`); a.volume = 0.9; a.play().catch(() => {}); } catch { /* sin audio */ }
}
export const DEFAULTS = { sound: 'campanita', logAt: 1230, hour: 7, tasks: true, events: true, junta: true, supervise: true, shared: true, updates: true, weekly: true, details: false,
  before: 10, soon: true, routine: true, streak: true, taskTime: true, meetingSoon: true, partner: true, tomorrow: true, report: true, assign: true, follow: true };

const ls = {
  get: () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } },
  set: v => { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch { /* sin almacenamiento */ } },
};

// ¿Se puede ofrecer en este teléfono? (nube + clave configurada + navegador compatible)
// Por qué no se pueden activar aquí (texto para el usuario) o '' si sí se puede
export function unsupportedReason() {
  if (!isCloud) return 'Los avisos necesitan una cuenta (modo nube). En modo local no están disponibles.';
  if (/^PEGA/i.test(VAPID_KEY || '')) return 'Falta la clave de avisos en js/config.js (VAPID_KEY).';
  if (needsInstall()) return 'En iPhone los avisos solo funcionan con la app instalada: en Safari toca Compartir → «Añadir a pantalla de inicio» y ábrela desde ese ícono (iOS 16.4 o más).';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'Este navegador no admite avisos. Abre la app en Chrome (Android) o instálala desde Chrome.';
  return '';
}
export const supported = () => isCloud && !/^PEGA/i.test(VAPID_KEY || '') && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isOn = () => !!ls.get() && typeof Notification !== 'undefined' && Notification.permission === 'granted';
export const blocked = () => typeof Notification !== 'undefined' && Notification.permission === 'denied';
export const prefs = () => ({ ...DEFAULTS, ...(M.profile().notif || {}) });
// ¿Es un teléfono o tableta? (con la app de Android, a los teléfonos no se les repiten los avisos por la web)
export const isMobile = () => /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
export const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Caracas'; } catch { return 'America/Caracas'; } };

// iPhone: solo funciona con la app instalada en la pantalla de inicio (iOS 16.4 o más)
export const needsInstall = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches && !navigator.standalone;

async function token() {
  const app = store.firebaseApp();
  if (!app) throw new Error('Firebase no está listo');
  const msg = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-messaging.js`);
  if (!(await msg.isSupported())) throw new Error('Este navegador no admite avisos');
  const reg = await navigator.serviceWorker.ready;
  return msg.getToken(msg.getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

// Activa los avisos en este teléfono. Devuelve '' si todo salió bien o el motivo si no.
export async function enable() {
  if (!supported()) return 'Este teléfono no admite avisos';
  if (needsInstall()) return 'En iPhone, primero instala la app: Compartir → «Añadir a pantalla de inicio», y ábrela desde ahí';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'Bloqueaste los avisos para esta app. Actívalos en los ajustes del navegador' : 'No diste permiso para los avisos';
  const id = ls.get() || newId();
  const t = await token();
  if (!t) return 'No se pudo registrar el teléfono';
  await store.saveDevice(id, { token: t, tz: tz(), mobile: isMobile() });
  ls.set(id);
  store.patchProfile(v => (v.notif ? null : { notif: { ...DEFAULTS } }));
  return '';
}

export async function disable() {
  const id = ls.get();
  ls.set('');
  if (id) await store.removeDevice(id);
}

export function setPref(key, value) {
  store.upsert('profile', { ...M.profile(), id: 'me', notif: { ...prefs(), [key]: value } });
}

// Al abrir la app: si este teléfono tiene los avisos activos, renueva su dirección (una vez al día)
export async function refresh() {
  if (!supported() || !isOn()) return;
  const day = new Date().toISOString().slice(0, 10);
  try { if (localStorage.getItem(KEY + '.dia') === day) return; } catch { /* sin almacenamiento */ }
  try {
    const t = await token();
    if (t) await store.saveDevice(ls.get(), { token: t, tz: tz(), mobile: isMobile() });
    try { localStorage.setItem(KEY + '.dia', day); } catch { /* sin almacenamiento */ }
  } catch (e) { console.warn('No se pudo renovar el aviso', e); }
}
