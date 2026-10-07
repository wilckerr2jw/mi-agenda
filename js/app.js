// Punto de entrada: sesión, navegación por pestañas y manejo de toques (delegación de eventos).

import * as store from './store.js';
import * as V from './views.js';
import * as M from './model.js';
import * as Theme from './theme.js';
import { startTour } from './tour.js';
import * as Lock from './lock.js';
import * as N from './notify.js';
import * as WC from './weekcal.js';
import * as Nat from './native.js';
import * as Pa from './pastoreo.js';
import * as Mc from './mecas.js';
import * as Cm from './comite.js';
import * as Bor from './borrador.js';
import * as Vi from './visita.js';
import * as Sh from './compartir.js';
import * as Gc from './gcal.js';
import * as Fx from './corregir.js';
import * as Pwa from './pwa.js';
import * as Mv from './mover.js';
import * as Cp from './compartido.js';
import * as Ah from './adminhub.js';
import { $, $$, esc, ic, norm, today, toast, photoToDataUrl, addDays, uid, fmtShort, shareText } from './util.js';

// 📄 Las hojas (formularios, fichas, ajustes) pesan mucho y no hacen falta para pintar la primera
// pantalla: se cargan aparte. «S» es un intermediario que, mientras el archivo no haya llegado,
// recibe la llamada y la ejecuta en cuanto llegue. Una vez cargado, «S.loQueSea» es la función real.
let SM = null;                       // el módulo ya cargado (null hasta que llega)
let SP = null;                       // la carga en curso (para no pedirlo dos veces)
const loadSheets = () => SM ? Promise.resolve(SM) : (SP ??= import('./sheets.js').then(m => {
  SM = m;
  m.hooks.deptsChanged = () => render();           // al cambiar departamentos, se repinta
  m.hooks.eventSaved = date => {                   // al guardar un evento, el calendario salta a su fecha
    if (ui.route !== 'agenda') return;
    ui.agenda.sel = date;
    ui.agenda.ym = date.slice(0, 7);
  };
  return m;
}));
const S = new Proxy({}, { get: (_, k) => SM ? SM[k] : (...a) => loadSheets().then(m => m[k](...a)) });

// Estado de la interfaz (no se guarda; solo vive mientras la app está abierta)
const ui = {
  route: 'hoy',
  agenda: { span: (() => { try { return Number(localStorage.getItem('miagenda.semanaDias')) || 0; } catch { return 0; } })(), ym: today().slice(0, 7), sel: today(), mode: (() => { try { return localStorage.getItem('miagenda.agendaVista') || 'mes'; } catch { return 'mes'; } })() },
  tareas: { f: 'activas', p: '', m: '', view: (() => { try { return localStorage.getItem('miagenda.tareasVista') || 'lista'; } catch { return 'lista'; } })(),
    group: (() => { try { return localStorage.getItem('miagenda.tareasGrupo') || 'fecha'; } catch { return 'fecha'; } })(), closed: [] },
  personas: { q: '', seg: 'personas', g: '', pv: '' },
  notas: { seg: 'notas', q: '', tag: '' },
  informe: { sy: 0, sm: '' },
  congre: { view: (() => { try { return localStorage.getItem('miagenda.orgVista') || 'lista'; } catch { return 'lista'; } })(), picking: false, picked: [], sorting: false, fold: (() => { try { return JSON.parse(localStorage.getItem('miagenda.orgPlegados') || '[]'); } catch { return []; } })() },
};
const ROUTES = ['hoy', 'agenda', 'tareas', 'personas', 'notas', 'informe', 'congregacion'];
const ROUTE_NAMES = { hoy: 'Hoy', agenda: 'Agenda', tareas: 'Tareas', personas: 'Personas', notas: 'Notas', informe: 'Informe', congregacion: 'Congregación' };
// En el teléfono la barra de abajo lleva Hoy + 3 secciones + «Más»; si una está oculta, sube la siguiente
const BAR_ORDER = ['agenda', 'tareas', 'informe', 'personas', 'notas', 'congregacion'];
const barSplit = () => { const vis = BAR_ORDER.filter(r => M.isModuleVisible(r)); return { bar: vis.slice(0, 3), more: vis.slice(3) }; };

// ───────────── Pintado ─────────────

const data_ready = () => store.all('profile').length > 0 || store.all('events').length > 0 || !store.isCloud;
// Rutinas que se marcaron como hechas desde un aviso (se aplican cuando el evento ya está cargado)
let pendingDone = null, pendingLog = false;
// «Hoy no salí»: el recordatorio de la noche no insiste ese día (se guarda en el perfil, los últimos 60 días)
function markNoActivity(day = today()) {
  store.patchProfile(v => ({ noActivityDays: [...new Set([...(v.noActivityDays || []), day])].sort().slice(-60) }));
  toast('Anotado: hoy sin actividad. ¡Mañana será!');
}
function queueDone(eid, day, o = {}) { if (eid && day) { pendingDone = { eid, day, until: Date.now() + 30000, widget: !!o.widget }; applyPendingDone(); } }
function applyPendingDone() {
  if (pendingLog && !$('#app').hidden && data_ready()) { pendingLog = false; setTimeout(() => runQuick('time'), 300); }
  if (!pendingDone) return;
  if (Date.now() > pendingDone.until) { pendingDone = null; return; }
  const e = store.get('events', pendingDone.eid);
  if (!e) return;
  const { day, widget } = pendingDone; pendingDone = null;
  if (!M.isDoneBy(e, day, store.doneId())) store.toggleDone(e, day);
  toast(`✓ Marcado como hecho: ${e.title}`);
  if (widget) { Nat.refreshWidget(); setTimeout(() => Nat.minimize(), 1400); }   // desde el widget: se marca y vuelve a la pantalla de inicio
}

function render() {
  const view = $('#view');
  const focused = document.activeElement?.id === 'q' ? document.activeElement.selectionStart : null;
  const y = window.scrollY;
  permStyle();
  // 🛡 La sección abierta ya no está permitida (el administrador la apagó, o los permisos llegaron después
  // de abrir con #/seccion en la dirección): se vuelve a Hoy en vez de seguir mostrándola
  if (ui.route !== 'hoy' && !M.isModuleVisible(ui.route)) {
    if (location.hash === `#/${ui.route}`) history.replaceState(history.state, '', '#/hoy');
    ui.route = 'hoy';
  }
  view.innerHTML = V[ui.route](ui);
  const { bar, more } = barSplit();
  { const adm = $('#tabs .tab-admin'); if (adm) { adm.hidden = !(store.session.isAdmin && store.isCloud); const n = Ah.pendingCount(); adm.querySelector('.ah-badge')?.remove(); if (n) adm.lastElementChild.insertAdjacentHTML('beforeend', ` <b class="ah-badge">${n}</b>`); } }
  $$('#tabs .tab[data-a="nav"]').forEach(b => {
    b.hidden = b.dataset.v !== 'hoy' && !M.isModuleVisible(b.dataset.v);
    b.setAttribute('aria-current', b.dataset.v === ui.route ? 'page' : 'false');
    const i = b.dataset.v === 'hoy' ? 0 : bar.indexOf(b.dataset.v) + 1;
    const inBar = i > 0 || b.dataset.v === 'hoy';
    b.dataset.bar = inBar ? '1' : '0';   // en el teléfono, las demás van en «Más»
    b.style.setProperty('--o', inBar ? i : 9);
  });
  const mb = $('#tabs .tab-more');
  if (mb) { mb.classList.toggle('on', more.includes(ui.route)); mb.setAttribute('aria-current', more.includes(ui.route) ? 'page' : 'false'); }
  updateBadge();
  document.title = ui.route === 'hoy' ? 'Mi Agenda Teocrática' : `${ROUTE_NAMES[ui.route]} · Mi Agenda Teocrática`;
  $('#fab').setAttribute('aria-label', { hoy: 'Agregar', agenda: 'Agregar evento', tareas: 'Nueva tarea', personas: ui.personas.seg === 'grupos' ? 'Nuevo grupo' : 'Nueva persona', notas: ui.notas.seg === 'reuniones' ? 'Nueva reunión' : 'Nueva nota', informe: 'Editar mes actual', congregacion: 'Nuevo departamento' }[ui.route]);
  $('#fab').hidden = ui.route === 'agenda' && !!ui.agenda.picking;   // al seleccionar varios, el botón + no tapa «Eliminar»
  if (focused !== null) { const q = $('#q'); q?.focus(); q?.setSelectionRange(focused, focused); }
  window.scrollTo(0, y);
  if (ui.route === 'agenda' && ui.agenda.mode === 'semana') WC.mount(c => S.calMove(c, render), (date, time, endTime) => S.eventSheet(null, { date, time, endTime }));
}

