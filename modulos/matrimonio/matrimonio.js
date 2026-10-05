// 💑 Matrimonio · módulo aparte (no cambia ningún archivo de la app)
//
// Para activarlo:  una línea en index.html →  <script type="module" src="modulos/matrimonio/matrimonio.js"></script>
// Para quitarlo:   se borra esa línea y la carpeta modulos/matrimonio. La app queda como estaba.
//
// Cómo se integra sin tocar el código existente:
//  · Lee la agenda (reuniones, predicación, pastoreo, ancianos, asignaciones, mecánicas, visita del superintendente)
//    para sugerir días libres, avisar choques y proponer actividades espirituales en pareja.
//  · Lo que se planea se guarda como EVENTO normal de la Agenda (título con «💑») y, si hay cónyuge con cuenta,
//    como evento compartido. Así los avisos del teléfono, el servidor, el widget y Google Calendar funcionan solos.
//  · Las fechas especiales son TAREAS que se repiten cada año (con aviso el día y una semana antes).
//  · Sus ajustes, ideas y conversaciones se guardan en el perfil, en un solo campo: profile.matrimonio.
//  · Entra por «Más», por una tarjeta en Hoy y, en la computadora, por el menú de la izquierda.

import * as store from '../../js/store.js';
import { data, isCloud, session } from '../../js/store.js';
// Solo para las cuentas a las que el administrador se lo activó (función «💑 Matrimonio»); el administrador lo ve siempre
const allowed = () => M.featureOn('general.matrimonio');
import * as M from '../../js/model.js';
import * as S from '../../js/sheets.js';
import { myMecas } from '../../js/mecas.js';
import { esc, uid, today, toast, addDays, diffDays, parseISO, fmtShort, fmtLong, fmtTime, DIAS, MESES, cap } from '../../js/util.js';

const TAG = '💑';
const PINK = '#F2A7C3';
const NAME = 'Matrimonio';

// ───────────── Ajustes del módulo (profile.matrimonio) ─────────────
const DEF = {
  spouseUid: '', spouseName: '', share: true, showHoy: true, hidden: false,
  wkFrom: '18:00', weFrom: '09:00', until: '21:30',
  anniversary: '', dates: [],       // dates: [{ id, t, d }]
  dateTasks: {},                                                // { clave: [ids de tareas creadas] }
  checkDay: 0, checkTime: '19:30', checkEventId: '',
  checkins: [],                                                 // [{ id, d, h (1-5), good, better, plan }]
  ideas: [], hiddenIdeas: [], habits: ['familia', 'predicar', 'estudio'],
};
const cfg = () => ({ ...DEF, ...(M.profile().matrimonio || {}) });
function save(changes) {
  store.patchProfile(v => ({ matrimonio: { ...DEF, ...(v.matrimonio || {}), ...(typeof changes === 'function' ? changes(cfg()) : changes) } }));
}
const spouse = () => cfg().spouseName || 'tu cónyuge';
const canShare = () => isCloud && !!store.myUid() && !!cfg().spouseUid && cfg().share && M.featureOn('agenda.compartir');

// ───────────── Banco de ideas ─────────────
// k = tipo · cat = tipo de evento de la Agenda · min = duración
const KINDS = {
  cita: { n: 'Citas y tiempo juntos', e: '❤️' },
  espiritual: { n: 'Espiritual en pareja', e: '📖' },
  servicio: { n: 'Hospitalidad y servicio', e: '🤝' },
  detalle: { n: 'Detalles (sorpresa, no se comparte)', e: '🎁' },
};
const IDEAS = [
  { id: 'i1', k: 'cita', t: 'Cena especial en casa', cat: 'personal', min: 120, at: '19:00' },
  { id: 'i2', k: 'cita', t: 'Caminata o paseo al parque', cat: 'personal', min: 90 },
  { id: 'i3', k: 'cita', t: 'Desayuno fuera', cat: 'personal', min: 90, at: '08:00' },
  { id: 'i4', k: 'cita', t: 'Cocinar juntos una receta nueva', cat: 'personal', min: 120 },
  { id: 'i5', k: 'cita', t: 'Ver juntos las fotos de la boda', cat: 'personal', min: 60 },
  { id: 'i6', k: 'cita', t: 'Noche de juegos de mesa', cat: 'personal', min: 90, at: '19:30' },
  { id: 'i7', k: 'cita', t: 'Salida a la playa o a la montaña', cat: 'personal', min: 300 },
  { id: 'i8', k: 'cita', t: 'Ir por un helado y conversar', cat: 'personal', min: 60, at: '17:00' },
  { id: 'e1', k: 'espiritual', t: 'Adoración en familia', cat: 'familia', min: 60, habit: 'familia', at: '19:30' },
  { id: 'e2', k: 'espiritual', t: 'Predicar juntos', cat: 'predicacion', min: 120, habit: 'predicar' },
  { id: 'e3', k: 'espiritual', t: 'Leer juntos la Biblia', cat: 'estudio', min: 30, habit: 'estudio' },
  { id: 'e4', k: 'espiritual', t: 'Preparar juntos La Atalaya', cat: 'estudio', min: 60, habit: 'estudio' },
  { id: 'e5', k: 'espiritual', t: 'Preparar juntos la reunión de entre semana', cat: 'estudio', min: 60, habit: 'estudio' },
  { id: 'e6', k: 'espiritual', t: 'Analizar juntos el texto diario', cat: 'estudio', min: 20, habit: 'estudio' },
  { id: 'e7', k: 'espiritual', t: 'Ver juntos JW Broadcasting', cat: 'familia', min: 60, habit: 'familia' },
  { id: 'e8', k: 'espiritual', t: 'Leer un artículo de «Ayuda para la familia»', cat: 'familia', min: 45, habit: 'familia' },
  { id: 's1', k: 'servicio', t: 'Invitar a comer a una pareja de la congregación', cat: 'personal', min: 150, at: '12:30' },
  { id: 's2', k: 'servicio', t: 'Visitar juntos a un hermano enfermo o mayor', cat: 'pastoreo', min: 60 },
  { id: 's3', k: 'servicio', t: 'Ayudar juntos en la limpieza del Salón', cat: 'personal', min: 120 },
  { id: 'd1', k: 'detalle', t: 'Escribirle una nota de cariño', min: 0 },
  { id: 'd2', k: 'detalle', t: 'Llevarle algo que le guste', min: 0 },
  { id: 'd3', k: 'detalle', t: 'Encargarme de una tarea de la casa que le toca', min: 0 },
  { id: 'd4', k: 'detalle', t: 'Darle las gracias por algo concreto', min: 0 },
];
const ideas = () => [...IDEAS.filter(i => !cfg().hiddenIdeas.includes(i.id)), ...cfg().ideas];
const ideaById = id => ideas().find(i => i.id === id) || IDEAS.find(i => i.id === id);

const HABITS = {
  familia: { t: 'Adoración en familia', idea: 'e1', test: e => e.category === 'familia' || /adoraci[oó]n en familia/i.test(e.title || '') },
  predicar: { t: 'Predicar juntos', idea: 'e2', test: e => e.category === 'predicacion' && isOurs(e) },
  estudio: { t: 'Leer o preparar juntos', idea: 'e3', test: e => e.category === 'estudio' && isOurs(e) },
};

