// Capa de datos. Todo el resto de la app solo habla con este archivo.
//
//  · Modo local: localStorage (si config.js aún no tiene tus claves de Firebase).
//  · Modo nube:  Firebase Auth (correo y contraseña) + Firestore con caché sin conexión.
//
// Estructura en Firestore:  users/{uid}/{notes|events|tasks|people|groups|meetings|entries|profile|weeks}/{id}
//  Control de acceso (varias personas usando la misma app):
//   · admins/{uid}     → existe solo para el administrador (se crea a mano en la consola de Firebase)
//   · access/{uid}     → { type: 'publicador' | 'precursor' | 'anciano' | <plantilla propia>, allow:[], deny:[] } lo escribe solo el administrador
//   · config/plantillas → { types: { <id>: { n, modules, features, hideEventCats, hideServCats, goal } } } lo escribe solo el administrador
//   · directory/{uid}  → { email, name, lastSeen } lo escribe cada usuario, para que el administrador lo vea

import { firebaseConfig, FIREBASE_VERSION } from './config.js';

export const COLS = ['notes', 'events', 'tasks', 'people', 'groups', 'meetings', 'entries', 'profile', 'weeks', 'depts', 'mecas', 'visitas'];
export const data = Object.fromEntries(COLS.map(c => [c, []]));

// Estado de la sesión en modo nube: si es administrador y qué tipo de perfil tiene asignado
export const session = { isAdmin: false, type: '', legacy: false, allow: [], deny: [], templates: null };

export const isCloud = !!(firebaseConfig && firebaseConfig.apiKey && !/^PEGA/i.test(firebaseConfig.apiKey));

// ---------- Aviso de cambios (agrupado por fotograma para no repintar de más) ----------
const listeners = new Set();
let raf = 0;
export const onData = cb => { listeners.add(cb); return () => listeners.delete(cb); };
const notify = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => listeners.forEach(f => f())); };

let onError = e => console.error(e);
export const setErrorHandler = fn => { onError = fn; };

// ---------- Acceso básico ----------
export const all = col => data[col];
export const get = (col, id) => data[col].find(x => x.id === id);

// Guarda un elemento tal cual (sin tocar fechas de modificación).
// La memoria se actualiza al instante (así la pantalla nunca va por detrás) y luego
// se guarda en el teléfono o se envía a Firestore.
// Datos del perfil que nunca se borran «sin querer»: solo se vacían desde Editar mi perfil (explicit)
const PROTECT = ['photo', 'role', 'roles', 'myName', 'goalEnabled', 'goalMonthly', 'goalAnnual', 'congre', 'notif', 'customCats', 'infoFields', 'share', 'gcal', 'congreShare'];
const isEmpty = v => v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && !v.length);
function protectProfile(item) {
  const cur = data.profile.find(p => p.id === item.id);
  if (!cur) return item;
  const out = { ...item, createdAt: cur.createdAt || item.createdAt };
  PROTECT.forEach(k => { if (isEmpty(out[k]) && !isEmpty(cur[k])) out[k] = cur[k]; });
  // Los datos de la congregación, campo por campo (solo se vacían desde su propio formulario)
  if (out.congre && cur.congre && typeof out.congre === 'object') { const c = { ...out.congre }; Object.keys(cur.congre).forEach(k => { if (isEmpty(c[k]) && !isEmpty(cur.congre[k])) c[k] = cur.congre[k]; }); out.congre = c; }
  return out;
}
// Tu ficha «soy yo» en Personas: su nombre, foto, relación y privilegios no se vacían por accidente
// (solo cambian cuando editas la ficha tú mismo)
const PROTECT_ME = ['name', 'photo', 'role', 'privileges', 'aliases', 'isMe'];
function protectMe(item) {
  const cur = data.people.find(p => p.id === item.id);
  if (!cur || !cur.isMe) return item;
  const out = { ...item };
  PROTECT_ME.forEach(k => { if (isEmpty(out[k]) && !isEmpty(cur[k])) out[k] = cur[k]; });
  return out;
}
function write(col, item, opts = {}) {
  if (col === 'events' && item.sharedId) return sharedWrite(item);
  if (col === 'tasks' && item.assignedFrom) return assignedAnswer(item);
  // Protección: nunca se guarda el perfil antes de haberlo recibido de la nube
  // (si no, un perfil vacío borraría tu rol, tus metas y tus ajustes)
  if (col === 'profile' && isCloud && !profileLoaded) { console.warn('Perfil aún no cargado: no se guarda'); return; }
  if (col === 'profile' && !opts.explicit) item = protectProfile(item);
  if (col === 'people' && !opts.explicit) item = protectMe(item);
  if (cgBlocked(col, item.id)) return;
  const i = data[col].findIndex(x => x.id === item.id);
  const before = i >= 0 ? data[col][i] : null;
  if (i >= 0) data[col][i] = item; else data[col].push(item);
  cgMirror(col, item);
  notify();
  if ((col === 'notes' || col === 'tasks') && item.shareId && !opts.fromRemote && !opts.noShare) shItemPush(col, item);
  if (isCloud) {
    // Solo se envían los campos que cambiaron (así un teléfono que estuvo sin internet no pisa lo más nuevo de otro):
    // opts.fields = rutas pedidas (p. ej. [['doneLog', '2026-10-01']]); en el perfil se calcula solo.
    const paths = opts.fields || (col === 'profile' && before ? changedPaths(before, item) : null);
    if (paths) cloud.patch(col, item, paths); else cloud.upsert(col, item);
  } else local.persist();
  if (col === 'tasks' && item.assignedId && !opts.fromRemote) assignedPush(item);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const changedPaths = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => k !== 'id' && !same(a[k], b[k])).map(k => [k]);
const atPath = (o, p) => p.reduce((v, k) => (v == null ? undefined : v[k]), o);

// Cambia solo algunos campos del perfil. Si el perfil aún no llegó de la nube, espera a que llegue.
// fields puede ser un objeto o una función (perfil actual) => campos
let profileLoaded = false, profileQueue = [];
export function patchProfile(fields) {
  if (isCloud && !profileLoaded) { profileQueue.push(fields); return; }
  const cur = data.profile.find(p => p.id === 'me') || { id: 'me' };
  const f = typeof fields === 'function' ? fields(cur) : fields;
  if (f && Object.keys(f).length) upsert('profile', { ...cur, ...f, id: 'me' });
}
function profileArrived() {
  if (profileLoaded) return;
  profileLoaded = true;
  const q = profileQueue; profileQueue = [];
  setTimeout(() => q.forEach(patchProfile), 0);
}

// Crea o actualiza un elemento y devuelve la versión guardada
export function upsert(col, item, opts = {}) {
  const now = new Date().toISOString();
  const saved = { ...item, updatedAt: now, createdAt: item.createdAt || now };
  write(col, saved, opts);
  return saved;
}

export function remove(col, id) {
  if (col === 'events' && String(id).startsWith(SH)) return sharedRemove(id);
  if (col === 'tasks' && String(id).startsWith(AS)) return assignedRespond(id.slice(AS.length), false);
  if (cgBlocked(col, id)) return;
  const gone = col === 'tasks' ? data.tasks.find(x => x.id === id) : null;
  const was = col === 'notes' || col === 'tasks' ? data[col].find(x => x.id === id) : null;
  if (was?.shareId) shItemDelete(was.shareId);
  if (gone?.assignedId && fb && account.user) fb.fs.deleteDoc(fb.fs.doc(fb.db, 'assigned', gone.assignedId)).catch(() => {});
  data[col] = data[col].filter(x => x.id !== id);
  cgMirror(col, null, id);
  notify();
  if (isCloud) cloud.remove(col, id); else local.persist();
}

// Vuelve a poner un elemento eliminado (para "Deshacer")
export const restore = (col, item) => write(col, item);

// ---------- Respaldo ----------
export function exportAll() {
  const own = { ...data, events: data.events.filter(e => !e.sharedId), tasks: data.tasks.filter(t => !t.assignedFrom), ...cgOwnData() };   // los compartidos y las tareas recibidas son de otra colección
  return JSON.stringify({ app: 'mi-agenda-teocrática', version: 1.3, exportedAt: new Date().toISOString(), data: own }, null, 2);
}