// Número en el ícono de la app: tareas atrasadas + rutinas de hoy que faltan por marcar
function updateBadge() {
  try {
    const t = today(), me = store.doneId();
    const late = M.isModuleVisible('tareas') ? (store.all('tasks') || []).filter(x => x.status !== 'hecha' && x.due && x.due < t && M.isMineTask(x)).length : 0;
    const routines = (store.all('events') || []).filter(e => M.isRoutine(e) && M.occursOn(e, t) && !M.isDoneBy(e, t, me)).length;
    Pwa.setBadge(late + routines);
  } catch { /* datos aún sin cargar */ }
}

// «Más» (teléfono): las secciones que no caben en la barra, Buscar y Ajustes
function moreSheet() {
  const { more } = barSplit();
  const icon = v => $(`#tabs .tab[data-v="${v}"] .pill`)?.innerHTML || '';
  S.open({ title: 'Más', body: `<div class="more-list">
    ${more.map(v => `<button type="button" class="more-item" data-a="more-go" data-v="${v}" ${ui.route === v ? 'aria-current="page"' : ''}><span class="pill">${icon(v)}</span><span>${esc(ROUTE_NAMES[v])}</span></button>`).join('')}
    ${store.session.isAdmin && store.isCloud ? `<button type="button" class="more-item" data-a="adm-hub" data-v="cuentas"><span class="pill">${ic('shield')}</span><span>Mi administración${Ah.pendingCount() ? ` <b class="ah-badge">${Ah.pendingCount()}</b>` : ''}</span></button>` : ''}
    <button type="button" class="more-item" data-a="search"><span class="pill">${ic('search')}</span><span>Buscar</span></button>
    <button type="button" class="more-item" data-a="settings"><span class="pill">${ic('more')}</span><span>Ajustes</span></button>
  </div>` });
}

// 🛡 Funciones apagadas por el administrador: sus botones no se muestran (en las pantallas y en las hojas)
function permStyle() {
  let st = document.getElementById('perm-css');
  if (!st) { st = document.createElement('style'); st.id = 'perm-css'; document.head.append(st); }
  const css = M.permCss();
  if (st.textContent !== css) st.textContent = css;
}

function go(route) {
  if (!ROUTES.includes(route) || (route !== 'hoy' && !M.isModuleVisible(route))) route = 'hoy';
  const changed = ui.route !== route;
  ui.route = route;
  history.replaceState(history.state, '', `#/${route}`);
  render();
  window.scrollTo(0, 0);
  if (changed) {
    const v = $('#view'); v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter');   // transición suave
    const h = $('#view h1');   // los lectores de pantalla anuncian la sección nueva
    if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  }
}

function refreshList() {
  const box = $('#results');
  if (box) box.innerHTML = ui.route === 'personas' ? V.personasList(ui) : V.notasList(ui);
}

// ───────────── Acciones ─────────────

function toggleTask(id, o = {}) {
  const t = store.get('tasks', id);
  if (!t) return;
  const wasDone = t.status === 'hecha';
  // 👥 Compartida por otra cuenta: se marca en la tarea compartida y a quien la compartió le llega
  if (t.sharedItemId) {
    store.shared.setDone(t.sharedItemId, !wasDone).then(ok => ok && toast(wasDone ? 'Vuelve a estar pendiente' : `✓ ¡Hecha! ${String(t.fromName).split(' ')[0]} lo verá`));
    return;
  }
  const next = { ...t, status: wasDone ? ((t.log || []).length ? 'seguimiento' : 'pendiente') : 'hecha', doneAt: wasDone ? '' : today() };
  const again = !wasDone ? M.repeatNext(t, uid()) : null;
  if (again) next.repeatDone = true;
  // Si se repite y está compartida, la compartida pasa a la siguiente; la hecha queda solo tuya
  if (again && t.shareId) { delete next.shareId; delete next.shareWith; delete next.shareNames; }
  store.upsert('tasks', next);
  if (again) store.upsert('tasks', again);
  if (o.quiet) return;
  if (!wasDone) toast(again ? `Tarea completada. La próxima: ${fmtShort(again.due)}` : 'Tarea completada', 'Deshacer', () => { store.upsert('tasks', t); if (again) store.remove('tasks', again.id); });
}
// La otra persona marcó hecha (o volvió a abrir) una tarea que le compartiste
store.sharedHooks.taskDone = (id, done, who) => {
  const t = store.get('tasks', id);
  if (!t || (t.status === 'hecha') === done) return;
  toggleTask(id, { quiet: true });
  toast(done ? `✓ ${String(who).split(' ')[0]} marcó hecha «${t.title}»` : `${String(who).split(' ')[0]} volvió a abrir «${t.title}»`, null, null, 8000);
};

function shiftMonth(n) {
  const [y, m] = ui.agenda.ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  ui.agenda.ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  render();
}

function fab() {
  switch (ui.route) {
    case 'hoy': return S.quickAdd();
    case 'agenda': return S.eventSheet(null, { date: ui.agenda.sel });
    case 'tareas': return S.taskSheet(null);
    case 'personas': return ui.personas.seg === 'grupos' ? S.groupSheet(null) : S.personSheet(null);
    case 'notas': return ui.notas.seg === 'reuniones' ? S.meetingSheet(null) : S.noteSheet(null);
    case 'informe': return S.catPickSheet(today().slice(0, 7));
    case 'congregacion': return S.deptSheet(null);
  }
}

// Departamentos plegados en el organigrama (se recuerdan en este dispositivo)
function saveFold(list) {
  ui.congre.fold = list;
  try { localStorage.setItem('miagenda.orgPlegados', JSON.stringify(list)); } catch { /* sin almacenamiento */ }
  render();
}

