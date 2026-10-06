// 🛡 Mi administración (solo el administrador): cuentas y aprobaciones, quién usa la app y con qué versión,
// novedades y avisos de versión, y todo lo compartido en un solo lugar.
// También: 📰 Novedades (Ajustes, para todos) y el aviso en Hoy de cuentas que esperan aprobación.
import * as store from './store.js';
import { data, isCloud, account, session } from './store.js';
import * as M from './model.js';
import { esc, toast, fmtShort, today, dateOf, isPhone } from './util.js';
// Las hojas se piden solo cuando se abre una (así no pesan en el arranque de la app)
const Sheets = () => import('./sheets.js');
const open = (...a) => Sheets().then(m => m.open(...a));
import { openAdmin } from './admin.js';
import * as Rs from './respaldo.js';

let tab = 'cuentas';
let users = null, loading = null, loadedAt = 0;
const first = n => String(n || '').trim().split(/\s+/)[0] || '';
const isMe = u => u.uid === account.user?.uid;
const pending = () => (users || []).filter(u => !u.type && !isMe(u));

// Hace cuánto (texto corto)
function ago(iso) {
  if (!iso) return 'nunca';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 2) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : d < 31 ? `hace ${d} días` : fmtShort(dateOf(iso));
}
// Compara versiones 10.2.1 vs 10.10.0
const cmpV = (a, b) => String(a || '0').localeCompare(String(b || '0'), undefined, { numeric: true });

async function loadUsers(force = false) {
  if (!isCloud || !session.isAdmin) return [];
  if (!force && users && Date.now() - loadedAt < 120000) return users;
  if (loading) return loading;
  loading = store.admin.listUsers().then(l => { users = l; loadedAt = Date.now(); return l; }).catch(e => { console.warn(e); return users || []; }).finally(() => { loading = null; });
  return loading;
}

// De dónde se conecta este teléfono o computadora
function deviceName() {
  const native = !!window.Capacitor?.isNativePlatform?.();
  const installed = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone;
  return native ? 'App de Android' : `${isPhone() ? 'Teléfono' : 'Computadora'} · ${installed ? 'app instalada' : 'navegador'}`;
}

// ───────────── Avisos en Hoy (solo el administrador) ─────────────
let asked = false;
export function hoyNotices() {
  if (!isCloud || !account.user) return [];
  store.reportClient(M.APP_VERSION, deviceName());
  if (!session.isAdmin) return [];
  if (!asked) { asked = true; loadUsers().then(() => store.refresh()); }
  const p = pending();
  return p.length ? [`<button class="log-now" data-a="adm-hub" data-v="cuentas">🛡 <span><b>${p.length === 1 ? `${esc(p[0].name || p[0].email)} espera tu aprobación` : `${p.length} cuentas esperan tu aprobación`}</b><small>Toca para elegir su tipo de perfil y ${p.length === 1 ? 'darle' : 'darles'} acceso.</small></span></button>`] : [];
}
export const pendingCount = () => pending().length;

// ───────────── Pantalla principal ─────────────
export async function hub(t) {
  if (!session.isAdmin) return toast('Solo para el administrador');
  if (t) tab = t;
  const seg = (k, n) => `<button type="button" data-a="adm-hub" data-v="${k}" aria-pressed="${tab === k}">${n}</button>`;
  const head = `<div class="seg ah-seg" role="group" aria-label="Mi administración">${seg('cuentas', 'Cuentas')}${seg('uso', 'Uso')}${seg('novedades', 'Novedades')}${seg('compartido', 'Compartido')}${seg('respaldo', 'Respaldo')}</div>`;
  open({ title: '🛡 Mi administración', body: `${head}<div id="ah-body">${tab === 'novedades' ? newsAdminHtml() : tab === 'compartido' ? sharedHtml() : '<p class="hint pad">Cargando…</p>'}</div>` });
  if (tab === 'respaldo') { const html = await Rs.tabHtml(); const b = document.getElementById('ah-body'); if (b) b.innerHTML = html; return; }
  if (tab === 'cuentas' || tab === 'uso') {
    await loadUsers(true);
    const b = document.getElementById('ah-body');
    if (b) b.innerHTML = tab === 'cuentas' ? accountsHtml() : usageHtml();
    store.refresh();
  }
}

