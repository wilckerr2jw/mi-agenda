// Punto de entrada: sesión, navegación por pestañas y manejo de toques (delegación de eventos).

import * as store from './store.js';
import * as V from './views.js';
import * as S from './sheets.js';
import * as M from './model.js';
import * as Theme from './theme.js';
import { startTour } from './tour.js';
import * as Lock from './lock.js';
import * as N from './notify.js';
import * as WC from './weekcal.js';
import * as Nat from './native.js';
import { $, $$, esc, today, toast, photoToDataUrl, addDays } from './util.js';

// Estado de la interfaz (no se guarda; solo vive mientras la app está abierta)
const ui = {
  route: 'hoy',
  agenda: { span: (() => { try { return Number(localStorage.getItem('miagenda.semanaDias')) || 0; } catch { return 0; } })(), ym: today().slice(0, 7), sel: today(), mode: (() => { try { return localStorage.getItem('miagenda.agendaVista') || 'mes'; } catch { return 'mes'; } })() },
  tareas: { f: 'activas', p: '', m: '' },
  personas: { q: '', seg: 'personas', g: '', pv: '' },
  notas: { seg: 'notas', q: '', tag: '' },
};
const ROUTES = ['hoy', 'agenda', 'tareas', 'personas', 'notas', 'informe'];

// ───────────── Pintado ─────────────

const data_ready = () => store.all('profile').length > 0 || store.all('events').length > 0 || !store.isCloud;
// Rutinas que se marcaron como hechas desde un aviso (se aplican cuando el evento ya está cargado)
let pendingDone = null, pendingLog = false;
function queueDone(eid, day) { if (eid && day) { pendingDone = { eid, day, until: Date.now() + 30000 }; applyPendingDone(); } }
function applyPendingDone() {
  if (pendingLog && !$('#app').hidden && data_ready()) { pendingLog = false; setTimeout(() => runQuick('time'), 300); }
  if (!pendingDone) return;
  if (Date.now() > pendingDone.until) { pendingDone = null; return; }
  const e = store.get('events', pendingDone.eid);
  if (!e) return;
  const { day } = pendingDone; pendingDone = null;
  if (!M.isDoneBy(e, day, store.doneId())) store.toggleDone(e, day);
  toast(`✓ Marcado como hecho: ${e.title}`);
}

function render() {
  const view = $('#view');
  const focused = document.activeElement?.id === 'q' ? document.activeElement.selectionStart : null;
  const y = window.scrollY;
  view.innerHTML = V[ui.route](ui);
  $$('#tabs .tab').forEach(b => {
    b.hidden = b.dataset.v !== 'hoy' && !M.isModuleVisible(b.dataset.v);
    b.setAttribute('aria-current', b.dataset.v === ui.route ? 'page' : 'false');
  });
  $('#fab').setAttribute('aria-label', { hoy: 'Agregar', agenda: 'Agregar evento', tareas: 'Nueva tarea', personas: ui.personas.seg === 'grupos' ? 'Nuevo grupo' : 'Nueva persona', notas: ui.notas.seg === 'reuniones' ? 'Nueva reunión' : 'Nueva nota', informe: 'Editar mes actual' }[ui.route]);
  $('#fab').hidden = ui.route === 'agenda' && !!ui.agenda.picking;   // al seleccionar varios, el botón + no tapa «Eliminar»
  if (focused !== null) { const q = $('#q'); q?.focus(); q?.setSelectionRange(focused, focused); }
  window.scrollTo(0, y);
  if (ui.route === 'agenda' && ui.agenda.mode === 'semana') WC.mount(c => S.calMove(c, render), (date, time, endTime) => S.eventSheet(null, { date, time, endTime }));
}

