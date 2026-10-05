// 👥 Trabajar con otro anciano en la misma congregación
//  · Congregación compartida: el organigrama, los grupos, las mecánicas, la visita del superintendente y la lista de
//    publicadores de quien la administra se ven, siempre al día y solo lectura, en la app de las cuentas que elija.
//  · Notas y tareas compartidas: cada una se comparte con quien tú elijas; ellos la ven al día y agregan comentarios.
// Los datos viven en store.js (congre y shared); aquí están las pantallas.
import * as store from './store.js';
import { data, isCloud, account } from './store.js';
import * as M from './model.js';
import { esc, toast, fmtShort, today, dateOf, fmtTime } from './util.js';
import { open, close, noteSheet, taskSheet } from './sheets.js';

const me = () => account.user?.uid || '';
const first = n => String(n || '').trim().split(/\s+/)[0] || 'otra cuenta';
const when = iso => { if (!iso) return ''; const d = dateOf(iso); const t = new Date(iso); return `${d === today() ? 'hoy' : fmtShort(d)} ${t.toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit' })}`; };
// Cuentas de la app que ya están vinculadas a una ficha de Personas (así la app sabe quién es quién)
const linked = () => Object.fromEntries(data.people.filter(p => p.accountUid && !p.cgFrom).map(p => [p.accountUid, p]));
const isElderish = p => !!p && (M.isElder(p) || M.isMinisterial(p));

// Lista de cuentas con casillas; marca las sugeridas
async function accountPicker(name, chosen = [], suggest = new Set()) {
  let list = [];
  try { list = await store.listMembers(); } catch { /* sin conexión */ }
  if (!list.length) return '<p class="hint">No hay otras cuentas aprobadas en la app todavía.</p>';
  const L = linked();
  const sorted = [...list].sort((a, b) => (suggest.has(b.uid) ? 1 : 0) - (suggest.has(a.uid) ? 1 : 0) || a.name.localeCompare(b.name, 'es'));
  return `<div class="stack">${sorted.map(m => {
    const p = L[m.uid];
    const tag = suggest.has(m.uid) ? ' <span class="pchip">sugerida</span>' : p ? ` <span class="hint">· ${esc(p.name)} en tus Personas</span>` : '';
    return `<label class="check"><input type="checkbox" name="${name}" value="${esc(m.uid)}" data-name="${esc(m.name)}" ${chosen.includes(m.uid) ? 'checked' : ''}> ${esc(m.name)}${tag}</label>`;
  }).join('')}</div>`;
}
const picked = name => [...document.querySelectorAll(`#sheet-root input[name="${name}"]:checked`)].map(i => ({ uid: i.value, name: i.dataset.name || '' }));

// ───────────── Congregación compartida ─────────────

// Quien la administra: con quién la comparte
export async function congreShareSheet() {
  const cur = store.congre.sharing() || {};
  open({ title: '👥 Compartir la congregación', body: '<p class="hint pad">Cargando cuentas…</p>',
    actions: `${cur.on ? '<button type="button" class="btn ghost danger" data-a="cg-share-stop">Dejar de compartir</button>' : ''}<button type="button" class="btn primary" data-a="cg-share-save">Guardar</button>` });
  const sug = new Set(Object.entries(linked()).filter(([, p]) => isElderish(p)).map(([u]) => u));
  const box = document.querySelector('#sheet-root .sheet-b');
  if (!box) return;
  box.innerHTML = `<p class="hint">Las cuentas que marques ven en su app <b>tu organigrama, los grupos, las asignaciones mecánicas, la visita del superintendente y la lista de publicadores</b> (nombre, privilegios y grupo; sin teléfonos, direcciones ni notas). Lo ven siempre al día y <b>solo tú puedes cambiarlo</b>.</p>
    <p class="hint">Las tareas y notas no van aquí: se comparten una por una desde cada nota o tarea.</p>
    <h3 class="sub-h">Compartir con</h3>${await accountPicker('cgWith', cur.on ? cur.members || [] : [...sug], sug)}
    ${cur.on && (cur.members || []).length ? `<p class="hint ok pad-top">✓ Ahora la compartes con ${esc(Object.values(cur.names || {}).join(', ') || `${cur.members.length} cuenta(s)`)}.</p>` : ''}`;
}
export function congreShareSave() {
  const sel = picked('cgWith');
  if (!sel.length) return congreShareStop();
  store.congre.share(sel.map(x => x.uid), Object.fromEntries(sel.map(x => [x.uid, x.name])));
  close();
  toast(`👥 Congregación compartida con ${sel.map(x => first(x.name)).join(', ')}. Se actualiza sola cada vez que cambies algo.`);
}
export async function congreShareStop() {
  await store.congre.stop();
  close();
  toast('Ya no compartes la congregación');
}

