// Hojas que suben desde abajo: formularios, fichas, grupos, importación y ajustes.

import * as store from './store.js';
import { data, isCloud, account, session } from './store.js';
import { esc, ic, uid, today, toast, fmtShort, fmtMonth, relDays, initials, telLink, waLink, norm, dateOf, avatarHtml, addDays } from './util.js';
import * as M from './model.js';
import * as Theme from './theme.js';
import { readKeep } from './keep.js';
import { goalBlock } from './views.js';
import { guideGroups, guideAudience } from './guide.js';
import * as A from './agenda.js';
import * as Lock from './lock.js';
import * as R from './reports.js';
import * as J from './junta.js';
import { hhmm } from './weekcal.js';
import * as N from './notify.js';
import * as Nat from './native.js';

// Permite que app.js reaccione a lo guardado (p. ej. saltar a esa fecha en el calendario)
export const hooks = { eventSaved: null };

const root = document.getElementById('sheet-root');
let backFn = null;
let isOpen = false;

// ───────────── Mecánica de la hoja ─────────────

export function open({ title, body, actions = '', back = null, focus = null }) {
  backFn = back;
  root.innerHTML = `<div class="scrim"><section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <header class="sheet-h"><h2>${esc(title)}</h2><button class="icon-btn" data-a="sheet-close" aria-label="Cerrar">${ic('x')}</button></header>
    <div class="sheet-b">${body}</div>
    ${actions ? `<footer class="sheet-f">${actions}</footer>` : ''}
  </section></div>`;
  document.body.classList.add('lock');
  if (!isOpen) { isOpen = true; history.pushState({ sheet: 1 }, ''); }   // el botón "atrás" cierra la hoja
  if (focus) root.querySelector(focus)?.focus();
}

export function close(fromPop = false) {
  root.innerHTML = '';
  document.body.classList.remove('lock');
  backFn = null;
  if (isOpen) {
    isOpen = false;
    if (!fromPop && history.state?.sheet) history.back();
  }
}

// Cierra, o vuelve a la hoja anterior si esta se abrió desde otra
export function closeOrBack() {
  if (backFn) { const b = backFn; backFn = null; b(); } else close();
}

window.addEventListener('popstate', () => { if (isOpen) close(true); });
window.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen) closeOrBack(); });

// ───────────── Ayudas para formularios ─────────────

const fld = (label, input, id) => `<div class="f"><label for="${id}">${label}</label>${input}</div>`;
const options = (obj, sel) => Object.entries(obj)
  .map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(typeof v === 'string' ? v : v.n)}</option>`).join('');
const foot = (col, id, label = 'Guardar') =>
  `${id ? `<button type="button" class="btn ghost danger" data-a="delete" data-col="${col}" data-id="${id}">Eliminar</button>` : ''}
   <button type="submit" form="f" class="btn primary">${label}</button>`;
const formTag = (kind, id) => `<form id="f" data-form="${kind}" data-id="${id || ''}" autocomplete="off">`;

// Círculo de foto que se puede tocar para cambiarla (toca la etiqueta → abre el selector de archivos, sin JS extra)
const avatarPicker = (field, fallback, photo) => `<div class="avatar-pick">
  <label class="avatar xl photo-btn" for="${field}File"><span id="${field}Preview">${photo ? `<img src="${esc(photo)}" alt="">` : fallback}</span></label>
  <input type="file" accept="image/*" id="${field}File" data-photo-for="${field}" hidden>
  <input type="hidden" id="${field}" name="${field}" value="${esc(photo || '')}">
  <button type="button" class="link" data-a="photo-clear" data-target="${field}" data-fallback="${esc(fallback)}">Quitar foto</button>
</div>`;

// Restaura las iniciales/ícono cuando se quita la foto
export function clearPhoto(field, fallback) {
  const hidden = document.getElementById(field);
  const preview = document.getElementById(field + 'Preview');
  if (hidden) hidden.value = '';
  if (preview) preview.innerHTML = fallback;
}

const sortedPeople = () => [...data.people].sort((a, b) => a.name.localeCompare(b.name, 'es'));
const sortedGroups = () => [...data.groups].sort((a, b) => a.name.localeCompare(b.name, 'es'));

const peopleSelect = (id, sel, emptyLabel) =>
  `<select id="${id}" name="${id}"><option value="">${emptyLabel}</option>${sortedPeople().map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`;

// Lista de casillas para elegir varios grupos o personas a la vez (participantes de una reunión, etc.)
const pickList = (title, items, name, chosen, label) => items.length
  ? `<p class="hint pick-h">${title}</p><div class="checklist">${items.map(x => `<label class="check"><input type="checkbox" name="${name}" value="${x.id}" ${chosen.includes(x.id) ? 'checked' : ''}> <span>${label(x)}</span></label>`).join('')}</div>` : '';

// "Tipo": la lista fija + tus tipos propios + «✏️ Nuevo tipo…» (lo que escribas ahí queda en la lista)
// known = todos los tipos fijos (aunque el perfil oculte algunos), para no mostrarlos como «escritos a mano»
function typeSelect(id, builtIns, current, col, known = builtIns) {
  const custom = M.customTypes(col, id, known);
  return `<select id="${id}" name="${id}" data-otro="${id}-otro">${options(builtIns, current)}${custom.map(c => `<option value="${esc(c)}" ${c === current ? 'selected' : ''}>${esc(c)}</option>`).join('')}<option value="__otro">✏️ Nuevo tipo…</option></select>`;
}
const typeOtro = (id, ph) =>
  `<div class="f" id="${id}-otro" hidden><label for="${id}-otro-in">Nombre del nuevo tipo <span class="hint">(quedará en la lista)</span></label><input id="${id}-otro-in" name="${id}Otro" maxlength="60" placeholder="${ph}"></div>`;

// Guarda un tipo escrito a mano en tu lista, para que aparezca siempre como una opción más
function rememberType(col, value, builtIns) {
  if (!value || builtIns[value]) return;
  const list = M.savedTypes(col);
  if (list.some(x => norm(x) === norm(value))) return;
  store.upsert('profile', { ...M.profile(), id: 'me', [M.CUSTOM_TYPE_FIELD[col]]: [...list, value] });
  toast(`«${value}» se agregó a tu lista de tipos`);
}

// ───────────── Evento ─────────────

// Campos que se copian al duplicar un evento o al cambiar solo un día
const EVENT_COPY = ['title', 'category', 'date', 'time', 'endTime', 'place', 'notes', 'theme', 'color', 'repeat', 'days', 'companionId', 'companionGroupIds', 'companionPersonIds'];
const copyOf = e => Object.fromEntries(EVENT_COPY.filter(k => e[k] !== undefined).map(k => [k, Array.isArray(e[k]) ? [...e[k]] : e[k]]));

export function eventSheet(id, preset = {}, back) {
  const e = id ? store.get('events', id) : null;
  const src = !e && preset.copyOf ? store.get('events', preset.copyOf) : null;
  const v = e || (src ? copyOf(src) : null) || { title: '', category: 'reunion', date: preset.date || today(), time: preset.time || '', endTime: preset.endTime || '', place: '', notes: '', repeat: 'none', companionId: '', companionGroupIds: [], companionPersonIds: [] };
  // Si se abrió tocando una ocurrencia puntual de un evento que se repite, se puede cancelar solo esa semana.
  const occDate = preset.occDate || '';
  const skipped = e && occDate ? (e.skipDates || []).includes(occDate) : false;
  const showSkip = e && M.isRepeating(e) && occDate && occDate !== e.date;
  const isAncianos = v.category === 'ancianos';
  const sh = !!v.sharedId, owner = !sh || store.isSharedOwner(v);
  const others = sh ? (v.members || []).filter(u => u !== account.user?.uid).map(u => v.memberNames?.[u] || 'otra cuenta') : [];
  open({
    title: e ? 'Editar evento' : src ? 'Duplicar evento' : 'Nuevo evento', back, focus: e ? null : '#title',
    body: `${sh ? `<p class="shared-note">👥 ${owner ? `Lo compartes con <b>${esc(others.join(', '))}</b>` : `Te lo compartió <b>${esc(v.ownerName || 'otra cuenta')}</b>`}. Todos pueden cambiarlo y los cambios les llegan a los demás.${v.updatedByName && v.updatedBy !== account.user?.uid ? ` <span class="hint">Último cambio: ${esc(v.updatedByName)}.</span>` : ''}</p>` : ''}
      ${formTag('event', e?.id)}
      ${fld('Título', `<input id="title" name="title" required maxlength="120" value="${esc(v.title)}" placeholder="Ej. Reunión de entre semana">`, 'title')}
      ${fld('Tipo', typeSelect('category', M.eventCats(v.category), v.category, 'events', M.CATEGORIAS), 'category')}
      ${typeOtro('category', 'Ej. Reunión de circuito')}
      ${fld('Fecha', `<input id="date" name="date" type="date" required value="${v.date}">`, 'date')}
      <div class="two">
        ${fld('Empieza', `<input id="time" name="time" type="time" value="${v.time || ''}">`, 'time')}
        ${fld('Termina', `<input id="endTime" name="endTime" type="time" value="${v.endTime || ''}">`, 'endTime')}
      </div>
      ${fld('Lugar', `<input id="place" name="place" maxlength="120" value="${esc(v.place || '')}" placeholder="Salón, dirección o enlace">`, 'place')}
      <div class="f"><span class="lbl">Color <span class="hint">(como en tu calendario impreso)</span></span>
        <div class="colorpick" role="radiogroup" aria-label="Color del evento">${M.EVENT_COLORS.map(([c, n]) => `<label title="${n}"><input type="radio" name="color" value="${c}" ${(v.color || '') === c ? 'checked' : ''}><span style="--sw:${c || M.catOf(v.category).c}" class="${c ? '' : 'auto'}">${c ? '' : 'A'}</span><em>${n}</em></label>`).join('')}</div></div>
      ${fld('Tema sugerido <span class="hint">(opcional)</span>', `<input id="theme" name="theme" maxlength="200" value="${esc(v.theme || '')}" placeholder="Ej. tema para la noche de adoración en familia">`, 'theme')}
      ${owner ? '' : '<div hidden>'}
      <div class="f" id="companion-single" ${isAncianos ? 'hidden' : ''}>
        <label for="companionId">Persona que me acompaña</label>
        ${peopleSelect('companionId', v.companionId, 'Nadie')}
      </div>
      <div class="f" id="companion-group" ${isAncianos ? '' : 'hidden'}>
        <span class="lbl">Quiénes participan</span>
        ${pickList('Grupos', sortedGroups(), 'companionGroupIds', v.companionGroupIds || [], g => esc(g.name))}
        ${pickList('Personas', sortedPeople(), 'companionPersonIds', v.companionPersonIds || [], p => esc(p.name) + (p.role ? ` <span class="hint">${esc(p.role)}</span>` : ''))}
      </div>
      ${owner ? '' : '</div>'}
      ${fld('Repetición', `<select id="repeat" name="repeat">${options(M.REPEATS, v.repeat || 'none')}</select>`, 'repeat')}
      <div class="f" id="repeat-days" ${v.repeat === 'days' ? '' : 'hidden'}><span class="lbl">¿Qué días?</span>
        <div class="daypick">${M.REPEAT_DAYS.map(([n, t]) => `<label><input type="checkbox" name="days" value="${n}" ${(v.days || []).includes(n) ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div></div>
      ${fld('Notas', `<textarea id="notes" name="notes" rows="3">${esc(v.notes || '')}</textarea>`, 'notes')}
      ${isCloud && owner ? `<div class="f" id="share-box"><span class="lbl">Compartir con <span class="hint">(otras cuentas de la app)</span></span><p class="hint">Cargando cuentas…</p></div>` : ''}
    </form>
    ${src ? '<p class="hint pad-top">Es una copia: cambia lo que haga falta y guarda. El original no se toca.</p>' : ''}
    ${showSkip && !skipped ? `<button type="button" class="btn pad-top" data-a="occ-edit" data-id="${e.id}" data-date="${occDate}">✏️ Cambiar solo el ${fmtShort(occDate)}</button>` : ''}
    ${showSkip ? `<button type="button" class="btn ghost pad-top" data-a="${skipped ? 'unskip-occ' : 'skip-occ'}" data-id="${e.id}" data-date="${occDate}">${skipped ? `Restaurar el ${fmtShort(occDate)}` : `Cancelar solo el ${fmtShort(occDate)}`}</button>` : ''}
    ${e ? `<button type="button" class="btn ghost pad-top" data-a="ev-dup" data-id="${e.id}">⧉ Duplicar evento</button>` : ''}`,
    actions: owner ? foot('events', e?.id)
      : `<button type="button" class="btn ghost danger" data-a="delete" data-col="events" data-id="${e.id}">Quitar de mi agenda</button><button type="submit" form="f" class="btn primary">Guardar</button>`,
  });
  if (isCloud && owner) loadShareBox(v);
}

// Cambiar solo un día de un evento que se repite: ese día se salta en la serie y se crea un evento suelto
// para esa fecha (si la serie está compartida, la copia también se comparte con las mismas personas).
export function occEdit(id, date) {
  const e = store.get('events', id);
  if (!e) return;
  const copy = { ...copyOf(e), id: uid(), date, repeat: 'none', days: [], skipDates: [], exceptionOf: e.sharedId || e.id };
  store.upsert('events', { ...e, skipDates: [...new Set([...(e.skipDates || []), date])].sort() });
  let newId = copy.id;
  if (e.sharedId && isCloud) {
    const others = (e.members || []).filter(u => u !== account.user?.uid);
    const made = store.shareEvent(copy, others, e.memberNames || {});
    if (made) newId = made.id;
  } else store.upsert('events', copy);
  toast(`Ahora cambia lo que quieras del ${fmtShort(date)}; las demás fechas siguen igual`);
  setTimeout(() => eventSheet(newId), 50);
}

