// App de Android (Capacitor). Cuando la web se abre dentro de la app nativa, aquí se programan los avisos
// en el propio teléfono: llegan a la hora exacta, sin internet y con sonidos propios (canales de Android).
// En el navegador normal este archivo no hace nada.

import { data } from './store.js';
import * as store from './store.js';
import * as M from './model.js';
import { today, addDays, fmtTime } from './util.js';

const C = window.Capacitor;
export const isNative = !!C?.isNativePlatform?.();
const plug = name => C?.Plugins?.[name];
const REPO = 'wilckerr2jw/mi-agenda';
export const APK_URL = `https://github.com/${REPO}/releases/latest/download/agenda-teocratica.apk`;

// Canales: cada tipo de aviso con su sonido (los archivos están en la app: res/raw)
const CHANNELS = [
  { id: 'eventos', name: 'Eventos (antes de empezar)', description: 'Aviso unos minutos antes de cada evento', sound: 'suave.mp3', importance: 4 },
  { id: 'rutinas', name: 'Rutinas y rachas', description: 'Texto diario, lectura y otras rutinas', sound: 'campanita.mp3', importance: 4 },
  { id: 'registro', name: 'Registro de la noche (importante)', description: 'Recordatorio para registrar horas y cursos', sound: 'alerta.mp3', importance: 5 },
  { id: 'general', name: 'Resúmenes y otros', description: 'Resumen de la mañana, reuniones, tareas, mañana', sound: 'amanecer.mp3', importance: 3 },
];

export const state = { ready: false, perm: '', exact: '', update: null, build: 0, version: '' };
let handlers = { done: () => {}, log: () => {}, changed: () => {} };
let timer = 0;

const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) % 2000000000 + 1; };
const toMin = t => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const at = (iso, min) => { const d = new Date(`${iso}T00:00:00`); d.setMinutes(min); return d; };
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

export async function init(h) {
  if (!isNative) return;
  handlers = { ...handlers, ...h };
  const LN = plug('LocalNotifications');
  if (!LN) return;
  try {
    const p = await LN.requestPermissions();
    state.perm = p.display;
    for (const ch of CHANNELS) await LN.createChannel({ ...ch, vibration: true, visibility: 1, lights: true, lightColor: '#1D5F5A' }).catch(() => {});
    await LN.registerActionTypes({ types: [
      { id: 'rutina', actions: [{ id: 'done', title: '✓ Ya lo hice' }, { id: 'open', title: 'Abrir' }] },
      { id: 'registro', actions: [{ id: 'log', title: '📝 Registrar ahora', foreground: true }] },
    ] });
    await LN.addListener('localNotificationActionPerformed', ev => {
      const x = ev.notification?.extra || {};
      if (ev.actionId === 'done' && x.eid) handlers.done(x.eid, x.day);
      else if (ev.actionId === 'log' || x.kind === 'log') handlers.log();
    });
    try { state.exact = (await LN.checkExactNotificationSetting()).exact_alarm; } catch { state.exact = ''; }
    state.ready = true;
    // Aviso al servidor: esta cuenta usa la app de Android (así no se duplican los avisos de horario)
    const v = M.profile();
    if (!v.nativeAppSeen || Date.now() - Date.parse(v.nativeAppSeen) > 12 * 3600e3) store.upsert('profile', { ...v, id: 'me', nativeAppSeen: new Date().toISOString() });
    plug('App')?.addListener('resume', () => { schedule(); checkUpdate(); });
    schedule();
    checkUpdate();
  } catch (e) { console.warn('Avisos nativos no disponibles', e); }
}

// Permiso para avisos exactos (Android 12+ puede pedirlo aparte)
export async function askExact() {
  const LN = plug('LocalNotifications');
  try { state.exact = (await LN.changeExactNotificationSetting()).exact_alarm; } catch { /* no aplica */ }
  handlers.changed();
}

