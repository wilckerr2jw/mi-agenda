// Pasa tu agenda a Google Calendar o al calendario del teléfono: un archivo .ics con tus eventos
// (con su repetición y las semanas canceladas) y tus tareas pendientes con fecha.
import { data } from './store.js';
import * as M from './model.js';
import { today, toast, addDays } from './util.js';

const escT = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const dt = (iso, time) => iso.replace(/-/g, '') + (time ? `T${time.replace(':', '')}00` : '');
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
// Líneas de más de 75 caracteres se parten (así lo pide el formato)
const fold = l => { const out = []; let s = l; while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); } out.push(s); return out.join('\r\n'); };
function addMinutes(time, min) { const [h, m] = time.split(':').map(Number); const t = h * 60 + m + min; return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; }

function vevent({ uid, date, time, endTime, title, place, notes, rrule, exdates = [] }) {
  const L = ['BEGIN:VEVENT', `UID:${uid}@mi-agenda-teocratica`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`];
  if (time) { L.push(`DTSTART:${dt(date, time)}`, `DTEND:${dt(date, endTime && endTime > time ? endTime : addMinutes(time, 60))}`); }
  else { L.push(`DTSTART;VALUE=DATE:${dt(date)}`, `DTEND;VALUE=DATE:${dt(addDays(date, 1))}`); }
  L.push(`SUMMARY:${escT(title)}`);
  if (place) L.push(`LOCATION:${escT(place)}`);
  if (notes) L.push(`DESCRIPTION:${escT(notes)}`);
  if (rrule) L.push(`RRULE:${rrule}`);
  exdates.forEach(d => L.push(time ? `EXDATE:${dt(d, time)}` : `EXDATE;VALUE=DATE:${dt(d)}`));
  L.push('END:VEVENT');
  return L.map(fold).join('\r\n');
}

export function buildIcs({ withTasks = true } = {}) {
  const from = addDays(today(), -30);
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
    out.push(vevent({ uid: e.id, date: e.date, time: e.time, endTime: e.endTime, title: e.title || cat || 'Evento', place: e.place, notes, rrule, exdates: e.skipDates || [] }));
  });
  if (withTasks) data.tasks.filter(t => t.due && t.status !== 'hecha' && t.due >= from).forEach(t => {
    out.push(vevent({ uid: `t-${t.id}`, date: t.due, time: t.dueTime, title: `✅ ${t.title}`, notes: t.notes || '' }));
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mi Agenda Teocratica//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Mi Agenda Teocrática', ...out, 'END:VCALENDAR'].join('\r\n') + '\r\n';
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