function go(route) {
  if (!ROUTES.includes(route) || (route !== 'hoy' && !M.isModuleVisible(route))) route = 'hoy';
  const changed = ui.route !== route;
  ui.route = route;
  history.replaceState(history.state, '', `#/${route}`);
  render();
  window.scrollTo(0, 0);
  if (changed) { const v = $('#view'); v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter'); }   // transición suave
}

function refreshList() {
  const box = $('#results');
  if (box) box.innerHTML = ui.route === 'personas' ? V.personasList(ui) : V.notasList(ui);
}

// ───────────── Acciones ─────────────

function toggleTask(id) {
  const t = store.get('tasks', id);
  if (!t) return;
  const wasDone = t.status === 'hecha';
  const next = { ...t, status: wasDone ? ((t.log || []).length ? 'seguimiento' : 'pendiente') : 'hecha', doneAt: wasDone ? '' : today() };
  store.upsert('tasks', next);
  if (!wasDone) toast('Tarea completada', 'Deshacer', () => store.upsert('tasks', t));
}

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
  }
}

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el) { if (e.target.classList?.contains('scrim')) S.closeOrBack(); return; }
  const { a, id, v } = el.dataset;
  switch (a) {
    // navegación
    case 'nav': return go(v);
    case 'fab': return fab();
    case 'settings': return S.settings('');
    case 'set-sec': return S.settings(v);
    case 'search': return S.searchSheet();
    case 'sheet-close': return S.closeOrBack();
    // eventos y calendario
    case 'event': return S.eventSheet(id, { occDate: el.dataset.occ || '' });
    case 'new-event': return S.eventSheet(null, { date: el.dataset.date });
    case 'skip-occ': case 'unskip-occ': return S.toggleSkipOccurrence(id, el.dataset.date);
    case 'cal-sel': ui.agenda.sel = el.dataset.date; return render();
    case 'ev-pick-mode': ui.agenda.picking = v === 'on'; ui.agenda.picked = []; return render();
    case 'ev-pick-all': { const ids = v.split(',').filter(Boolean); const cur = new Set(ui.agenda.picked || []); const all = ids.every(x => cur.has(x)); ids.forEach(x => (all ? cur.delete(x) : cur.add(x))); ui.agenda.picked = [...cur]; return render(); }
    case 'ev-bulk-share': return S.bulkShareSheet(ui.agenda.picked || [], () => { ui.agenda.picking = false; ui.agenda.picked = []; render(); });
    case 'bulk-share-go': return S.bulkShareGo();
    case 'ev-done': { const on = store.toggleDone(store.get('events', id), el.dataset.date); if (on) toast('¡Hecho! ✓'); return; }
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
    case 'new-task': return S.taskSheet(null);
    case 'toggle-task': return toggleTask(id);
    case 'filter-tasks': ui.tareas.f = v; return render();
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
    case 'new-entry': return S.entrySheet(null, { cat: el.dataset.cat, mid: el.dataset.mid }, () => S.monthSheet(el.dataset.mid));
    case 'entry': return S.entrySheet(id, {}, () => S.monthSheet(el.dataset.mid));
    case 'adj': return S.adjustMinutes(Number(el.dataset.delta));
    case 'study-add': return S.studyAdd();
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
    case 'delete': return S.removeWithUndo(el.dataset.col, id);
    case 'export': return download(`mi-agenda-${today()}.json`, store.exportAll());
    case 'signout': S.close(); return store.account.signOut();
  }
});

document.addEventListener('input', e => {
  if (e.target.id === 'q') { ui[ui.route].q = e.target.value; refreshList(); }
  else if (e.target.id === 'cat-name') S.catNameInput(e.target.value);
  else if (e.target.id === 'set-q') S.settingsFilter(e.target.value);
  else if (e.target.dataset?.agreements) S.refreshAgreements();
  else if (e.target.classList?.contains('pp-q')) S.pickerFilter(e.target);
  else if (e.target.classList?.contains('pp-other')) S.pickerChanged(e.target);
  else if (e.target.id === 'gsearch') {
    const box = $('#gresults');
    if (box) box.innerHTML = S.renderSearchResults(e.target.value);
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'log-text') { e.preventDefault(); $('[data-a="log-add"]')?.click(); }
  if (e.key === 'Enter' && e.target.id === 'study-name') { e.preventDefault(); $('[data-a="study-add"]')?.click(); }
  if (e.key === 'Enter' && e.target.id === 'priv-new') { e.preventDefault(); $('[data-a="priv-add"]')?.click(); }
  if (e.key === 'Enter' && e.target.id === 'ag-t') { e.preventDefault(); $('[data-a="ag-add"]')?.click(); }
  if (e.key === 'Enter' && e.target.id === 'wgoal-text') { e.preventDefault(); $('[data-a="wgoal-add"]')?.click(); }
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'tareas-person') { ui.tareas.p = t.value; return render(); }
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
  if (t.id === 'notif-logat') { N.setPref('logAt', Number(t.value)); return; }
  if (t.name === 'notif-sound') { N.setPref('sound', t.value); N.playSound(t.value); return; }
  if (t.matches?.('input[data-a="notif-pref"]')) { N.setPref(t.dataset.v, t.checked); if (t.dataset.v === 'details') S.settings(); return; }
  if (t.matches?.('input[data-a="ag-pick"]')) return S.agendaTogglePick(t.dataset.id);
  if (t.matches?.('select[data-admin-uid]')) return S.adminSetType(t.dataset.adminUid, t.value, t);
  if (t.matches?.('input[data-a="ev-pick"]')) { const cur = new Set(ui.agenda.picked || []); t.checked ? cur.add(t.value) : cur.delete(t.value); ui.agenda.picked = [...cur]; return render(); }
  if (t.id === 'repeat' && t.form?.dataset.form === 'event') { const box = document.getElementById('repeat-days'); if (box) box.hidden = t.value !== 'days'; return; }
  if (t.matches?.('select[data-otro]')) {   // «✏️ Nuevo tipo…» muestra el campo de texto
    const box = document.getElementById(t.dataset.otro);
    if (box) { box.hidden = t.value !== '__otro'; if (!box.hidden) box.querySelector('input')?.focus(); }
    if (t.id === 'category' && t.form?.dataset.form === 'event') {   // reunión de ancianos: participantes en vez de un solo acompañante
      const isAncianos = t.value === 'ancianos';
      const single = document.getElementById('companion-single');
      const group = document.getElementById('companion-group');
      if (single) single.hidden = isAncianos;
      if (group) group.hidden = !isAncianos;
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
  if (t.id === 'keep-file') { const files = [...(t.files || [])]; if (files.length) S.keepFiles(files); return; }
  if (t.id !== 'import-file') return;
  const file = t.files?.[0];
  if (!file) return;
  file.text().then(txt => S.importPreview(txt));   // primero muestra qué se va a restaurar y pide confirmar
});

document.addEventListener('submit', e => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  S.submit(form);
});