// ───── Mover o cambiar la duración en la vista Semana (arrastrando) ─────
let pendingMove = null, afterMove = null;
const weekdayOf = iso => new Date(`${iso}T12:00:00`).getDay();
const diffD = (a, b) => Math.round((new Date(`${a}T12:00:00`) - new Date(`${b}T12:00:00`)) / 86400000);
export function calMove(c, redraw) {
  afterMove = redraw;
  const time = hhmm(c.start);
  if (c.kind === 'meeting') {
    const m = store.get('meetings', c.id);
    if (!m) return;
    store.upsert('meetings', { ...m, date: c.toDate, time });
    return toast(`Reunión movida al ${fmtShort(c.toDate)}, ${fmtTime12(time)}`, 'Deshacer', () => store.upsert('meetings', m));
  }
  const e = store.get('events', c.id);
  if (!e) return;
  const end = e.endTime || c.resized ? hhmm(c.end) : '';
  if (!M.isRepeating(e)) {
    store.upsert('events', { ...e, date: c.toDate, time, endTime: end });
    return toast(c.resized ? 'Duración cambiada' : `Movido al ${fmtShort(c.toDate)}, ${fmtTime12(time)}`, 'Deshacer', () => store.upsert('events', e));
  }
  pendingMove = { c, time, end };
  const dayChanged = c.toDate !== c.fromDate;
  open({
    title: c.resized ? 'Cambiar la duración' : 'Mover evento',
    body: `<p><b>${esc(e.title)}</b> se repite (${esc(M.repeatText(e))}). ¿Qué quieres cambiar?</p>
      <p class="hint">Nuevo horario: ${dayChanged ? `${fmtShort(c.toDate)}, ` : ''}${fmtTime12(time)}${end ? ` – ${fmtTime12(end)}` : ''}</p>
      <div class="stack pad">
        <button type="button" class="btn primary" data-a="cal-move-one">Solo el ${fmtShort(c.occ)}</button>
        <button type="button" class="btn" data-a="cal-move-all">Todas las fechas</button>
      </div>`,
    actions: '<button type="button" class="btn ghost" data-a="cal-move-cancel">Cancelar</button>',
  });
}
const fmtTime12 = t => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`; };
export function calMoveCancel() { pendingMove = null; close(); afterMove?.(); }
export function calMoveApply(all) {
  const pm = pendingMove; pendingMove = null;
  close();
  if (!pm) return;
  const { c, time, end } = pm;
  const e = store.get('events', c.id);
  if (!e) return afterMove?.();
  if (all) {
    const delta = diffD(c.toDate, c.fromDate);
    const next = { ...e, time, endTime: end };
    if (delta) {
      if (e.repeat === 'days') { const from = weekdayOf(c.fromDate), to = weekdayOf(c.toDate); next.days = [...new Set((e.days || []).map(d => (d === from ? to : d)))]; }
      else if (e.repeat !== 'daily') next.date = addDays(e.date, delta);
    }
    store.upsert('events', next);
    toast('Cambiado en todas las fechas', 'Deshacer', () => store.upsert('events', e));
  } else {
    const copy = { ...copyOf(e), id: uid(), date: c.toDate, time, endTime: end, repeat: 'none', days: [], skipDates: [], exceptionOf: e.sharedId || e.id };
    store.upsert('events', { ...e, skipDates: [...new Set([...(e.skipDates || []), c.occ])].sort() });
    let made = copy;
    if (e.sharedId && isCloud) made = store.shareEvent(copy, (e.members || []).filter(u => u !== account.user?.uid), e.memberNames || {}) || copy;
    else store.upsert('events', copy);
    toast(`Solo el ${fmtShort(c.occ)} cambió`, 'Deshacer', () => { store.remove('events', made.id); store.upsert('events', e); });
  }
  afterMove?.();
}

// ───── Plantillas de semana: guarda tu semana y aplícala a otra con un toque ─────
let tplCtx = { start: '', span: 7 };
export function weekTemplates(start, span) {
  const monday = M.mondayOf(start);
  tplCtx = { start: monday, span: 7 };
  const list = M.profile().weekTemplates || [];
  open({
    title: 'Plantillas de semana',
    body: `<p class="hint">Guarda cómo es una semana (sus eventos, con día y hora) y aplícala a otra semana cuando la necesites: por ejemplo tu «semana normal», una semana de asamblea o la visita del superintendente. Al aplicar solo se agrega lo que falta; no se repite lo que ya está.</p>
      ${list.length ? `<div class="mini-list">${list.map(t => `<div class="mini-row"><span class="grow"><strong>${esc(t.name)}</strong><span class="meta">${t.items.length} eventos</span></span>
        <span class="ag-btns"><button type="button" class="btn small primary" data-a="wk-tpl-apply" data-id="${t.id}">Aplicar a la semana del ${fmtShort(monday)}</button><button type="button" class="icon-btn" data-a="wk-tpl-del" data-id="${t.id}" aria-label="Borrar plantilla">${ic('x', 'sm')}</button></span></div>`).join('')}</div>` : '<p class="hint">Aún no tienes plantillas.</p>'}
      <h3 class="sub-h">Guardar la semana del ${fmtShort(monday)}</h3>
      <div class="log-add"><input id="wk-tpl-name" maxlength="60" placeholder="Nombre (ej. Semana normal)" aria-label="Nombre de la plantilla"><button type="button" class="btn" data-a="wk-tpl-save">Guardar</button></div>`,
    actions: '<button type="button" class="btn primary" data-a="sheet-close">Listo</button>',
  });
}
const weekItems = monday => Array.from({ length: 7 }, (_, d) => ({ d, iso: addDays(monday, d) }))
  .flatMap(({ d, iso }) => M.agendaFor(iso).events.map(e => ({ d, title: e.title, category: e.category, time: e.time || '', endTime: e.endTime || '', place: e.place || '', notes: e.notes || '', theme: e.theme || '', color: e.color || '' })));
export function weekTemplateSave() {
  const input = document.getElementById('wk-tpl-name');
  const name = (input?.value || '').trim();
  if (!name) return input?.focus();
  const items = weekItems(tplCtx.start);
  if (!items.length) return toast('Esta semana no tiene eventos para guardar');
  const list = (M.profile().weekTemplates || []).filter(t => norm(t.name) !== norm(name));
  store.upsert('profile', { ...M.profile(), id: 'me', weekTemplates: [...list, { id: uid(), name, items }] });
  toast(`Plantilla «${name}» guardada (${items.length} eventos)`);
  weekTemplates(tplCtx.start);
}
export function weekTemplateApply(id) {
  const t = (M.profile().weekTemplates || []).find(x => x.id === id);
  if (!t) return;
  const created = [];
  t.items.forEach(it => {
    const date = addDays(tplCtx.start, it.d);
    const exists = M.agendaFor(date).events.some(e => norm(e.title) === norm(it.title) && (e.time || '') === it.time);
    if (exists) return;
    const { d, ...rest } = it;
    created.push(store.upsert('events', { ...rest, id: uid(), date, repeat: 'none', days: [], skipDates: [], companionId: '', companionGroupIds: [], companionPersonIds: [] }));
  });
  close();
  toast(created.length ? `${created.length} eventos agregados a la semana del ${fmtShort(tplCtx.start)}` : 'Esa semana ya tiene todo lo de la plantilla',
    created.length ? 'Deshacer' : undefined, () => created.forEach(e => store.remove('events', e.id)), 9000);
}
export function weekTemplateDelete(id) {
  store.upsert('profile', { ...M.profile(), id: 'me', weekTemplates: (M.profile().weekTemplates || []).filter(x => x.id !== id) });
  weekTemplates(tplCtx.start);
}

// ───── Compartir varios eventos a la vez ─────
let bulkShareIds = [], bulkShareDone = null;
export async function bulkShareSheet(ids, done) {
  bulkShareIds = ids.filter(id => { const e = store.get('events', id); return e && (!e.sharedId || store.isSharedOwner(e)); });
  bulkShareDone = done;
  const skipped = ids.length - bulkShareIds.length;
  if (!bulkShareIds.length) return toast('Esos eventos te los compartieron; solo quien los creó puede compartirlos con otros');
  open({
    title: `Compartir ${bulkShareIds.length} ${bulkShareIds.length === 1 ? 'evento' : 'eventos'}`,
    body: `<p class="hint">Marca con quién. Si alguno ya estaba compartido, se suman estas personas.${skipped ? ` Se omiten ${skipped} que te compartieron otros.` : ''}</p><div id="bulk-share-list"><p class="hint">Cargando cuentas…</p></div>`,
    actions: `<button type="button" class="btn ghost" data-a="sheet-close">Cancelar</button><button type="button" class="btn primary" data-a="bulk-share-go">Compartir</button>`,
  });
  let list = [];
  try { list = await store.listMembers(); } catch (err) { console.warn(err); }
  const box = document.getElementById('bulk-share-list');
  if (!box) return;
  box.innerHTML = list.length ? `<div class="stack">${list.map(m => `<label class="check"><input type="checkbox" name="bulkShare" value="${esc(m.uid)}" data-name="${esc(m.name)}"> ${esc(m.name)}</label>`).join('')}</div>`
    : '<p class="hint">Aún no hay otras cuentas aprobadas (o no han abierto la app desde la versión 4.1).</p>';
}
export function bulkShareGo() {
  const boxes = [...document.querySelectorAll('input[name="bulkShare"]')];
  const chosen = boxes.filter(b => b.checked).map(b => b.value);
  if (!chosen.length) return toast('Marca al menos una persona');
  const names = Object.fromEntries(boxes.map(b => [b.value, b.dataset.name || '']));
  let n = 0;
  bulkShareIds.forEach(id => {
    const e = store.get('events', id);
    if (!e) return;
    const before = (e.members || []).filter(u => u !== account.user?.uid);
    const all = [...new Set([...before, ...chosen])];
    if (e.sharedId && all.length === before.length) return;
    store.shareEvent(e, all, { ...(e.memberNames || {}), ...names });
    n++;
  });
  close();
  toast(n ? `${n} ${n === 1 ? 'evento compartido' : 'eventos compartidos'} con ${chosen.map(u => names[u]).join(', ')}` : 'Ya estaban compartidos con esas personas');
  bulkShareDone?.();
}

// Lista de cuentas para compartir (solo nombres). Las ya elegidas salen marcadas.
async function loadShareBox(v) {
  const box = document.getElementById('share-box');
  let list = [], fail = '';
  try { list = await store.listMembers(); } catch (err) { console.warn(err); fail = err?.code || 'error'; }
  if (!box.isConnected) return;
  if (fail) {
    box.innerHTML = `<span class="lbl">Compartir con</span><p class="hint warn">${fail === 'permission-denied'
      ? 'Todavía no se publicaron las reglas nuevas de la base de datos. En la computadora ejecuta <code>firebase deploy --only firestore</code> y luego pide a las otras cuentas que cierren y vuelvan a abrir la app.'
      : 'No se pudo cargar la lista de cuentas. Revisa tu conexión e inténtalo de nuevo.'}</p>`;
    return;
  }
  const chosen = new Set(v.members || []);
  box.innerHTML = `<span class="lbl">Compartir con <span class="hint">(otras cuentas de la app)</span></span>
    ${list.length ? `<div class="stack">${list.map(m => `<label class="check"><input type="checkbox" name="shareWith" value="${esc(m.uid)}" data-name="${esc(m.name)}" ${chosen.has(m.uid) ? 'checked' : ''}> ${esc(m.name)}</label>`).join('')}</div>
      <input type="hidden" name="shareLoaded" value="1">
      <p class="hint">Le aparecerá en su Agenda y podrá cambiarlo; si tiene los avisos activos, le llega un aviso.</p>`
      : '<p class="hint">Aún no hay otras cuentas aprobadas (o no han abierto la app desde esta versión).</p>'}`;
}

function saveEvent(id, r, form) {
  const category = M.resolveType(r.category, r.categoryOtro, M.CATEGORIAS);
  if (category === null) { toast('Escribe el tipo de evento'); return; }
  rememberType('events', category, M.CATEGORIAS);
  const prev = id ? store.get('events', id) : {};
  const companionGroupIds = new FormData(form).getAll('companionGroupIds');
  const companionPersonIds = new FormData(form).getAll('companionPersonIds');
  const days = new FormData(form).getAll('days').map(Number);
  if (r.repeat === 'days' && !days.length) { toast('Marca al menos un día'); return; }
  const item = { ...prev, id: id || uid(), title: r.title, category, date: r.date, time: r.time, endTime: r.endTime, place: r.place, companionId: r.companionId, companionGroupIds, companionPersonIds, repeat: r.repeat, days: r.repeat === 'days' ? days : [], color: r.color || '', notes: r.notes, theme: (r.theme || '').trim(), skipDates: prev.skipDates || [] };
  const fd = new FormData(form);
  if (isCloud && fd.get('shareLoaded') && (!prev.sharedId || store.isSharedOwner(prev))) {
    const chosen = fd.getAll('shareWith');
    const names = Object.fromEntries([...form.querySelectorAll('input[name="shareWith"]')].map(i => [i.value, i.dataset.name || '']));
    const before = (prev.members || []).filter(u => u !== account.user?.uid).sort().join();
    if (!prev.sharedId && !chosen.length) store.upsert('events', item);
    else if (prev.sharedId && chosen.slice().sort().join() === before) store.upsert('events', item);
    else {
      store.shareEvent(item, chosen, names);
      toast(chosen.length ? `Compartido con ${chosen.map(u => names[u]).join(', ')}` : 'Ya no se comparte: quedó solo en tu agenda');
    }
  } else store.upsert('events', item);
  hooks.eventSaved?.(r.date);
  closeOrBack();
}

// Cancela o restaura una sola ocurrencia de un evento que se repite
export function toggleSkipOccurrence(id, date) {
  const e = store.get('events', id);
  if (!e) return;
  store.upsert('events', { ...e, skipDates: M.toggleSkip(e, date) });
  closeOrBack();
}

// ───────────── Responsables de una tarea (casillas) ─────────────
// «Yo» + tus Personas como casillas, y un campo para quienes aún no están en Personas.
// Se guarda: responsibleIds (de Personas), responsibles (nombres, para mostrar) y mine (si te toca a ti).

// Separa los nombres de un acuerdo en: tú, personas de tu lista y nombres que aún no están guardados
function splitResponsibles(v) {
  const ids = new Set(v.responsibleIds || []);
  const others = [];
  (v.responsibles || []).forEach(n => {
    const hit = M.resolveName(n);
    if (hit?.isMe) return;
    if (hit?.id) ids.add(hit.id); else if (!others.some(o => norm(o) === norm(n))) others.push(n);
  });
  return { me: M.isMineTask(v), ids: [...ids], others };
}

function responsiblesHtml(st) {
  const meName = M.profile().myName || data.people.find(p => p.isMe)?.name || '';
  const people = sortedPeople().filter(p => !p.isMe)
    .sort((a, b) => (st.ids.includes(b.id) ? 1 : 0) - (st.ids.includes(a.id) ? 1 : 0));   // los marcados primero
  return `<div class="checklist resp">
      <label class="check"><input type="checkbox" name="respMe" ${st.me ? 'checked' : ''}> <span><b>Yo</b>${meName ? ` <span class="hint">${esc(meName)}</span>` : ''}</span></label>
      ${people.map(p => `<label class="check"><input type="checkbox" name="respPerson" value="${p.id}" ${st.ids.includes(p.id) ? 'checked' : ''}> <span>${esc(p.name)}${p.role ? ` <span class="hint">${esc(p.role)}</span>` : ''}</span></label>`).join('')}
    </div>
    <input id="respOther" name="respOther" maxlength="160" value="${esc(st.others.join(', '))}" placeholder="Otros que no están en Personas (separa con coma)" aria-label="Otros responsables">
    ${st.others.length ? `<p class="hint resp-add">Agregar a Personas: ${st.others.map(n => `<button type="button" class="link sm" data-a="resp-add-person" data-name="${esc(n)}">+ ${esc(n)}</button>`).join('')}</p>` : ''}
    <p class="hint">Si no marcas a nadie, la tarea es tuya. Si marcas a otros y no a ti, la supervisas.</p>`;
}

// Estado actual de las casillas (para redibujarlas sin perder lo marcado)
function readResponsibles(form) {
  const fd = new FormData(form);
  return {
    me: fd.get('respMe') === 'on',
    ids: fd.getAll('respPerson'),
    others: String(fd.get('respOther') || '').split(',').map(x => x.trim()).filter(Boolean),
  };
}

// Guarda en Personas a un responsable escrito a mano y lo deja marcado
export function responsibleAddPerson(name) {
  const form = document.getElementById('f');
  const box = document.getElementById('resp-box');
  if (!form || !box || !name) return;
  const st = readResponsibles(form);
  let p = data.people.find(x => norm(x.name) === norm(name));
  if (!p) p = store.upsert('people', { id: uid(), name, role: '', phone: '', address: '', notes: '', groupIds: [] });
  st.ids = [...new Set([...st.ids, p.id])];
  st.others = st.others.filter(o => norm(o) !== norm(name));
  box.innerHTML = responsiblesHtml(st);
  refreshPersonSelects(form);
  toast(`${name} se agregó a Personas`);
}

// Guarda en Personas a la persona a atender que venía de un acuerdo y la deja elegida
export function subjectAddPerson(name) {
  const form = document.getElementById('f');
  if (!form || !name) return;
  let p = data.people.find(x => norm(x.name) === norm(name));
  if (!p) p = store.upsert('people', { id: uid(), name, role: '', phone: '', address: '', notes: '', groupIds: [] });
  refreshPersonSelects(form, p.id);
  document.getElementById('subject-add')?.remove();
  toast(`${name} se agregó a Personas`);
}

// Vuelve a llenar las listas de personas del formulario (tras agregar a alguien)
function refreshPersonSelects(form, selectPersonId) {
  ['personId', 'companionId'].forEach(id => {
    const sel = form.querySelector(`#${id}`);
    if (!sel) return;
    const cur = id === 'personId' && selectPersonId ? selectPersonId : sel.value;
    sel.outerHTML = peopleSelect(id, cur, id === 'personId' ? 'Sin persona' : 'Nadie');
  });
}

// ───────────── Tarea (con seguimiento) ─────────────

export function taskSheet(id, preset = {}, back) {
  const t = id ? store.get('tasks', id) : null;
  const v = t || { title: preset.title || '', kind: preset.kind || 'visita', personId: preset.personId || '', companionId: '', due: preset.due || '', dueTime: '', status: 'pendiente', notes: preset.notes || '', log: [], meetingId: preset.meetingId || '', fromAgreement: preset.fromAgreement || '', responsibles: preset.responsibles || [], mine: preset.mine !== false };
  const meeting = v.meetingId ? store.get('meetings', v.meetingId) : null;
  const meetings = [...data.meetings].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const meetingSelect = `<select id="meetingId" name="meetingId"><option value="">Ninguna</option>${meetings.map(m => `<option value="${m.id}" ${m.id === v.meetingId ? 'selected' : ''}>${esc(m.title)} — ${fmtShort(m.date)}</option>`).join('')}</select>`;

  const log = t ? `<section class="log"><h3 class="sub-h">Seguimiento</h3>
      ${(t.log || []).length
        ? `<ul>${[...t.log].reverse().map(l => `<li><time>${fmtShort(l.d)}</time><span>${esc(l.t)}</span></li>`).join('')}</ul>`
        : '<p class="hint">Aún no hay anotaciones. Registra aquí cada avance.</p>'}
      <div class="log-add"><input id="log-text" maxlength="240" placeholder="Anota un avance" aria-label="Nuevo seguimiento"><button type="button" class="btn" data-a="log-add" data-id="${t.id}">Agregar</button></div>
    </section>` : '<p class="hint">Guarda la tarea para empezar a anotar seguimientos.</p>';

  open({
    title: t ? 'Editar tarea' : 'Nueva tarea', back, focus: t ? null : '#title',
    body: `${formTag('task', t?.id)}
      <input type="hidden" name="fromAgreement" value="${esc(v.fromAgreement || '')}">
      ${fld('¿Qué hay que hacer?', `<input id="title" name="title" required maxlength="140" value="${esc(v.title)}" placeholder="Ej. Visitar a la hermana Rosa">`, 'title')}
      <div class="two">
        ${fld('Tipo', typeSelect('kind', M.KINDS, v.kind, 'tasks'), 'kind')}
        ${fld('Estado', `<select id="status" name="status">${options(M.STATUS, v.status)}</select>`, 'status')}
      </div>
      ${typeOtro('kind', 'Ej. Estudio con la familia')}
      ${fld('Persona a atender', peopleSelect('personId', v.personId, 'Sin persona'), 'personId')}
      ${!t && preset.subjectName && !v.personId ? `<p class="hint" id="subject-add">${esc(preset.subjectName)} no está en tus Personas. <button type="button" class="link sm" data-a="subject-add-person" data-name="${esc(preset.subjectName)}">Agregarla y elegirla</button></p>` : ''}
      ${fld('Persona que me acompaña', peopleSelect('companionId', v.companionId, 'Nadie'), 'companionId')}
      <div class="f"><span class="lbl">Responsables</span><div id="resp-box">${responsiblesHtml(splitResponsibles(v))}</div></div>
      <div class="two">
        ${fld('Fecha límite', `<input id="due" name="due" type="date" value="${v.due || ''}">`, 'due')}
        ${fld('Hora', `<input id="dueTime" name="dueTime" type="time" value="${v.dueTime || ''}">`, 'dueTime')}
      </div>
      ${fld('Notas', `<textarea id="notes" name="notes" rows="3">${esc(v.notes || '')}</textarea>`, 'notes')}
      ${meetings.length ? fld('Viene de la reunión…', meetingSelect, 'meetingId') : ''}
      ${v.fromAgreement && meeting ? `<p class="hint">Sale de un acuerdo de «${esc(meeting.title)}».</p>` : ''}
    </form>${log}`,
    actions: foot('tasks', t?.id),
  });
}

// Devuelve la tarea con lo escrito en el formulario, o null si falta escribir el tipo
// Lo marcado en «Responsables» → lo que se guarda en la tarea
function responsiblesFrom(form) {
  const st = readResponsibles(form);
  const names = [...st.ids.map(id => M.person(id)?.name).filter(Boolean), ...st.others];
  const meName = M.profile().myName || data.people.find(p => p.isMe)?.name || 'Yo';
  return {
    responsibleIds: st.ids,
    responsibles: st.me && names.length ? [meName, ...names] : names,
    mine: st.me || !names.length,   // sin nadie marcado, la tarea es tuya
  };
}

function collectTask(form, id) {
  const r = formValues(form);
  const kind = M.resolveType(r.kind, r.kindOtro, M.KINDS);
  if (kind === null) return null;
  const prev = id ? store.get('tasks', id) : null;
  const t = { ...(prev || {}), id: id || uid(), title: r.title, kind, personId: r.personId, companionId: r.companionId, due: r.due, dueTime: r.due ? r.dueTime : '', status: r.status, notes: r.notes, meetingId: r.meetingId || '', fromAgreement: r.meetingId ? (r.fromAgreement || '') : '', ...responsiblesFrom(form), log: prev?.log || [] };
  t.doneAt = t.status === 'hecha' ? (prev?.doneAt || today()) : '';
  return t;
}

function saveTask(id, form) {
  const t = collectTask(form, id);
  if (!t) { toast('Escribe el tipo de tarea'); return; }
  rememberType('tasks', t.kind, M.KINDS);
  store.upsert('tasks', t);
  closeOrBack();
}

// Agrega una línea de seguimiento sin perder lo que se estaba editando
export function addLog(id) {
  const form = document.getElementById('f');
  const input = document.getElementById('log-text');
  const text = input.value.trim();
  if (!form || !text) { input.focus(); return; }
  const t = collectTask(form, id);
  if (!t) { toast('Escribe el tipo de tarea'); return; }
  t.log = [...t.log, { d: today(), t: text }];
  if (t.status === 'pendiente') t.status = 'seguimiento';
  const saved = store.upsert('tasks', t);
  if (saved.personId) {
    const p = M.person(saved.personId);
    if (p) store.upsert('people', { ...p, lastContact: today() });
  }
  const b = backFn;
  taskSheet(id, {}, b);
  toast('Seguimiento anotado');
}

// ───────────── Persona ─────────────

export function personSheet(id, back) {
  const p = id ? store.get('people', id) : null;
  const v = p || { name: '', role: '', phone: '', address: '', notes: '', groupIds: [], photo: '' };
  const groups = sortedGroups();
  const mine = v.groupIds || [];
  open({
    title: p ? 'Editar persona' : 'Nueva persona', back, focus: p ? null : '#name',
    body: `${formTag('person', p?.id)}
      ${avatarPicker('photo', esc(initials(v.name || '?')), v.photo)}
      ${fld('Nombre', `<input id="name" name="name" required maxlength="100" value="${esc(v.name)}" autocapitalize="words">`, 'name')}
      <label class="check"><input type="checkbox" id="isMe" name="isMe" ${v.isMe ? 'checked' : ''}> Esta persona soy yo</label>
      ${fld('Relación', `<input id="role" name="role" list="role-list" maxlength="60" value="${esc(v.role || '')}" placeholder="Ej. Estudiante bíblico"><datalist id="role-list">${M.ROLES.map(r => `<option value="${r}">`).join('')}</datalist>`, 'role')}
      <div class="f"><span class="lbl">Privilegios y responsabilidades <span class="hint">(toca para elegir)</span></span>
        <details class="priv-pick">
          <summary id="priv-sum">${privSummary(v.privileges || [])}</summary>
          <div class="pchips" id="priv-box">${privChipsHtml(v.privileges || [])}</div>
          <div class="log-add"><input id="priv-new" maxlength="60" placeholder="Otro privilegio (ej. Superintendente de ciudad)" aria-label="Otro privilegio"><button type="button" class="btn" data-a="priv-add">Agregar</button></div>
        </details>
      </div>
      ${fld('Grupos', `${groups.length ? `<div class="checklist">${groups.map(g => `<label class="check"><input type="checkbox" name="group" value="${g.id}" ${mine.includes(g.id) ? 'checked' : ''}> ${esc(g.name)}</label>`).join('')}</div>` : ''}<input id="newGroup" name="newGroup" maxlength="60" placeholder="${groups.length ? 'Agregar a un grupo nuevo' : 'Ej. Siervos ministeriales'}">`, 'newGroup')}
      ${fld('También escrito como', `<input id="aliases" name="aliases" maxlength="120" value="${esc(v.aliases || '')}" placeholder="Apodos u otras formas, separadas por coma">`, 'aliases')}
      ${fld('Teléfono', `<input id="phone" name="phone" type="tel" maxlength="30" value="${esc(v.phone || '')}" placeholder="0414-1234567">`, 'phone')}
      ${fld('Dirección o referencia', `<input id="address" name="address" maxlength="160" value="${esc(v.address || '')}">`, 'address')}
      ${fld('Notas', `<textarea id="notes" name="notes" rows="3">${esc(v.notes || '')}</textarea><span class="hint">Mejor notas breves: evita guardar datos muy delicados.</span>`, 'notes')}
    </form>`,
    actions: foot('people', p?.id),
  });
}

// Casillas de privilegios con forma de etiqueta (las marcadas se ven resaltadas)
function privChipsHtml(selected, extra = []) {
  const list = [...new Set([...M.allPrivileges(), ...selected, ...extra])];
  return list.map(x => `<label class="pchip"><input type="checkbox" name="priv" value="${esc(x)}" ${selected.some(s => norm(s) === norm(x)) ? 'checked' : ''}><span>${esc(x)}</span></label>`).join('');
}

