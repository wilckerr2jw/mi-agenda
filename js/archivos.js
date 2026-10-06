// Guardar el archivo original (el PDF o la foto que subiste), no solo lo que la app leyó de él.
//
// Vive en Firebase Storage, bajo «users/{tu uid}/…», con las mismas reglas que tus datos:
// solo tú lo abres. Ver storage.rules.
//
// Si el Almacenamiento no está activado en el proyecto, nada se rompe: la app sigue guardando
// los datos leídos como hasta ahora y avisa de que el archivo no se pudo quedar.
import * as store from './store.js';
import { isCloud, account, firebaseApp, myUid, data } from './store.js';
import { toast } from './util.js';
import { firebaseConfig, FIREBASE_VERSION } from './config.js';

export const MAX = 10 * 1024 * 1024;        // 10 MB por archivo
const COLS_OK = ['programa', 'limpieza', 'tablero', 'asistencia'];

// ¿Está activado el Almacenamiento en el proyecto? Se pregunta una sola vez (la respuesta queda
// guardada mientras la app esté abierta). Sin bucket, la consulta responde 404 en un instante;
// así no se enseña un botón de subir que no podría funcionar.
let listo = null;
try { const g = sessionStorage.getItem('miagenda.almacen'); if (g) listo = g === '1'; } catch { /* sin sessionStorage */ }

export async function comprobar() {
  if (!isCloud) return false;
  if (listo !== null) return listo;
  try {
    const r = await fetch(`https://firebasestorage.googleapis.com/v0/b/${firebaseConfig.storageBucket}/o?maxResults=1`);
    listo = r.status !== 404;            // 403 = existe pero las reglas no dejan mirar: nos vale
  } catch { listo = false; }             // sin internet: ya se volverá a preguntar en otra sesión
  try { if (listo) sessionStorage.setItem('miagenda.almacen', '1'); } catch { /* da igual */ }
  return listo;
}

// ¿Se puede guardar el archivo? (en la nube, con la sesión abierta y con el Almacenamiento activado)
export const disponible = () => isCloud && listo === true && !!account.user && !!firebaseApp();

// El nombre con el que se guarda: sin acentos, sin espacios y sin nada que confunda a la ruta
export function nombreSeguro(n) {
  const base = String(n || 'archivo')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9.\-_]+/g, '-')
    .replace(/-+/g, '-').replace(/^[-.]+/, '').slice(-60);
  return base || 'archivo';
}

// Devuelve el motivo por el que NO se puede subir, o '' si está bien
export function valida(f) {
  if (!f) return 'No elegiste ningún archivo';
  if (f.size > MAX) return `El archivo pesa ${(f.size / 1048576).toFixed(1)} MB y el máximo son 10 MB`;
  const t = String(f.type || '');
  if (t !== 'application/pdf' && !t.startsWith('image/')) return 'Solo se pueden guardar PDF o fotos';
  return '';
}

// La ficha que se guarda dentro del registro: { ruta, nombre, tipo, tam, url, at }
export const tieneArchivo = d => !!(d && d.file && d.file.url);

// ¿Algún otro registro usa ese mismo archivo? (una subida puede repartirse entre varias semanas)
export function enUso(ruta, exceptoId = '') {
  if (!ruta) return false;
  return COLS_OK.some(c => (data[c] || []).some(d => d.id !== exceptoId && d.file?.ruta === ruta));
}

let mod = null;
async function storage() {
  const app = firebaseApp();
  if (!app) throw new Error('sin-sesion');
  mod ??= await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-storage.js`);
  const st = mod.getStorage(app, `gs://${firebaseConfig.storageBucket}`);
  // Por defecto reintenta dos minutos. Si el Almacenamiento no está activado, eso es una espera
  // larga para nada: con 20 segundos basta para saber que no se va a poder.
  st.maxUploadRetryTime = 20000;
  st.maxOperationRetryTime = 20000;
  return { m: mod, st };
}