export async function test() {
  const LN = plug('LocalNotifications');
  if (!LN) return false;
  await LN.schedule({ notifications: [{ id: 1, title: 'Mi Agenda', body: '✓ Los avisos de la app funcionan en este teléfono.', channelId: 'rutinas', schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true }, smallIcon: 'ic_stat_agenda', extra: { kind: 'test' } }] });
  return true;
}

// Reprograma los avisos (se llama cuando cambian los datos; espera un momento para agrupar cambios)
export function schedule() {
  if (!isNative || !state.ready) return;
  clearTimeout(timer);
  timer = setTimeout(doSchedule, 2500);
}

function prefs() {
  return { hour: 7, tasks: true, events: true, junta: true, before: 10, logAt: 1230, soon: true, routine: true, streak: true, taskTime: true, meetingSoon: true, tomorrow: true, report: true, details: false, ...(M.profile().notif || {}) };
}

function planFor(iso, p) {
  const out = [];
  const add = (min, key, body, channelId, extra = {}, title = 'Mi Agenda') => {
    if (min == null || min < 0 || min >= 24 * 60) return;
    const when = at(iso, min);
    if (when.getTime() < Date.now() + 20000) return;
    out.push({ id: hash(`${key}:${iso}`), title, body, channelId, schedule: { at: when, allowWhileIdle: true }, smallIcon: 'ic_stat_agenda', extra: { app: 'agenda', ...extra },
      ...(extra.kind === 'routine' || extra.kind === 'streak' ? { actionTypeId: 'rutina' } : {}), ...(extra.kind === 'log' ? { actionTypeId: 'registro', ongoing: false, autoCancel: true } : {}) });
  };
  const me = store.doneId();
  const before = Math.max(0, Number(p.before) || 0);
  const a = M.agendaFor(iso);
  // Resumen de la mañana
  if (p.hour != null) {
    const lines = [];
    const tasks = data.tasks.filter(t => t.status !== 'hecha' && M.isMineTask(t));
    const dueToday = tasks.filter(t => t.due === iso).length, late = tasks.filter(t => t.due && t.due < iso).length;
    if (p.tasks && dueToday) lines.push(`📋 ${plural(dueToday, 'tarea', 'tareas')} para hoy`);
    if (p.tasks && late) lines.push(`⏰ ${plural(late, 'tarea atrasada', 'tareas atrasadas')}`);
    if (p.events && a.events.length) lines.push(`📅 ${plural(a.events.length, 'compromiso', 'compromisos')} hoy`);
    if (p.junta) a.meetings.forEach(m => lines.push(`🗓 Hoy: ${p.details ? m.title : 'reunión'}${m.time ? ` a las ${fmtTime(m.time)}` : ''}`));
    if (lines.length) add(Number(p.hour) * 60, 'daily', lines.join('\n'), 'general', { kind: 'daily' }, 'Mi Agenda · tu día');
  }
  a.events.forEach(e => {
    const s = toMin(e.time);
    const routine = M.isRepeating(e) && (e.category === 'estudio' || e.category === 'personal' || Object.keys(e.doneLog || {}).length);
    const done = M.isDoneBy(e, iso, me);
    if (p.soon && s != null && before) add(s - before, `ev:${e.id}`, `⏰ En ${before} min: ${e.title}${e.time ? ` (${fmtTime(e.time)})` : ''}${e.place ? ` · ${e.place}` : ''}`, routine ? 'rutinas' : 'eventos', { kind: 'soon' });
    if (routine && !done) {
      const end = toMin(e.endTime) ?? (s != null ? s + 60 : null);
      if (p.routine) add(end != null ? Math.min(end + 30, 23 * 60 + 30) : 21 * 60, `rt:${e.id}`, `📖 Aún no marcaste «${e.title}» de hoy. ¿Ya lo hiciste?`, 'rutinas', { kind: 'routine', eid: e.id, day: iso });
      const st = M.streak(e, me, iso);
      if (p.streak && st >= 3) add(21 * 60 + 15, `st:${e.id}`, `🔥 Llevas ${st} días seguidos con «${e.title}». ¡No pierdas la racha hoy!`, 'rutinas', { kind: 'streak', eid: e.id, day: iso });
    }
  });
  if (p.taskTime) a.tasks.filter(t => M.isMineTask(t) && toMin(t.dueTime) != null)
    .forEach(t => add(toMin(t.dueTime) - before, `tk:${t.id}`, p.details ? `📋 A las ${fmtTime(t.dueTime)}: ${t.title}` : `📋 Tienes una tarea a las ${fmtTime(t.dueTime)}`, 'general', { kind: 'task' }));
  if (p.meetingSoon) a.meetings.filter(m => toMin(m.time) != null).forEach(m => {
    const n = (m.agenda || []).length;
    add(toMin(m.time) - 60, `mt:${m.id}`, `🗓 En 1 hora: ${p.details ? m.title : 'reunión'} (${fmtTime(m.time)})${n ? ` · agenda de ${plural(n, 'punto', 'puntos')}` : ''}${n && !m.agendaSentAt ? ' · aún no la enviaste' : ''}`, 'general', { kind: 'meeting' });
  });
  if (p.tomorrow) {
    const tm = M.agendaFor(addDays(iso, 1)).events.filter(e => e.time).sort((x, y) => x.time.localeCompare(y.time));
    if (tm.length) add(21 * 60 + 30, 'tm', `🌙 Mañana: ${plural(tm.length, 'evento', 'eventos')}; el primero, ${tm[0].title} a las ${fmtTime(tm[0].time)}.`, 'general', { kind: 'tomorrow' });
  }
  // Registro de la noche (importante, siempre activo si usas Mi Informe)
  if (M.isModuleVisible('informe')) {
    const hoy = data.entries.filter(e => e.date === iso);
    const mins = hoy.reduce((s, e) => s + (Number(e.minutes) || 0), 0);
    const cursos = hoy.reduce((s, e) => s + (Array.isArray(e.studyNames) ? e.studyNames.length : Number(e.studies) || 0), 0);
    const body = hoy.length ? `📝 Hoy registraste ${M.fmtHM(mins)} h${cursos ? ` y ${plural(cursos, 'curso', 'cursos')}` : ''}. ¿Te falta algo por anotar?`
      : '📝 Registra tu actividad de hoy: aún no guardaste horas ni cursos. Hazlo antes de que termine el día.';
    add(Number(p.logAt) || 1230, 'lg', body, 'registro', { kind: 'log' }, 'Importante · Mi Agenda');
  }
  return out;
}