// Personas que ya tienes con el mismo nombre (así un archivo de personas no las duplica)
const nameKey = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export const isDuplicatePerson = it => !get('people', it.id) && data.people.some(p => nameKey(p.name) === nameKey(it.name));
// Limpieza de lo que llega de un archivo o del buzón: solo colecciones conocidas, ids sencillos, tipos esperados.
// Nunca se importan los ajustes de este teléfono o de esta cuenta (enlace, Google Calendar, avisos) ni la marca «soy yo».
const ID_RE = /^[\w-]{1,60}$/;
const COLOR_RE = /^(#[0-9a-f]{3,8}|var\(--[\w-]+\))$/i;
const IMPORT_SKIP_PROFILE = ['share', 'gcal', 'notif', 'nativeSched', 'nativeAppSeen', 'congreShare', 'congreFollow'];
const ARR_KEYS = ['days', 'skipDates', 'responsibles', 'log', 'privileges', 'studyNames', 'customCats', 'infoFields', 'hiddenModules', 'sharedHidden', 'noActivityDays', 'deptSkipped', 'history'];
const OBJ_KEYS = ['doneLog', 'congre'];
const STR_KEYS = ['title', 'name', 'date', 'time', 'endTime', 'due', 'dueTime', 'category'];
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
export function cleanImportItem(c, it, cur, allowMe = false) {
  if (!COLS.includes(c) || !isObj(it) || typeof it.id !== 'string' || !ID_RE.test(it.id)) return null;
  if (cur === undefined) cur = get(c, it.id);
  const out = { ...it };
  ARR_KEYS.forEach(k => { if (k in out && !Array.isArray(out[k])) delete out[k]; });
  OBJ_KEYS.forEach(k => { if (k in out && !isObj(out[k])) delete out[k]; });
  STR_KEYS.forEach(k => { if (k in out && typeof out[k] !== 'string') delete out[k]; });
  if ('color' in out && !(out.color === '' || (typeof out.color === 'string' && COLOR_RE.test(out.color)))) out.color = '';
  if (c === 'profile') {
    IMPORT_SKIP_PROFILE.forEach(k => { delete out[k]; if (cur && k in cur) out[k] = cur[k]; });
  }
  if (c === 'people') { const me = it.isMe === true && allowMe; delete out.isMe; if (cur?.isMe || me) out.isMe = true; }
  if (c === 'events') { ['sharedId', 'owner', 'ownerName', 'members', 'memberNames'].forEach(k => delete out[k]); if (it.id.startsWith(SH)) return null; }
  if (c === 'tasks') {
    delete out.assignedFrom;
    if (it.id.startsWith(AS)) return null;
    // El enlace con una tarea asignada solo se conserva si ya era tuyo (así un archivo no envía tareas en tu nombre)
    if (!(cur?.assignedId && cur.assignedId === out.assignedId)) ['assignedId', 'assignTo', 'assignToName', 'assignState'].forEach(k => delete out[k]);
  }
  return out;
}
// Qué traería un respaldo, por colección: nuevos, reemplazos y descartados (para mostrarlo antes de importar)
export function importPlan(json) {
  const parsed = typeof json === 'string' ? JSON.parse(json) : json;
  const src = isObj(parsed?.data) ? parsed.data : (parsed || {});
  return COLS.map(c => {
    const list = Array.isArray(src[c]) ? src[c] : [];
    const r = { col: c, add: 0, replace: 0, dup: 0, bad: 0 };
    list.forEach(it => {
      if (c === 'people' && isObj(it) && isDuplicatePerson(it)) { r.dup++; return; }
      if (!cleanImportItem(c, it)) { r.bad++; return; }
      get(c, it.id) ? r.replace++ : r.add++;
    });
    return r;
  });
}
// opts.inbox: viene del buzón (otra cuenta). Solo un respaldo tuyo, en un teléfono sin ficha «soy yo», la puede traer.
export function importAll(json, opts = {}) {
  const parsed = JSON.parse(json);
  const src = isObj(parsed?.data) ? parsed.data : (parsed || {});
  let n = 0;
  let allowMe = !opts.inbox && !data.people.some(p => p.isMe);
  COLS.forEach(c => (Array.isArray(src[c]) ? src[c] : []).forEach(raw => {
    if (c === 'people' && isObj(raw) && isDuplicatePerson(raw)) return;
    const it = cleanImportItem(c, raw, undefined, allowMe);
    if (it?.isMe && c === 'people') allowMe = false;
    if (!it) return;
    // Tu perfil y tu ficha «soy yo» no se vacían: lo que el archivo traiga vacío se queda como lo tienes
    const keep = c === 'profile' || (c === 'people' && get(c, it.id)?.isMe);
    write(c, it, { explicit: !keep });
    n++;
  }));
  // Un archivo de cambios puede pedir quitar elementos: { remove: { events: [ids] } }
  const rm = isObj(parsed?.remove) ? parsed.remove : {};
  COLS.forEach(c => (Array.isArray(rm[c]) ? rm[c] : []).forEach(id => {
    if (typeof id !== 'string' || !get(c, id)) return;
    if (c === 'profile' || (c === 'people' && get(c, id).isMe)) return;   // nunca se borra tu perfil ni tu ficha
    remove(c, id); n++;
  }));
  return n;
}

// Copias automáticas de cada semana (las hace el servidor; ver avisos/run.js)
export async function listBackups() {
  if (!fb || !account.user) return [];
  const snap = await fb.fs.getDocs(fb.fs.collection(fb.db, 'users', account.user.uid, 'backups'));
  return snap.docs.map(d => d.data()).filter(b => b.date).sort((a, b) => b.date.localeCompare(a.date));
}
// Arma el respaldo de una copia (todas las colecciones o solo las pedidas), con el mismo formato del archivo
export async function loadBackup(b, cols = COLS) {
  const out = {};
  for (const c of cols) {
    const n = b.parts?.[c] || 0;
    if (!n || b.counts?.[c] === 0) continue;
    let txt = '';
    for (let i = 0; i < n; i++) {
      const d = await fb.fs.getDoc(fb.fs.doc(fb.db, 'users', account.user.uid, 'backupParts', `${b.date}_${c}_${i}`));
      txt += d.data()?.text || '';
    }
    out[c] = JSON.parse(txt || '[]');
  }
  return JSON.stringify({ app: 'mi-agenda-teocrática', version: 1.3, exportedAt: b.at, data: out });
}

// ═════════════════════════════ MODO LOCAL ═════════════════════════════
const LS_KEY = 'miagenda.datos.v1';

export const local = {
  start() {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      COLS.forEach(c => { data[c] = Array.isArray(saved[c]) ? saved[c] : []; });
    } catch { /* datos dañados: se empieza en blanco */ }
    notify();
  },
  persist() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); }
    catch (e) { onError(e); }
  },
};

// ═════════════════════════════ MODO NUBE ═════════════════════════════
let fb = null;      // módulos de Firebase ya cargados
let unsubs = [];