// Al guardar un evento, el calendario salta a su fecha
S.hooks.eventSaved = date => {
  if (ui.route !== 'agenda') return;
  ui.agenda.sel = date;
  ui.agenda.ym = date.slice(0, 7);
};

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
      <div class="f"><label for="pw">Contraseña</label><input id="pw" type="password" autocomplete="current-password" required></div>
      <p class="err" id="login-err" role="alert">${esc(message)}</p>
      <button class="btn primary" type="submit">Entrar</button>
      <button class="btn ghost" type="button" id="btn-signup">Crear cuenta</button>
      <button class="link" type="button" id="btn-reset">Olvidé mi contraseña</button>
      <a class="link" href="guia.html" target="_blank" rel="noopener">¿Cómo funciona la app? Ver la guía</a>
    </form></div>`;

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
  };
  const q = M.QUICK_ACTIONS.find(x => x.id === id);
  if (!q || (q.mod && !M.isModuleVisible(q.mod))) return;
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

let natStarted = false;
function showApp() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  render();
  if (Nat.isNative && !natStarted) {   // app de Android: avisos en el teléfono y aviso de actualización
    natStarted = true;
    Nat.init({ done: (eid, day) => queueDone(eid, day), log: () => { pendingLog = true; applyPendingDone(); }, changed: () => render() });
  }
  lockOnce();
  runHashAction();
  offerGuide();
}

// ───────────── Arranque ─────────────

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').catch(err => console.warn('Service worker no registrado', err));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) toast('Hay una versión nueva de la app', 'Actualizar', () => location.reload(), 15000);
  });
}

async function boot() {
  Theme.init(() => { if (!$('#app').hidden) render(); });
  const initial = location.hash.replace('#/', '');
  if (ROUTES.includes(initial) && (initial === 'hoy' || M.isModuleVisible(initial))) ui.route = initial;

  store.setErrorHandler(err => {
    console.error(err);
    toast(err?.code === 'permission-denied'
      ? 'Sin permiso para guardar. Revisa las reglas de Firestore.'
      : 'No se pudo guardar. Se reintentará cuando haya conexión.');
  });
  store.onData(() => { if (!$('#app').hidden) render(); });
  // «✓ Ya lo hice» desde un aviso: marca la rutina en cuanto se cargan los datos
  store.onData(applyPendingDone);
  store.onData(() => Nat.schedule());
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('hecho')) queueDone(q.get('hecho'), q.get('dia'));
    if (q.get('accion') === 'registrar') pendingLog = true;
    if (q.get('hecho') || q.get('accion')) history.replaceState(history.state, '', location.pathname + location.hash);
  } catch { /* sin parámetros */ }
  navigator.serviceWorker?.addEventListener('message', ev => {
    if (ev.data?.type === 'hecho') queueDone(ev.data.eid, ev.data.day);
    if (ev.data?.type === 'registrar') { pendingLog = true; applyPendingDone(); }
    if (ev.data?.type === 'aviso' && document.visibilityState === 'visible') N.playSound();
  });

  registerServiceWorker();

  if (!store.isCloud) {
    store.local.start();
    return showApp();
  }

  window.addEventListener('offline', () => toast('Sin conexión: tus cambios se guardan y se enviarán al volver.'));
  window.addEventListener('online', () => toast('Conexión restablecida'));

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
