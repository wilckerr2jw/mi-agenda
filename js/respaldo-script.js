// Código para Google Apps Script del administrador (se pega en script.google.com con su cuenta de Google).
// Guarda en su Google Drive, carpeta «Mi Agenda · Respaldos», el respaldo cifrado de todas las cuentas que manda
// el servidor de avisos cada semana. No lleva claves: la primera vez que la app se conecta le deja su clave.
export const RESPALDO_SCRIPT = String.raw`/**
 * Mi Agenda Teocrática → Respaldos en Google Drive
 * Este código vive en TU cuenta de Google. Cada semana el servidor de la app le manda un respaldo CIFRADO de todas
 * las cuentas y aquí se guarda en la carpeta «Mi Agenda · Respaldos» de tu Drive (se conservan los últimos).
 * Sin la clave de la app, el archivo no se puede leer.
 */
var CARPETA = 'Mi Agenda · Respaldos';
var VERSION = 1;

function doGet() {
  return salida({ ok: true, app: 'mi-agenda-respaldo', v: VERSION, conectado: !!PropertiesService.getScriptProperties().getProperty('token') });
}

function doPost(e) {
  var b;
  try { b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return salida({ ok: false, error: 'datos' }); }
  var p = PropertiesService.getScriptProperties();
  var token = p.getProperty('token');
  if (!b.token || String(b.token).length < 20) return salida({ ok: false, error: 'clave' });
  if (!token) { p.setProperty('token', String(b.token)); token = String(b.token); }   // la primera vez queda la clave de tu app
  if (b.token !== token) return salida({ ok: false, error: 'clave' });
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return salida({ ok: false, error: 'ocupado' });
  try {
    var f = carpeta();
    if (b.action === 'probar') return salida({ ok: true, carpeta: CARPETA, url: f.getUrl(), archivos: lista(f).length });
    if (b.action === 'guardar') {
      var name = String(b.name || '').replace(/[^\w.\-]/g, '');
      if (!/^mi-agenda-respaldo-[\d-]+\.agenda$/.test(name) || !b.data) return salida({ ok: false, error: 'datos' });
      var file = f.createFile(Utilities.newBlob(String(b.data), 'application/json', name));
      var keep = Math.max(2, Math.min(52, Number(b.keep) || 8));
      lista(f).slice(keep).forEach(function (x) { x.setTrashed(true); });
      return salida({ ok: true, id: file.getId(), size: file.getSize() });
    }
    return salida({ ok: false, error: 'accion' });
  } catch (err) {
    return salida({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function carpeta() {
  var it = DriveApp.getFoldersByName(CARPETA);
  return it.hasNext() ? it.next() : DriveApp.createFolder(CARPETA);
}
// Respaldos de la carpeta, del más nuevo al más viejo
function lista(f) {
  var out = [], it = f.getFiles();
  while (it.hasNext()) { var x = it.next(); if (/^mi-agenda-respaldo-/.test(x.getName())) out.push(x); }
  return out.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
}
function salida(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
// Ejecútala una vez desde el editor si Google no te pidió permisos al implementar
function autorizar() { carpeta(); }
`;