const markBackup = () => { try { localStorage.setItem('miagenda.ultimoRespaldo', today()); } catch { /* sin almacenamiento */ } };
// Respaldo a Google Drive: en el teléfono se abre «Compartir» (elige Drive → Guardar); en la computadora se descarga
async function backupToDrive() {
  const file = new File([store.exportAll()], `mi-agenda-respaldo-${today()}.json`, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Respaldo de Mi Agenda' }); markBackup(); toast('Listo. Si elegiste Drive, tu respaldo quedó en tu cuenta de Google'); render(); return; }
  } catch (e) { if (e?.name === 'AbortError') return; }
  download(file.name, await file.text()); markBackup();
  toast('Respaldo descargado: súbelo a tu Google Drive (drive.google.com → Nuevo → Subir archivo)', '', null, 9000);
  render();
}
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// Recordar qué secciones de Congregación dejaste abiertas o cerradas
document.addEventListener('toggle', e => {
  const d = e.target;
  if (!d.matches?.('details.csec')) return;
  try { const m = JSON.parse(localStorage.getItem('miagenda.congreSecs') || '{}'); m[d.dataset.sec] = d.open; localStorage.setItem('miagenda.congreSecs', JSON.stringify(m)); } catch { /* sin almacenamiento */ }
}, true);
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el) { if (e.target.classList?.contains('scrim')) S.closeOrBack(true); return; }
  const { a, id, v } = el.dataset;
  if (el.closest('summary')) e.preventDefault();   // un botón en el título de una sección no la pliega
  { const fx = M.actionFeature(a, v); if (fx && !M.featureOn(fx)) return toast(M.FEATURE_OFF_MSG); }   // 🛡 función apagada por el administrador
  switch (a) {
    // navegación
    case 'nav': return go(v);
    case 'more-nav': return moreSheet();
    case 'more-go': {   // se cambia de sección cuando el «atrás» de la hoja ya terminó (si no, la dirección vuelve a la anterior)
      let done = false;
      const run = () => { if (done) return; done = true; window.removeEventListener('popstate', run); go(v); };
      window.addEventListener('popstate', run);
      S.close(); setTimeout(run, 400); return;
    }
    case 'sw-update': return Pwa.applyUpdate();
    case 'inf-months': ui.informe.all = !ui.informe.all; return render();
    case 'meca-offline': return Mc.saveOffline(el);
    case 'fab': return fab();
    case 'settings': return S.settings('');
    case 'set-sec': return S.settings(v);
    case 'search': return S.searchSheet();
    case 'sheet-close': return S.closeOrBack(true);
    // eventos y calendario
    case 'event': return S.eventSheet(id, { occDate: el.dataset.occ || '' });
    case 'new-event': return S.eventSheet(null, { date: el.dataset.date });
    case 'skip-occ': case 'unskip-occ': return S.toggleSkipOccurrence(id, el.dataset.date);
    case 'cal-sel': ui.agenda.sel = el.dataset.date; return render();
    case 'ev-pick-mode': ui.agenda.picking = v === 'on'; ui.agenda.picked = []; return render();
    case 'ev-pick-all': { const ids = v.split(',').filter(Boolean); const cur = new Set(ui.agenda.picked || []); const all = ids.every(x => cur.has(x)); ids.forEach(x => (all ? cur.delete(x) : cur.add(x))); ui.agenda.picked = [...cur]; return render(); }
    case 'ev-bulk-share': return S.bulkShareSheet(ui.agenda.picked || [], () => { ui.agenda.picking = false; ui.agenda.picked = []; render(); });
    case 'bulk-share-go': return S.bulkShareGo();
    case 'ev-done': { const on = store.toggleDone(store.get('events', id), el.dataset.date); if (on) toast('¡Hecho! ✓'); if ($('.hc-list')) setTimeout(() => S.avisosCheck(), 300); return; }
    case 'occ-edit': return S.occEdit(id, el.dataset.date);
    case 'ev-dup': return S.eventSheet(null, { copyOf: id });
    case 'wk-move': { const n = Number(v); if (V.weekSpan(ui.agenda) === 7) ui.agenda.week = n ? addDays(ui.agenda.week || M.mondayOf(today()), n) : M.mondayOf(today()); else ui.agenda.day = n ? addDays(ui.agenda.day || today(), n) : today(); return render(); }
    case 'wk-span': ui.agenda.span = Number(v); try { localStorage.setItem('miagenda.semanaDias', v); } catch { /* sin almacenamiento */ } return render();
    case 'wk-tpl': return S.weekTemplates(V.weekStartOf(ui.agenda), V.weekSpan(ui.agenda));
    case 'wk-tpl-save': return S.weekTemplateSave();
    case 'wk-tpl-apply': return S.weekTemplateApply(id);
    case 'wk-tpl-del': return S.weekTemplateDelete(id);
    case 'wk-share': return import('./weekimg.js').then(W => W.shareWeek(M.mondayOf(V.weekStartOf(ui.agenda))));
    case 'cal-move-one': return S.calMoveApply(false);
    case 'cal-move-all': return S.calMoveApply(true);
    case 'cal-move-cancel': return S.calMoveCancel();
    case 'ev-bulk-delete': { const n = S.removeManyWithUndo('events', ui.agenda.picked || []); ui.agenda.picking = false; ui.agenda.picked = []; render(); return n; }
    case 'agenda-mode': ui.agenda.picking = false; ui.agenda.mode = v; try { localStorage.setItem('miagenda.agendaVista', v); } catch { /* sin almacenamiento */ } return render();
    case 'cal-prev': return shiftMonth(-1);
    case 'cal-next': return shiftMonth(1);
    case 'cal-today': ui.agenda = { ...ui.agenda, ym: today().slice(0, 7), sel: today() }; return render();
    // tareas
    case 'task': return S.taskSheet(id);
    case 'dept-task': return S.taskSheet(id, {}, () => S.deptSheet(el.dataset.dept || ''));
    case 'assign-stop': return S.assignStop(id);
    case 'as-inbox': return S.assignedInboxSheet();
    case 'as-accept': return S.assignedAnswer(id, true);
    case 'as-reject': return S.assignedAnswer(id, false);
    case 'as-log': return S.assignedLog(id);
    case 'as-toggle': return S.assignedToggle(id);
    case 'dept-assign': return S.deptAssign(id, el.dataset.v ?? '');
    case 'dept-suggest-tasks': return S.deptSuggestSheet();
    case 'dept-suggest-save': return S.deptSuggestSave();
    case 'new-task': return S.taskSheet(null);
    case 'toggle-task': return toggleTask(id);
    case 'filter-tasks': ui.tareas.f = v; return render();
    case 'tasks-view': ui.tareas.view = v; try { localStorage.setItem('miagenda.tareasVista', v); } catch { /* sin almacenamiento */ } return render();
    case 'task-move-pick': return S.taskMoveSheet(id);
    case 'task-move': S.close(); return Mv.moveTask(id, v, openDeptGroup);
    case 'tasks-group': ui.tareas.group = v === 'depto' ? 'depto' : 'fecha'; try { localStorage.setItem('miagenda.tareasGrupo', ui.tareas.group); } catch { /* sin almacenamiento */ } return render();
    case 'log-add': return S.addLog(id);
    case 'task-in-sheet': {
      const { bk, bid } = el.dataset;
      return S.taskSheet(id, {}, () => (bk === 'person' ? S.personDetail(bid) : S.meetingSheet(bid)));
    }
    // personas
    case 'person': return S.personDetail(id);
    case 'new-person': return S.personSheet(null);
    case 'edit-person': return S.editPerson(id);
    case 'new-task-for': return S.newTaskFor(id);
    case 'pseg': ui.personas.seg = v; return render();
    case 'pfilter': ui.personas.g = v; return render();
    case 'group': return S.groupDetail(id);
    case 'new-group': return S.groupSheet(null);
    case 'edit-group': return S.groupSheet(id, () => S.groupDetail(id));
    case 'person-in-sheet': return S.personDetail(id, () => S.groupDetail(el.dataset.bid));
    case 'keep': return S.keepSheet();
    case 'auto-backups': return S.autoBackupsSheet();
    case 'dept': return S.deptSheet(id);
    case 'dept-new': return S.deptSheet(null, { parentId: id || '' });
    case 'dept-suggest': S.deptLoadSuggested(); return render();
    case 'congre-edit': return S.congreSheet();
    case 'dept-send': return S.deptSend(id);
    case 'org-paste': return S.pasteSheet();
    case 'paste-read': return S.pasteRead();
    case 'paste-apply': return S.pasteApply();
    case 'person-merge': return S.mergeSheet(id);
    case 'person-merge-go': return S.mergePeople(id);
    case 'dept-send-share': return S.deptSendShare(id, v);
    case 'load-g': ui.congre.lg = v; return render();
    case 'comite-share': return Cm.shareSummary();
    case 'sh-open': return Sh.sheet();
    case 'sh-create': return Sh.create();
    case 'sh-save': return Sh.saveChoice();
    case 'sh-rekey': return Sh.confirm('rekey');
    case 'sh-rekey-go': return Sh.create(true);
    case 'sh-off': return Sh.confirm('off');
    case 'sh-off-go': return Sh.turnOff();
    case 'sh-copy': return Sh.copy(v);
    case 'sh-send': return Sh.send(v);
    case 'gcal-open': return Gc.sheet();
    case 'gcal-copy': return Gc.copyScript();
    case 'gcal-connect': return Gc.connect();
    case 'gcal-sync': return Gc.syncButton();
    case 'gcal-pause': return Gc.togglePause();
    case 'gcal-off': return Gc.confirmOff();
    case 'gcal-off-go': return Gc.disconnect();
    case 'inbox-discard': return S.inboxDiscard();
    case 'send-note': return S.sendNoteSheet(id);
    case 'send-note-go': return S.sendNoteGo(id, v, el.dataset.name);
    case 'admin-send-go': return S.adminSendGo();
    case 'visita-new': return Vi.newVisit();
    case 'visita-create': return Vi.createVisit();
    case 'visita-open': return Vi.openVisit(id);
    case 'visita-check': return Vi.check(el);
    case 'visita-ans': return Vi.answer(el);
    case 'visita-na': return Vi.toggleNa(el);
    case 'visita-ask': return Vi.ask(id, v);
    case 'visita-meeting': return Vi.meetingFromTopics(id);
    case 'visita-past-log': return Vi.logPastoreo(id);
    case 'dictate': return import('./voz.js').then(Vz => Vz.dictate(el));
    case 'ics-export': return import('./ics.js').then(I => I.exportIcs());
    case 'meca-import': return Mc.importSheet();
    case 'meca-paste': return Mc.pasteChosen();
    case 'meca-save': return Mc.save().then(render);
    case 'meca-view': return Mc.viewSheet(id);
    case 'meca-bapt': return Mc.baptSheet();
    case 'meca-bapt-save': return Mc.baptSave().then(render);
    case 'meca-suggest': return Mc.suggest(ui.congre.mm || 3);
    case 'meca-months': ui.congre.mm = Number(v) || 3; return render();
    case 'meca-elders': ui.congre.me = !ui.congre.me; return render();
    case 'sy-move': if (v) { ui.informe.sy = Number(v); ui.informe.sm = ''; } return render();
    // Congregacion · Asistencia a las reuniones
    case 'as-new': return S.asistenciaSheet(id || '');
    case 'as-del': return S.asistenciaDel(id);
    case 'as-share': return import('./asistencia.js').then(A => A.compartirMes(v));
    // Congregacion · Tablero de anuncios
    case 'tb-new': return S.tableroSheet(id || '');
    case 'tb-del': return S.tableroDel(id);
    case 'tb-sugeridos': return import('./tablero.js').then(T => { T.cargarSugeridos(); render(); });
    case 'tb-share': return import('./tablero.js').then(T => T.compartir());
    // Congregacion · Limpieza y mantenimiento
    case 'lp-turno': return S.lpTurnoSheet(id || '');
    case 'lp-gen': return S.lpGenSheet();
    case 'lp-mant': return S.lpMantSheet(id || '');
    case 'lp-del': return S.lpDel(id);
    case 'lp-hecho': return import('./limpieza.js').then(L => { L.marcarHecho(id); render(); });
    case 'lp-share': return import('./limpieza.js').then(L => L.compartir());
    // Congregacion · Programa de las reuniones
    case 'pg-new': return S.programaSheet(id || '', v || 'semana');
    case 'pg-del': return S.programaDel(id);
    case 'pg-share': return import('./programa.js').then(P => P.compartir(id));
    case 'pg-import': return S.programaImport();
    case 'pg-import-save': return S.programaImportSave();
    case 'pg-print': return import('./programa.js').then(P => P.imprimir(id || ''));
    case 'lp-import': return S.lpImport();
    case 'lp-import-save': return S.lpImportSave();
    case 'lp-print': return import('./limpieza.js').then(L => L.imprimir());
    case 'as-print': return import('./asistencia.js').then(A => A.imprimir(v));
    case 'tb-print': return import('./tablero.js').then(T => T.imprimir());
    case 'tb-file-quitar': return import('./tablero.js').then(T => T.quitarArchivo());
    case 'tb-pick': ui.congre = { ...ui.congre, tbPick: !ui.congre.tbPick }; return render();
    case 'tb-quitar': return import('./tablero.js').then(T => { if (T.quitarMarcados()) { ui.congre = { ...ui.congre, tbPick: false }; render(); } });
    // Resumen del año de servicio listo para enviar (reports.js se pide solo al tocarlo)
    case 'inf-share': return import('./reports.js')
      .then(R => shareText(R.informeAnualText(Number(v)), { title: 'Informe del año de servicio', copied: 'Resumen copiado' }));
    case 'meca-add-person': return Mc.addPerson(el.dataset.name);
    case 'remind-tasks': return import('./recordar.js').then(R => R.sheet(v === undefined || v === '' ? 3 : Number(v)));
    case 'remind-send': return import('./recordar.js').then(R => R.send(v, el.dataset.k));
    case 'remind-copy': return import('./recordar.js').then(R => R.copy(v, el.dataset.k));
    // 👥 Congregación compartida y notas o tareas compartidas (compartido.js)
    case 'cg-share': return Cp.congreShareSheet();
    case 'cg-share-save': return Cp.congreShareSave();
    case 'cg-share-stop': return Cp.congreShareStop();
    case 'cg-offer': return Cp.offerSheet(id);
    case 'cg-follow': return Cp.follow(id);
    case 'cg-decline': return Cp.decline(id);
    case 'cg-unfollow': return Cp.unfollow();
    case 'sh-share': return Cp.itemShareSheet(v, id);
    case 'sh-share-save': return Cp.itemShareSave(v, id, !!el.dataset.stop);
    case 'sh-comment': return Cp.comment(id);
    case 'sh-inbox': return Cp.inboxSheet();
    case 'sh-item': return Cp.itemSheet(id);
    case 'sh-done': return Cp.setDone(id, v === '1');
    case 'sh-done-seen': return Cp.doneSeen(id, v);
    // 🛡 Mi administración y 📰 Novedades (adminhub.js)
    case 'adm-hub': return Ah.hub(v);
    case 'adm-approve': return Ah.approve(id, el.dataset.name);
    case 'adm-full': return Ah.full(v);
    case 'news-save': return Ah.newsSave();
    case 'news-edit': return Ah.newsEdit(v);
    case 'news-del': return Ah.newsDel(v);
    case 'news-cancel': return Ah.newsCancel();
    case 'news-fill': return Ah.newsFill();
    // 💾 Respaldo completo de todas las cuentas (respaldo.js)
    case 'rs-copy': return import('./respaldo.js').then(R => R.copyScript());
    case 'rs-connect': return import('./respaldo.js').then(R => R.connect()).then(ok => ok && Ah.hub('respaldo'));
    case 'rs-now': return import('./respaldo.js').then(R => R.now()).then(ok => ok && Ah.hub('respaldo'));
    case 'rs-key': return import('./respaldo.js').then(R => R.copyKey());
    case 'rs-off': return import('./respaldo.js').then(R => R.off()).then(ok => ok && Ah.hub('respaldo'));
    case 'rs-dl': return import('./respaldo.js').then(R => R.download(id));
    case 'rs-send': return import('./respaldo.js').then(R => R.send(id, el.dataset.name));
    case 'meca-add-unknown': return Mc.addUnknown();
    case 'meca-add-all': Mc.addAll(id); return render();
    case 'meca-mv': ui.congre.mv = v; return render();
    case 'meca-share': return Mc.shareProgram(id);
    case 'meca-print': return Mc.printProgram(id);
    case 'meca-remind': return Mc.remindSheet(id, v || 'semana');
    case 'meca-remind-send': return Mc.remindSend(id, v, el.dataset.k);
    case 'dept-unskip': S.deptRestoreSkipped(); return setTimeout(render, 50);
    case 'org-pick': ui.congre = { ...ui.congre, picking: !ui.congre.picking, picked: [], sorting: false }; return render();
    case 'org-view': ui.congre.view = v; try { localStorage.setItem('miagenda.orgVista', v); } catch { /* sin almacenamiento */ } return render();
    case 'org-sort': ui.congre = { ...ui.congre, sorting: !ui.congre.sorting, picking: false }; return render();
    case 'dept-move': S.deptMove(id, v); return render();
    case 'org-fold': { const f = new Set(ui.congre.fold || []); f.has(id) ? f.delete(id) : f.add(id); return saveFold([...f]); }
    case 'org-fold-all': return saveFold(v === 'close' ? (store.all('depts') || []).filter(d => (store.all('depts') || []).some(x => x.parentId === d.id)).map(d => d.id) : []);
    case 'org-pick-all': ui.congre.picked = (store.all('depts') || []).map(d => d.id); return render();
    case 'org-del': { const n = S.deptRemoveMany(ui.congre.picked); ui.congre = { ...ui.congre, picking: false, picked: [] }; return n ? render() : null; }
    case 'org-share': return import('./orgimg.js').then(O => O.shareOrg());
    case 'org-download': return import('./orgimg.js').then(O => O.downloadOrg());
    case 'org-print': return import('./orgimg.js').then(O => O.printOrg());
    case 'visit-new': return S.visitSheet(id, v);
    case 'helped-edit': return S.helpedSheet(id);
    case 'visit-del': return S.visitDelete(id, v);
    case 'study-edit': return S.studySheet(id);
    case 'new-assign': return S.eventSheet(null, { category: 'asignacion', date: today() });
    case 'seguimiento': ui.personas.seg = 'seguimiento'; return go('personas');
    case 'ab-restore': return S.autoBackupRestore(el.dataset.v, el.dataset.only);
    case 'keep-import': return S.keepImport();
    case 'theme': Theme.toggle(); return render();
    case 'theme-set': Theme.set(v); render(); return S.settings();
    case 'accent-set': Theme.setAccent(v); render(); return S.settings();
    case 'size-set': Theme.setSize(v); render(); return S.settings();
    // notas y reuniones
    case 'note': return S.noteSheet(id);
    case 'new-note': return S.noteSheet(null);
    case 'note-in-sheet': {
      const { bk, bid } = el.dataset;
      return S.noteSheet(id, () => (bk === 'person' ? S.personDetail(bid) : S.meetingSheet(bid)));
    }
    case 'meeting': return S.meetingSheet(id);
    case 'new-meeting': return S.meetingSheet(null);
    case 'agree-task': return S.agreementTask(id, el.dataset.i);
    // agenda de la reunión
    case 'ag-add': return S.agendaAdd();
    case 'ag-cancel': return S.agendaCancel();
    case 'ag-edit': return S.agendaEdit(el.dataset.i);
    case 'ag-del': return S.agendaDelete(el.dataset.i);
    case 'ag-move': return S.agendaMove(el.dataset.i, el.dataset.d);
    case 'ag-pending': return S.agendaPending();
    case 'ag-share': return S.agendaShare();
    case 'ag-paste': return S.agendaPaste();
    case 'junta-start': return S.juntaStart(id);
    case 'notif-test': return S.notifTest();
    case 'sound-play': return N.playSound(v);
    case 'apk-update': return Nat.openDownload();
    case 'nat-exact': return Nat.askExact().then(() => S.settings());
    case 'nat-pending': return S.showPending();
    case 'nat-resched': return Nat.rescheduleNow().then(ok => { toast(ok ? '🔄 Avisos programados de nuevo' : 'Esto solo funciona en la app de Android'); return S.avisosCheck(); });
    case 'nat-exact-check': return Nat.askExact().then(() => S.avisosCheck());
    case 'phone-set': return Nat.openPhoneSettings(v, el.dataset.ch || '').then(ok => { if (!ok) toast(v === 'battery' ? 'Ábrelo en Ajustes del teléfono → Aplicaciones → Agenda Teocrática → Batería → «Sin restricciones»' : 'Ábrelo en Ajustes del teléfono → Aplicaciones → Agenda Teocrática → Notificaciones y enciende todos los tipos de aviso', null, null, 10000); });
    case 'routine-on': {   // desde la revisión de avisos: que este evento pregunte «¿Ya lo hiciste?»
      const ev = store.get('events', id);
      if (!ev) return;
      store.upsert('events', { ...ev, routine: true });
      toast(`🔔 Listo: «${ev.title}» te preguntará si ya lo hiciste`);
      return Nat.rescheduleNow().then(() => S.avisosCheck());
    }
    case 'nat-exact-hoy': return Nat.askExact().then(render);
    case 'nat-test': return Nat.test().then(ok => toast(ok ? 'En 5 segundos te llega un aviso de prueba' : 'No se pudo programar la prueba'));
    case 'shared-unhide': store.upsert('profile', { ...M.profile(), id: 'me', sharedHidden: [] }); return S.settings();
    case 'ag-deadline-off': return S.agendaSetDeadline('');
    case 'ag-mode': return S.agendaSetMode(v);
    case 'ag-merge': return S.agendaMerge();
    case 'ag-pend-add': return S.agendaPendingAdd();
    case 'ag-assign-save': return S.agendaAssignSave();
    case 'ag-to-notes': return S.agendaToNotes();
    case 'agree-person': return S.agreementPerson(el.dataset.name);
    case 'resp-add-person': return S.responsibleAddPerson(el.dataset.name);
    case 'subject-add-person': return S.subjectAddPerson(el.dataset.name);
    case 'type-remove': return S.typeRemove(el.dataset.col, el.dataset.v);
    case 'priv-add': return S.privilegeAdd();
    case 'task-from-meeting': return S.taskSheet(null, { meetingId: id, kind: 'otro' }, () => S.meetingSheet(id));
    case 'seg': ui.notas.seg = v; return render();
    case 'tag': ui.notas.tag = v; return render();
    // informe de servicio
    case 'profile': return S.profileSheet();
    case 'month': return S.monthSheet(id, el.dataset.credit === '1');
    case 'cat-pick': return S.catPickSheet(el.dataset.mid, () => S.monthSheet(el.dataset.mid));
    case 'new-entry': return S.entrySheet(null, { cat: el.dataset.cat, mid: el.dataset.mid }, el.dataset.from === 'fix' ? () => Fx.fixMonthSheet(el.dataset.mid) : () => S.monthSheet(el.dataset.mid));
    // ✏️ corregir un mes anterior
    case 'fix-open': return Fx.fixMonthSheet(id || undefined);
    case 'fix-month': return id ? Fx.fixMonthSheet(id) : undefined;
    case 'fix-entry': return S.entrySheet(id, {}, () => Fx.fixMonthSheet(el.dataset.mid));
    case 'fix-add': return S.catPickSheet(el.dataset.mid, () => Fx.fixMonthSheet(el.dataset.mid), 'fix');
    case 'entry': return S.entrySheet(id, {}, () => S.monthSheet(el.dataset.mid));
    case 'adj': return S.adjustMinutes(Number(el.dataset.delta));
    case 'study-add': return S.studyAdd();
    case 'past-import': return Pa.importSheet();
    case 'past-save': return Pa.save();
    case 'xf-adj': return S.extraAdjust(el.dataset.k, el.dataset.d);
    case 'xf-new': return S.infoFieldNew();
    case 'info-fields': return S.infoFieldsSheet();
    case 'study-remove': return S.studyRemove(el.dataset.i);
    case 'share-month': return S.shareMonth(id, el.dataset.credit === '1');
    case 'cat-add': return S.catAdd();
    case 'cat-remove': return S.catRemove(el.dataset.i);
    case 'cat-edit': return S.catEdit(el.dataset.i);
    case 'cat-cancel': return S.catCancel();
    // administración de usuarios
    case 'admin': return S.adminSheet();
    case 'guide': return S.guideSheet(S.settings);
    case 'tour': S.close(); return tour();
    case 'pin': return S.pinSheet(v);
    case 'meeting-next': return S.meetingNext(id);
    case 'supervision': return S.supervisionSheet(id || '', id ? () => S.meetingSheet(id) : null);
    case 'sup-task': { const mid = el.dataset.mid || ''; return S.taskSheet(id, {}, () => S.supervisionSheet(mid, mid ? () => S.meetingSheet(mid) : null)); }
    case 'sup-share': return S.supervisionShare(id || '');
    case 'participation': return S.participationSheet(v || 6);
    case 'tpl-save': return S.templateSave();
    case 'tpl-load': return S.templateLoad(id);
    case 'tpl-del': return S.templateDelete(id);
    case 'qa': return runQuick(v);
    case 'guide-first': return S.guideSheet();
    case 'import-confirm': return S.importConfirm();
    // mi semana
    case 'week-plan': return S.weekPlanSheet();
    case 'plan-adj': return S.planAdjust(el.dataset.d, el.dataset.delta);
    case 'wgoal-add': return S.weekGoalAdd();
    case 'wgoal-toggle': return S.weekGoalToggle(el.dataset.i);
    case 'wgoal-remove': return S.weekGoalRemove(el.dataset.i);
    case 'photo-clear': return S.clearPhoto(el.dataset.target, el.dataset.fallback);
    // agregar rápido
    case 'quick':   // la nueva hoja reemplaza a la de opciones
      return ({
        event: () => S.eventSheet(null, { date: today() }),
        task: () => S.taskSheet(null),
        person: () => S.personSheet(null),
        group: () => S.groupSheet(null),
        note: () => S.noteSheet(null),
        meeting: () => S.meetingSheet(null),
      }[v]?.());
    // datos
    case 'delete': return el.dataset.col === 'depts' ? S.deptRemove(id) : S.removeWithUndo(el.dataset.col, id);
    case 'export': markBackup(); return download(`mi-agenda-${today()}.json`, store.exportAll());
    case 'backup-drive': return backupToDrive();
    case 'signout': S.close(); return store.account.signOut();
  }
});

