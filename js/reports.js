// Reportes para el coordinador: supervisión de las tareas que salieron de las reuniones y recuento de participación.

import { data } from './store.js';
import { today, fmtShort, diffDays, norm, dateOf } from './util.js';
import * as M from './model.js';
import * as A from './agenda.js';

// ───── Supervisión ─────
export const SUP_GROUPS = [
  { id: 'late',  n: 'Atrasadas',  e: '⚠️' },
  { id: 'doing', n: 'En curso',   e: '⏳' },
  { id: 'todo',  n: 'Pendientes', e: '🕒' },
  { id: 'done',  n: 'Hechas',     e: '✅' },
];

const stateOf = t => {
  if (t.status === 'hecha') return 'done';
  if (t.due && t.due < today()) return 'late';
  return t.status === 'seguimiento' ? 'doing' : 'todo';
};

// Tareas de una reunión (o de todas las reuniones, si no se indica), agrupadas por estado.
// Sin reunión: las abiertas de cualquier reunión y las hechas en los últimos 30 días.
export function supervision(meetingId = '') {
  const t0 = today();
  const tasks = data.tasks.filter(t => t.meetingId && (meetingId ? t.meetingId === meetingId
    : (t.status !== 'hecha' || (t.doneAt && diffDays(t0, t.doneAt) <= 30))));
  const rows = tasks.map(t => {
    const last = [...(t.log || [])].sort((a, b) => (a.d || '').localeCompare(b.d || '')).pop();
    const meeting = data.meetings.find(m => m.id === t.meetingId);
    const who = M.isMineTask(t) && !(t.responsibles || []).length ? 'Tú' : A.joinNames(t.responsibles || []);
    return { t, state: stateOf(t), who, last, meeting, quiet: diffDays(t0, last?.d || (t.createdAt ? dateOf(t.createdAt) : t0)) };
  });
  const groups = SUP_GROUPS.map(g => ({ ...g, rows: rows.filter(r => r.state === g.id).sort((a, b) => (a.t.due || '9999').localeCompare(b.t.due || '9999')) }));
  const total = rows.length, done = rows.filter(r => r.state === 'done').length;
  return { groups, total, done, pct: total ? Math.round(done / total * 100) : 0 };
}

// Texto para compartir (solo títulos y responsables; los detalles de seguimiento no se envían)
export function supervisionText(title, rep) {
  const lines = [`*Supervisión — ${title}*`, `${rep.done} de ${rep.total} tareas hechas (${rep.pct} %)`];
  rep.groups.forEach(g => {
    if (!g.rows.length) return;
    lines.push('', `${g.e} *${g.n}* (${g.rows.length})`);
    g.rows.forEach(r => lines.push(`• ${r.t.title}${r.who ? ` — ${r.who === 'Tú' ? (M.profile().myName || 'Coordinador') : r.who}` : ''}${r.t.due && g.id !== 'done' ? ` (${fmtShort(r.t.due)})` : ''}`));
  });
  return lines.join('\n');
}

// ───── Participación: quién presentó puntos o hizo oraciones en las reuniones de un período ─────
export function participation(months = 6) {
  const from = new Date(); from.setMonth(from.getMonth() - months);
  const since = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
  const meetings = data.meetings.filter(m => m.date && m.date >= since && m.date <= today());
  const map = new Map();
  const add = (name, field, date) => {
    const key = norm(name);
    if (!key) return;
    const e = map.get(key) || { name, points: 0, prayers: 0, last: '' };
    e[field]++;
    if (date > e.last) e.last = date;
    map.set(key, e);
  };
  meetings.forEach(m => {
    (m.agenda || []).filter(x => !x.priv).forEach(x => A.splitNames(x.by).forEach(n => add(n, 'points', m.date)));
    A.splitNames(m.prayers?.start).forEach(n => add(n, 'prayers', m.date));
    A.splitNames(m.prayers?.end).forEach(n => add(n, 'prayers', m.date));
  });
  // Personas de tu lista con algún privilegio que no participaron: para tenerlas en cuenta en la próxima
  const absent = data.people.filter(p => !p.isMe && (p.privileges || []).length && !map.has(norm(p.name))).map(p => p.name).sort((a, b) => a.localeCompare(b, 'es'));
  const list = [...map.values()].sort((a, b) => (b.points + b.prayers) - (a.points + a.prayers) || a.name.localeCompare(b.name, 'es'));
  return { list, absent, meetings: meetings.length };
}
