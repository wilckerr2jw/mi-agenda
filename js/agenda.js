// Agenda de una reunión: puntos a tratar, en orden, con quién los presenta, qué se espera y cuánto tiempo toman.
// Cada punto: { id, t: título, by: quién lo presenta, kind, min: minutos, ref: referencia, subs: [subpuntos],
//               conf: confidencial, priv: no se envía (solo en la app), notes: detalle, fromTaskId }
// Los detalles nunca se envían; los puntos confidenciales salen solo con su título (conviene que sea general).

import { data } from './store.js';
import { fmtLong, fmtShort, fmtTime, addDays, today, norm } from './util.js';
import * as M from './model.js';

export const AGENDA_KINDS = {
  seguimiento: { n: 'Seguimiento', h: 'Seguimiento de acuerdos anteriores' },
  decidir:     { n: 'Para decidir', h: 'Asuntos para decidir' },
  informar:    { n: 'Informativo', h: 'Asuntos informativos' },
  asignar:     { n: 'Asignación', h: 'Asignaciones' },
};
export const KIND_ORDER = ['seguimiento', 'decidir', 'informar', 'asignar'];

// Minutos → «1 h 25 min»
export const fmtMin = min => {
  min = Math.max(0, Math.round(Number(min) || 0));
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
};

export const PRAYER_MIN = 2;   // cada oración (inicial y final)
// Tiempo de los puntos que se envían (+ las dos oraciones); los privados se cuentan aparte
export const agendaTotal = (items, prayer = false) => (items || []).filter(x => !x.priv).reduce((a, x) => a + (Number(x.min) || 0), 0) + (prayer ? PRAYER_MIN * 2 : 0);
export const privateTotal = items => (items || []).filter(x => x.priv).reduce((a, x) => a + (Number(x.min) || 0), 0);
export const MAX_OPTIONS = [0, 45, 60, 75, 90, 105, 120];

// «Pegar varios puntos»: una línea por punto; las líneas con sangría, guion o «a)» son subpuntos del anterior.
// Al final de la línea se puede indicar entre corchetes el tipo, los minutos y si es privado o confidencial:
//   Organigrama de la congregación [decidir 30]
//     Auxiliar de La Atalaya
//   Caso para el comité de servicio [privado 5]
export function parsePasted(text) {
  const out = [];
  String(text || '').split(/\r?\n/).forEach(raw => {
    if (!raw.trim()) return;
    const isSub = /^(\s{2,}|\t|\s*[-•*]\s|\s*[a-z]\)\s)/i.test(raw) && out.length;
    let line = raw.trim().replace(/^([-•*]|[a-z]\)|\d{1,2}[.)])\s*/i, '').trim();
    if (!line) return;
    if (isSub) { out[out.length - 1].subs.push(line); return; }
    const item = { id: 'ag' + Math.random().toString(36).slice(2, 10), t: line, by: '', kind: 'decidir', min: 5, ref: '', subs: [], conf: false, priv: false, notes: '' };
    const tag = line.match(/\[([^\]]*)\]\s*$/);
    if (tag) {
      item.t = line.slice(0, tag.index).trim();
      const w = norm(tag[1]);
      const min = w.match(/\d+/); if (min) item.min = Number(min[0]);
      if (/seguim/.test(w)) item.kind = 'seguimiento';
      else if (/inform/.test(w)) item.kind = 'informar';
      else if (/asign/.test(w)) item.kind = 'asignar';
      else if (/decid/.test(w)) item.kind = 'decidir';
      if (/privad|no se envia|solo app/.test(w)) item.priv = true;
      if (/confid/.test(w)) item.conf = true;
    }
    if (item.t) out.push(item);
  });
  return out;
}

