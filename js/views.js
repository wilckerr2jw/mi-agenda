// Vistas principales. Cada función recibe el estado de la interfaz (ui) y devuelve HTML.

import { data, isCloud } from './store.js';
import { mecaSection, isBaptizedMale, myMecas, ROLE_IC } from './mecas.js';
import { comiteSection } from './comite.js';
import { remindList } from './recordar.js';
import { visitaSection, visitNotice } from './visita.js';
import * as store from './store.js';
import * as WC from './weekcal.js';
import * as Nat from './native.js';
import { updateBanner } from './pwa.js';
import { esc, ic, today, parseISO, fmtLong, fmtShort, fmtMonth, fmtTime, timeParts, relDays, norm, initials, pad, MESES, DIAS, cap, avatarHtml, diffDays } from './util.js';
import * as M from './model.js';
import { resolved } from './theme.js';
import * as Cp from './compartido.js';

// Botones de arriba a la derecha: buscar, cambiar tema claro/oscuro y ajustes
const actions = () => {
  const dark = resolved() === 'dark';
  return `<div class="top-actions">
    <button class="icon-btn" data-a="search" aria-label="Buscar">${ic('search')}</button>
    <button class="icon-btn" data-a="theme" aria-label="${dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}">${ic(dark ? 'sun' : 'moon')}</button>
    <button class="icon-btn" data-a="settings" aria-label="Ajustes">${ic('more')}</button></div>`;
};
const head = (title, right = '') => `<header class="top"><h1>${title}</h1>${right}</header>`;
// Estado vacío con un ícono suave (el ícono ayuda a reconocer la sección de un vistazo)
const empty = (msg, btn = '', icon = '') => `<div class="empty">${icon ? `<span class="empty-ic">${ic(icon)}</span>` : ''}<p>${msg}</p>${btn}</div>`;

// ───────────── Piezas reutilizables ─────────────

function timeCell(time) {
  const p = timeParts(time);
  return p ? `<span class="t">${p.h}<small>${p.ap}</small></span>` : `<span class="t all">Todo el día</span>`;
}

// Un evento o reunión dentro de la línea de tiempo del día
function tlItem({ kind, item }, iso) {
  const isMeeting = kind === 'meeting';
  const cat = M.catOf(item.category);
  const color = isMeeting ? 'var(--c-mtg)' : M.eventColor(item);
  let label = isMeeting ? 'Reunión importante' : cat.n;
  if (item.endTime) label += `, hasta ${fmtTime(item.endTime)}`;
  // Si es una ocurrencia de un evento repetido (no su fecha original), se manda la fecha
  // para que, al abrirlo, se pueda cancelar solo esa semana sin tocar las demás.
  const occ = !isMeeting && M.isRepeating(item) && iso !== item.date ? iso : '';
  const companions = isMeeting ? '' : M.eventCompanionsText(item);
  // Rutinas (eventos que se repiten): casilla para marcar «hecho» hoy o días anteriores, con racha
  const routine = !isMeeting && M.isRepeating(item) && iso && iso <= today();
  const me = store.doneId();
  const done = routine && M.isDoneBy(item, iso, me);
  const racha = routine ? M.streak(item, me) : 0;
  const othersDone = routine && item.sharedId ? (item.doneLog?.[iso] || []).filter(u => u !== me).map(u => item.memberNames?.[u] || '').filter(Boolean) : [];
  const btn = tlButton({ kind, item }, iso, { color, label, occ, companions, racha, othersDone });
  return routine
    ? `<div class="tl-row">${btn}<button type="button" class="tl-check ${done ? 'on' : ''}" data-a="ev-done" data-id="${esc(item.id)}" data-date="${esc(iso)}" aria-pressed="${done}" aria-label="${done ? 'Desmarcar' : 'Marcar como hecho'}: ${esc(item.title)}">${ic('check')}</button></div>`
    : btn;
}
function tlButton({ kind, item }, iso, { color, label, occ, companions, racha, othersDone }) {
  const isMeeting = kind === 'meeting';
  return `<button class="tl-item" style="--c:${esc(color)}" data-a="${esc(isMeeting ? 'meeting' : 'event')}" data-id="${esc(item.id)}" ${occ ? `data-occ="${esc(occ)}"` : ''}>
    ${timeCell(item.time)}<span class="bar"></span>
    <span class="tl-body"><strong>${esc(item.title)}</strong><span class="meta">${esc(label)}</span>
    ${item.place ? `<span class="meta">${ic('pin', 'sm')}${esc(item.place)}</span>` : ''}
    ${companions ? `<span class="meta">${ic('users', 'sm')}Con ${esc(companions)}</span>` : ''}
    ${item.theme ? `<span class="meta">💬 ${esc(item.theme)}</span>` : ''}
    ${item.sharedId ? `<span class="meta shared-tag">👥 ${store.isSharedOwner(item) ? 'Compartido' : `De ${esc(item.ownerName || 'otra cuenta')}`}</span>` : ''}
    ${racha >= 2 || othersDone.length ? `<span class="meta streak">${racha >= 2 ? `🔥 ${racha} seguidos` : ''}${racha >= 2 && othersDone.length ? ' · ' : ''}${othersDone.length ? `✓ ${esc(othersDone.join(', '))}` : ''}</span>` : ''}</span>
  </button>`;
}

// ⠿ para mover la tarea a otro departamento (solo en Tareas → Por departamento; no en las que te asignó otra cuenta)
const dragHandle = t => (t.assignedFrom ? '' : `<button type="button" class="tdrag" data-a="task-move-pick" data-id="${esc(t.id)}" aria-label="Mover «${esc(t.title)}» a otro departamento" title="Arrastra para moverla a otro departamento">⠿</button>`);

export function taskRow(t, movable = false) {
  const p = M.person(t.personId);
  const due = M.dueInfo(t);
  const done = t.status === 'hecha';
  const kind = M.kindLabel(t.kind);
  const comp = M.person(t.companionId);
  const mtg = t.meetingId ? data.meetings.find(m => m.id === t.meetingId) : null;
  const prio = M.taskPrio(t);
  return `<div class="row task ${done ? 'is-done' : ''} prio-${prio}${movable && !t.assignedFrom ? ' movable' : ''}">
    <button class="chk" data-a="toggle-task" data-id="${esc(t.id)}" aria-pressed="${done}" aria-label="${done ? 'Marcar como pendiente' : 'Marcar como hecha'}">${ic('check')}</button>
    <button class="row-main" data-a="task" data-id="${esc(t.id)}">
      <span class="title">${prio === 'alta' && !done ? '<span class="prio-tag" title="Prioridad alta">Alta</span> ' : ''}${esc(t.title)}</span>
      <span class="meta-line">${p ? `<span class="who">${esc(p.name)}</span>` : ''}${kind ? `<span>${esc(kind)}</span>` : ''}${comp ? `<span>Con ${esc(comp.name)}</span>` : ''}${t.repeat && !done ? `<span title="${esc(M.repeatLabel(t.repeat, t.due, t))}">🔁 ${esc(M.repeatLabel(t.repeat, t.due, t))}</span>` : ''}${t.status === 'seguimiento' ? '<span class="follow">En seguimiento</span>' : ''}${mtg ? `<span class="from-mtg" title="Sale de la reunión «${esc(mtg.title)}»">${ic('clip', 'sm')}${esc(mtg.title)}</span>` : ''}${acctTag(t)}${!M.isMineTask(t) ? `<span class="sup">👁 Supervisas${(t.responsibles || []).length ? ` · ${esc(t.responsibles.join(', '))}` : ''}</span>` : (mtg && (t.responsibles || []).length ? '<span class="mine">👉 Te toca</span>' : '')}</span>
    </button>
    ${due.label ? `<span class="due ${due.cls}">${due.label}${due.time ? `<small>${due.time}</small>` : ''}</span>` : ''}
    ${movable ? dragHandle(t) : ''}
  </div>`;
}

// Tareas con otra cuenta: las que te asignaron («📥 De …») y las que enviaste («📲 …» y si ya la aceptó)
const ACCT_STATE = { nueva: 'esperando', aceptada: 'la aceptó', rechazada: 'la rechazó' };
function acctTag(t) {
  if (t.assignedFrom) return `<span class="acct-tag from">📥 De ${esc(t.fromName)}</span>`;
  if (t.assignedId) return `<span class="acct-tag ${esc(t.assignState || 'nueva')}">📲 ${esc(t.assignToName || 'Enviada')} · ${esc(ACCT_STATE[t.assignState || 'nueva'])}</span>`;
  return '';
}
// Aviso de tareas nuevas que te asignaron (en Hoy y en Tareas)
function assignedNotice() {
  const n = isCloud ? store.assignedNew() : [];
  if (!n.length) return '';
  const from = [...new Set(n.map(d => d.ownerName || 'otra cuenta'))].join(', ');
  return `<button class="log-now as-now" data-a="as-inbox">📥 <span><b>${n.length === 1 ? 'Tienes 1 tarea nueva' : `Tienes ${n.length} tareas nuevas`}</b><small>De ${esc(from)}. Toca para aceptarlas o rechazarlas.</small></span></button>`;
}

// Tarea como tarjeta (vista de tarjetas en Tareas)
function taskCard(t, movable = false) {
  const p = M.person(t.personId);
  const due = M.dueInfo(t);
  const done = t.status === 'hecha';
  const prio = M.taskPrio(t);
  const mtg = t.meetingId ? data.meetings.find(m => m.id === t.meetingId) : null;
  const resp = !M.isMineTask(t) && (t.responsibles || []).length ? t.responsibles.join(', ') : '';
  return `<div class="tcard prio-${prio} ${done ? 'is-done' : ''}">
    <div class="tcard-top">
      ${due.label ? `<span class="due-pill ${due.cls}">${esc(due.label)}${due.time ? ` · ${esc(due.time)}` : ''}</span>` : '<span class="due-pill none">Sin fecha</span>'}
      ${prio !== 'normal' && !done ? `<span class="prio-tag ${prio}">${prio === 'alta' ? 'Alta' : 'Baja'}</span>` : ''}
      ${movable ? dragHandle(t) : ''}
    </div>
    <button class="tcard-main" data-a="task" data-id="${esc(t.id)}">
      <strong>${esc(t.title)}</strong>
      ${p ? `<span class="meta">${ic('users', 'sm')}${esc(p.name)}</span>` : ''}
      ${resp ? `<span class="meta sup">👁 ${esc(resp)}</span>` : ''}
      ${mtg ? `<span class="meta">${ic('clip', 'sm')}${esc(mtg.title)}</span>` : ''}
      ${acctTag(t) ? `<span class="meta">${acctTag(t)}</span>` : ''}
      ${t.status === 'seguimiento' ? '<span class="meta follow">En seguimiento</span>' : ''}
      ${t.repeat && !done ? `<span class="meta">🔁 ${esc(M.repeatLabel(t.repeat, t.due, t))}</span>` : ''}
    </button>
    <button class="tcard-done" data-a="toggle-task" data-id="${esc(t.id)}" aria-pressed="${done}">${ic('check', 'sm')} ${done ? 'Hecha' : 'Marcar hecha'}</button>
  </div>`;
}

function meetCard(m) {
  const d = parseISO(m.date);
  const when = [fmtTime(m.time), m.place].filter(Boolean).join(', ');
  const who = M.attendeesText(m);
  return `<button class="card meet" data-a="meeting" data-id="${esc(m.id)}">
    <span class="m-date"><b>${d.getDate()}</b><small>${MESES[d.getMonth()].slice(0, 3)}</small></span>
    <span class="m-body"><strong>${esc(m.title)}</strong>
      ${when ? `<span class="meta">${esc(when)}</span>` : ''}
      ${who ? `<span class="meta">Con ${esc(who)}</span>` : ''}
      ${(m.agenda || []).length ? `<span class="meta">${ic('clip', 'sm')}Agenda: ${m.agenda.length} ${m.agenda.length === 1 ? 'punto' : 'puntos'}</span>` : ''}</span>
  </button>`;
}

// ───────────── HOY ─────────────

// Fila de accesos rápidos (se eligen en Ajustes)
function quickRow() {
  const list = M.quickActions();
  return list.length ? `<nav class="quick-row" id="quick-row" aria-label="Accesos rápidos">${list.map(q => `<button type="button" data-a="qa" data-v="${esc(q.id)}"><span class="qi">${ic(q.ic)}</span><span>${esc(q.n)}</span></button>`).join('')}</nav>` : '';
}