async function doSchedule() {
  const LN = plug('LocalNotifications');
  if (!LN) return;
  try {
    const p = prefs();
    const t = today();
    const list = [...planFor(t, p), ...planFor(addDays(t, 1), p)].slice(0, 60);
    const pending = await LN.getPending();
    const old = (pending.notifications || []).filter(n => n.id !== 1);
    if (old.length) await LN.cancel({ notifications: old.map(n => ({ id: n.id })) });
    if (list.length) await LN.schedule({ notifications: list });
  } catch (e) { console.warn('No se pudieron programar los avisos', e); }
}

// ───── Actualización de la app (APK) ─────
// Compara el número de la app instalada con el último APK publicado en GitHub.
export async function checkUpdate() {
  if (!isNative) return;
  try {
    const info = await plug('App')?.getInfo();
    state.build = Number(info?.build) || 0; state.version = info?.version || '';
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return;
    const rel = await res.json();
    const n = Number(String(rel.tag_name || '').replace(/\D/g, '')) || 0;
    const asset = (rel.assets || []).find(a => /\.apk$/i.test(a.name));
    state.update = n > state.build ? { build: n, name: rel.name || `1.${n}`, notes: rel.body || '', url: asset?.browser_download_url || APK_URL } : null;
    handlers.changed();
  } catch { /* sin internet: se revisa después */ }
}
export async function openDownload() {
  const B = plug('Browser');
  const url = state.update?.url || APK_URL;   // el enlace exacto del APK nuevo (así nunca da «404»)
  if (B) await B.open({ url }); else window.open(url, '_blank');
}