// ───────────── Lectura de la agenda ─────────────
const toMin = t => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const toHHMM = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
const THEO = ['reunion', 'predicacion', 'pastoreo', 'ancianos', 'asignacion', 'estudio'];
const DUR = { reunion: 120, predicacion: 150, pastoreo: 90, ancianos: 120, asignacion: 60, estudio: 60, familia: 60, personal: 60 };
const TRAVEL = { reunion: 30, predicacion: 15, pastoreo: 15, ancianos: 20 };
const isTheo = e => THEO.includes(e.category) && !isOurs(e);
export const isOurs = e => String(e.title || '').startsWith(TAG)
  || (!!e.sharedId && !!cfg().spouseUid && (e.members || []).includes(cfg().spouseUid) && (e.members || []).length === 2);
const weekStart = iso => addDays(iso, -((parseISO(iso).getDay() + 6) % 7));
const isWeekend = iso => [0, 6].includes(parseISO(iso).getDay());
const occ = (e, iso) => M.occursOn(e, iso);
const evsOn = iso => M.agendaFor(iso).events;

function busyOf(iso) {
  return evsOn(iso).map(e => {
    const s = toMin(e.time);
    if (s == null) return { e, allDay: true };
    let en = toMin(e.endTime);
    if (en == null || en <= s) en = s + (DUR[e.category] || 60);
    const tr = TRAVEL[e.category] || 0;
    return { e, s: s - tr, en: en + tr, s0: s, en0: en };
  });
}

// Lo teocrático de un día (para mostrar por qué un día está ocupado)
function theoInfo(iso) {
  const out = [];
  evsOn(iso).filter(e => isTheo(e) && !M.isRoutine(e)).forEach(e => out.push(`${M.isAssignment(e) ? '🎤' : '•'} ${e.title}${e.time ? ` ${fmtTime(e.time)}` : ''}`));
  try { myMecas(30).filter(m => m.d === iso).forEach(m => out.push(`🪑 ${m.roles.join(', ')}`)); } catch { /* sin mecánicas */ }
  const v = (data.visitas || []).find(x => x.start && iso >= x.start && iso <= addDays(x.start, 6));
  if (v) out.push('🧳 Semana de la visita del superintendente');
  const prep = M.upcomingAssignments(iso, 7).find(x => x.inDays > 0 && x.inDays <= (Number(x.e.prep) || 0));
  if (prep) out.push(`📝 Preparando: ${prep.e.asg || prep.e.title} (${fmtShort(prep.date)})`);
  return out;
}

// Ratos libres de un día dentro de tu horario (entre semana desde wkFrom, fin de semana desde weFrom, hasta until)
function freeGaps(iso, minLen = 60) {
  const c = cfg();
  let ws = toMin(isWeekend(iso) ? c.weFrom : c.wkFrom) ?? 1080, we = toMin(c.until) ?? 1290;
  if (iso === today()) { const n = new Date(); ws = Math.max(ws, Math.ceil((n.getHours() * 60 + n.getMinutes() + 30) / 15) * 15); }
  const busy = busyOf(iso);
  if (busy.some(b => b.allDay && isTheo(b.e))) return [];          // asamblea, día completo de predicación…
  const iv = busy.filter(b => !b.allDay).map(b => [b.s, b.en]).sort((a, b) => a[0] - b[0]);
  const gaps = []; let cur = ws;
  iv.forEach(([s, en]) => { if (s > cur) gaps.push([cur, Math.min(s, we)]); cur = Math.max(cur, en); });
  if (cur < we) gaps.push([cur, we]);
  return gaps.filter(([a, b]) => b - a >= minLen);
}

// Mejores días de los próximos «days» días para estar juntos
export function suggestDays(days = 14, n = 4, minLen = 90) {
  const t = today(), out = [];
  for (let i = 0; i < days; i++) {
    const iso = addDays(t, i);
    const gaps = freeGaps(iso, minLen);
    if (!gaps.length) continue;
    const best = gaps.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a));
    const info = theoInfo(iso);
    const ours = evsOn(iso).filter(isOurs).length;
    const score = Math.min(best[1] - best[0], 180) + (isWeekend(iso) ? 30 : 0) - info.length * 45 - ours * 120 - i * 3;
    out.push({ iso, from: best[0], to: best[1], info, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, n).sort((a, b) => a.iso.localeCompare(b.iso));
}

// Lo que choca con un horario
function conflicts(iso, time, end) {
  const s = toMin(time); if (s == null) return [];
  const en = toMin(end) ?? s + 60;
  return busyOf(iso).filter(b => !b.allDay && b.s0 < en && b.en0 > s).map(b => b.e);
}

// Hora para una idea en un día: su hora preferida (at) si está libre; si no, el primer rato libre donde quepa
function fitTime(iso, idea, from) {
  const dur = idea?.min || 60;
  if (idea?.at) { const a = toMin(idea.at); if (!conflicts(iso, idea.at, toHHMM(Math.min(a + dur, 1439))).length) return idea.at; }
  const g = freeGaps(iso, Math.min(dur, 60)).find(([a, b]) => (from == null || b > from) && b - Math.max(a, from ?? a) >= Math.min(dur, 60));
  if (g) return toHHMM(Math.max(g[0], from ?? g[0]));
  return from != null ? toHHMM(from) : '';
}

// Próximas actividades juntos (las que planeaste aquí o te compartió tu cónyuge)
function upcoming(days = 30) {
  const t = today(), out = [];
  for (let i = 0; i <= days; i++) {
    const iso = addDays(t, i);
    evsOn(iso).filter(isOurs).forEach(e => { if (!(iso === t && e.endTime && toMin(e.endTime) < new Date().getHours() * 60 + new Date().getMinutes())) out.push({ e, iso }); });
  }
  return out;
}
const doneOn = (e, iso) => (e.doneLog?.[iso] || []).length > 0;
// ¿Se cumplió el hábito esta semana? → 'hecho' | 'planeado' | ''
function habitWeek(k, ws = weekStart(today())) {
  const h = HABITS[k]; if (!h) return { st: '' };
  const t = today(); let planned = null;
  for (let i = 0; i < 7; i++) {
    const iso = addDays(ws, i);
    const e = evsOn(iso).find(h.test);
    if (!e) continue;
    if (iso < t || doneOn(e, iso)) return { st: 'hecho', e, iso };
    if (!planned) planned = { st: 'planeado', e, iso };
  }
  return planned || { st: '' };
}
function familiaStreak() {
  let ws = weekStart(today()), n = 0;
  if (habitWeek('familia', ws).st !== 'hecho') ws = addDays(ws, -7);
  for (let i = 0; i < 104 && habitWeek('familia', ws).st === 'hecho'; i++, ws = addDays(ws, -7)) n++;
  return n;
}
function monthCount(ym = today().slice(0, 7)) {
  const t = today(); let citas = 0, esp = 0;
  for (let d = `${ym}-01`; d.slice(0, 7) === ym && d <= t; d = addDays(d, 1)) {
    evsOn(d).forEach(e => { if (Object.values(HABITS).some(h => h.test(e))) esp++; else if (isOurs(e)) citas++; });
  }
  return { citas, esp };
}