document.addEventListener('input', e => {
  if (e.target.form?.id === 'f') Bor.track(e.target.form);
  if (e.target.classList?.contains('fx-in')) e.target.classList.toggle('changed', e.target.value.trim() !== (e.target.defaultValue || '').trim());   // borrador por si la app se recarga antes de guardar
  if (e.target.id === 'q') { ui[ui.route].q = e.target.value; refreshList(); }
  else if (e.target.dataset?.par) import('./programa.js').then(P => P.parEditado(e.target));   // demostraciones: la pareja, del mismo sexo
  else if (e.target.id === 'cat-name') S.catNameInput(e.target.value);
  else if (e.target.id === 'meca-text') Mc.textEdited(e.target);
  else if (e.target.id === 'past-text') Pa.textChanged();
  else if (e.target.dataset?.visitNote || e.target.dataset?.visitNotes) Vi.noteInput(e.target);
  else if (e.target.id === 'set-q') S.settingsFilter(e.target.value);
  else if (e.target.id === 'title' && e.target.form?.dataset.form === 'event') { S.categoryAuto(e.target.form); S.routineAuto(e.target.form); }   // «pastoreo» → Pastoreo; «texto diario», «lectura»… son rutinas
  else if (e.target.dataset?.agreements) S.refreshAgreements();
  else if (e.target.classList?.contains('pp-q')) S.pickerFilter(e.target);
  else if (e.target.matches?.('[data-psel-q]')) {   // 🔍 buscar hermano en la lista del departamento
    const box = e.target.closest('.psel'), q = norm(e.target.value);
    let shown = 0;
    const lazy = !!box.dataset.lazy;
    box.querySelectorAll('.psel-row').forEach(r => { const hideHead = box.dataset.psel === 'helperIds' && document.querySelector(`.psel[data-psel="headIds"] input[value="${r.dataset.id}"]:checked`); const checked = r.querySelector('input')?.checked; const ok = !hideHead && (q ? r.dataset.n.includes(q) : (!lazy || checked)); r.hidden = !ok; if (ok) shown++; });
    const em = box.querySelector('.psel-empty');
    em.hidden = !!shown;
    if (!shown) em.textContent = q ? 'Nadie con ese nombre.' : 'Escribe parte del nombre y marca a los que participan.';
  }
  else if (e.target.classList?.contains('pp-other')) S.pickerChanged(e.target);
  else if (e.target.id === 'gsearch') {
    const box = $('#gresults');
    if (box) box.innerHTML = S.renderSearchResults(e.target.value);
  }
});

