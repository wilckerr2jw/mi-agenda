// Vistas principales. Cada función recibe el estado de la interfaz (ui) y devuelve HTML.

import { data, isCloud } from './store.js';
import * as store from './store.js';
import { esc, ic, today, parseISO, fmtLong, fmtShort, fmtMonth, fmtTime, timeParts, relDays, norm, initials, pad, MESES, DIAS, cap, avatarHtml } from './util.js';
import * as M from './model.js';
import { resolved } from './theme.js';

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
  const color = isMeeting ? 'var(--c-mtg)' : cat.c;
  let label = isMeeting ? 'Reunión importante' : cat.n;
  if (item.endTime) label += `, hasta ${fmtTime(item.endTime)}`;
  // Si es una ocurrencia de un evento repetido (no su fecha original), se manda la fecha
  // para que, al abrirlo, se pueda cancelar solo esa semana sin tocar las demás.
  const occ = !isMeeting && M.isRepeating(item) && iso !== item.date ? iso : '';
  const companions = isMeeting ? '' : M.eventCompanionsText(item);
  return `<button class="tl-item" style="--c:${color}" data-a="${isMeeting ? 'meeting' : 'event'}" data-id="${item.id}" ${occ ? `data-occ="${occ}"` : ''}>
    ${timeCell(item.time)}<span class="bar"></span>
    <span class="tl-body"><strong>${esc(item.title)}</strong><span class="meta">${esc(label)}</span>
    ${item.place ? `<span class="meta">${ic('pin', 'sm')}${esc(item.place)}</span>` : ''}
    ${companions ? `<span class="meta">${ic('users', 'sm')}Con ${esc(companions)}</span>` : ''}
    ${item.theme ? `<span class="meta">💬 ${esc(item.theme)}</span>` : ''}
    ${item.sharedId ? `<span class="meta shared-tag">👥 ${store.isSharedOwner(item) ? 'Compartido' : `De ${esc(item.ownerName || 'otra cuenta')}`}</span>` : ''}</span>
  </button>`;
}

export function taskRow(t) {
  const p = M.person(t.personId);
  const due = M.dueInfo(t);
  const done = t.status === 'hecha';
  const kind = M.kindLabel(t.kind);
  const comp = M.person(t.companionId);
  const mtg = t.meetingId ? data.meetings.find(m => m.id === t.meetingId) : null;
  return `<div class="row task ${done ? 'is-done' : ''}">
    <button class="chk" data-a="toggle-task" data-id="${t.id}" aria-pressed="${done}" aria-label="${done ? 'Marcar como pendiente' : 'Marcar como hecha'}">${ic('check')}</button>
    <button class="row-main" data-a="task" data-id="${t.id}">
      <span class="title">${esc(t.title)}</span>
      <span class="meta-line">${p ? `<span class="who">${esc(p.name)}</span>` : ''}${kind ? `<span>${esc(kind)}</span>` : ''}${comp ? `<span>Con ${esc(comp.name)}</span>` : ''}${t.status === 'seguimiento' ? '<span class="follow">En seguimiento</span>' : ''}${mtg ? `<span class="from-mtg" title="Sale de la reunión «${esc(mtg.title)}»">${ic('clip', 'sm')}${esc(mtg.title)}</span>` : ''}${!M.isMineTask(t) ? `<span class="sup">👁 Supervisas${(t.responsibles || []).length ? ` · ${esc(t.responsibles.join(', '))}` : ''}</span>` : (mtg && (t.responsibles || []).length ? '<span class="mine">👉 Te toca</span>' : '')}</span>
    </button>
    ${due.label ? `<span class="due ${due.cls}">${due.label}${due.time ? `<small>${due.time}</small>` : ''}</span>` : ''}
  </div>`;
}