// Ideas que salen de la agenda teocrática de los próximos 7 días
function theoIdeas() {
  const t = today(), out = [];
  M.upcomingAssignments(t, 10).filter(x => x.inDays >= 1).slice(0, 2).forEach(x => {
    const d = addDays(x.date, -1) >= t ? addDays(x.date, -1) : t;
    out.push({ ic: '🎤', t: `Ensaya tu asignación con ${spouse()}`, s: `${x.e.asg || x.e.title} · ${fmtLong(x.date)}. Pídele que te escuche y te dé un consejo.`, idea: { t: `Ensayar mi asignación (${x.e.asg || x.e.title})`, cat: 'estudio', min: 30 }, date: d });
  });
  for (let i = 0; i < 7; i++) {
    const iso = addDays(t, i);
    const evs = evsOn(iso);
    const wk = evs.find(e => e.congreAuto === 'weekend' || (e.category === 'reunion' && /fin de semana|atalaya|p[uú]blica/i.test(e.title || '')));
    if (wk && i >= 1 && !out.some(o => o.k === 'atalaya')) out.push({ k: 'atalaya', ic: '📖', t: 'Preparen juntos La Atalaya', s: `La reunión del fin de semana es el ${fmtLong(iso)}.`, idea: ideaById('e4'), date: addDays(iso, -1) });
    const mw = evs.find(e => e.congreAuto === 'midweek' || (e.category === 'reunion' && /entre\s*semana|vida y ministerio/i.test(e.title || '')));
    if (mw && i >= 1 && !out.some(o => o.k === 'mw')) out.push({ k: 'mw', ic: '📘', t: 'Preparen juntos la reunión de entre semana', s: `Es el ${fmtLong(iso)}.`, idea: ideaById('e5'), date: addDays(iso, -1) });
    const pr = evs.find(e => e.category === 'predicacion' && !isOurs(e));
    if (pr && !out.some(o => o.k === 'pred')) out.push({ k: 'pred', ic: '🚪', t: `Predicar juntos el ${DIAS[parseISO(iso).getDay()]}`, s: `Tienes «${pr.title}»${pr.time ? ` a las ${fmtTime(pr.time)}` : ''}. ¿Salen juntos y luego desayunan o almuerzan?`, idea: { t: 'Predicar juntos', cat: 'predicacion', min: 120 }, date: iso, time: pr.time, end: pr.endTime });
  }
  const v = (data.visitas || []).find(x => x.start && x.start >= t && x.start <= addDays(t, 14));
  if (v) out.push({ ic: '🧳', t: 'Semana de la visita del superintendente', s: `Empieza el ${fmtLong(v.start)}. Será una semana llena: planeen un rato tranquilo para después.`, idea: { t: 'Rato tranquilo después de la visita', cat: 'personal', min: 90 }, date: addDays(v.start, 6) });
  return out.slice(0, 4);
}

// Fechas especiales
function specialDates() {
  const c = cfg(), out = [];
  if (c.anniversary) out.push({ key: 'aniv', t: 'Aniversario de bodas', ic: '💍', d: c.anniversary, years: true });
  (c.dates || []).forEach(x => out.push({ key: x.id, t: x.t, ic: '📌', d: x.d, custom: true }));
  const t = today();
  return out.filter(x => x.d).map(x => {
    let next = `${t.slice(0, 4)}${x.d.slice(4)}`;
    if (next < t) next = `${Number(t.slice(0, 4)) + 1}${x.d.slice(4)}`;
    return { ...x, next, inDays: diffDays(next, t), n: Number(next.slice(0, 4)) - Number(x.d.slice(0, 4)) };
  }).sort((a, b) => a.inDays - b.inDays);
}
const inDaysTxt = n => (n === 0 ? 'hoy' : n === 1 ? 'mañana' : `en ${n} días`);

// ───────────── Crear actividades (eventos de la Agenda) ─────────────
function createEvent(ev) {
  const base = { title: ev.title.startsWith(TAG) ? ev.title : `${TAG} ${ev.title}`, category: ev.category || 'personal', date: ev.date, time: ev.time || '', endTime: ev.endTime || '',
    place: ev.place || '', notes: ev.notes || '', repeat: ev.repeat || 'none', days: [], skipDates: [], theme: '', color: ev.color ?? (ev.category === 'personal' ? PINK : '') };
  if (ev.routine != null) base.routine = !!ev.routine;
  if (ev.share && canShare()) {
    const c = cfg();
    const s = store.shareEvent(base, [c.spouseUid], { [c.spouseUid]: c.spouseName });
    if (s) return s;
  }
  return store.upsert('events', { ...base, id: uid() });
}
function createTask(t) {
  return store.upsert('tasks', { id: uid(), title: t.title, kind: 'otro', personId: '', companionId: '', due: t.due, dueTime: t.dueTime || '', status: 'pendiente', notes: t.notes || '',
    log: [], meetingId: '', fromAgreement: '', responsibles: [], responsibleIds: [], mine: true, repeat: t.repeat || '', deptId: '', priority: t.priority || 'normal' });
}

// ───────────── Pantallas ─────────────
let tab = 'inicio';
const segBtn = (k, t) => `<button type="button" data-mx="tab" data-v="${k}" aria-pressed="${tab === k}">${t}</button>`;
const card = (inner, cls = '') => `<div class="card mx-card ${cls}">${inner}</div>`;

export function openMain(t = tab) {
  if (!allowed()) return;
  tab = t;
  const c = cfg();
  const body = `<div class="mx">
    <div class="seg mx-seg">${segBtn('inicio', 'Inicio')}${segBtn('planear', 'Planear')}${segBtn('espiritual', 'Espiritual')}${segBtn('fechas', 'Fechas')}</div>
    ${!c.spouseName && !c.spouseUid ? `<button type="button" class="log-now mx-setup" data-mx="settings">💑 <span><b>Empieza aquí</b><small>Dinos el nombre de tu cónyuge${isCloud ? ' y su cuenta, para compartirle lo que planeen' : ''}.</small></span></button>` : ''}
    ${{ inicio: viewInicio, planear: viewPlanear, espiritual: viewEspiritual, fechas: viewFechas }[tab]()}
    <div class="mx-foot"><button type="button" class="link" data-mx="settings">⚙️ Ajustes del módulo</button> · <button type="button" class="link" data-mx="help">¿Cómo funciona?</button></div>
  </div>`;
  S.open({ title: `${TAG} ${NAME}`, body });
}

function upRow({ e, iso }) {
  const sh = e.sharedId ? `<span class="mx-tag">👥 compartido</span>` : '';
  return `<button type="button" class="mx-row" data-mx="ev" data-id="${esc(e.id)}" data-d="${esc(iso)}">
    <span class="mx-when"><b>${esc(fmtShort(iso))}</b><small>${esc(cap(DIAS[parseISO(iso).getDay()]).slice(0, 3))}</small></span>
    <span class="mx-what"><b>${esc(String(e.title).replace(TAG, '').trim())}</b><small>${e.time ? esc(fmtTime(e.time)) : 'Todo el día'}${e.place ? ` · ${esc(e.place)}` : ''} ${sh}</small></span>
    ${iso <= today() ? `<span class="mx-chk ${doneOn(e, iso) ? 'on' : ''}" data-mx="done" data-id="${esc(e.id)}" data-d="${esc(iso)}" role="button" aria-label="Marcar como hecho">✓</span>` : ''}
  </button>`;
}
function dayChip(s) {
  return `<button type="button" class="mx-day" data-mx="plan" data-d="${esc(s.iso)}" data-t="${esc(toHHMM(s.from))}">
    <b>${esc(cap(DIAS[parseISO(s.iso).getDay()]))} ${esc(fmtShort(s.iso))}</b>
    <small>Libre de ${esc(fmtTime(toHHMM(s.from)))} a ${esc(fmtTime(toHHMM(s.to)))}</small>
    ${s.info.length ? `<small class="mx-theo">${s.info.slice(0, 2).map(esc).join(' · ')}</small>` : '<small class="mx-theo ok">Sin compromisos teocráticos</small>'}
  </button>`;
}

