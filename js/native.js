// App de Android (Capacitor). Cuando la web se abre dentro de la app nativa, aquí se programan los avisos
// en el propio teléfono: llegan a la hora exacta, sin internet y con sonidos propios (canales de Android).
// En el navegador normal este archivo no hace nada.

import { data } from './store.js';
import * as store from './store.js';
import * as M from './model.js';
import { visitNotice } from './visita.js';
import { today, addDays, fmtTime, toast } from './util.js';

const C = window.Capacitor;
export const isNative = !!C?.isNativePlatform?.();
const plug = name => C?.Plugins?.[name];
const REPO = 'wilckerr2jw/mi-agenda';
// La app se descarga desde la misma web (rápido); GitHub queda de respaldo
// La web gratuita de Firebase no deja publicar archivos .apk: la app se descarga de GitHub
export const APK_URL_GITHUB = `https://github.com/${REPO}/releases/latest/download/agenda-teocratica.apk`;
export const APK_URL = APK_URL_GITHUB;

// Canales: cada tipo de aviso con su sonido (los archivos están en la app: res/raw)
const CHANNELS = [
  { id: 'eventos', name: 'Eventos (antes de empezar)', description: 'Aviso unos minutos antes de cada evento', sound: 'suave.mp3', importance: 4 },
  { id: 'rutinas', name: 'Rutinas y rachas', description: 'Texto diario, lectura y otras rutinas', sound: 'campanita.mp3', importance: 4 },
  { id: 'registro', name: 'Registro de la noche (importante)', description: 'Recordatorio para registrar horas y cursos', sound: 'alerta.mp3', importance: 5 },
  { id: 'general', name: 'Resúmenes y otros', description: 'Resumen de la mañana, reuniones, tareas, mañana', sound: 'amanecer.mp3', importance: 3 },
];

export const state = { ready: false, perm: '', exact: '', update: null, build: 0, version: '', health: null };
let handlers = { done: () => {}, log: () => {}, noActivity: () => {}, changed: () => {} };
let timer = 0;

const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) % 2000000000 + 1; };
const toMin = t => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const at = (iso, min) => { const d = new Date(`${iso}T00:00:00`); d.setMinutes(min); return d; };
const diffDaysISO = (a, b) => Math.round((Date.parse(`${a}T12:00:00`) - Date.parse(`${b}T12:00:00`)) / 864e5);
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
      { id: 'registro', actions: [{ id: 'log', title: '📝 Registrar ahora', foreground: true }, { id: 'none', title: 'Hoy no salí' }] },
    ] });
    await LN.addListener('localNotificationActionPerformed', ev => {
      const x = ev.notification?.extra || {};
      if (ev.actionId === 'done' && x.eid) handlers.done(x.eid, x.day);
      else if (ev.actionId === 'none') handlers.noActivity(x.day || today());
      else if (ev.actionId === 'log' || x.kind === 'log') handlers.log();
    });
    try { state.exact = (await LN.checkExactNotificationSetting()).exact_alarm; } catch { state.exact = ''; }
    state.ready = true;
    // Aviso al servidor: esta cuenta usa la app de Android (así no se duplican los avisos de horario)
    store.patchProfile(v => (!v.nativeAppSeen || Date.now() - Date.parse(v.nativeAppSeen) > 12 * 3600e3 ? { nativeAppSeen: new Date().toISOString() } : null));
    plug('App')?.addListener('resume', () => { schedule(); checkUpdate(); refreshHealth(); });
    // Enlaces del widget: app.miagenda.teocratica://registrar y …://hecho?eid=…&dia=… (✓ de una rutina)
    const onUrl = url => {
      if (/registrar/.test(url || '')) handlers.log();
      const m = /hecho\?eid=([^&]+)&dia=(\d{4}-\d{2}-\d{2})/.exec(url || '');
      if (m) handlers.done(decodeURIComponent(m[1]), m[2], { widget: true });
    };
    plug('App')?.addListener('appUrlOpen', ev => onUrl(ev.url));
    plug('App')?.getLaunchUrl?.().then(r => onUrl(r?.url)).catch(() => {});
    registerPush();
    schedule();
    checkUpdate();
    refreshHealth();
  } catch (e) { console.warn('Avisos nativos no disponibles', e); }
}