// Cuentas y aprobaciones
function accountsHtml() {
  const all = users || [];
  const p = pending(), ok = all.filter(u => u.type);
  const types = Object.entries(M.templates()).map(([k]) => [k, M.typeName(k)]);
  return `<div class="ah-kpis"><div><b>${ok.length}</b><small>con acceso</small></div><div class="${p.length ? 'warn' : ''}"><b>${p.length}</b><small>${p.length === 1 ? 'pendiente' : 'pendientes'}</small></div><div><b>${all.length}</b><small>cuentas</small></div></div>
    ${p.length ? `<h3 class="sub-h">Esperan tu aprobación</h3><div class="stack">${p.map(u => `<div class="card mini ah-pend">
      <b>${esc(u.name || 'Sin nombre')}</b><span class="hint">${esc(u.email || '')} · ${esc(ago(u.lastSeen))}</span>
      <div class="ah-row"><select id="ah-type-${esc(u.uid)}" aria-label="Tipo de perfil">${types.map(([k, n]) => `<option value="${esc(k)}" ${k === 'publicador' ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
      <button type="button" class="btn small primary" data-a="adm-approve" data-id="${esc(u.uid)}" data-name="${esc(u.name || u.email || '')}">Dar acceso</button></div></div>`).join('')}</div>`
      : '<p class="hint ok pad">✓ No hay cuentas esperando.</p>'}
    <h3 class="sub-h">Con acceso</h3>
    <div class="stack">${ok.map(u => `<div class="ah-user"><span class="grow"><b>${esc(u.name || u.email)}</b><small>${esc(M.typeName(u.type))}${(u.allow || []).length || (u.deny || []).length ? ' · con cambios' : ''}</small></span></div>`).join('') || '<p class="hint">Nadie todavía.</p>'}</div>
    <div class="stack pad-top"><button type="button" class="btn" data-a="adm-full" data-v="usuarios">⚙️ Funciones de cada cuenta</button><button type="button" class="btn ghost" data-a="adm-full" data-v="plantillas">📋 Plantillas por tipo de perfil</button></div>`;
}
export async function approve(uid, name) {
  const sel = document.getElementById(`ah-type-${uid}`);
  const type = sel?.value;
  if (!type) return;
  try { await store.admin.setAccess(uid, { type }); toast(`✓ ${first(name) || 'La cuenta'} ya tiene acceso como ${M.typeName(type)}`); }
  catch (e) { console.error(e); return toast('No se pudo aprobar. Revisa tu conexión'); }
  await loadUsers(true);
  hub('cuentas');
}

// Quién usa la app y con qué versión
function usageHtml() {
  const all = [...(users || [])].sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || ''));
  const cur = M.APP_VERSION;
  const old = all.filter(u => u.ver && cmpV(u.ver, cur) < 0).length;
  const week = all.filter(u => u.lastSeen && Date.now() - Date.parse(u.lastSeen) < 7 * 864e5).length;
  return `<div class="ah-kpis"><div><b>${week}</b><small>la usaron esta semana</small></div><div class="${old ? 'warn' : ''}"><b>${old}</b><small>con versión anterior</small></div><div><b>${esc(cur)}</b><small>versión actual</small></div></div>
    <p class="hint">Cada teléfono se anota cuando abre la app. Los que tienen una versión anterior se actualizan solos la próxima vez que la abran.</p>
    <div class="stack">${all.map(u => {
      const st = !u.ver ? '<span class="hint">sin dato de versión</span>' : cmpV(u.ver, cur) < 0 ? `<span class="warn-t">⚠ ${esc(u.ver)}</span>` : `<span class="ok-text">✓ ${esc(u.ver)}</span>`;
      return `<div class="ah-user"><span class="grow"><b>${esc(u.name || u.email)}${isMe(u) ? ' (tú)' : ''}</b><small>${esc(u.type ? M.typeName(u.type) : isMe(u) ? 'Administrador' : 'Pendiente')} · ${esc(ago(u.lastSeen))}${u.dev ? ` · ${esc(u.dev)}` : ''}</small></span>${st}</div>`;
    }).join('')}</div>`;
}

// ───────────── Novedades ─────────────
let editIdx = -1;
function newsAdminHtml() {
  const items = store.news.items();
  const cur = editIdx >= 0 ? items[editIdx] : null;
  const has = items.some(x => x.v === M.APP_VERSION);
  return `<p class="hint">Lo que escribas aquí lo ven todos en <b>Ajustes → 📰 Novedades</b>, sin avisos. Si marcas una versión como <b>importante</b>, a los demás les sale «Hay una versión nueva · Actualizar» en Hoy y les llega un aviso.</p>
    <div class="card ah-news-form">
      <h3 class="sub-h">${cur ? 'Editar novedad' : 'Nueva novedad'}</h3>
      <div class="two"><div class="f"><label for="nv-v">Versión</label><input id="nv-v" maxlength="20" value="${esc(cur?.v || M.APP_VERSION)}"></div>
      <div class="f"><label for="nv-d">Fecha</label><input id="nv-d" type="date" value="${esc(cur?.date || today())}"></div></div>
      <div class="f"><label for="nv-t">Qué hay de nuevo <span class="hint">(una cosa por línea)</span></label><textarea id="nv-t" rows="5" placeholder="Ej. Ahora puedes compartir una nota con otro anciano">${esc((cur?.notes || []).join('\n'))}</textarea></div>
      <label class="check"><input type="checkbox" id="nv-a" ${cur?.avisar ? 'checked' : ''}> ⭐ Importante: mostrar «Actualizar» y avisar a todos</label>
      <div class="stack"><button type="button" class="btn primary" data-a="news-save">${cur ? 'Guardar cambios' : 'Publicar novedad'}</button>${cur ? '<button type="button" class="btn ghost" data-a="news-cancel">Cancelar</button>' : ''}</div>
      ${!has && !cur ? '<p class="hint pad-top"><button type="button" class="link" data-a="news-fill">Traer las notas de esta versión</button></p>' : ''}
    </div>
    <h3 class="sub-h">Publicadas</h3>
    ${items.length ? `<div class="stack">${items.map((x, i) => `<div class="card mini"><span><b>${esc(x.v)}</b> <span class="hint">· ${esc(x.date ? fmtShort(x.date) : '')}</span>${x.avisar ? ' <span class="pchip">⭐ importante</span>' : ''}</span>
      <ul class="ah-notes">${(x.notes || []).map(n => `<li>${esc(n)}</li>`).join('')}</ul>
      <span><button type="button" class="link" data-a="news-edit" data-v="${i}">Editar</button> · <button type="button" class="link danger" data-a="news-del" data-v="${i}">Borrar</button></span></div>`).join('')}</div>` : '<p class="hint">Todavía no hay novedades publicadas.</p>'}`;
}
const reNews = () => { const b = document.getElementById('ah-body'); if (b) b.innerHTML = newsAdminHtml(); };
export function newsEdit(i) { editIdx = Number(i); reNews(); document.getElementById('nv-t')?.focus(); }
export function newsCancel() { editIdx = -1; reNews(); }
export async function newsFill() {
  try { const v = await (await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' })).json(); const t = document.getElementById('nv-t'); if (t) t.value = (v.notes || []).join('\n'); }
  catch { toast('No se pudieron leer las notas de la versión'); }
}
export async function newsSave() {
  const v = document.getElementById('nv-v')?.value.trim(), date = document.getElementById('nv-d')?.value || today();
  const notes = (document.getElementById('nv-t')?.value || '').split('\n').map(x => x.trim().replace(/^[-•·]\s*/, '')).filter(Boolean);
  const avisar = !!document.getElementById('nv-a')?.checked;
  if (!v) return toast('Escribe la versión');
  if (!notes.length) return toast('Escribe al menos una novedad');
  const items = store.news.items();
  const item = { v, date, notes, avisar };
  if (editIdx >= 0) items[editIdx] = item; else { const i = items.findIndex(x => x.v === v); if (i >= 0) items[i] = item; else items.unshift(item); }
  try { await store.news.save(items); editIdx = -1; toast(avisar ? '⭐ Publicada como importante: a todos les saldrá «Actualizar»' : '📰 Novedad publicada'); }
  catch (e) { console.error(e); return toast('No se pudo guardar. ¿Ya publicaste las reglas nuevas de Firestore?'); }
  reNews();
}
export async function newsDel(i) {
  const items = store.news.items();
  items.splice(Number(i), 1);
  try { await store.news.save(items); } catch { return toast('No se pudo borrar'); }
  editIdx = -1; reNews(); toast('Novedad borrada');
}

// Ajustes → 📰 Novedades (para todos)
export function newsHtml() {
  const items = store.news.items().slice(0, 15);
  return `<p class="hint">Lo nuevo de la app. Se actualiza sola, sin avisos; aquí puedes ver qué cambió. Tienes la versión <b>${esc(M.APP_VERSION)}</b>.</p>
    ${items.length ? items.map(x => `<section class="ah-news"><h3 class="sub-h">${x.avisar ? '⭐ ' : ''}Versión ${esc(x.v)}${x.date ? ` <span class="hint">· ${esc(fmtShort(x.date))}</span>` : ''}</h3><ul class="ah-notes">${(x.notes || []).map(n => `<li>${esc(n)}</li>`).join('')}</ul></section>`).join('')
      : '<p class="hint pad">Todavía no hay novedades publicadas.</p>'}
    ${session.isAdmin ? '<div class="stack pad"><button type="button" class="btn" data-a="adm-hub" data-v="novedades">✏️ Escribir novedades</button></div>' : ''}`;
}

// ───────────── Lo compartido ─────────────
function sharedHtml() {
  const cg = store.congre.sharing();
  const link = M.profile().share;
  const mine = store.shared.all().filter(d => d.owner === account.user?.uid);
  const rec = store.shared.received();
  const own = d => data.notes.find(n => n.shareId === d.id) || data.tasks.find(t => t.shareId === d.id);
  const names = d => Object.entries(d.memberNames || {}).filter(([u]) => u !== account.user?.uid).map(([, n]) => first(n)).join(', ');
  return `<h3 class="sub-h">🏛 Congregación</h3>
    ${cg?.on && (cg.members || []).length ? `<p>La compartes con <b>${esc(Object.values(cg.names || {}).join(', '))}</b>. Ven tu organigrama, grupos, mecánicas, visita y publicadores (solo lectura).</p>` : '<p class="hint">No la compartes con nadie.</p>'}
    <button type="button" class="btn small" data-a="cg-share">${cg?.on ? 'Cambiar con quién' : '👥 Compartir la congregación'}</button>
    <h3 class="sub-h">🔗 Enlace para los ancianos</h3>
    <p class="hint">${link?.secret || link?.id ? 'Está activo: quien tenga el enlace y la clave lo ve, sin cuenta.' : 'No hay enlace activo.'}</p>
    <button type="button" class="btn small" data-a="sh-open">${link?.secret || link?.id ? 'Ver el enlace' : 'Crear el enlace'}</button>
    <h3 class="sub-h">📝 Notas y tareas que compartes (${mine.length})</h3>
    ${mine.length ? `<div class="stack">${mine.map(d => { const o = own(d); return `<button type="button" class="card mini sh-row" ${o ? `data-a="${data.notes.includes(o) ? 'note' : 'task'}" data-id="${esc(o.id)}"` : 'disabled'}><span><b>${d.kind === 'task' ? '📋' : '📝'} ${esc(d.title)}</b></span><span class="hint">Con ${esc(names(d) || '—')}${(d.comments || []).length ? ` · 💬 ${d.comments.length}` : ''}</span></button>`; }).join('')}</div>` : '<p class="hint">Ninguna. Ábrela y toca «👥 Compartir con otro anciano…».</p>'}
    <h3 class="sub-h">📥 Te compartieron (${rec.length})</h3>
    ${rec.length ? '<button type="button" class="btn small" data-a="sh-inbox">Ver lo que te compartieron</button>' : '<p class="hint">Nada por ahora.</p>'}`;
}
export const full = t => openAdmin(t);