function viewInicio() {
  const up = upcoming(21), sd = specialDates().filter(x => x.inDays <= 30), ws = weekStart(today());
  const thisWeek = up.filter(x => x.iso < addDays(ws, 7));
  const m = monthCount(), streak = familiaStreak();
  const last = [...cfg().checkins].sort((a, b) => b.d.localeCompare(a.d))[0];
  const checkDue = !last || diffDays(today(), last.d) >= 7;
  return `
    ${sd.map(x => `<div class="mx-date ${x.inDays <= 7 ? 'soon' : ''}">${x.ic} <span><b>${esc(x.t)} ${inDaysTxt(x.inDays)}</b><small>${esc(fmtLong(x.next))}${x.years && x.n > 0 ? ` · ${x.n} ${x.n === 1 ? 'año' : 'años'} juntos` : ''}${x.inDays > 0 && x.inDays <= 14 ? ' · ¿ya planearon algo?' : ''}</small></span>${x.inDays > 0 ? `<button type="button" class="btn sm" data-mx="plan" data-d="${esc(x.next)}" data-idea="i1">Planear</button>` : ''}</div>`).join('')}
    <div class="mx-kpis">
      <div><b>${thisWeek.length}</b><small>juntos esta semana</small></div>
      <div><b>${m.citas}</b><small>citas este mes</small></div>
      <div><b>${m.esp}</b><small>espirituales este mes</small></div>
      <div><b>${streak}</b><small>${streak === 1 ? 'semana' : 'semanas'} con Adoración en familia</small></div>
    </div>
    ${checkDue ? `<button type="button" class="log-now" data-mx="checkin">💬 <span><b>Su conversación de la semana</b><small>${last ? `La última fue el ${esc(fmtShort(last.d))}.` : 'Un rato para hablar de cómo les fue y qué planean.'} Toca para hacerla con ${esc(spouse())}.</small></span></button>` : ''}
    <div class="sec-h tight"><h3 class="sub-h">Próximas actividades juntos</h3><button type="button" class="btn sm" data-mx="plan">+ Planear</button></div>
    ${up.length ? `<div class="mx-list">${up.slice(0, 6).map(upRow).join('')}</div>`
      : `<div class="empty mx-empty"><p>Todavía no tienen nada planeado.<br>Mira abajo los días que tienen libres.</p></div>`}
    <h3 class="sub-h">Días libres de las próximas 2 semanas</h3>
    <p class="hint">Según tu agenda teocrática (reuniones, predicación, pastoreo, ancianos, asignaciones y mecánicas). Toca un día para planear.</p>
    <div class="mx-days">${suggestDays().map(dayChip).join('') || '<p class="hint">No encontré ratos libres de más de hora y media. Revisa tu horario en Ajustes del módulo.</p>'}</div>`;
}

function viewPlanear() {
  const list = ideas();
  return `<p class="hint">Elige una idea: la pones en un día libre y queda en tu Agenda con su aviso${canShare() ? `, compartida con ${esc(spouse())}` : ''}.</p>
    ${Object.entries(KINDS).map(([k, kd]) => {
      const its = list.filter(i => i.k === k);
      return `<h3 class="sub-h">${kd.e} ${esc(kd.n)}</h3><div class="mx-ideas">${its.map(i => `<span class="mx-idea"><button type="button" data-mx="plan" data-idea="${esc(i.id)}">${esc(i.t)}</button><button type="button" class="mx-x" data-mx="idea-del" data-id="${esc(i.id)}" aria-label="Quitar la idea">×</button></span>`).join('')}
        <button type="button" class="mx-idea add" data-mx="idea-add" data-k="${k}">+ Otra idea</button></div>`;
    }).join('')}
    ${cfg().hiddenIdeas.length ? `<p class="pad-top"><button type="button" class="link" data-mx="ideas-reset">Volver a mostrar las ideas que quitaste (${cfg().hiddenIdeas.length})</button></p>` : ''}`;
}

function viewEspiritual() {
  const c = cfg(), ti = theoIdeas(), streak = familiaStreak(), ws = weekStart(today());
  return `
    <h3 class="sub-h">Esta semana (${esc(fmtShort(ws))} – ${esc(fmtShort(addDays(ws, 6)))})</h3>
    <div class="mx-list">${c.habits.filter(k => HABITS[k]).map(k => {
      const h = habitWeek(k);
      return `<div class="mx-habit ${h.st}"><span class="mx-hic">${h.st === 'hecho' ? '✅' : h.st === 'planeado' ? '🗓' : '⬜'}</span>
        <span class="mx-what"><b>${esc(HABITS[k].t)}</b><small>${h.st === 'hecho' ? `Hecho el ${esc(fmtShort(h.iso))}` : h.st === 'planeado' ? `Planeado: ${esc(cap(DIAS[parseISO(h.iso).getDay()]))} ${esc(fmtShort(h.iso))}${h.e.time ? ` ${esc(fmtTime(h.e.time))}` : ''}` : 'Aún sin planear'}</small></span>
        ${h.st === '' ? `<button type="button" class="btn sm" data-mx="plan" data-idea="${esc(HABITS[k].idea)}">Planear</button>` : h.st === 'planeado' && h.iso <= today() ? `<button type="button" class="btn sm" data-mx="done" data-id="${esc(h.e.id)}" data-d="${esc(h.iso)}">✓ Lo hicimos</button>` : ''}</div>`;
    }).join('')}</div>
    <p class="hint">${streak ? `🔥 Llevan <b>${streak}</b> ${streak === 1 ? 'semana' : 'semanas'} seguidas con la Adoración en familia.` : 'Si la Adoración en familia está en tu Agenda como evento semanal, aquí verás cuántas semanas seguidas la hacen.'}</p>
    ${!data.events.some(HABITS.familia.test) ? `<button type="button" class="btn pad-top" data-mx="plan" data-idea="e1" data-rep="weekly">📅 Poner la Adoración en familia cada semana</button>` : ''}
    <h3 class="sub-h">Ideas según tu agenda teocrática</h3>
    ${ti.length ? `<div class="mx-list">${ti.map((x, i) => `<div class="mx-habit"><span class="mx-hic">${x.ic}</span><span class="mx-what"><b>${esc(x.t)}</b><small>${esc(x.s)}</small></span><button type="button" class="btn sm" data-mx="theo" data-i="${i}">Planear</button></div>`).join('')}</div>`
      : '<p class="hint">Cuando tengas reuniones, predicación o asignaciones en la Agenda, aquí te sugiero cómo apoyarse en ellas.</p>'}
    <h3 class="sub-h">Lo que quieren cuidar cada semana</h3>
    <div class="chips wrap">${Object.entries(HABITS).map(([k, h]) => `<button type="button" class="chip" data-mx="habit" data-v="${k}" aria-pressed="${c.habits.includes(k)}">${esc(h.t)}</button>`).join('')}</div>`;
}