// Resumen de lo marcado, visible aunque la lista esté plegada
const privSummary = list => list.length ? `<span class="pchips">${list.map(x => `<span class="chip static priv">${esc(x)}</span>`).join('')}</span><span class="hint">Cambiar</span>` : '<span class="hint">Ninguno · toca para elegir</span>';
export function privilegeChanged() {
  const form = document.getElementById('f');
  const sum = document.getElementById('priv-sum');
  if (form && sum) sum.innerHTML = privSummary(new FormData(form).getAll('priv'));
}

// Agrega un privilegio escrito a mano (queda marcado; al guardar se suma a tu lista)
export function privilegeAdd() {
  const input = document.getElementById('priv-new');
  const box = document.getElementById('priv-box');
  const form = document.getElementById('f');
  const name = (input?.value || '').trim();
  if (!name || !box || !form) { input?.focus(); return; }
  const selected = [...new Set([...new FormData(form).getAll('priv'), name])];
  box.innerHTML = privChipsHtml(selected, [name]);
  input.value = '';
  privilegeChanged();
}

function savePerson(id, r, form) {
  const prev = id ? store.get('people', id) : {};
  const gids = new FormData(form).getAll('group');
  const newName = (r.newGroup || '').trim();
  if (newName) {   // grupo nuevo escrito aquí mismo (si ya existe con ese nombre, se reutiliza)
    const found = data.groups.find(g => norm(g.name) === norm(newName));
    const gid = found ? found.id : store.upsert('groups', { id: uid(), name: newName, notes: '' }).id;
    if (!gids.includes(gid)) gids.push(gid);
  }
  const isMe = r.isMe === 'on';
  if (isMe) {   // solo una persona puede estar marcada como «tú»
    data.people.filter(p => p.isMe && p.id !== id).forEach(p => store.upsert('people', { ...p, isMe: false }));
  }
  // lastContact no se toca: se actualiza solo al anotar seguimientos en sus tareas
  const groupLeftAt = M.updateGroupMembership(prev.groupIds || [], gids, prev.groupLeftAt);
  const privileges = new FormData(form).getAll('priv');
  // Los privilegios nuevos quedan en tu lista para las demás personas
  const known = [...M.PRIVILEGES, ...M.savedTypes('privileges')].map(norm);
  const fresh = privileges.filter(x => !known.includes(norm(x)));
  if (fresh.length) store.upsert('profile', { ...M.profile(), id: 'me', customPrivileges: [...M.savedTypes('privileges'), ...fresh] });
  const saved = store.upsert('people', { ...prev, id: id || uid(), name: r.name, role: r.role, phone: r.phone, address: r.address, notes: r.notes, groupIds: gids, groupLeftAt, isMe, photo: r.photo, aliases: r.aliases || '', privileges });
  if (backFn) closeOrBack(); else personDetail(saved.id);   // al crear, se muestra su ficha
}

export function personDetail(id, back = null) {
  const p = store.get('people', id);
  if (!p) return close();
  const groups = M.groupsOf(p);
  const tasks = M.sortActive(data.tasks.filter(t => t.personId === id && t.status !== 'hecha'));
  const doneCount = data.tasks.filter(t => t.personId === id && t.status === 'hecha').length;
  const linkedNotes = data.notes.filter(n => n.personId === id);
  open({
    title: p.name, back,
    body: `<div class="pd-head">${avatarHtml(p.photo, esc(initials(p.name)), 'big')}
        <div><p class="meta">${esc(p.role || 'Sin relación indicada')}</p>
        ${p.lastContact ? `<p class="meta">Último contacto ${relDays(p.lastContact)}</p>` : ''}</div></div>
      ${(p.privileges || []).length ? `<div class="tagrow">${p.privileges.map(x => `<span class="chip static priv">${esc(x)}</span>`).join('')}</div>` : ''}
      ${groups.length ? `<div class="tagrow">${groups.map(g => `<span class="chip static">${esc(g.name)}</span>`).join('')}</div>` : ''}
      ${p.phone ? `<div class="quick"><a class="btn small" href="${telLink(p.phone)}">${ic('phone', 'sm')} Llamar</a><a class="btn small" href="${waLink(p.phone)}" target="_blank" rel="noopener">${ic('chat', 'sm')} WhatsApp</a></div>` : ''}
      ${p.address ? `<p class="meta pad">${ic('pin', 'sm')}${esc(p.address)}</p>` : ''}
      <div class="quick">
        <button class="btn small" data-a="new-task-for" data-id="${id}">Nueva tarea</button>
      </div>
      <h3 class="sub-h">Tareas abiertas</h3>
      ${tasks.length ? `<div class="stack">${tasks.map(t => `<button class="card mini" data-a="task-in-sheet" data-id="${t.id}" data-bk="person" data-bid="${id}"><strong>${esc(t.title)}</strong><span class="meta">${esc(M.kindLabel(t.kind))}${t.due ? `, ${fmtShort(t.due)}` : ''}</span></button>`).join('')}</div>` : '<p class="hint">No hay tareas abiertas para esta persona.</p>'}
      ${doneCount ? `<p class="hint pad">${doneCount} ${doneCount === 1 ? 'tarea completada' : 'tareas completadas'}.</p>` : ''}
      ${p.notes ? `<h3 class="sub-h">Notas</h3><p class="prose">${esc(p.notes)}</p>` : ''}
      ${linkedNotes.length ? `<h3 class="sub-h">Notas de la agenda vinculadas</h3><div class="stack">${linkedNotes.map(n => `<button class="card mini" data-a="note-in-sheet" data-id="${n.id}" data-bk="person" data-bid="${id}"><strong>${esc(n.title || 'Sin título')}</strong><span class="meta">${M.noteDate(n) ? fmtShort(M.noteDate(n)) : ''}</span></button>`).join('')}</div>` : ''}`,
    actions: `<button type="button" class="btn ghost" data-a="edit-person" data-id="${id}">Editar</button><button type="button" class="btn primary" data-a="sheet-close">Listo</button>`,
  });
}

// Estas tres conservan la hoja anterior (p. ej. el grupo desde el que se abrió la ficha)
export function editPerson(id) { const b = backFn; personSheet(id, () => personDetail(id, b)); }
export function newTaskFor(id) { const b = backFn; taskSheet(null, { personId: id }, () => personDetail(id, b)); }

// ───────────── Grupo ─────────────

export function groupSheet(id, back) {
  const g = id ? store.get('groups', id) : null;
  const v = g || { name: '', notes: '' };
  const people = sortedPeople();
  open({
    title: g ? 'Editar grupo' : 'Nuevo grupo', back, focus: g ? null : '#name',
    body: `${formTag('group', g?.id)}
      ${fld('Nombre del grupo', `<input id="name" name="name" required maxlength="80" value="${esc(v.name)}" placeholder="Ej. Ancianos de la congregación">`, 'name')}
      ${fld('Notas', `<textarea id="notes" name="notes" rows="2">${esc(v.notes || '')}</textarea>`, 'notes')}
      <div class="f"><span class="lbl">Personas del grupo</span>
        ${people.length
          ? `<div class="checklist">${people.map(p => `<label class="check"><input type="checkbox" name="member" value="${p.id}" ${g && (p.groupIds || []).includes(g.id) ? 'checked' : ''}> <span>${esc(p.name)}${p.role ? ` <span class="hint">${esc(p.role)}</span>` : ''}</span></label>`).join('')}</div>`
          : '<p class="hint">Aún no has agregado personas. Créalas en la pestaña Personas y luego súmalas aquí.</p>'}
      </div>
    </form>`,
    actions: foot('groups', g?.id),
  });
}

function saveGroup(id, form) {
  const r = formValues(form);
  const members = new FormData(form).getAll('member');
  const g = store.upsert('groups', { ...(id ? store.get('groups', id) : {}), id: id || uid(), name: r.name, notes: r.notes });
  [...data.people].forEach(p => {
    const has = (p.groupIds || []).includes(g.id), want = members.includes(p.id);
    if (has !== want) {
      const ids = p.groupIds || [];
      const nextIds = want ? [...ids, g.id] : ids.filter(x => x !== g.id);
      const groupLeftAt = M.updateGroupMembership(ids, nextIds, p.groupLeftAt);
      store.upsert('people', { ...p, groupIds: nextIds, groupLeftAt });
    }
  });
  if (backFn) closeOrBack(); else groupDetail(g.id);
}

export function groupDetail(id, back = null) {
  const g = store.get('groups', id);
  if (!g) return close();
  const members = sortedPeople().filter(p => (p.groupIds || []).includes(id));
  const former = M.formerMembers(id);
  open({
    title: g.name, back,
    body: `${g.notes ? `<p class="prose">${esc(g.notes)}</p>` : ''}
      <h3 class="sub-h">${members.length} ${members.length === 1 ? 'persona' : 'personas'}</h3>
      ${members.length
        ? `<div class="stack">${members.map(p => `<button class="card mini" data-a="person-in-sheet" data-id="${p.id}" data-bk="group" data-bid="${id}"><strong>${esc(p.name)}</strong>${p.role ? `<span class="meta">${esc(p.role)}</span>` : ''}</button>`).join('')}</div>`
        : '<p class="hint">Este grupo aún no tiene personas. Toca «Editar» para sumarlas.</p>'}
      ${former.length ? `<h3 class="sub-h">Ya no forman parte</h3><div class="stack">${former.map(f => `<button class="card mini" data-a="person-in-sheet" data-id="${f.person.id}" data-bk="group" data-bid="${id}"><strong>${esc(f.person.name)}</strong><span class="meta">Desde ${fmtShort(f.leftAt)}</span></button>`).join('')}</div>` : ''}`,
    actions: `<button type="button" class="btn ghost" data-a="edit-group" data-id="${id}">Editar</button><button type="button" class="btn primary" data-a="sheet-close">Listo</button>`,
  });
}

// ───────────── Nota ─────────────

export function noteSheet(id, back) {
  const n = id ? store.get('notes', id) : null;
  // Fecha por defecto: la que ya tenga la nota, o si es una nota vieja sin fecha, cuándo se creó; para una nota nueva, hoy.
  const date = n ? (n.date || (n.createdAt ? dateOf(n.createdAt) : today())) : today();
  const v = { title: '', body: '', tag: '', pinned: false, meetingId: '', personId: '', ...n, date };
  const tags = [...new Set(data.notes.map(x => x.tag).filter(Boolean))];
  const meetingsSelect = `<select id="meetingId" name="meetingId"><option value="">Ninguna</option>${[...data.meetings].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(m => `<option value="${m.id}" ${m.id === v.meetingId ? 'selected' : ''}>${esc(m.title)} — ${fmtShort(m.date)}</option>`).join('')}</select>`;
  open({
    title: n ? 'Editar nota' : 'Nueva nota', back, focus: n ? null : '#title',
    body: `${formTag('note', n?.id)}
      ${fld('Título', `<input id="title" name="title" maxlength="120" value="${esc(v.title)}">`, 'title')}
      <div class="two">
        ${fld('Fecha', `<input id="date" name="date" type="date" value="${v.date}">`, 'date')}
        ${fld('Etiqueta', `<input id="tag" name="tag" list="tag-list" maxlength="40" value="${esc(v.tag || '')}" placeholder="Ej. Ideas"><datalist id="tag-list">${tags.map(t => `<option value="${esc(t)}">`).join('')}</datalist>`, 'tag')}
      </div>
      ${fld('Contenido', `<textarea id="body" name="body" rows="10">${esc(v.body || '')}</textarea>`, 'body')}
      <label class="check"><input type="checkbox" name="pinned" ${v.pinned ? 'checked' : ''}> Fijar arriba</label>
      ${data.meetings.length ? fld('Vincular a una reunión', meetingsSelect, 'meetingId') : ''}
      ${fld('Vincular a una persona', peopleSelect('personId', v.personId, 'Nadie'), 'personId')}
    </form>`,
    actions: foot('notes', n?.id),
  });
}

function saveNote(id, r) {
  if (!r.title && !r.body) { toast('Escribe un título o el contenido'); return; }
  const prev = id ? store.get('notes', id) : {};
  store.upsert('notes', { ...prev, id: id || uid(), title: r.title, body: r.body, tag: r.tag, pinned: r.pinned === 'on', date: r.date, meetingId: r.meetingId, personId: r.personId });
  closeOrBack();
}

// ───────────── Mi Informe: perfil, categorías y registro de tiempo ─────────────

// Categorías personalizadas que se están editando en Mi perfil (mientras la hoja está abierta).
// Las que ya tienen registros no se borran: se archivan, para que esos registros sigan mostrando su nombre.
let catDraft = [];
let catEditIdx = -1;        // posición de la categoría que se está editando (-1 = agregando una nueva)
let catIconManual = false;  // si el usuario eligió el icono a mano, ya no se sugiere por el nombre

function catDraftHtml() {
  const rows = catDraft.map((c, i) => c.archived ? '' : `<div class="mini-row">
      <button type="button" class="cat-row" data-a="cat-edit" data-i="${i}" aria-label="Editar ${esc(c.n)}">${ic(c.ic || 'clip')}<span>${esc(c.n)}${c.credito ? ' <span class="hint">(crédito)</span>' : ''}</span></button>
      <button type="button" class="icon-btn" data-a="cat-remove" data-i="${i}" aria-label="Quitar ${esc(c.n)}">${ic('x', 'sm')}</button></div>`).join('');
  return rows ? `<div class="mini-list">${rows}</div>` : '<p class="hint">Aún no agregaste categorías propias.</p>';
}

const iconPickerHtml = sel => `<div class="icon-pick" role="radiogroup" aria-label="Icono de la categoría">${M.CAT_ICONS.map(([k, n]) =>
  `<label class="icon-opt" title="${esc(n)}"><input type="radio" name="catIcon" value="${k}" ${k === sel ? 'checked' : ''}><span>${ic(k)}</span><small>${esc(n)}</small></label>`).join('')}</div>`;

export function profileSheet() {
  const v = M.profile();
  catDraft = v.customCats ? v.customCats.map(c => ({ ...c })) : [];
  catEditIdx = -1; catIconManual = false;
  const roles = M.profileRoles(v);
  const extra = roles.filter(r => !M.PUBLISHER_ROLES.includes(r)).join(', ');
  const typeInfo = isCloud && M.PROFILE_TYPES[session.type] ? M.PROFILE_TYPES[session.type].n : '';
  open({
    title: 'Mi perfil',
    body: `${formTag('profile', 'me')}
      ${avatarPicker('photo', ic('clock'), v.photo)}
      <div class="two">
        ${fld('Tu nombre', `<input id="myName" name="myName" maxlength="80" value="${esc(v.myName || '')}" placeholder="Ej. Antonio Rojas" autocomplete="name">`, 'myName')}
        ${fld('Cómo te escriben', `<input id="myAliases" name="myAliases" maxlength="120" value="${esc(v.myAliases || '')}" placeholder="Ej. Tony, Antonio J.">`, 'myAliases')}
      </div>
      <p class="hint">Así la app reconoce en los acuerdos de las reuniones cuáles te tocan a ti, aunque tu nombre esté mal escrito.</p>
      ${typeInfo ? `<p class="hint">Tipo de perfil: <b>${esc(typeInfo)}</b> (lo asigna el administrador).</p>` : ''}
      <div class="f"><span class="lbl">Sirvo como… <span class="hint">(puedes marcar varias)</span></span>
        <div class="checklist">${M.PUBLISHER_ROLES.map(r => `<label class="check"><input type="checkbox" name="roles" value="${esc(r)}" ${roles.includes(r) ? 'checked' : ''}> <span>${esc(r)}</span></label>`).join('')}</div>
        <input id="roleOtro" name="roleOtro" maxlength="80" value="${esc(extra)}" placeholder="Otro (escríbelo; separa varios con coma)" aria-label="Otro servicio">
      </div>
      <label class="check"><input type="checkbox" id="goalEnabled" name="goalEnabled" ${v.goalEnabled ? 'checked' : ''}> Meta personal</label>
      <div class="two">
        ${fld('Meta mensual (h)', `<input id="goalMonthly" name="goalMonthly" type="number" min="0" inputmode="numeric" value="${esc(v.goalMonthly ?? '')}">`, 'goalMonthly')}
        ${fld('Meta anual (h)', `<input id="goalAnnual" name="goalAnnual" type="number" min="0" inputmode="numeric" value="${esc(v.goalAnnual ?? '')}">`, 'goalAnnual')}
      </div>
      <div class="f"><span class="lbl">Categorías propias de Mi Informe</span>
        <p class="hint">Además de las fijas (Servicio del Campo, LDC, Betel…), agrega las tuyas, por ejemplo «CEH», con su icono y si cuentan como tiempo de crédito. Toca una para editarla.</p>
        <div id="cats-box">${catDraftHtml()}</div>
        <div class="cat-editor">
          <input id="cat-name" maxlength="40" placeholder="Nombre de la categoría" aria-label="Nombre de la categoría">
          <label class="check"><input type="checkbox" id="cat-credito"> Es tiempo de crédito (como LDC o Betel)</label>
          <span class="hint">Icono</span>
          <div id="icon-box">${iconPickerHtml('clip')}</div>
          <div class="quick"><button type="button" class="btn" id="cat-save" data-a="cat-add">Agregar categoría</button><button type="button" class="btn ghost" id="cat-cancel" data-a="cat-cancel" hidden>Cancelar</button></div>
        </div>
        <input type="hidden" id="customCats" name="customCats" value="${esc(JSON.stringify(catDraft))}">
      </div>
    </form>`,
    actions: `<button type="submit" form="f" class="btn primary">Guardar</button>`,
  });
}

const selectedIcon = () => document.querySelector('input[name="catIcon"]:checked')?.value || 'clip';
function setIcon(k) {
  const r = document.querySelector(`input[name="catIcon"][value="${k}"]`);
  if (r) r.checked = true;
}

// Mientras se escribe el nombre, se sugiere un icono (CEH → médico, LDC → construcción…)
export function catNameInput(name) { if (!catIconManual) setIcon(M.suggestIcon(name)); }
export function catIconPicked() { catIconManual = true; }

// Agrega una categoría nueva, o guarda los cambios de la que se está editando (sin perder lo demás del formulario)
export function catAdd() {
  const input = document.getElementById('cat-name');
  const credito = document.getElementById('cat-credito');
  const n = (input?.value || '').trim();
  if (!n) { input?.focus(); return; }
  const item = { n, credito: !!credito?.checked, ic: selectedIcon() };
  if (catEditIdx >= 0 && catDraft[catEditIdx]) catDraft[catEditIdx] = { ...catDraft[catEditIdx], ...item };
  else catDraft = [...catDraft, { key: uid(), ...item }];
  catCancel();
  refreshCats();
}
export function catEdit(i) {
  const c = catDraft[Number(i)];
  if (!c) return;
  catEditIdx = Number(i); catIconManual = true;
  document.getElementById('cat-name').value = c.n;
  document.getElementById('cat-credito').checked = !!c.credito;
  setIcon(c.ic || 'clip');
  document.getElementById('cat-save').textContent = 'Guardar cambios';
  document.getElementById('cat-cancel').hidden = false;
  document.getElementById('cat-name').focus();
}
export function catCancel() {
  catEditIdx = -1; catIconManual = false;
  const input = document.getElementById('cat-name');
  if (input) input.value = '';
  const credito = document.getElementById('cat-credito');
  if (credito) credito.checked = false;
  setIcon('clip');
  const save = document.getElementById('cat-save');
  if (save) save.textContent = 'Agregar categoría';
  const cancel = document.getElementById('cat-cancel');
  if (cancel) cancel.hidden = true;
}
export function catRemove(i) {
  const idx = Number(i);
  const c = catDraft[idx];
  if (!c) return;
  const used = data.entries.some(e => e.category === c.key);
  catDraft = used ? catDraft.map((x, j) => (j === idx ? { ...x, archived: true } : x)) : catDraft.filter((_, j) => j !== idx);
  if (used) toast('Se ocultó; tus registros con esa categoría se conservan');
  if (catEditIdx === idx) catCancel();
  refreshCats();
}
function refreshCats() {
  const box = document.getElementById('cats-box');
  const hidden = document.getElementById('customCats');
  if (box) box.innerHTML = catDraftHtml();
  if (hidden) hidden.value = JSON.stringify(catDraft);
}