// Permiso para avisos exactos (Android 12+ puede pedirlo aparte)
export async function askExact() {
  const LN = plug('LocalNotifications');
  try { state.exact = (await LN.changeExactNotificationSetting()).exact_alarm; } catch { /* no aplica */ }
  handlers.changed();
  schedule();   // con el permiso nuevo, los avisos se vuelven a programar exactos
}

// Hora de un aviso programado: la guardamos nosotros en «extra.at» (la fecha que devuelve Android no siempre se puede leer)
const whenOf = n => Number(n?.extra?.at) || Date.parse(n?.schedule?.at || '') || 0;

// Cuántos avisos hay programados y cuáles son los próximos (para revisar en Ajustes)
export async function pendingSummary() {
  const LN = plug('LocalNotifications');
  if (!LN) return null;
  try {
    const r = await LN.getPending();
    const now = Date.now();
    const all = (r.notifications || []).map(n => ({ id: n.id, at: new Date(whenOf(n)), body: n.body || n.title || '', extra: n.extra || {} }));
    const list = all.filter(x => x.at.getTime() > now - 60000).sort((a, b) => a.at - b.at);
    return { n: list.length, next: list.slice(0, 8), all: list, ids: new Set(list.map(x => x.id)) };
  } catch { return null; }
}

// ───── Revisión de los avisos (Ajustes → Avisos → Revisar mis avisos) ─────
const DIAG = 'miagenda.avisos.diag';
export function lastRun() { try { return JSON.parse(localStorage.getItem(DIAG) || 'null'); } catch { return null; } }
function saveRun(d) { try { localStorage.setItem(DIAG, JSON.stringify(d)); } catch { /* sin almacenamiento */ } }

// Lo que puede impedir que un aviso llegue: permiso, avisos exactos, batería y tipos de aviso apagados
export async function health() {
  const LN = plug('LocalNotifications'), W = plug('AgendaWidget');
  const out = { perm: state.perm, exact: state.exact, battery: null, channelsOff: [], old: false };
  if (!LN) return out;
  try { out.perm = (await LN.checkPermissions()).display; } catch { /* sin dato */ }
  try { out.exact = (await LN.checkExactNotificationSetting()).exact_alarm; state.exact = out.exact; } catch { /* Android viejo: no aplica */ }
  try {
    const ch = (await LN.listChannels()).channels || [];
    const off = CHANNELS.filter(c => { const x = ch.find(y => y.id === c.id); return x && Number(x.importance) === 0; });
    out.channelsOff = off.map(c => c.name); out.channelsOffIds = off.map(c => c.id);
  } catch { /* sin dato */ }
  try { out.battery = await W.battery(); } catch { out.old = true; }   // la app instalada es anterior a la 1.12
  state.health = out;
  return out;
}
// Se revisa al abrir y al volver a la app: si hay un tipo de aviso apagado, Hoy lo avisa
function refreshHealth() { health().then(() => handlers.changed()).catch(() => {}); }
// Abre la pantalla del teléfono para arreglarlo: 'battery' (quitar la restricción), 'notifications' o un canal
export async function openPhoneSettings(what, channel = '') {
  const W = plug('AgendaWidget');
  try { await W.openSettings({ what, channel }); return true; } catch { return false; }
}
// Rutinas de un día y en qué quedó cada una: ya hecha, con aviso programado o sin aviso
export async function routineStatus(iso = today()) {
  const me = store.doneId();
  const pend = await pendingSummary();
  // Las rutinas y los demás eventos que se repiten (menos las reuniones y asignaciones): así ves cuáles no preguntan
  const evs = M.agendaFor(iso).events.filter(e => M.isRoutine(e) || (M.isRepeating(e) && !e.congreAuto && !['reunion', 'ancianos', 'asignacion'].includes(e.category)));
  return evs.map(e => {
    const routine = M.isRoutine(e);
    const r = routineTimes(e);
    const forMe = (pend?.all || []).filter(x => x.extra?.day === iso && (x.extra.eid === e.id || (x.extra.eids || []).includes(e.id)));
    const firstPending = forMe.some(x => x.extra.kind === 'routine');
    const lastPending = forMe.some(x => x.extra.kind === 'last' || x.extra.kind === 'streak');
    return { e, routine, done: M.isDoneBy(e, iso, me), first: r.first, last: r.lastOk ? LAST : null, firstPending, lastPending, scheduled: firstPending || lastPending };
  });
}
// Vuelve a programar ahora mismo (botón en la revisión)
export async function rescheduleNow() {
  if (!isNative || !state.ready) return false;
  clearTimeout(timer);
  await (chain = chain.then(doSchedule).catch(() => {}));
  return true;
}
export async function test() {
  const LN = plug('LocalNotifications');
  if (!LN) return false;
  await LN.schedule({ notifications: [{ id: 1, title: 'Mi Agenda', body: '✓ Los avisos de la app funcionan en este teléfono.', channelId: 'rutinas', schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true }, smallIcon: 'ic_stat_agenda', extra: { kind: 'test' } }] });
  return true;
}