// Hoy: mis próximas asignaciones (las que ya están en tiempo de preparación, resaltadas)
function assignmentsHoy() {
  if (!M.isModuleVisible('agenda') || !M.featureOn('agenda.asignaciones')) return '';
  const list = M.upcomingAssignments(today(), 45).slice(0, 3);
  if (!list.length) return '';
  return `<section><div class="sec-h"><h2>🎤 Mis asignaciones</h2><button class="btn small ghost" data-a="new-assign" aria-label="Nueva asignación">${ic('plus', 'sm')}</button></div>
    <div class="stack">${list.map(({ e, date, inDays }) => { const prep = inDays <= (Number(e.prep) || 0); return `<button class="card mini asg-card ${prep ? 'prep' : ''}" data-a="event" data-id="${esc(e.id)}" data-occ="${esc(date)}">
      <strong>${esc(e.asg || 'Asignación')}${e.title && e.title !== e.asg ? ` · ${esc(e.title)}` : ''}</strong>
      <span class="meta">${inDays === 0 ? '<b>Hoy</b>' : inDays === 1 ? '<b>Mañana</b>' : `${esc(fmtShort(date))} · en ${inDays} días`}${e.time ? `, ${fmtTime(e.time)}` : ''}${e.theme ? ` · ${esc(e.theme)}` : ''}</span>
      ${prep && inDays > 0 ? '<span class="meta prep-tag">✍️ Es tiempo de prepararla</span>' : ''}</button>`; }).join('')}</div></section>`;
}
// Hoy: tus asignaciones mecánicas de las próximas 2 semanas (del programa importado)
function mecasHoy() {
  if (!M.isModuleVisible('congregacion') || !M.featureOn('congregacion.mecanicas')) return '';
  const list = myMecas(14);
  if (!list.length) return '';
  const t = today();
  const DW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  return `<section><div class="sec-h"><h2>🎛 Mis asignaciones mecánicas</h2><button class="link" data-a="nav" data-v="congregacion">Ver programa</button></div>
    <div class="mc-mine">${list.map((x, i) => { const d = parseISO(x.d); const n = diffDays(x.d, t); return `<article class="mc-day${i === 0 ? ' next' : ''}"><div class="mc-date"><span class="mc-dow">${DW[d.getDay()]}</span><b>${d.getDate()}</b><span>${MESES[d.getMonth()].slice(0, 3)}</span></div>
      <div class="mc-cells"><div class="mc-cell"><span class="mc-r">${n === 0 ? 'Hoy' : n === 1 ? 'Mañana' : `En ${n} días`}</span>${x.roles.map(r => `<span class="mc-n">${ROLE_IC[r] || '📌'} ${esc(r)}</span>`).join('')}</div></div></article>`; }).join('')}</div></section>`;
}
// Hoy: capacitaciones del organigrama que toca revisar (desde 3 días antes)
function reviewsHoy() {
  if (!M.isModuleVisible('congregacion') || !M.featureOn('congregacion.organigrama')) return '';
  const list = M.reviewsDue();
  if (!list.length) return '';
  return `<section><div class="sec-h"><h2>🎓 Capacitación por revisar</h2></div><div class="stack">${list.map(d => `<button class="card mini asg-card prep" data-a="dept" data-id="${esc(d.id)}">
    <strong>${esc(d.name)}</strong><span class="meta">${d.reviewAt < today() ? `<b class="late">era el ${esc(fmtShort(d.reviewAt))}</b>` : d.reviewAt === today() ? '<b>Hoy</b>' : esc(relDays(d.reviewAt))}${M.deptHelpers(d).length ? ` · ${esc(M.deptHelpers(d).join(', '))}` : ''}</span>
    ${d.reviewNote ? `<span class="meta">${esc(d.reviewNote)}</span>` : ''}</button>`).join('')}</div></section>`;
}
// Hoy: aviso corto si hay cursos bíblicos pendientes (o pastoreo, los lunes)
function followNotice() {
  if (!M.isModuleVisible('personas')) return '';
  const s = M.featureOn('personas.seguimiento') ? M.studentsLate().length : 0;
  const p = new Date().getDay() === 1 ? M.pastoreoLate().length : 0;
  if (!s && !p) return '';
  const parts = [s ? `${s} ${s === 1 ? 'curso bíblico espera' : 'cursos bíblicos esperan'} tu visita` : '', p ? `${p} ${p === 1 ? 'hermano' : 'hermanos'} sin visita de pastoreo reciente` : ''].filter(Boolean);
  return `<button class="log-now follow-now" data-a="seguimiento">📖 <span><b>Seguimiento</b><small>${parts.join(' y ')}. Toca para verlos.</small></span></button>`;
}

// Avisos de Hoy: si hay 3 o más, se agrupan en una sola tarjeta que se despliega (Hoy queda más limpio)
function noticeGroup(list) {
  const items = list.filter(Boolean);
  if (items.length < 3) return items.join('');
  return `<details class="notice-group"><summary><span>🔔 <b>${items.length} avisos</b></span><span class="hint">Toca para verlos</span></summary><div class="stack">${items.join('')}</div></details>`;
}
// Tarjeta grande con lo que está pasando ahora o lo que sigue hoy
function nowCard(entries, t) {
  const d = new Date(), now = d.getHours() * 60 + d.getMinutes();
  const mm = x => { const [h, m] = String(x || '').split(':').map(Number); return h * 60 + (m || 0); };
  const timed = entries.filter(x => x.item.time);
  const cur = timed.find(x => mm(x.item.time) <= now && now < (x.item.endTime ? mm(x.item.endTime) : mm(x.item.time) + 60));
  const nxt = cur || timed.find(x => mm(x.item.time) > now);
  if (!nxt) return '';
  const { kind, item } = nxt;
  const isMeeting = kind === 'meeting';
  const color = isMeeting ? 'var(--c-mtg)' : M.eventColor(item);
  const left = mm(item.time) - now;
  const when = cur ? 'Ahora' : left < 60 ? `En ${left} min` : `A las ${fmtTime(item.time)}`;
  const occ = !isMeeting && M.isRepeating(item) && t !== item.date ? t : '';
  return `<button class="now-card" style="--c:${esc(color)}" data-a="${esc(isMeeting ? 'meeting' : 'event')}" data-id="${esc(item.id)}" ${occ ? `data-occ="${esc(occ)}"` : ''}>
    <span class="now-when">${cur ? '<i class="now-dot"></i>' : '⏭'} ${esc(when)}</span>
    <strong>${esc(item.title)}</strong>
    <span class="meta">${fmtTime(item.time)}${item.endTime ? ` – ${fmtTime(item.endTime)}` : ''}${item.place ? ` · ${esc(item.place)}` : ''}</span>
    ${item.theme ? `<span class="meta">💬 ${esc(item.theme)}</span>` : ''}
  </button>`;
}
export function hoy() {
  const t = today(), d = parseISO(t);
  const entries = M.entriesFor(M.agendaFor(t));
  const due = M.sortActive(data.tasks.filter(x => x.status !== 'hecha' && x.due && x.due <= t && M.isMineTask(x)));
  const sup = M.isModuleVisible('tareas') && M.featureOn('tareas.supervision') ? M.toSupervise() : [];
  const hour = new Date().getHours();
  const logToday = M.isModuleVisible('informe') && hour >= 18 && !data.entries.some(e => e.date === t) && !(M.profile().noActivityDays || []).includes(t);
  const juntaHoy = M.featureOn('notas.junta') && data.meetings.find(m => m.date === t && (m.agenda || []).length && !m.juntaRun?.finishedAt);
  const next = (M.featureOn('notas.reuniones') ? data.meetings : []).filter(m => m.date > t)
    .sort((x, y) => (x.date + (x.time || '')).localeCompare(y.date + (y.time || ''))).slice(0, 3);

  const parts = [];
  if (entries.length) parts.push(`${entries.length} ${entries.length === 1 ? 'compromiso' : 'compromisos'}`);
  if (due.length) parts.push(`${due.length} ${due.length === 1 ? 'tarea' : 'tareas'} por atender`);
  const summary = parts.length ? parts.join(' y ') : 'Sin compromisos ni tareas para hoy.';

  // Saludo con tu nombre y foto, y un resumen del día en tarjetas
  const v = M.profile();
  const me = data.people.find(p => p.isMe);
  const first = String(v.myName || me?.name || '').trim().split(/\s+/)[0];
  const h = new Date().getHours();
  const hello = `${h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'}${first ? `, ${esc(first)}` : ''}`;
  const photo = v.photo || me?.photo || '';
  const cur = t.slice(0, 7);
  const goal = v.goalEnabled && Number(v.goalMonthly) > 0 && M.isModuleVisible('informe') && M.featureOn('informe.meta');
  const mins = goal ? M.monthTotals(cur).minutes : 0;
  const pace = goal ? M.paceStatus(cur, mins, v.goalMonthly) : null;
  const nextMtg = next[0];
  const tiles = [
    M.isModuleVisible('agenda') ? `<button class="tile" data-a="nav" data-v="agenda" style="--c:var(--c-reunion)"><span class="tile-n">${entries.length}</span><span>${entries.length === 1 ? 'compromiso hoy' : 'compromisos hoy'}</span></button>` : '',
    M.isModuleVisible('tareas') ? `<button class="tile" data-a="nav" data-v="tareas" style="--c:${esc(due.length ? 'var(--warn)' : 'var(--primary)')}"><span class="tile-n">${due.length}</span><span>${due.length === 1 ? 'tarea por atender' : 'tareas por atender'}</span></button>` : '',
    goal ? `<button class="tile" data-a="nav" data-v="informe" style="--c:var(--c-s2)"><span class="tile-n">${pace ? pace.emoji : ''} ${M.fmtHM(mins)}</span><span>de ${v.goalMonthly} h este mes</span></button>` : '',
    nextMtg && M.isModuleVisible('notas') ? `<button class="tile" data-a="meeting" data-id="${esc(nextMtg.id)}" style="--c:var(--c-mtg)"><span class="tile-n sm">${esc(fmtShort(nextMtg.date))}</span><span>${esc(nextMtg.title)}${(nextMtg.agenda || []).length ? ` · ${nextMtg.agenda.length} puntos` : ''}</span></button>` : '',
  ].filter(Boolean);

  return `
  <header class="top hero">
    <div class="hello">
      ${photo || first ? `<span class="hello-av">${avatarHtml(photo, esc(initials(v.myName || me?.name || '')))}</span>` : ''}
      <div><p class="hello-t">${hello}</p><span class="dow">${cap(DIAS[d.getDay()])}</span><span class="dm">${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}</span></div>
    </div>
    ${actions()}
  </header>
  ${updateBanner()}
  ${assignedNotice()}
  ${noticeGroup([
    Nat.state.update ? `<button class="log-now apk-up" data-a="apk-update">📲 <span><b>Hay una actualización de la app</b><small>Versión ${esc(Nat.state.update.name)}. Toca para descargarla e instalarla.</small></span></button>` : '',
    Nat.isNative && Nat.state.exact && Nat.state.exact !== 'granted' ? `<button class="log-now" data-a="nat-exact-hoy">🔔 <span><b>Permite los avisos exactos</b><small>Sin este permiso, Android puede atrasar los avisos de tus eventos y tareas. Toca para activarlo.</small></span></button>` : '',
    Nat.isNative && Nat.state.health?.channelsOff?.length ? `<button class="log-now" data-a="phone-set" data-v="channel" data-ch="${esc(Nat.state.health.channelsOffIds[0])}">🔕 <span><b>Tienes apagados unos avisos en el teléfono</b><small>${esc(Nat.state.health.channelsOff.join(', '))}: por eso no te llegan. Toca para encenderlos.</small></span></button>` : '',
    (() => { const vn = M.isModuleVisible('congregacion') && M.featureOn('congregacion.visita') ? visitNotice() : null; return vn ? `<button class="log-now visit-now" data-a="visita-open" data-id="${esc(vn.v.id)}">🧳 <span><b>Visita del superintendente de circuito ${vn.days > 1 ? `en ${vn.days} días` : vn.days === 1 ? 'mañana' : vn.days === 0 ? 'hoy' : 'esta semana'}</b><small>${vn.pend ? `Faltan ${vn.pend} cosas por tener listas` : '✓ Todo listo'}${vn.next ? ` · ${esc(vn.next.it.t.split(' (')[0])} ${vn.next.date < today() ? 'venció el' : 'antes del'} ${esc(fmtShort(vn.next.date))}` : ''}</small></span></button>` : ''; })(),
    ...Cp.hoyNotices(),
    (() => { let last = ''; try { last = localStorage.getItem('miagenda.ultimoRespaldo') || ''; } catch { return ''; } const old = !last || (Date.parse(t) - Date.parse(last)) / 864e5 >= 14; return old && d.getDay() === 0 ? `<button class="log-now" data-a="backup-drive">☁️ <span><b>Guarda tu respaldo en Google Drive</b><small>${last ? `El último fue el ${esc(fmtShort(last))}.` : 'Todavía no has guardado uno desde este teléfono.'} Toca para guardarlo.</small></span></button>` : ''; })()
  ])}
  ${logToday ? `<button class="log-now" data-a="qa" data-v="time">📝 <span><b>Registra tu actividad de hoy</b><small>Aún no guardaste horas ni cursos. Toca aquí para anotarlos.</small></span></button>` : ''}
  ${juntaHoy ? `<button class="btn primary junta-now" data-a="junta-start" data-id="${esc(juntaHoy.id)}">▶ Iniciar la junta de hoy<small>${esc(juntaHoy.title)}${juntaHoy.time ? ` · ${fmtTime(juntaHoy.time)}` : ''}</small></button>` : ''}
  ${nowCard(entries, t)}
  ${tiles.length ? `<div class="tiles">${tiles.join('')}</div>` : `<p class="sub pad">${summary}</p>`}
  ${quickRow()}
  ${isCloud ? '' : `<div class="notice">${ic('pin', 'sm')}<p>Modo local: tus datos están solo en este teléfono. <button class="link" data-a="settings">Ver cómo sincronizar</button></p></div>`}
  ${followNotice()}
  ${reviewsHoy()}
  ${assignmentsHoy()}
  ${mecasHoy()}
  <section>
    <div class="sec-h"><h2>Agenda de hoy</h2></div>
    ${entries.length ? `<div class="tl">${entries.map(x => tlItem(x, t)).join('')}</div>`
      : empty('Nada programado para hoy.', `<button class="btn" data-a="new-event" data-date="${esc(t)}">Agregar evento</button>`, 'calendar')}
  </section>
  <section>
    <div class="sec-h"><h2>Tareas por atender</h2></div>
    ${due.length ? `<div class="stack">${due.map(taskRow).join('')}</div>`
      : empty('Sin tareas para hoy ni atrasadas.', `<button class="btn" data-a="new-task">Nueva tarea</button>`, 'tasks')}
  </section>
  ${sup.length ? `<section><div class="sec-h"><h2>Por supervisar</h2>${remindList(3).length ? '<button class="btn small ghost" data-a="remind-tasks" data-v="3">💬 Recordar</button>' : `<span class="hint">${sup.length}</span>`}</div>
    <p class="hint pad">Tareas de otros hermanos sin novedades hace ${M.SUPERVISE_DAYS} días o más. Pregunta cómo van y anota el avance en su seguimiento.</p>
    <div class="stack">${sup.map(({ task: x, quiet, late }) => `<button class="card mini" data-a="task" data-id="${esc(x.id)}">
      <strong>${esc(x.title)}</strong>
      <span class="meta">${(x.responsibles || []).length ? `${esc(x.responsibles.join(', '))} · ` : ''}${late ? `<b class="late">venció ${relDays(x.due)}</b>` : `sin novedades hace ${quiet} días`}</span>
    </button>`).join('')}</div></section>` : ''}
  ${next.length ? `<section><div class="sec-h"><h2>Próximas reuniones</h2></div><div class="stack">${next.map(meetCard).join('')}</div></section>` : ''}`;
}

