// Código para Google Apps Script (se pega en script.google.com con la cuenta de Google de cada persona).
// No lleva claves: la primera vez que la app se conecta le deja su clave (y desde ahí solo acepta esa).
// Escribe solo en su propio calendario «Mi Agenda Teocrática» y solo en los eventos que creó la app.
export const GCAL_SCRIPT = String.raw`/**
 * Mi Agenda Teocrática → Google Calendar
 * Este código vive en TU cuenta de Google. La app le manda tu agenda cuando cambias algo y aquí se crean,
 * cambian o borran los eventos del calendario «Mi Agenda Teocrática» (no toca tus otros calendarios).
 * Necesita el servicio «Google Calendar API» (en Servicios, botón +).
 */
var NOMBRE = 'Mi Agenda Teocrática';
var VERSION = 1;

function doGet() {
  return salida({ ok: true, app: 'mi-agenda', v: VERSION, conectado: !!PropertiesService.getScriptProperties().getProperty('token') });
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
    if (b.action === 'probar') return salida({ ok: true, calendario: NOMBRE, id: calendario() });
    if (b.action === 'borrar') return salida(borrar());
    return salida(sincronizar(b.items || [], b.tz || Session.getScriptTimeZone()));
  } catch (err) {
    return salida({ ok: false, error: String((err && err.message) || err) });
  } finally { lock.releaseLock(); }
}

function salida(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// Ejecútala una vez desde el editor (▶ Ejecutar) para dar el permiso y crear el calendario
function probar() {
  Logger.log('Calendario listo: ' + calendario());
}

function calendario() {
  var p = PropertiesService.getScriptProperties();
  var id = p.getProperty('calId');
  if (id) { try { Calendar.Calendars.get(id); return id; } catch (e) { id = null; } }
  var cal = Calendar.Calendars.insert({ summary: NOMBRE, description: 'Lo llena la app Mi Agenda Teocrática. Lo que cambies aquí se reemplaza con lo de la app.', timeZone: Session.getScriptTimeZone() });
  p.setProperty('calId', cal.id);
  return cal.id;
}

function sincronizar(items, tz) {
  var cal = calendario();
  var hay = {}, pagina;
  do {
    var r = Calendar.Events.list(cal, { maxResults: 2500, pageToken: pagina, showDeleted: false, singleEvents: false, privateExtendedProperty: 'app=miagenda' });
    (r.items || []).forEach(function (ev) {
      var pr = (ev.extendedProperties && ev.extendedProperties.private) || {};
      hay[ev.id] = pr.h || '';
    });
    pagina = r.nextPageToken;
  } while (pagina);
  var quiero = {}, nuevos = 0, cambiados = 0, borrados = 0, iguales = 0, errores = [];
  items.forEach(function (it) {
    quiero[it.gid] = true;
    if (hay[it.gid] === it.h) { iguales++; return; }
    var ev = recurso(it, tz);
    try {
      if (it.gid in hay) { Calendar.Events.update(ev, cal, it.gid); cambiados++; }
      else {
        try { Calendar.Events.insert(ev, cal); nuevos++; }
        catch (e) { Calendar.Events.update(ev, cal, it.gid); cambiados++; }   // ya existía (borrado antes): se recupera
      }
    } catch (e2) { errores.push(it.title + ': ' + ((e2 && e2.message) || e2)); }
    if ((nuevos + cambiados) % 20 === 19) Utilities.sleep(400);
  });
  Object.keys(hay).forEach(function (id) {
    if (!quiero[id]) { try { Calendar.Events.remove(cal, id); borrados++; } catch (e) { /* ya no estaba */ } }
  });
  return { ok: !errores.length, nuevos: nuevos, cambiados: cambiados, borrados: borrados, iguales: iguales, total: items.length, errores: errores.slice(0, 5) };
}

function recurso(it, tz) {
  var ev = {
    id: it.gid, status: 'confirmed', summary: it.title, location: it.place || '', description: it.desc || '',
    reminders: { useDefault: false, overrides: [] },
    extendedProperties: { private: { app: 'miagenda', h: it.h } }
  };
  if (it.time) {
    ev.start = { dateTime: it.date + 'T' + it.time + ':00', timeZone: tz };
    ev.end = { dateTime: it.endDate + 'T' + it.end + ':00', timeZone: tz };
  } else {
    ev.start = { date: it.date };
    ev.end = { date: it.endDate };
  }
  if (it.rrule) {
    ev.recurrence = ['RRULE:' + it.rrule].concat((it.ex || []).map(function (d) {
      return it.time ? 'EXDATE;TZID=' + tz + ':' + d.replace(/-/g, '') + 'T' + it.time.replace(':', '') + '00' : 'EXDATE;VALUE=DATE:' + d.replace(/-/g, '');
    }));
  }
  if (it.color) ev.colorId = String(it.color);
  return ev;
}

function borrar() {
  var p = PropertiesService.getScriptProperties();
  var id = p.getProperty('calId');
  if (id) { try { Calendar.Calendars.remove(id); } catch (e) { /* ya no estaba */ } }
  p.deleteProperty('calId');
  return { ok: true, borrado: true };
}
`;
