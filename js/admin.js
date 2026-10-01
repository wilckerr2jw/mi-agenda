// 🛡 Administración (solo el administrador, modo nube): qué secciones y funciones usa cada cuenta,
// y las plantillas de cada tipo de perfil. Se carga solo cuando se abre (import desde sheets.js).
//
//  · Usuarios: tipo (plantilla) + funciones de más o de menos → access/{uid} { type, allow, deny }
//  · Plantillas: config/plantillas { types: { id: { n, modules, features, hideEventCats, hideServCats, goal } } }

import * as store from './store.js';
import { account, session } from './store.js';
import * as M from './model.js';
import { overridesFor, cleanTemplate, TYPE_ID_RE, MODULE_IDS } from './perms.js';
import { open, settings } from './sheets.js';
import { esc, toast, norm, fmtShort, dateOf } from './util.js';

const BUILTIN = Object.keys(M.PROFILE_TYPES);
const st = { tab: 'usuarios', q: '', users: null, tpls: null, uid: '', draft: null, tid: '', tdraft: null, openSecs: new Set(), busy: false };
const featsOf = s => M.FEATURES[s] || [];
const sizeOf = t => `${t.modules.length} secciones · ${t.features.length} funciones`;
const usersOf = id => (st.users || []).filter(u => u.type === id);
const userName = u => u.name || u.email || 'Sin correo';
const isMe = u => u.uid === account.user?.uid;
const copyTpl = t => ({ n: t.n, modules: [...t.modules], features: [...t.features], hideEventCats: [...t.hideEventCats], hideServCats: [...t.hideServCats], goal: !!t.goal });
const body = () => document.querySelector('#sheet-root .sheet-b');

// ───── Entrada ─────
export async function openAdmin(tab) {
  if (!session.isAdmin) return;
  bind();
  if (tab) st.tab = tab;
  st.tpls = Object.fromEntries(Object.entries(M.templates()).map(([k, t]) => [k, copyTpl(t)]));
  open({ title: '🛡 Administración', back: () => settings('admin'), body: '<p class="hint pad">Cargando cuentas…</p>' });
  try { st.users = await store.admin.listUsers(); }
  catch (e) {
    console.error(e);
    const b = body();
    if (b) b.innerHTML = '<p class="err pad">No se pudieron cargar las cuentas. Revisa tu conexión y que las reglas de Firestore estén publicadas.</p>';
    return;
  }
  if (body()) mainView();
}

function mainView() {
  const tabs = `<div class="seg adm-tabs" role="group" aria-label="Administración">
    <button type="button" data-a="adm-tab" data-v="usuarios" aria-pressed="${st.tab === 'usuarios'}">Usuarios</button>
    <button type="button" data-a="adm-tab" data-v="plantillas" aria-pressed="${st.tab === 'plantillas'}">Plantillas</button></div>`;
  open({ title: '🛡 Administración', back: () => settings('admin'), body: tabs + (st.tab === 'plantillas' ? tplListHtml() : usersHtml()) });
  if (st.tab === 'usuarios') filterUsers();
}