function saveProfile(r, form) {
  let customCats = [];
  try { customCats = JSON.parse(r.customCats || '[]'); } catch { customCats = []; }
  const checked = new FormData(form).getAll('roles');
  const typed = String(r.roleOtro || '').split(',').map(x => x.trim()).filter(Boolean);
  const roles = [...new Set([...checked, ...typed])];
  store.upsert('profile', { ...M.profile(), id: 'me', myName: r.myName || '', myAliases: r.myAliases || '', roles, role: roles.join(', '), photo: r.photo, goalEnabled: r.goalEnabled === 'on', goalMonthly: r.goalMonthly, goalAnnual: r.goalAnnual, customCats });
  closeOrBack();
}

// Elegir la categoría antes de registrar tiempo
export function catPickSheet(mid, back) {
  open({
    title: 'Mi Informe', back,
    body: `<div class="cat-list">${Object.entries(M.allServicioCats()).map(([k, c]) =>
      `<button type="button" class="cat-btn" style="--c:${c.c}" data-a="new-entry" data-cat="${k}" data-mid="${mid || ''}">${ic(c.ic)}<span>${esc(c.n)}<small>${c.credito ? 'Tiempo de crédito' : 'Tiempo de servicio'}</small></span></button>`
    ).join('')}</div>`,
  });
}

// Nombres de curso bíblico del registro que se está editando (mientras la hoja está abierta)
let studyDraft = [];

function studiesListHtml() {
  return studyDraft.length
    ? `<div class="mini-list">${studyDraft.map((n, i) => `<div class="mini-row"><span>${esc(n)}</span><button type="button" class="icon-btn" data-a="study-remove" data-i="${i}" aria-label="Quitar ${esc(n)}">${ic('x', 'sm')}</button></div>`).join('')}</div>`
    : '<p class="hint">Aún no has agregado ningún curso bíblico a este registro.</p>';
}

export function entrySheet(id, preset = {}, back) {
  const e = id ? store.get('entries', id) : null;
  const catKey = e ? e.category : preset.cat;
  const cat = M.catServicioOf(catKey);
  const date = e ? e.date : (preset.mid ? `${preset.mid}-01` : today());
  const minutes = e ? (e.minutes || 0) : 0;
  studyDraft = e?.studyNames ? [...e.studyNames] : [];
  const studentNames = sortedPeople().filter(p => norm(p.role || '').includes('estudiante')).map(p => p.name);
  open({
    title: e ? 'Editar registro' : 'Registrar tiempo', back,
    body: `${formTag('entry', e?.id)}
      <input type="hidden" name="category" value="${esc(catKey)}">
      <span class="cat-badge" style="--c:${cat.c}">${ic(cat.ic)}${esc(cat.n)}</span>
      <div class="time-wrap">
        <div class="time-btns">
          <button type="button" class="btn" data-a="adj" data-delta="60">+ 1h</button>
          <button type="button" class="btn" data-a="adj" data-delta="5">+ 5m</button>
        </div>
        <div class="time-big" id="minutes-display">${M.fmtHM(minutes)}</div>
        <div class="time-btns">
          <button type="button" class="btn ghost" data-a="adj" data-delta="-60">− 1h</button>
          <button type="button" class="btn ghost" data-a="adj" data-delta="-5">− 5m</button>
        </div>
        <input type="hidden" id="minutes" name="minutes" value="${minutes}">
      </div>
      ${fld('Fecha', `<input id="date" name="date" type="date" required value="${date}">`, 'date')}
      <div class="f"><span class="lbl">Cursos bíblicos</span>
        <div id="studies-box">${studiesListHtml()}</div>
        <div class="log-add">
          <input id="study-name" list="study-name-list" maxlength="80" placeholder="Nombre del estudiante" aria-label="Nombre del estudiante">
          <datalist id="study-name-list">${studentNames.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
          <button type="button" class="btn" data-a="study-add">Agregar</button>
        </div>
        <input type="hidden" id="studies" name="studies" value="${esc(JSON.stringify(studyDraft))}">
      </div>
      ${fld('Notas', `<textarea id="notes" name="notes" rows="3">${esc(e?.notes || '')}</textarea>`, 'notes')}
    </form>`,
    actions: foot('entries', e?.id),
  });
}

// Agrega o quita un nombre de la lista de cursos bíblicos del registro, sin perder lo demás del formulario
export function studyAdd() {
  const input = document.getElementById('study-name');
  const name = (input?.value || '').trim();
  if (!name) { input?.focus(); return; }
  studyDraft = [...studyDraft, name];
  if (input) input.value = '';
  refreshStudies();
}
export function studyRemove(i) {
  studyDraft = studyDraft.filter((_, idx) => idx !== Number(i));
  refreshStudies();
}
function refreshStudies() {
  const box = document.getElementById('studies-box');
  const hidden = document.getElementById('studies');
  if (box) box.innerHTML = studiesListHtml();
  if (hidden) hidden.value = JSON.stringify(studyDraft);
}

// Suma o resta minutos al contador del registro que se está editando, sin perder lo demás del formulario
export function adjustMinutes(delta) {
  const input = document.getElementById('minutes');
  const display = document.getElementById('minutes-display');
  if (!input || !display) return;
  const next = Math.max(0, (parseInt(input.value, 10) || 0) + delta);
  input.value = next;
  display.textContent = M.fmtHM(next);
}

function saveEntry(id, r) {
  const prev = id ? store.get('entries', id) : {};
  let studyNames = [];
  try { studyNames = JSON.parse(r.studies || '[]'); } catch { studyNames = []; }
  store.upsert('entries', { ...prev, id: id || uid(), category: r.category, date: r.date, minutes: parseInt(r.minutes, 10) || 0, studyNames, notes: r.notes });
  closeOrBack();
}

// Ficha de un mes: totales, meta y lista de registros
export function monthSheet(mid, withCredit = false) {
  const [y, m] = mid.split('-').map(Number);
  const entries = M.entriesForMonth(mid);
  const t = M.monthTotals(mid, withCredit);
  const v = M.profile();
  const goal = goalBlock(mid, v, 'Tu meta');
  open({
    title: fmtMonth(y, m),
    body: `${goal}
      <div class="seg two"><button data-a="month" data-id="${mid}" data-credit="0" aria-pressed="${!withCredit}">Sin crédito</button><button data-a="month" data-id="${mid}" data-credit="1" aria-pressed="${withCredit}">Con crédito</button></div>
      <div class="stack pad">
        <div class="card mini"><strong>${M.fmtHM(t.minutes)} h</strong><span class="meta">Tiempo total</span></div>
        <div class="card mini"><strong>${t.studies}</strong><span class="meta">Cursos bíblicos</span></div>
      </div>
      <h3 class="sub-h">Registros del mes</h3>
      ${entries.length ? `<div class="stack">${entries.map(e => {
        const c = M.catServicioOf(e.category);
        const names = (e.studyNames || []).join(', ');
        return `<button class="card mini entry-row" data-a="entry" data-id="${e.id}" data-mid="${mid}"><span class="dot" style="--c:${c.c}"></span><span class="grow"><strong>${esc(c.n)}</strong><span class="meta">${fmtShort(e.date)}${e.notes ? ` · ${esc(e.notes)}` : ''}${names ? ` · ${esc(names)}` : ''}</span></span><span>${M.fmtHM(e.minutes)}</span></button>`;
      }).join('')}</div>` : '<p class="hint">Sin registros todavía. Toca «Agregar» para anotar tu primer tiempo.</p>'}`,
    actions: `<button type="button" class="btn ghost" data-a="share-month" data-id="${mid}" data-credit="${withCredit ? 1 : 0}">Enviar</button><button type="button" class="btn primary" data-a="cat-pick" data-mid="${mid}">Agregar</button>`,
  });
}

// Arma un resumen de texto del mes y lo entrega al selector de compartir del teléfono
// (WhatsApp, correo, SMS…), o si no hay, abre un borrador de correo.
export function shareMonth(mid, withCredit) {
  const [y, m] = mid.split('-').map(Number);
  const t = M.monthTotals(mid, withCredit);
  const v = M.profile();
  const byCat = {};
  M.entriesForMonth(mid).forEach(e => {
    const c = M.catServicioOf(e.category);
    if (c.credito && !withCredit) return;
    byCat[c.n] = (byCat[c.n] || 0) + (Number(e.minutes) || 0);
  });
  const title = `Informe de servicio — ${fmtMonth(y, m)}`;
  const lines = [
    title,
    M.roleText(v) ? `Sirvo como: ${M.roleText(v)}` : '',
    `Tiempo total: ${M.fmtHM(t.minutes)} h${withCredit ? ' (con crédito)' : ''}`,
    `Cursos bíblicos: ${t.studies}`,
    '',
    ...Object.entries(byCat).map(([n, min]) => `• ${n}: ${M.fmtHM(min)} h`),
  ].filter(Boolean);
  const text = lines.join('\n');
  if (navigator.share) {
    navigator.share({ title, text }).catch(() => {});
  } else {
    location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`;
  }
}

// ───────────── Mi semana: plan de horas por día y objetivos ─────────────

let planDraft = [0, 0, 0, 0, 0, 0, 0];

function planSummaryHtml() {
  const v = M.profile();
  const total = M.planWeekTotal(planDraft);
  const cur = today().slice(0, 7);
  const [y, m] = cur.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const proj = M.planForMonth(cur, planDraft);
  const goal = v.goalEnabled ? Number(v.goalMonthly) : 0;
  const need = goal > 0 ? goal * 60 * 7 / days : 0;   // horas por semana que pide la meta en este mes
  return `<div class="plan-sum">
      <div><span class="hint">Por semana</span><b>${M.fmtHM(total)} h</b></div>
      <div><span class="hint">En ${fmtMonth(y, m).split(' ')[0].toLowerCase()}</span><b>≈ ${M.fmtHM(proj)} h</b></div>
    </div>
    <p class="hint">Con 4 semanas justas serían ${M.fmtHM(total * 4)} h; el cálculo del mes suma cada día real del calendario (este mes tiene ${days} días, unas ${(days / 7).toFixed(1).replace('.', ',')} semanas).</p>
    ${goal > 0 ? `<p class="${proj >= goal * 60 ? 'hint ok-text' : 'err'}">${proj >= goal * 60
      ? `✓ Con este plan alcanzas tu meta de ${goal} h.`
      : `Tu meta de ${goal} h pide unas ${M.fmtHM(need)} h por semana este mes: te faltan ${M.fmtHM(goal * 60 - proj)} h.`}</p>` : ''}`;
}

export function weekPlanSheet() {
  planDraft = [...M.weekPlan()];
  open({
    title: 'Planear mi semana',
    body: `${formTag('weekplan', 'me')}
      <p class="hint">Indica cuánto tiempo piensas dedicar cada día. El plan se repite cada semana; cámbialo cuando quieras.</p>
      <div class="plan-days">${M.WEEKDAYS.map((n, i) => `<div class="plan-day">
        <span>${n}</span>
        <button type="button" class="icon-btn" data-a="plan-adj" data-d="${i}" data-delta="-30" aria-label="Quitar 30 minutos el ${n.toLowerCase()}">−</button>
        <b id="plan-${i}">${M.fmtHM(planDraft[i])}</b>
        <button type="button" class="icon-btn" data-a="plan-adj" data-d="${i}" data-delta="30" aria-label="Agregar 30 minutos el ${n.toLowerCase()}">+</button>
      </div>`).join('')}</div>
      <input type="hidden" id="weekPlan" name="weekPlan" value="${esc(JSON.stringify(planDraft))}">
      <div id="plan-summary">${planSummaryHtml()}</div>
    </form>`,
    actions: `<button type="submit" form="f" class="btn primary">Guardar plan</button>`,
  });
}

export function planAdjust(d, delta) {
  const i = Number(d);
  planDraft[i] = Math.max(0, Math.min(24 * 60, planDraft[i] + Number(delta)));
  const cell = document.getElementById(`plan-${i}`);
  if (cell) cell.textContent = M.fmtHM(planDraft[i]);
  const hidden = document.getElementById('weekPlan');
  if (hidden) hidden.value = JSON.stringify(planDraft);
  const box = document.getElementById('plan-summary');
  if (box) box.innerHTML = planSummaryHtml();
}

function saveWeekPlan(r) {
  let weekPlan = [0, 0, 0, 0, 0, 0, 0];
  try { const a = JSON.parse(r.weekPlan || '[]'); if (Array.isArray(a) && a.length === 7) weekPlan = a.map(n => Math.max(0, Number(n) || 0)); } catch { /* se deja vacío */ }
  store.upsert('profile', { ...M.profile(), id: 'me', weekPlan });
  closeOrBack();
  toast('Plan de la semana guardado');
}

// Objetivos de la semana actual (se guardan por semana, así quedan como historial)
function saveWeekGoals(goals) {
  const w = M.weekDoc();
  store.upsert('weeks', { ...w, goals });
}
export function weekGoalAdd() {
  const input = document.getElementById('wgoal-text');
  const t = (input?.value || '').trim();
  if (!t) { input?.focus(); return; }
  saveWeekGoals([...(M.weekDoc().goals || []), { t, done: false }]);
}
export function weekGoalToggle(i) {
  saveWeekGoals((M.weekDoc().goals || []).map((g, j) => (j === Number(i) ? { ...g, done: !g.done } : g)));
}
export function weekGoalRemove(i) {
  const prev = M.weekDoc().goals || [];
  saveWeekGoals(prev.filter((_, j) => j !== Number(i)));
  toast('Objetivo quitado', 'Deshacer', () => saveWeekGoals(prev));
}

// ───────────── Reunión importante ─────────────

// Aviso, dentro de una reunión ya guardada, de quién ha salido de los grupos participantes
// desde que ocurrió la reunión (así se sabe desde cuándo ya no forma parte).
function departedNotice(groupIds, meetingDate) {
  const departed = M.departedSince(groupIds, meetingDate);
  if (!departed.length) return '';
  return `<p class="hint pick-h">Ya no forman parte del grupo</p><div class="stack">${departed.map(d =>
    `<div class="card mini"><strong>${esc(d.person.name)}</strong><span class="meta">${esc(M.groupName(d.groupId))} — desde ${fmtShort(d.leftAt)}</span></div>`
  ).join('')}</div>`;
}

// ───────────── Selector de encargados: grupos y personas con casillas ─────────────
// Se despliega al tocarlo; el valor elegido queda en un campo oculto (id = key) como nombres separados por coma.
function pickerHtml(key, selected = [], { placeholder = 'Elegir encargados', single = false } = {}) {
  const sel = selected.map(norm);
  const meName = M.profile().myName || data.people.find(p => p.isMe)?.name || '';
  const box = (name, sub = '') => `<label class="check pp-opt" data-q="${esc(norm(name + ' ' + sub))}"><input type="${single ? 'radio' : 'checkbox'}" name="pp-${key}" value="${esc(name)}" ${sel.includes(norm(name)) ? 'checked' : ''}> <span>${esc(name)}${sub ? ` <span class="hint">${esc(sub)}</span>` : ''}</span></label>`;
  const groups = sortedGroups();
  const people = sortedPeople().filter(p => !p.isMe);
  const known = new Set([meName, ...groups.map(g => g.name), ...people.map(p => p.name)].map(norm));
  const others = selected.filter(n => !known.has(norm(n)));
  return `<details class="pp" data-pp="${key}">
    <summary>${pickerSummary(selected, placeholder)}</summary>
    <div class="pp-body">
      ${groups.length + people.length > 8 ? '<input class="pp-q" type="search" placeholder="Buscar" aria-label="Buscar">' : ''}
      <div class="checklist">
        ${single ? `<label class="check pp-opt" data-q=""><input type="radio" name="pp-${key}" value="" ${!selected.length ? 'checked' : ''}> <span class="hint">Sin asignar</span></label>` : ''}
        ${meName ? box(meName, 'Yo') : ''}
        ${groups.length ? `<p class="pp-h">Grupos</p>${groups.map(g => box(g.name, `${data.people.filter(p => (p.groupIds || []).includes(g.id)).length} personas`)).join('')}` : ''}
        ${people.length ? `<p class="pp-h">Personas</p>${people.map(p => box(p.name, (p.privileges || [])[0] || p.role || '')).join('')}` : ''}
      </div>
      <input class="pp-other" maxlength="120" value="${esc(others.join(', '))}" placeholder="Otro que no está en tu lista" aria-label="Otro encargado">
    </div>
    <input type="hidden" id="${key}" value="${esc(selected.join(', '))}">
  </details>`;
}
const pickerSummary = (names, placeholder) => names.length
  ? `<span class="pp-chips">${names.map(n => `<span class="chip static">${esc(n)}</span>`).join('')}</span>`
  : `<span class="hint">${esc(placeholder)}</span>`;

// Al marcar o escribir, actualiza el valor y el resumen del selector
export function pickerChanged(el) {
  const pp = el.closest('[data-pp]');
  if (!pp) return;
  const key = pp.dataset.pp;
  const names = [...pp.querySelectorAll(`input[name="pp-${key}"]:checked`)].map(x => x.value).filter(Boolean);
  const other = String(pp.querySelector('.pp-other')?.value || '').split(',').map(x => x.trim()).filter(Boolean);
  const all = [...new Set([...names, ...other])];
  pp.querySelector(`#${key}`).value = all.join(', ');
  pp.querySelector('summary').innerHTML = pickerSummary(all, pp.dataset.ph || 'Elegir encargados');
}
export function pickerFilter(el) {
  const q = norm(el.value);
  el.closest('[data-pp]')?.querySelectorAll('.pp-opt').forEach(o => { o.hidden = !!q && !o.dataset.q.includes(q); });
}
const setPicker = (key, names, opts) => { const pp = document.querySelector(`[data-pp="${key}"]`); if (pp) pp.outerHTML = pickerHtml(key, names, opts); };

// ───────────── Agenda de la reunión (puntos a tratar) ─────────────
let agendaDraft = [];
let agendaEditIdx = -1;
let agendaMax = 0;   // duración máxima de la reunión en minutos (0 = sin límite)
let agendaPrayers = { start: '', end: '' };   // quién hace la oración inicial y la final
let agendaShowTimes = false;                  // incluir la hora de cada punto en el mensaje
let agendaDeadline = 'auto';                  // fecha tope para recibir puntos: 'auto' (día antes), '' (ninguna) o AAAA-MM-DD
let agendaMode = '';                          // '' | 'pending' (temas anteriores) | 'merge' (unir) | 'assign' (asignar)
let agendaPick = new Set();                   // puntos marcados para unir

const minOptions = sel => [2, 3, 5, 10, 15, 20, 30, 45, 60].map(n => `<option value="${n}" ${n === sel ? 'selected' : ''}>${n} min</option>`).join('');

// Panel de temas anteriores: elegir cuáles y traerlos resumidos en un punto o uno por uno
function pendingPanelHtml(pend) {
  return `<div class="ag-panel">
    <p><b>Temas de reuniones anteriores</b></p>
    <div class="checklist">${pend.map(t => `<label class="check"><input type="checkbox" name="agPend" value="${t.id}" checked> <span>${esc(t.title)}${(t.responsibles || []).length ? ` <span class="hint">${esc(A.joinNames(t.responsibles))}</span>` : ''}</span></label>`).join('')}</div>
    <div class="seg four" role="radiogroup" aria-label="Cómo traerlos">
      <label><input type="radio" name="agPendMode" value="one" checked><span>Resumidos en un punto</span></label>
      <label><input type="radio" name="agPendMode" value="each"><span>Uno por uno</span></label>
    </div>
    <input id="ag-pend-t" maxlength="120" value="Seguimiento de acuerdos de la reunión anterior" aria-label="Título del punto" placeholder="Ej. Seguimiento: visitas a los precursores">
    <div class="two">
      <select id="ag-pend-kind" aria-label="Tipo"><option value="seguimiento">Seguimiento</option><option value="informar">Informativo</option></select>
      <select id="ag-pend-min" aria-label="Minutos">${minOptions(5)}</select>
    </div>
    <label class="check"><input type="checkbox" id="ag-pend-subs"> Nombrar cada tema como subpunto <span class="hint">(si no, queda general)</span></label>
    <div class="quick"><button type="button" class="btn primary small" data-a="ag-pend-add">Agregar</button><button type="button" class="btn ghost small" data-a="ag-mode" data-v="">Cancelar</button></div>
  </div>`;
}

// Panel para asignar de una vez: oraciones y quién presenta cada punto (con su referencia)
function assignPanelHtml() {
  return `<div class="ag-panel">
    <p><b>Asignar</b> <span class="hint">· toca cada campo para marcar grupos o personas</span></p>
    <div class="ag-prayers">
      <div class="mini-f"><span>Oración inicial</span>${pickerHtml('ag-pr-start', A.splitNames(agendaPrayers.start), { placeholder: 'Elegir', single: true })}</div>
      <div class="mini-f"><span>Oración final</span>${pickerHtml('ag-pr-end', A.splitNames(agendaPrayers.end), { placeholder: 'Elegir', single: true })}</div>
    </div>
    ${A.sortByBlock(agendaDraft).map(x => `<div class="ag-assign">
      <strong>${x.conf ? '🔒 ' : ''}${esc(x.t)}</strong>
      <div class="two">
        ${pickerHtml(`asg-${x.id}`, A.splitNames(x.by), { placeholder: 'Lo presenta(n)' })}
        <input data-assign-ref="${x.id}" maxlength="160" value="${esc(x.ref || '')}" placeholder="Referencia" aria-label="Referencia de ${esc(x.t)}">
      </div></div>`).join('')}
    <div class="quick"><button type="button" class="btn primary small" data-a="ag-assign-save">Listo</button><button type="button" class="btn ghost small" data-a="ag-mode" data-v="">Cancelar</button></div>
  </div>`;
}

function agendaListHtml(m) {
  const pend = A.pendingFromPrevious(m || { id: '' }, agendaDraft);
  const total = A.agendaTotal(agendaDraft, true);
  const privMin = A.privateTotal(agendaDraft);
  const over = agendaMax && total > agendaMax ? total - agendaMax : 0;
  const time = document.getElementById('time')?.value || m?.time || '';
  const sch = A.schedule(agendaDraft, time, true);
  const rows = A.KIND_ORDER.map(k => {
    const idxs = agendaDraft.map((x, i) => ((x.kind || 'informar') === k ? i : -1)).filter(i => i >= 0);
    if (!idxs.length) return '';
    return `<p class="hint pick-h">${esc(A.AGENDA_KINDS[k].h)}</p><div class="mini-list">${idxs.map((i, j) => {
      const x = agendaDraft[i];
      const picking = agendaMode === 'merge';
      return `<div class="mini-row ag-row ${picking && agendaPick.has(x.id) ? 'picked' : ''}">
        ${picking ? `<label class="ag-pick"><input type="checkbox" data-a="ag-pick" data-id="${x.id}" ${agendaPick.has(x.id) ? 'checked' : ''} aria-label="Elegir ${esc(x.t)}"></label>` : ''}
        <span class="grow">${sch.items[x.id] ? `<span class="ag-time">${sch.items[x.id]}</span>` : ''}<strong>${x.conf ? '🔒 ' : ''}${esc(x.t)}</strong>
          ${(x.subs || []).length ? `<span class="ag-subs">${x.subs.map((sub, j) => `<span>${String.fromCharCode(97 + j)}) ${esc(sub)}</span>`).join('')}</span>` : ''}
          <span class="meta">${[x.by ? esc(A.joinNames(A.splitNames(x.by))) : '<i>sin asignar</i>', x.min ? `${x.min} min` : '', x.ref ? `📖 ${esc(A.formatRef(x.ref))}` : '<i>sin referencia</i>', x.notes ? 'con detalle' : ''].filter(Boolean).join(' · ')}</span>
          ${x.priv ? '<span class="tag sup">No se envía · solo en la app</span>' : (x.conf && (x.subs || []).length ? '<span class="tag sup">🔒 Los subpuntos no se envían</span>' : '')}</span>
        ${picking ? '' : `<span class="ag-btns">
          <button type="button" class="icon-btn" data-a="ag-move" data-i="${i}" data-d="-1" ${j === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
          <button type="button" class="icon-btn" data-a="ag-move" data-i="${i}" data-d="1" ${j === idxs.length - 1 ? 'disabled' : ''} aria-label="Bajar">↓</button>
          <button type="button" class="icon-btn" data-a="ag-edit" data-i="${i}" aria-label="Editar">✎</button>
          <button type="button" class="icon-btn" data-a="ag-del" data-i="${i}" aria-label="Quitar">${ic('x', 'sm')}</button>
        </span>`}</div>`;
    }).join('')}</div>`;
  }).join('');
  const tools = `<div class="ag-tools">
      ${pend.length ? `<button type="button" class="btn small ${agendaMode === 'pending' ? 'primary' : 'ghost'}" data-a="ag-mode" data-v="pending">↻ Temas anteriores (${pend.length})</button>` : ''}
      ${agendaDraft.length > 1 ? `<button type="button" class="btn small ${agendaMode === 'merge' ? 'primary' : 'ghost'}" data-a="ag-mode" data-v="merge">⇄ Unir puntos</button>` : ''}
      ${agendaDraft.length ? `<button type="button" class="btn small ${agendaMode === 'assign' ? 'primary' : 'ghost'}" data-a="ag-mode" data-v="assign">👥 Asignar</button>` : ''}
      <button type="button" class="btn small ${agendaMode === 'tpl' ? 'primary' : 'ghost'}" data-a="ag-mode" data-v="tpl">📑 Plantillas</button>
    </div>`;
  const panel = agendaMode === 'pending' && pend.length ? pendingPanelHtml(pend)
    : agendaMode === 'assign' ? assignPanelHtml()
    : agendaMode === 'tpl' ? templatesPanelHtml()
    : agendaMode === 'merge' ? `<div class="ag-panel"><p><b>Marca los puntos que quieres unir</b> <span class="hint">· el primero da el título; los demás quedan como subpuntos</span></p>
        <input id="ag-merge-t" maxlength="120" value="${esc(agendaDraft.find(x => agendaPick.has(x.id))?.t || '')}" placeholder="Título del punto unido">
        <div class="quick"><button type="button" class="btn primary small" data-a="ag-merge" ${agendaPick.size < 2 ? 'disabled' : ''}>Unir ${agendaPick.size || ''} ${agendaPick.size === 1 ? 'punto' : 'puntos'}</button><button type="button" class="btn ghost small" data-a="ag-mode" data-v="">Cancelar</button></div></div>` : '';
  const prayersLine = `Oraciones: ${agendaPrayers.start ? esc(agendaPrayers.start) : '<i>inicial sin asignar</i>'} / ${agendaPrayers.end ? esc(agendaPrayers.end) : '<i>final sin asignar</i>'}`;
  const totalSeg = sch.segments.reduce((a, g) => a + g.min, 0) || 1;
  const bar = agendaDraft.some(x => !x.priv) ? `<div class="ag-bar" aria-hidden="true">${sch.segments.map(g => `<i style="flex:${g.min};background:${g.kind === 'oracion' ? 'var(--line)' : A.KIND_COLORS[g.kind]}" title="${esc(g.t || 'Oración')} · ${g.min} min"></i>`).join('')}${agendaMax && agendaMax > totalSeg ? `<i style="flex:${agendaMax - totalSeg}" class="free"></i>` : ''}</div>
    <div class="ag-legend">${A.KIND_ORDER.filter(k => agendaDraft.some(x => !x.priv && (x.kind || 'informar') === k)).map(k => `<span><i style="background:${A.KIND_COLORS[k]}"></i>${esc(A.AGENDA_KINDS[k].n)}</span>`).join('')}${agendaMax && agendaMax > totalSeg ? '<span><i class="free"></i>Libre</span>' : ''}</div>` : '';
  return `${tools}${panel}${bar}
    ${rows || '<p class="hint">Agrega los puntos que te enviaron y los tuyos. La app los ordena por bloques: seguimiento, para decidir, informativos y asignaciones.</p>'}
    ${agendaDraft.length ? `<div class="ag-foot ${over ? 'over' : ''}"><span><b>${agendaDraft.length}</b> ${agendaDraft.length === 1 ? 'punto' : 'puntos'} · <b>${A.fmtMin(total)}</b> con las 2 oraciones${time && total ? ` · termina ≈ ${A.endTime(time, total)}` : ''}</span>
      <label class="ag-max">Duración máxima <select id="ag-max" aria-label="Duración máxima">${A.MAX_OPTIONS.map(n => `<option value="${n}" ${n === agendaMax ? 'selected' : ''}>${n ? A.fmtMin(n) : 'Sin límite'}</option>`).join('')}</select></label>
      ${over ? `<span class="ag-warn">Te pasas por ${A.fmtMin(over)}: acorta algún punto o déjalo para otra reunión.</span>` : (agendaMax ? `<span>Quedan ${A.fmtMin(agendaMax - total)} libres.</span>` : '')}
      ${privMin ? `<span class="hint">Además, ${A.fmtMin(privMin)} en puntos que no se envían.</span>` : ''}
      <span class="ag-pr">${prayersLine}</span>
      ${time ? `<label class="check ag-times"><input type="checkbox" id="ag-show-times" ${agendaShowTimes ? 'checked' : ''}> Incluir en el mensaje la hora de cada punto</label>` : ''}
      <label class="ag-max">Recibir puntos hasta
        <span class="ag-dl"><input type="date" id="ag-deadline" value="${esc(agendaDeadline === 'auto' ? A.deadlineOf({ date: document.getElementById('date')?.value || m?.date || '' }) : agendaDeadline)}" aria-label="Fecha tope para recibir puntos">
        ${agendaDeadline !== '' ? '<button type="button" class="link sm" data-a="ag-deadline-off">Quitar</button>' : ''}</span></label>
      <span class="quick"><button type="button" class="btn small primary" data-a="ag-share">Enviar agenda</button><button type="button" class="btn small" data-a="junta-start">▶ Modo junta</button><button type="button" class="btn small" data-a="ag-to-notes">Pasar a acuerdos</button></span></div>` : ''}`;
}