// Sube el archivo y devuelve su ficha. Si el Almacenamiento no está activado, lanza 'sin-almacen'.
export async function subir(col, id, f, paso = () => {}) {
  if (!COLS_OK.includes(col)) throw new Error('coleccion');
  const motivo = valida(f);
  if (motivo) throw new Error(motivo);
  if (!disponible()) throw new Error('sin-sesion');
  const { m, st } = await storage();
  const nombre = nombreSeguro(f.name);
  const ruta = `users/${myUid()}/${col}/${id}/${nombre}`;
  const ref = m.ref(st, ruta);
  try {
    const tarea = m.uploadBytesResumable(ref, f, { contentType: f.type, cacheControl: 'private, max-age=31536000' });
    await new Promise((ok, mal) => {
      tarea.on('state_changed',
        s => paso(`Guardando el archivo… ${Math.round((s.bytesTransferred / (s.totalBytes || 1)) * 100)}%`),
        mal, ok);
    });
    const url = await m.getDownloadURL(ref);
    return { ruta, nombre: String(f.name || nombre).slice(0, 120), tipo: f.type || '', tam: f.size || 0, url, at: new Date().toISOString() };
  } catch (e) {
    // Proyecto sin Storage activado, o sin permiso: se distingue para poder explicarlo bien
    // Sin bucket, la peticion ni siquiera pasa el preflight: el SDK reintenta y acaba en
    // retry-limit-exceeded. Es el mismo sintoma que una mala conexion, asi que el aviso cubre ambos.
    const c = String(e?.code || '');
    if (['storage/unauthorized', 'storage/unknown', 'storage/project-not-found',
      'storage/bucket-not-found', 'storage/retry-limit-exceeded'].includes(c)) {
      const err = new Error('sin-almacen'); err.cause = e; throw err;
    }
    throw e;
  }
}

// Borra el archivo, pero solo si no lo está usando otro registro
export async function borrar(ficha, exceptoId = '') {
  const ruta = ficha?.ruta;
  if (!ruta || enUso(ruta, exceptoId) || !disponible()) return false;
  try {
    const { m, st } = await storage();
    await m.deleteObject(m.ref(st, ruta));
    return true;
  } catch (e) {
    if (String(e?.code || '') === 'storage/object-not-found') return true;   // ya no estaba
    console.warn('No se pudo borrar el archivo', e);
    return false;
  }
}

// El texto que se ve debajo del archivo guardado
export const resumen = ficha => !ficha ? '' :
  `${ficha.nombre || 'Archivo'}${ficha.tam ? ` · ${ficha.tam < 1048576 ? `${Math.max(1, Math.round(ficha.tam / 1024))} KB` : `${(ficha.tam / 1048576).toFixed(1)} MB`}` : ''}`;

// ───────────── La casilla «guarda también el archivo» (programa y limpieza) ─────────────
// Se ve en la vista previa, antes de guardar. Marcada por defecto: si subiste el PDF,
// lo normal es querer poder volver a abrirlo.
export const guardarArchivoHtml = pref => !disponible() ? '' :
  `<label class="pchip ar-chk"><input type="checkbox" id="${pref}-arch" checked><span>Guardar también el archivo, para poder abrirlo luego</span></label>`;

// Guarda el archivo DESPUÉS de que los datos ya estén guardados, y le pone la ficha a cada
// registro que salió de él. No se espera a esto para nada: si el Almacenamiento está caído o
// sin activar, los datos ya se guardaron y aquí solo se avisa.
//
// pref = el prefijo de la casilla ('pg' o 'lp') · ids = los registros que vinieron de ese archivo
export function guardarArchivoLuego(pref, col, ids, f) {
  if (!f || !ids.length || !disponible()) return;
  if (document.getElementById(`${pref}-arch`)?.checked === false) return;
  subir(col, ids[0], f).then(file => {
    ids.forEach(id => { const d = store.get(col, id); if (d) store.upsert(col, { ...d, file }); });
    toast('El archivo también quedó guardado');
  }).catch(e => {
    console.warn('No se pudo guardar el archivo', e);
    toast(e?.message === 'sin-almacen'
      ? 'Los datos se guardaron. El archivo no: revisa la conexión o que el Almacenamiento esté activado.'
      : 'Los datos se guardaron, pero el archivo no.');
  });
}