// ───── Usuarios ─────
function usersHtml() {
  const waiting = u => !u.type && !isMe(u);
  const users = [...(st.users || [])].sort((a, b) => (waiting(a) ? 0 : 1) - (waiting(b) ? 0 : 1) || (b.lastSeen || '').localeCompare(a.lastSeen || ''));
  const ok = users.filter(u => u.type).length, pend = users.filter(u => !u.type && !isMe(u)).length;
  return `<p class="hint">Toca una cuenta para elegir su tipo y qué secciones y funciones puede usar. Tú no ves sus datos: solo su correo y el nombre que te envíe.</p>
    <input id="adm-q" class="set-search" type="search" placeholder="Buscar por nombre o correo" aria-label="Buscar cuentas" autocomplete="off" value="${esc(st.q)}">
    <p class="hint adm-count"><b>${ok}</b> con acceso · <b>${pend}</b> ${pend === 1 ? 'pendiente' : 'pendientes'}</p>
    ${users.length ? `<div class="stack" id="adm-list">${users.map(u => {
      const custom = u.type && ((u.allow || []).length || (u.deny || []).length);
      const badge = u.type ? M.typeName(u.type) : isMe(u) ? 'Administrador · ve todo' : 'Pendiente';
      return `<button type="button" class="card mini adm-user ${waiting(u) ? 'pend' : ''}"data-a="adm-user" data-id="${esc(u.uid)}" data-k="${esc(norm(`${u.name} ${u.email}`))}">
        <strong>${esc(userName(u))}${isMe(u) ? ' <span class="hint">(tú, administrador)</span>' : ''}</strong>
        ${u.name ? `<span class="meta">${esc(u.email)}</span>` : ''}
        <span class="meta"><span class="adm-badge ${waiting(u) ? 'pend' : ''}">${esc(badge)}</span>${custom ? ' · ajustada a mano' : ''}${u.lastSeen ? ` · última vez ${esc(fmtShort(dateOf(u.lastSeen)))}` : ''}</span>
      </button>`;
    }).join('')}</div><p class="hint pad adm-none" hidden>Ninguna cuenta coincide.</p>` : '<p class="hint pad">Todavía no hay cuentas.</p>'}`;
}
function filterUsers() {
  const q = norm(st.q || '');
  let n = 0;
  document.querySelectorAll('#adm-list .adm-user').forEach(b => { const ok = !q || b.dataset.k.includes(q); b.hidden = !ok; if (ok) n++; });
  const none = document.querySelector('.adm-none'); if (none) none.hidden = !!n;
}

// Lo que la cuenta tiene marcado (sin filtrar por sección, para no perder lo marcado al apagar una sección)
function draftFor(type, allow = [], deny = []) {
  const t = st.tpls[type];
  if (!t) return { type, modules: new Set(), features: new Set() };
  const a = new Set(allow), d = new Set(deny);
  return {
    type,
    modules: new Set(MODULE_IDS.filter(m => (t.modules.includes(m) || a.has(m)) && !d.has(m))),
    features: new Set(M.FEATURE_LIST.map(f => f.id).filter(id => (t.features.includes(id) || a.has(id)) && !d.has(id))),
  };
}

function userView(uid) {
  const u = (st.users || []).find(x => x.uid === uid);
  if (!u) return mainView();
  st.tdraft = null; st.tid = '';
  if (st.uid !== uid || !st.draft) { st.uid = uid; st.draft = draftFor(u.type, u.allow, u.deny); st.openSecs = new Set(); }
  const d = st.draft, base = st.tpls[d.type];
  const typeSel = `<option value="" ${!d.type ? 'selected' : ''}>Pendiente (sin acceso)</option>`
    + Object.entries(st.tpls).map(([k, t]) => `<option value="${esc(k)}" ${k === d.type ? 'selected' : ''}>${esc(t.n)}</option>`).join('');
  open({
    title: userName(u), back: mainView,
    body: `<div class="card mini"><strong>${esc(userName(u))}${isMe(u) ? ' <span class="hint">(tú)</span>' : ''}</strong>${u.name ? `<span class="meta">${esc(u.email)}</span>` : ''}${u.lastSeen ? `<span class="meta">Última vez: ${esc(fmtShort(dateOf(u.lastSeen)))}</span>` : ''}</div>
      <label class="mini-f pad-top"><span>Tipo de perfil (plantilla)</span><select id="adm-type">${typeSel}</select></label>
      ${d.type ? `<p class="hint">Marca lo que puede usar. <b class="adm-chg">• cambiado</b> = distinto de la plantilla «${esc(base?.n || d.type)}». Al cambiar el tipo se parte de su plantilla.</p>
        <div id="adm-perm">${permsHtml(d, base)}</div>`
        : '<p class="hint warn">Sin acceso: al entrar ve «Cuenta en revisión» hasta que le asignes un tipo.</p>'}
      ${!isMe(u) && u.type ? `<div class="stack pad"><label class="btn small ghost file">📤 Enviarle un respaldo<input type="file" data-admin-send="${esc(u.uid)}" data-name="${esc(u.name || u.email || '')}" hidden></label></div>` : ''}`,
    actions: `${d.type ? '<button type="button" class="btn ghost" data-a="adm-reset">Restablecer a la plantilla</button>' : ''}<button type="button" class="btn primary" data-a="adm-save-user">Guardar</button>`,
  });
}