// Al volver de los ajustes del teléfono (batería, avisos), la revisión de avisos se actualiza sola
document.addEventListener('visibilitychange', () => { if (!document.hidden && $('.hc-list')) setTimeout(() => S.avisosCheck(), 600); });

// 🖥 Atajos de teclado en la computadora: 1–7 cambian de sección, N agrega, / busca (no actúan mientras escribes)
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  const t = e.target;
  if (t.closest?.('input, textarea, select, [contenteditable="true"]') || $('#sheet-root .scrim') || $('#app').hidden || document.body.classList.contains('locked')) return;
  if (/^[1-7]$/.test(e.key)) { const tab = $$('#tabs .tab[data-a="nav"]').filter(b => !b.hidden)[Number(e.key) - 1]; if (tab) { e.preventDefault(); tab.click(); } }
  else if (e.key === 'n' || e.key === 'N') { const f = $('#fab'); if (f && !f.hidden) { e.preventDefault(); f.click(); } }
  else if (e.key === '/' && M.featureOn('general.buscar')) { e.preventDefault(); S.searchSheet(); }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'log-text') { e.preventDefault(); $('[data-a="log-add"]')?.click(); }
  if (e.key === 'Enter' && e.target.id === 'sh-text') { e.preventDefault(); $('[data-a="sh-comment"]')?.click(); }
  if (e.key === 'Enter' && e.target.id === 'study-name') { e.preventDefault(); $('[data-a="study-add"]')?.click(); }
  if (e.key === 'Enter' && e.target.id === 'priv-new') { e.preventDefault(); $('[data-a="priv-add"]')?.click(); }
  if (e.key === 'Enter' && e.target.id === 'ag-t') { e.preventDefault(); $('[data-a="ag-add"]')?.click(); }
  if (e.key === 'Enter' && e.target.id === 'wgoal-text') { e.preventDefault(); $('[data-a="wgoal-add"]')?.click(); }
  if (e.key === 'Enter' && e.target.id === 'xf-new') { e.preventDefault(); $('[data-a="xf-new"]')?.click(); }
});