// Quien la recibe
const pendingOffers = () => {
  const v = M.profile();
  return store.congre.offers().filter(o => o.id !== v.congreFollow && !(v.congreDeclined || []).includes(o.id));
};
export function offerSheet(id) {
  const o = store.congre.offers().find(x => x.id === id);
  if (!o) return toast('Esa congregación ya no está compartida contigo');
  const cur = store.congre.followId();
  open({
    title: '👥 Congregación compartida',
    body: `<p><b>${esc(o.ownerName || 'Otra cuenta')}</b> te compartió${o.name ? ` la congregación <b>${esc(o.name)}</b>` : ' su congregación'}.</p>
      <p class="hint">Si la usas, en tu app verás <b>su organigrama, los grupos, las asignaciones mecánicas, la visita del superintendente y la lista de publicadores</b>, siempre al día. Es <b>solo lectura</b>: lo cambia ${esc(first(o.ownerName))}.</p>
      <p class="hint">Las personas que ya tienes en tus Personas se reconocen por su nombre (y tú, por tu cuenta). Lo que tenías en tu organigrama se guarda y vuelve si dejas de usarla.</p>
      ${cur && cur !== id ? '<p class="hint warn-t">Ya usas otra congregación compartida: se cambiará por esta.</p>' : ''}`,
    actions: `<button type="button" class="btn ghost" data-a="cg-decline" data-id="${esc(id)}">Ahora no</button><button type="button" class="btn primary" data-a="cg-follow" data-id="${esc(id)}">Usar esta congregación</button>`,
  });
}
export function follow(id) { store.congre.follow(id); close(); toast('👥 Listo: ves la congregación compartida en Congregación'); }
export function decline(id) { store.congre.decline(id); close(); toast('Puedes usarla más adelante desde Congregación'); }
export function unfollow() { store.congre.unfollow(); toast('Volviste a tu propio organigrama'); }

// Tarjeta de arriba en Congregación
export function congreBanner() {
  if (!isCloud) return '';
  const f = store.congre.following();
  if (f) {
    const c = f.congre || {};
    const title = [c.name || f.name, c.number ? `(${c.number})` : ''].filter(Boolean).join(' ');
    return `<div class="card congre-card cg-banner"><strong>👥 ${esc(title || 'Congregación compartida')}${c.circuit ? ` <span class="hint">· ${esc(c.circuit)}</span>` : ''}</strong>
      ${c.midweek || c.weekend ? `<span class="meta">${c.midweek ? `Entre semana: ${esc(c.midweek)}` : ''}${c.midweek && c.weekend ? ' · ' : ''}${c.weekend ? `Fin de semana: ${esc(c.weekend)}` : ''}</span>` : ''}
      ${c.address ? `<span class="meta">📍 ${esc(c.address)}</span>` : ''}
      <span class="meta">La comparte <b>${esc(f.ownerName || 'otra cuenta')}</b> · solo lectura${f.updatedAt ? ` · actualizada ${esc(when(f.updatedAt))}` : ''}</span>
      <span><button class="link" data-a="cg-unfollow">Dejar de usarla</button></span></div>`;
  }
  const offers = pendingOffers();
  const sh = store.congre.sharing();
  const out = [];
  offers.forEach(o => out.push(`<button class="log-now" data-a="cg-offer" data-id="${esc(o.id)}">👥 <span><b>${esc(o.ownerName || 'Otra cuenta')} te compartió su congregación</b><small>Toca para ver su organigrama, grupos y mecánicas en tu app.</small></span></button>`));
  if (M.isModuleVisible('congregacion') && (data.depts || []).length) {
    out.push(sh?.on && (sh.members || []).length
      ? `<p class="hint pad cg-status">👥 La compartes con <b>${esc(Object.values(sh.names || {}).map(first).join(', '))}</b> · <button class="link" data-a="cg-share">Cambiar</button></p>`
      : `<p class="pad"><button class="btn small" data-a="cg-share">👥 Compartir la congregación con otro anciano</button></p>`);
  }
  return out.join('');
}
// ¿Se está viendo la congregación de otro? (para ocultar los botones de editar)
export const readOnly = () => !!store.congre.following();