async function saveUser() {
  const u = (st.users || []).find(x => x.uid === st.uid);
  if (!u || st.busy) return;
  const d = st.draft;
  const base = st.tpls[d.type];
  const { allow, deny } = d.type ? overridesFor(base, [...d.modules], [...d.features]) : { allow: [], deny: [] };
  st.busy = true;
  try {
    await store.admin.setAccess(u.uid, { type: d.type, allow, deny });
    Object.assign(u, { type: d.type, allow, deny });
    toast(d.type ? `Guardado: ${M.typeName(d.type)}${allow.length || deny.length ? ' (ajustada a mano)' : ''}` : 'Acceso quitado: la cuenta queda pendiente');
    st.draft = null; st.uid = '';
    mainView();
  } catch (e) { console.error(e); toast('No se pudo guardar el cambio'); }
  finally { st.busy = false; }
}

// ───── Secciones y funciones (lo mismo para una cuenta y para una plantilla) ─────
function permsHtml(d, base) {
  const chg = on => (on ? ' <span class="adm-chg">• cambiado</span>' : '');
  return M.SECTION_LIST.map(s => {
    const list = featsOf(s.id);
    if (!list.length) return '';
    const secOn = s.always || d.modules.has(s.id);
    const secChg = base && !s.always && d.modules.has(s.id) !== base.modules.includes(s.id);
    const on = list.filter(f => d.features.has(f.id)).length;
    const anyChg = base && list.some(f => d.features.has(f.id) !== base.features.includes(f.id));
    return `<details class="adm-sec ${secOn ? '' : 'off'}" data-sec="${s.id}" ${st.openSecs.has(s.id) ? 'open' : ''}>
      <summary><span class="adm-sum">${s.always ? `<b>${esc(s.n)}</b>` : `<span class="adm-name"><label class="check adm-sw"><input type="checkbox" data-adm-mod="${s.id}" ${secOn ? 'checked' : ''} aria-label="Sección ${esc(s.n)}"></label> <b>${esc(s.n)}</b></span>`}
        <span class="hint adm-n">${secOn ? `${on}/${list.length}` : 'apagada'}${chg(secChg || anyChg)}</span></span></summary>
      <div class="adm-feats">${list.map(f => `<label class="check adm-f"><input type="checkbox" data-adm-feat="${f.id}" ${d.features.has(f.id) ? 'checked' : ''} ${secOn ? '' : 'disabled'}>
        <span><b>${esc(f.n)}</b>${chg(base && d.features.has(f.id) !== base.features.includes(f.id))}<small class="meta">${esc(f.d)}</small></span></label>`).join('')}
        ${secOn ? '' : '<p class="hint">Enciende la sección para que estas funciones se usen.</p>'}</div>
    </details>`;
  }).join('');
}
function refreshPerms() {
  const box = document.getElementById('adm-perm');
  if (!box) return;
  const isTpl = !!st.tdraft && !st.draft;
  box.innerHTML = permsHtml(isTpl ? st.tdraft : st.draft, isTpl ? null : st.tpls[st.draft.type]);
}
function toggleModule(d, id, on) {
  if (on) {
    d.modules.add(id);
    if (!featsOf(id).some(f => d.features.has(f.id))) featsOf(id).forEach(f => d.features.add(f.id));   // al encenderla vienen todas sus funciones
  } else d.modules.delete(id);
}

// ───── Plantillas ─────
function tplListHtml() {
  return `<p class="hint">Cada tipo de perfil trae sus secciones, funciones y categorías. Lo que cambies aquí se aplica al instante a todas las cuentas de ese tipo (salvo lo que ajustaste a mano en cada una).</p>
    <div class="stack">${Object.entries(st.tpls).map(([k, t]) => `<button type="button" class="card mini" data-a="adm-tpl" data-id="${esc(k)}">
      <strong>${esc(t.n)}${BUILTIN.includes(k) ? '' : ' <span class="hint">(propia)</span>'}</strong>
      <span class="meta">${esc(sizeOf(t))} · ${usersOf(k).length} ${usersOf(k).length === 1 ? 'cuenta' : 'cuentas'}</span></button>`).join('')}</div>
    <div class="stack pad"><button type="button" class="btn" data-a="adm-tpl-new">＋ Nueva plantilla</button></div>
    ${!session.templates ? '<p class="hint">Todavía usas las plantillas de siempre: se guardan en la base de datos la primera vez que cambies una.</p>' : ''}`;
}