function meetCard(m) {
  const d = parseISO(m.date);
  const when = [fmtTime(m.time), m.place].filter(Boolean).join(', ');
  const who = M.attendeesText(m);
  return `<button class="card meet" data-a="meeting" data-id="${m.id}">
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
  return list.length ? `<nav class="quick-row" id="quick-row" aria-label="Accesos rápidos">${list.map(q => `<button type="button" data-a="qa" data-v="${q.id}"><span class="qi">${ic(q.ic)}</span><span>${esc(q.n)}</span></button>`).join('')}</nav>` : '';
}

export function hoy() {
  const t = today(), d = parseISO(t);
  const entries = M.entriesFor(M.agendaFor(t));
  const due = M.sortActive(data.tasks.filter(x => x.status !== 'hecha' && x.due && x.due <= t && M.isMineTask(x)));
  const sup = M.isModuleVisible('tareas') ? M.toSupervise() : [];
  const juntaHoy = data.meetings.find(m => m.date === t && (m.agenda || []).length && !m.juntaRun?.finishedAt);
  const next = data.meetings.filter(m => m.date > t)
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
  const goal = v.goalEnabled && Number(v.goalMonthly) > 0 && M.isModuleVisible('informe');
  const mins = goal ? M.monthTotals(cur).minutes : 0;
  const pace = goal ? M.paceStatus(cur, mins, v.goalMonthly) : null;
  const nextMtg = next[0];
  const tiles = [
    M.isModuleVisible('agenda') ? `<button class="tile" data-a="nav" data-v="agenda" style="--c:var(--c-reunion)"><span class="tile-n">${entries.length}</span><span>${entries.length === 1 ? 'compromiso hoy' : 'compromisos hoy'}</span></button>` : '',
    M.isModuleVisible('tareas') ? `<button class="tile" data-a="nav" data-v="tareas" style="--c:${due.length ? 'var(--warn)' : 'var(--primary)'}"><span class="tile-n">${due.length}</span><span>${due.length === 1 ? 'tarea por atender' : 'tareas por atender'}</span></button>` : '',
    goal ? `<button class="tile" data-a="nav" data-v="informe" style="--c:var(--c-s2)"><span class="tile-n">${pace ? pace.emoji : ''} ${M.fmtHM(mins)}</span><span>de ${v.goalMonthly} h este mes</span></button>` : '',
    nextMtg && M.isModuleVisible('notas') ? `<button class="tile" data-a="meeting" data-id="${nextMtg.id}" style="--c:var(--c-mtg)"><span class="tile-n sm">${esc(fmtShort(nextMtg.date))}</span><span>${esc(nextMtg.title)}${(nextMtg.agenda || []).length ? ` · ${nextMtg.agenda.length} puntos` : ''}</span></button>` : '',
  ].filter(Boolean);

  return `
  <header class="top hero">
    <div class="hello">
      ${photo || first ? `<span class="hello-av">${avatarHtml(photo, esc(initials(v.myName || me?.name || '')))}</span>` : ''}
      <div><p class="hello-t">${hello}</p><span class="dow">${cap(DIAS[d.getDay()])}</span><span class="dm">${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}</span></div>
    </div>
    ${actions()}
  </header>
  ${juntaHoy ? `<button class="btn primary junta-now" data-a="junta-start" data-id="${juntaHoy.id}">▶ Iniciar la junta de hoy<small>${esc(juntaHoy.title)}${juntaHoy.time ? ` · ${fmtTime(juntaHoy.time)}` : ''}</small></button>` : ''}
  ${tiles.length ? `<div class="tiles">${tiles.join('')}</div>` : `<p class="sub pad">${summary}</p>`}
  ${quickRow()}
  ${isCloud ? '' : `<div class="notice">${ic('pin', 'sm')}<p>Modo local: tus datos están solo en este teléfono. <button class="link" data-a="settings">Ver cómo sincronizar</button></p></div>`}
  <section>
    <div class="sec-h"><h2>Agenda de hoy</h2></div>
    ${entries.length ? `<div class="tl">${entries.map(x => tlItem(x, t)).join('')}</div>`
      : empty('Nada programado para hoy.', `<button class="btn" data-a="new-event" data-date="${t}">Agregar evento</button>`, 'calendar')}
  </section>
  <section>
    <div class="sec-h"><h2>Tareas por atender</h2></div>
    ${due.length ? `<div class="stack">${due.map(taskRow).join('')}</div>`
      : empty('Sin tareas para hoy ni atrasadas.', `<button class="btn" data-a="new-task">Nueva tarea</button>`, 'tasks')}
  </section>
  ${sup.length ? `<section><div class="sec-h"><h2>Por supervisar</h2><span class="hint">${sup.length}</span></div>
    <p class="hint pad">Tareas de otros hermanos sin novedades hace ${M.SUPERVISE_DAYS} días o más. Pregunta cómo van y anota el avance en su seguimiento.</p>
    <div class="stack">${sup.map(({ task: x, quiet, late }) => `<button class="card mini" data-a="task" data-id="${x.id}">
      <strong>${esc(x.title)}</strong>
      <span class="meta">${(x.responsibles || []).length ? `${esc(x.responsibles.join(', '))} · ` : ''}${late ? `<b class="late">venció ${relDays(x.due)}</b>` : `sin novedades hace ${quiet} días`}</span>
    </button>`).join('')}</div></section>` : ''}
  ${next.length ? `<section><div class="sec-h"><h2>Próximas reuniones</h2></div><div class="stack">${next.map(meetCard).join('')}</div></section>` : ''}`;
}

// ───────────── AGENDA (calendario mensual) ─────────────

export function agenda(ui) {
  const st = ui.agenda;
  const [y, m] = st.ym.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;   // la semana empieza en lunes
  const t = today();

  let cells = '<span class="day blank"></span>'.repeat(lead);
  for (let d = 1; d <= days; d++) {
    const iso = `${y}-${pad(m)}-${pad(d)}`;
    const a = M.agendaFor(iso);
    const colors = [...new Set([...a.events.map(e => M.catOf(e.category).c), ...(a.meetings.length ? ['var(--c-mtg)'] : [])])].slice(0, 3);
    const dots = colors.map(c => `<i class="dot" style="--c:${c}"></i>`).join('') + (a.tasks.length ? '<i class="dot task"></i>' : '');
    cells += `<button class="day ${iso === t ? 'today' : ''}" data-a="cal-sel" data-date="${iso}" aria-pressed="${iso === st.sel}" aria-label="${fmtLong(iso)}"><span class="n">${d}</span><span class="dots">${dots}</span></button>`;
  }

  const a = M.agendaFor(st.sel);
  const entries = M.entriesFor(a);
  const list = entries.length || a.tasks.length
    ? `${entries.length ? `<div class="tl">${entries.map(x => tlItem(x, st.sel)).join('')}</div>` : ''}
       ${a.tasks.length ? `<h3 class="sub-h">Tareas con esta fecha</h3><div class="stack">${a.tasks.map(taskRow).join('')}</div>` : ''}`
    : empty('No hay nada programado este día.', `<button class="btn" data-a="new-event" data-date="${st.sel}">Agregar evento</button>`, 'calendar');

  return `
  <header class="top cal-top">
    <h1>${fmtMonth(y, m)}</h1>
    <div class="cal-nav">
      <button class="icon-btn" data-a="cal-prev" aria-label="Mes anterior">${ic('left')}</button>
      <button class="btn small" data-a="cal-today">Hoy</button>
      <button class="icon-btn" data-a="cal-next" aria-label="Mes siguiente">${ic('right')}</button>
    </div>
  </header>
  <div class="cal-wd" aria-hidden="true">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(x => `<span>${x}</span>`).join('')}</div>
  <div class="cal">${cells}</div>
  <section>
    <div class="sec-h"><h2>${fmtLong(st.sel)}</h2><button class="btn small" data-a="new-event" data-date="${st.sel}">Agregar</button></div>
    ${list}
  </section>`;
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
    .map(([k, n, c]) => `<button class="chip" data-a="filter-tasks" data-v="${k}" aria-pressed="${f === k}">${n} <b>${c}</b></button>`).join('');
  const withTasks = [...new Set(data.tasks.map(t => t.personId).filter(Boolean))]
    .map(id => M.person(id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const withMeetings = [...new Set(data.tasks.map(t => t.meetingId).filter(Boolean))]
    .map(id => data.meetings.find(m => m.id === id)).filter(Boolean).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (mid && !mid.startsWith('__') && !withMeetings.some(m => m.id === mid)) ui.tareas.m = '';
  const supervised = data.tasks.some(t => !M.isMineTask(t));
  const personSel = withTasks.length
    ? `<select id="tareas-person" aria-label="Filtrar por persona"><option value="">Todas las personas</option>${withTasks.map(p => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>` : '';
  const meetingSel = withMeetings.length || supervised
    ? `<select id="tareas-meeting" aria-label="Filtrar por origen"><option value="">Todas las tareas</option>${supervised ? `<option value="__mine" ${mid === '__mine' ? 'selected' : ''}>Me tocan a mí</option><option value="__sup" ${mid === '__sup' ? 'selected' : ''}>Las que superviso</option>` : ''}${withMeetings.length ? `<option value="__any" ${mid === '__any' ? 'selected' : ''}>Solo de reuniones</option>` : ''}${withMeetings.map(m => `<option value="${m.id}" ${m.id === mid ? 'selected' : ''}>${esc(m.title)} — ${fmtShort(m.date)}</option>`).join('')}</select>` : '';
  const personFilter = personSel || meetingSel ? `<div class="pad filters ${personSel && meetingSel ? 'two' : ''}">${personSel}${meetingSel}</div>` : '';
  const msg = {
    activas: 'No tienes tareas activas. Agrega una para darle seguimiento.',
    seguimiento: 'Aquí verás las tareas a las que ya les anotaste un seguimiento.',
    hechas: 'Todavía no has completado ninguna tarea.',
  }[f];
  return `${head('Tareas', actions())}
  <div class="chips">${chips}</div>
  ${personFilter}
  ${list.length ? `<div class="stack">${list.map(taskRow).join('')}</div>` : empty(msg, f === 'hechas' ? '' : `<button class="btn" data-a="new-task">Nueva tarea</button>`, 'tasks')}`;
}

// ───────────── PERSONAS Y GRUPOS ─────────────

function personRow(p) {
  const open = data.tasks.filter(t => t.personId === p.id && t.status !== 'hecha').length;
  const groups = M.groupsOf(p).map(g => g.name).join(', ');
  const last = p.lastContact ? `Último contacto ${relDays(p.lastContact)}` : '';
  return `<button class="card person" data-a="person" data-id="${p.id}">
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
    return `<button class="card person" data-a="group" data-id="${g.id}">
      <span class="avatar">${ic('users')}</span>
      <span class="p-body"><strong>${esc(g.name)}</strong>
        <span class="meta">${members.length} ${members.length === 1 ? 'persona' : 'personas'}</span>
        ${names ? `<span class="meta">${esc(names)}</span>` : ''}</span>
    </button>`;
  }).join('')}</div>`;
}

export function personas(ui) {
  const st = ui.personas;
  const seg = `<div class="seg">
    <button data-a="pseg" data-v="personas" aria-pressed="${st.seg !== 'grupos'}">Personas</button>
    <button data-a="pseg" data-v="grupos" aria-pressed="${st.seg === 'grupos'}">Grupos</button></div>`;
  if (st.seg === 'grupos') return `${head('Grupos', actions())}${seg}${gruposList()}`;

  const groups = [...data.groups].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  if (st.g && !groups.some(g => g.id === st.g)) st.g = '';
  const chips = groups.length
    ? `<div class="chips"><button class="chip" data-a="pfilter" data-v="" aria-pressed="${!st.g}">Todos</button>${groups.map(g => `<button class="chip" data-a="pfilter" data-v="${g.id}" aria-pressed="${st.g === g.id}">${esc(g.name)}</button>`).join('')}</div>` : '';
  const used = [...new Set(data.people.flatMap(p => p.privileges || []))].sort((a, b) => a.localeCompare(b, 'es'));
  if (st.pv && !used.includes(st.pv)) st.pv = '';
  const privSel = used.length ? `<div class="pad"><select id="personas-priv" aria-label="Filtrar por privilegio"><option value="">Todos los privilegios</option>${used.map(x => `<option value="${esc(x)}" ${x === st.pv ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>` : '';
  return `${head('Personas', actions())}${seg}
  <div class="search">${ic('search')}<input id="q" type="search" placeholder="Buscar por nombre" value="${esc(st.q)}" autocomplete="off" aria-label="Buscar personas"></div>
  ${chips}
  ${privSel}
  <div id="results">${personasList(ui)}</div>`;
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
    <button class="card note" data-a="note" data-id="${n.id}">
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
  <div class="search">${ic('search')}<input id="q" type="search" placeholder="Buscar en tus notas" value="${esc(st.q)}" autocomplete="off" aria-label="Buscar notas"></div>
  ${chips}
  <div id="results">${notasList(ui)}</div>`;
}

// Barra de la meta con el indicador de ritmo: 🐢 vas lento, 🦉 vas al ras, 🐇 vas adelantado.
// La marca roja sobre la barra señala dónde «deberías» ir hoy según los días transcurridos del mes.
export function goalBlock(mid, v, title = 'Meta de este mes') {
  const goal = Number(v.goalMonthly);
  if (!v.goalEnabled || !(goal > 0)) return '';
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
  if (!v.goalEnabled || !(Number(v.goalMonthly) > 0)) return '';
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
          <button type="button" class="chk" data-a="wgoal-toggle" data-i="${i}" aria-pressed="${!!g.done}" aria-label="${g.done ? 'Marcar como pendiente' : 'Marcar como cumplido'}">${ic('check')}</button>
          <span class="grow">${esc(g.t)}</span>
          <button type="button" class="icon-btn" data-a="wgoal-remove" data-i="${i}" aria-label="Quitar objetivo">${ic('x', 'sm')}</button></div>`).join('')}</div>`
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

export function informe() {
  const months = M.serviceYearMonths();
  const start = M.serviceYearStart();
  const v = M.profile();
  const cur = today().slice(0, 7);
  const curTotals = M.monthTotals(cur);
  const goal = goalBlock(cur, v);
  const year = M.yearTotals();
  const annual = Number(v.goalAnnual);
  const annualGoal = v.goalEnabled && annual > 0
    ? `<div class="goal-wrap"><div class="goal-top"><span>Meta del año de servicio</span><span><b>${M.fmtHM(year.minutes)}</b> / ${annual} h</span></div>
        <div class="goal-bar"><i style="width:${Math.min(100, year.minutes / 60 / annual * 100)}%"></i><span class="flag">${ic('flag')}</span></div>
        <p class="hint">${year.minutes / 60 >= annual ? '¡Meta del año alcanzada!' : `Te faltan ${M.fmtHM(annual * 60 - year.minutes)} h`}</p></div>` : '';
  const pioneerHint = (M.profileTypeInfo().goal || M.profileRoles(v).some(r => /precursor/i.test(r))) && !(v.goalEnabled && Number(v.goalMonthly) > 0)
    ? `<div class="notice">${ic('flag', 'sm')}<p>Activa tu meta mensual para ver cómo vas: 🐢 lento, 🦉 al ras o 🐇 adelantado. <button class="link" data-a="profile">Activar mi meta</button></p></div>` : '';
  return `${head(`Informe ${start}–${start + 1}`, actions())}
  <div class="report-head">
    <span class="av-wrap">${avatarHtml(v.photo, ic('clock'), 'big')}${paceBadge(v)}</span>
    <div><strong>${M.roleText(v) ? esc(M.roleText(v)) : 'Sin rol indicado'}</strong><p class="role">Toca para editar tu perfil y tus metas</p></div>
  </div>
  <button type="button" class="btn ghost pad" data-a="profile">Editar mi perfil</button>
  ${pioneerHint}
  ${goal}
  ${weekCard(v)}
  ${annualGoal}
  <p class="hint pad">Año de servicio: septiembre a agosto. Toca un mes para ver el detalle o registrar tiempo.</p>
  <div class="stack">${months.map(mo => {
    const t = M.monthTotals(mo.id);
    return `<button class="card mini" data-a="month" data-id="${mo.id}" data-credit="0">
      <strong>${cap(mo.name)} ${mo.year}</strong>
      <span class="meta">${t.minutes || t.studies ? `${M.fmtHM(t.minutes)} h · ${t.studies} ${t.studies === 1 ? 'curso bíblico' : 'cursos bíblicos'}` : 'Sin registrar'}</span>
    </button>`;
  }).join('')}</div>
  <div class="card mini report-total">
    <strong>Total del año</strong>
    <span class="meta">${M.fmtHM(year.minutes)} h · ${year.studies} ${year.studies === 1 ? 'curso bíblico' : 'cursos bíblicos'}</span>
  </div>`;
}