document.addEventListener('change', e => {
  if (e.target.form?.id === 'f') Bor.track(e.target.form);
  const t = e.target;
  if (t.id === 'tareas-person') { ui.tareas.p = t.value; return render(); }
  if (t.id === 'as-mes') { ui.congre = { ...ui.congre, asMes: t.value }; return render(); }
  if (t.id === 'tareas-meeting') { ui.tareas.m = t.value; return render(); }
  if (t.id === 'personas-priv') { ui.personas.pv = t.value; return render(); }
  if (t.name === 'catIcon') return S.catIconPicked(t.value);
  if (t.name === 'priv') return S.privilegeChanged();
  if (t.closest?.('[data-pp]') && (t.name?.startsWith('pp-') || t.classList.contains('pp-other'))) return S.pickerChanged(t);
  if (t.id === 'ag-max') return S.agendaSetMax(t.value);
  if (t.id === 'ag-deadline') return S.agendaSetDeadline(t.value);
  if (t.id === 'ag-show-times') return S.agendaSetShowTimes(t.checked);
  if (t.id === 'time' && t.form?.dataset.form === 'meeting') return S.refreshAgendaBox();
  if (t.id === 'pin-delay') { Lock.setDelay(t.value); return S.settings(); }
  if (t.id === 'bio-toggle') return S.bioToggle(t.checked, t);
  if (t.id === 'notif-toggle') return S.notifToggle(t.checked, t);
  if (t.id === 'notif-hour') { N.setPref('hour', Number(t.value)); return; }
  if (t.id === 'notif-before') { N.setPref('before', Number(t.value)); return; }
  if (t.id === 'notif-taskhour') { N.setPref('taskHour', Number(t.value)); return; }
  if (t.id === 'notif-logat') { N.setPref('logAt', Number(t.value)); return; }
  if (t.name === 'notif-sound') { N.setPref('sound', t.value); N.playSound(t.value); return; }
  if (t.matches?.('input[data-a="notif-pref"]')) { N.setPref(t.dataset.v, t.checked); if (t.dataset.v === 'details') S.settings(); return; }
  if (t.matches?.('input[data-a="ag-pick"]')) return S.agendaTogglePick(t.dataset.id);
  if (t.matches?.('select[data-admin-uid]')) return S.adminSetType(t.dataset.adminUid, t.value, t);
  if (t.matches?.('input[data-a="ev-pick"]')) { const cur = new Set(ui.agenda.picked || []); t.checked ? cur.add(t.value) : cur.delete(t.value); ui.agenda.picked = [...cur]; return render(); }
  if ((t.id === 'repeat' || t.id === 'due') && t.form?.dataset.form === 'task') {   // 🔁 explica cómo se repetirá
    const h = document.getElementById('repeat-hint'), r = t.form.repeat?.value;
    if (h) { h.hidden = !r; h.textContent = r ? `${M.repeatLabel(r, t.form.due?.value)}. Al marcarla como hecha se crea la siguiente.` : ''; }
    if (t.id === 'repeat') return;
  }
  if (t.id === 'meca-file') return Mc.fileChosen(t);
  if (t.id === 'past-file') return Pa.fileChosen(t);
  if (t.name === 'shsec' && t.value === 'acuerdos') { const b = document.getElementById('sh-mts'); if (b) b.hidden = !t.checked; return; }
  if (t.matches?.('input[data-a="gcal-opt"]')) return Gc.setOpt(t.dataset.v, t.checked);
  if (t.dataset?.adminSend) return S.adminSend(t);
  if (t.dataset?.visitStart) return Vi.startChanged(t);
  if (t.id === 'stats-month') { ui.informe.sm = t.value; return render(); }
  if (t.id === 'fix-month') return Fx.fixMonthSheet(t.value);
  if (t.name === 'visitPast') return Vi.pastPicked(t);
  if (t.id === 'auto-heads') {   // comité / cuerpo de ancianos: se llena solo o a mano
    const hb = document.getElementById('heads-box'), hl = document.getElementById('auto-heads-list');
    if (hb) hb.hidden = t.checked; if (hl) hl.hidden = !t.checked; return;
  }
  if (t.id === 'kind' && t.form?.dataset.form === 'visit') { const box = document.getElementById('visit-lesson'); if (box) box.hidden = t.value !== 'estudio'; const w = document.getElementById('visit-with'); if (w) w.hidden = t.value !== 'pastoreo'; return; }
  if (t.id === 'has-helpers') { const b = document.getElementById('helpers-box'); if (b) b.hidden = !t.checked; return; }
  if (t.matches?.('.psel[data-psel="headIds"] input[type=checkbox]')) {   // quien es responsable no sale en ayudantes
    document.querySelectorAll(`.psel[data-psel="helperIds"] .psel-row[data-id="${t.value}"]`).forEach(r => { r.hidden = t.checked; const c = r.querySelector('input[type=checkbox]'); if (t.checked && c) c.checked = false; });
    return;
  }
  if (t.matches?.('input[data-a="org-pick-item"]')) { const cur = new Set(ui.congre.picked || []); t.checked ? cur.add(t.value) : cur.delete(t.value); ui.congre.picked = [...cur]; return render(); }
  if (t.id === 'pastoreo-scope') { store.patchProfile({ pastoreoScope: t.value }); return render(); }
  if (t.id === 'pastoreo-months') { store.patchProfile({ pastoreoMonths: Number(t.value) || 6 }); return render(); }
  if (t.id === 'repeat' && t.form?.dataset.form === 'event') { const box = document.getElementById('repeat-days'); if (box) box.hidden = t.value !== 'days'; S.routineAuto(t.form); return; }
  if (t.id === 'routine' && t.form?.dataset.form === 'event') { t.dataset.set = '1'; return; }   // la elegiste tú: ya no cambia sola
  if (t.matches?.('select[data-otro]')) {   // «✏️ Nuevo tipo…» muestra el campo de texto
    const box = document.getElementById(t.dataset.otro);
    if (box) { box.hidden = t.value !== '__otro'; if (!box.hidden) box.querySelector('input')?.focus(); }
    if (t.id === 'category' && t.form?.dataset.form === 'event') {   // reunión de ancianos: participantes en vez de un solo acompañante
      if (!t.dataset.autoing) t.dataset.manual = '1';   // lo elegiste tú: el título ya no lo cambia
      const isAncianos = t.value === 'ancianos';
      const single = document.getElementById('companion-single');
      const group = document.getElementById('companion-group');
      const EF = M.eventFields(t.value);   // cada tipo muestra solo los campos que le sirven
      const tb = document.getElementById('theme-box');
      if (tb) { tb.hidden = !EF.theme && !t.form.theme.value; const l = document.getElementById('theme-lbl'); if (l) l.innerHTML = `${esc(EF.themeLabel)} <span class="hint">(opcional)</span>`; t.form.theme.placeholder = EF.themePh; }
      const cl = document.getElementById('companion-lbl'); if (cl) cl.textContent = EF.companionLabel;
      if (single) single.hidden = isAncianos || (!EF.companion && !t.form.companionId?.value);
      if (group) group.hidden = !isAncianos;
      const asg = document.getElementById('asg-box');
      if (asg) asg.hidden = t.value !== 'asignacion';
      S.routineAuto(t.form);
    }
    return;
  }
  if (t.matches?.('input[data-a="toggle-quick"]')) { S.toggleQuick(t.dataset.v); render(); return S.settings(); }
  if (t.matches?.('input[data-a="toggle-module"]')) {
    S.toggleModule(t.dataset.v);
    if (ui.route === t.dataset.v) go('hoy'); else render();
    return S.settings();
  }
  if (t.matches?.('input[type="file"][data-photo-for]')) {
    const file = t.files?.[0];
    if (!file) return;
    photoToDataUrl(file).then(dataUrl => {
      const field = t.dataset.photoFor;
      const hidden = document.getElementById(field);
      const preview = document.getElementById(field + 'Preview');
      if (hidden) hidden.value = dataUrl;
      if (preview) preview.innerHTML = `<img src="${dataUrl}" alt="">`;
    }).catch(() => toast('No se pudo usar esa foto'));
    return;
  }
  if (t.id === 'tb-file') return import('./tablero.js').then(T => T.fileChosen(t));
  if (t.id === 'pg-file') return import('./programa.js').then(P => P.fileChosen(t));
  if (t.id === 'lp-file') return import('./limpieza.js').then(L => L.fileChosen(t));
  if (t.id === 'keep-file') { const files = [...(t.files || [])]; if (files.length) S.keepFiles(files); return; }
  if (t.id !== 'import-file') return;
  const file = t.files?.[0];
  if (!file) return;
  file.text().then(txt => S.importPreview(txt));   // primero muestra qué se va a restaurar y pide confirmar
});