// ───────────── Notas y tareas compartidas ─────────────
const SEEN_KEY = 'miagenda.compartidoVisto';
const seenMap = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); } catch { return {}; } };
function markSeen(d) {
  const m = seenMap(); m[d.id] = `${(d.comments || []).length}|${d.updatedAt || ''}`;
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(m)); } catch { /* sin almacenamiento */ }
}
// Comentarios de otros que todavía no viste
function unseen(d) {
  const s = seenMap()[d.id];
  const n = s ? Number(s.split('|')[0]) || 0 : 0;
  const news = (d.comments || []).slice(n).filter(c => c.by !== me());
  return { isNew: !s && d.owner !== me(), changed: !!s && d.owner !== me() && s.split('|')[1] !== (d.updatedAt || '') && d.updatedBy !== me(), comments: news };
}

// Bloque dentro de la nota o la tarea (quien la comparte)
export function shareBlock(col, item) {
  if (!isCloud || !item?.id || item.assignedFrom || !account.user) return '';
  return `<section class="sh-box" id="sh-box">${shareBlockInner(col, item)}</section>`;
}
function shareBlockInner(col, item) {
  const d = item.shareId ? store.shared.doc(item.shareId) : null;
  if (!item.shareId) return `<button type="button" class="btn ghost pad-top" data-a="sh-share" data-v="${col}" data-id="${esc(item.id)}">👥 Compartir con otro anciano…</button>`;
  const names = Object.values(item.shareNames || {}).map(first).join(', ');
  if (d) markSeen(d);
  return `<h3 class="sub-h">👥 Compartida con ${esc(names || 'otras cuentas')} <button type="button" class="link" data-a="sh-share" data-v="${col}" data-id="${esc(item.id)}">Cambiar</button></h3>
    <p class="hint">La ven siempre al día y pueden comentar${col === 'tasks' ? ' y marcarla hecha (a ti te llega y se marca aquí también)' : ''}. Solo tú cambias el contenido.</p>
    ${col === 'tasks' && d?.status === 'hecha' && d.doneBy && d.doneBy !== me() ? `<p class="hint ok">✓ ${esc(first(d.doneByName))} la marcó hecha${d.doneAt ? ` el ${esc(fmtShort(d.doneAt))}` : ''}.</p>` : ''}
    ${commentsHtml(d, item.shareId)}`;
}
function commentsHtml(d, id) {
  const list = d?.comments || [];
  return `<div class="sh-comments">${list.length ? list.map(c => `<div class="sh-c ${c.by === me() ? 'mine' : ''}"><b>${esc(c.by === me() ? 'Tú' : first(c.byName))}</b> <span class="hint">${esc(when(c.at))}</span><p>${esc(c.t)}</p></div>`).join('') : '<p class="hint">Todavía no hay comentarios.</p>'}</div>
    <div class="log-add"><input id="sh-text" maxlength="1000" placeholder="Escribe un comentario" aria-label="Nuevo comentario" data-sh="${esc(id)}"><button type="button" class="btn" data-a="sh-comment" data-id="${esc(id)}">Enviar</button></div>`;
}

