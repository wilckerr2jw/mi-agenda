// Google Calendar automático: la app le manda tu agenda a un pequeño programa que tú pones en tu cuenta de Google
// (Google Apps Script, gratis). Él la pasa a un calendario propio, «Mi Agenda Teocrática»: eventos con su repetición
// y semanas canceladas, tareas con fecha y reuniones. Lo que cambias o borras aquí se cambia o borra allá.
// No hace falta exportar archivos: se envía solo cuando cambias algo (y una vez al día, por si acaso).
import { data } from './store.js';
import * as store from './store.js';
import * as M from './model.js';
import { esc, today, toast, addDays, fmtShort, dateOf } from './util.js';
import { GCAL_SCRIPT } from './gcal-script.js';

const S = () => import('./sheets.js');
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
// Colores de Google Calendar: 3 uva · 4 flamenco · 5 plátano · 7 pavo real · 8 grafito · 9 arándano · 10 albahaca · 11 tomate
const COLORS = { reunion: 9, predicacion: 10, pastoreo: 3, ancianos: 11, estudio: 7, familia: 5, personal: 8, asignacion: 4 };
const cfg = () => M.profile().gcal || {};
export const isOn = () => !!(cfg().url && cfg().on !== false);
const opts = () => ({ events: true, tasks: true, meetings: true, ...(cfg().opts || {}) });
const enc = new TextEncoder();
const hex = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
const newToken = () => [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');
function addMin(t, m) { const [h, mi] = t.split(':').map(Number); const x = h * 60 + mi + m; return { t: `${String(Math.floor(x / 60) % 24).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`, next: x >= 24 * 60 }; }

function item(key, x) {
  const it = { key, title: String(x.title || '').slice(0, 200), date: x.date, place: x.place || '', desc: x.desc || '', rrule: x.rrule || '', ex: x.ex || [], color: x.color || 0 };
  if (x.time) {
    const end = x.endTime && x.endTime > x.time ? { t: x.endTime, next: false } : addMin(x.time, x.dur || 60);
    Object.assign(it, { time: x.time, end: end.t, endDate: end.next ? addDays(x.date, 1) : x.date });
  } else Object.assign(it, { time: '', end: '', endDate: addDays(x.date, 1) });
  return it;
}
// Lo que se pasa al calendario (mismas reglas que «Pasar mi agenda al calendario»)
export function calendarItems(o = opts()) {
  const from = addDays(today(), -30);
  const out = [];
  if (o.events) data.events.forEach(e => {
    if (!e.date) return;
    const rep = M.isRepeating(e);
    if (!rep && e.date < from) return;
    const rrule = e.repeat === 'daily' ? 'FREQ=DAILY' : e.repeat === 'weekly' ? 'FREQ=WEEKLY' : e.repeat === 'biweekly' ? 'FREQ=WEEKLY;INTERVAL=2'
      : e.repeat === 'monthly' ? 'FREQ=MONTHLY' : e.repeat === 'days' && (e.days || []).length ? `FREQ=WEEKLY;BYDAY=${(e.days || []).map(n => BYDAY[Number(n)]).filter(Boolean).join(',')}` : '';
    if (rep && !rrule) return;
    const cat = M.catOf(e.category)?.n;
    const desc = [e.theme ? `Tema: ${e.theme}` : '', cat ? `Tipo: ${cat}` : '', e.notes || ''].filter(Boolean).join('\n');
    out.push(item(`e_${e.id}`, { title: e.title || cat || 'Evento', date: e.date, time: e.time, endTime: e.endTime, place: e.place, desc, rrule, ex: rep ? [...(e.skipDates || [])].sort() : [], color: COLORS[e.category] }));
  });
  if (o.tasks) data.tasks.filter(t => t.due && t.status !== 'hecha' && t.due >= from && M.isMineTask(t))
    .forEach(t => out.push(item(`t_${t.id}`, { title: `✅ ${t.title}`, date: t.due, time: t.dueTime || '', dur: 30 })));
  if (o.meetings) data.meetings.filter(m => m.date && m.date >= from)
    .forEach(m => out.push(item(`m_${m.id}`, { title: `🗓 ${m.title || 'Reunión'}`, date: m.date, time: m.time || '', place: m.place || '', dur: 90 })));
  return out;
}
async function payload() {
  const items = calendarItems();
  for (const it of items) {
    it.gid = `ma${(await hex(`mi-agenda:${it.key}`)).slice(0, 30)}`;
    it.h = (await hex(JSON.stringify([it.title, it.date, it.time, it.end, it.endDate, it.place, it.desc, it.rrule, it.ex, it.color]))).slice(0, 12);
    delete it.key;
  }
  items.sort((a, b) => a.gid.localeCompare(b.gid));
  return { items, hash: (await hex(items.map(i => `${i.gid}:${i.h}`).join('|'))).slice(0, 16) };
}

// ───── Hablar con el programa de tu cuenta de Google ─────
// Solo se habla con una aplicación web de Google Apps Script (así tus datos y tu clave no van a otro sitio)
export const isGcalUrl = url => /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(String(url || ''));
async function call(url, body) {
  if (!isGcalUrl(url)) throw new Error('url');
  const r = await fetch(url, { method: body ? 'POST' : 'GET', redirect: 'follow', ...(body ? { headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) } : {}) });
  const text = await r.text();
  try { return JSON.parse(text); } catch { throw new Error(/<html/i.test(text) ? 'acceso' : 'respuesta'); }
}
const errText = e => {
  const m = String(e?.message || e || '');
  if (m === 'url') return 'La dirección guardada no es de Google Apps Script (https://script.google.com/macros/s/…/exec). Desconecta y pega la URL correcta.';
  if (m === 'acceso') return 'Google pidió iniciar sesión: en la implementación, «Quién tiene acceso» debe ser «Cualquier usuario».';
  if (m === 'clave') return 'El programa ya está unido a otra clave. Crea una implementación nueva o pega de nuevo el código.';
  if (/Calendar is not defined|ReferenceError.*Calendar/i.test(m)) return 'Falta agregar el servicio «Google Calendar API» en el programa (Servicios, botón +) y volver a implementar.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Sin conexión con Google. Revisa el internet e intenta de nuevo.';
  return m.slice(0, 160) || 'No se pudo.';
};
const save = patch => store.upsert('profile', { ...M.profile(), id: 'me', gcal: { ...cfg(), ...patch } }, { explicit: true });