function viewFechas() {
  const sd = specialDates(), c = cfg();
  return `<p class="hint">Cada fecha crea un recordatorio que se repite cada año: uno una semana antes (para planear algo) y otro el mismo día. Están en Tareas.</p>
    ${sd.length ? `<div class="mx-list">${sd.map(x => `<div class="mx-habit"><span class="mx-hic">${x.ic}</span><span class="mx-what"><b>${esc(x.t)}</b><small>${esc(fmtLong(x.next))} · ${inDaysTxt(x.inDays)}${x.years && x.n > 0 ? ` · llevan ${x.n} ${x.n === 1 ? "año" : "años"} de casados` : ''}</small><small>${(c.dateTasks[x.key] || []).some(id => store.get('tasks', id)) ? '🔔 Con recordatorio' : '<span class="warn-t">Sin recordatorio</span>'}</small></span>
      ${(c.dateTasks[x.key] || []).some(id => store.get('tasks', id)) ? '' : `<button type="button" class="btn sm" data-mx="date-remind" data-k="${esc(x.key)}">🔔 Avisarme</button>`}
      ${x.custom ? `<button type="button" class="icon-btn mx-x" data-mx="date-del" data-id="${esc(x.key)}" aria-label="Quitar">×</button>` : ''}</div>`).join('')}</div>` : ''}
    <h3 class="sub-h">Su fecha</h3>
    <div class="f"><label for="mx-aniv">💍 Aniversario de bodas</label><input id="mx-aniv" type="date" value="${esc(c.anniversary)}"></div>
    <button type="button" class="btn primary" data-mx="dates-save">Guardar fecha</button>
    <h3 class="sub-h">Otra fecha especial</h3>
    <div class="two"><div class="f"><label for="mx-dt">Nombre</label><input id="mx-dt" maxlength="60" placeholder="Ej. El día que nos conocimos"></div>
    <div class="f"><label for="mx-dd">Fecha</label><input id="mx-dd" type="date"></div></div>
    <button type="button" class="btn" data-mx="date-add">+ Agregar fecha</button>`;
}