// Elegir con quién se comparte una nota o tarea
export async function itemShareSheet(col, id) {
  const item = store.get(col, id);
  if (!item) return;
  const back = () => (col === 'notes' ? noteSheet(id) : taskSheet(id));
  open({ title: '👥 Compartir', back, body: '<p class="hint pad">Cargando cuentas…</p>',
    actions: `${item.shareId ? `<button type="button" class="btn ghost danger" data-a="sh-share-save" data-v="${col}" data-id="${esc(id)}" data-stop="1">Dejar de compartir</button>` : ''}<button type="button" class="btn primary" data-a="sh-share-save" data-v="${col}" data-id="${esc(id)}">Guardar</button>` });
  // Sugeridas: la persona de la nota o los responsables de la tarea, si tienen cuenta vinculada
  const ids = [item.personId, ...(item.responsibleIds || [])].filter(Boolean);
  const sug = new Set(ids.map(x => M.person(x)?.accountUid).filter(Boolean));
  const box = document.querySelector('#sheet-root .sheet-b');
  if (!box) return;
  box.innerHTML = `<p class="hint">«${esc(item.title || 'Sin título')}» se verá en su app, siempre al día${col === 'tasks' ? ' (con la fecha, el estado y los seguimientos)' : ''}. Podrán comentar; solo tú cambias el contenido. Si dejas de compartirla, se les quita.</p>
    ${await accountPicker('shWith', item.shareId ? item.shareWith || [] : [...sug], sug)}
    ${!sug.size && ids.length ? '<p class="hint">💡 Para que la app sugiera a la persona, en su ficha de Personas elige su «Cuenta en la app».</p>' : ''}`;
}
export function itemShareSave(col, id, stop) {
  const sel = stop ? [] : picked('shWith');
  const r = store.shared.set(col, id, sel.map(x => x.uid), Object.fromEntries(sel.map(x => [x.uid, x.name])));
  toast(r ? `👥 Compartida con ${sel.map(x => first(x.name)).join(', ')}` : 'Ya no se comparte');
  col === 'notes' ? noteSheet(id) : taskSheet(id);
}

export async function comment(id) {
  const inp = document.getElementById('sh-text');
  const t = inp?.value.trim();
  if (!t) return toast('Escribe el comentario');
  inp.value = '';
  const ok = await store.shared.comment(id, t);
  if (!ok) { inp.value = t; return; }
  const d = store.shared.doc(id);
  if (d) markSeen(d);
  const box = document.getElementById('sh-box') || document.getElementById('sh-item');
  if (box && d) {
    if (box.id === 'sh-item') box.querySelector('.sh-cwrap').innerHTML = commentsHtml(d, id);
    else { const n = data.notes.find(x => x.shareId === id), tk = data.tasks.find(x => x.shareId === id); if (n || tk) box.innerHTML = shareBlockInner(n ? 'notes' : 'tasks', n || tk); }
  }
  toast('💬 Comentario enviado');
}