// Reprograma los avisos (se llama cuando cambian los datos; espera un momento para agrupar cambios)
let chain = Promise.resolve(), waits = 0;
export function schedule() {
  if (!isNative || !state.ready) return;
  clearTimeout(timer);
  timer = setTimeout(run, 2500);
}
function run() {
  // Espera a que lleguen tus datos: si se programara con la agenda a medio cargar, se perderían avisos
  if (!store.synced() && waits++ < 20) { timer = setTimeout(run, 1500); return; }
  waits = 0;
  chain = chain.then(doSchedule).catch(e => console.warn('Avisos', e));   // uno a la vez
}

function prefs() {
  return { hour: 7, tasks: true, events: true, junta: true, before: 10, logAt: 1230, soon: true, routine: true, routineLast: true, streak: true, taskTime: true, taskDay: true, taskHour: 9, meetingSoon: true, tomorrow: true, report: true, details: false, ...(M.profile().notif || {}) };
}

// Rutinas: primer aviso media hora después de que termina (o 1 h 30 después de empezar si no tiene hora de fin)
// y un último aviso a las 9:00 p. m. si el primero fue temprano y aún no la marcaste.
const LAST = 21 * 60;
function routineTimes(e) {
  const s = toMin(e.time);
  const end = toMin(e.endTime) ?? (s != null ? s + 60 : null);
  const first = end != null ? Math.min(end + 30, 23 * 60 + 30) : 21 * 60;
  return { first, lastOk: first <= LAST - 60 };
}