// Hora aproximada de fin, si la reunión tiene hora de inicio
export function endTime(time, minutes) {
  if (!time || !minutes) return '';
  const [h, m] = time.split(':').map(Number);
  const t = h * 60 + m + minutes;
  return fmtTime(`${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
}

// Ordena los puntos como se tratarán: por bloque (seguimiento → decidir → informar → asignar), respetando el orden dentro de cada bloque
export const sortByBlock = items => KIND_ORDER.flatMap(k => items.filter(x => (x.kind || 'informar') === k));

// Tareas pendientes que salieron de reuniones anteriores (para repasarlas como «Seguimiento»)
export function pendingFromPrevious(meeting, items) {
  const already = new Set((items || []).flatMap(x => [x.fromTaskId, ...(x.fromTaskIds || [])]).filter(Boolean));
  return data.tasks
    .filter(t => t.meetingId && t.meetingId !== meeting.id && t.status !== 'hecha' && !already.has(t.id))
    .filter(t => { const m = data.meetings.find(x => x.id === t.meetingId); return m && (!meeting.date || m.date <= meeting.date); })
    .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
}

export function itemFromTask(t) {
  const who = (t.responsibles || []).join(', ');
  const p = M.person(t.personId);
  return {
    id: 'ag' + Math.random().toString(36).slice(2, 10),
    t: t.title, by: who || (M.isMineTask(t) ? (M.profile().myName || '') : ''),
    kind: 'seguimiento', min: 3, conf: false, notes: p ? `Persona: ${p.name}` : '', fromTaskId: t.id,
  };
}

// Varios encargados: «Ana, Luis» → ['Ana', 'Luis'] y al mostrar «Ana y Luis»
export const splitNames = str => String(str || '').split(/\s*(?:,|;|\s+y\s+)\s*/).map(x => x.trim()).filter(Boolean);
export const joinNames = list => { const l = [...new Set(list.filter(Boolean))]; return l.length > 1 ? `${l.slice(0, -1).join(', ')} y ${l[l.length - 1]}` : (l[0] || ''); };
const byText = x => joinNames(splitNames(x.by));

// Temas anteriores resumidos en UN solo punto (p. ej. «Seguimiento: visitas a los precursores»)
export function itemFromTasksMerged(tasks, { title, kind = 'seguimiento', min = 5, withSubs = false } = {}) {
  return {
    id: 'ag' + Math.random().toString(36).slice(2, 10),
    t: title || 'Seguimiento de acuerdos de la reunión anterior',
    by: M.profile().myName || '', kind, min, ref: '', conf: false, priv: false,   // es general: lo informa quien prepara la agenda
    subs: withSubs ? tasks.map(t => t.title) : [],
    notes: tasks.map(t => `• ${t.title}`).join('\n'),     // el detalle queda solo para ti
    fromTaskIds: tasks.map(t => t.id),
  };
}

// Une varios puntos en uno: el primero da el título y el tipo; los demás pasan a subpuntos
export function mergeItems(list, title) {
  const [first, ...rest] = list;
  const uniq = arr => [...new Set(arr.filter(Boolean))];
  return {
    ...first,
    t: title || first.t,
    subs: uniq([...(first.subs || []), ...rest.flatMap(o => [o.t, ...(o.subs || [])])]),
    min: list.reduce((a, x) => a + (Number(x.min) || 0), 0),
    by: uniq(list.flatMap(x => splitNames(x.by))).join(', '),
    ref: uniq(list.map(x => x.ref)).join('; '),
    notes: uniq(list.map(x => x.notes)).join('\n'),
    conf: list.some(x => x.conf),
    priv: list.every(x => x.priv),
    fromTaskIds: uniq(list.flatMap(x => [x.fromTaskId, ...(x.fromTaskIds || [])])),
  };
}

// Fecha tope para recibir puntos: la que elegiste, ninguna ('') o, si no elegiste, el día antes de la reunión
export function deadlineOf(m) {
  if (m.agendaDeadline === '') return '';
  if (m.agendaDeadline) return m.agendaDeadline;
  if (!m.date || m.date <= today()) return '';
  const d = addDays(m.date, -1);
  return d >= today() ? d : today();
}

// Referencias con un formato uniforme: «Sfg CAP 1 parr 4;12;14;16; 20-21» → «Sfg cap. 1, párrs. 4, 12, 14, 16, 20-21»
export function formatRef(ref) {
  let r = String(ref || '').replace(/\s+/g, ' ').trim();
  if (!r) return '';
  r = r.replace(/\bcap(?:[ií]tulo|s)?\.?\s*(\d)/gi, 'cap. $1');
  r = r.replace(/\bp(?:[aá]rr?(?:afos?|s)?|[aá]rrs?)\.?\s*(?=\d)/gi, 'párr. ');
  r = r.replace(/\s*[;,]\s*/g, ', ').replace(/,\s*$/, '');
  r = r.replace(/(\d)\s*[-–]\s*(\d)/g, '$1-$2');
  r = r.replace(/(cap\. \d+)\s+(?=párr)/g, '$1, ');
  r = r.replace(/(cap\. \d+):\s*(\d)/g, '$1, párr. $2');                        // «CAP 2: 11-15» → «cap. 2, párr. 11-15»
  r = r.replace(/párr\. ([\d, -]+)/g, (m, nums) => (/[,-]/.test(nums.trim()) ? `párrs. ${nums.trim()}` : `párr. ${nums.trim()}`));
  return r;
}

// Horario estimado: a qué hora empieza cada punto (en el orden en que se tratarán), contando las oraciones
export const KIND_COLORS = { seguimiento: 'var(--c-estudio)', decidir: 'var(--primary)', informar: 'var(--c-x1)', asignar: 'var(--c-pastoreo)' };
const toMin = t => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const hhmm = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export function schedule(items, time, prayer = true) {
  const start = toMin(time);
  const list = sortByBlock((items || []).filter(x => !x.priv));
  let t = start ?? 0;
  const out = { prayerStart: null, items: {}, prayerEnd: null, segments: [] };
  if (prayer) { out.prayerStart = start == null ? '' : fmtTime(hhmm(t)); out.segments.push({ kind: 'oracion', min: PRAYER_MIN }); t += PRAYER_MIN; }
  list.forEach(x => {
    out.items[x.id] = start == null ? '' : fmtTime(hhmm(t));
    out.segments.push({ kind: x.kind || 'informar', min: Number(x.min) || 0, t: x.t });
    t += Number(x.min) || 0;
  });
  if (prayer) { out.prayerEnd = start == null ? '' : fmtTime(hhmm(t)); out.segments.push({ kind: 'oracion', min: PRAYER_MIN }); }
  return out;
}

// Texto listo para WhatsApp (con *negritas*), agrupado por bloque y numerado
export function shareText(m, items, { prayer = true, deadline = true } = {}) {
  const pr = m.prayers || {};
  const list = sortByBlock((items || []).filter(x => !x.priv));
  const total = agendaTotal(list, prayer);
  const when = [m.date ? fmtLong(m.date) : '', fmtTime(m.time), m.place].filter(Boolean).join(' · ');
  const lines = [`*Agenda — ${m.title || 'Reunión'}*`];
  const sch = m.agendaShowTimes && m.time ? schedule(list, m.time, prayer) : null;   // hora de cada punto (opcional)
  const at = h => (sch && h ? `${h.replace(/\s?(a|p)\. m\./, '')} · ` : '');
  if (when) lines.push(`📅 ${when}`);
  lines.push('');
  let n = 0;
  if (prayer) lines.push(`${++n}. ${at(sch?.prayerStart)}Oración inicial${pr.start ? ` _(${pr.start})_` : ''}`);
  KIND_ORDER.forEach(k => {
    const block = list.filter(x => (x.kind || 'informar') === k);
    if (!block.length) return;
    lines.push('', `*${AGENDA_KINDS[k].h}*`);
    block.forEach(x => {
      const meta = [byText(x), x.min ? `${x.min} min` : ''].filter(Boolean).join(' · ');
      lines.push(`${++n}. ${at(sch?.items[x.id])}${x.conf ? '🔒 ' : ''}${x.t}${meta ? ` _(${meta})_` : ''}`);
      if (x.ref) lines.push(`    📖 Ref.: ${formatRef(x.ref)}`);
      // Confidencial: solo sale el título (con quién lo presenta y los minutos); los subpuntos NO se envían
      if (!x.conf) (x.subs || []).forEach((sub, j) => lines.push(`    ${String.fromCharCode(97 + j)}) ${sub}`));
    });
  });
  if (prayer) lines.push('', `${++n}. ${at(sch?.prayerEnd)}Oración final${pr.end ? ` _(${pr.end})_` : ''}`);
  const max = Number(m.agendaMax) || 0;
  lines.push('', `⏱ Tiempo estimado: ${fmtMin(total)}${m.time && total ? ` (hasta ≈ ${endTime(m.time, total)})` : ''}${max ? ` · máximo ${fmtMin(max)}` : ''}`);
  if (list.some(x => x.conf)) lines.push('🔒 Los detalles de los puntos confidenciales se tratarán en la reunión.');
  const limit = deadlineOf(m);
  if (deadline && limit) {
    lines.push(`Si tienes otro punto, envíamelo antes del ${fmtShort(limit)}.`);
  }
  return lines.join('\n');
}

// Líneas para «Acuerdos y notas» a partir de la agenda (solo las que aún no están)
export function agreementLines(m, items) {
  const have = norm(m.notes || '');
  return sortByBlock(items || []).filter(x => !have.includes(norm(x.t))).map(x => `- ${x.t}: `);
}
