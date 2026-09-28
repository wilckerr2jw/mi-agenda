// Borrador: lo que escribes en un formulario se guarda en el teléfono mientras escribes.
// Si la app se recarga o se actualiza antes de tocar «Guardar», al volver te ofrece recuperarlo.
// Se borra al guardar o al cerrar el formulario a propósito. Solo queda en este teléfono.
import { toast } from './util.js';

const KEY = 'miagenda.borrador';
const MAX_AGE = 24 * 3600e3;
const KINDS = ['event', 'task', 'meeting', 'note', 'congre', 'dept', 'person', 'group'];
const TITLES = { event: 'un evento', task: 'una tarea', meeting: 'una reunión', note: 'una nota', congre: 'los datos de la congregación', dept: 'un departamento', person: 'una persona', group: 'un grupo' };
let timer = 0;

const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
export function clear() { clearTimeout(timer); try { localStorage.removeItem(KEY); } catch { /* sin almacenamiento */ } }

function snapshot(form) {
  const vals = [];
  [...form.elements].forEach(el => {
    if (!el.name || el.type === 'file' || el.type === 'submit' || el.type === 'button') return;
    if (el.type === 'checkbox' || el.type === 'radio') vals.push({ n: el.name, v: el.value, c: el.checked });
    else vals.push({ n: el.name, v: el.value });
  });
  return vals;
}
// Se llama en cada cambio de un formulario abierto (con una pequeña espera para no escribir a cada letra)
export function track(form) {
  if (!form || !KINDS.includes(form.dataset.form)) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ kind: form.dataset.form, id: form.dataset.id || '', at: Date.now(), vals: snapshot(form) })); } catch { /* sin almacenamiento */ }
  }, 400);
}

function restore(form, vals) {
  const used = new Map();
  vals.forEach(x => {
    const els = [...form.elements].filter(el => el.name === x.n);
    if (!els.length) return;
    if ('c' in x) { const el = els.find(e => e.value === x.v); if (el) { el.checked = x.c; const row = el.closest('.psel-row'); if (row && x.c) row.hidden = false; } return; }
    const i = used.get(x.n) || 0; used.set(x.n, i + 1);
    const el = els[i]; if (el) el.value = x.v;
  });
  // Que se actualicen las partes que dependen de lo escrito (acuerdos, campos por tipo…)
  [...form.elements].forEach(el => { if (el.tagName === 'SELECT' || el.type === 'checkbox') el.dispatchEvent(new Event('change', { bubbles: true })); });
  form.querySelectorAll('textarea').forEach(t => t.dispatchEvent(new Event('input', { bubbles: true })));
}

// Al abrir la app: si quedó algo sin guardar, ofrece recuperarlo
export function offer(S) {
  const d = read();
  if (!d || !KINDS.includes(d.kind) || Date.now() - d.at > MAX_AGE || !(d.vals || []).some(x => ('c' in x ? x.c : String(x.v || '').trim()))) { clear(); return; }
  const open = {
    event: () => S.eventSheet(d.id || null), task: () => S.taskSheet(d.id || null), meeting: () => S.meetingSheet(d.id || null),
    note: () => S.noteSheet(d.id || null), congre: () => S.congreSheet(), dept: () => S.deptSheet(d.id || null),
    person: () => S.personSheet(d.id || null), group: () => S.groupSheet(d.id || null),
  }[d.kind];
  toast(`Dejaste sin guardar ${TITLES[d.kind]}`, 'Recuperar', () => {
    try { open(); } catch { return; }
    setTimeout(() => { const f = document.getElementById('f'); if (f && f.dataset.form === d.kind) restore(f, d.vals); }, 60);
  }, 12000);
}