// Planear una actividad
let planCtx = null;
function planSheet(o = {}) {
  const idea = o.idea || (o.ideaId ? ideaById(o.ideaId) : null) || { t: '', cat: 'personal', min: 90, k: 'cita' };
  const detalle = idea.k === 'detalle';
  const date = o.date || suggestDays(14, 1)[0]?.iso || today();
  const time = o.time ?? (detalle ? '' : fitTime(date, idea) || (isWeekend(date) ? cfg().weFrom : cfg().wkFrom));
  const end = o.end || (time && idea.min ? toHHMM(Math.min((toMin(time) || 0) + idea.min, 23 * 60 + 59)) : '');
  planCtx = { idea, detalle };
  const cats = M.eventCats(idea.cat || 'personal');
  S.open({
    title: detalle ? '🎁 Un detalle' : `${TAG} Planear juntos`, back: () => openMain(),
    body: `<div class="mx">
      <div class="f"><label for="mx-t">¿Qué van a hacer?</label><input id="mx-t" maxlength="110" value="${esc(idea.t)}" placeholder="Ej. Cena en casa"></div>
      ${detalle ? '<p class="hint">Es una sorpresa: queda como tarea solo tuya (no se le comparte) con aviso ese día.</p>' : `<div class="f"><label for="mx-cat">Tipo</label><select id="mx-cat">${Object.entries(cats).map(([k, v]) => `<option value="${k}" ${k === (idea.cat || 'personal') ? 'selected' : ''}>${esc(v.n)}</option>`).join('')}</select></div>`}
      <div class="f"><label for="mx-d">Día</label><input id="mx-d" type="date" value="${esc(date)}"></div>
      <div class="mx-days mini" id="mx-sug">${detalle ? '' : suggestDays(14, 4).map(s => `<button type="button" class="chip" data-mx="pick-day" data-d="${esc(s.iso)}" data-t="${esc(toHHMM(s.from))}">${esc(cap(DIAS[parseISO(s.iso).getDay()]).slice(0, 3))} ${esc(fmtShort(s.iso))} · ${esc(fmtTime(toHHMM(s.from)))}</button>`).join('')}</div>
      <div class="two"><div class="f"><label for="mx-h">${detalle ? 'Avisarme a las' : 'Empieza'}</label><input id="mx-h" type="time" value="${esc(time || (detalle ? '08:00' : ''))}"></div>
      ${detalle ? '' : `<div class="f"><label for="mx-e">Termina</label><input id="mx-e" type="time" value="${esc(end)}"></div>`}</div>
      <div id="mx-day-info"></div>
      ${detalle ? '' : `<div class="f"><label for="mx-p">Lugar <span class="hint">(opcional)</span></label><input id="mx-p" maxlength="120"></div>
      <div class="f"><label for="mx-r">Repetición</label><select id="mx-r">${Object.entries(M.REPEATS).filter(([k]) => k !== 'days' && k !== 'daily').map(([k, v]) => `<option value="${k}" ${k === (o.repeat || 'none') ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>`}
      <div class="f"><label for="mx-n">Notas <span class="hint">(opcional)</span></label><textarea id="mx-n" rows="2" maxlength="600"></textarea></div>
      ${detalle ? '' : canShare() ? `<label class="check"><input type="checkbox" id="mx-sh" checked> 👥 Compartir con ${esc(spouse())} (le llega el aviso)</label>`
        : isCloud && cfg().share ? `<p class="hint">Para compartirlo con ${esc(spouse())}, elige su cuenta en ⚙️ Ajustes del módulo.</p>` : ''}
    </div>`,
    actions: `<button type="button" class="btn primary" data-mx="plan-save">${detalle ? 'Guardar recordatorio' : 'Guardar en la Agenda'}</button>`,
  });
  dayInfo();
}
function dayInfo() {
  const box = document.getElementById('mx-day-info'); if (!box) return;
  const d = document.getElementById('mx-d')?.value, h = document.getElementById('mx-h')?.value, e = document.getElementById('mx-e')?.value;
  if (!d || planCtx?.detalle) { box.innerHTML = ''; return; }
  const cf = conflicts(d, h, e), info = theoInfo(d);
  box.innerHTML = `${cf.length ? `<div class="warn-box mx-warn">⚠️ <b>Choca con:</b> ${cf.map(x => `${esc(x.title)}${x.time ? ` (${esc(fmtTime(x.time))}${x.endTime ? `–${esc(fmtTime(x.endTime))}` : ''})` : ''}`).join(', ')}</div>` : h ? '<p class="hint ok">✓ No choca con nada de tu agenda.</p>' : ''}
    ${info.length ? `<p class="hint">Ese día: ${info.map(esc).join(' · ')}</p>` : ''}`;
}
function planSave() {
  const v = id => document.getElementById(id)?.value?.trim() || '';
  const title = v('mx-t'), date = v('mx-d'), time = v('mx-h');
  if (!title) return toast('Escribe qué van a hacer');
  if (!date) return toast('Elige el día');
  if (planCtx?.detalle) {
    createTask({ title: `${TAG} ${title}`, due: date, dueTime: time, notes: v('mx-n') || 'Detalle para mi cónyuge (planeado en 💑 Matrimonio)' });
    toast(`🎁 Listo: te aviso el ${fmtShort(date)}`);
    return openMain();
  }
  let end = v('mx-e');
  if (time && end && toMin(end) <= toMin(time)) end = '';
  const cf = conflicts(date, time, end);
  const btn = document.querySelector('[data-mx="plan-save"]');
  if (cf.length && btn && !btn.dataset.ok) { btn.dataset.ok = '1'; btn.textContent = 'Guardar de todos modos'; dayInfo(); return toast('Ojo: choca con otra cosa de tu agenda. Cambia la hora o toca de nuevo para guardar igual.'); }
  const share = !!document.getElementById('mx-sh')?.checked;
  createEvent({ title, category: v('mx-cat') || 'personal', date, time, endTime: end, place: v('mx-p'), notes: v('mx-n'), repeat: v('mx-r') || 'none', share });
  toast(`${TAG} En tu Agenda: ${fmtShort(date)}${time ? ` · ${fmtTime(time)}` : ''}${share && canShare() ? ` · compartido con ${spouse()}` : ''}`);
  openMain('inicio');
}

// Conversación de la semana
const QUESTIONS = ['¿Qué fue lo mejor de esta semana para cada uno?', '¿Hubo algo que nos molestó o que podemos mejorar? (con calma y sin culpar)', '¿Cómo vamos espiritualmente: Adoración en familia, predicación, reuniones?', '¿Qué haremos juntos esta semana? (escojan un día)', '¿Cómo puedo ayudarte esta semana?'];
function checkinSheet() {
  const c = cfg(), hist = [...c.checkins].sort((a, b) => b.d.localeCompare(a.d));
  S.open({
    title: '💬 Conversación de la semana', back: () => openMain(),
    body: `<div class="mx"><p class="hint">Unos 20 minutos, en un momento tranquilo. Pueden usar estas preguntas:</p>
      <ol class="mx-q">${QUESTIONS.map(q => `<li>${esc(q)}</li>`).join('')}</ol>
      <div class="f"><span class="lbl">¿Cómo estuvo la semana?</span><div class="mx-hearts" role="radiogroup" aria-label="Cómo estuvo la semana">${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="mx-h" value="${n}" ${n === 4 ? 'checked' : ''}><span>${['😟', '😐', '🙂', '😊', '🥰'][n - 1]}</span><em>${n}</em></label>`).join('')}</div></div>
      <div class="f"><label for="mx-good">Lo que salió bien <span class="hint">(breve)</span></label><textarea id="mx-good" rows="2" maxlength="400"></textarea></div>
      <div class="f"><label for="mx-better">Lo que vamos a mejorar</label><textarea id="mx-better" rows="2" maxlength="400"></textarea></div>
      <div class="f"><label for="mx-plan">Lo que acordamos hacer juntos</label><input id="mx-plan" maxlength="120" placeholder="Ej. Caminata el sábado en la tarde"></div>
      <p class="hint">Se guarda solo en tu cuenta. Si escribes un acuerdo, te ayudo a ponerlo en la Agenda.</p>
      ${!c.checkEventId || !store.get('events', c.checkEventId) ? `<button type="button" class="btn ghost pad-top" data-mx="check-event">🔔 Recordarnos cada semana</button>` : ''}
      ${hist.length ? `<h3 class="sub-h">Anteriores</h3><div class="mx-hist">${hist.slice(0, 8).map(h => `<details><summary><b>${esc(fmtShort(h.d))}</b> <span class="mx-hh">${'❤️'.repeat(h.h || 0)}</span></summary>${h.good ? `<p>👍 ${esc(h.good)}</p>` : ''}${h.better ? `<p>🔧 ${esc(h.better)}</p>` : ''}${h.plan ? `<p>🗓 ${esc(h.plan)}</p>` : ''}<button type="button" class="link danger" data-mx="check-del" data-id="${esc(h.id)}">Borrar</button></details>`).join('')}</div>` : ''}
    </div>`,
    actions: `<button type="button" class="btn primary" data-mx="check-save">Guardar</button>`,
  });
}
function checkSave() {
  const v = id => document.getElementById(id)?.value?.trim() || '';
  const h = Number(document.querySelector('input[name="mx-h"]:checked')?.value) || 0;
  const it = { id: uid(), d: today(), h, good: v('mx-good'), better: v('mx-better'), plan: v('mx-plan') };
  save(c => ({ checkins: [...c.checkins.filter(x => x.d !== it.d), it].sort((a, b) => a.d.localeCompare(b.d)).slice(-60) }));
  if (it.plan) { toast('Guardado. Ahora ponle día a lo que acordaron'); return planSheet({ idea: { t: it.plan, cat: 'personal', min: 90, k: 'cita' } }); }
  toast('💬 Conversación guardada');
  openMain();
}
function checkEvent() {
  const c = cfg();
  const existing = data.events.find(e => /conversaci[oó]n de la semana/i.test(e.title || '') && String(e.title).startsWith(TAG));
  if (existing) { save({ checkEventId: existing.id }); toast(`Ya está en tu Agenda${existing.ownerName && existing.owner !== store.myUid() ? ` (la creó ${existing.ownerName})` : ''}`); return checkinSheet(); }
  let date = today(); while (parseISO(date).getDay() !== Number(c.checkDay)) date = addDays(date, 1);
  const ev = createEvent({ title: 'Nuestra conversación de la semana', category: 'personal', date, time: c.checkTime, endTime: toHHMM((toMin(c.checkTime) || 1170) + 30), repeat: 'weekly', routine: true, share: true, notes: 'Abre Más → 💑 Matrimonio → Conversación de la semana.' });
  save({ checkEventId: ev.id });
  toast(`🔔 Cada ${DIAS[Number(c.checkDay)]} a las ${fmtTime(c.checkTime)}`);
  checkinSheet();
}

// Recordatorios de fechas (tareas que se repiten cada año)
function dateRemind(key) {
  const x = specialDates().find(d => d.key === key); if (!x) return;
  const pre = addDays(x.next, -7);
  const ids = [];
  if (pre >= today()) ids.push(createTask({ title: `${TAG} Planear algo: ${x.t} (${fmtShort(x.next)})`, due: pre, repeat: 'anual', notes: 'Falta una semana. Planéalo en Más → 💑 Matrimonio.' }).id);
  ids.push(createTask({ title: `${TAG} Hoy: ${x.t}`, due: x.next, repeat: 'anual', priority: 'alta', notes: 'Recordatorio de 💑 Matrimonio.' }).id);
  save(c => ({ dateTasks: { ...c.dateTasks, [key]: ids } }));
  toast(`🔔 Te aviso cada año${pre >= today() ? ' (una semana antes y ese día)' : ''}`);
}

// Ajustes
let members = null;
function settingsSheet() {
  const c = cfg();
  S.open({
    title: '⚙️ Ajustes de 💑 Matrimonio', back: () => openMain(),
    body: `<div class="mx">
      <div class="f"><label for="mx-sn">Nombre de tu cónyuge</label><input id="mx-sn" maxlength="60" value="${esc(c.spouseName)}" placeholder="Ej. Yovanna"></div>
      ${isCloud ? `<div class="f"><label for="mx-su">Su cuenta en la app <span class="hint">(para compartirle lo que planeen)</span></label><select id="mx-su"><option value="">${members ? 'No tiene cuenta / no compartir' : 'Cargando cuentas…'}</option>${(members || []).map(m => `<option value="${esc(m.uid)}" ${m.uid === c.spouseUid ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>
      <label class="check"><input type="checkbox" id="mx-shr" ${c.share ? 'checked' : ''}> 👥 Compartir con su cuenta lo que planee (citas y actividades)</label>` : ''}
      <h3 class="sub-h">Tu horario libre</h3>
      <div class="two"><div class="f"><label for="mx-wk">Entre semana desde</label><input id="mx-wk" type="time" value="${esc(c.wkFrom)}"></div>
      <div class="f"><label for="mx-we">Fin de semana desde</label><input id="mx-we" type="time" value="${esc(c.weFrom)}"></div></div>
      <div class="f"><label for="mx-un">Hasta</label><input id="mx-un" type="time" value="${esc(c.until)}"></div>
      <h3 class="sub-h">Conversación de la semana</h3>
      <div class="two"><div class="f"><label for="mx-cd">Día</label><select id="mx-cd">${[1, 2, 3, 4, 5, 6, 0].map(d => `<option value="${d}" ${d === Number(c.checkDay) ? 'selected' : ''}>${cap(DIAS[d])}</option>`).join('')}</select></div>
      <div class="f"><label for="mx-ct">Hora</label><input id="mx-ct" type="time" value="${esc(c.checkTime)}"></div></div>
      <label class="check"><input type="checkbox" id="mx-showhoy" ${c.showHoy ? 'checked' : ''}> Mostrar la tarjeta 💑 en Hoy</label>
      <label class="check"><input type="checkbox" id="mx-hide" ${c.hidden ? 'checked' : ''}> Ocultar el módulo en «Más» y en el menú</label>
      <p class="hint">Si lo ocultas, vuelve a mostrarlo desde la tarjeta de Hoy o abriendo la dirección con #matrimonio al final.</p>
    </div>`,
    actions: `<button type="button" class="btn primary" data-mx="settings-save">Guardar</button>`,
  });
  if (isCloud && !members) store.listMembers().then(l => {
    members = l;
    const sel = document.getElementById('mx-su'); if (!sel) return;
    const cur = cfg().spouseUid;
    sel.innerHTML = `<option value="">No tiene cuenta / no compartir</option>${l.map(m => `<option value="${esc(m.uid)}" ${m.uid === cur ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}`;
  }).catch(() => { members = []; });
}
// Si el administrador elige la cuenta de su cónyuge, se le activa el módulo a esa cuenta (en sus funciones)
async function allowSpouse(uid, name) {
  if (!session.isAdmin) return;
  try {
    const u = (await store.admin.listUsers()).find(x => x.uid === uid);
    if (!u?.type) return;
    const allow = [...new Set([...(u.allow || []), 'general.matrimonio'])], deny = (u.deny || []).filter(x => x !== 'general.matrimonio');
    if ((u.allow || []).includes('general.matrimonio') && !(u.deny || []).includes('general.matrimonio')) return;
    await store.admin.setAccess(uid, { type: u.type, allow, deny });
    toast(`💑 Activado también para ${String(name).split(' ')[0]}`);
  } catch (e) { console.warn('No se pudo activar el módulo a la otra cuenta', e); }
}
function settingsSave() {
  const v = id => document.getElementById(id);
  const su = v('mx-su')?.value ?? cfg().spouseUid;
  const m = (members || []).find(x => x.uid === su);
  const name = v('mx-sn').value.trim() || m?.name?.split(/\s+/)[0] || '';
  const prevCheck = [cfg().checkDay, cfg().checkTime].join();
  if (su && su !== cfg().spouseUid) allowSpouse(su, m?.name || name);
  save({ spouseName: name, spouseUid: su, share: v('mx-shr') ? v('mx-shr').checked : cfg().share, wkFrom: v('mx-wk').value || DEF.wkFrom, weFrom: v('mx-we').value || DEF.weFrom, until: v('mx-un').value || DEF.until,
    checkDay: Number(v('mx-cd').value), checkTime: v('mx-ct').value || DEF.checkTime, showHoy: v("mx-showhoy").checked, hidden: v('mx-hide').checked });
  // Si cambió el día u hora de la conversación y el evento es tuyo, se mueve
  const ev = cfg().checkEventId && store.get('events', cfg().checkEventId);
  if (ev && prevCheck !== [Number(v('mx-cd').value), v('mx-ct').value].join() && (!ev.sharedId || store.isSharedOwner(ev))) {
    let date = today(); while (parseISO(date).getDay() !== Number(v('mx-cd').value)) date = addDays(date, 1);
    const t = v('mx-ct').value || DEF.checkTime;
    store.upsert('events', { ...ev, date, time: t, endTime: toHHMM((toMin(t) || 0) + 30) });
  }
  toast('Ajustes guardados');
  setTimeout(() => { injectAll(); openMain(); }, 60);
}

function helpSheet() {
  S.open({
    title: '¿Cómo funciona 💑 Matrimonio?', back: () => openMain(),
    body: `<div class="mx prose">
      <p><b>Inicio:</b> lo que viene juntos, las fechas cercanas y los días que tienen libres. Los días libres salen de tu Agenda: se saltan las reuniones (con el camino), la predicación, el pastoreo, el cuerpo de ancianos, tus asignaciones y las mecánicas, y se marca la semana de la visita del superintendente o si estás preparando una asignación.</p>
      <p><b>Planear:</b> elige una idea (o escribe la tuya), ponle día y hora. Te avisa si choca con algo. Queda en la Agenda con «💑» en el título${isCloud ? ' y, si elegiste la cuenta de tu cónyuge, compartida: a los dos les llega el aviso y los dos marcan ✓' : ''}. Los <b>detalles</b> son sorpresas: quedan como tarea solo tuya.</p>
      <p><b>Espiritual:</b> cómo van esta semana con la Adoración en familia, predicar juntos y leer o preparar juntos, cuántas semanas seguidas llevan, e ideas que salen de tu agenda teocrática (ensayar una asignación, preparar las reuniones, salir juntos a predicar).</p>
      <p><b>Fechas:</b> aniversario de bodas y otras fechas especiales de ustedes con recordatorio cada año (una semana antes y ese día), en Tareas.</p>
      <p><b>Conversación de la semana:</b> unas preguntas para hablar con calma, cómo estuvo la semana y lo que acuerdan. Se guarda solo en tu cuenta.</p>
      <p class="hint">Para cambiar o borrar algo planeado, ábrelo desde aquí o desde la Agenda como cualquier evento.</p>
    </div>`,
  });
}

// ───────────── Toques ─────────────
document.addEventListener('click', e => {
  const el = e.target.closest('[data-mx]');
  if (!el) return;
  e.preventDefault(); e.stopPropagation();
  const { mx, v, id, d, t, i, k } = el.dataset;
  switch (mx) {
    case 'open': return openMain('inicio');
    case 'tab': return openMain(v);
    case 'settings': return settingsSheet();
    case 'settings-save': return settingsSave();
    case 'help': return helpSheet();
    case 'plan': return planSheet({ ideaId: el.dataset.idea, date: d, time: t, repeat: el.dataset.rep });
    case 'plan-save': return planSave();
    case 'pick-day': { const di = document.getElementById('mx-d'), hi = document.getElementById('mx-h'), ei = document.getElementById('mx-e');
      const dur = hi?.value && ei?.value ? toMin(ei.value) - toMin(hi.value) : (planCtx?.idea?.min || 90);
      const tt = fitTime(d, { ...(planCtx?.idea || {}), min: dur }, toMin(t)) || t;
      if (di) di.value = d; if (hi) hi.value = tt; if (ei && dur > 0) ei.value = toHHMM(Math.min(toMin(tt) + dur, 1439));
      return dayInfo(); }
    case 'theo': { const x = theoIdeas()[Number(i)]; return x && planSheet({ idea: { ...x.idea, k: 'espiritual' }, date: x.date, time: x.time, end: x.end }); }
    case 'ev': return S.eventSheet(id, { occDate: d }, () => openMain());
    case 'done': { const ev = store.get('events', id); if (ev) { store.toggleDone(ev, d); toast(doneOn(store.get('events', id) || ev, d) ? '✓ ¡Bien hecho!' : 'Marca quitada'); } return setTimeout(() => openMain(), 50); }
    case 'idea-add': {
      const txt = prompt2(`Nueva idea (${KINDS[k].n})`); if (!txt) return;
      const cat = k === 'espiritual' ? 'familia' : k === 'servicio' ? 'personal' : 'personal';
      save(c => ({ ideas: [...c.ideas, { id: 'u' + uid(), k, t: txt.slice(0, 100), cat, min: k === 'detalle' ? 0 : 90 }] }));
      return setTimeout(() => openMain('planear'), 50);
    }
    case 'idea-del': {
      const custom = cfg().ideas.some(x => x.id === id);
      save(c => custom ? { ideas: c.ideas.filter(x => x.id !== id) } : { hiddenIdeas: [...new Set([...c.hiddenIdeas, id])] });
      return setTimeout(() => openMain('planear'), 50);
    }
    case 'ideas-reset': save({ hiddenIdeas: [] }); return setTimeout(() => openMain('planear'), 50);
    case 'habit': save(c => ({ habits: c.habits.includes(v) ? c.habits.filter(x => x !== v) : [...c.habits, v] })); return setTimeout(() => openMain('espiritual'), 50);
    case 'dates-save': {
      save({ anniversary: document.getElementById('mx-aniv').value });
      toast('Fecha guardada. Toca «🔔 Avisarme» para el recordatorio de cada año');
      return setTimeout(() => openMain('fechas'), 50);
    }
    case 'date-add': {
      const tt = document.getElementById('mx-dt').value.trim(), dd = document.getElementById('mx-dd').value;
      if (!tt || !dd) return toast('Escribe el nombre y la fecha');
      save(c => ({ dates: [...c.dates, { id: 'f' + uid(), t: tt.slice(0, 60), d: dd }] }));
      return setTimeout(() => openMain('fechas'), 50);
    }
    case 'date-del': save(c => ({ dates: c.dates.filter(x => x.id !== id) })); return setTimeout(() => openMain('fechas'), 50);
    case 'date-remind': dateRemind(k); return setTimeout(() => openMain('fechas'), 50);
    case 'checkin': return checkinSheet();
    case 'check-save': return checkSave();
    case 'check-event': return checkEvent();
    case 'check-del': save(c => ({ checkins: c.checkins.filter(x => x.id !== id) })); return setTimeout(checkinSheet, 50);
  }
}, true);
document.addEventListener('change', e => { if (e.target.closest?.('#mx-d, #mx-h, #mx-e')) dayInfo(); });
document.addEventListener('input', e => { if (e.target.closest?.('#mx-h, #mx-e')) dayInfo(); });
const prompt2 = label => { const x = window.prompt(label); return x ? x.trim() : ''; };

// ───────────── Puertas de entrada (sin tocar el código de la app) ─────────────
const ICON = '<svg class="ic" aria-hidden="true"><use href="#i-heart"/></svg>';

// 1) En la hoja «Más»
function injectMore() {
  if (cfg().hidden || !allowed()) return;
  const list = document.querySelector('#sheet-root .more-list');
  if (!list || list.querySelector('[data-mx="open"]')) return;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'more-item'; b.dataset.mx = 'open';
  b.innerHTML = `<span class="pill">${ICON}</span><span>${NAME}</span>`;
  const anchor = list.querySelector('[data-a="search"]');
  anchor ? list.insertBefore(b, anchor) : list.append(b);
}
// 2) En el menú de la izquierda (computadora)
function injectSide() {
  const tabs = document.getElementById('tabs');
  if (!tabs) return;
  let b = tabs.querySelector('.mx-tab');
  if (cfg().hidden || !allowed()) { b?.remove(); return; }
  if (b) return;
  b = document.createElement('button');
  b.type = 'button'; b.className = 'tab mx-tab'; b.dataset.mx = 'open';
  b.innerHTML = `<span class="pill">${ICON}</span><span>${NAME}</span>`;
  tabs.insertBefore(b, tabs.querySelector('.tab-more'));
}
// 3) Tarjeta en Hoy
function hoyCard() {
  const c = cfg(), t = today();
  const sd = specialDates().find(x => x.inDays <= 14);
  const up = upcoming(7)[0];
  const last = [...c.checkins].sort((a, b) => b.d.localeCompare(a.d))[0];
  const checkToday = parseISO(t).getDay() === Number(c.checkDay) && (!last || last.d !== t);
  let main, sub;
  if (sd && sd.inDays <= 3) { main = `${sd.ic} ${sd.t} ${inDaysTxt(sd.inDays)}`; sub = sd.years && sd.n > 0 ? `${sd.n} ${sd.n === 1 ? 'año' : 'años'} juntos` : 'Toca para planear algo especial'; }
  else if (checkToday) { main = '💬 Hoy toca su conversación de la semana'; sub = `Un rato tranquilo con ${spouse()}. Toca para ver las preguntas.`; }
  else if (up) { main = String(up.e.title).replace(TAG, '').trim(); sub = `${up.iso === t ? 'Hoy' : up.iso === addDays(t, 1) ? 'Mañana' : `${cap(DIAS[parseISO(up.iso).getDay()])} ${fmtShort(up.iso)}`}${up.e.time ? ` · ${fmtTime(up.e.time)}` : ''}${sd ? ` · ${sd.t} ${inDaysTxt(sd.inDays)}` : ''}`; }
  else { const s = suggestDays(7, 1)[0]; main = 'Aún no han planeado nada juntos'; sub = s ? `Mejor día: ${DIAS[parseISO(s.iso).getDay()]} ${fmtShort(s.iso)}, libre desde ${fmtTime(toHHMM(s.from))}` : 'Toca para ver ideas'; if (sd) sub += ` · ${sd.t} ${inDaysTxt(sd.inDays)}`; }
  return `<button type="button" class="log-now mx-hoy" id="mx-hoy" data-mx="open">${ICON} <span><b>${esc(main)}</b><small>${esc(sub)}</small></span></button>`;
}
function injectHoy() {
  const view = document.getElementById('view');
  if (!view || !cfg().showHoy || !allowed()) return;
  if (!cfg().spouseName && !cfg().spouseUid) return;   // la tarjeta sale cuando configuras el módulo (así no aparece a quien no lo usa)
  const isHoy = !location.hash || /^#\/?hoy$/.test(location.hash);
  if (!isHoy || !view.querySelector('.hero') || view.querySelector('#mx-hoy')) return;
  const anchor = view.querySelector('.tiles') || view.querySelector('.hero');
  anchor.insertAdjacentHTML('afterend', hoyCard());
}
function injectAll() {
  try { injectMore(); injectSide(); injectHoy(); } catch (err) { console.warn('💑 Matrimonio:', err); }
}

let queued = false;
const later = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; injectAll(); }); };
function start() {
  const obs = new MutationObserver(later);
  ['view', 'sheet-root', 'tabs'].forEach(id => { const n = document.getElementById(id); if (n) obs.observe(n, { childList: true }); });
  store.onData(later);
  window.addEventListener('hashchange', () => { if (/^#\/?matrimonio$/.test(location.hash)) openMain('inicio'); later(); });
  if (/^#\/?matrimonio$/.test(location.hash)) setTimeout(() => openMain('inicio'), 1200);
  injectAll();
}
// Estilos del módulo
const css = document.createElement('link');
css.rel = 'stylesheet'; css.href = new URL('./matrimonio.css', import.meta.url).href;
document.head.append(css);
start();