// Calendario: deslizar de lado cambia de mes, como pasar la hoja de una agenda de papel.
// Solo en la cuadricula del mes, que no tiene desplazamiento horizontal propio.
let desliz = null;
document.addEventListener('touchstart', e => {
  desliz = e.touches.length === 1 && e.target.closest?.('.cal')
    ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
}, { passive: true });
document.addEventListener('touchend', e => {
  const d = desliz;
  desliz = null;
  if (!d || !e.changedTouches.length) return;
  const dx = e.changedTouches[0].clientX - d.x;
  const dy = e.changedTouches[0].clientY - d.y;
  // Tiene que ser claramente horizontal y largo: si no, es un toque o un desplazamiento vertical
  if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
  shiftMonth(dx < 0 ? 1 : -1);
}, { passive: true });

// Tareas: recordar si la sección «Baja prioridad» está abierta
document.addEventListener('toggle', e => { if (e.target.matches?.('details.tgroup.low')) ui.tareas.lowOpen = e.target.open; }, true);
// Tareas por departamento: al mover una tarea a un departamento cerrado, se abre para verla
function openDeptGroup(k) { if ((ui.tareas.closed || []).includes(k)) ui.tareas.closed = ui.tareas.closed.filter(x => x !== k); }
Mv.initTaskDrag(openDeptGroup);
// Tareas por departamento: recordar qué departamentos cerraste (mientras la app esté abierta)
document.addEventListener('toggle', e => {
  if (!e.target.matches?.('details.tgroup.dept')) return;
  const k = e.target.dataset.k, set = new Set(ui.tareas.closed || []);
  if (e.target.open) set.delete(k); else set.add(k);
  ui.tareas.closed = [...set];
}, true);
document.addEventListener('submit', e => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  S.submit(form);
});

// ───────────── Inicio de sesión (solo modo nube) ─────────────

const AUTH_ERRORS = {
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/wrong-password': 'Correo o contraseña incorrectos.',
  'auth/user-not-found': 'Correo o contraseña incorrectos.',
  'auth/invalid-email': 'El correo no es válido.',
  'auth/email-already-in-use': 'Ese correo ya tiene una cuenta. Prueba con «Entrar».',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
  'auth/network-request-failed': 'Sin conexión. Revisa tu internet e inténtalo de nuevo.',
  'auth/operation-not-allowed': 'El acceso con correo no está activado en Firebase.',
};

function showLogin(message = '') {
  $('#app').hidden = true;
  const box = $('#login');
  box.hidden = false;
  box.innerHTML = `<div class="login-card">
    <div><h1>Mi Agenda</h1><p class="sub">Inicia sesión para ver tus notas, tareas y agenda en cualquier dispositivo.</p></div>
    <form id="login-form" novalidate>
      <div class="f"><label for="em">Correo</label><input id="em" type="email" autocomplete="email" inputmode="email" required></div>
      <div class="f"><label for="pw">Contraseña</label><div class="pw-wrap"><input id="pw" type="password" autocomplete="current-password" required><button type="button" class="pw-eye" aria-label="Mostrar la contraseña" aria-pressed="false">${ic('eye')}</button></div></div>
      <p class="err" id="login-err" role="alert">${esc(message)}</p>
      <button class="btn primary" type="submit">Entrar</button>
      <button class="btn ghost" type="button" id="btn-signup">Crear cuenta</button>
      <button class="link" type="button" id="btn-reset">Olvidé mi contraseña</button>
      <a class="link" href="guia.html" target="_blank" rel="noopener">¿Cómo funciona la app? Ver la guía</a>
    </form></div>`;

  box.querySelector('.pw-eye').addEventListener('click', e => {
    const b = e.currentTarget, inp = $('#pw'), show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    b.setAttribute('aria-pressed', String(show));
    b.setAttribute('aria-label', show ? 'Ocultar la contraseña' : 'Mostrar la contraseña');
    b.innerHTML = ic(show ? 'eye-off' : 'eye');
    inp.focus();
  });
  const err = m => { $('#login-err').textContent = m; };
  const creds = () => ({ email: $('#em').value.trim(), pass: $('#pw').value });
  const run = async fn => {
    err('');
    try { await fn(); } catch (ex) { err(AUTH_ERRORS[ex.code] || `No se pudo completar (${ex.code || ex.message}).`); }
  };

  $('#login-form').addEventListener('submit', ev => {
    ev.preventDefault();
    const { email, pass } = creds();
    if (!email || !pass) return err('Escribe tu correo y contraseña.');
    run(() => store.account.signIn(email, pass));
  });
  $('#btn-signup').addEventListener('click', () => {
    const { email, pass } = creds();
    if (!email || !pass) return err('Escribe un correo y una contraseña para crear tu cuenta.');
    run(() => store.account.signUp(email, pass));
  });
  $('#btn-reset').addEventListener('click', () => {
    const { email } = creds();
    if (!email) return err('Escribe tu correo arriba y vuelve a tocar esta opción.');
    run(async () => { await store.account.reset(email); err('Te enviamos un correo para cambiar la contraseña.'); });
  });
}

// Cuenta creada pero aún sin tipo de perfil asignado por el administrador
function showPending(user) {
  $('#app').hidden = true;
  S.close();
  const box = $('#login');
  box.hidden = false;
  box.innerHTML = `<div class="login-card">
    <div><h1>Cuenta en revisión</h1>
    <p class="sub">Tu cuenta <b>${esc(user.email || '')}</b> ya está creada. El administrador debe asignarte un tipo de perfil (Publicador, Precursor o Anciano / Siervo ministerial). Esta pantalla se abrirá sola cuando esté lista.</p></div>
    <form id="pending-form" novalidate>
      <div class="f"><label for="pn">Tu nombre</label><input id="pn" maxlength="80" autocomplete="name" placeholder="Para que el administrador te reconozca"></div>
      <p class="err" id="pending-msg" role="status"></p>
      <button class="btn primary" type="submit">Enviar mi nombre</button>
      <button class="btn ghost" type="button" id="btn-out">Cerrar sesión</button>
      <a class="link" href="guia.html" target="_blank" rel="noopener">Mientras esperas, mira la guía de uso</a>
    </form></div>`;
  $('#pending-form').addEventListener('submit', ev => {
    ev.preventDefault();
    const name = $('#pn').value.trim();
    if (!name) return $('#pn').focus();
    store.setDirectoryName(name)
      .then(() => { $('#pending-msg').textContent = 'Listo, el administrador ya puede ver tu nombre.'; })
      .catch(() => { $('#pending-msg').textContent = 'No se pudo enviar. Revisa tu conexión.'; });
  });
  $('#btn-out').addEventListener('click', () => store.account.signOut());
}