function tplView(id) {
  const t = st.tpls[id];
  if (!t) return mainView();
  st.draft = null; st.uid = '';
  if (st.tid !== id || !st.tdraft) {
    st.tid = id; st.openSecs = new Set();
    st.tdraft = { n: t.n, modules: new Set(t.modules), features: new Set(t.features), hideEventCats: new Set(t.hideEventCats), hideServCats: new Set(t.hideServCats), goal: !!t.goal };
  }
  const d = st.tdraft, n = usersOf(id).length, builtin = BUILTIN.includes(id);
  const cats = (obj, key) => Object.entries(obj).map(([k, c]) => `<label class="check"><input type="checkbox" data-adm-cat="${key}" value="${esc(k)}" ${d[key].has(k) ? '' : 'checked'}> ${esc(c.n)}</label>`).join('');
  open({
    title: `Plantilla: ${t.n}`, back: () => { st.tdraft = null; st.tid = ''; mainView(); },
    body: `<label class="mini-f"><span>Nombre</span><input id="adm-tn" maxlength="60" value="${esc(d.n)}"></label>
      <p class="hint">${n ? `La usan <b>${n}</b> ${n === 1 ? 'cuenta' : 'cuentas'}.` : 'Ninguna cuenta la usa todavía.'} Id: <code>${esc(id)}</code></p>
      <h3 class="sub-h">Secciones y funciones</h3>
      <div id="adm-perm">${permsHtml(d, null)}</div>
      <details class="adm-sec"><summary><span class="adm-sum"><b>Tipos de evento que se ofrecen</b></span></summary><div class="adm-feats">${cats(M.CATEGORIAS, 'hideEventCats')}</div></details>
      <details class="adm-sec"><summary><span class="adm-sum"><b>Categorías de Mi Informe</b></span></summary><div class="adm-feats">${cats(M.SERVICIO_CATS, 'hideServCats')}</div></details>
      <label class="check pad-top"><input type="checkbox" id="adm-goal" ${d.goal ? 'checked' : ''}> Invitar a activar la meta de horas (como Precursor)</label>
      ${builtin ? '<div class="stack pad"><button type="button" class="btn small ghost" data-a="adm-tpl-default">Volver a la de siempre</button></div>' : ''}`,
    actions: `${builtin ? '' : `<button type="button" class="btn ghost danger" data-a="adm-tpl-del" ${n ? 'disabled title="Hay cuentas con esta plantilla"' : ''}>Eliminar</button>`}<button type="button" class="btn primary" data-a="adm-tpl-save">Guardar</button>`,
  });
}