// Lo que te compartieron
const STATUS = { pendiente: 'Pendiente', seguimiento: 'En seguimiento', hecha: '✓ Hecha' };
export function inboxSheet() {
  const list = [...store.shared.received()].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  open({
    title: '👥 Compartido conmigo',
    body: list.length ? `<div class="stack">${list.map(d => {
      const u = unseen(d);
      const badge = u.isNew ? '<span class="pchip">nueva</span>' : u.comments.length ? `<span class="pchip">💬 ${u.comments.length}</span>` : u.changed ? '<span class="pchip">cambió</span>' : '';
      return `<button class="card mini sh-row" data-a="sh-item" data-id="${esc(d.id)}"><span><b>${d.kind === 'task' ? '📋' : '📝'} ${esc(d.title || 'Sin título')}</b> ${badge}</span>
        <span class="hint">De ${esc(first(d.ownerName))}${d.kind === 'task' ? ` · ${esc(STATUS[d.status] || d.status || '')}${d.due ? ` · vence el ${esc(fmtShort(d.due))}` : ''}` : d.date ? ` · ${esc(fmtShort(d.date))}` : ''}${(d.comments || []).length ? ` · 💬 ${d.comments.length}` : ''}</span></button>`;
    }).join('')}</div>` : '<p class="hint pad">Nadie te ha compartido notas ni tareas todavía.</p>',
  });
}
export function itemSheet(id, back = inboxSheet) {
  const d = store.shared.doc(id);
  if (!d) return toast('Ya no está compartida contigo');
  markSeen(d);
  const t = d.kind === 'task';
  open({
    title: t ? '📋 Tarea compartida' : '📝 Nota compartida', back,
    body: `<div id="sh-item"><p class="shared-note">👥 Te la compartió <b>${esc(d.ownerName || 'otra cuenta')}</b>. Solo esa cuenta cambia el contenido; tú puedes comentar.</p>
      <h3 class="sh-title">${esc(d.title || 'Sin título')}</h3>
      <p class="meta">${t ? `${esc(STATUS[d.status] || '')}${d.due ? ` · vence el ${esc(fmtShort(d.due))}${d.dueTime ? ` ${esc(fmtTime(d.dueTime))}` : ''}` : ''}${d.priority === 'alta' ? ' · 🔴 Alta' : ''}` : `${d.date ? esc(fmtShort(d.date)) : ''}${d.tag ? ` · ${esc(d.tag)}` : ''}`}${d.about ? ` · ${esc(d.about)}` : ''}</p>
      ${t && (d.responsibles || []).length ? `<p class="hint">Responsables: ${esc(d.responsibles.join(', '))}</p>` : ''}
      ${d.body ? `<div class="sh-body">${esc(d.body).replace(/\n/g, '<br>')}</div>` : ''}
      ${t && (d.log || []).length ? `<h3 class="sub-h">Seguimiento</h3><ul class="sh-log">${[...d.log].reverse().map(l => `<li><span class="hint">${esc(l.d ? fmtShort(l.d) : '')}</span> ${esc(l.t)}</li>`).join('')}</ul>` : ''}
      ${t ? (d.status === 'hecha'
        ? `<p class="hint ok">✓ Hecha${d.doneByName ? ` por ${esc(d.doneBy === me() ? 'ti' : first(d.doneByName))}` : ''}${d.doneAt ? ` el ${esc(fmtShort(d.doneAt))}` : ''}.</p><button type="button" class="btn ghost" data-a="sh-done" data-id="${esc(id)}" data-v="0">↩ Volver a pendiente</button>`
        : `<button type="button" class="btn primary" data-a="sh-done" data-id="${esc(id)}" data-v="1">✓ Ya la hice</button><p class="hint">A ${esc(first(d.ownerName))} le llega y se marca hecha en su app.</p>`) : ''}
      <h3 class="sub-h">💬 Comentarios</h3><div class="sh-cwrap">${commentsHtml(d, id)}</div></div>`,
  });
}