export async function syncNow(force = false) {
  const c = cfg();
  if (!c.url || c.on === false) return null;
  if (!isGcalUrl(c.url)) { toast(errText('url'), null, null, 9000); return null; }
  const { items, hash } = await payload();
  if (!force && hash === c.hash && c.at && Date.now() - Date.parse(c.at) < 24 * 3600e3) return null;
  const r = await call(c.url, { token: c.token, items, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Caracas' });
  if (!r || (!r.ok && r.total == null)) {   // no se pudo ni empezar (clave, servicio que falta…)
    save({ err: errText(r?.error || 'respuesta'), errAt: new Date().toISOString() });
    throw new Error(r?.error || 'respuesta');
  }
  save({ hash: r.ok ? hash : '', at: new Date().toISOString(), n: items.length, res: { nuevos: r.nuevos || 0, cambiados: r.cambiados || 0, borrados: r.borrados || 0 }, err: r.ok ? '' : `Algunos no pasaron: ${(r.errores || []).join(' · ').slice(0, 200)}` });
  return r;
}
let timer = 0, busy = false;
export function autoSync() {
  if (!isOn()) return;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (busy) return;
    busy = true;
    try { await syncNow(); } catch (e) { console.warn('Google Calendar no actualizado', e); }
    busy = false;
  }, 30000);
}