// ───────────── AGENDA (calendario mensual) ─────────────

// Selector de vista de la Agenda: calendario, lista de los próximos días o todos los eventos
const agendaSeg = mode => `<div class="seg ag-views" role="tablist" aria-label="Vista">
  ${[['mes', 'Mes'], ['semana', 'Semana'], ['proximos', 'Próximos'], ['todos', 'Todos']].map(([k, n]) => `<button data-a="agenda-mode" data-v="${esc(k)}" aria-pressed="${mode === k}">${n}</button>`).join('')}</div>`;

const LIST_DAYS = 30;
function agendaUpcoming() {
  const t = today();
  let html = '';
  for (let i = 0; i < LIST_DAYS; i++) {
    const d = parseISO(t); d.setDate(d.getDate() + i);
    const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const a = M.agendaFor(iso);
    const entries = M.entriesFor(a);
    if (!entries.length && !a.tasks.length) continue;
    html += `<section class="day-block"><div class="sec-h"><h2>${i === 0 ? 'Hoy · ' : i === 1 ? 'Mañana · ' : ''}${cap(fmtLong(iso))}</h2><button class="btn small ghost" data-a="new-event" data-date="${esc(iso)}" aria-label="Agregar evento el ${fmtLong(iso)}">${ic('plus', 'sm')}</button></div>
      ${entries.length ? `<div class="tl">${entries.map(x => tlItem(x, iso)).join('')}</div>` : ''}
      ${a.tasks.length ? `<div class="stack">${a.tasks.map(taskRow).join('')}</div>` : ''}</section>`;
  }
  return html || empty(`No hay nada en los próximos ${LIST_DAYS} días.`, '<button class="btn" data-a="new-event">Agregar evento</button>', 'calendar');
}

// Cada evento una sola vez (con su repetición): para revisar, compartir o borrar los que se repiten
function agendaAll(st) {
  const t = today();
  const picking = !!st.picking, picked = new Set(st.picked || []);
  const evs = [...data.events].sort((a, b) => (a.time || '99').localeCompare(b.time || '99') || (a.title || '').localeCompare(b.title || '', 'es'));
  const repeating = evs.filter(e => M.isRepeating(e));
  const once = evs.filter(e => !M.isRepeating(e) && e.date >= t).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  const row = e => {
    const cat = { c: M.eventColor(e) };
    const when = [M.isRepeating(e) ? M.repeatText(e) : cap(fmtShort(e.date)), e.time ? fmtTime(e.time) + (e.endTime ? `–${fmtTime(e.endTime)}` : '') : ''].filter(Boolean).join(' · ');
    const body = `<span class="bar"></span>
      <span class="tl-body"><strong>${esc(e.title)}</strong><span class="meta">${esc(when)}</span>
      ${e.theme ? `<span class="meta">💬 ${esc(e.theme)}</span>` : ''}
      ${e.sharedId ? `<span class="meta shared-tag">👥 ${store.isSharedOwner(e) ? 'Compartido' : `De ${esc(e.ownerName || 'otra cuenta')}`}</span>` : ''}</span>`;
    return picking
      ? `<label class="tl-item pick-row ${picked.has(e.id) ? 'on' : ''}" style="--c:${esc(cat.c)}"><input type="checkbox" data-a="ev-pick" value="${esc(e.id)}" ${picked.has(e.id) ? 'checked' : ''} aria-label="Seleccionar ${esc(e.title)}">${body}</label>`
      : `<button class="tl-item" style="--c:${esc(cat.c)}" data-a="event" data-id="${esc(e.id)}">${body}</button>`;
  };
  const secHead = (title, list) => `<div class="sec-h"><h2>${title} (${list.length})</h2>${picking ? `<button class="btn small ghost" data-a="ev-pick-all" data-v="${esc(list.map(e => e.id).join(','))}">${list.every(e => picked.has(e.id)) ? 'Quitar todos' : 'Marcar todos'}</button>` : ''}</div>`;
  if (!evs.length) return empty('Aún no tienes eventos.', '<button class="btn" data-a="new-event">Agregar evento</button>', 'calendar');
  const past = evs.filter(e => !M.isRepeating(e) && e.date < t).sort((a, b) => b.date.localeCompare(a.date));
  return `<div class="bulk-top">${picking
      ? `<span class="hint">Marca los eventos que quieras ${isCloud ? 'compartir o ' : ''}eliminar.</span><button class="btn small ghost" data-a="ev-pick-mode" data-v="off">Cancelar</button>`
      : `<button class="btn small" data-a="ev-pick-mode" data-v="on">${ic('check', 'sm')} Seleccionar varios</button>`}</div>
    ${repeating.length ? `<section>${secHead('Se repiten', repeating)}<div class="tl all">${repeating.map(row).join('')}</div></section>` : ''}
    ${once.length ? `<section>${secHead('Próximos, una sola vez', once)}<div class="tl all">${once.map(row).join('')}</div></section>` : ''}
    ${past.length ? `<section>${secHead('Ya pasaron', past)}<div class="tl all">${past.map(row).join('')}</div></section>` : ''}
    ${picking ? `<div class="bulk-bar"><span><b>${picked.size}</b> ${picked.size === 1 ? 'seleccionado' : 'seleccionados'}</span><span class="quick">${isCloud ? `<button class="btn" data-a="ev-bulk-share" ${picked.size ? '' : 'disabled'}>👥 Compartir</button>` : ''}<button class="btn danger-fill" data-a="ev-bulk-delete" ${picked.size ? '' : 'disabled'}>Eliminar</button></span></div>` : ''}`;
}

// Semana como calendario: cada evento en su hora y con su duración; se mueve arrastrando (js/weekcal.js)
export const weekSpan = st => st.span || (typeof window !== 'undefined' && window.innerWidth < 560 ? 3 : 7);
export const weekStartOf = st => (weekSpan(st) === 7 ? (st.week || M.mondayOf(today())) : (st.day || today()));
function agendaWeek(st) {
  const n = weekSpan(st);
  const monday = weekStartOf(st);
  const days = Array.from({ length: n }, (_, i) => M.addDaysISO(monday, i));
  const t = today();
  const { START_H, END_H, PX_H } = WC;
  const allDay = days.map(() => []);
  const cols = days.map((iso, di) => {
    const a = M.agendaFor(iso);
    const items = [...a.events.map(e => ({ kind: 'event', item: e })), ...a.meetings.map(m => ({ kind: 'meeting', item: m }))];
    const timed = [];
    items.forEach(x => { const sp = WC.span(x.item); if (sp) timed.push({ ...x, ...sp }); else allDay[di].push(x); });
    return WC.lanes(timed).map(x => {
      const isM = x.kind === 'meeting';
      const color = isM ? 'var(--c-mtg)' : M.eventColor(x.item);
      const occ = !isM && M.isRepeating(x.item) && iso !== x.item.date ? iso : '';
      const s0 = Math.max(x.s, START_H * 60), e0 = Math.min(Math.max(x.e, s0 + 15), END_H * 60);
      const top = (s0 - START_H * 60) / 60 * PX_H, h = Math.max(18, (e0 - s0) / 60 * PX_H - 2);
      const w = 100 / x.lanes;
      return `<div class="wc-ev ${h < 34 ? 'tiny' : ''}" role="button" tabindex="0" style="--c:${esc(color)};top:${top}px;height:${h}px;left:calc(${x.lane * w}% + 2px);width:calc(${w}% - 4px)"
        data-a="${esc(x.kind)}" data-id="${esc(x.item.id)}" ${occ ? `data-occ="${esc(occ)}"` : ''} data-kind="${esc(x.kind)}" data-date="${esc(iso)}" data-s="${esc(x.s)}" data-e="${esc(x.e)}" data-drag>
        <b>${esc(x.item.title)}</b><span class="wc-t">${fmtTime(x.item.time)}${x.item.endTime ? ` – ${fmtTime(x.item.endTime)}` : ''}</span><i class="wc-resize" aria-hidden="true"></i></div>`;
    }).join('');
  });
  const hours = Array.from({ length: END_H - START_H }, (_, i) => START_H + i);
  const now = new Date(); const nowMin = now.getHours() * 60 + now.getMinutes();
  const head = days.map(iso => `<div class="wc-dh ${iso === t ? 'today' : ''}"><span>${cap(DIAS[parseISO(iso).getDay()]).slice(0, 3)}</span><b>${Number(iso.slice(8))}</b></div>`).join('');
  const hasAllDay = allDay.some(l => l.length);
  return `<div class="wk-nav"><button class="icon-btn" data-a="wk-move" data-v="-${n}" aria-label="Anteriores">${ic('left')}</button>
      <strong>${fmtShort(monday)} – ${fmtShort(days[n - 1])}</strong>
      <button class="icon-btn" data-a="wk-move" data-v="${esc(n)}" aria-label="Siguientes">${ic('right')}</button></div>
    <div class="wk-actions">
      <div class="seg small" role="group" aria-label="Días a la vista"><button data-a="wk-span" data-v="3" aria-pressed="${n === 3}">3 días</button><button data-a="wk-span" data-v="7" aria-pressed="${n === 7}">Semana</button></div>
      <button class="btn small" data-a="wk-move" data-v="0">Hoy</button>
      <button class="btn small primary" data-a="wk-share">Enviar imagen</button>
      <button class="btn small ghost" data-a="wk-tpl">📑 Plantillas</button>
    </div>
    <p class="hint wc-help">Toca un espacio vacío para crear un evento a esa hora. Arrastra un evento para moverlo (con el dedo: mantenlo presionado) y la rayita de abajo para cambiar cuánto dura.</p>
    <div class="wc-scroll" id="wc-scroll">
      <div class="wc-grid ${n === 3 ? 'three' : ''}" style="--ph:${PX_H}px;--n:${n}">
        <div class="wc-head"><div class="wc-gut"></div>${head}</div>
        ${hasAllDay ? `<div class="wc-allday"><div class="wc-gut">Sin hora</div>${allDay.map(l => `<div class="wc-ad">${l.map(x => `<button class="wc-chip" style="--c:${esc(x.kind === 'meeting' ? 'var(--c-mtg)' : M.eventColor(x.item))}" data-a="${esc(x.kind)}" data-id="${esc(x.item.id)}">${esc(x.item.title)}</button>`).join('')}</div>`).join('')}</div>` : ''}
        <div class="wc-body" style="height:${(END_H - START_H) * PX_H}px">
          <div class="wc-times">${hours.map(h => `<span style="top:${(h - START_H) * PX_H}px">${h % 12 || 12} ${h < 12 ? 'a. m.' : 'p. m.'}</span>`).join('')}</div>
          ${days.map((iso, i) => `<div class="wc-col ${iso === t ? 'today' : ''}" data-date="${esc(iso)}"><div class="wc-evs">${cols[i]}</div>${iso === t && nowMin >= START_H * 60 ? `<i class="wc-now" style="top:${(nowMin - START_H * 60) / 60 * PX_H}px"></i>` : ''}</div>`).join('')}
        </div>
      </div>
    </div>`;
}