// Avisos para Hoy
export function hoyNotices() {
  if (!isCloud || !account.user) return [];
  document.body.classList.toggle('cg-ro', readOnly());
  const out = [];
  const offers = pendingOffers();
  offers.forEach(o => out.push(`<button class="log-now" data-a="cg-offer" data-id="${esc(o.id)}">👥 <span><b>${esc(first(o.ownerName))} te compartió su congregación</b><small>Toca para ver su organigrama, grupos y mecánicas en tu app.</small></span></button>`));
  const rec = store.shared.received().map(d => ({ d, u: unseen(d) })).filter(x => x.u.isNew || x.u.comments.length || x.u.changed);
  if (rec.length) {
    const one = rec.length === 1 ? rec[0] : null;
    out.push(`<button class="log-now" data-a="${one ? 'sh-item' : 'sh-inbox'}" data-id="${esc(one?.d.id || '')}">👥 <span><b>${one ? (one.u.isNew ? `${esc(first(one.d.ownerName))} te compartió «${esc(one.d.title)}»` : one.u.comments.length ? `Comentarios nuevos en «${esc(one.d.title)}»` : `${esc(first(one.d.ownerName))} actualizó «${esc(one.d.title)}»`) : `${rec.length} notas o tareas compartidas con novedades`}</b><small>Toca para verlas.</small></span></button>`);
  }
  // Tareas que compartiste y la otra persona marcó hechas
  const doneSeen = (() => { try { return JSON.parse(localStorage.getItem('miagenda.compartidoHecha') || '{}'); } catch { return {}; } })();
  store.shared.all().filter(d => d.owner === me() && d.kind === 'task' && d.status === 'hecha' && d.doneBy && d.doneBy !== me() && doneSeen[d.id] !== d.doneAt).forEach(d => {
    const own = data.tasks.find(x => x.shareId === d.id) || data.tasks.find(x => x.title === d.title && x.status === 'hecha');
    out.push(`<button class="log-now" data-a="sh-done-seen" data-id="${esc(d.id)}" data-v="${esc(own?.id || '')}">✓ <span><b>${esc(first(d.doneByName))} marcó hecha «${esc(d.title)}»</b><small>${d.doneAt ? `El ${esc(fmtShort(d.doneAt))}. ` : ''}Ya quedó marcada en tus tareas. Toca para verla.</small></span></button>`);
  });
  // Comentarios que te hicieron en lo que tú compartiste
  store.shared.all().filter(d => d.owner === me()).forEach(d => {
    const u = unseen(d);
    if (!u.comments.length) return;
    const own = data.notes.find(n => n.shareId === d.id) || data.tasks.find(x => x.shareId === d.id);
    if (!own) return;
    out.push(`<button class="log-now" data-a="${data.notes.includes(own) ? 'note' : 'task'}" data-id="${esc(own.id)}">💬 <span><b>${esc(first(u.comments[u.comments.length - 1].byName))} comentó en «${esc(d.title)}»</b><small>${esc(u.comments[u.comments.length - 1].t.slice(0, 90))}</small></span></button>`);
  });
  return out;
}
// Botón en Notas y Tareas
export function inboxButton(kind) {
  if (!isCloud) return '';
  const list = store.shared.received().filter(d => d.kind === kind);
  if (!list.length) return '';
  const news = list.filter(d => { const u = unseen(d); return u.isNew || u.comments.length || u.changed; }).length;
  return `<button class="btn small sh-inbox-btn" data-a="sh-inbox">👥 Compartido conmigo (${list.length})${news ? ` · <b>${news} con novedades</b>` : ''}</button>`;
}

// Quien la recibe: «✓ Ya la hice» o «↩ Volver a pendiente»
export async function setDone(id, done) {
  const ok = await store.shared.setDone(id, done);
  if (!ok) return;
  const d = store.shared.doc(id);
  toast(done ? `✓ ¡Hecha! ${first(d?.ownerName)} lo verá` : 'Vuelve a estar pendiente');
  if (document.getElementById('sh-item')) itemSheet(id, null);
}
// Quien la compartió: ya vio que la otra persona la marcó hecha
export function doneSeen(id, taskId) {
  const d = store.shared.doc(id);
  try { const m = JSON.parse(localStorage.getItem('miagenda.compartidoHecha') || '{}'); m[id] = d?.doneAt || ''; localStorage.setItem('miagenda.compartidoHecha', JSON.stringify(m)); } catch { /* sin almacenamiento */ }
  if (taskId && store.get('tasks', taskId)) taskSheet(taskId); else store.refresh();
}