// ───── Hoja: cómo conectarlo y cómo va ─────
export async function sheet() {
  const { open } = await S();
  const c = cfg();
  if (!c.token) { save({ token: newToken(), on: true }); }
  const o = opts();
  const optHtml = `<div class="stack">${[['events', 'Eventos (con su repetición y semanas canceladas)'], ['tasks', 'Mis tareas pendientes con fecha'], ['meetings', 'Reuniones']].map(([k, n]) => `<label class="check"><input type="checkbox" data-a="gcal-opt" data-v="${esc(k)}" ${o[k] ? 'checked' : ''}> ${n}</label>`).join('')}</div>`;
  if (c.url) {
    open({
      title: '📅 Google Calendar automático',
      body: `${c.on === false ? '<p class="hint warn">⏸ En pausa: no se envían cambios.</p>' : `<p class="hint ok">✓ Conectado. Lo que cambias aquí aparece solo en el calendario «Mi Agenda Teocrática» de tu Google Calendar.</p>`}
        ${c.at ? `<p class="hint">Última vez: ${esc(fmtShort(dateOf(c.at)))} a las ${esc(new Date(c.at).toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit' }))} · ${c.n || 0} en el calendario${c.res ? ` (${c.res.nuevos} nuevos, ${c.res.cambiados} cambiados, ${c.res.borrados} borrados)` : ''}.</p>` : ''}
        ${c.err ? `<p class="hint warn">⚠️ ${esc(c.err)}</p>` : ''}
        <h3 class="sub-h">Qué se pasa</h3>${optHtml}
        <p class="hint">Los avisos siguen llegando desde la app: en Google Calendar los eventos van sin recordatorios para que no te lleguen dos veces.</p>
        <div class="stack pad"><button type="button" class="btn primary" data-a="gcal-sync">🔄 Actualizar ahora</button>
        <button type="button" class="btn ghost" data-a="gcal-pause">${c.on === false ? '▶ Reanudar' : '⏸ Pausar'}</button>
        <button type="button" class="btn ghost danger" data-a="gcal-off">Desconectar y borrar el calendario de Google</button></div>`,
    });
    return;
  }
  open({
    title: '📅 Google Calendar automático',
    body: `<p class="hint">Se hace una sola vez, mejor desde la computadora (unos 5 minutos). Pones un pequeño programa en <b>tu</b> cuenta de Google y desde ahí tu agenda se pasa sola a un calendario nuevo, «Mi Agenda Teocrática». No toca tus otros calendarios.</p>
      <ol class="gc-steps">
        <li>Abre <a href="https://script.google.com/home/projects/create" target="_blank" rel="noopener"><b>script.google.com</b></a> con tu cuenta de Google (se crea un proyecto nuevo). Ponle de nombre «Mi Agenda».</li>
        <li>Borra lo que aparece escrito y pega este código: <button type="button" class="btn small" data-a="gcal-copy">📋 Copiar el código</button></li>
        <li>A la izquierda, en <b>Servicios</b>, toca <b>+</b>, elige <b>Google Calendar API</b> y toca <b>Agregar</b>. Guarda (💾).</li>
        <li>Arriba: <b>Implementar → Nueva implementación</b> → tipo <b>Aplicación web</b>. En «Ejecutar como»: <b>Yo</b>; en «Quién tiene acceso»: <b>Cualquier usuario</b>. Toca <b>Implementar</b> y luego <b>Autorizar acceso</b> con tu cuenta (si dice «Google no verificó esta app», toca <i>Configuración avanzada → Ir a Mi Agenda</i>: es tu propio programa).</li>
        <li>Copia la <b>URL de la aplicación web</b> (termina en <code>/exec</code>) y pégala aquí:</li>
      </ol>
      <div class="f"><input id="gcal-url" type="url" inputmode="url" placeholder="https://script.google.com/macros/s/…/exec" aria-label="URL de la aplicación web"></div>
      <h3 class="sub-h">Qué se pasa</h3>${optHtml}`,
    actions: '<button type="button" class="btn primary" data-a="gcal-connect">Conectar</button>',
  });
}
export async function copyScript() {
  try { await navigator.clipboard.writeText(GCAL_SCRIPT); toast('Código copiado: pégalo en script.google.com'); }
  catch {
    const { open } = await S();
    open({ title: 'Código para Google', back: sheet, body: `<p class="hint">Mantén presionado el texto, elige «Seleccionar todo» y cópialo.</p><textarea rows="14" readonly style="width:100%;font:12px/1.4 ui-monospace,monospace">${esc(GCAL_SCRIPT)}</textarea>` });
  }
}
export async function connect() {
  const url = (document.getElementById('gcal-url')?.value || '').trim();
  if (!isGcalUrl(url)) return toast('Pega la URL completa de la aplicación web (empieza con https://script.google.com/macros/s/ y termina en /exec)', null, null, 9000);
  toast('Conectando con tu Google Calendar…', null, null, 20000);
  try {
    const hi = await call(url);
    if (hi?.app !== 'mi-agenda') throw new Error('respuesta');
    const c = cfg();
    const t = await call(url, { token: c.token, action: 'probar' });
    if (!t?.ok) throw new Error(t?.error || 'respuesta');
    save({ url, on: true, err: '', hash: '' });
    toast('✓ Conectado. Pasando tu agenda a Google Calendar (la primera vez tarda un poco)…', null, null, 15000);
    await S().then(m => m.close());
    const r = await syncNow(true);
    toast(r?.ok ? `✓ Listo: ${r.total} en tu calendario «Mi Agenda Teocrática»` : '⚠️ Se conectó, pero algunos no pasaron. Revisa en Ajustes → Mis datos → Google Calendar.', null, null, 9000);
  } catch (e) { console.warn(e); toast(`⚠️ ${errText(e)}`, null, null, 12000); }
}
export async function syncButton() {
  toast('Actualizando Google Calendar…');
  try { const r = await syncNow(true); toast(r?.ok ? `✓ Al día: ${r.total} en el calendario` : '⚠️ Algunos no pasaron; mira el detalle'); }
  catch (e) { toast(`⚠️ ${errText(e)}`, null, null, 10000); }
  sheet();
}
export function setOpt(k, on) { save({ opts: { ...opts(), [k]: on }, hash: '' }); autoSync(); }
export function togglePause() { save({ on: cfg().on === false }); sheet(); if (cfg().on !== false) autoSync(); }
export async function confirmOff() {
  const { open } = await S();
  open({ title: 'Desconectar Google Calendar', back: sheet, body: '<p>Se borra el calendario «Mi Agenda Teocrática» de tu Google Calendar y la app deja de enviarle cambios. Tus datos de la app no se tocan.</p>',
    actions: '<button type="button" class="btn ghost" data-a="gcal-open">Cancelar</button><button type="button" class="btn danger" data-a="gcal-off-go">Sí, desconectar</button>' });
}
export async function disconnect() {
  const c = cfg();
  if (c.url) { try { await call(c.url, { token: c.token, action: 'borrar' }); } catch (e) { console.warn(e); } }
  store.upsert('profile', { ...M.profile(), id: 'me', gcal: null }, { explicit: true });
  toast('Desconectado. En script.google.com puedes borrar el programa si ya no lo usas.', null, null, 9000);
  (await S()).close();
}