async function loadFirebase() {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
  const [app, auth, fs] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-firestore.js`),
  ]);
  const a = app.initializeApp(firebaseConfig);
  let db;
  try {
    // Caché en el teléfono: la app sigue funcionando sin internet y sincroniza al volver
    db = fs.initializeFirestore(a, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
  } catch (e) {
    console.warn('Sin caché persistente, se usa la básica.', e);
    db = fs.getFirestore(a);
  }
  fb = { auth, fs, authInst: auth.getAuth(a), db, app: a };
}

export const account = {
  user: null,
  // Carga Firebase y avisa cada vez que cambia la sesión (entrar / salir)
  async init(onUser) {
    await loadFirebase();
    fb.auth.onAuthStateChanged(fb.authInst, u => { account.user = u; onUser(u); });
  },
  signIn: (email, pass) => fb.auth.signInWithEmailAndPassword(fb.authInst, email, pass),
  signUp: (email, pass) => fb.auth.createUserWithEmailAndPassword(fb.authInst, email, pass),
  reset: email => fb.auth.sendPasswordResetEmail(fb.authInst, email),
  signOut: () => fb.auth.signOut(fb.authInst),
};

// ¿Ya llegaron todos tus datos? (los avisos del teléfono esperan a esto para no programarse con la agenda a medias)
// Firestore entrega la primera vez lo guardado en el teléfono o, si no hay nada guardado, espera al servidor.
// Si algo no responde, a los 15 segundos se da por listo.
const seenCols = new Set();
let syncStart = 0;
export const synced = () => !isCloud || seenCols.size >= COLS.length + 1 || (syncStart > 0 && Date.now() - syncStart > 15000);

export function startSync(uid) {
  stopSync();
  syncStart = Date.now();
  COLS.forEach(c => {
    const ref = fb.fs.collection(fb.db, 'users', uid, c);
    unsubs.push(fb.fs.onSnapshot(ref,
      snap => {
        seenCols.add(c);
        const list = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        if (c === 'events') { ownEvents = list; composeEvents(); }
        else if (c === 'tasks') { ownTasks = list; composeTasks(); }
        else if (CG_COLS.includes(c) || c === 'people') { cgOwn[c] = list; composeCg(); }
        else { data[c] = list; if (c === 'profile') { if (list.length || !snap.metadata.fromCache) profileArrived(); composeEvents(); if (myName() !== lastMemberName) touchMember(); } }
        if (c === 'profile') cgFollowSync();
        notify();
        cgPublishSoon();
      },
      err => { seenCols.add(c); onError(err); }));
  });
  cgWatchOffers(uid);
  shItemsWatch(uid);
  newsWatch();
  // Eventos que otros te compartieron (o que tú compartiste)
  const q = fb.fs.query(fb.fs.collection(fb.db, 'shared'), fb.fs.where('members', 'array-contains', uid));
  unsubs.push(fb.fs.onSnapshot(q,
    snap => { seenCols.add('shared'); sharedDocs = snap.docs.map(d => ({ ...d.data(), _id: d.id })); composeEvents(); notify(); },
    err => { seenCols.add('shared'); console.warn('Compartidos no disponibles', err); }));
  // Tareas que te asignaron otras cuentas, y las que tú asignaste
  const aq = field => fb.fs.query(fb.fs.collection(fb.db, 'assigned'), fb.fs.where(field, '==', uid));
  unsubs.push(fb.fs.onSnapshot(aq('to'),
    snap => { seenCols.add('assignedIn'); assignedIn = snap.docs.map(d => ({ ...d.data(), _id: d.id })); composeTasks(); notify(); },
    err => { seenCols.add('assignedIn'); console.warn('Tareas recibidas no disponibles', err); }));
  unsubs.push(fb.fs.onSnapshot(aq('owner'),
    snap => { seenCols.add('assignedOut'); assignedOut = snap.docs.map(d => ({ ...d.data(), _id: d.id })); assignedPull(); },
    err => { seenCols.add('assignedOut'); console.warn('Tareas asignadas no disponibles', err); }));
  // Te anotas en la lista de cuentas (solo tu nombre) para que otros puedan compartirte eventos
  touchMember();
}

// ═════════════════════════════ EVENTOS COMPARTIDOS ═════════════════════════════
// shared/{id} → { ...campos del evento, owner, ownerName, members: [uid], memberNames: {uid: nombre}, updatedBy, updatedByName }
// Todos los miembros lo ven; solo quien lo creó lo cambia, cambia con quién se comparte o lo borra (mínimo privilegio).
// Los demás solo marcan su propio ✓ (doneLog) y lo pueden quitar de su agenda.
// En la app aparecen mezclados con tus eventos (id «sh_…» y sharedId); ocultarlos se guarda en profile.sharedHidden.
const SH = 'sh_';
let ownEvents = [];
let sharedDocs = [];
const SHARED_FIELDS = ['title', 'category', 'date', 'time', 'endTime', 'place', 'repeat', 'days', 'notes', 'theme', 'color', 'skipDates', 'routine'];
const myProfile = () => data.profile.find(p => p.id === 'me') || { id: 'me' };
export const myName = () => (myProfile().myName || account.user?.displayName || (account.user?.email || '').split('@')[0] || 'Alguien').slice(0, 80);
const pick = o => Object.fromEntries(SHARED_FIELDS.filter(k => o[k] !== undefined).map(k => [k, o[k]]));

function composeEvents() {
  const hidden = new Set(myProfile().sharedHidden || []);
  data.events = [...ownEvents, ...sharedDocs.filter(d => !hidden.has(d._id)).map(d => {
    const { _id, ...rest } = d;
    return { ...rest, id: SH + _id, sharedId: _id };
  })];
}
const uidOf = () => account.user?.uid || '';
export const isSharedOwner = e => !!e?.sharedId && e.owner === uidOf();

function setHidden(sharedId, hide) {
  const v = myProfile();
  const cur = new Set(v.sharedHidden || []);
  if (hide ? cur.has(sharedId) : !cur.has(sharedId)) return;
  hide ? cur.add(sharedId) : cur.delete(sharedId);
  write('profile', { ...v, id: 'me', sharedHidden: [...cur], updatedAt: new Date().toISOString() });
  composeEvents();
}

function sharedWrite(item) {
  const prev = sharedDocs.find(d => d._id === item.sharedId);
  // Si no lo creaste tú, no se cambia: solo vuelve a verse si lo habías quitado (por ejemplo, con «Deshacer»)
  if (prev && prev.owner !== uidOf() && fb && account.user) {
    setHidden(item.sharedId, false);
    notify();
    if (JSON.stringify(pick(prev)) !== JSON.stringify(pick(item))) onError({ friendly: `Solo ${prev.ownerName || 'quien lo creó'} puede cambiar este evento.` });
    return;
  }
  const i = data.events.findIndex(x => x.id === item.id);
  if (i >= 0) data.events[i] = item; else data.events.push(item);
  notify();
  if (!fb || !account.user) return;
  const ref = fb.fs.doc(fb.db, 'shared', item.sharedId);
  const base = { ...pick(item), updatedAt: new Date().toISOString(), updatedBy: uidOf(), updatedByName: myName() };
  if (prev) fb.fs.updateDoc(ref, JSON.parse(JSON.stringify(base))).catch(onError);
  else fb.fs.setDoc(ref, JSON.parse(JSON.stringify({ ...base, owner: item.owner, ownerName: item.ownerName, members: item.members, memberNames: item.memberNames || {}, createdAt: item.createdAt || base.updatedAt }))).catch(onError);
  setHidden(item.sharedId, false);
}

// Marca o desmarca «hecho» un día de un evento que se repite. En los compartidos solo toca tu propia marca.
export const doneId = () => account.user?.uid || 'me';
export function toggleDone(ev, iso) {
  if (!ev) return;
  const who = doneId();
  const cur = new Set(ev.doneLog?.[iso] || []);
  const on = !cur.has(who);
  on ? cur.add(who) : cur.delete(who);
  const doneLog = { ...(ev.doneLog || {}), [iso]: [...cur] };
  if (!cur.size) delete doneLog[iso];
  if (ev.sharedId && fb && account.user) {
    const i = data.events.findIndex(x => x.id === ev.id);
    if (i >= 0) data.events[i] = { ...ev, doneLog };
    notify();
    const ref = fb.fs.doc(fb.db, 'shared', ev.sharedId);
    fb.fs.updateDoc(ref, new fb.fs.FieldPath('doneLog', iso), on ? fb.fs.arrayUnion(who) : fb.fs.arrayRemove(who),
      'doneAt', new Date().toISOString(), 'doneBy', who, 'doneDay', iso).catch(onError);
  } else upsert('events', { ...ev, doneLog }, { fields: [['doneLog', iso]] });
  return on;
}

// Quien lo creó lo borra para todos; los demás solo lo quitan de su agenda
function sharedRemove(id) {
  const e = data.events.find(x => x.id === id);
  data.events = data.events.filter(x => x.id !== id);
  notify();
  if (!e || !fb) return;
  if (isSharedOwner(e)) fb.fs.deleteDoc(fb.fs.doc(fb.db, 'shared', e.sharedId)).catch(onError);
  else setHidden(e.sharedId, true);
}

// Comparte un evento propio (o cambia con quién). members = uids de los demás; [] = dejar de compartir.
export function shareEvent(ev, others, names = {}) {
  const me = uidOf();
  if (!fb || !me) return null;
  const members = [me, ...others.filter(u => u !== me)];
  const memberNames = { [me]: myName(), ...Object.fromEntries(others.map(u => [u, names[u] || ''])) };
  const now = new Date().toISOString();
  if (ev.sharedId) {
    if (!others.length) {           // deja de compartirse: vuelve a ser solo tuyo
      const own = { ...pick(ev), id: 'e' + Date.now().toString(36), createdAt: ev.createdAt || now, updatedAt: now };
      write('events', own);
      fb.fs.deleteDoc(fb.fs.doc(fb.db, 'shared', ev.sharedId)).catch(onError);
      return own;
    }
    const item = { ...ev, members, memberNames };
    const i = data.events.findIndex(x => x.id === ev.id);
    if (i >= 0) data.events[i] = item;
    fb.fs.updateDoc(fb.fs.doc(fb.db, 'shared', ev.sharedId), JSON.parse(JSON.stringify({ ...pick(ev), members, memberNames, updatedAt: now, updatedBy: me, updatedByName: myName() }))).catch(onError);
    notify();
    return item;
  }
  if (!others.length) return null;
  const sid = fb.fs.doc(fb.fs.collection(fb.db, 'shared')).id;
  const item = { ...pick(ev), id: SH + sid, sharedId: sid, owner: me, ownerName: myName(), members, memberNames, createdAt: now, updatedAt: now };
  sharedWrite(item);
  if (ev.id && !String(ev.id).startsWith(SH) && ownEvents.some(x => x.id === ev.id)) remove('events', ev.id);   // el original pasa a ser el compartido
  return item;
}

// ───── Cuentas a las que se puede compartir (solo nombre) ─────
// members/{uid} → { name, updatedAt }  lo escribe cada usuario aprobado; lo leen los demás aprobados
let lastMemberName = '';
function touchMember() {
  if (!fb || !account.user || !hasAccess()) return;
  lastMemberName = myName();
  fb.fs.setDoc(fb.fs.doc(fb.db, 'members', account.user.uid), { name: myName(), updatedAt: new Date().toISOString() }).catch(() => {});
}
export const refreshMember = () => touchMember();
let membersCache = null;
export async function listMembers() {
  if (!fb || !account.user) return [];
  const snap = await fb.fs.getDocs(fb.fs.collection(fb.db, 'members'));
  membersCache = snap.docs.map(d => ({ uid: d.id, name: d.data().name || '' })).filter(m => m.uid !== account.user.uid && m.name)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return membersCache;
}
// Las cuentas ya cargadas (sin esperar a la nube); null si aún no se pidieron
export const cachedMembers = () => membersCache;

// ═════════════════════════════ TAREAS ASIGNADAS A OTRA CUENTA ═════════════════════════════
// assigned/{id} → { owner, ownerName, to, toName, title, notes, kind, priority, due, dueTime,
//                   state: 'nueva' | 'aceptada' | 'rechazada', done, doneAt, log: [{ d, t, by, byName }], createdAt, updatedAt, updatedBy }
// Mínimo privilegio (lo exigen las reglas de Firestore): quien la asigna cambia el contenido o la borra;
// quien la recibe solo la acepta o la rechaza, anota avances y la marca hecha. Nadie borra los avances ya anotados.
// En tu app: la tarea que enviaste lleva assignedId (y assignTo, assignToName, assignState);
// las que recibes y aceptas aparecen en Tareas con id «as_…» y assignedFrom.
const AS = 'as_';
let ownTasks = [], assignedIn = [], assignedOut = [];
const A_FIELDS = ['title', 'notes', 'kind', 'priority', 'due', 'dueTime'];
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const aPick = t => Object.fromEntries(A_FIELDS.map(k => [k, String(t[k] ?? '')]));
const logKey = l => `${l.d}|${l.t}`;
// Los avances ya anotados se quedan en su orden; solo se agregan los nuevos
const mergeLog = (base, extra) => { const seen = new Set(base.map(logKey)); return [...base, ...extra.filter(l => !seen.has(logKey(l)) && seen.add(logKey(l)))]; };
const tagMine = l => (l.by ? l : { ...l, by: uidOf(), byName: myName() });
export const isAssignedTask = t => !!t?.assignedFrom;
export const assignedNew = () => assignedIn.filter(d => d.state === 'nueva').map(d => ({ ...d, id: d._id }));
export const newAssignedId = () => (fb ? fb.fs.doc(fb.fs.collection(fb.db, 'assigned')).id : '');
export const myUid = () => uidOf();

function composeTasks() {
  data.tasks = [...ownTasks, ...assignedIn.filter(d => d.state === 'aceptada').map(d => ({
    ...aPick(d), id: AS + d._id, assignedFrom: d._id, fromName: d.ownerName || 'otra cuenta',
    status: d.done ? 'hecha' : (d.log || []).length ? 'seguimiento' : 'pendiente', doneAt: d.doneAt || '',
    log: d.log || [], mine: true, responsibles: [], personId: '', createdAt: d.createdAt, updatedAt: d.updatedAt,
  }))];
}

// Quien asigna: guarda en la nube lo que cambió en su tarea (o la envía por primera vez)
function assignedPush(item) {
  if (!fb || !account.user) return;
  const ref = fb.fs.doc(fb.db, 'assigned', item.assignedId);
  const doc = assignedOut.find(d => d._id === item.assignedId);
  const now = new Date().toISOString();
  if (doc) {
    // «Hecha» solo se envía si ya la aceptó (si no, la otra persona todavía no la tiene en su lista)
    const done = doc.state === 'aceptada' ? item.status === 'hecha' : !!doc.done;
    const log = mergeLog(doc.log || [], (item.log || []).map(tagMine));
    const patch = { ...aPick(item), done, doneAt: done ? (item.doneAt || isoToday()) : '', log };
    const cur = { ...aPick(doc), done: !!doc.done, doneAt: doc.doneAt || '', log: doc.log || [] };
    if (JSON.stringify(patch) === JSON.stringify(cur)) return;
    fb.fs.updateDoc(ref, JSON.parse(JSON.stringify({ ...patch, updatedAt: now, updatedBy: uidOf() }))).catch(e => { if (e?.code !== 'not-found') onError(e); });
  } else if (item.assignTo) {
    fb.fs.setDoc(ref, JSON.parse(JSON.stringify({ ...aPick(item), owner: uidOf(), ownerName: myName(), to: item.assignTo, toName: item.assignToName || '',
      state: 'nueva', done: false, doneAt: '', log: [], createdAt: now, updatedAt: now, updatedBy: uidOf() }))).catch(onError);
  }
}
// Quien asigna: trae a su tarea lo que hizo la otra persona (si la aceptó, sus avances y si ya la hizo)
function assignedPull() {
  assignedOut.forEach(doc => {
    const t = ownTasks.find(x => x.assignedId === doc._id);
    if (!t) return;
    const fromThem = doc.updatedBy && doc.updatedBy !== uidOf();
    const log = mergeLog(t.log || [], doc.log || []);
    const next = { ...t, assignState: doc.state, log };
    if (fromThem) { next.status = doc.done ? 'hecha' : log.length ? 'seguimiento' : 'pendiente'; next.doneAt = doc.done ? (doc.doneAt || '') : ''; }
    const k = x => JSON.stringify([x.assignState, x.log, x.status, x.doneAt || '']);
    if (k(next) !== k(t)) write('tasks', { ...next, updatedAt: new Date().toISOString() }, { fromRemote: true });
  });
  notify();
}
// Quien recibe: anota avances o la marca hecha (lo único que puede cambiar)
function assignedAnswer(item) {
  const d = assignedIn.find(x => x._id === item.assignedFrom);
  if (!d || !fb || !account.user) return;
  const done = item.status === 'hecha';
  const patch = { done, doneAt: done ? (item.doneAt || isoToday()) : '', log: mergeLog(d.log || [], (item.log || []).map(tagMine)), state: 'aceptada', updatedAt: new Date().toISOString(), updatedBy: uidOf() };
  Object.assign(d, patch); composeTasks(); notify();
  fb.fs.updateDoc(fb.fs.doc(fb.db, 'assigned', d._id), JSON.parse(JSON.stringify(patch))).catch(onError);
}
// Quien recibe: acepta o rechaza una tarea nueva (rechazar también sirve para quitarla de su lista)
export function assignedRespond(id, accept) {
  const d = assignedIn.find(x => x._id === id);
  if (!d || !fb || !account.user) return;
  const patch = { state: accept ? 'aceptada' : 'rechazada', updatedAt: new Date().toISOString(), updatedBy: uidOf(), ...(accept ? {} : { done: false, doneAt: '' }) };
  Object.assign(d, patch); composeTasks(); notify();
  fb.fs.updateDoc(fb.fs.doc(fb.db, 'assigned', id), patch).catch(onError);
}
// Quien asigna: deja de enviarla (se le quita a la otra persona; tu tarea queda igual, solo tuya)
export function assignedStop(taskId) {
  const t = data.tasks.find(x => x.id === taskId);
  if (!t?.assignedId) return;
  if (fb && account.user) fb.fs.deleteDoc(fb.fs.doc(fb.db, 'assigned', t.assignedId)).catch(onError);
  const { assignedId, assignTo, assignToName, assignState, ...rest } = t;
  write('tasks', { ...rest, updatedAt: new Date().toISOString() }, { explicit: true });
}


export function stopSync() {
  unsubs.forEach(u => u());
  unsubs = [];
  profileLoaded = false; profileQueue = [];
  seenCols.clear(); syncStart = 0;
  COLS.forEach(c => { data[c] = []; });
  ownEvents = []; sharedDocs = []; ownTasks = []; assignedIn = []; assignedOut = []; membersCache = null;
  cgReset(); shItems = []; shReady = false; newsItems = [];
  notify();
}

const cloud = {
  // No se espera la respuesta del servidor: Firestore aplica el cambio al instante
  // en la caché local y lo envía cuando hay conexión.
  upsert(col, item) {
    if (!account.user) return;
    const ref = fb.fs.doc(fb.db, 'users', account.user.uid, col, item.id);
    fb.fs.setDoc(ref, JSON.parse(JSON.stringify(item))).catch(onError);
  },
  // Cambia solo esos campos (con updatedAt). Si el documento aún no existe en la nube, se guarda completo.
  patch(col, item, paths) {
    if (!account.user) return;
    const all = paths.some(p => p[0] === 'updatedAt') || item.updatedAt === undefined ? paths : [...paths, ['updatedAt']];
    if (!paths.length) return;
    const ref = fb.fs.doc(fb.db, 'users', account.user.uid, col, item.id);
    const args = all.flatMap(p => { const v = atPath(item, p); return [new fb.fs.FieldPath(...p), v === undefined ? fb.fs.deleteField() : JSON.parse(JSON.stringify(v))]; });
    fb.fs.updateDoc(ref, ...args).catch(e => { if (e?.code === 'not-found') cloud.upsert(col, item); else onError(e); });
  },
  remove(col, id) {
    if (!account.user) return;
    fb.fs.deleteDoc(fb.fs.doc(fb.db, 'users', account.user.uid, col, id)).catch(onError);
  },
};

// ───── Avisos en el teléfono: cada teléfono guarda aquí su «dirección» para recibir notificaciones ─────
// users/{uid}/devices/{id} → { token, tz, updatedAt }  (no se sincroniza con la pantalla; solo lo lee el servidor)
export const firebaseApp = () => fb?.app || null;
export function saveDevice(id, info) {
  if (!fb || !account.user) return Promise.reject(new Error('sin sesión'));
  return fb.fs.setDoc(fb.fs.doc(fb.db, 'users', account.user.uid, 'devices', id), { ...info, updatedAt: new Date().toISOString() });
}
// ───── Enlace para los ancianos (compartir.js): el contenido llega ya cifrado; aquí solo se guarda o se borra ─────
export function shareSave(id, doc) {
  if (!fb || !account.user) return Promise.reject(new Error('sin sesión'));
  return fb.fs.setDoc(fb.fs.doc(fb.db, 'shares', id), { ...doc, owner: account.user.uid });
}
export function shareRemove(id) {
  if (!fb || !account.user) return Promise.reject(new Error('sin sesión'));
  return fb.fs.deleteDoc(fb.fs.doc(fb.db, 'shares', id));
}
// Pide un aviso de prueba: el proceso de avisos (cada hora) lo ve y lo manda
export function requestTestNotice() {
  if (!fb || !account.user) return Promise.reject(new Error('sin sesión'));
  return fb.fs.setDoc(fb.fs.doc(fb.db, 'users', account.user.uid, 'meta', 'test'), { at: new Date().toISOString() });
}
export function removeDevice(id) {
  if (!fb || !account.user) return Promise.resolve();
  return fb.fs.deleteDoc(fb.fs.doc(fb.db, 'users', account.user.uid, 'devices', id)).catch(() => {});
}

// ═════════════════════════════ ACCESO Y ADMINISTRACIÓN ═════════════════════════════
let accessUnsubs = [];

// ¿Puede usar la app? El administrador siempre; los demás, cuando tienen un tipo asignado.
// «legacy» = las reglas nuevas aún no se publicaron: se comporta como antes (una sola cuenta, todo visible).
export const hasAccess = () => session.legacy || session.isAdmin || !!session.type;

// Escucha si la cuenta es de administrador y qué tipo tiene; avisa cada vez que cambia
// (así, cuando el administrador aprueba a alguien, su pantalla se actualiza sola).
export function watchAccess(user, onChange) {
  stopAccess();
  const { fs, db } = fb;
  const seen = { admin: false, access: false, tpl: false };
  const emit = key => { seen[key] = true; if (seen.admin && seen.access && seen.tpl) onChange(session); };
  const fail = key => e => {
    if (e?.code === 'permission-denied') session.legacy = true; else onError(e);
    emit(key);
  };
  session.isAdmin = false; session.type = ''; session.legacy = false; session.allow = []; session.deny = []; session.templates = null;
  // Plantillas de funciones: si no existen o las reglas aún no las permiten, se usan las de siempre
  let tplOk = false;
  const watchTpl = () => {
    if (tplOk) return;
    tplOk = true;
    accessUnsubs.push(fs.onSnapshot(fs.doc(db, 'config', 'plantillas'),
      snap => { session.templates = snap.exists() ? (snap.data().types || null) : null; emit('tpl'); },
      () => { tplOk = false; emit('tpl'); }));
  };
  accessUnsubs.push(fs.onSnapshot(fs.doc(db, 'admins', user.uid),
    snap => { session.isAdmin = snap.exists(); if (session.isAdmin) watchTpl(); emit('admin'); }, fail('admin')));
  accessUnsubs.push(fs.onSnapshot(fs.doc(db, 'access', user.uid),
    snap => {
      const d = snap.exists() ? snap.data() : {};
      session.type = d.type || '';
      session.allow = Array.isArray(d.allow) ? d.allow : [];
      session.deny = Array.isArray(d.deny) ? d.deny : [];
      if (session.type) watchTpl(); else if (!tplOk) seen.tpl = true;   // pendiente: no puede leer las plantillas
      emit('access');
    }, e => { seen.tpl = true; fail('access')(e); }));
  // Se anota en el directorio para que el administrador vea la cuenta (si las reglas lo permiten)
  fs.setDoc(fs.doc(db, 'directory', user.uid), { email: user.email || '', lastSeen: new Date().toISOString() }, { merge: true }).catch(() => {});
}

export function stopAccess() {
  accessUnsubs.forEach(u => u());
  accessUnsubs = [];
}

// Nombre con el que el administrador reconoce la cuenta
export function setDirectoryName(name) {
  if (!account.user) return Promise.resolve();
  return fb.fs.setDoc(fb.fs.doc(fb.db, 'directory', account.user.uid), { email: account.user.email || '', name: String(name).slice(0, 80) }, { merge: true });
}

// Solo para el administrador (las reglas de Firestore lo impiden a los demás)
export const admin = {
  async listUsers() {
    const { fs, db } = fb;
    const [dir, acc] = await Promise.all([fs.getDocs(fs.collection(db, 'directory')), fs.getDocs(fs.collection(db, 'access'))]);
    const types = Object.fromEntries(acc.docs.map(d => [d.id, d.data().type || '']));
    const over = Object.fromEntries(acc.docs.map(d => [d.id, { allow: d.data().allow || [], deny: d.data().deny || [] }]));
    return dir.docs.map(d => ({ uid: d.id, email: '', name: '', lastSeen: '', ...d.data(), type: types[d.id] || '', allow: over[d.id]?.allow || [], deny: over[d.id]?.deny || [] }))
      .sort((a, b) => (a.type ? 1 : 0) - (b.type ? 1 : 0) || (b.lastSeen || '').localeCompare(a.lastSeen || ''));
  },
  // Buzón: deja un respaldo (JSON) para que la otra cuenta lo importe con un toque desde su app
  sendData(uid, payload, note = '') {
    const { fs, db } = fb;
    return fs.setDoc(fs.doc(fs.collection(db, 'inbox', uid, 'items')), { from: account.user.uid, fromName: String(note || '').slice(0, 80), payload, at: new Date().toISOString() });
  },
  // type vacío = quitar el acceso (la cuenta vuelve a quedar pendiente)
  setType(uid, type) {
    const { fs, db } = fb;
    const ref = fs.doc(db, 'access', uid);
    return type ? fs.setDoc(ref, { type, updatedAt: new Date().toISOString(), by: account.user.uid }) : fs.deleteDoc(ref);
  },
  // Tipo + funciones de más (allow) o de menos (deny) frente a su plantilla
  setAccess(uid, { type, allow = [], deny = [] }) {
    if (!type) return this.setType(uid, '');
    const { fs, db } = fb;
    return fs.setDoc(fs.doc(db, 'access', uid), { type, allow: allow.slice(0, 200), deny: deny.slice(0, 200), updatedAt: new Date().toISOString(), by: account.user.uid });
  },
  // Plantillas por tipo de perfil (las ven todas las cuentas aprobadas y se aplican al instante)
  saveTemplates(types) {
    const { fs, db } = fb;
    return fs.setDoc(fs.doc(db, 'config', 'plantillas'), { types, updatedAt: new Date().toISOString(), by: account.user.uid });
  },
};

// Datos que el administrador te dejó para importar (buzón)
export const inbox = {
  async list() {
    if (!isCloud || !account.user) return [];
    try { const snap = await fb.fs.getDocs(fb.fs.collection(fb.db, 'inbox', account.user.uid, 'items')); return snap.docs.map(d => ({ id: d.id, ...d.data() })); } catch { return []; }
  },
  remove(id) { return fb.fs.deleteDoc(fb.fs.doc(fb.db, 'inbox', account.user.uid, 'items', id)); },
};

// ═════════════════════════════ CONGREGACIÓN COMPARTIDA ═════════════════════════════
// Quien la administra (dueño) comparte su organigrama, grupos, mecánicas, visita del superintendente y la lista de
// publicadores con otras cuentas (por ejemplo, otro anciano). Ellas la ven siempre al día y SOLO LECTURA.
//   congres/{uid del dueño}              → { owner, ownerName, members: [uid], memberNames: {uid: nombre}, name, updatedAt }
//   congres/{uid del dueño}/parts/{parte} → { json, n, updatedAt }   parte = depts | groups | mecas | visitas | people | congre
// En la app de quien la recibe (y decide usarla: profile.congreFollow = uid del dueño) esas colecciones se muestran
// con lo del dueño; lo suyo se guarda intacto y vuelve si deja de usarla. Las personas del dueño que ya están en
// sus Personas (mismo nombre, o la cuenta vinculada a su ficha «soy yo») se reconocen como la misma persona.
const CG_COLS = ['depts', 'groups', 'mecas', 'visitas'];
const CG_PARTS = [...CG_COLS, 'people', 'congre'];
const CG_PERSON = ['id', 'name', 'role', 'privileges', 'groupIds', 'groupLeftAt', 'aliases', 'accountUid', 'accountName'];
const CG_PRIVATE_ROLES = /^(estudiante b[ií]blico|interesad[oa]|familiar)$/i;
const cgOwn = { depts: [], groups: [], mecas: [], visitas: [], people: [] };
let cgOffersList = [], cgHead = null, cgParts = {}, cgFollowId = '', cgUnsubs = [], cgActive = false, cgMap = {}, cgExtra = new Set(), cgWarned = 0;
const cgTok = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[\s,.]+/).filter(w => w && !['de', 'del', 'la', 'las', 'los', 'y'].includes(w));
function cgSameName(a, b) {
  const x = cgTok(a), y = cgTok(b);
  if (!x.length || !y.length || x[0] !== y[0]) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.every(w => long.includes(w));
}
// Cambia los ids de personas del dueño por los tuyos (en valores y en claves, a cualquier profundidad)
export function remapIds(v, map) {
  if (typeof v === 'string') return map[v] || v;
  if (Array.isArray(v)) return v.map(x => remapIds(x, map));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [map[k] || k, remapIds(x, map)]));
  return v;
}
// ¿Qué persona tuya es esta del dueño? Por la cuenta vinculada (tú) o por el nombre (también los alias)
export function matchPeople(shared, own, myUid = '') {
  const map = {};
  const me = own.find(p => p.isMe);
  const used = new Set();
  shared.forEach(sp => {
    let o = null;
    if (me && myUid && sp.accountUid === myUid) o = me;
    if (!o) o = own.find(p => !used.has(p.id) && (cgSameName(p.name, sp.name) || String(p.aliases || '').split(',').some(a => a.trim() && cgSameName(a, sp.name))
      || String(sp.aliases || '').split(',').some(a => a.trim() && cgSameName(p.name, a))));
    if (o) { map[sp.id] = o.id; used.add(o.id); }
  });
  return map;
}
function composeCg() {
  cgActive = !!(cgFollowId && cgHead && cgHead.owner === cgFollowId && cgParts.depts);
  if (!cgActive) {
    CG_COLS.forEach(c => { data[c] = cgOwn[c]; });
    data.people = cgOwn.people;
    cgMap = {}; cgExtra = new Set();
    return;
  }
  const sh = cgParts.people || [];
  cgMap = matchPeople(sh, cgOwn.people, uidOf());
  const tag = x => ({ ...remapIds(x, cgMap), cgFrom: cgHead.owner });
  CG_COLS.forEach(c => { data[c] = (cgParts[c] || []).map(tag); });
  const byOwn = Object.fromEntries(Object.entries(cgMap).map(([s, o]) => [o, sh.find(p => p.id === s)]));
  const extra = sh.filter(p => !cgMap[p.id]).map(tag);
  cgExtra = new Set(extra.map(p => p.id));
  // Tus fichas que también están en la congregación: el grupo y los privilegios salen de lo del dueño (solo para verlos)
  data.people = [...cgOwn.people.map(p => {
    const sp = byOwn[p.id];
    if (!sp) return p;
    return { ...p, groupIds: remapIds(sp.groupIds || [], cgMap), groupLeftAt: sp.groupLeftAt || p.groupLeftAt, privileges: [...new Set([...(p.privileges || []), ...(sp.privileges || [])])], cgLinked: true };
  }), ...extra];
}
// Tus datos (sin lo del dueño) para el respaldo
function cgOwnData() { return cgActive ? { depts: cgOwn.depts, groups: cgOwn.groups, mecas: cgOwn.mecas, visitas: cgOwn.visitas, people: cgOwn.people } : {}; }
// Lo que llega de la congregación de otro no se cambia aquí
function cgBlocked(col, id) {
  if (!cgActive) return false;
  if (!CG_COLS.includes(col) && !(col === 'people' && cgExtra.has(id))) return false;
  if (Date.now() - cgWarned > 4000) { cgWarned = Date.now(); onError({ friendly: `Esto es de la congregación que comparte ${cgHead?.ownerName || 'otra cuenta'}: solo esa cuenta lo puede cambiar.` }); }
  return true;
}
// Al guardar o borrar tus Personas mientras ves una congregación compartida, se actualiza también tu lista propia
function cgMirror(col, item, removedId) {
  if (!cgActive) { if (col in cgOwn) cgOwn[col] = data[col]; return; }
  if (col !== 'people') return;
  if (removedId) { cgOwn.people = cgOwn.people.filter(x => x.id !== removedId); return; }
  const { cgLinked, ...clean } = item;
  const own = cgOwn.people.find(x => x.id === item.id);
  // el grupo y los privilegios que se ven son del dueño: en tu ficha se guardan los tuyos
  const keep = cgLinked && own ? { groupIds: own.groupIds || [], groupLeftAt: own.groupLeftAt, privileges: item.privileges } : {};
  const next = { ...clean, ...keep };
  const i = cgOwn.people.findIndex(x => x.id === item.id);
  if (i >= 0) cgOwn.people[i] = next; else cgOwn.people.push(next);
}
function cgReset() {
  cgUnsubs.forEach(u => u()); cgUnsubs = [];
  CG_COLS.forEach(c => { cgOwn[c] = []; }); cgOwn.people = [];
  cgOffersList = []; cgHead = null; cgParts = {}; cgFollowId = ''; cgActive = false; cgMap = {}; cgExtra = new Set();
  cgPushed = {}; clearTimeout(cgTimer);
  composeCg();
}

// ── Quien recibe ──
function cgWatchOffers(uid) {
  const q = fb.fs.query(fb.fs.collection(fb.db, 'congres'), fb.fs.where('members', 'array-contains', uid));
  unsubs.push(fb.fs.onSnapshot(q, snap => {
    cgOffersList = snap.docs.map(d => ({ ...d.data(), id: d.id })).filter(d => d.owner !== uid);
    if (cgFollowId) { cgHead = cgOffersList.find(d => d.id === cgFollowId) || null; if (!cgHead) { cgParts = {}; cgStopParts(); } }
    cgFollowSync(); composeCg(); notify();
  }, err => console.warn('Congregaciones compartidas no disponibles', err)));
}
function cgStopParts() { cgUnsubs.forEach(u => u()); cgUnsubs = []; cgPartsOf = ''; }
let cgPartsOf = '';
function cgFollowSync() {
  if (!fb || !account.user) return;
  const want = (data.profile.find(p => p.id === 'me') || {}).congreFollow || '';
  cgFollowId = want;
  const ok = want && cgOffersList.some(d => d.id === want);
  if (!ok) { if (cgPartsOf) { cgStopParts(); cgParts = {}; composeCg(); } return; }
  cgHead = cgOffersList.find(d => d.id === want);
  if (cgPartsOf === want) return;
  cgStopParts(); cgParts = {}; cgPartsOf = want;
  cgUnsubs.push(fb.fs.onSnapshot(fb.fs.collection(fb.db, 'congres', want, 'parts'), snap => {
    const parts = {};
    snap.docs.forEach(d => { try { parts[d.id] = JSON.parse(d.data().json || 'null'); } catch { /* parte dañada: se ignora */ } });
    if (parts.depts && !Array.isArray(parts.depts)) delete parts.depts;
    cgParts = parts; composeCg(); notify();
  }, err => { console.warn('No se pudo leer la congregación compartida', err); cgParts = {}; composeCg(); notify(); }));
}

// ── Quien la comparte ──
let cgPushed = {}, cgTimer = 0;
function cgPublishSoon() { clearTimeout(cgTimer); cgTimer = setTimeout(cgPublish, 3000); }
function cgCfg() { return (data.profile.find(p => p.id === 'me') || {}).congreShare || null; }
function cgPartsData() {
  const used = new Set();
  const add = v => { if (typeof v === 'string') used.add(v); else if (Array.isArray(v)) v.forEach(add); else if (v && typeof v === 'object') { Object.keys(v).forEach(k => used.add(k)); Object.values(v).forEach(add); } };
  [...cgOwn.depts, ...cgOwn.mecas, ...cgOwn.visitas].forEach(add);
  const people = cgOwn.people.filter(p => used.has(p.id) || (p.groupIds || []).length || (p.privileges || []).length || !CG_PRIVATE_ROLES.test(String(p.role || '').trim()))
    .map(p => Object.fromEntries(CG_PERSON.filter(k => p[k] !== undefined && p[k] !== '').map(k => [k, p[k]])));
  const c = myProfile().congre || {};
  const congre = Object.fromEntries(['name', 'number', 'circuit', 'address', 'midweek', 'weekend', 'midweekDay', 'midweekTime', 'weekendDay', 'weekendTime'].filter(k => c[k] !== undefined).map(k => [k, c[k]]));
  return { depts: cgOwn.depts, groups: cgOwn.groups, mecas: cgOwn.mecas, visitas: cgOwn.visitas, people, congre };
}
async function cgPublish() {
  const sh = cgCfg();
  if (!fb || !account.user || !sh?.on || !(sh.members || []).length) return;
  if (!['profile', 'people', ...CG_COLS].every(c => seenCols.has(c))) return cgPublishSoon();   // espera a tener todo
  const me = uidOf(), now = new Date().toISOString();
  // La primera vez en esta sesión se lee lo que ya está publicado, para no volver a subir lo que no cambió
  if (!cgPushed.loaded) {
    try { (await fb.fs.getDocs(fb.fs.collection(fb.db, 'congres', me, 'parts'))).docs.forEach(d => { cgPushed[d.id] = d.data().json; }); } catch { /* aún no hay nada publicado */ }
    cgPushed.loaded = true;
  }
  const parts = cgPartsData();
  const changed = CG_PARTS.filter(k => { const j = JSON.stringify(parts[k] ?? null); return cgPushed[k] !== j; });
  const headKey = JSON.stringify([sh.members, sh.names, myName(), parts.congre?.name || '']);
  if (!changed.length && cgPushed.head === headKey) return;
  try {
    await fb.fs.setDoc(fb.fs.doc(fb.db, 'congres', me), { owner: me, ownerName: myName(), members: sh.members.slice(0, 30), memberNames: sh.names || {}, name: String(parts.congre?.name || '').slice(0, 80), updatedAt: now });
    cgPushed.head = headKey;
    for (const k of changed) {
      const json = JSON.stringify(parts[k] ?? null);
      if (json.length > 900000) { onError({ friendly: `La parte «${k}» de la congregación es muy grande para compartirla.` }); continue; }
      await fb.fs.setDoc(fb.fs.doc(fb.db, 'congres', me, 'parts', k), { json, n: Array.isArray(parts[k]) ? parts[k].length : 1, updatedAt: now });
      cgPushed[k] = json;
    }
  } catch (e) { onError(e); }
}
async function cgUnpublish() {
  if (!fb || !account.user) return;
  const me = uidOf();
  try {
    for (const k of CG_PARTS) await fb.fs.deleteDoc(fb.fs.doc(fb.db, 'congres', me, 'parts', k)).catch(() => {});
    await fb.fs.deleteDoc(fb.fs.doc(fb.db, 'congres', me));
  } catch (e) { onError(e); }
  cgPushed = {};
}

export const congre = {
  offers: () => cgOffersList,
  following: () => (cgActive ? { owner: cgHead.owner, ownerName: cgHead.ownerName || '', name: cgHead.name || '', updatedAt: cgHead.updatedAt || '', congre: cgParts.congre || {} } : null),
  followId: () => cgFollowId,
  isShared: x => !!x?.cgFrom,
  sharing: () => cgCfg(),
  share(members, names) { patchProfile({ congreShare: { on: true, members, names } }); cgPushed.head = ''; setTimeout(cgPublish, 300); },
  stop() { patchProfile({ congreShare: { on: false, members: [], names: {} } }); return cgUnpublish(); },
  follow(owner) { patchProfile({ congreFollow: owner }); },
  unfollow() { patchProfile({ congreFollow: '' }); },
  decline(owner) { patchProfile(v => ({ congreDeclined: [...new Set([...(v.congreDeclined || []), owner])] })); },
  publishNow: () => cgPublish(),
};

// ═════════════════════════════ NOTAS Y TAREAS COMPARTIDAS ═════════════════════════════
// sharedItems/{id} → { owner, ownerName, members: [uid], memberNames, kind: 'note' | 'task', title, body, tag, date,
//                      due, dueTime, status, priority, about, responsibles, log, comments: [{ by, byName, t, at }], ... }
// Quien la comparte cambia el contenido; los demás la ven siempre al día y solo agregan comentarios.
// Tu nota o tarea guarda shareId, shareWith [uid] y shareNames {uid: nombre}.
let shItems = [], shReady = false;
const SH_LOG = l => ({ d: String(l?.d || ''), t: String(l?.t || '').slice(0, 500), ...(l?.byName ? { byName: String(l.byName).slice(0, 80) } : {}) });
function shPayload(col, item) {
  const about = item.personId ? (data.people.find(p => p.id === item.personId)?.name || '') : '';
  if (col === 'notes') return { kind: 'note', title: String(item.title || '').slice(0, 140), body: String(item.body || '').slice(0, 20000), tag: String(item.tag || '').slice(0, 60), date: String(item.date || ''), about };
  return { kind: 'task', title: String(item.title || '').slice(0, 140), body: String(item.notes || '').slice(0, 20000), due: String(item.due || ''), dueTime: String(item.dueTime || ''),
    status: String(item.status || 'pendiente'), priority: String(item.priority || 'normal'), about, responsibles: (item.responsibles || []).map(String).slice(0, 20), log: (item.log || []).slice(-100).map(SH_LOG) };
}
function shItemsWatch(uid) {
  const q = fb.fs.query(fb.fs.collection(fb.db, 'sharedItems'), fb.fs.where('members', 'array-contains', uid));
  unsubs.push(fb.fs.onSnapshot(q, snap => { shItems = snap.docs.map(d => ({ ...d.data(), id: d.id })); shReady = true; notify(); },
    err => { shReady = true; console.warn('Notas compartidas no disponibles', err); }));
}
function shItemPush(col, item) {
  if (!fb || !account.user) return;
  const doc = shItems.find(d => d.id === item.shareId);
  const p = shPayload(col, item);
  const members = [uidOf(), ...(item.shareWith || []).filter(u => u !== uidOf())];
  const now = new Date().toISOString();
  const ref = fb.fs.doc(fb.db, 'sharedItems', item.shareId);
  if (doc) {
    const cur = { ...shPayload(col, {}), ...Object.fromEntries(Object.keys(p).map(k => [k, doc[k]])) };
    if (JSON.stringify(cur) === JSON.stringify(p) && JSON.stringify(doc.members) === JSON.stringify(members)) return;
    fb.fs.updateDoc(ref, JSON.parse(JSON.stringify({ ...p, members, memberNames: { [uidOf()]: myName(), ...(item.shareNames || {}) }, updatedAt: now, updatedBy: uidOf() }))).catch(e => { if (e?.code !== 'not-found') onError(e); });
  } else {
    // merge: si todavía no llegaron las compartidas, no se pisan los comentarios que ya tenga
    const first = shReady ? { comments: [], createdAt: now } : {};
    fb.fs.setDoc(ref, JSON.parse(JSON.stringify({ ...p, owner: uidOf(), ownerName: myName(), members, memberNames: { [uidOf()]: myName(), ...(item.shareNames || {}) },
      ...first, updatedAt: now, updatedBy: uidOf() })), { merge: true }).catch(onError);
  }
}
function shItemDelete(id) { if (fb && account.user) fb.fs.deleteDoc(fb.fs.doc(fb.db, 'sharedItems', id)).catch(() => {}); }

export const shared = {
  ready: () => shReady,
  all: () => shItems,
  received: () => shItems.filter(d => d.owner !== uidOf()),
  doc: id => shItems.find(d => d.id === id) || null,
  // Comparte (o cambia con quién) una nota o tarea tuya. uids vacío = dejar de compartirla.
  set(col, id, uids, names = {}) {
    const item = data[col].find(x => x.id === id);
    if (!item || !fb || !account.user) return null;
    if (!uids.length) {
      if (item.shareId) shItemDelete(item.shareId);
      const { shareId, shareWith, shareNames, ...rest } = item;
      write(col, { ...rest, updatedAt: new Date().toISOString() }, { explicit: true });
      return null;
    }
    const shareId = item.shareId || fb.fs.doc(fb.fs.collection(fb.db, 'sharedItems')).id;
    const next = { ...item, shareId, shareWith: uids, shareNames: names, updatedAt: new Date().toISOString() };
    write(col, next, { noShare: true });
    shItemPush(col, next);
    return next;
  },
  // Agrega un comentario (lo puede hacer quien la comparte y quienes la reciben)
  comment(id, text) {
    const d = shItems.find(x => x.id === id);
    const t = String(text || '').trim().slice(0, 1000);
    if (!d || !t || !fb || !account.user) return Promise.resolve(false);
    const c = { by: uidOf(), byName: myName(), t, at: new Date().toISOString() };
    const comments = [...(d.comments || []), c];
    d.comments = comments; notify();
    return fb.fs.updateDoc(fb.fs.doc(fb.db, 'sharedItems', id), { comments, updatedAt: c.at, updatedBy: uidOf() }).then(() => true).catch(e => { onError(e); return false; });
  },
};

// ═════════════════════════════ NOVEDADES Y USO DE LA APP ═════════════════════════════
// config/novedades → { items: [{ v, date, notes: [texto], avisar }], updatedAt, by }  lo escribe solo el administrador;
// lo leen todas las cuentas aprobadas (Ajustes → 📰 Novedades). «avisar» = versión importante: sale «Actualizar» y el aviso.
let newsItems = [];
function newsWatch() {
  unsubs.push(fb.fs.onSnapshot(fb.fs.doc(fb.db, 'config', 'novedades'),
    snap => { newsItems = snap.exists() && Array.isArray(snap.data().items) ? snap.data().items : []; notify(); },
    () => { newsItems = []; }));
}
export const news = {
  items: () => [...newsItems].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.v || '').localeCompare(String(a.v || ''), undefined, { numeric: true })),
  save(items) {
    if (!fb || !account.user) return Promise.reject(new Error('sin sesión'));
    const clean = items.slice(0, 60).map(x => ({ v: String(x.v || '').slice(0, 20), date: String(x.date || '').slice(0, 10), notes: (x.notes || []).map(t => String(t).slice(0, 300)).filter(Boolean).slice(0, 12), avisar: !!x.avisar }));
    newsItems = clean; notify();
    return fb.fs.setDoc(fb.fs.doc(fb.db, 'config', 'novedades'), { items: clean, updatedAt: new Date().toISOString(), by: account.user.uid });
  },
};
// Cada teléfono anota qué versión usa y desde dónde (solo lo ve el administrador en «Quién usa la app»)
let reported = '';
export function reportClient(ver, dev) {
  if (!fb || !account.user || !hasAccess()) return;
  const k = `${account.user.uid}|${ver}|${dev}`;
  if (reported === k) return;
  reported = k;
  fb.fs.setDoc(fb.fs.doc(fb.db, 'directory', account.user.uid), { email: account.user.email || '', lastSeen: new Date().toISOString(), ver: String(ver).slice(0, 20), dev: String(dev).slice(0, 40) }, { merge: true }).catch(() => {});
}
// Repintar la pantalla cuando algo de fuera de los datos cambió (por ejemplo, llegó el número de cuentas pendientes)
export const refresh = () => notify();