export function agenda(ui) {
  const st = ui.agenda;
  if (st.mode === 'semana') {
    return `<header class="top cal-top"><h1>Agenda</h1><div class="cal-nav"><button class="btn small" data-a="new-event">${ic('plus', 'sm')} Evento</button></div></header>
      ${agendaSeg(st.mode)}${agendaWeek(st)}`;
  }
  if (st.mode === 'proximos' || st.mode === 'todos') {
    return `<header class="top cal-top"><h1>Agenda</h1><div class="cal-nav"><button class="btn small" data-a="new-event">${ic('plus', 'sm')} Evento</button></div></header>
      ${agendaSeg(st.mode)}
      ${st.mode === 'proximos' ? agendaUpcoming() : agendaAll(st)}
      <p class="hint pad"><button class="link" data-a="ics-export">📅 Pasar mi agenda a Google Calendar o al calendario del teléfono</button></p>`;
  }
  const [y, m] = st.ym.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;   // la semana empieza en lunes
  const t = today();

  let cells = '<span class="day blank"></span>'.repeat(lead);
  for (let d = 1; d <= days; d++) {
    const iso = `${y}-${pad(m)}-${pad(d)}`;
    const a = M.agendaFor(iso);
    const colors = [...new Set([...a.events.map(e => M.eventColor(e)), ...(a.meetings.length ? ['var(--c-mtg)'] : [])])].slice(0, 3);
    const dots = colors.map(c => `<i class="dot" style="--c:${esc(c)}"></i>`).join('') + (a.tasks.length ? '<i class="dot task"></i>' : '');
    cells += `<button class="day ${iso === t ? 'today' : ''}" data-a="cal-sel" data-date="${esc(iso)}" aria-pressed="${iso === st.sel}" aria-label="${fmtLong(iso)}"><span class="n">${d}</span><span class="dots">${dots}</span></button>`;
  }

  const a = M.agendaFor(st.sel);
  const entries = M.entriesFor(a);
  const list = entries.length || a.tasks.length
    ? `${entries.length ? `<div class="tl">${entries.map(x => tlItem(x, st.sel)).join('')}</div>` : ''}
       ${a.tasks.length ? `<h3 class="sub-h">Tareas con esta fecha</h3><div class="stack">${a.tasks.map(taskRow).join('')}</div>` : ''}`
    : empty('No hay nada programado este día.', `<button class="btn" data-a="new-event" data-date="${esc(st.sel)}">Agregar evento</button>`, 'calendar');

  return `
  <header class="top cal-top">
    <h1>${fmtMonth(y, m)}</h1>
    <div class="cal-nav">
      <button class="icon-btn" data-a="cal-prev" aria-label="Mes anterior">${ic('left')}</button>
      <button class="btn small" data-a="cal-today">Hoy</button>
      <button class="icon-btn" data-a="cal-next" aria-label="Mes siguiente">${ic('right')}</button>
    </div>
  </header>
  ${agendaSeg('mes')}
  <div class="cal-split">
  <div class="cal-col">
  <div class="cal-wd" aria-hidden="true">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(x => `<span>${x}</span>`).join('')}</div>
  <div class="cal">${cells}</div>
  </div>
  <section class="cal-day">
    <div class="sec-h"><h2>${fmtLong(st.sel)}</h2><button class="btn small" data-a="new-event" data-date="${esc(st.sel)}">Agregar</button></div>
    ${list}
  </section>
  </div>`;
}

// ───────────── TAREAS ─────────────