function tplNewView() {
  open({
    title: 'Nueva plantilla', back: mainView,
    body: `<label class="mini-f"><span>Nombre</span><input id="adm-nn" maxlength="60" placeholder="Ej. Siervo ministerial o Auxiliar"></label>
      <label class="mini-f pad-top"><span>Copiar de</span><select id="adm-from">${Object.entries(st.tpls).map(([k, t]) => `<option value="${esc(k)}">${esc(t.n)}</option>`).join('')}</select></label>
      <p class="hint">Empieza igual que la que elijas; después cambias lo que haga falta.</p>`,
    actions: '<button type="button" class="btn primary" data-a="adm-tpl-create">Crear</button>',
    focus: '#adm-nn',
  });
}
function tplCreate() {
  const name = String(document.getElementById('adm-nn')?.value || '').trim();
  if (!name) return toast('Escribe el nombre de la plantilla');
  const from = st.tpls[document.getElementById('adm-from')?.value] || st.tpls.publicador;
  let id = norm(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'tipo';
  if (!TYPE_ID_RE.test(id)) id = 'tipo';
  let k = id, i = 2;
  while (st.tpls[k]) k = `${id}-${i++}`;
  st.tpls[k] = { ...copyTpl(from), n: name.slice(0, 60) };
  st.tdraft = null;
  tplView(k);
  toast('Revisa lo que trae y toca Guardar');
}

async function saveTemplates(msg) {
  if (st.busy) return false;
  st.busy = true;
  try {
    const types = Object.fromEntries(Object.entries(st.tpls).map(([k, t]) => [k, cleanTemplate(t)]));
    await store.admin.saveTemplates(types);
    toast(msg);
    return true;
  } catch (e) { console.error(e); toast('No se pudo guardar. Revisa tu conexión y que las reglas estén publicadas'); return false; }
  finally { st.busy = false; }
}
async function tplSave() {
  const d = st.tdraft;
  if (!d) return;
  d.n = String(document.getElementById('adm-tn')?.value || '').trim() || d.n;
  st.tpls[st.tid] = { n: d.n.slice(0, 60), modules: [...d.modules], features: [...d.features], hideEventCats: [...d.hideEventCats], hideServCats: [...d.hideServCats], goal: !!d.goal };
  if (await saveTemplates(`Plantilla «${d.n}» guardada`)) { st.tdraft = null; st.tid = ''; st.tab = 'plantillas'; mainView(); }
}
async function tplDelete() {
  const id = st.tid;
  if (!id || BUILTIN.includes(id)) return;
  if (usersOf(id).length) return toast('Primero cambia de tipo a las cuentas que la usan');
  const prev = st.tpls[id];
  delete st.tpls[id];
  if (await saveTemplates(`Plantilla «${prev.n}» eliminada`)) { st.tdraft = null; st.tid = ''; st.tab = 'plantillas'; mainView(); }
  else st.tpls[id] = prev;
}

// ───── Eventos (propios de este panel; app.js no los conoce) ─────
let bound = false;
function bind() {
  if (bound) return;
  bound = true;
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-a^="adm-"]');
    if (!el || !el.closest('#sheet-root')) return;
    const { a, id, v } = el.dataset;
    if (a === 'adm-tab') { st.tab = v; mainView(); return document.querySelector(`#sheet-root .adm-tabs [data-v="${v}"]`)?.focus(); }   // el foco sigue en la pestaña
    if (a === 'adm-user') { st.draft = null; return userView(id); }
    if (a === 'adm-save-user') return saveUser();
    if (a === 'adm-reset') { const d = st.draft; st.draft = draftFor(d.type); refreshPerms(); return toast('Igual que la plantilla: toca Guardar para aplicarlo'); }
    if (a === 'adm-tpl') { st.tdraft = null; return tplView(id); }
    if (a === 'adm-tpl-new') return Object.keys(st.tpls).length >= 30 ? toast('Ya tienes 30 plantillas, que es el máximo. Borra una que no uses para crear otra') : tplNewView();
    if (a === 'adm-tpl-create') return tplCreate();
    if (a === 'adm-tpl-save') return tplSave();
    if (a === 'adm-tpl-del') return tplDelete();
    if (a === 'adm-tpl-default') {
      const t = M.DEFAULT_TEMPLATES[st.tid]; if (!t) return;
      st.tdraft = { n: t.n, modules: new Set(t.modules), features: new Set(t.features), hideEventCats: new Set(t.hideEventCats), hideServCats: new Set(t.hideServCats), goal: !!t.goal };
      tplView(st.tid);
      return toast('Como la de siempre: toca Guardar para aplicarlo');
    }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (!t.closest?.('#sheet-root')) return;
    const d = st.draft || st.tdraft;
    if (t.id === 'adm-type' && st.draft) { st.draft = draftFor(t.value); return userView(st.uid); }
    if (!d) return;
    if (t.dataset.admMod) { toggleModule(d, t.dataset.admMod, t.checked); st.openSecs.add(t.dataset.admMod); return refreshPerms(); }
    if (t.dataset.admFeat) { t.checked ? d.features.add(t.dataset.admFeat) : d.features.delete(t.dataset.admFeat); return refreshPerms(); }
    if (t.dataset.admCat && st.tdraft) { const set = st.tdraft[t.dataset.admCat]; t.checked ? set.delete(t.value) : set.add(t.value); return; }
    if (t.id === 'adm-goal' && st.tdraft) st.tdraft.goal = t.checked;
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'adm-q') { st.q = e.target.value; filterUsers(); }
    if (e.target.id === 'adm-tn' && st.tdraft) st.tdraft.n = e.target.value;
  });
  // Recordar qué secciones dejaste abiertas mientras marcas
  document.addEventListener('toggle', e => {
    const s = e.target;
    if (!s.matches?.('details.adm-sec[data-sec]')) return;
    s.open ? st.openSecs.add(s.dataset.sec) : st.openSecs.delete(s.dataset.sec);
  }, true);
}