function showLoading() {
  $('#app').hidden = true;
  const box = $('#login');
  box.hidden = false;
  box.innerHTML = '<div class="login-card"><p class="sub">Cargando…</p></div>';
}

let syncingUid = null;
function onAccess(user) {
  if (store.hasAccess()) {
    if (syncingUid !== user.uid) { store.startSync(user.uid); syncingUid = user.uid; setTimeout(() => N.refresh(), 4000); }
    if (!M.isModuleVisible(ui.route) && ui.route !== 'hoy') ui.route = 'hoy';
    showApp();
  } else {
    if (syncingUid) { store.stopSync(); syncingUid = null; }
    showPending(user);
  }
}

// Bloqueo con PIN (si está activado): se pide al abrir y al volver a la app
let lockStarted = false;
function lockOnce() {
  if (lockStarted) return;
  lockStarted = true;
  Lock.init(() => {
    if (store.isCloud) toast('Para quitar el PIN, cierra sesión y vuelve a entrar', 'Cerrar sesión', () => { Lock.clearPin(); store.account.signOut(); }, 12000);
    else toast('En modo local el PIN no se puede restablecer');
  });
}

// Recorrido guiado: siempre empieza en Hoy, arriba de todo
function tour() {
  go('hoy');
  setTimeout(() => startTour(() => toast('¡Listo! Si tienes dudas, en Ajustes está la guía rápida', 'Ver guía', () => S.guideSheet(), 8000)), 250);
}

// Accesos rápidos (fila de Hoy y accesos del ícono de la app: #/do/<acción>)
function runQuick(id) {
  const mid = today().slice(0, 7);
  const actions = {
    time: () => S.catPickSheet(mid),
    task: () => S.taskSheet(null),
    meeting: () => S.meetingSheet(null),
    note: () => S.noteSheet(null),
    event: () => S.eventSheet(null, { date: today() }),
    person: () => { go('personas'); ui.personas.seg = 'personas'; render(); setTimeout(() => $('#q')?.focus(), 50); },
    week: () => S.weekPlanSheet(),
    supervise: () => { ui.tareas = { ...ui.tareas, f: 'activas', m: '__sup' }; go('tareas'); },
    search: () => S.searchSheet(),
    assign: () => S.eventSheet(null, { category: 'asignacion', date: today() }),
    follow: () => { ui.personas.seg = 'seguimiento'; go('personas'); },
  };
  const q = M.QUICK_ACTIONS.find(x => x.id === id);
  if (!q || (q.mod && !M.isModuleVisible(q.mod))) return;
  if (!M.quickAllowed(id)) return toast(M.FEATURE_OFF_MSG);
  actions[id]?.();
}
function runHashAction() {
  const m = location.hash.match(/^#\/do\/(\w+)/);
  if (!m) return;
  history.replaceState(history.state, '', '#/hoy');
  ui.route = 'hoy';
  render();
  setTimeout(() => runQuick(m[1]), 100);
}
window.addEventListener('hashchange', () => { if (!$('#app').hidden) runHashAction(); });

// La primera vez que alguien entra a la app en este teléfono, se le ofrece el recorrido
let guideOffered = false;
function offerGuide() {
  if (guideOffered) return;
  guideOffered = true;
  let seen = false;
  try { seen = localStorage.getItem('miagenda.guiaVista') === '1' || localStorage.getItem('miagenda.recorrido') === '1'; localStorage.setItem('miagenda.guiaVista', '1'); } catch { /* sin almacenamiento */ }
  if (location.hash.startsWith('#/do/')) return;
  if (!seen) setTimeout(() => toast('¿Primera vez aquí? Haz un recorrido de un minuto', 'Empezar', tour, 12000), 800);
}

// Aviso cuando no hay conexión
function netState() { document.body.classList.toggle('offline', !navigator.onLine); }
window.addEventListener('online', () => { netState(); toast('✓ Conexión de vuelta: se guardó todo lo pendiente'); });
window.addEventListener('offline', netState);
netState();

let natStarted = false;
function showApp() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  render();
  if (Nat.isNative && !natStarted) {   // app de Android: avisos en el teléfono y aviso de actualización
    natStarted = true;
    Nat.init({ done: (eid, day, o) => queueDone(eid, day, o), log: () => { pendingLog = true; applyPendingDone(); }, noActivity: markNoActivity, changed: () => render() });
  }
  lockOnce();
  runHashAction();
  offerGuide();
  Pwa.persistOnce();
  openShared();
  // Ya está pintada la pantalla: ahora, en un hueco libre, se traen las hojas para que el
  // primer formulario que abras salga al instante.
  (window.requestIdleCallback || (f => setTimeout(f, 600)))(() => {
    loadSheets();
    // ¿Hay Almacenamiento? De ello depende que se ofrezca guardar el archivo original
    import('./archivos.js').then(A => A.comprobar()).then(hay => { if (hay) render(); }).catch(() => {});
  });
}

// ───────────── Arranque ─────────────

// Versión nueva en espera: aviso en Hoy y en Ajustes (se recarga al tocar «Actualizar»)
function registerServiceWorker() {
  Pwa.register(() => { if (!$('#app').hidden) render(); if (document.querySelector('#sheet-root .set-menu')) S.settings(''); });
}

// «Compartir» una foto o PDF desde otra app → se abre el importador de asignaciones mecánicas con ese archivo
let sharedPending = false;
async function openShared() {
  if (!sharedPending || $('#app').hidden || !data_ready()) return;
  sharedPending = false;
  const files = await Pwa.takeShared();
  if (!files.length) return;
  if (!M.isModuleVisible('congregacion')) return toast('Para importar ese archivo, activa la sección Congregación en Ajustes');
  await Mc.importSheet();
  setTimeout(() => Mc.fileChosen({ files }), 80);
}

async function boot() {
  Theme.init(() => { if (!$('#app').hidden) render(); });
  const initial = location.hash.replace('#/', '');
  if (ROUTES.includes(initial) && (initial === 'hoy' || M.isModuleVisible(initial))) ui.route = initial;
  else if (ROUTES.includes(initial)) history.replaceState(history.state, '', '#/hoy');   // sección no permitida

  store.setErrorHandler(err => {
    console.error(err);
    toast(err?.friendly ? err.friendly : err?.code === 'permission-denied'
      ? 'Sin permiso para guardar. Revisa las reglas de Firestore.'
      : 'No se pudo guardar. Se reintentará cuando haya conexión.');
  });
  store.onData(() => { if (!$('#app').hidden) render(); });
  let offered = false;   // una vez al abrir: si quedó un formulario sin guardar, se ofrece recuperarlo
  store.onData(() => { if (!offered && !$('#app').hidden) { offered = true; setTimeout(() => Bor.offer(S), 1200); setTimeout(() => S.inboxCheck(), 2500); } });
  // «✓ Ya lo hice» desde un aviso: marca la rutina en cuanto se cargan los datos
  store.onData(applyPendingDone);
  store.onData(() => openShared());
  store.onData(() => Nat.schedule());
  // Enlace para los ancianos y Google Calendar: se actualizan solos cuando cambian tus datos
  store.onData(() => { Sh.autoUpdate(); Gc.autoSync(); });
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('hecho')) queueDone(q.get('hecho'), q.get('dia'));
    if (q.get('accion') === 'registrar') pendingLog = true;
    if (q.get('accion') === 'nosali') setTimeout(() => markNoActivity(), 1500);
    if (q.get('compartido')) sharedPending = true;
    if (q.get('hecho') || q.get('accion') || q.get('compartido')) history.replaceState(history.state, '', location.pathname + location.hash);
  } catch { /* sin parámetros */ }
  navigator.serviceWorker?.addEventListener('message', ev => {
    if (ev.data?.type === 'hecho') queueDone(ev.data.eid, ev.data.day);
    if (ev.data?.type === 'registrar') { pendingLog = true; applyPendingDone(); }
    if (ev.data?.type === 'nosali') markNoActivity();
    if (ev.data?.type === 'aviso' && document.visibilityState === 'visible') N.playSound();
  });

  registerServiceWorker();

  if (!store.isCloud) {
    store.local.start();
    return showApp();
  }

  window.addEventListener('offline', () => toast('Sin conexión: tus cambios se guardan y se enviarán al volver.'));

  try {
    await store.account.init(user => {
      if (user) { showLoading(); store.watchAccess(user, () => onAccess(user)); }
      else { store.stopAccess(); store.stopSync(); syncingUid = null; showLogin(); }
    });
  } catch (err) {
    console.error(err);
    showLogin('No se pudo cargar Firebase. Abre la app con internet al menos una vez.');
  }
}

boot();