export function tareas(ui) {
  const f = ui.tareas.f;
  const pid = ui.tareas.p || '';
  const mid = ui.tareas.m || '';   // '' = todas · '__any' = de reuniones · '__mine' = me tocan · '__sup' = superviso · id = una reunión
  const byOrigin = t => !mid || (mid === '__any' ? !!t.meetingId : mid === '__mine' ? M.isMineTask(t) : mid === '__sup' ? !M.isMineTask(t) : t.meetingId === mid);
  const base = data.tasks.filter(t => (!pid || t.personId === pid) && byOrigin(t));
  const act = base.filter(t => t.status !== 'hecha');
  const seg = base.filter(t => t.status === 'seguimiento');
  const done = base.filter(t => t.status === 'hecha');
  const list = f === 'hechas' ? M.sortDone(done) : M.sortActive(f === 'seguimiento' ? seg : act);
  const chips = [['activas', 'Activas', act.length], ['seguimiento', 'En seguimiento', seg.length], ['hechas', 'Hechas', done.length]]
    .map(([k, n, c]) => `<button class="chip" data-a="filter-tasks" data-v="${esc(k)}" aria-pressed="${f === k}">${n} <b>${c}</b></button>`).join('');
  const withTasks = [...new Set(data.tasks.map(t => t.personId).filter(Boolean))]
    .map(id => M.person(id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const withMeetings = [...new Set(data.tasks.map(t => t.meetingId).filter(Boolean))]
    .map(id => data.meetings.find(m => m.id === id)).filter(Boolean).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (mid && !mid.startsWith('__') && !withMeetings.some(m => m.id === mid)) ui.tareas.m = '';
  const supervised = data.tasks.some(t => !M.isMineTask(t));
  const personSel = withTasks.length
    ? `<select id="tareas-person" aria-label="Filtrar por persona"><option value="">Todas las personas</option>${withTasks.map(p => `<option value="${esc(p.id)}" ${p.id === pid ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>` : '';
  const meetingSel = withMeetings.length || supervised
    ? `<select id="tareas-meeting" aria-label="Filtrar por origen"><option value="">Todas las tareas</option>${supervised ? `<option value="__mine" ${mid === '__mine' ? 'selected' : ''}>Me tocan a mí</option><option value="__sup" ${mid === '__sup' ? 'selected' : ''}>Las que superviso</option>` : ''}${withMeetings.length ? `<option value="__any" ${mid === '__any' ? 'selected' : ''}>Solo de reuniones</option>` : ''}${withMeetings.map(m => `<option value="${esc(m.id)}" ${m.id === mid ? 'selected' : ''}>${esc(m.title)} — ${fmtShort(m.date)}</option>`).join('')}</select>` : '';
  const personFilter = personSel || meetingSel ? `<div class="pad filters ${personSel && meetingSel ? 'two' : ''}">${personSel}${meetingSel}</div>` : '';
  const msg = {
    activas: 'No tienes tareas activas. Agrega una para darle seguimiento.',
    seguimiento: 'Aquí verás las tareas a las que ya les anotaste un seguimiento.',
    hechas: 'Todavía no has completado ninguna tarea.',
  }[f];
  const cards = ui.tareas.view === 'tarjetas';
  const item = cards ? taskCard : taskRow;
  const wrap = (l, movable = false) => `<div class="${cards ? 'tgrid' : 'stack'}">${l.map(t => item(t, movable)).join('')}</div>`;
  const viewSeg = `<div class="seg small tview" role="group" aria-label="Cómo ver las tareas"><button data-a="tasks-view" data-v="lista" aria-pressed="${!cards}">☰ Lista</button><button data-a="tasks-view" data-v="tarjetas" aria-pressed="${cards}">▦ Tarjetas</button></div>`;
  // Agrupar por fecha (como siempre) o por el departamento que ejecuta la tarea (solo si hay departamentos)
  const hasDepts = (data.depts || []).length > 0;
  const byDept = hasDepts && ui.tareas.group === 'depto';
  const groupSeg = hasDepts ? `<div class="seg small tgroup-pick" role="group" aria-label="Agrupar las tareas"><button data-a="tasks-group" data-v="fecha" aria-pressed="${!byDept}">📅 Por fecha</button><button data-a="tasks-group" data-v="depto" aria-pressed="${byDept}">🏢 Por departamento</button></div>` : '';
  const tools = `<div class="ttools">${groupSeg}${viewSeg}</div>`;
  const t0 = today();
  const closed = ui.tareas.closed || [];
  const deptBody = () => M.taskDeptGroups(list, f === 'hechas').map(g => {
    const key = g.k || '__none';
    const late = f === 'hechas' ? 0 : g.tasks.filter(x => x.due && x.due < t0).length;
    const hi = f === 'hechas' ? 0 : g.tasks.filter(x => M.taskPrio(x) === 'alta').length;
    const info = [g.parent ? `De ${esc(g.parent.name)}` : '', g.guessed ? `${g.guessed === 1 ? '1 ubicada' : `${g.guessed} ubicadas`} por su responsable` : ''].filter(Boolean).join(' · ');
    return `<details class="tgroup dept ${g.d ? '' : 'none'}" data-k="${esc(key)}" ${closed.includes(key) ? '' : 'open'}>
      <summary><h2>${g.d ? `<span class="org-ic">${ic(g.d.ic || 'flag', 'sm')}</span>` : ''}<span>${esc(g.n)}</span></h2><span class="tg-n">${late ? `<span class="tsum late"><b>${late}</b> ${late === 1 ? 'atrasada' : 'atrasadas'}</span>` : ''}${hi ? `<span class="tsum hi"><b>${hi}</b> alta</span>` : ''}<b class="tg-count">${g.tasks.length}</b></span></summary>
      ${info ? `<p class="hint tg-info">${info}</p>` : ''}
      ${wrap(g.tasks, true)}</details>`;
  }).join('') + `<p class="hint pad tmove-hint">⠿ Arrastra una tarea por su ⠿ a otro departamento, o toca ⠿ para elegirlo de una lista.</p>`;
  // Activas y en seguimiento: por grupos (atrasadas, hoy, semana, más adelante, sin fecha y, al final, baja prioridad)
  let body = '';
  if (!list.length) body = empty(msg, f === 'hechas' ? '' : `<button class="btn" data-a="new-task">Nueva tarea</button>`, 'tasks');
  else if (f === 'hechas') body = byDept ? deptBody() : wrap(list);
  else {
    const buckets = M.taskBuckets(list);
    const n = k => buckets.find(b => b.k === k)?.tasks.length || 0;
    const hi = list.filter(t => M.taskPrio(t) === 'alta').length;
    const sum = [
      n('late') ? `<span class="tsum late"><b>${n('late')}</b> ${n('late') === 1 ? 'atrasada' : 'atrasadas'}</span>` : '',
      n('today') ? `<span class="tsum soon"><b>${n('today')}</b> para hoy</span>` : '',
      n('week') ? `<span class="tsum"><b>${n('week')}</b> esta semana</span>` : '',
      hi ? `<span class="tsum hi"><b>${hi}</b> de prioridad alta</span>` : '',
    ].filter(Boolean).join('');
    body = `<div class="tbar"><div class="tsums">${sum}</div>${tools}</div>
      ${byDept ? deptBody() : buckets.map(b => b.k === 'low'
        ? `<details class="tgroup low" ${ui.tareas.lowOpen ? 'open' : ''}><summary><h2>⬇ ${b.n}</h2><span class="hint">${b.tasks.length} · tócalo para verlas</span></summary>${wrap(b.tasks)}</details>`
        : `<section class="tgroup ${esc(b.k)}"><div class="sec-h"><h2>${b.n}</h2><span class="hint">${b.tasks.length}</span></div>${wrap(b.tasks)}</section>`).join('')}`;
  }
  const rem = f !== 'hechas' ? remindList(3) : [];
  const remLate = rem.reduce((n, b) => n + b.late, 0);
  return `${head('Tareas', actions())}
  ${assignedNotice()}
  ${Cp.inboxButton('task')}
  ${rem.length ? `<button class="log-now remind-now" data-a="remind-tasks" data-v="3">💬 <span><b>Recordar por WhatsApp</b><small>${rem.length} ${rem.length === 1 ? 'hermano tiene' : 'hermanos tienen'} ${remLate ? `${remLate} ${remLate === 1 ? 'tarea atrasada' : 'tareas atrasadas'}` : 'tareas que vencen pronto'}. Toca para mandarle a cada uno su recordatorio.</small></span></button>` : ''}
  <div class="chips">${chips}</div>
  ${personFilter}
  ${list.length && f === 'hechas' ? `<div class="tbar"><span></span>${tools}</div>` : ''}
  ${body}`;
}

// ───────────── PERSONAS Y GRUPOS ─────────────

function personRow(p) {
  const open = data.tasks.filter(t => t.personId === p.id && t.status !== 'hecha').length;
  const groups = M.groupsOf(p).map(g => g.name).join(', ');
  const last = p.lastContact ? `Último contacto ${relDays(p.lastContact)}` : '';
  return `<button class="card person" data-a="person" data-id="${esc(p.id)}">
    ${avatarHtml(p.photo, esc(initials(p.name)))}
    <span class="p-body"><strong>${esc(p.name)}</strong>
      ${p.isMe ? `<span class="meta">Tú</span>` : ''}
      ${p.role ? `<span class="meta">${esc(p.role)}</span>` : ''}
      ${(p.privileges || []).length ? `<span class="meta priv">${esc(p.privileges.slice(0, 2).join(' · '))}${p.privileges.length > 2 ? ` y ${p.privileges.length - 2} más` : ''}</span>` : ''}
      ${groups ? `<span class="meta">${ic('users', 'sm')}${esc(groups)}</span>` : ''}
      ${last ? `<span class="meta">${last}</span>` : ''}</span>
    ${open ? `<span class="badge" title="Tareas abiertas">${open}</span>` : ''}
  </button>`;
}

export function personasList(ui) {
  const q = norm(ui.personas.q), g = ui.personas.g, pv = ui.personas.pv || '';
  const list = data.people
    .filter(p => (!g || (p.groupIds || []).includes(g))
      && (!pv || (p.privileges || []).includes(pv))
      && (!q || norm([p.name, p.role, p.phone, p.notes, (p.privileges || []).join(' '), M.groupsOf(p).map(x => x.name).join(' ')].join(' ')).includes(q)))
    .sort((a, b) => (b.isMe ? 1 : 0) - (a.isMe ? 1 : 0) || a.name.localeCompare(b.name, 'es'));
  if (!list.length) {
    return data.people.length
      ? empty('Nadie coincide con esa búsqueda.', '', 'users')
      : empty('Aún no has agregado personas. Guarda a quienes visitas, capacitas o acompañas en su estudio.', `<button class="btn" data-a="new-person">Agregar persona</button>`, 'users');
  }
  return `<div class="stack">${list.map(personRow).join('')}</div>`;
}

function gruposList() {
  const groups = [...data.groups].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  if (!groups.length) {
    return empty('Crea grupos para reunir personas por rol o responsabilidad, por ejemplo tu cuerpo de ancianos o los siervos ministeriales.', `<button class="btn" data-a="new-group">Nuevo grupo</button>`, 'users');
  }
  return `<div class="stack">${groups.map(g => {
    const members = data.people.filter(p => (p.groupIds || []).includes(g.id)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const names = members.slice(0, 3).map(p => p.name).join(', ') + (members.length > 3 ? ` y ${members.length - 3} más` : '');
    return `<button class="card person" data-a="group" data-id="${esc(g.id)}">
      <span class="avatar">${ic('users')}</span>
      <span class="p-body"><strong>${esc(g.name)}</strong>
        <span class="meta">${members.length} ${members.length === 1 ? 'persona' : 'personas'}</span>
        ${names ? `<span class="meta">${esc(names)}</span>` : ''}</span>
    </button>`;
  }).join('')}</div>`;
}

export function personas(ui) {
  const st = ui.personas;
  if (st.seg === 'seguimiento' && !M.featureOn('personas.seguimiento')) st.seg = 'personas';
  const seg = `<div class="seg">
    <button data-a="pseg" data-v="personas" aria-pressed="${st.seg !== 'grupos'}">Personas</button>
    <button data-a="pseg" data-v="grupos" aria-pressed="${st.seg === 'grupos'}">Grupos</button>
    <button data-a="pseg" data-v="seguimiento" aria-pressed="${st.seg === 'seguimiento'}">Seguimiento</button></div>`;
  if (st.seg === 'grupos') return `${head('Grupos', actions())}${seg}${gruposList()}`;
  if (st.seg === 'seguimiento') return `${head('Seguimiento', actions())}${seg}${seguimiento(st)}`;

  const groups = [...data.groups].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  if (st.g && !groups.some(g => g.id === st.g)) st.g = '';
  const chips = groups.length
    ? `<div class="chips"><button class="chip" data-a="pfilter" data-v="" aria-pressed="${!st.g}">Todos</button>${groups.map(g => `<button class="chip" data-a="pfilter" data-v="${esc(g.id)}" aria-pressed="${st.g === g.id}">${esc(g.name)}</button>`).join('')}</div>` : '';
  const used = [...new Set(data.people.flatMap(p => p.privileges || []))].sort((a, b) => a.localeCompare(b, 'es'));
  if (st.pv && !used.includes(st.pv)) st.pv = '';
  const privSel = used.length ? `<div class="pad"><select id="personas-priv" aria-label="Filtrar por privilegio"><option value="">Todos los privilegios</option>${used.map(x => `<option value="${esc(x)}" ${x === st.pv ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>` : '';
  return `${head('Personas', actions())}${seg}
  <div class="search">${ic('search')}<input id="q" type="search" placeholder="Buscar por nombre" value="${esc(st.q)}" autocomplete="off" aria-label="Buscar personas"></div>
  ${chips}
  ${privSel}
  <div id="results">${personasList(ui)}</div>`;
}

// ───── Seguimiento: cursos bíblicos, revisitas y pastoreo ─────
const agoText = days => (days == null ? 'nunca' : days === 0 ? 'hoy' : days === 1 ? 'ayer' : days < 60 ? `hace ${days} días` : `hace ${Math.round(days / 30)} meses`);
const byNeed = st => (a, b) => { const x = st(a).days, y = st(b).days; return (y == null ? 1e9 : y) - (x == null ? 1e9 : x) || a.name.localeCompare(b.name, 'es'); };
function followRow(p, st, sub) {
  return `<button class="card person ${st.late ? 'late' : ''}" data-a="person" data-id="${esc(p.id)}">
    ${avatarHtml(p.photo, esc(initials(p.name)))}
    <span class="p-body"><strong>${esc(p.name)}</strong><span class="meta">${sub}</span></span>
    ${st.late ? '<span class="badge warn" title="Hace falta">!</span>' : ''}</button>`;
}
function seguimiento(st) {
  const students = data.people.filter(M.isStudent).sort(byNeed(M.studyStatus));
  const inter = data.people.filter(M.isInterested).sort(byNeed(M.revisitStatus));
  const lateS = students.filter(p => M.studyStatus(p).late).length;
  let html = `<section><div class="sec-h"><h2>📖 Cursos bíblicos</h2><span class="hint">${students.length}${lateS ? ` · ${lateS} pendientes` : ''}</span></div>
    ${students.length ? `<div class="stack">${students.map(p => { const s = M.studyStatus(p); return followRow(p, s, `${p.study?.lesson ? `Lección ${esc(p.study.lesson)} · ` : ''}estudiaron ${agoText(s.days)}${s.next ? ` · toca ${relDays(s.next)}` : ''}`); }).join('')}</div>`
      : '<p class="hint pad">Aún no hay estudiantes. En la ficha de una persona toca «Anotar visita» → Curso bíblico, o ponle la relación «Estudiante bíblico».</p>'}</section>`;
  if (inter.length) html += `<section><div class="sec-h"><h2>🚪 Revisitas</h2><span class="hint">${inter.length}</span></div>
    <div class="stack">${inter.map(p => { const s = M.revisitStatus(p); return followRow(p, s, `Última visita ${agoText(s.days)}`); }).join('')}</div></section>`;
  if (M.canShepherd()) {
    const groups = [...data.groups].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const g = st.g && groups.some(x => x.id === st.g) ? st.g : '';
    const sheep = M.pastoreoPool().filter(p => !g || (p.groupIds || []).includes(g)).sort(byNeed(M.pastoreoStatus));
    const scope = M.profile().pastoreoScope === 'all' ? 'all' : 'mine';
    const lateP = sheep.filter(p => M.pastoreoStatus(p).late).length;
    html += `<section><div class="sec-h"><h2>🐑 Pastoreo</h2><span class="hint">${lateP ? `${lateP} sin visita reciente` : 'al día'}</span></div>
      <div class="pad follow-opts"><label class="mini-f"><span>A quiénes veo</span><select id="pastoreo-scope"><option value="mine" ${scope === 'mine' ? 'selected' : ''}>Mi grupo y los siervos ministeriales</option><option value="all" ${scope === 'all' ? 'selected' : ''}>Toda la congregación</option></select></label>
        ${scope === 'mine' && !M.myGroupIds().length ? '<p class="hint">Para ver solo tu grupo, agrega tu ficha («Tú») al grupo que atiendes en Personas → Grupos.</p>' : ''}
        <label class="mini-f"><span>Avisar si pasan más de</span><select id="pastoreo-months">${[3, 4, 6, 9, 12].map(n => `<option value="${esc(n)}" ${n === M.pastoreoMonths() ? 'selected' : ''}>${n} meses</option>`).join('')}</select></label>
        <button type="button" class="btn small ghost" data-a="past-import">📥 Cargar visitas anteriores</button></div>
      ${groups.length ? `<div class="chips"><button class="chip" data-a="pfilter" data-v="" aria-pressed="${!g}">Todos</button>${groups.map(x => `<button class="chip" data-a="pfilter" data-v="${esc(x.id)}" aria-pressed="${g === x.id}">${esc(x.name)}</button>`).join('')}</div>` : ''}
      ${sheep.length ? `<div class="stack">${sheep.map(p => { const s = M.pastoreoStatus(p); return followRow(p, s, `${p.role ? `${esc(p.role)} · ` : ''}visita de pastoreo ${agoText(s.days)}${M.helpedByName(p) ? ` · 🤝 ${esc(M.helpedByName(p))}` : ''}`); }).join('')}</div>`
        : '<p class="hint pad">No hay hermanos en esta lista. Agrega personas en la pestaña Personas.</p>'}</section>`;
  }
  return html;
}

// ───────────── CONGREGACIÓN: organigrama ─────────────
// o = { pick: Set|null, sort: bool, fold: Set }  (fold = departamentos plegados)
const countAll = n => n.children.reduce((t, c) => t + 1 + countAll(c), 0);
function orgNode(n, depth, o) {
  const { d, children } = n;
  const head = M.deptHeadsLabeled(d).join(', '), helpers = M.deptHelpers(d);
  const folded = o.fold.has(d.id) && children.length;
  const main = o.pick ? `<label class="org-node picking ${o.pick.has(d.id) ? 'on' : ''}"><input type="checkbox" data-a="org-pick-item" value="${esc(d.id)}" ${o.pick.has(d.id) ? 'checked' : ''} aria-label="Elegir ${esc(d.name)}">`
    : `<button class="org-node" data-a="dept" data-id="${esc(d.id)}">`;
  const tog = children.length ? `<button class="org-tog" data-a="org-fold" data-id="${esc(d.id)}" aria-expanded="${!folded}" aria-label="${folded ? 'Mostrar' : 'Ocultar'} lo que depende de ${esc(d.name)}">${folded ? '▸' : '▾'}</button>` : '<span class="org-tog sp"></span>';
  const sortBtns = o.sort ? `<span class="org-sort"><button data-a="dept-move" data-id="${esc(d.id)}" data-v="up" aria-label="Subir">↑</button><button data-a="dept-move" data-id="${esc(d.id)}" data-v="down" aria-label="Bajar">↓</button><button data-a="dept-move" data-id="${esc(d.id)}" data-v="in" aria-label="Meter dentro del de arriba">→</button><button data-a="dept-move" data-id="${esc(d.id)}" data-v="out" aria-label="Sacar un nivel">←</button></span>` : '';
  return `<li class="org-li d${Math.min(depth, 3)}"><div class="org-row">${tog}${main}
      <span class="org-ic">${ic(d.ic || 'flag', 'sm')}</span>
      <span class="grow"><strong>${esc(d.name)}</strong>
        <span class="meta">${M.isGroupBox(d) ? `Pertenecen a la congregación${children.length ? ` · ${children.length} grupos` : ''}` : head ? `★ ${esc(head)}` : '<i>Sin responsable</i>'}</span>
        ${helpers.length ? `<span class="meta">${esc(helpers.slice(0, 3).join(', '))}${helpers.length > 3 ? ` y ${helpers.length - 3} más` : ''}</span>` : ''}
        ${folded ? `<span class="meta fold-n">+${countAll(n)} debajo</span>` : ''}</span>
    ${o.pick ? '</label>' : '</button>'}${sortBtns}</div>${children.length && !folded ? `<ul class="org-ul">${children.map(c => orgNode(c, depth + 1, o)).join('')}</ul>` : ''}</li>`;
}
// Vista en árbol: arriba cada departamento principal y, debajo, sus áreas en columnas (se desliza de lado)
function orgChart(tree) {
  const who = d => { const h = M.isGroupBox(d) ? 'De la congregación' : M.deptHeadsLabeled(d).join(', '); return h ? `<small>${M.isGroupBox(d) ? '' : '★ '}${esc(h)}</small>` : '<small class="warn-t">Sin responsable</small>'; };
  const sub = (n, depth) => n.children.length ? `<ul class="orgc-sub">${n.children.map(c => `<li class="d${Math.min(depth, 3)}"><button class="orgc-leaf" data-a="dept" data-id="${esc(c.d.id)}">${esc(c.d.name)}${who(c.d)}</button>${sub(c, depth + 1)}</li>`).join('')}</ul>` : '';
  return tree.map(r => `<div class="orgc-root">
    <button class="orgc-top" data-a="dept" data-id="${esc(r.d.id)}"><span class="org-ic">${ic(r.d.ic || 'flag', 'sm')}</span><span><b>${esc(r.d.name)}</b>${who(r.d)}</span></button>
    ${r.children.length ? `<div class="orgc-cols">${r.children.map(c => `<div class="orgc-col"><button class="orgc-head" data-a="dept" data-id="${esc(c.d.id)}"><b>${esc(c.d.name)}</b>${who(c.d)}</button>${sub(c, 2)}</div>`).join('')}</div>` : ''}
  </div>`).join('');
}
// Secciones de Congregación que se despliegan y ocultan (se recuerda cómo las dejaste)
const secState = () => { try { return JSON.parse(localStorage.getItem('miagenda.congreSecs') || '{}'); } catch { return {}; } };
function foldable(key, html) {
  const m = String(html || '').match(/^\s*<section><div class="sec-h">([\s\S]*?)<\/div>([\s\S]*)<\/section>\s*$/);
  if (!m) return html;
  const open = secState()[key] !== false;
  return `<section class="csec-wrap"><details class="csec" data-sec="${esc(key)}" ${open ? 'open' : ''}><summary class="sec-h">${m[1]}<span class="csec-chev" aria-hidden="true">▾</span></summary><div class="csec-b">${m[2]}</div></details></section>`;
}
export function congregacion(ui) {
  const st = ui?.congre || {};
  const pick = st.picking ? new Set(st.picked || []) : null;
  const o = { pick, sort: !!st.sorting && !pick, fold: new Set(st.fold || []) };
  const tree = M.deptTree();
  const all = data.depts || [];
  const empty_ = !all.length;
  const noHead = all.filter(d => !M.deptHead(d) && !M.isGroupBox(d)).length;
  const c = M.profile().congre || {};
  const cTitle = [c.name, c.number ? `(${c.number})` : ''].filter(Boolean).join(' ');
  const congreCard = `<button class="card congre-card" data-a="congre-edit">
    ${cTitle || c.circuit ? `<strong>${esc(cTitle || 'Mi congregación')}${c.circuit ? ` <span class="hint">· ${esc(c.circuit)}</span>` : ''}</strong>
      ${c.midweek || c.weekend ? `<span class="meta">${c.midweek ? `Entre semana: ${esc(c.midweek)}` : ''}${c.midweek && c.weekend ? ' · ' : ''}${c.weekend ? `Fin de semana: ${esc(c.weekend)}` : ''}</span>` : ''}
      ${c.address ? `<span class="meta">${ic('pin', 'sm')} ${esc(c.address)}</span>` : ''}`
    : `<strong>Datos de la congregación</strong><span class="meta">Nombre, número, circuito, horarios de las reuniones y dirección. Salen en la imagen del organigrama.</span>`}</button>`;
  const rosters = M.ROSTERS.map(r => ({ ...r, list: M.roster(r.k) })).filter(r => r.list.length || ['anc', 'sm', 'pr'].includes(r.k));
  const rosterHtml = `<section><div class="sec-h"><h2>👥 Nombramientos</h2></div>
    <div class="roster">${rosters.map(r => `<details class="roster-box"><summary><b>${r.list.length}</b> ${esc(r.n)}</summary>
      ${r.list.length ? `<div class="chips">${r.list.map(p => `<button class="chip" data-a="person" data-id="${esc(p.id)}">${esc(p.name)}</button>`).join('')}</div>` : '<p class="hint">Nadie todavía.</p>'}</details>`).join('')}</div>
    <p class="hint pad">Salen de tus Personas: pon «Anciano», «Siervo ministerial» o «Precursor regular» en su relación o en sus privilegios.</p></section>`;
  // Asignaciones por hermano (con filtro por grupo de Personas)
  const groups = [...data.groups].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const gsel = st.lg === '__varones' || (st.lg && groups.some(g => g.id === st.lg)) ? st.lg : '';
  const pool = gsel === '__varones' ? data.people.filter(isBaptizedMale) : gsel ? data.people.filter(p => (p.groupIds || []).includes(gsel)) : data.people;
  const loads = pool.map(p => ({ p, ...M.deptLoad(p.id) })).filter(x => gsel || x.total).sort((a, b) => b.total - a.total || a.p.name.localeCompare(b.p.name, 'es'));
  const withDept = loads.filter(x => x.total), without = loads.filter(x => !x.total);
  const loadHtml = all.length ? `<section><div class="sec-h"><h2>🧮 Asignaciones por hermano</h2></div>
    ${groups.length || data.people.some(isBaptizedMale) ? `<div class="chips"><button class="chip" data-a="load-g" data-v="" aria-pressed="${!gsel}">Todos</button><button class="chip" data-a="load-g" data-v="__varones" aria-pressed="${gsel === '__varones'}">Varones bautizados</button>${groups.map(g => `<button class="chip" data-a="load-g" data-v="${esc(g.id)}" aria-pressed="${gsel === g.id}">${esc(g.name)}</button>`).join('')}</div>` : ''}
    ${withDept.length ? `<div class="stack">${withDept.map(x => `<details class="load-row"><summary><span class="load-n ${x.total >= 4 ? 'hi' : ''}">${x.total}</span><span class="grow"><b>${esc(x.p.name)}</b><small>${x.heads.length ? `★ responsable en ${x.heads.length}` : ''}${x.heads.length && x.helps.length ? ' · ' : ''}${x.helps.length ? `ayudante en ${x.helps.length}` : ''}</small></span></summary>
      <ul class="load-list">${x.heads.map(d => `<li>★ <button class="link" data-a="dept" data-id="${esc(d.id)}">${esc(d.name)}</button>${d.since?.[x.p.id] ? ` <span class="hint">desde ${esc(fmtShort(d.since[x.p.id]))}</span>` : ''}</li>`).join('')}${x.helps.map(d => `<li><button class="link" data-a="dept" data-id="${esc(d.id)}">${esc(d.name)}</button>${d.helperRoles?.[x.p.id] ? ` <span class="hint">(${esc(d.helperRoles[x.p.id])})</span>` : ''}${d.since?.[x.p.id] ? ` <span class="hint">desde ${esc(fmtShort(d.since[x.p.id]))}</span>` : ''}</li>`).join('')}</ul></details>`).join('')}</div>` : '<p class="hint pad">Nadie tiene departamentos todavía.</p>'}
    ${gsel ? (without.length ? `<h3 class="sub-h">⚠️ Sin departamento (${without.length})</h3><div class="chips wrap">${without.map(x => `<button class="chip warn-chip" data-a="person" data-id="${esc(x.p.id)}">${esc(x.p.name)}</button>`).join('')}</div>` : '<p class="hint pad">✓ Todos los de este grupo tienen al menos un departamento.</p>')
      : `<p class="hint pad">${groups.length ? 'Elige un grupo (por ejemplo, tus ancianos y siervos) para ver quién no tiene ningún departamento.' : 'Crea un grupo en Personas (por ejemplo, «Varones» o «Ancianos y siervos») para ver quién no tiene departamento.'}</p>`}
  </section>` : '';
  const ro = Cp.readOnly();
  document.body.classList.toggle('cg-ro', ro);   // 👥 congregación de otra cuenta: sin botones de editar
  return `${head('Congregación', actions())}
  ${ro ? '' : congreCard}
  ${Cp.congreBanner()}
  ${M.featureOn('congregacion.comite') ? foldable('comite', comiteSection()) : ''}
  ${M.featureOn('congregacion.visita') ? foldable('visita', visitaSection()) : ''}
  ${M.featureOn('congregacion.nombramientos') ? foldable('nombramientos', rosterHtml) : ''}
  ${M.featureOn('congregacion.nombramientos') ? foldable('cargas', loadHtml) : ''}
  ${M.featureOn('congregacion.mecanicas') ? foldable('mecas', mecaSection(st)) : ''}
  ${!M.featureOn('congregacion.organigrama') ? '' : foldable('organigrama', `<section><div class="sec-h"><h2>🏛 Organigrama</h2>${empty_ ? '' : `<span class="hint">${all.length} departamentos${noHead ? ` · ${noHead} sin responsable` : ''}</span>`}</div>
  ${empty_ ? empty('Arma el organigrama de tu congregación: quién atiende cada departamento y quiénes le ayudan.', `<div class="stack"><button class="btn primary" data-a="dept-suggest">Cargar departamentos sugeridos</button><button class="btn" data-a="dept-new">Empezar desde cero</button></div>`, 'users')
    : pick ? `<div class="org-tools pick-bar"><span class="grow"><b>${pick.size}</b> elegidos</span><button class="btn small ghost" data-a="org-pick-all">Todos</button><button class="btn small ghost" data-a="org-pick">Cancelar</button><button class="btn small danger" data-a="org-del" ${pick.size ? '' : 'disabled'}>Eliminar</button></div>
      <p class="hint pad">Marca los departamentos que no aplican en tu congregación. Los que dependían de ellos suben un nivel.</p>
      <ul class="org-ul org-root">${tree.map(n => orgNode(n, 0, o)).join('')}</ul>`
    : `<div class="org-tools"><button class="btn small" data-a="org-share">${ic('chat', 'sm')} Compartir imagen</button><button class="btn small ghost" data-a="org-download">⬇ Descargar imagen</button><button class="btn small ghost" data-a="org-print">🖨 Imprimir carta (2 hojas)</button><button class="btn small" data-a="dept-suggest-tasks">💡 Asignar tareas sugeridas</button><button class="btn small ghost" data-a="dept-new">＋ Departamento</button><button class="btn small ghost" data-a="org-paste">📋 Pegar acuerdos</button><button class="btn small ghost" data-a="org-pick">Quitar varios</button><button class="btn small ${o.sort ? 'primary' : 'ghost'}" data-a="org-sort">${o.sort ? '✓ Listo' : '↕ Ordenar'}</button></div>
      <div class="org-fold-bar"><div class="seg small" role="group" aria-label="Vista del organigrama"><button data-a="org-view" data-v="lista" aria-pressed="${st.view !== 'arbol' || o.sort}">☰ Lista</button><button data-a="org-view" data-v="arbol" aria-pressed="${st.view === 'arbol' && !o.sort}">🌳 Árbol</button></div>
        ${st.view === 'arbol' && !o.sort ? '' : `<span><button class="link" data-a="org-fold-all" data-v="open">Mostrar todos</button> · <button class="link" data-a="org-fold-all" data-v="close">Ocultar todos</button></span>`}</div>
      ${o.sort ? '<p class="hint pad">↑ ↓ lo sube o baja entre los de su mismo nivel · → lo mete dentro del de arriba (por ejemplo, el auxiliar debajo del encargado) · ← lo saca un nivel.</p>' : ''}
      ${st.view === 'arbol' && !o.sort ? `<div class="orgc">${orgChart(tree)}</div><p class="hint pad">Desliza de lado para ver todas las áreas.</p>` : `<ul class="org-ul org-root">${tree.map(n => orgNode(n, 0, o)).join('')}</ul>`}
      <p class="hint pad">Toca un departamento para poner a sus responsables y ayudantes, cambiarle el nombre, moverlo debajo de otro o eliminarlo. Con «Quitar varios» borras de una vez los que no aplican. La imagen lleva nombres: compártela solo con quien corresponda.</p>
`}
  </section>`)}`;
}

// ───────────── NOTAS Y REUNIONES ─────────────

export function notasList(ui) {
  const { q, tag } = ui.notas;
  const nq = norm(q);
  const list = data.notes
    .filter(n => (!tag || n.tag === tag) && (!nq || norm([n.title, n.body, n.tag].join(' ')).includes(nq)))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || M.noteDate(b).localeCompare(M.noteDate(a)));
  if (!list.length) {
    return data.notes.length
      ? empty('Ninguna nota coincide.', '', 'notebook')
      : empty('Escribe tu primera nota: ideas, apuntes o recordatorios.', `<button class="btn" data-a="new-note">Nueva nota</button><button class="link" data-a="keep">Importar de Google Keep</button>`, 'notebook');
  }
  return `<div class="stack">${list.map(n => `
    <button class="card note" data-a="note" data-id="${esc(n.id)}">
      <span class="n-top"><strong>${esc(n.title || 'Sin título')}</strong>${n.pinned ? ic('bookmark', 'pin') : ''}</span>
      ${n.body ? `<span class="n-body">${esc(n.body)}</span>` : ''}
      <span class="n-foot">${n.tag ? `<span class="chip static">${esc(n.tag)}</span>` : ''}<span class="when">${M.noteDate(n) ? fmtShort(M.noteDate(n)) : ''}</span></span>
    </button>`).join('')}</div>`;
}

function reunionesList() {
  const t = today();
  const key = m => m.date + (m.time || '');
  const next = data.meetings.filter(m => m.date >= t).sort((a, b) => key(a).localeCompare(key(b)));
  const past = data.meetings.filter(m => m.date < t).sort((a, b) => key(b).localeCompare(key(a)));
  if (!next.length && !past.length) {
    return empty('Registra aquí tus reuniones importantes con sus temas y acuerdos.', `<button class="btn" data-a="new-meeting">Nueva reunión</button>`, 'clip');
  }
  return `${next.length ? `<h3 class="sub-h">Próximas</h3><div class="stack">${next.map(meetCard).join('')}</div>` : ''}
          ${past.length ? `<h3 class="sub-h">Anteriores</h3><div class="stack">${past.map(meetCard).join('')}</div>` : ''}`;
}

export function notas(ui) {
  const st = ui.notas;
  if (st.seg === 'reuniones' && !M.featureOn('notas.reuniones')) st.seg = 'notas';
  const seg = `<div class="seg">
    <button data-a="seg" data-v="notas" aria-pressed="${st.seg === 'notas'}">Notas</button>
    <button data-a="seg" data-v="reuniones" aria-pressed="${st.seg === 'reuniones'}">Reuniones</button></div>`;
  if (st.seg === 'reuniones') {
    const hasTasks = data.tasks.some(t => t.meetingId);
    const tools = data.meetings.length ? `<div class="quick mtg-tools">${hasTasks ? '<button class="btn small" data-a="supervision" data-id="">📋 Supervisión</button>' : ''}<button class="btn small" data-a="participation" data-v="6">📊 Participación</button></div>` : '';
    return `${head('Reuniones', actions())}${seg}${tools}${reunionesList()}`;
  }

  const tags = [...new Set(data.notes.map(n => n.tag).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  if (st.tag && !tags.includes(st.tag)) st.tag = '';
  const chips = tags.length
    ? `<div class="chips"><button class="chip" data-a="tag" data-v="" aria-pressed="${!st.tag}">Todas</button>${tags.map(t => `<button class="chip" data-a="tag" data-v="${esc(t)}" aria-pressed="${st.tag === t}">${esc(t)}</button>`).join('')}</div>` : '';
  return `${head('Notas', actions())}${seg}
  ${Cp.inboxButton('note')}
  <div class="search">${ic('search')}<input id="q" type="search" placeholder="Buscar en tus notas" value="${esc(st.q)}" autocomplete="off" aria-label="Buscar notas"></div>
  ${chips}
  <div id="results">${notasList(ui)}</div>`;
}

// Barra de la meta con el indicador de ritmo: 🐢 vas lento, 🦉 vas al ras, 🐇 vas adelantado.
// La marca roja sobre la barra señala dónde «deberías» ir hoy según los días transcurridos del mes.
export function goalBlock(mid, v, title = 'Meta de este mes') {
  const goal = Number(v.goalMonthly);
  if (!v.goalEnabled || !(goal > 0) || !M.featureOn('informe.meta')) return '';
  const minutes = M.monthTotals(mid).minutes;              // sin crédito: lo que cuenta para tu meta
  const withCredit = M.monthTotals(mid, true).minutes;     // con crédito: solo como referencia
  const credit = withCredit - minutes;
  const pace = M.paceStatus(mid, minutes, goal);
  const pct = m => Math.min(100, m / 60 / goal * 100);
  const detailOf = p => {
    const gap = Math.round(Math.abs(p.diffHours) * 60);
    return p.status === 'atrasado' ? `Te faltan ${M.fmtHM(gap)} h para ir al día`
      : p.status === 'adelantado' ? `Vas ${M.fmtHM(gap)} h por delante`
      : p.isCurrent ? 'Ni muy rápido ni muy lento' : 'Cerraste el mes a tu ritmo';
  };
  const chip = (p, label, extra = '') => `<div class="pace-chip ${p.status}${extra}"><span class="pe" aria-hidden="true">${p.emoji}</span><span>${esc(label)}<small>${esc(detailOf(p))}</small></span></div>`;
  const expected = pace.isCurrent ? `<span class="goal-mark" style="left:${pace.expectedPct}%" title="Donde deberías ir hoy: ${M.fmtHM(Math.round(pace.expectedHours * 60))} h"></span>` : '';
  // Si hay tiempo de crédito: la barra lo muestra en un tono más claro y aparece un segundo indicador «con crédito»
  const creditBar = credit > 0 ? `<i class="credit" style="width:${pct(withCredit) - pct(minutes)}%"></i>` : '';
  const creditPace = credit > 0 ? M.paceStatus(mid, withCredit, goal) : null;
  return `<div class="goal-wrap"><div class="goal-top"><span>${title}</span><span><b>${M.fmtHM(minutes)}</b> / ${goal} h</span></div>
    <div class="goal-bar"><span class="fill"><i style="width:${pct(minutes)}%"></i>${creditBar}</span>${expected}<span class="flag">${ic('flag')}</span></div>
    ${credit > 0 ? `<p class="hint credit-note"><span class="sw"></span>Con crédito: <b>${M.fmtHM(withCredit)} h</b> (${M.fmtHM(credit)} h de crédito, no cuentan para tu meta)</p>` : ''}
    ${remainingLine(mid, minutes, goal)}
    <div class="pace-row">${chip(pace, pace.label)}${creditPace ? chip(creditPace, `Con crédito: ${creditPace.label.charAt(0).toLowerCase()}${creditPace.label.slice(1)}`, ' soft') : ''}</div></div>`;
}

// Cuánto falta para completar la meta del mes y cuánto tocaría por día en los días que quedan
function remainingLine(mid, minutes, goal) {
  const left = goal * 60 - minutes;
  if (left <= 0) return '<p class="hint goal-left">🎉 ¡Meta del mes alcanzada!</p>';
  const days = M.daysLeftInMonth(mid);
  if (!days) return `<p class="hint goal-left">Quedaron <b>${M.fmtHM(left)} h</b> para la meta.</p>`;
  return `<p class="hint goal-left">Te faltan <b>${M.fmtHM(left)} h</b> para tu meta · unas <b>${M.fmtHM(left / days)} h por día</b> en ${days === 1 ? 'el día que queda' : `los ${days} días que quedan`}</p>`;
}

// Emoji del ritmo sobre la foto (como en las apps de informe)
export function paceBadge(v) {
  if (!v.goalEnabled || !(Number(v.goalMonthly) > 0) || !M.featureOn('informe.meta')) return '';
  const cur = today().slice(0, 7);
  const p = M.paceStatus(cur, M.monthTotals(cur).minutes, v.goalMonthly);
  return `<span class="pace-badge" title="${esc(p.label)}" aria-label="${esc(p.label)}">${p.emoji}</span>`;
}

// ───────────── MI SEMANA (plan de horas y objetivos de precursor) ─────────────
export function weekCard(v) {
  const dates = M.weekDates();
  const plan = M.weekPlan(v);
  const planTotal = M.planWeekTotal(plan);
  const t = today();
  const done = dates.map(d => M.minutesOn(d));
  const doneTotal = done.reduce((a, b) => a + b, 0);
  const range = `${parseISO(dates[0]).getDate()} al ${fmtShort(dates[6])}`;
  const days = dates.map((d, i) => {
    const p = plan[i], h = done[i];
    const cls = d === t ? 'today' : (p && h >= p) ? 'ok' : (d < t && p && h < p) ? 'short' : '';
    const fill = p ? Math.min(100, h / p * 100) : (h ? 100 : 0);
    return `<div class="wk-day ${cls}" title="${M.WEEKDAYS[i]}: ${M.fmtHM(h)} de ${M.fmtHM(p)} h">
      <span class="wk-bar"><i style="height:${fill}%"></i></span>
      <b>${M.WEEKDAYS[i].slice(0, 2)}</b><small>${p ? M.fmtHM(p) : '—'}</small></div>`;
  }).join('');
  const cur = t.slice(0, 7);
  const goal = v.goalEnabled ? Number(v.goalMonthly) : 0;
  const proj = M.planForMonth(cur, plan);
  const [y, m] = cur.split('-').map(Number);
  const projLine = planTotal ? `<p class="hint">Con este plan harías unas <b>${M.fmtHM(proj)} h</b> en ${MESES[m - 1]} (${M.fmtHM(planTotal)} h por semana en los ${new Date(y, m, 0).getDate()} días del mes)${goal > 0
      ? (proj >= goal * 60 ? ` · ✓ alcanza tu meta de ${goal} h` : ` · te quedarías corto por ${M.fmtHM(goal * 60 - proj)} h`) : ''}.</p>` : '';

  let objectives = '';
  if (M.isPioneer(v)) {
    const goals = M.weekDoc().goals || [];
    const ok = goals.filter(g => g.done).length;
    objectives = `<div class="wk-obj"><div class="sec-h tight"><h3>Mis objetivos como precursor esta semana</h3>${goals.length ? `<span class="hint">${ok} de ${goals.length}</span>` : ''}</div>
      ${goals.length ? `<div class="mini-list">${goals.map((g, i) => `<div class="mini-row obj ${g.done ? 'is-done' : ''}">
          <button type="button" class="chk" data-a="wgoal-toggle" data-i="${esc(i)}" aria-pressed="${!!g.done}" aria-label="${g.done ? 'Marcar como pendiente' : 'Marcar como cumplido'}">${ic('check')}</button>
          <span class="grow">${esc(g.t)}</span>
          <button type="button" class="icon-btn" data-a="wgoal-remove" data-i="${esc(i)}" aria-label="Quitar objetivo">${ic('x', 'sm')}</button></div>`).join('')}</div>`
        : '<p class="hint">Ej. «Salir 3 mañanas al servicio», «Hacer 2 revisitas», «Predicación telefónica el jueves».</p>'}
      <div class="log-add"><input id="wgoal-text" maxlength="120" placeholder="Nuevo objetivo para esta semana" aria-label="Nuevo objetivo"><button type="button" class="btn" data-a="wgoal-add">Agregar</button></div></div>`;
  }

  return `<section class="card week-card">
    <div class="sec-h tight"><h2>Mi semana <span class="hint">${range}</span></h2><button type="button" class="btn small" data-a="week-plan">${planTotal ? 'Cambiar plan' : 'Planear'}</button></div>
    ${planTotal
      ? `<div class="wk-days">${days}</div>
         <p class="wk-sum">Llevas <b>${M.fmtHM(doneTotal)} h</b> de <b>${M.fmtHM(planTotal)} h</b> planeadas${doneTotal >= planTotal ? ' 🎉' : ` · faltan ${M.fmtHM(planTotal - doneTotal)} h`}</p>
         ${projLine}`
      : `<p class="hint">Planea cuántas horas harás cada día de la semana y la app te dirá cuánto sumarías en el mes${goal > 0 ? ` y si te alcanza para tu meta de ${goal} h` : ''}.</p>`}
    ${objectives}
  </section>`;
}

// ───────────── MI INFORME ─────────────

// Gráfica del año de servicio: horas por mes, promedio y (si hay) la meta del mes
function yearChart(v, sy = M.serviceYearStart()) {
  const y = M.yearSummary(false, sy);
  if (!y.total) return '';
  const goal = v.goalEnabled && Number(v.goalMonthly) > 0 ? Number(v.goalMonthly) * 60 : 0;
  const max = Math.max(goal, ...y.months.map(m => m.minutes), 60) * 1.12;
  const W = 336, H = 150, top = 14, bottom = 22, bw = W / 12;
  const yOf = m => top + (H - top - bottom) * (1 - m / max);
  const bars = y.months.map((m, i) => {
    const h = Math.max(m.minutes ? 2 : 0, (H - top - bottom) - (yOf(m.minutes) - top));
    const x = i * bw + bw * 0.18, w = bw * 0.64;
    const cls = m.current ? 'cur' : m.id > today().slice(0, 7) ? 'fut' : goal && m.minutes >= goal ? 'ok' : '';
    return `<g><rect class="yb ${cls}" x="${x.toFixed(1)}" y="${(H - bottom - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3"><title>${cap(m.name)}: ${M.fmtHM(m.minutes)} h</title></rect>
      ${m.minutes ? `<text class="yv" x="${(x + w / 2).toFixed(1)}" y="${(H - bottom - h - 3).toFixed(1)}">${Math.round(m.minutes / 60)}</text>` : ''}
      <text class="yl" x="${(x + w / 2).toFixed(1)}" y="${H - 7}">${esc(m.name.slice(0, 3))}</text></g>`;
  }).join('');
  const line = (m, cls, label) => `<line class="${cls}" x1="0" x2="${W}" y1="${yOf(m).toFixed(1)}" y2="${yOf(m).toFixed(1)}"/><text class="${cls}-t" x="${W - 2}" y="${(yOf(m) - 3).toFixed(1)}">${label}</text>`;
  const isCur = sy === M.serviceYearStart();
  return `<div class="card year-card"><div class="sec-h"><h2>${isCur ? 'Tu año de servicio' : `Año de servicio ${sy}–${sy + 1}`}</h2></div>
    <svg class="year-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Horas por mes del año de servicio">
      ${goal ? line(goal, 'yg', `meta ${Math.round(goal / 60)} h`) : ''}${y.avg ? line(y.avg, 'ya', `promedio ${M.fmtHM(y.avg)}`) : ''}${bars}</svg>
    <div class="year-stats">
      <span><b>${M.fmtHM(y.avg)}</b><small>promedio al mes</small></span>
      ${y.best ? `<span><b>${esc(cap(y.best.name))}</b><small>mejor mes · ${M.fmtHM(y.best.minutes)} h</small></span>` : ''}
      ${isCur ? `<span><b>${Math.round(y.projection / 60)} h</b><small>si sigues así, al final del año</small></span>` : `<span><b>${M.fmtHM(y.total)} h</b><small>total del año</small></span>`}
    </div></div>`;
}

// ───── Estadísticas del mes (horas por día, por día de la semana, avance a la meta y por tipo) ─────
const WD_ORDER = [1, 2, 3, 4, 5, 6, 0], WD_N = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
function statsCard(mid, v) {
  const st = M.monthStats(mid);
  const total = st.perDay.reduce((a, b) => a + b, 0);
  const allCat = Object.values(st.perCat).reduce((a, b) => a + b, 0);
  if (!allCat) return `<div class="card stats-card"><div class="sec-h"><h2>📊 Estadísticas</h2>${monthPick(mid)}</div><p class="hint">No hay registros en este mes.</p></div>`;
  const [y, m] = mid.split('-').map(Number);
  const W = 336, H = 130, top = 10, bottom = 18;
  // 1) Horas por día, con el mes anterior de fondo
  const maxD = Math.max(60, ...st.perDay, ...st.prev);
  const bw = W / st.days, yOf = x => top + (H - top - bottom) * (1 - x / maxD);
  const dayBars = st.perDay.map((min, i) => {
    const x = i * bw, pv = st.prev[i] || 0;
    const ph = (H - bottom) - yOf(pv), h = (H - bottom) - yOf(min);
    return `<g>${pv ? `<rect class="sb-prev" x="${(x + bw * 0.08).toFixed(1)}" y="${yOf(pv).toFixed(1)}" width="${(bw * 0.84).toFixed(1)}" height="${ph.toFixed(1)}" rx="2"/>` : ''}
      ${min ? `<rect class="sb" x="${(x + bw * 0.22).toFixed(1)}" y="${yOf(min).toFixed(1)}" width="${(bw * 0.56).toFixed(1)}" height="${h.toFixed(1)}" rx="2"/>` : ''}
      <rect class="hit" x="${x.toFixed(1)}" y="0" width="${bw.toFixed(1)}" height="${H}"><title>${i + 1}: ${M.fmtHM(min)} h${pv ? ` · mes anterior ${M.fmtHM(pv)} h` : ''}</title></rect>
      ${(i + 1) % 5 === 0 || i === 0 ? `<text class="sl" x="${(x + bw / 2).toFixed(1)}" y="${H - 5}">${i + 1}</text>` : ''}</g>`;
  }).join('');
  // 2) Por día de la semana
  const maxW = Math.max(60, ...st.perWd), ww = W / 7, yW = x => top + 12 + (H - top - 12 - bottom) * (1 - x / maxW);
  const wdBars = WD_ORDER.map((d, i) => { const min = st.perWd[d], x = i * ww + ww * 0.22, w = ww * 0.56, hh = (H - bottom) - yW(min);
    return `<g>${min ? `<rect class="sb" x="${x.toFixed(1)}" y="${yW(min).toFixed(1)}" width="${w.toFixed(1)}" height="${hh.toFixed(1)}" rx="4"><title>${WD_N[d]}: ${M.fmtHM(min)} h</title></rect><text class="sv" x="${(x + w / 2).toFixed(1)}" y="${(yW(min) - 3).toFixed(1)}">${M.fmtHM(min)}</text>` : ''}<text class="sl" x="${(x + w / 2).toFixed(1)}" y="${H - 5}">${WD_N[d]}</text></g>`; }).join('');
  // 3) Avance hacia la meta del mes (acumulado contra el ritmo necesario)
  const goal = v.goalEnabled && Number(v.goalMonthly) > 0 ? Number(v.goalMonthly) * 60 : 0;
  const t = today(), curMid = t.slice(0, 7);
  const lastDay = mid === curMid ? Number(t.slice(8, 10)) : mid < curMid ? st.days : 0;
  let acc = 0; const cum = st.perDay.map(x => (acc += x));
  const maxC = Math.max(goal, acc, 60) * 1.08, xC = i => (i / (st.days - 1)) * W, yC = x => top + (H - top - bottom) * (1 - x / maxC);
  const path = cum.slice(0, lastDay).map((c, i) => `${i ? 'L' : 'M'}${xC(i).toFixed(1)},${yC(c).toFixed(1)}`).join(' ');
  const behind = goal && lastDay ? cum[lastDay - 1] < goal * lastDay / st.days : false;
  const goalSvg = goal ? `<svg class="stats-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Avance hacia la meta del mes">
      <line class="sp" x1="0" y1="${yC(0)}" x2="${W}" y2="${yC(goal)}"/><text class="spt" x="${W - 2}" y="${(yC(goal) - 4).toFixed(1)}">meta ${goal / 60} h</text>
      ${path ? `<path class="sc ${behind ? 'behind' : ''}" d="${path}"/>` : ''}
      ${lastDay ? `<circle class="sc-dot ${behind ? 'behind' : ''}" cx="${xC(lastDay - 1).toFixed(1)}" cy="${yC(cum[lastDay - 1]).toFixed(1)}" r="4"><title>Día ${lastDay}: ${M.fmtHM(cum[lastDay - 1])} h (el ritmo pedía ${M.fmtHM(goal * lastDay / st.days)} h)</title></circle>` : ''}
      <text class="sl" x="2" y="${H - 5}" style="text-anchor:start">1</text><text class="sl" x="${W - 2}" y="${H - 5}" style="text-anchor:end">${st.days}</text></svg>
    <p class="hint">${lastDay ? (behind ? `Vas ${M.fmtHM(goal * lastDay / st.days - cum[lastDay - 1])} h por debajo del ritmo para tu meta.` : `Vas al ritmo o por encima para tu meta de ${goal / 60} h.`) : ''} La línea punteada es el ritmo necesario.</p>` : '';
  // 4) Por tipo de actividad (incluye tiempo de crédito)
  const cats = Object.entries(st.perCat).filter(([, x]) => x).sort((a, b) => b[1] - a[1]);
  let off = 0;
  const seg = cats.map(([k, x]) => { const c = M.catServicioOf(k); const w = x / allCat * 100; const r = `<i style="left:${off}%;width:${w}%;--c:${esc(c.c)}" title="${esc(c.n)}: ${M.fmtHM(x)} h"></i>`; off += w; return r; }).join('');
  return `<div class="card stats-card"><div class="sec-h"><h2>📊 Estadísticas</h2>${monthPick(mid)}</div>
    <h3 class="sub-h">Horas por día <span class="hint">· ${M.fmtHM(total)} h</span></h3>
    <svg class="stats-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Horas por día del mes">${dayBars}</svg>
    <div class="stats-legend"><span><i class="k-cur"></i>${esc(fmtMonth(y, m))}</span><span><i class="k-prev"></i>${esc(fmtMonth(Number(st.prevId.slice(0, 4)), Number(st.prevId.slice(5))))}</span></div>
    <h3 class="sub-h">Por día de la semana</h3>
    <svg class="stats-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Horas por día de la semana">${wdBars}</svg>
    ${goalSvg ? `<h3 class="sub-h">Avance hacia la meta</h3>${goalSvg}` : ''}
    <h3 class="sub-h">Por tipo de actividad</h3>
    <div class="stats-stack" role="img" aria-label="Horas por tipo">${seg}</div>
    <ul class="stats-cats">${cats.map(([k, x]) => { const c = M.catServicioOf(k); return `<li><i style="--c:${esc(c.c)}"></i><span class="grow">${esc(c.n)}${c.credito ? ' <span class="hint">(crédito)</span>' : ''}</span><b>${M.fmtHM(x)} h</b></li>`; }).join('')}</ul>
  </div>`;
}
function monthPick(mid) {
  const sy = M.serviceYearStart(`${mid}-15`);
  return `<select id="stats-month" aria-label="Mes de las estadísticas">${M.serviceYearMonths(sy).map(mo => `<option value="${esc(mo.id)}" ${mo.id === mid ? 'selected' : ''}>${esc(cap(mo.name))} ${mo.year}</option>`).join('')}</select>`;
}

export function informe(ui = {}) {
  const st = ui.informe || {};
  const years = M.serviceYearsWithData();
  const curStart = M.serviceYearStart();
  const start = years.includes(st.sy) ? st.sy : curStart;
  const isCur = start === curStart;
  const months = M.serviceYearMonths(start);
  const v = M.profile();
  const cur = today().slice(0, 7);
  const curTotals = M.monthTotals(cur);
  const goal = goalBlock(cur, v);
  const year = M.yearTotals(false, start);
  const annual = Number(v.goalAnnual);
  const annualGoal = v.goalEnabled && annual > 0 && M.featureOn('informe.meta')
    ? `<div class="goal-wrap"><div class="goal-top"><span>Meta del año de servicio</span><span><b>${M.fmtHM(year.minutes)}</b> / ${annual} h</span></div>
        <div class="goal-bar"><i style="width:${Math.min(100, year.minutes / 60 / annual * 100)}%"></i><span class="flag">${ic('flag')}</span></div>
        <p class="hint">${year.minutes / 60 >= annual ? '¡Meta del año alcanzada!' : `Te faltan ${M.fmtHM(annual * 60 - year.minutes)} h`}</p></div>` : '';
  const pioneerHint = M.featureOn('informe.meta') && (M.profileTypeInfo().goal || M.profileRoles(v).some(r => /precursor/i.test(r))) && !(v.goalEnabled && Number(v.goalMonthly) > 0)
    ? `<div class="notice">${ic('flag', 'sm')}<p>Activa tu meta mensual para ver cómo vas: 🐢 lento, 🦉 al ras o 🐇 adelantado. <button class="link" data-a="profile">Activar mi meta</button></p></div>` : '';
  const iy = years.indexOf(start);
  const syNav = years.length > 1 ? `<div class="sy-nav"><button class="icon-btn" data-a="sy-move" data-v="${esc(years[iy - 1] ?? '')}" ${iy > 0 ? '' : 'disabled'} aria-label="Año de servicio anterior">${ic('left')}</button>
    <b>Año de servicio ${start}–${start + 1}</b><button class="icon-btn" data-a="sy-move" data-v="${esc(years[iy + 1] ?? '')}" ${iy < years.length - 1 ? '' : 'disabled'} aria-label="Año de servicio siguiente">${ic('right')}</button></div>` : '';
  const sm = st.sm && months.some(mo => mo.id === st.sm) ? st.sm : isCur ? cur : months[months.length - 1].id;
  // Solo los meses con algo registrado (y el mes actual); «Ver los demás meses» muestra el resto
  const hasData = mo => { const t = M.monthTotals(mo.id); return !!(t.minutes || t.studies || M.extrasText(M.monthExtras(mo.id))); };
  const shownMonths = st.all ? months : months.filter(mo => mo.id === cur || hasData(mo));
  const hiddenN = months.length - months.filter(mo => mo.id === cur || hasData(mo)).length;
  return `${head(`Informe <span class="h-year">${start}–${String(start + 1).slice(2)}</span>`, actions())}
  ${syNav}
  ${!isCur ? `<p class="notice">${ic('clock', 'sm')} Estás viendo un año anterior. <button class="link" data-a="sy-move" data-v="${esc(curStart)}">Volver al año actual</button></p>` : ''}
  <div class="report-head">
    <span class="av-wrap">${avatarHtml(v.photo, ic('clock'), 'big')}${paceBadge(v)}</span>
    <div><strong>${M.roleText(v) ? esc(M.roleText(v)) : 'Sin rol indicado'}</strong><p class="role">Toca para editar tu perfil y tus metas</p></div>
  </div>
  <div class="two pad"><button type="button" class="btn ghost" data-a="profile">Editar mi perfil</button><button type="button" class="btn ghost" data-a="info-fields">➕ Campos adicionales</button></div>
  <button type="button" class="card mini fix-cta" data-a="fix-open"><strong>✏️ Corregir un mes anterior</strong><span class="meta">Vuelve a cualquier mes para arreglar horas, crédito, cursos u otros datos</span></button>
  ${isCur ? pioneerHint : ''}
  ${isCur ? goal : ''}
  ${isCur && M.featureOn('informe.semana') ? weekCard(v) : ''}
  ${annualGoal}
  ${M.featureOn('informe.estadisticas') ? yearChart(v, start) : ''}
  ${M.featureOn('informe.estadisticas') ? statsCard(sm, v) : ''}
  <p class="hint pad">Año de servicio: septiembre a agosto. Toca un mes para ver el detalle o registrar tiempo.</p>
  <div class="stack">${shownMonths.map(mo => {
    const t = M.monthTotals(mo.id);
    const xt = M.extrasText(M.monthExtras(mo.id));
    return `<button class="card mini" data-a="month" data-id="${esc(mo.id)}" data-credit="0">
      <strong>${cap(mo.name)} ${mo.year}</strong>
      <span class="meta">${t.minutes || t.studies ? `${M.fmtHM(t.minutes)} h · ${t.studies} ${t.studies === 1 ? 'curso bíblico' : 'cursos bíblicos'}` : xt ? '' : 'Sin registrar'}${xt ? `${t.minutes || t.studies ? ' · ' : ''}${esc(xt)}` : ''}</span>
    </button>`;
  }).join('')}</div>
  ${hiddenN ? `<button type="button" class="btn ghost months-more" data-a="inf-months" aria-expanded="${st.all ? 'true' : 'false'}">${st.all ? 'Ver solo los meses con datos' : `Ver los demás meses (${hiddenN})`}</button>` : ''}
  <div class="card mini report-total">
    <strong>Total del año</strong>
    <span class="meta">${M.fmtHM(year.minutes)} h · ${year.studies} ${year.studies === 1 ? 'curso bíblico' : 'cursos bíblicos'}${M.extrasText(M.yearExtras(start)) ? ` · ${esc(M.extrasText(M.yearExtras(start)))}` : ''}</span>
  </div>`;
}