function planFor(iso, p, errs = []) {
  const out = [];
  const add = (min, key, body, channelId, extra = {}, title = 'Mi Agenda') => {
    if (min == null || !Number.isFinite(min) || min < 0 || min >= 24 * 60) return;
    const when = at(iso, Math.round(min));
    if (!Number.isFinite(when.getTime()) || when.getTime() < Date.now() + 20000) return;
    out.push({ id: hash(`${key}:${iso}`), title, body, channelId, schedule: { at: when, allowWhileIdle: true }, smallIcon: 'ic_stat_agenda', extra: { app: 'agenda', ...extra, at: when.getTime() },
      ...(extra.eid ? { actionTypeId: 'rutina' } : {}), ...(extra.kind === 'log' ? { actionTypeId: 'registro', ongoing: false, autoCancel: true } : {}) });
  };
  // Cada parte va por separado: si una falla, las demás se programan igual
  const safe = (name, fn) => { try { fn(); } catch (e) { errs.push(`${name}: ${e?.message || e}`); console.warn('Aviso no programado', name, e); } };
  const me = store.doneId();
  const before = Math.max(0, Number(p.before) || 0);
  const a = M.agendaFor(iso);
  // Resumen de la mañana
  if (p.hour != null) safe('resumen', () => {
    const lines = [];
    const tasks = data.tasks.filter(t => t.status !== 'hecha' && M.isMineTask(t));
    const dueToday = tasks.filter(t => t.due === iso).length, late = tasks.filter(t => t.due && t.due < iso).length;
    if (p.tasks && dueToday) lines.push(`📋 ${plural(dueToday, 'tarea', 'tareas')} para hoy`);
    if (p.tasks && late) lines.push(`⏰ ${plural(late, 'tarea atrasada', 'tareas atrasadas')}`);
    if (p.events && a.events.length) lines.push(`📅 ${plural(a.events.length, 'compromiso', 'compromisos')} hoy`);
    if (p.junta) a.meetings.forEach(m => lines.push(`🗓 Hoy: ${p.details ? m.title : 'reunión'}${m.time ? ` a las ${fmtTime(m.time)}` : ''}`));
    // Lo de la congregación va aparte: si algo falla ahí, el resumen sale igual
    try { if (M.isModuleVisible('congregacion')) { const vn = visitNotice(iso); if (vn && (vn.days <= 14 || vn.next)) lines.push(`🧳 Visita del superintendente de circuito ${vn.days > 0 ? `en ${vn.days} días` : 'esta semana'}${vn.pend ? `: faltan ${vn.pend}` : ' ✓'}${vn.next ? ` · ${vn.next.it.t.split(' (')[0]} ${vn.next.date < iso ? 'venció el' : 'antes del'} ${vn.next.date.slice(8)}/${vn.next.date.slice(5, 7)}` : ''}`); } } catch (e) { errs.push(`visita: ${e?.message || e}`); }
    try { if (M.isModuleVisible('congregacion')) { const rv = M.reviewsDue(iso, 0); if (rv.length) lines.push(`🎓 Toca revisar la capacitación: ${rv.slice(0, 3).map(d => d.name).join(', ')}${rv.length > 3 ? '…' : ''}`); } } catch (e) { errs.push(`capacitaciones: ${e?.message || e}`); }
    try { if (p.assign) M.assignmentsToPrepare(iso).forEach(({ e, inDays }) => lines.push(`🎤 ${inDays === 0 ? 'Hoy' : inDays === 1 ? 'Mañana' : `En ${inDays} días`}: ${e.asg || 'tu asignación'}${p.details && e.title && e.title !== e.asg ? ` · ${e.title}` : ''}${inDays ? ' (prepárala)' : ''}`)); } catch (e) { errs.push(`asignaciones: ${e?.message || e}`); }
    try {
      if (p.follow && new Date(`${iso}T12:00:00`).getDay() === 1) {
        const s = M.studentsLate(iso).length, pl = M.pastoreoLate(iso).length;
        if (s) lines.push(`📖 ${plural(s, 'curso bíblico espera', 'cursos bíblicos esperan')} tu visita`);
        if (pl) lines.push(`🐑 ${plural(pl, 'hermano', 'hermanos')} sin visita de pastoreo en ${M.pastoreoMonths()} meses`);
      }
    } catch (e) { errs.push(`seguimiento: ${e?.message || e}`); }
    // Precursores / con meta: cómo vas y cuánto te toca hoy para llegar
    try {
      const v = M.profile();
      if (v.goalEnabled && Number(v.goalMonthly) > 0) {
        const mid = iso.slice(0, 7), done = M.monthTotals(mid).minutes, goal = Number(v.goalMonthly);
        const ps = M.paceStatus(mid, done, goal);
        const left = Math.max(0, goal * 60 - done), days = Math.max(1, M.daysLeftInMonth(mid));
        if (ps) lines.push(left ? `${ps.emoji} Llevas ${M.fmtHM(done)} de ${goal} h; hoy te tocan unas ${M.fmtHM(Math.ceil(left / days / 5) * 5)} h` : `🎉 ¡Ya llegaste a tu meta de ${goal} h este mes!`);
      }
    } catch (e) { errs.push(`meta: ${e?.message || e}`); }
    if (lines.length) add(Number(p.hour) * 60, 'daily', lines.join('\n'), 'general', { kind: 'daily' }, 'Mi Agenda · tu día');
  });
  // Eventos y rutinas (texto diario, lectura…). En las rutinas, los avisos traen «✓ Ya lo hice».
  const lastCalls = [];
  a.events.forEach(e => safe(`evento «${e.title || ''}»`, () => {
    const s = toMin(e.time);
    const routine = M.isRoutine(e);
    const done = routine && M.isDoneBy(e, iso, me);
    const ids = { eid: e.id, day: iso };
    if (p.soon && s != null && before && !done) add(s - before, `ev:${e.id}`, `⏰ En ${before} min: ${e.title}${e.time ? ` (${fmtTime(e.time)})` : ''}${e.place ? ` · ${e.place}` : ''}`, routine ? 'rutinas' : 'eventos', routine ? { kind: 'soon', ...ids } : { kind: 'soon' });
    if (!routine || done) return;
    const { first, lastOk } = routineTimes(e);
    const st = p.streak ? M.streak(e, me, iso) : 0;
    if (p.routine) add(first, `rt:${e.id}`, `📖 Aún no marcaste «${e.title}» de hoy. ¿Ya lo hiciste?${st >= 3 && !lastOk ? ` 🔥 Llevas ${st} días seguidos.` : ''}`, 'rutinas', { kind: 'routine', ...ids });
    if ((lastOk || !p.routine) && (st >= 3 || (p.routine && p.routineLast !== false && lastOk))) lastCalls.push({ e, st });
  }));
  // Último aviso de la noche: uno solo aunque sean varias rutinas
  safe('último aviso', () => {
    if (lastCalls.length === 1) {
      const { e, st } = lastCalls[0];
      add(LAST, `rl:${e.id}`, st >= 3 ? `🔥 Llevas ${st} días seguidos con «${e.title}». ¿Ya lo hiciste hoy? ¡No pierdas la racha!`
        : `🌙 Último aviso: aún no marcaste «${e.title}» de hoy. Si ya lo hiciste, toca «✓ Ya lo hice».`, 'rutinas', { kind: st >= 3 ? 'streak' : 'last', eid: e.id, day: iso });
    } else if (lastCalls.length > 1) {
      const racha = lastCalls.some(x => x.st >= 3);
      add(LAST, 'rl', `🌙 Aún no marcaste ${lastCalls.length} rutinas de hoy: ${lastCalls.slice(0, 4).map(x => `«${x.e.title}»`).join(', ')}${lastCalls.length > 4 ? '…' : ''}.${racha ? ' 🔥 ¡No pierdas tus rachas!' : ' Toca para marcarlas.'}`, 'rutinas', { kind: 'last', day: iso, eids: lastCalls.map(x => x.e.id) });
    }
  });
  if (p.taskTime) safe('tareas con hora', () => a.tasks.filter(t => M.isMineTask(t) && toMin(t.dueTime) != null)
    .forEach(t => add(toMin(t.dueTime) - before, `tk:${t.id}`, p.details ? `📋 A las ${fmtTime(t.dueTime)}: ${t.title}` : `📋 Tienes una tarea a las ${fmtTime(t.dueTime)}`, 'general', { kind: 'task' })));
  // Tareas del día sin hora (y las atrasadas): un aviso a media mañana con sus títulos
  if (p.taskDay) safe('tareas del día', () => {
    const mine = data.tasks.filter(t => t.status !== 'hecha' && M.isMineTask(t));
    const dayT = mine.filter(t => t.due === iso && toMin(t.dueTime) == null);
    const late = iso === today() ? mine.filter(t => t.due && t.due < iso) : [];
    const name = t => (p.details ? t.title : 'una tarea');
    const hr = (Number(p.taskHour) || 9) * 60;
    if (dayT.length === 1) add(hr, `td:${dayT[0].id}`, `📋 Hoy vence: ${name(dayT[0])}`, 'general', { kind: 'task' });
    else if (dayT.length > 1) add(hr, 'td', `📋 Hoy vencen ${dayT.length} tareas${p.details ? `: ${dayT.slice(0, 4).map(t => t.title).join(' · ')}${dayT.length > 4 ? '…' : ''}` : ''}`, 'general', { kind: 'task' });
    if (late.length) add(hr + 1, 'tl', `⏰ ${plural(late.length, 'tarea atrasada', 'tareas atrasadas')}${p.details ? `: ${late.slice(0, 4).map(t => t.title).join(' · ')}${late.length > 4 ? '…' : ''}` : '. Toca para verlas.'}`, 'general', { kind: 'task' });
  });
  if (p.meetingSoon) safe('reuniones', () => a.meetings.filter(m => toMin(m.time) != null).forEach(m => {
    const n = (m.agenda || []).length;
    add(toMin(m.time) - 60, `mt:${m.id}`, `🗓 En 1 hora: ${p.details ? m.title : 'reunión'} (${fmtTime(m.time)})${n ? ` · agenda de ${plural(n, 'punto', 'puntos')}` : ''}${n && !m.agendaSentAt ? ' · aún no la enviaste' : ''}`, 'general', { kind: 'meeting' });
  }));
  if (p.tomorrow) safe('mañana', () => {
    const tm = M.agendaFor(addDays(iso, 1)).events.filter(e => e.time).sort((x, y) => x.time.localeCompare(y.time));
    if (tm.length) add(21 * 60 + 30, 'tm', `🌙 Mañana: ${plural(tm.length, 'evento', 'eventos')}; el primero, ${tm[0].title} a las ${fmtTime(tm[0].time)}.`, 'general', { kind: 'tomorrow' });
  });
  // Domingo en la noche: si hace más de una semana que no guardas un respaldo, te lo recuerda
  if (p.backup !== false && new Date(`${iso}T12:00:00`).getDay() === 0) safe('respaldo', () => {
    let last = ''; try { last = localStorage.getItem('miagenda.ultimoRespaldo') || ''; } catch { /* sin almacenamiento */ }
    if (!last || diffDaysISO(iso, last) >= 7) add(20 * 60, 'bk', '☁️ Guarda tu respaldo semanal en Google Drive: Ajustes → Mis datos → Guardar respaldo en Google Drive.', 'general', { kind: 'backup' });
  });
  // Registro de la noche (importante, siempre activo si usas Mi Informe)
  if (M.isModuleVisible('informe') && !(M.profile().noActivityDays || []).includes(iso)) safe('registro', () => {
    const hoy = data.entries.filter(e => e.date === iso);
    const mins = hoy.reduce((s, e) => s + (Number(e.minutes) || 0), 0);
    const cursos = hoy.reduce((s, e) => s + (Array.isArray(e.studyNames) ? e.studyNames.length : Number(e.studies) || 0), 0);
    const body = hoy.length ? `📝 Hoy registraste ${M.fmtHM(mins)} h${cursos ? ` y ${plural(cursos, 'curso', 'cursos')}` : ''}. ¿Te falta algo por anotar?`
      : '📝 Registra tu actividad de hoy: aún no guardaste horas ni cursos. Hazlo antes de que termine el día.';
    add(Number(p.logAt) || 1230, 'lg', body, 'registro', { kind: 'log' }, 'Importante · Mi Agenda');
  });
  return out;
}

