// Capa de datos. Todo el resto de la app solo habla con este archivo.
//
//  · Modo local: localStorage (si config.js aún no tiene tus claves de Firebase).
//  · Modo nube:  Firebase Auth (correo y contraseña) + Firestore con caché sin conexión.
//
// Estructura en Firestore:  users/{uid}/{notes|events|tasks|people|groups|meetings|entries|profile|weeks}/{id}
//  Control de acceso (varias personas usando la misma app):
//   · admins/{uid}     → existe solo para el administrador (se crea a mano en la consola de Firebase)
//   · access/{uid}     → { type: 'publicador' | 'precursor' | 'anciano' } lo escribe solo el administrador
//   · directory/{uid}  → { email, name, lastSeen } lo escribe cada usuario, para que el administrador lo vea

import { firebaseConfig, FIREBASE_VERSION } from './config.js';

export const COLS = ['notes', 'events', 'tasks', 'people', 'groups', 'meetings', 'entries', 'profile', 'weeks'];
export const data = Object.fromEntries(COLS.map(c => [c, []]));

// Estado de la sesión en modo nube: si es administrador y qué tipo de perfil tiene asignado
export const session = { isAdmin: false, type: '', legacy: false };

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
function write(col, item) {
  if (col === 'events' && item.sharedId) return sharedWrite(item);
  const i = data[col].findIndex(x => x.id === item.id);
  if (i >= 0) data[col][i] = item; else data[col].push(item);
  notify();
  if (isCloud) cloud.upsert(col, item); else local.persist();
}

// Crea o actualiza un elemento y devuelve la versión guardada
export function upsert(col, item) {
  const now = new Date().toISOString();
  const saved = { ...item, updatedAt: now, createdAt: item.createdAt || now };
  write(col, saved);
  return saved;
}

export function remove(col, id) {
  if (col === 'events' && String(id).startsWith(SH)) return sharedRemove(id);
  data[col] = data[col].filter(x => x.id !== id);
  notify();
  if (isCloud) cloud.remove(col, id); else local.persist();
}

// Vuelve a poner un elemento eliminado (para "Deshacer")
export const restore = (col, item) => write(col, item);

// ---------- Respaldo ----------
export function exportAll() {
  const own = { ...data, events: data.events.filter(e => !e.sharedId) };   // los compartidos son de otra colección
  return JSON.stringify({ app: 'mi-agenda-teocrática', version: 1.3, exportedAt: new Date().toISOString(), data: own }, null, 2);
}

export function importAll(json) {
  const parsed = JSON.parse(json);
  const src = parsed.data || parsed;
  let n = 0;
  COLS.forEach(c => (Array.isArray(src[c]) ? src[c] : []).forEach(it => {
    if (it && it.id) { write(c, it); n++; }
  }));
  // Un archivo de cambios puede pedir quitar elementos: { remove: { events: [ids] } }
  const rm = parsed.remove || {};
  COLS.forEach(c => (Array.isArray(rm[c]) ? rm[c] : []).forEach(id => { if (get(c, id)) { remove(c, id); n++; } }));
  return n;
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

export function startSync(uid) {
  stopSync();
  COLS.forEach(c => {
    const ref = fb.fs.collection(fb.db, 'users', uid, c);
    unsubs.push(fb.fs.onSnapshot(ref,
      snap => {
        const list = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        if (c === 'events') { ownEvents = list; composeEvents(); }
        else { data[c] = list; if (c === 'profile') { composeEvents(); if (myName() !== lastMemberName) touchMember(); } }
        notify();
      },
      err => onError(err)));
  });
  // Eventos que otros te compartieron (o que tú compartiste)
  const q = fb.fs.query(fb.fs.collection(fb.db, 'shared'), fb.fs.where('members', 'array-contains', uid));
  unsubs.push(fb.fs.onSnapshot(q,
    snap => { sharedDocs = snap.docs.map(d => ({ ...d.data(), _id: d.id })); composeEvents(); notify(); },
    err => console.warn('Compartidos no disponibles', err)));
  // Te anotas en la lista de cuentas (solo tu nombre) para que otros puedan compartirte eventos
  touchMember();
}

// ═════════════════════════════ EVENTOS COMPARTIDOS ═════════════════════════════
// shared/{id} → { ...campos del evento, owner, ownerName, members: [uid], memberNames: {uid: nombre}, updatedBy, updatedByName }
// Todos los miembros lo ven y lo pueden editar; solo quien lo creó cambia con quién se comparte o lo borra.
// En la app aparecen mezclados con tus eventos (id «sh_…» y sharedId); ocultarlos se guarda en profile.sharedHidden.
const SH = 'sh_';
let ownEvents = [];
let sharedDocs = [];
const SHARED_FIELDS = ['title', 'category', 'date', 'time', 'endTime', 'place', 'repeat', 'days', 'notes', 'theme', 'color', 'skipDates'];
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
  const i = data.events.findIndex(x => x.id === item.id);
  if (i >= 0) data.events[i] = item; else data.events.push(item);
  notify();
  if (!fb || !account.user) return;
  const ref = fb.fs.doc(fb.db, 'shared', item.sharedId);
  const prev = sharedDocs.find(d => d._id === item.sharedId);
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
  } else upsert('events', { ...ev, doneLog });
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
export async function listMembers() {
  if (!fb || !account.user) return [];
  const snap = await fb.fs.getDocs(fb.fs.collection(fb.db, 'members'));
  return snap.docs.map(d => ({ uid: d.id, name: d.data().name || '' })).filter(m => m.uid !== account.user.uid && m.name)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function stopSync() {
  unsubs.forEach(u => u());
  unsubs = [];
  COLS.forEach(c => { data[c] = []; });
  ownEvents = []; sharedDocs = [];
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
  const seen = { admin: false, access: false };
  const emit = key => { seen[key] = true; if (seen.admin && seen.access) onChange(session); };
  const fail = key => e => {
    if (e?.code === 'permission-denied') session.legacy = true; else onError(e);
    emit(key);
  };
  session.isAdmin = false; session.type = ''; session.legacy = false;
  accessUnsubs.push(fs.onSnapshot(fs.doc(db, 'admins', user.uid),
    snap => { session.isAdmin = snap.exists(); emit('admin'); }, fail('admin')));
  accessUnsubs.push(fs.onSnapshot(fs.doc(db, 'access', user.uid),
    snap => { session.type = snap.exists() ? (snap.data().type || '') : ''; emit('access'); }, fail('access')));
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
    return dir.docs.map(d => ({ uid: d.id, email: '', name: '', lastSeen: '', ...d.data(), type: types[d.id] || '' }))
      .sort((a, b) => (a.type ? 1 : 0) - (b.type ? 1 : 0) || (b.lastSeen || '').localeCompare(a.lastSeen || ''));
  },
  // type vacío = quitar el acceso (la cuenta vuelve a quedar pendiente)
  setType(uid, type) {
    const { fs, db } = fb;
    const ref = fs.doc(db, 'access', uid);
    return type ? fs.setDoc(ref, { type, updatedAt: new Date().toISOString(), by: account.user.uid }) : fs.deleteDoc(ref);
  },
};