function agendaEditorHtml() {
  return `<details class="ag-editor" id="ag-editor"><summary id="ag-sum">+ Agregar punto</summary>
    <div class="ag-fields">
      <input id="ag-t" maxlength="120" placeholder="Punto a tratar (ej. Situación de los precursores)" aria-label="Punto a tratar">
      <div class="two ag-min-row"><span class="lbl">Minutos</span>
        <select id="ag-min" aria-label="Minutos">${[2, 3, 5, 10, 15, 20, 30, 45, 60].map(n => `<option value="${n}" ${n === 5 ? 'selected' : ''}>${n} min</option>`).join('')}</select>
      </div>
      <div class="f"><span class="lbl">Lo presenta(n)</span>${pickerHtml('ag-by', [])}</div>
      <div class="seg four" role="radiogroup" aria-label="Qué se espera">${A.KIND_ORDER.map(k => `<label><input type="radio" name="agKind" value="${k}" ${k === 'decidir' ? 'checked' : ''}><span>${esc(A.AGENDA_KINDS[k].n)}</span></label>`).join('')}</div>
      <input id="ag-ref" maxlength="160" placeholder="Referencia (ej. Sfg cap. 1, párrs. 4-6)" aria-label="Referencia">
      <textarea id="ag-subs" rows="2" placeholder="Subpuntos, uno por línea (ej. Auxiliar de La Atalaya)" aria-label="Subpuntos"></textarea>
      <label class="check"><input type="checkbox" id="ag-conf"> Confidencial <span class="hint">(al enviar solo salen el título, quién lo presenta y la referencia; los subpuntos no)</span></label>
      <label class="check"><input type="checkbox" id="ag-priv"> No incluir en la agenda que se envía <span class="hint">(queda solo en la app)</span></label>
      <textarea id="ag-notes" rows="2" placeholder="Detalle para ti (no se envía)" aria-label="Detalle"></textarea>
      <div class="quick"><button type="button" class="btn primary" id="ag-save" data-a="ag-add">Agregar punto</button><button type="button" class="btn ghost" data-a="ag-cancel">Cancelar</button></div>
    </div></details>
    <details class="ag-editor" id="ag-paste"><summary>⇣ Pegar varios puntos</summary>
      <div class="ag-fields">
        <p class="hint">Un punto por línea. Los subpuntos van debajo, con sangría o guion. Al final puedes poner entre corchetes el tipo y los minutos: <b>[decidir 30]</b>, <b>[informativo 10]</b>, <b>[privado 5]</b>.</p>
        <textarea id="ag-paste-text" rows="6" placeholder="Organigrama de la congregación [decidir 30]&#10;  - Auxiliar de La Atalaya&#10;Atención a los inactivos [decidir 20]"></textarea>
        <div class="quick"><button type="button" class="btn primary" data-a="ag-paste">Agregar puntos</button></div>
      </div></details>`;
}

export const refreshAgendaBox = () => refreshAgenda();

function refreshAgenda() {
  const form = document.getElementById('f');
  const box = document.getElementById('agenda-box');
  const hidden = document.getElementById('agenda');
  if (hidden) hidden.value = JSON.stringify(agendaDraft);
  if (box) box.innerHTML = agendaListHtml(form?.dataset.id ? store.get('meetings', form.dataset.id) : null);
}