// ───── Avisos que manda el servidor (eventos compartidos, rutinas de la familia, versión nueva) ─────
// Necesitan Firebase Cloud Messaging nativo: solo si esta app trae su configuración (google-services.json).
async function registerPush() {
  const PN = plug('PushNotifications'), W = plug('AgendaWidget');
  if (!PN || !W) return;
  try {
    if (!(await W.info()).fcm) return;
    await PN.addListener('registration', t => {
      let id = '';
      try { id = localStorage.getItem('miagenda.nativo') || ''; if (!id) { id = `app-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; localStorage.setItem('miagenda.nativo', id); } } catch { id = 'app-telefono'; }
      store.saveDevice(id, { token: t.value, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Caracas', native: true, mobile: true }).catch(() => {});
    });
    await PN.addListener('pushNotificationActionPerformed', ev => {
      const x = ev.notification?.data || {};
      if (x.eid && x.day) handlers.done(x.eid, x.day);
    });
    const perm = await PN.requestPermissions();
    if (perm.receive === 'granted') await PN.register();
    state.push = true;
  } catch (e) { console.warn('Avisos del servidor no disponibles', e); }
}

// ───── Widget de la pantalla de inicio ─────
function updateWidget() {
  const W = plug('AgendaWidget');
  if (!W) return;
  const t = today();
  const a = M.agendaFor(t);
  const me = store.doneId();
  const items = M.entriesFor(a).slice(0, 6).map(({ kind, item }) => {
    const done = kind === 'event' && M.isRepeating(item) && M.isDoneBy(item, t, me);
    return `${item.time ? fmtTime(item.time).replace(' a. m.', 'a').replace(' p. m.', 'p') : '•'}  ${item.title}${done ? '  ✓' : ''}`;
  });
  const pend = a.tasks.filter(x => M.isMineTask(x)).length;
  if (pend) items.push(`📋 ${plural(pend, 'tarea', 'tareas')} para hoy`);
  const hoy = data.entries.filter(e => e.date === t);
  const mins = hoy.reduce((s, e) => s + (Number(e.minutes) || 0), 0);
  const skip = (M.profile().noActivityDays || []).includes(t);
  const footer = hoy.length ? `Registrado hoy: ${M.fmtHM(mins)} h` : skip ? 'Hoy: sin actividad (marcado)' : 'Aún no registras la actividad de hoy';
  const d = new Date();
  const title = `Hoy · ${['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][d.getDay()]} ${d.getDate()}`;
  // Rutinas de hoy para los botones ✓ del widget (primero las que faltan)
  const routines = a.events.filter(e => M.isRoutine(e)).map(e => ({ e: e.id, t: e.title, d: M.isDoneBy(e, t, me) }))
    .sort((x, y) => Number(x.d) - Number(y.d)).slice(0, 2);
  W.update({ title, lines: items.join('\n') || 'Nada programado para hoy.', footer, routines: JSON.stringify(routines), day: t }).catch(() => {});
}
export function refreshWidget() { try { updateWidget(); } catch { /* sin widget */ } }
// Después de marcar desde el widget: la app vuelve sola a la pantalla de inicio
export function minimize() { try { plug('App')?.minimizeApp?.(); } catch { /* no disponible */ } }

// Limpia el aviso fijo del cronómetro (función retirada en 5.3)
async function clearOldTimer(LN) {
  await LN.removeDeliveredNotifications({ notifications: [{ id: 2 }] }).catch(() => {});
  await LN.cancel({ notifications: [{ id: 2 }] }).catch(() => {});
}

async function doSchedule() {
  try { updateWidget(); } catch (e) { console.warn('Widget no actualizado', e); }
  const LN = plug('LocalNotifications');
  if (!LN) return;
  clearOldTimer(LN);
  const rec = { at: new Date().toISOString(), n: 0, errors: [], exact: state.exact || '', version: M.APP_VERSION };
  try {
    const p = prefs();
    const t = today();
    const all = [];
    // Una semana por delante (así llegan aunque no abras la app en varios días); Android admite hasta 500
    for (let i = 0; i < 7; i++) { try { all.push(...planFor(addDays(t, i), p, rec.errors)); } catch (e) { rec.errors.push(`día ${i + 1}: ${e?.message || e}`); } }
    const list = all.sort((x, y) => x.schedule.at - y.schedule.at).slice(0, 200);
    // Sin el permiso de avisos exactos se programan normales (si no, Android abriría sus ajustes cada vez)
    const exact = state.exact !== 'denied';
    list.forEach(n => { n.isExactNotification = exact; });
    // Primero se programan los nuevos (con el mismo número reemplazan a los anteriores) y después se quitan los que
    // ya no van: así el teléfono nunca se queda sin avisos si algo falla a mitad de camino.
    if (list.length) await LN.schedule({ notifications: list });
    const keep = new Set(list.map(n => n.id));
    const now = Date.now();
    const pending = (await LN.getPending()).notifications || [];
    const stale = pending.filter(n => {
      if (n.id === 1 || n.id === 3 || keep.has(n.id)) return false;
      const when = whenOf(n);
      if (when && when < now + 60000) return doneFor(n.extra);   // ya le tocaba o está por sonar: se deja, salvo si ya marcaste esa rutina
      return true;
    });
    if (stale.length) await LN.cancel({ notifications: stale.map(n => ({ id: n.id })) });
    await clearDoneDelivered(LN);
    reportHorizon(list);
    rec.n = list.length;
    rec.next = list.filter(n => n.extra?.eid || n.extra?.kind === 'last').slice(0, 6).map(n => ({ at: n.extra.at, body: String(n.body).slice(0, 140) }));
  } catch (e) { rec.errors.push(String(e?.message || e)); console.warn('No se pudieron programar los avisos', e); }
  saveRun(rec);
}

// Plan B: el servidor sabe hasta cuándo tiene avisos este teléfono. Si se queda sin ellos (no abres la app en
// días o Android los borró), el servidor manda los importantes también al teléfono. Se avisa como mucho cada 6 horas.
function reportHorizon(list) {
  if (!store.isCloud || !list.length) return;
  const until = new Date(Math.max(...list.map(n => Number(n.extra?.at) || 0))).toISOString();
  store.patchProfile(v => {
    const prev = v.nativeSched || {};
    const old = !prev.at || Date.now() - Date.parse(prev.at) > 6 * 3600e3;
    const moved = Math.abs(Date.parse(prev.until || 0) - Date.parse(until)) > 12 * 3600e3;
    return old || moved ? { nativeSched: { at: new Date().toISOString(), until, n: list.length, v: M.APP_VERSION } } : null;
  });
}

// ¿Ese aviso es de una rutina que ya marcaste?
function doneFor(x) {
  const ev = x?.eid && store.get('events', x.eid);
  return !!(ev && x.day && M.isDoneBy(ev, x.day, store.doneId()));
}
// Si ya marcaste la rutina (en la app o en otro teléfono), quita de la barra el aviso «¿Ya lo hiciste?» de hoy
async function clearDoneDelivered(LN) {
  try {
    const t = today(), me = store.doneId();
    const ids = new Set();
    M.agendaFor(t).events.filter(e => M.isRepeating(e) && M.isDoneBy(e, t, me)).forEach(e => ['rt', 'rl', 'st', 'ev'].forEach(k => ids.add(hash(`${k}:${e.id}:${t}`))));
    if (!ids.size) return;
    const shown = ((await LN.getDeliveredNotifications()).notifications || []).filter(n => ids.has(n.id));
    if (shown.length) await LN.removeDeliveredNotifications({ notifications: shown.map(n => (n.tag ? { id: n.id, tag: n.tag } : { id: n.id })) });
  } catch { /* no disponible en este teléfono */ }
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
    state.update = n > state.build ? { build: n, name: rel.name || `1.${n}`, notes: rel.body || '', url: APK_URL, alt: asset?.browser_download_url || APK_URL_GITHUB } : null;
    handlers.changed();
  } catch { /* sin internet: se revisa después */ }
}
// Descargar e instalar la app nueva.
// App con el instalador propio: descarga con el administrador de Android y abre el instalador al terminar.
// App anterior: abre el enlace en el navegador del teléfono (no dentro de la app, donde la descarga se quedaba «Descargando…»).
export async function openDownload() {
  const url = state.update?.url || APK_URL;
  const W = plug('AgendaWidget');
  try {
    const r = await W?.installApk({ url });
    if (r?.status === 'permiso') return toast('Activa «Permitir de esta fuente» para Agenda Teocrática y vuelve a tocar Actualizar');
    if (r?.status) return toast('Descargando… verás el avance arriba y luego se abre el instalador');
  } catch { /* app anterior sin instalador propio */ }
  try { await W?.openExternal({ url }); return; } catch { /* sin método */ }
  location.href = url;   // Capacitor abre los enlaces de otros sitios en el navegador del teléfono
}
