// Pasa tu agenda a Google Calendar o al calendario del teléfono: un archivo .ics con tus eventos
// (con su repetición y las semanas canceladas) y tus tareas pendientes con fecha.
import { data } from './store.js';
import * as M from './model.js';
import { today, toast, addDays } from './util.js';

const escT = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const dt = (iso, time) => iso.replace(/-/g, '') + (time ? `T${time.replace(':', '')}00` : '');
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
// Líneas de más de 75 octetos (bytes en UTF-8) se parten, sin cortar una letra ni un emoji por la mitad
const te = new TextEncoder();
export const fold = l => {
  const out = []; let cur = '', size = 0, max = 75;
  for (const ch of String(l)) {   // recorre por caracteres completos (los emojis no se separan)
    const n = te.encode(ch).length;
    if (size + n > max) { out.push(cur); cur = ' '; size = 1; max = 75; }
    cur += ch; size += n;
  }
  out.push(cur);
  return out.join('\r\n');
};
// Suma minutos a una hora; devuelve la hora y cuántos días pasa (si cruza la medianoche)
function addMinutes(time, min) { const [h, m] = time.split(':').map(Number); const t = h * 60 + m + min; return { time: `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`, days: Math.floor(t / 1440) }; }
// Hora de fin: la que pusiste (si es antes que el inicio, es del día siguiente) o una hora después del inicio
export function endOf(date, time, endTime) {
  if (endTime && endTime !== time) return { date: endTime < time ? addDays(date, 1) : date, time: endTime };
  const r = addMinutes(time, 60);
  return { date: r.days ? addDays(date, r.days) : date, time: r.time };
}
// Zona horaria del teléfono (Venezuela: America/Caracas, UTC−4 todo el año, sin horario de verano)
export function zoneOf() {
  let tz = 'America/Caracas';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch { /* se queda Caracas */ }
  return /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(tz) ? tz : 'America/Caracas';
}
// Desfase fijo de la zona en minutos, o null si cambia en el año (horario de verano)
function fixedOffset(tz) {
  if (tz === 'America/Caracas') return -240;
  try {
    const off = d => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d).map(x => [x.type, x.value])); return Math.round((Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute) - d.getTime()) / 60000); };
    const y = new Date().getFullYear(), a = off(new Date(Date.UTC(y, 0, 1))), b = off(new Date(Date.UTC(y, 6, 1)));
    return a === b ? a : null;
  } catch { return null; }
}
// Bloque VTIMEZONE (solo para zonas sin horario de verano, como Caracas; las demás se nombran y el calendario las conoce)
export function vtimezone(tz) {
  const o = fixedOffset(tz);
  if (o === null) return [];
  const sign = o < 0 ? '-' : '+', a = Math.abs(o);
  const hhmm = `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}${String(a % 60).padStart(2, '0')}`;
  return ['BEGIN:VTIMEZONE', `TZID:${tz}`, 'BEGIN:STANDARD', 'DTSTART:19700101T000000', `TZOFFSETFROM:${hhmm}`, `TZOFFSETTO:${hhmm}`, 'END:STANDARD', 'END:VTIMEZONE'];
}

export function vevent({ uid, date, time, endTime, title, place, notes, rrule, exdates = [] }, tz = 'America/Caracas') {
  const L = ['BEGIN:VEVENT', `UID:${uid}@mi-agenda-teocratica`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`];
  if (time) { const end = endOf(date, time, endTime); L.push(`DTSTART;TZID=${tz}:${dt(date, time)}`, `DTEND;TZID=${tz}:${dt(end.date, end.time)}`); }
  else { L.push(`DTSTART;VALUE=DATE:${dt(date)}`, `DTEND;VALUE=DATE:${dt(addDays(date, 1))}`); }
  L.push(`SUMMARY:${escT(title)}`);
  if (place) L.push(`LOCATION:${escT(place)}`);
  if (notes) L.push(`DESCRIPTION:${escT(notes)}`);
  if (rrule) L.push(`RRULE:${rrule}`);
  exdates.forEach(d => L.push(time ? `EXDATE;TZID=${tz}:${dt(d, time)}` : `EXDATE;VALUE=DATE:${dt(d)}`));
  L.push('END:VEVENT');
  return L.map(fold).join('\r\n');
}

export function buildIcs({ withTasks = true } = {}) {
  const from = addDays(today(), -30);
  const tz = zoneOf();
  const out = [];
  data.events.forEach(e => {
    if (!e.date) return;
    const rep = e.repeat && e.repeat !== 'none';
    if (!rep && e.date < from) return;
    const rrule = e.repeat === 'daily' ? 'FREQ=DAILY'
      : e.repeat === 'weekly' ? 'FREQ=WEEKLY'
      : e.repeat === 'biweekly' ? 'FREQ=WEEKLY;INTERVAL=2'
      : e.repeat === 'monthly' ? 'FREQ=MONTHLY'
      : e.repeat === 'days' && (e.days || []).length ? `FREQ=WEEKLY;BYDAY=${(e.days || []).map(n => BYDAY[Number(n)]).filter(Boolean).join(',')}` : '';
    const cat = M.catOf(e.category)?.n;
    const notes = [e.theme ? `Tema: ${e.theme}` : '', cat ? `Tipo: ${cat}` : '', e.notes || ''].filter(Boolean).join('\n');
    out.push(vevent({ uid: e.id, date: e.date, time: e.time, endTime: e.endTime, title: e.title || cat || 'Evento', place: e.place, notes, rrule, exdates: e.skipDates || [] }, tz));
  });
  if (withTasks) data.tasks.filter(t => t.due && t.status !== 'hecha' && t.due >= from).forEach(t => {
    out.push(vevent({ uid: `t-${t.id}`, date: t.due, time: t.dueTime, title: `✅ ${t.title}`, notes: t.notes || '' }, tz));
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mi Agenda Teocratica//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', fold('X-WR-CALNAME:Mi Agenda Teocrática'), `X-WR-TIMEZONE:${tz}`, ...vtimezone(tz), ...out, 'END:VCALENDAR'].join('\r\n') + '\r\n';
}

export async function exportIcs() {
  const n = data.events.length + data.tasks.filter(t => t.due && t.status !== 'hecha').length;
  if (!n) return toast('No hay eventos ni tareas con fecha');
  const file = new File([buildIcs()], `mi-agenda-${today()}.ics`, { type: 'text/calendar' });
  try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Mi agenda' }); return; } } catch (e) { if (e?.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Archivo descargado: ábrelo con Google Calendar o tu calendario');
}