export function agendaAdd() {
  const t = document.getElementById('ag-t');
  let title = (t?.value || '').trim();
  if (!title) { t?.focus(); return; }
  // Si se escribió «[decidir 10]» al final del título (como al pegar), se usa como tipo y minutos y se quita del título
  const tag = A.parsePasted(title)[0];
  if (tag && tag.t !== title) {
    title = tag.t;
    const k = document.querySelector(`input[name="agKind"][value="${tag.kind}"]`); if (k) k.checked = true;
    const min = document.getElementById('ag-min'); if (min && [...min.options].some(o => Number(o.value) === tag.min)) min.value = String(tag.min);
    if (tag.priv) document.getElementById('ag-priv').checked = true;
    if (tag.conf) document.getElementById('ag-conf').checked = true;
  }
  const item = {
    t: title, by: (document.getElementById('ag-by').value || '').trim(),
    min: Number(document.getElementById('ag-min').value) || 0,
    kind: document.querySelector('input[name="agKind"]:checked')?.value || 'informar',
    conf: document.getElementById('ag-conf').checked,
    priv: document.getElementById('ag-priv').checked,
    ref: A.formatRef(document.getElementById('ag-ref').value || ''),
    subs: String(document.getElementById('ag-subs').value || '').split(/\n/).map(x => x.replace(/^\s*([-•*]|[a-z]\))\s*/i, '').trim()).filter(Boolean),
    notes: (document.getElementById('ag-notes').value || '').trim(),
  };
  if (agendaEditIdx >= 0 && agendaDraft[agendaEditIdx]) agendaDraft[agendaEditIdx] = { ...agendaDraft[agendaEditIdx], ...item };
  else agendaDraft.push({ id: 'ag' + uid().slice(0, 10), ...item });
  agendaCancel(true);
  refreshAgenda();
  document.getElementById('ag-t')?.focus();
}
export function agendaCancel(keepOpen = false) {
  agendaEditIdx = -1;
  ['ag-t', 'ag-notes', 'ag-ref', 'ag-subs'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  setPicker('ag-by', []);
  const min = document.getElementById('ag-min'); if (min) min.value = '5';
  ['ag-conf', 'ag-priv'].forEach(id => { const el = document.getElementById(id); if (el) el.checked = false; });
  const k = document.querySelector('input[name="agKind"][value="decidir"]'); if (k) k.checked = true;
  const save = document.getElementById('ag-save'); if (save) save.textContent = 'Agregar punto';
  const ed = document.getElementById('ag-editor'); if (ed && keepOpen !== true) ed.open = false;
}
export function agendaEdit(i) {
  const x = agendaDraft[Number(i)];
  const ed = document.getElementById('ag-editor');
  if (!x || !ed) return;
  agendaEditIdx = Number(i);
  ed.open = true;
  document.getElementById('ag-t').value = x.t;
  setPicker('ag-by', A.splitNames(x.by));
  const min = document.getElementById('ag-min');
  if (![...min.options].some(o => Number(o.value) === Number(x.min))) min.insertAdjacentHTML('beforeend', `<option value="${Number(x.min) || 0}">${Number(x.min) || 0} min</option>`);
  min.value = String(Number(x.min) || 0);
  const k = document.querySelector(`input[name="agKind"][value="${x.kind || 'informar'}"]`); if (k) k.checked = true;
  document.getElementById('ag-conf').checked = !!x.conf;
  document.getElementById('ag-priv').checked = !!x.priv;
  document.getElementById('ag-ref').value = x.ref || '';
  document.getElementById('ag-subs').value = (x.subs || []).join('\n');
  document.getElementById('ag-notes').value = x.notes || '';
  document.getElementById('ag-save').textContent = 'Guardar cambios';
  ed.scrollIntoView({ block: 'nearest' });
  document.getElementById('ag-t').focus();
}
export function agendaPaste() {
  const box = document.getElementById('ag-paste-text');
  const items = A.parsePasted(box?.value);
  if (!items.length) { box?.focus(); return; }
  agendaDraft = [...agendaDraft, ...items];
  box.value = '';
  const ed = document.getElementById('ag-paste'); if (ed) ed.open = false;
  refreshAgenda();
  toast(`${items.length} ${items.length === 1 ? 'punto agregado' : 'puntos agregados'}. Toca ✎ para ponerle referencia y responsable`);
}
export function agendaSetShowTimes(v) {
  agendaShowTimes = !!v;
  const h = document.getElementById('agendaShowTimes'); if (h) h.value = agendaShowTimes ? '1' : '';
}

export function agendaSetDeadline(v) {
  agendaDeadline = v || '';
  const h = document.getElementById('agendaDeadline'); if (h) h.value = agendaDeadline;
  refreshAgenda();
}

export function agendaSetMax(v) {
  agendaMax = Number(v) || 0;
  const hidden = document.getElementById('agendaMax'); if (hidden) hidden.value = String(agendaMax);
  refreshAgenda();
}

export function agendaDelete(i) {
  const prev = [...agendaDraft];
  agendaDraft = agendaDraft.filter((_, j) => j !== Number(i));
  if (agendaEditIdx === Number(i)) agendaCancel();
  refreshAgenda();
  toast('Punto quitado', 'Deshacer', () => { agendaDraft = prev; refreshAgenda(); });
}
// Sube o baja un punto dentro de su bloque
export function agendaMove(i, d) {
  i = Number(i); d = Number(d);
  const k = agendaDraft[i]?.kind || 'informar';
  const same = agendaDraft.map((x, j) => ((x.kind || 'informar') === k ? j : -1)).filter(j => j >= 0);
  const pos = same.indexOf(i), other = same[pos + d];
  if (other === undefined) return;
  [agendaDraft[i], agendaDraft[other]] = [agendaDraft[other], agendaDraft[i]];
  refreshAgenda();
}
export function agendaSetMode(mode) {
  agendaMode = agendaMode === mode ? '' : (mode || '');
  agendaPick = new Set();
  refreshAgenda();
  document.querySelector('.ag-panel')?.scrollIntoView({ block: 'nearest' });
}
export function agendaTogglePick(id) {
  agendaPick.has(id) ? agendaPick.delete(id) : agendaPick.add(id);
  const t = document.getElementById('ag-merge-t');
  const keepTitle = t && t.value && agendaDraft.some(x => x.t === t.value) ? null : t?.value;   // si el usuario escribió un título, se respeta
  refreshAgenda();
  if (keepTitle) document.getElementById('ag-merge-t').value = keepTitle;
}
export function agendaMerge() {
  const list = agendaDraft.filter(x => agendaPick.has(x.id));
  if (list.length < 2) return toast('Marca al menos dos puntos');
  const title = (document.getElementById('ag-merge-t')?.value || '').trim();
  const prev = agendaDraft.map(x => ({ ...x }));
  const merged = A.mergeItems(list, title);
  const firstIdx = agendaDraft.findIndex(x => x.id === list[0].id);
  agendaDraft = agendaDraft.filter((x, i) => i === firstIdx || !agendaPick.has(x.id)).map(x => (x.id === merged.id ? merged : x));
  agendaMode = ''; agendaPick = new Set();
  refreshAgenda();
  toast(`${list.length} puntos unidos en uno`, 'Deshacer', () => { agendaDraft = prev; refreshAgenda(); });
}
export function agendaPendingAdd() {
  const ids = [...document.querySelectorAll('input[name="agPend"]:checked')].map(x => x.value);
  const tasks = ids.map(id => store.get('tasks', id)).filter(Boolean);
  if (!tasks.length) return toast('Marca al menos un tema');
  const mode = document.querySelector('input[name="agPendMode"]:checked')?.value || 'one';
  const kind = document.getElementById('ag-pend-kind')?.value || 'seguimiento';
  const min = Number(document.getElementById('ag-pend-min')?.value) || 5;
  if (mode === 'one') {
    agendaDraft.push(A.itemFromTasksMerged(tasks, { title: (document.getElementById('ag-pend-t')?.value || '').trim(), kind, min, withSubs: document.getElementById('ag-pend-subs')?.checked }));
  } else {
    agendaDraft.push(...tasks.map(t => ({ ...A.itemFromTask(t), kind })));
  }
  agendaMode = '';
  refreshAgenda();
  toast(mode === 'one' ? `${tasks.length} ${tasks.length === 1 ? 'tema resumido' : 'temas resumidos'} en un punto` : `${tasks.length} ${tasks.length === 1 ? 'tema agregado' : 'temas agregados'}`);
}
export function agendaAssignSave() {
  agendaPrayers = { start: (document.getElementById('ag-pr-start')?.value || '').trim(), end: (document.getElementById('ag-pr-end')?.value || '').trim() };
  const hp = document.getElementById('agendaPrayers'); if (hp) hp.value = JSON.stringify(agendaPrayers);
  agendaDraft = agendaDraft.map(x => ({
    ...x,
    by: (document.getElementById(`asg-${x.id}`)?.value ?? x.by ?? '').trim(),
    ref: A.formatRef(document.querySelector(`[data-assign-ref="${x.id}"]`)?.value ?? x.ref ?? ''),
  }));
  agendaMode = '';
  refreshAgenda();
  toast('Asignaciones guardadas en la agenda');
}

export function agendaPending() {
  const form = document.getElementById('f');
  const m = form?.dataset.id ? store.get('meetings', form.dataset.id) : { id: '', date: document.getElementById('date')?.value };
  const pend = A.pendingFromPrevious({ ...m, date: document.getElementById('date')?.value || m.date }, agendaDraft);
  agendaDraft = [...agendaDraft, ...pend.map(A.itemFromTask)];
  refreshAgenda();
  toast(`${pend.length} ${pend.length === 1 ? 'pendiente agregado' : 'pendientes agregados'} como seguimiento`);
}
// Reunión con lo que está escrito ahora en el formulario (aunque no se haya guardado)
function meetingFromForm() {
  const form = document.getElementById('f');
  const val = id => form?.querySelector(`#${id}`)?.value || '';
  const prev = form?.dataset.id ? store.get('meetings', form.dataset.id) : {};
  return { ...prev, title: val('title'), date: val('date'), time: val('time'), place: val('place'), notes: val('notes'), agendaMax, prayers: agendaPrayers, agendaShowTimes, agendaDeadline: agendaDeadline === 'auto' ? undefined : agendaDeadline };
}
// Comparte un texto (WhatsApp, correo…); si el teléfono no puede, lo copia o abre un correo
function shareOut(title, text) {
  if (navigator.share) navigator.share({ title, text }).catch(() => {});
  else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast('Copiado: pégalo en WhatsApp')).catch(() => { location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`; });
  else location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`;
}
// Guarda la reunión (con lo que esté escrito) y abre el modo junta a pantalla completa
export function juntaStart(id) {
  const form = document.getElementById('f');
  let mid = id;
  if (form && form.dataset.form === 'meeting') {
    if (!form.reportValidity()) return;
    mid = persistMeeting(form.dataset.id || null, formValues(form), form).id;
  }
  close();
  J.setOnClose(x => meetingSheet(x));
  J.startJunta(mid);
}

export function agendaShare() {
  const m = meetingFromForm();
  // Se anota que ya se envió (así el aviso del día antes no te lo recuerda)
  const id = document.getElementById('f')?.dataset.id;
  const saved = id && store.get('meetings', id);
  if (saved) store.upsert('meetings', { ...saved, agendaSentAt: new Date().toISOString() });
  shareOut(`Agenda — ${m.title || 'Reunión'}`, A.shareText(m, agendaDraft));
}

// ───── Plantillas de agenda (se guardan en tu perfil) ─────
function templatesPanelHtml() {
  const list = M.profile().agendaTemplates || [];
  return `<div class="ag-panel">
    <p><b>Plantillas</b> <span class="hint">· agendas que repites (por ejemplo, la junta mensual)</span></p>
    ${list.length ? `<div class="mini-list">${list.map(t => `<div class="mini-row"><span class="grow"><strong>${esc(t.name)}</strong><span class="meta">${t.items.length} ${t.items.length === 1 ? 'punto' : 'puntos'}${t.max ? ` · máx. ${A.fmtMin(t.max)}` : ''}</span></span>
        <span class="ag-btns"><button type="button" class="btn small" data-a="tpl-load" data-id="${t.id}">Cargar</button><button type="button" class="icon-btn" data-a="tpl-del" data-id="${t.id}" aria-label="Borrar plantilla">${ic('x', 'sm')}</button></span></div>`).join('')}</div>`
      : '<p class="hint">Aún no tienes plantillas.</p>'}
    ${agendaDraft.length ? `<div class="log-add"><input id="tpl-name" maxlength="60" placeholder="Nombre (ej. Junta mensual)" aria-label="Nombre de la plantilla"><button type="button" class="btn" data-a="tpl-save">Guardar esta agenda</button></div>
      <p class="hint">Se guardan los puntos, tipos, minutos, referencias y subpuntos; no los encargados ni lo que viene de tareas.</p>` : ''}
    <div class="quick"><button type="button" class="btn ghost small" data-a="ag-mode" data-v="">Cerrar</button></div>
  </div>`;
}
export function templateSave() {
  const input = document.getElementById('tpl-name');
  const name = (input?.value || '').trim();
  if (!name) { input?.focus(); return; }
  const items = agendaDraft.filter(x => !x.fromTaskId && !(x.fromTaskIds || []).length)
    .map(({ t, kind, min, ref, subs, conf, priv }) => ({ t, kind, min, ref: ref || '', subs: subs || [], conf: !!conf, priv: !!priv }));
  if (!items.length) return toast('Esta agenda solo tiene temas anteriores; agrega puntos propios');
  const list = (M.profile().agendaTemplates || []).filter(t => norm(t.name) !== norm(name));
  store.upsert('profile', { ...M.profile(), id: 'me', agendaTemplates: [...list, { id: uid(), name, items, max: agendaMax }] });
  toast(`Plantilla «${name}» guardada`);
  refreshAgenda();
}
export function templateLoad(id) {
  const t = (M.profile().agendaTemplates || []).find(x => x.id === id);
  if (!t) return;
  agendaDraft = [...agendaDraft, ...t.items.map(x => ({ ...x, id: 'ag' + uid().slice(0, 10), by: '', notes: '' }))];
  if (t.max && !agendaMax) { agendaMax = t.max; const h = document.getElementById('agendaMax'); if (h) h.value = String(agendaMax); }
  agendaMode = '';
  refreshAgenda();
  toast(`Plantilla «${t.name}» cargada: ahora usa «👥 Asignar»`);
}
export function templateDelete(id) {
  const prev = M.profile().agendaTemplates || [];
  store.upsert('profile', { ...M.profile(), id: 'me', agendaTemplates: prev.filter(x => x.id !== id) });
  toast('Plantilla borrada', 'Deshacer', () => { store.upsert('profile', { ...M.profile(), id: 'me', agendaTemplates: prev }); refreshAgenda(); });
  refreshAgenda();
}

// ───── Informe de supervisión ─────
export function supervisionSheet(meetingId = '', back = null) {
  const m = meetingId ? store.get('meetings', meetingId) : null;
  const rep = R.supervision(meetingId);
  open({
    title: 'Informe de supervisión', back,
    body: `<p class="hint">${m ? `Reunión «${esc(m.title)}» del ${fmtShort(m.date)}` : 'Abiertas de todas las reuniones y las hechas en los últimos 30 días'}</p>
      ${rep.total ? `<div class="sup-bar"><div class="goal-bar"><span class="fill"><i style="width:${rep.pct}%"></i></span></div><p><b>${rep.done}</b> de <b>${rep.total}</b> hechas · ${rep.pct} %</p></div>
      ${rep.groups.filter(g => g.rows.length).map(g => `<h3 class="sub-h">${g.e} ${esc(g.n)} <span class="hint">${g.rows.length}</span></h3>
        <div class="stack">${g.rows.map(r => `<button class="card mini sup-row ${g.id}" data-a="sup-task" data-id="${r.t.id}" data-mid="${meetingId}">
          <strong>${esc(r.t.title)}</strong>
          <span class="meta">${[r.who ? esc(r.who) : '', r.t.due && g.id !== 'done' ? `vence ${fmtShort(r.t.due)}` : '', !m && r.meeting ? esc(r.meeting.title) : ''].filter(Boolean).join(' · ')}</span>
          ${g.id === 'done' ? '' : `<span class="meta">${r.last ? `Última novedad ${fmtShort(r.last.d)}: ${esc(String(r.last.t).slice(0, 70))}` : `Sin novedades hace ${r.quiet} días`}</span>`}
        </button>`).join('')}</div>`).join('')}`
      : '<p class="hint pad">Todavía no hay tareas que hayan salido de reuniones.</p>'}`,
    actions: rep.total ? `<button type="button" class="btn ghost" data-a="sup-share" data-id="${meetingId}">Enviar</button><button type="button" class="btn primary" data-a="sheet-close">Listo</button>` : '',
  });
}
export function supervisionShare(meetingId = '') {
  const m = meetingId ? store.get('meetings', meetingId) : null;
  shareOut('Informe de supervisión', R.supervisionText(m ? m.title : 'tareas de las reuniones', R.supervision(meetingId)));
}

// ───── Participación ─────
export function participationSheet(months = 6) {
  const rep = R.participation(Number(months) || 6);
  open({
    title: 'Participación',
    body: `<div class="seg">${[3, 6, 12].map(n => `<button data-a="participation" data-v="${n}" aria-pressed="${Number(months) === n}">${n} meses</button>`).join('')}</div>
      <p class="hint">${rep.meetings} ${rep.meetings === 1 ? 'reunión' : 'reuniones'} en este período. Cuenta quién presentó puntos del orden del día y quién hizo las oraciones, para repartir mejor las asignaciones.</p>
      ${rep.list.length ? `<div class="part-table" role="table">
        <div class="part-row head" role="row"><span>Nombre</span><span>Puntos</span><span>Oraciones</span><span>Última vez</span></div>
        ${rep.list.map(e => `<div class="part-row" role="row"><span>${esc(e.name)}</span><span>${e.points}</span><span>${e.prayers}</span><span>${e.last ? fmtShort(e.last) : '—'}</span></div>`).join('')}
      </div>` : '<p class="hint pad">Aún no hay encargados asignados en las agendas de este período.</p>'}
      ${rep.absent.length ? `<h3 class="sub-h">Con privilegios y sin participar</h3><p class="hint">Tenlos en cuenta en la próxima junta.</p><div class="tagrow">${rep.absent.map(n => `<span class="chip static">${esc(n)}</span>`).join('')}</div>` : ''}`,
    actions: `<button type="button" class="btn primary" data-a="sheet-close">Listo</button>`,
  });
}
// Copia los puntos a «Acuerdos y notas» para completar qué se acordó en cada uno
export function agendaToNotes() {
  const notes = document.getElementById('notes');
  if (!notes) return;
  const lines = A.agreementLines({ notes: notes.value }, agendaDraft);
  if (!lines.length) return toast('Todos los puntos ya están en Acuerdos y notas');
  notes.value = (notes.value.trim() ? notes.value.trim() + '\n' : '') + lines.join('\n');
  refreshAgreements();
  notes.scrollIntoView({ block: 'center' });
  notes.focus();
  toast('Completa lo que se acordó en cada punto');
}

// Nueva reunión con el mismo título, hora, lugar y participantes (una semana después, o la fecha que elijas);
// los pendientes de esta aparecen luego en «↻ Temas anteriores»
export function meetingNext(id) {
  const m = store.get('meetings', id);
  if (!m) return;
  const next = store.upsert('meetings', { id: uid(), title: m.title, date: addDays(m.date > today() ? m.date : today(), 7), time: m.time || '', place: m.place || '',
    attendees: m.attendees || '', attendeeIds: m.attendeeIds || [], attendeeGroupIds: m.attendeeGroupIds || [], topics: '', notes: '', agenda: [], agendaMax: m.agendaMax || 0, prayers: {} });
  meetingSheet(next.id);
  toast('Próxima reunión creada: revisa la fecha y usa «↻ Temas anteriores»');
}

export function meetingSheet(id, back) {
  const m = id ? store.get('meetings', id) : null;
  agendaDraft = (m?.agenda || []).map(x => ({ ...x }));
  agendaEditIdx = -1;
  agendaMax = Number(m?.agendaMax) || 0;
  agendaPrayers = { start: m?.prayers?.start || '', end: m?.prayers?.end || '' };
  agendaDeadline = m && typeof m.agendaDeadline === 'string' ? m.agendaDeadline : 'auto';
  agendaShowTimes = !!m?.agendaShowTimes;
  agendaMode = ''; agendaPick = new Set();
  const v = m || { title: '', date: today(), time: '', place: '', attendees: '', topics: '', notes: '' };
  const linked = m ? data.tasks.filter(t => t.meetingId === m.id) : [];
  const linkedNotes = m ? data.notes.filter(n => n.meetingId === m.id) : [];
  open({
    title: m ? 'Editar reunión' : 'Nueva reunión', back, focus: m ? null : '#title',
    body: `${formTag('meeting', m?.id)}
      ${fld('Título', `<input id="title" name="title" required maxlength="120" value="${esc(v.title)}" placeholder="Ej. Reunión con el coordinador">`, 'title')}
      <div class="two">
        ${fld('Fecha', `<input id="date" name="date" type="date" required value="${v.date}">`, 'date')}
        ${fld('Hora', `<input id="time" name="time" type="time" value="${v.time || ''}">`, 'time')}
      </div>
      ${fld('Lugar', `<input id="place" name="place" maxlength="120" value="${esc(v.place || '')}">`, 'place')}
      <div class="f"><span class="lbl">Participantes</span>
        ${pickList('Grupos', sortedGroups(), 'attGroup', v.attendeeGroupIds || [], g => esc(g.name))}
        ${pickList('Personas', sortedPeople(), 'attPerson', v.attendeeIds || [], p => esc(p.name) + (p.role ? ` <span class="hint">${esc(p.role)}</span>` : ''))}
        <input id="attendees" name="attendees" maxlength="200" value="${esc(v.attendees || '')}" placeholder="Otros participantes (escribe los nombres)" aria-label="Otros participantes">
        ${m ? departedNotice(v.attendeeGroupIds || [], v.date) : ''}
      </div>
      <div class="f"><span class="lbl">Agenda</span>
        <div id="agenda-box">${agendaListHtml(m)}</div>
        ${agendaEditorHtml()}
        <input type="hidden" id="agenda" name="agenda" value="${esc(JSON.stringify(agendaDraft))}">
        <input type="hidden" id="agendaMax" name="agendaMax" value="${agendaMax}">
        <input type="hidden" id="agendaShowTimes" name="agendaShowTimes" value="${agendaShowTimes ? '1' : ''}">
        <input type="hidden" id="agendaDeadline" name="agendaDeadline" value="${esc(agendaDeadline)}">
        <input type="hidden" id="agendaPrayers" name="agendaPrayers" value="${esc(JSON.stringify(agendaPrayers))}">
      </div>
      ${fld('Otros temas <span class="hint">(texto libre)</span>', `<textarea id="topics" name="topics" rows="3">${esc(v.topics || '')}</textarea>`, 'topics')}
      ${fld('Acuerdos y notas', `<textarea id="notes" name="notes" rows="6" data-agreements="1" placeholder="Un acuerdo por línea, empezando con un guion:&#10;- Juan visitará a la familia Pérez el viernes&#10;- Revisar el territorio antes del 15/10">${esc(v.notes || '')}</textarea>`, 'notes')}
    </form>
    ${m ? `<section id="agree-box">${agreementsHtml(m)}</section>` : ''}
    ${m ? `<section><h3 class="sub-h">Tareas de esta reunión</h3>
      ${linked.length ? `<div class="stack">${linked.map(t => `<button class="card mini" data-a="task-in-sheet" data-id="${t.id}" data-bk="meeting" data-bid="${m.id}"><strong>${esc(t.title)}</strong><span class="meta">${esc(M.STATUS[t.status] || '')}</span></button>`).join('')}</div>` : '<p class="hint">Todavía no hay tareas.</p>'}
      <button type="button" class="btn pad-top" data-a="task-from-meeting" data-id="${m.id}">Crear tarea de esta reunión</button>
      ${linked.length ? `<button type="button" class="btn pad-top" data-a="supervision" data-id="${m.id}">📋 Informe de supervisión</button>` : ''}
      <button type="button" class="btn ghost pad-top" data-a="meeting-next" data-id="${m.id}">Preparar la próxima reunión a partir de esta</button></section>
      <section><h3 class="sub-h">Notas de la agenda vinculadas</h3>
      ${linkedNotes.length ? `<div class="stack">${linkedNotes.map(n => `<button class="card mini" data-a="note-in-sheet" data-id="${n.id}" data-bk="meeting" data-bid="${m.id}"><strong>${esc(n.title || 'Sin título')}</strong><span class="meta">${M.noteDate(n) ? fmtShort(M.noteDate(n)) : ''}</span></button>`).join('')}</div>` : '<p class="hint">Ninguna nota vinculada todavía.</p>'}</section>` : ''}`,
    actions: foot('meetings', m?.id),
  });
}

// Acuerdos detectados en «Acuerdos y notas», con un botón para convertir cada uno en tarea
function agreementsHtml(m) {
  const list = M.parseAgreements(m);
  if (!list.length) return `<h3 class="sub-h">Acuerdos</h3><p class="hint">Escribe cada acuerdo en su propia línea (por ejemplo «Ana: los hermanos Pedro y Juan hablarán con ella») y aquí podrás convertirlo en tarea con un toque.</p>`;
  const pending = list.filter(a => !a.task).length;
  const noMe = !M.myNames().length;
  return `<h3 class="sub-h">${list.length === 1 ? 'Encontré 1 acuerdo' : `Encontré ${list.length} acuerdos`}${pending && pending < list.length ? ` · ${pending} sin tarea` : ''}</h3>
    ${noMe ? `<p class="hint pad">Para saber cuáles te tocan a ti, escribe tu nombre en ${M.isModuleVisible('informe') ? '<button class="link" data-a="profile">Mi perfil</button>' : 'Mi perfil'}.</p>` : ''}
    <div class="stack">${list.map((a, i) => `<div class="card mini agree ${a.task ? 'has-task' : ''}">
      <span class="grow"><strong>${esc(a.title)}</strong>
        <span class="meta">
          ${a.subjectName ? `<span class="nw">${ic('users', 'sm')}${esc(a.subjectName)}</span>${a.subjectKnown ? '' : `<button type="button" class="link sm" data-a="agree-person" data-name="${esc(a.subjectName)}">Agregar a Personas</button>`}` : ''}
          ${a.due ? `<span class="nw">${ic('calendar', 'sm')}${fmtShort(a.due)}</span>` : ''}
        </span>
        ${a.responsibles.length ? `<span class="meta">Responsables: ${esc(a.responsibles.join(', '))}</span>` : ''}
        <span class="tag ${a.mine ? 'mine' : 'sup'}">${a.mine ? '👉 Te toca a ti' : '👁 Supervisas'}</span>
      </span>
      ${a.task
        ? `<button type="button" class="btn small ghost" data-a="task-in-sheet" data-id="${a.task.id}" data-bk="meeting" data-bid="${m.id}">✓ Ver tarea</button>`
        : `<button type="button" class="btn small" data-a="agree-task" data-id="${m.id}" data-i="${i}">Crear tarea</button>`}
    </div>`).join('')}</div>`;
}

// Guarda en Personas a alguien mencionado en un acuerdo, sin salir de la reunión
export function agreementPerson(name) {
  if (!name || data.people.some(p => norm(p.name) === norm(name))) return;
  store.upsert('people', { id: uid(), name, role: '', phone: '', address: '', notes: '', groupIds: [] });
  toast(`${name} se agregó a Personas`);
  refreshAgreements();
}

// Al escribir en «Acuerdos y notas», la lista de acuerdos se actualiza sola
export function refreshAgreements() {
  const form = document.getElementById('f');
  const box = document.getElementById('agree-box');
  if (!form || !box || form.dataset.form !== 'meeting' || !form.dataset.id) return;
  const m = store.get('meetings', form.dataset.id);
  if (m) box.innerHTML = agreementsHtml({ ...m, notes: form.querySelector('#notes')?.value || '', date: form.querySelector('#date')?.value || m.date });
}

// Crea la tarea de un acuerdo: primero guarda la reunión (para no perder lo escrito) y abre la tarea ya llena para revisarla
export function agreementTask(meetingId, i) {
  const form = document.getElementById('f');
  if (form && form.dataset.form === 'meeting' && form.dataset.id === meetingId) {
    if (!form.reportValidity()) return;
    persistMeeting(meetingId, formValues(form), form);
  }
  const m = store.get('meetings', meetingId);
  const a = m && M.parseAgreements(m)[Number(i)];
  if (!a) return;
  const notes = [a.text, a.responsibles.length ? `Responsables: ${a.responsibles.join(', ')}` : ''].filter(Boolean).join('\n\n');
  taskSheet(null, { title: a.title, personId: a.personId, due: a.due, kind: a.kind, notes, meetingId, fromAgreement: a.key, responsibles: a.responsibles, mine: a.mine, subjectName: a.subjectKnown ? '' : a.subjectName }, () => meetingSheet(meetingId));
}

const parseJSON = (str, fallback) => { try { const v = JSON.parse(str); return Array.isArray(v) ? v : fallback; } catch { return fallback; } };

function persistMeeting(id, r, form) {
  const prev = id ? store.get('meetings', id) : {};
  return store.upsert('meetings', { ...prev, id: id || uid(), title: r.title, date: r.date, time: r.time, place: r.place, attendees: r.attendees, attendeeIds: new FormData(form).getAll('attPerson'), attendeeGroupIds: new FormData(form).getAll('attGroup'), topics: r.topics, notes: r.notes, agenda: parseJSON(r.agenda, prev.agenda || []), agendaMax: Number(r.agendaMax) || 0, agendaShowTimes: !!r.agendaShowTimes, ...(r.agendaDeadline === 'auto' ? {} : { agendaDeadline: r.agendaDeadline || '' }), prayers: (() => { try { return JSON.parse(r.agendaPrayers || '{}'); } catch { return prev.prayers || {}; } })() });
}

function saveMeeting(id, r, form) {
  const saved = persistMeeting(id, r, form);
  // Una reunión nueva con acuerdos se queda abierta para poder convertirlos en tareas
  if (!id && M.parseAgreements(saved).length) { meetingSheet(saved.id, backFn); toast('Reunión guardada. Ya puedes crear las tareas de sus acuerdos'); return; }
  closeOrBack();
}

// ───────────── Agregar rápido (botón + en Hoy) ─────────────

export function quickAdd() {
  const items = [
    ['event', 'calendar', 'Evento', 'Reunión, predicación, pastoreo'],
    ['task', 'tasks', 'Tarea', 'Visita, capacitación o seguimiento'],
    ['person', 'users', 'Persona', 'Alguien a quien acompañas'],
    ['group', 'users', 'Grupo', 'Reúne personas por rol o responsabilidad'],
    ['note', 'notebook', 'Nota', 'Ideas, apuntes y recordatorios'],
    ['meeting', 'clip', 'Reunión importante', 'Temas, acuerdos y pendientes'],
  ];
  open({
    title: '¿Qué quieres agregar?',
    body: `<div class="qa">${items.map(([k, i, n, d]) => `<button data-a="quick" data-v="${k}">${ic(i)}<span><strong>${n}</strong><span class="meta">${d}</span></span></button>`).join('')}</div>`,
  });
}

// ───────────── Importar de Google Keep ─────────────

let keepPending = null;

export function keepSheet() {
  keepPending = null;
  open({
    title: 'Importar de Google Keep',
    body: `<ol class="steps">
        <li>Entra a <b>takeout.google.com</b> y deja marcada solo la opción <b>Keep</b>.</li>
        <li>Elige el formato <b>.zip</b>, crea la exportación y descarga el archivo.</li>
        <li>Aquí abajo elige ese .zip (o los archivos .json de tus notas).</li>
      </ol>
      <label class="btn primary file pad-top">Elegir archivo<input type="file" id="keep-file" accept=".zip,.json,application/zip,application/json" multiple hidden></label>
      <div id="keep-result"></div>
      <p class="hint pad">Las notas de la papelera y las imágenes adjuntas no se importan. Si importas dos veces, no se duplican. Con un .zip muy grande es mejor hacerlo desde la computadora.</p>`,
  });
}

export async function keepFiles(files) {
  const box = document.getElementById('keep-result');
  if (!box) return;
  box.innerHTML = '<p class="hint pad">Leyendo…</p>';
  try {
    const { notes, skipped } = await readKeep(files);
    if (!notes.length) { box.innerHTML = '<p class="err pad">No encontré notas de Keep en ese archivo.</p>'; keepPending = null; return; }
    keepPending = notes.filter(n => !store.get('notes', n.id));
    const already = notes.length - keepPending.length;
    const pl = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
    const extra = [
      already ? pl(already, 'ya estaba importada', 'ya estaban importadas') : '',
      skipped.trashed ? pl(skipped.trashed, 'en la papelera se omite', 'en la papelera se omiten') : '',
      skipped.attachments ? pl(skipped.attachments, 'tenía imágenes o adjuntos que no se importan', 'tenían imágenes o adjuntos que no se importan') : '',
    ].filter(Boolean).join('; ');
    box.innerHTML = `<p class="pad"><b>${notes.length}</b> ${notes.length === 1 ? 'nota encontrada' : 'notas encontradas'}${extra ? `. ${extra}.` : '.'}</p>
      ${keepPending.length ? `<button class="btn primary pad-top" data-a="keep-import">Importar ${keepPending.length} ${keepPending.length === 1 ? 'nota' : 'notas'}</button>` : '<p class="hint pad">No hay notas nuevas por importar.</p>'}`;
  } catch (e) {
    console.error(e);
    keepPending = null;
    box.innerHTML = '<p class="err pad">No se pudo leer el archivo. Verifica que sea el .zip de Google Takeout.</p>';
  }
}

export function keepImport() {
  const list = keepPending || [];
  list.forEach(n => store.restore('notes', n));   // se guardan tal cual, con sus fechas originales
  keepPending = null;
  close();
  toast(`${list.length} ${list.length === 1 ? 'nota importada' : 'notas importadas'}`);
}

// ───────────── Búsqueda global ─────────────

export function searchSheet() {
  open({
    title: 'Buscar', focus: '#gsearch',
    body: `<div class="search">${ic('search')}<input id="gsearch" type="search" placeholder="Buscar en eventos, tareas, personas, notas y reuniones" autocomplete="off" aria-label="Buscar en toda la app"></div>
      <div id="gresults">${renderSearchResults('')}</div>`,
  });
}

export function renderSearchResults(q) {
  if (!q || !q.trim()) return '<p class="hint pad">Escribe para buscar en toda la app.</p>';
  const r = M.globalSearch(q);
  const total = r.events.length + r.tasks.length + r.people.length + r.notes.length + r.meetings.length;
  if (!total) return `<p class="hint pad">Sin resultados para «${esc(q)}».</p>`;
  const section = (title, items, row) => items.length
    ? `<h3 class="sub-h">${title}</h3><div class="stack">${items.map(row).join('')}</div>` : '';
  return `
    ${section('Eventos', r.events, e => `<button class="card mini" data-a="event" data-id="${e.id}"><strong>${esc(e.title)}</strong><span class="meta">${fmtShort(e.date)}${e.place ? ` · ${esc(e.place)}` : ''}</span></button>`)}
    ${section('Tareas', r.tasks, t => `<button class="card mini" data-a="task" data-id="${t.id}"><strong>${esc(t.title)}</strong><span class="meta">${esc(M.STATUS[t.status] || '')}</span></button>`)}
    ${section('Personas', r.people, p => `<button class="card mini" data-a="person" data-id="${p.id}"><strong>${esc(p.name)}</strong>${p.role ? `<span class="meta">${esc(p.role)}</span>` : ''}</button>`)}
    ${section('Notas', r.notes, n => `<button class="card mini" data-a="note" data-id="${n.id}"><strong>${esc(n.title || 'Sin título')}</strong>${M.noteDate(n) ? `<span class="meta">${fmtShort(M.noteDate(n))}</span>` : ''}</button>`)}
    ${section('Reuniones', r.meetings, m => `<button class="card mini" data-a="meeting" data-id="${m.id}"><strong>${esc(m.title)}</strong><span class="meta">${fmtShort(m.date)}</span></button>`)}`;
}

// ───────────── Ajustes ─────────────

// ───────────── Ajustes: menú por temas; cada tema abre su propia pantalla ─────────────
let setSec = '';   // tema abierto ('' = el menú)
const SETTINGS_SECS = [
  { id: 'perfil', ic: '👤', n: 'Mi perfil', d: 'Tu nombre, foto y cuenta', k: 'nombre foto cuenta sesión correo perfil tipo meta' },
  { id: 'apariencia', ic: '🎨', n: 'Apariencia', d: 'Tema claro u oscuro, color y tamaño de letra', k: 'tema oscuro claro color letra tamaño' },
  { id: 'avisos', ic: '🔔', n: 'Avisos', d: 'Notificaciones en este teléfono', k: 'avisos notificaciones recordatorios prueba hora racha' },
  { id: 'privacidad', ic: '🔒', n: 'Privacidad', d: 'PIN y huella', k: 'pin huella bloqueo privacidad cara' },
  { id: 'medida', ic: '🧩', n: 'La app a mi medida', d: 'Secciones, accesos rápidos y tipos propios', k: 'secciones accesos rápidos tipos ocultar módulos compartidos' },
  { id: 'datos', ic: '💾', n: 'Mis datos', d: 'Respaldo, restaurar e importar', k: 'respaldo restaurar importar keep exportar datos cerrar sesión' },
  { id: 'ayuda', ic: '❓', n: 'Ayuda', d: 'Guía, recorrido e instalar en el teléfono', k: 'ayuda guía recorrido instalar' },
  { id: 'admin', ic: '🛡️', n: 'Administración', d: 'Aprobar cuentas y tipos de perfil', k: 'administrar usuarios cuentas aprobar', admin: true },
];

export function settings(sec) {
  if (sec !== undefined) setSec = sec;
  if (setSec) return settingsSection(setSec);
  const list = SETTINGS_SECS.filter(x => !x.admin || session.isAdmin);
  open({
    title: 'Ajustes',
    body: `<input id="set-q" class="set-search" type="search" placeholder="¿Qué quieres cambiar? (ej. avisos, color, PIN)" aria-label="Buscar en ajustes" autocomplete="off">
      <div class="set-menu">${list.map(x => `<button type="button" class="set-item" data-a="set-sec" data-v="${x.id}" data-k="${esc(norm(x.n + ' ' + x.d + ' ' + x.k))}">
        <span class="set-ic" aria-hidden="true">${x.ic}</span><span class="grow"><strong>${esc(x.n)}</strong><span class="meta">${esc(x.d)}</span></span>${ic('right', 'sm')}</button>`).join('')}</div>
      <p class="hint set-none" hidden>No encontré ese ajuste. Prueba con otra palabra.</p>
      <p class="hint pad">${isCloud ? `Sesión: <b>${esc(account.user?.email || '')}</b> · ` : 'Modo local · '}Versión ${M.APP_VERSION}</p>`,
  });
}
export function settingsFilter(q) {
  const n = norm(q || '');
  let shown = 0;
  document.querySelectorAll('.set-item').forEach(b => { const ok = !n || b.dataset.k.includes(n); b.hidden = !ok; if (ok) shown++; });
  const none = document.querySelector('.set-none'); if (none) none.hidden = !!shown;
}
const settingsMenu = () => { setSec = ''; settings(); };

function settingsSection(id) {
  const sec = SETTINGS_SECS.find(x => x.id === id);
  if (!sec) { setSec = ''; return settings(); }
  const body = {
    perfil: () => `<p>${isCloud ? `Sesión iniciada como <b>${esc(account.user?.email || '')}</b>.` : 'Modo local: los datos están solo en este teléfono.'}</p>
      ${isCloud && M.PROFILE_TYPES[session.type] ? `<p class="hint">Tipo de perfil: <b>${esc(M.PROFILE_TYPES[session.type].n)}</b> (lo asigna el administrador).</p>` : ''}
      ${M.profile().myName ? `<p class="hint">Tu nombre: <b>${esc(M.profile().myName)}</b></p>` : '<p class="hint warn">Aún no escribiste tu nombre: así otros te encuentran al compartir y la app sabe qué tareas te tocan.</p>'}
      <div class="stack pad"><button class="btn primary" data-a="profile">Editar mi perfil</button>
      ${isCloud ? '<button class="btn ghost danger" data-a="signout">Cerrar sesión</button>' : ''}</div>
      ${isCloud ? '' : '<p class="hint pad">Para sincronizar entre dispositivos, pega tu configuración de Firebase en <code>js/config.js</code>. Todo lo que guardes ahora se puede pasar después con «Restaurar respaldo».</p>'}`,
    apariencia: () => {
      const t = Theme.pref();
      return `<p class="hint pick-h">Tema</p>
      <div class="seg">${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([k, n]) => `<button data-a="theme-set" data-v="${k}" aria-pressed="${t === k}">${n}</button>`).join('')}</div>
      <p class="hint pick-h">Color de la app</p>
      <div class="swatches" role="radiogroup" aria-label="Color de la app">${Theme.ACCENTS.map(x => `<button type="button" class="swatch" data-a="accent-set" data-v="${x.id}" style="--sw:${x.c}" aria-pressed="${Theme.accent() === x.id}" aria-label="${esc(x.n)}"><i></i><span>${esc(x.n)}</span></button>`).join('')}</div>
      <p class="hint pick-h">Tamaño de letra</p>
      <div class="seg">${Theme.SIZES.map(x => `<button data-a="size-set" data-v="${x.id}" aria-pressed="${Theme.size() === x.id}">${esc(x.n)}</button>`).join('')}</div>
      <p class="hint pad">El color de cada evento se elige dentro del evento.</p>`;
    },
    avisos: () => notifSettingsHtml(),
    privacidad: () => Lock.isEnabled()
      ? `<p class="hint">La app pide tu PIN al abrirla${Lock.delay() ? ` y al volver después de ${Lock.delay()} min` : ' y cada vez que vuelves a ella'}.</p>
         <div class="stack pad"><label class="mini-f"><span>Pedir el PIN al volver después de</span><select id="pin-delay">${[0, 1, 5, 15, 30].map(n => `<option value="${n}" ${n === Lock.delay() ? 'selected' : ''}>${n ? `${n} min` : 'Siempre'}</option>`).join('')}</select></label>
         <label class="check" id="bio-row" hidden><input type="checkbox" id="bio-toggle" ${Lock.bioEnabled() ? 'checked' : ''}> Desbloquear también con la huella</label>
         <button class="btn" data-a="pin" data-v="change">Cambiar PIN</button><button class="btn ghost danger" data-a="pin" data-v="off">Quitar el PIN</button></div>`
      : `<p class="hint">Protege lo que guardas si alguien toma tu teléfono: la app pedirá un PIN al abrirla. Después podrás usar también la huella.</p><div class="stack pad"><button class="btn" data-a="pin" data-v="on">🔒 Activar bloqueo con PIN</button></div>`,
    medida: () => `<h3 class="sub-h">Accesos rápidos</h3>
      <p class="hint">Botones que aparecen en Hoy para lo que más usas.</p>
      <div class="stack pad">${M.QUICK_ACTIONS.filter(q => !q.mod || M.isModuleVisible(q.mod)).map(q => `<label class="check"><input type="checkbox" data-a="toggle-quick" data-v="${q.id}" ${M.quickActions().some(x => x.id === q.id) ? 'checked' : ''}> ${esc(q.n)}</label>`).join('')}</div>
      <h3 class="sub-h">Secciones visibles</h3>
      <p class="hint">Apaga las que no uses; siempre puedes volver a activarlas aquí. «Hoy» siempre está disponible.</p>
      <div class="stack pad">${M.MODULES.map(m => `<label class="check"><input type="checkbox" data-a="toggle-module" data-v="${m.id}" ${M.isModuleVisible(m.id) ? 'checked' : ''}> ${esc(m.n)}</label>`).join('')}</div>
      ${typesSettingsHtml()}
      ${(M.profile().sharedHidden || []).length ? `<h3 class="sub-h">Eventos compartidos</h3><p class="hint">Quitaste ${M.profile().sharedHidden.length} de tu agenda.</p><div class="stack pad"><button class="btn" data-a="shared-unhide">Volver a mostrarlos</button></div>` : ''}`,
    datos: () => `<p class="hint">Haz un respaldo de vez en cuando: guarda una copia de todo en un archivo.</p>
      <div class="stack">
        <button class="btn primary" data-a="export">Descargar respaldo</button>
        <label class="btn file">Restaurar respaldo<input type="file" id="import-file" accept="application/json,.json" hidden></label>
        <button class="btn" data-a="keep">Importar notas de Google Keep</button>
      </div>`,
    ayuda: () => `${Nat.isNative ? `<h3 class="sub-h">App de Android</h3><p class="hint">Estás usando la app instalada${Nat.state.version ? ` (versión ${esc(Nat.state.version)})` : ''}. Las pantallas se actualizan solas; cuando haya una app nueva te aparecerá un aviso en Hoy.</p>
        <div class="stack pad"><button class="btn" data-a="apk-update">Descargar la última app</button></div>`
      : `<h3 class="sub-h">📲 App para Android</h3><p class="hint">Instala la app de Android: avisos exactos aunque no haya internet, con sus propios sonidos, y se abre como cualquier app.</p>
        <div class="stack pad"><a class="btn primary" href="${Nat.APK_URL}">Descargar la app (APK)</a></div>
        <details class="howto"><summary>Cómo instalarla</summary><ol><li>Toca <b>Descargar la app</b> desde el teléfono Android.</li><li>Abre el archivo <b>agenda-teocratica.apk</b> que se descargó. Si el teléfono lo pide, permite «Instalar apps de este origen».</li><li>Toca <b>Instalar</b> y ábrela. Entra con tu mismo correo: verás todo lo tuyo.</li><li>Las actualizaciones: cuando haya una nueva, la app te lo dice en Hoy y la instalas igual, encima de la anterior (no se borra nada).</li></ol></details>`}
      <div class="stack"><button class="btn" data-a="tour">${ic('flag', 'sm')} Recorrido por la app</button>
        <button class="btn" data-a="guide">${ic('book', 'sm')} Guía rápida</button>
        ${session.isAdmin ? '<a class="btn ghost" href="guia.html" target="_blank" rel="noopener">Guía completa para compartir</a>' : ''}</div>
      <h3 class="sub-h">Instalar en el teléfono</h3>
      <p class="hint">Android (Chrome): menú ⋮ y «Instalar app». iPhone (Safari): botón Compartir y «Añadir a pantalla de inicio».</p>
      <p class="hint pad">Versión ${M.APP_VERSION}</p>`,
    admin: () => `<p class="hint">Las cuentas nuevas aparecen como «Pendiente»: elige su tipo y se les abre la app. No ves los datos de nadie.</p><div class="stack pad"><button class="btn primary" data-a="admin">${ic('shield', 'sm')} Administrar usuarios</button></div>`,
  }[id];
  open({ title: `${sec.ic} ${sec.n}`, back: settingsMenu, body: body() });
  if (id === 'privacidad') settingsBio();
}

// Avisos en la app de Android: los programa el propio teléfono (exactos, sin internet, con sonidos por tipo)
function nativeNotifHtml() {
  const p = N.prefs();
  const opt = (k, n) => `<label class="check"><input type="checkbox" data-a="notif-pref" data-v="${k}" ${p[k] ? 'checked' : ''}> ${n}</label>`;
  const hours = Array.from({ length: 17 }, (_, i) => i + 5);
  const hh = h => `${h % 12 || 12}:00 ${h < 12 ? 'a. m.' : 'p. m.'}`;
  return `<p class="hint">Estás en la app de Android: los avisos los programa tu teléfono, así llegan a la hora exacta aunque no haya internet, y cada tipo tiene su sonido.</p>
    ${Nat.state.perm && Nat.state.perm !== 'granted' ? '<p class="hint warn">No diste permiso para los avisos. Actívalo en Ajustes del teléfono → Aplicaciones → Mi Agenda → Notificaciones.</p>' : '<p class="hint ok">✓ Avisos de la app activos en este teléfono.</p>'}
    ${Nat.state.exact && Nat.state.exact !== 'granted' ? '<div class="stack pad"><p class="hint warn">Para que lleguen al minuto exacto, permite «Alarmas y recordatorios».</p><button class="btn" data-a="nat-exact">Permitir avisos exactos</button></div>' : ''}
    <div class="stack pad">
      <p class="hint pick-h"><b>Resumen de la mañana</b></p>
      <label class="mini-f"><span>Hora del resumen</span><select id="notif-hour">${hours.map(h => `<option value="${h}" ${h === Number(p.hour) ? 'selected' : ''}>${hh(h)}</option>`).join('')}</select></label>
      ${opt('tasks', 'Tareas para hoy y atrasadas')}${opt('events', 'Compromisos de hoy')}${opt('junta', 'Reuniones de hoy')}
      <p class="hint pick-h"><b>📝 Registro de la noche (importante)</b></p>
      <label class="mini-f"><span>Hora del recordatorio</span><select id="notif-logat">${[1140, 1170, 1200, 1230, 1260, 1290, 1320].map(m => `<option value="${m}" ${m === Number(p.logAt) ? 'selected' : ''}>${Math.floor(m / 60) - 12}:${String(m % 60).padStart(2, '0')} p. m.</option>`).join('')}</select></label>
      <p class="hint pick-h"><b>Durante el día</b></p>
      ${opt('soon', 'Antes de cada evento')}
      <label class="mini-f"><span>¿Cuánto antes?</span><select id="notif-before">${[5, 10, 15, 30, 60].map(n => `<option value="${n}" ${n === Number(p.before) ? 'selected' : ''}>${n < 60 ? `${n} min` : '1 hora'}</option>`).join('')}</select></label>
      ${opt('taskTime', 'Tareas con hora')}${opt('meetingSoon', 'Reuniones: 1 hora antes')}${opt('routine', 'Rutina sin marcar')}${opt('streak', 'Racha en peligro (9:15 p. m.)')}${opt('tomorrow', 'Por la noche: lo que tienes mañana')}
      ${opt('details', 'Mostrar los títulos de tareas y reuniones')}
      <p class="hint pick-h"><b>🔊 Sonidos</b></p>
      <p class="hint">Cada tipo trae su sonido: Suave (eventos), Campanita (rutinas), Alerta (registro de la noche) y Amanecer (resúmenes). Para cambiar alguno: Ajustes del teléfono → Aplicaciones → Mi Agenda → Notificaciones → elige la categoría → Sonido.</p>
      <button type="button" class="btn" data-a="nat-test">Probar un aviso (llega en 5 segundos)</button>
    </div>`;
}

// Avisos en el teléfono (solo aparece si la app está en la nube y tiene la clave de avisos)
function notifSettingsHtml() {
  if (Nat.isNative) return nativeNotifHtml();
  const why = N.unsupportedReason();
  if (why) return `<p class="hint warn">${why}</p>`;
  const on = N.isOn(), p = N.prefs();
  const hours = Array.from({ length: 17 }, (_, i) => i + 5);
  const hh = h => `${h % 12 || 12}:00 ${h < 12 ? 'a. m.' : 'p. m.'}`;
  const opt = (k, n) => `<label class="check"><input type="checkbox" data-a="notif-pref" data-v="${k}" ${p[k] ? 'checked' : ''}> ${n}</label>`;
  return `<p class="hint">Un resumen por la mañana y avisos durante el día (antes de tus eventos, rutinas sin marcar…). Se activa en cada teléfono por separado.</p>
    ${N.blocked() ? '<p class="hint warn">Los avisos están bloqueados para esta app. Actívalos en los ajustes del navegador o del teléfono y vuelve aquí.</p>' : ''}
    <div class="stack pad">
      <label class="check"><input type="checkbox" id="notif-toggle" ${on ? 'checked' : ''}> Recibir avisos en este teléfono</label>
      ${on ? `<p class="hint ok">✓ Este teléfono está registrado para recibir avisos.</p>
        <p class="hint pick-h"><b>Resumen de la mañana</b></p>
        <label class="mini-f"><span>Hora del resumen</span><select id="notif-hour">${hours.map(h => `<option value="${h}" ${h === Number(p.hour) ? 'selected' : ''}>${hh(h)}</option>`).join('')}</select></label>
        ${opt('tasks', 'Tareas para hoy y atrasadas')}
        ${opt('events', 'Compromisos de hoy')}
        ${opt('junta', 'Reunión de hoy o mañana (y si falta enviar la agenda)')}
        ${opt('supervise', 'Los lunes: tareas que supervisas')}
        ${opt('weekly', 'Los domingos: resumen de la semana y lo que viene')}
        <p class="hint pick-h"><b>📝 Registro de la noche (importante)</b></p>
        <p class="hint">Cada noche te recuerda registrar tus horas y cursos del día para que no se te pase ninguno. Este aviso siempre está activo; solo eliges la hora.</p>
        <label class="mini-f"><span>Hora del recordatorio</span><select id="notif-logat">${[1140, 1170, 1200, 1230, 1260, 1290, 1320].map(m => `<option value="${m}" ${m === Number(p.logAt) ? 'selected' : ''}>${Math.floor(m / 60) - 12}:${String(m % 60).padStart(2, '0')} p. m.</option>`).join('')}</select></label>
        <p class="hint pick-h"><b>Durante el día</b></p>
        ${opt('soon', 'Antes de cada evento')}
        <label class="mini-f"><span>¿Cuánto antes?</span><select id="notif-before">${[5, 10, 15, 30, 60].map(n => `<option value="${n}" ${n === Number(p.before) ? 'selected' : ''}>${n < 60 ? `${n} min` : '1 hora'}</option>`).join('')}</select></label>
        ${opt('taskTime', 'Tareas con hora (a la misma anticipación)')}
        ${opt('meetingSoon', 'Reuniones: 1 hora antes, con su agenda')}
        ${opt('routine', 'Rutina sin marcar («aún no marcaste la lectura de hoy»)')}
        ${opt('streak', 'Racha en peligro (9:15 p. m.)')}
        ${opt('partner', 'Cuando alguien hace una rutina compartida contigo')}
        ${opt('tomorrow', 'Por la noche: lo que tienes mañana (9:30 p. m.)')}
        ${opt('report', 'Primeros días del mes: enviar tu informe')}
        <p class="hint pick-h"><b>🔊 Sonidos de Mi Agenda</b></p>
        <p class="hint">Suena en la app cuando llega un aviso con la app abierta. Para que el teléfono use este sonido siempre, descárgalo y elígelo en el teléfono (abajo te explico cómo).</p>
        <div class="sound-list">${N.SOUNDS.map(([id, n]) => `<div class="sound-row"><label class="check"><input type="radio" name="notif-sound" value="${id}" ${p.sound === id ? 'checked' : ''}> ${n}</label>
          <span class="quick"><button type="button" class="btn small" data-a="sound-play" data-v="${id}">▶ Oír</button><a class="btn small ghost" href="sonidos/${id}.mp3" download="MiAgenda-${n}.mp3">⬇ Descargar</a></span></div>`).join('')}
          <label class="check"><input type="radio" name="notif-sound" value="ninguno" ${p.sound === 'ninguno' ? 'checked' : ''}> Sin sonido en la app</label></div>
        <details class="howto"><summary>Cómo poner el sonido en el teléfono (Android)</summary>
          <ol><li>Toca <b>⬇ Descargar</b> en el sonido que te guste (queda en «Descargas»).</li>
          <li>Cuando te llegue un aviso de Mi Agenda, mantenlo presionado y toca ⚙️ (o Ajustes del teléfono → Aplicaciones → Mi Agenda o Chrome → Notificaciones).</li>
          <li>Entra a <b>Sonido</b> → <b>Sonido personalizado</b> (o «+», «Desde el almacenamiento») y elige <b>MiAgenda-…mp3</b> en Descargas.</li></ol>
          <p class="hint">En cada teléfono los nombres cambian un poco; si no ves «personalizado», busca «Tonos» o «Agregar».</p></details>
        <p class="hint pick-h"><b>Otros</b></p>
        ${opt('shared', 'Cuando alguien te comparte o cambia un evento')}
        ${opt('updates', 'Cuando hay una versión nueva de la app')}
        ${opt('details', 'Mostrar los títulos de tareas y reuniones')}
        <p class="hint">${p.details ? '⚠️ Los títulos se verán en la pantalla bloqueada.' : 'Los eventos siempre dicen su nombre; las tareas y reuniones, no (más privado).'} Los avisos pueden llegar hasta unos 5 minutos antes o después.</p>
        <button type="button" class="btn" data-a="notif-test">Enviar un aviso de prueba</button>` : ''}
    </div>`;
}
export async function notifToggle(on, el) {
  el.disabled = true;
  try {
    if (on) {
      const err = await N.enable();
      if (err) { el.checked = false; toast(err); } else toast('Listo: recibirás tu aviso diario en este teléfono');
    } else { await N.disable(); toast('Avisos desactivados en este teléfono'); }
  } catch (e) { console.warn(e); el.checked = false; toast('No se pudieron activar los avisos. Revisa tu conexión'); }
  settings();
}
export async function notifTest() {
  try {
    await store.requestTestNotice();
    toast('Listo: el aviso de prueba llegará en menos de una hora');
  } catch (e) { console.warn(e); toast('No se pudo pedir la prueba. Revisa tu conexión'); }
}

// Tipos propios de tareas y eventos (los que escribiste con «✏️ Nuevo tipo…»)
function typesSettingsHtml() {
  const block = (col, title) => {
    const list = M.savedTypes(col);
    return list.length ? `<p class="hint pick-h">${title}</p><div class="tagrow">${list.map(t => `<span class="chip static removable">${esc(t)}<button type="button" data-a="type-remove" data-col="${col}" data-v="${esc(t)}" aria-label="Quitar ${esc(t)}">${ic('x', 'sm')}</button></span>`).join('')}</div>` : '';
  };
  const html = block('tasks', 'De tareas') + block('events', 'De eventos') + block('privileges', 'Privilegios');
  return html ? `<h3 class="sub-h">Tus tipos propios</h3><p class="hint">Se agregan solos cuando escribes un tipo nuevo. Quita los que no uses; si alguna tarea o evento ya lo tiene, seguirá apareciendo.</p>${html}` : '';
}
export function typeRemove(col, value) {
  const field = M.CUSTOM_TYPE_FIELD[col];
  if (!field) return;
  store.upsert('profile', { ...M.profile(), id: 'me', [field]: M.savedTypes(col).filter(x => x !== value) });
  settings();
}

// Agrega o quita un acceso rápido de la fila de Hoy
export function toggleQuick(id) {
  const v = M.profile();
  const cur = Array.isArray(v.quickActions) ? v.quickActions : M.DEFAULT_QUICK;
  const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
  store.upsert('profile', { ...v, id: 'me', quickActions: M.QUICK_ACTIONS.map(q => q.id).filter(x => next.includes(x)) });
}

// Muestra u oculta una sección de la barra inferior (cada usuario ve solo lo que quiere ver)
// Muestra la opción de huella solo si el teléfono tiene lector
export function settingsBio() {
  const row = document.getElementById('bio-row');
  if (row) Lock.bioAvailable().then(ok => { row.hidden = !ok; });
}
export async function bioToggle(on, el) {
  if (!on) { Lock.disableBio(); return toast('Huella desactivada'); }
  try { if (await Lock.enableBio()) toast('Listo: ya puedes desbloquear con tu huella'); else { el.checked = false; toast('No se pudo activar la huella'); } }
  catch { el.checked = false; toast('No se pudo activar la huella'); }
}

export function toggleModule(id) {
  const v = M.profile();
  const hidden = new Set(v.hiddenModules || []);
  hidden.has(id) ? hidden.delete(id) : hidden.add(id);
  store.upsert('profile', { ...v, id: 'me', hiddenModules: [...hidden] });
}

// ───────────── Guía rápida (solo lo que este usuario usa) ─────────────

export function guideSheet(back = null) {
  const who = guideAudience();
  const groups = guideGroups();
  open({
    title: 'Guía rápida', back,
    body: `<p class="hint">${who ? `Hecha para tu perfil: <b>${esc(who)}</b>. ` : ''}Toca un tema para ver cómo se hace.</p>
      ${groups.map(g => `<h3 class="sub-h">${esc(g.g)}</h3>
        <div class="guide">${g.items.map(i => `<details><summary>${esc(i.t)}</summary><p>${i.b}</p></details>`).join('')}</div>`).join('')}`,
    actions: `<button type="button" class="btn primary" data-a="sheet-close">Entendido</button>`,
  });
}

// ───────────── Bloqueo con PIN ─────────────
export function pinSheet(mode) {
  const title = { on: 'Activar bloqueo con PIN', change: 'Cambiar PIN', off: 'Quitar el PIN' }[mode] || 'PIN';
  const inp = (id, label) => fld(label, `<input id="${id}" name="${id}" type="password" inputmode="numeric" pattern="[0-9]{4,6}" minlength="4" maxlength="6" autocomplete="off" required>`, id);
  open({
    title, back: settings,
    body: `<form id="f" data-form="pin" data-id="${mode}" autocomplete="off">
      ${mode !== 'on' ? inp('pinOld', 'PIN actual') : ''}
      ${mode !== 'off' ? `${inp('pin1', 'Nuevo PIN (4 a 6 números)')}${inp('pin2', 'Repite el PIN')}` : ''}
      <p class="hint">${mode === 'off' ? 'La app dejará de pedir el PIN en este teléfono.' : `Es solo para este teléfono. ${isCloud ? 'Si lo olvidas, podrás quitarlo cerrando sesión y volviendo a entrar.' : 'Como estás en modo local, si lo olvidas no se puede restablecer: anótalo en un lugar seguro.'}`}</p>
    </form>`,
    actions: `<button type="submit" form="f" class="btn primary">${mode === 'off' ? 'Quitar' : 'Guardar'}</button>`,
    focus: mode === 'on' ? '#pin1' : '#pinOld',
  });
}
async function savePin(mode, r) {
  const ok = s => /^\d{4,6}$/.test(s || '');
  if (mode !== 'on') {
    const good = await Lock.verify(r.pinOld || '');
    if (!good) return toast('El PIN actual no es correcto');
  }
  if (mode === 'off') { Lock.clearPin(); toast('PIN quitado'); return settings(); }
  if (!ok(r.pin1)) return toast('El PIN debe tener de 4 a 6 números');
  if (r.pin1 !== r.pin2) return toast('Los dos PIN no coinciden');
  await Lock.setPin(r.pin1, mode === 'change' ? Lock.delay() : 0);
  toast(mode === 'on' ? 'Bloqueo activado' : 'PIN cambiado');
  settings();
}

// ───────────── Administración de usuarios (solo el administrador) ─────────────

const typeOptions = sel => `<option value="" ${!sel ? 'selected' : ''}>Pendiente (sin acceso)</option>`
  + Object.entries(M.PROFILE_TYPES).map(([k, t]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(t.n)}</option>`).join('');

export async function adminSheet() {
  if (!session.isAdmin) return;
  open({ title: 'Administrar usuarios', body: '<p class="hint pad">Cargando cuentas…</p>' });
  let users;
  try { users = await store.admin.listUsers(); }
  catch (e) {
    console.error(e);
    const b = root.querySelector('.sheet-b');
    if (b) b.innerHTML = '<p class="err pad">No se pudieron cargar las cuentas. Revisa tu conexión y que las reglas de Firestore estén publicadas.</p>';
    return;
  }
  const b = root.querySelector('.sheet-b');
  if (!b) return;   // la hoja se cerró mientras cargaba
  const pending = users.filter(u => !u.type && u.uid !== account.user?.uid).length;
  b.innerHTML = `<p class="hint">Cuando alguien crea su cuenta queda <b>pendiente</b> hasta que le asignes un tipo de perfil. Tú no ves sus datos: solo su correo y el nombre que te envíe.</p>
    ${pending ? `<p class="pad"><b>${pending}</b> ${pending === 1 ? 'cuenta pendiente' : 'cuentas pendientes'}.</p>` : ''}
    ${users.length ? `<div class="stack">${users.map(u => {
      const me = u.uid === account.user?.uid;
      return `<div class="card mini admin-row">
        <strong>${esc(u.name || u.email || 'Sin correo')}${me ? ' <span class="hint">(tú, administrador)</span>' : ''}</strong>
        ${u.name ? `<span class="meta">${esc(u.email)}</span>` : ''}
        ${u.lastSeen ? `<span class="meta">Última vez: ${fmtShort(dateOf(u.lastSeen))}</span>` : ''}
        <select data-admin-uid="${esc(u.uid)}" aria-label="Tipo de perfil de ${esc(u.email)}">${typeOptions(u.type)}</select>
      </div>`;
    }).join('')}</div>` : '<p class="hint pad">Todavía no hay cuentas.</p>'}`;
}

export function adminSetType(uid, type, select) {
  select.disabled = true;
  store.admin.setType(uid, type)
    .then(() => toast(type ? `Perfil asignado: ${M.PROFILE_TYPES[type].n}` : 'Acceso quitado: la cuenta queda pendiente'))
    .catch(e => { console.error(e); toast('No se pudo guardar el cambio'); })
    .finally(() => { select.disabled = false; });
}

// ───────────── Restaurar respaldo (con confirmación) ─────────────

let importPending = null;
export function importPreview(txt) {
  let parsed;
  try { parsed = JSON.parse(txt); } catch { importPending = null; return toast('El archivo no es un respaldo válido'); }
  const src = parsed.data || parsed;
  const counts = store.COLS.map(c => [c, Array.isArray(src[c]) ? src[c].filter(x => x && x.id) : []]);
  const rm = parsed.remove || {};
  const removes = store.COLS.map(c => [c, (Array.isArray(rm[c]) ? rm[c] : []).filter(id => store.get(c, id))]);
  const nRemove = removes.reduce((n, [, l]) => n + l.length, 0);
  const total = counts.reduce((n, [, l]) => n + l.length, 0) + nRemove;
  if (!total) { importPending = null; return toast('El respaldo no tiene elementos'); }
  const replace = counts.reduce((n, [c, l]) => n + l.filter(x => store.get(c, x.id)).length, 0);
  importPending = txt;
  const names = { notes: 'notas', events: 'eventos', tasks: 'tareas', people: 'personas', groups: 'grupos', meetings: 'reuniones', entries: 'registros de tiempo', profile: 'perfil', weeks: 'semanas con objetivos' };
  open({
    title: 'Restaurar respaldo', back: settings,
    body: `<p>El archivo trae <b>${total}</b> elementos:</p>
      <ul class="steps">${counts.filter(([, l]) => l.length).map(([c, l]) => `<li>${l.length} ${names[c]}</li>`).join('')}</ul>
      ${nRemove ? `<p class="err pad">Y se quitarán ${nRemove}: ${removes.filter(([, l]) => l.length).map(([c, l]) => `${l.length} ${names[c]}`).join(', ')}.</p>` : ''}
      ${replace ? `<p class="err pad">${replace} ya existen y se reemplazarán por la versión del respaldo.</p>` : '<p class="hint pad">Nada de lo que tienes ahora se reemplaza.</p>'}`,
    actions: `<button type="button" class="btn ghost" data-a="sheet-close">Cancelar</button><button type="button" class="btn primary" data-a="import-confirm">Restaurar</button>`,
  });
}
export function importConfirm() {
  if (!importPending) return;
  try { const n = store.importAll(importPending); close(); toast(`${n} elementos restaurados`); }
  catch { toast('El archivo no es un respaldo válido'); }
  importPending = null;
}

// ───────────── Eliminar con opción de deshacer ─────────────

const DELETED = { events: 'Evento eliminado', tasks: 'Tarea eliminada', people: 'Persona eliminada', groups: 'Grupo eliminado', notes: 'Nota eliminada', meetings: 'Reunión eliminada', entries: 'Registro eliminado', weeks: 'Semana eliminada' };

export function removeWithUndo(col, id) {
  const item = store.get(col, id);
  if (!item) return;
  store.remove(col, id);
  close();
  toast(DELETED[col] || 'Eliminado', 'Deshacer', () => store.restore(col, item));
}

// Elimina varios de una vez (con «Deshacer» para todos). Los eventos que otros te compartieron solo se quitan de tu agenda.
export function removeManyWithUndo(col, ids) {
  const items = ids.map(id => store.get(col, id)).filter(Boolean);
  if (!items.length) return 0;
  items.forEach(x => store.remove(col, x.id));
  toast(`${items.length} ${items.length === 1 ? 'eliminado' : 'eliminados'}`, 'Deshacer', () => items.forEach(x => store.restore(col, x)), 9000);
  return items.length;
}

// ───────────── Envío de formularios ─────────────

function formValues(form) {
  const r = Object.fromEntries(new FormData(form));
  Object.keys(r).forEach(k => { if (typeof r[k] === 'string') r[k] = r[k].trim(); });
  return r;
}

export function submit(form) {
  const kind = form.dataset.form;
  const id = form.dataset.id || null;
  const r = formValues(form);
  switch (kind) {
    case 'event': return saveEvent(id, r, form);
    case 'task': return saveTask(id, form);
    case 'person': return savePerson(id, r, form);
    case 'group': return saveGroup(id, form);
    case 'note': return saveNote(id, r);
    case 'meeting': return saveMeeting(id, r, form);
    case 'entry': return saveEntry(id, r);
    case 'profile': return saveProfile(r, form);
    case 'weekplan': return saveWeekPlan(r);
    case 'pin': return savePin(id, r);
  }
}
