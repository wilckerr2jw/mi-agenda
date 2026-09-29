// Cargar visitas de pastoreo anteriores: pegas tu registro (o lees una foto o un PDF) y cada visita
// queda anotada en la ficha del hermano, como si la hubieras anotado ese día. Se lee en tu teléfono:
// no se envía a ningún servicio.
import { data } from './store.js';
import * as store from './store.js';
import * as M from './model.js';
import { esc, today, toast, fmtShort, uid } from './util.js';
import { readFile, linesToText } from './mecas.js';

const S = () => import('./sheets.js');
const MON = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MON_RE = '(ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|ago(?:sto)?|sep(?:t(?:iembre)?)?|set(?:iembre)?|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?)\\.?';
const monIdx = w => { const k = w.toLowerCase().slice(0, 3); return k === 'set' ? 8 : MON.indexOf(k); };
const pad = n => String(n).padStart(2, '0');
const noAccents = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

// Busca la fecha en una línea: 12/03/2026 · 12-3-26 · 2026-03-12 · 12 de marzo de 2026 · marzo 2026 · 12/03
export function findDate(line, t = today()) {
  const s = noAccents(line);
  const ok = (y, mo, d) => { const dt = new Date(y, mo - 1, d); return y > 1990 && dt.getMonth() === mo - 1 && dt.getDate() === d; };
  const out = (y, mo, d, m, extra = {}) => (ok(y, mo, d) ? { iso: `${y}-${pad(mo)}-${pad(d)}`, at: m.index, len: m[0].length, ...extra } : null);
  let m;
  if ((m = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(s))) return out(+m[1], +m[2], +m[3], m);
  if ((m = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/.exec(s))) { let y = +m[3]; if (y < 100) y += 2000; return out(y, +m[2], +m[1], m); }
  if ((m = new RegExp(`\\b(\\d{1,2})\\s*(?:de\\s+)?${MON_RE}\\s*(?:de(?:l)?\\s+)?(\\d{4})\\b`, 'i').exec(s))) return out(+m[3], monIdx(m[2]) + 1, +m[1], m);
  if ((m = new RegExp(`\\b${MON_RE}\\s*(?:de(?:l)?\\s+)?(\\d{4})\\b`, 'i').exec(s))) return out(+m[2], monIdx(m[1]) + 1, 1, m, { monthOnly: true });
  if ((m = /\b(\d{1,2})[/.-](\d{1,2})\b/.exec(s))) {   // sin año: este año (o el anterior si quedaría en el futuro)
    let y = Number(t.slice(0, 4));
    if (`${y}-${pad(+m[2])}-${pad(+m[1])}` > t) y -= 1;
    return out(y, +m[2], +m[1], m, { noYear: true });
  }
  return null;
}

// El nombre es el comienzo del texto: se prueba con 5, 4, 3… palabras hasta que coincide con alguien de Personas
function matchPerson(text) {
  const words = text.split(/\s+/).filter(Boolean);
  for (let k = Math.min(5, words.length); k >= 1; k--) {
    const hit = M.resolveName(words.slice(0, k).join(' '));
    if (hit && !hit.isMe && hit.id) return { p: store.get('people', hit.id), rest: words.slice(k).join(' ') };
  }
  return null;
}
// «con Beto Dos y Carla Tres» → quiénes fueron contigo (ancianos o siervos ministeriales de tu lista)
function companions(note) {
  const m = /(?:^|[\s,;.])con\s+(.+)$/i.exec(note);
  if (!m) return { withIds: [], note };
  const ids = [];
  const left = m[1].split(/\s*(?:,|\by\b|&)\s*/i).filter(Boolean).filter(n => {
    const hit = M.resolveName(n);
    const p = hit?.id && !hit.isMe ? store.get('people', hit.id) : null;
    if (p && (M.isElder(p) || M.isMinisterial(p))) { ids.push(p.id); return false; }
    return true;
  });
  return { withIds: ids, note: left.length ? note : note.slice(0, m.index).trim() };
}

// Lee todas las líneas: { ok, p, date, note, withIds, why, line }
const SEP = /\s*[|;\t]\s*|\s+[—–-]\s+|:\s+|,\s*/;
const clean = x => String(x || '').replace(/^[\s,;:|—–·-]+|[\s,;:|—–·-]+$/g, '').replace(/\s+/g, ' ').trim();
export function parse(text, t = today()) {
  const seen = new Set();
  const lines = String(text || '').normalize('NFC').split(/\r?\n/)
    .map(raw => raw.replace(/^\s*(?:[-•*]|\d{1,3}[.)])\s+/, '').replace(/\s*\|\s*/g, ' | ').trim()).filter(Boolean);
  return lines.map(line => {
    const d = findDate(line, t);
    if (!d) return { ok: false, line, why: 'no encontré la fecha' };
    const b = clean(line.slice(0, d.at)), a = clean(line.slice(d.at + d.len));
    // El nombre va antes de la fecha (Ana Uno 12/03) o después (12/03 Ana Uno — nota); lo demás es la nota
    let hit = null, note = '';
    if (b) { const first = b.split(SEP)[0]; hit = matchPerson(first); if (hit) note = [hit.rest, b.slice(first.length), a].map(clean).filter(Boolean).join(' · '); }
    if (!hit && a) { const first = a.split(SEP)[0]; hit = matchPerson(first); if (hit) note = [b, hit.rest, a.slice(first.length)].map(clean).filter(Boolean).join(' · '); }
    if (!hit?.p) return { ok: false, line, date: d.iso, why: 'no encontré a esa persona en tus Personas' };
    if (d.iso > t) return { ok: false, line, p: hit.p, date: d.iso, why: 'la fecha es futura' };
    const c = companions(note);
    const key = `${hit.p.id}|${d.iso}`;
    const dup = seen.has(key) || M.visitsOf(hit.p, 'pastoreo').some(v => v.date === d.iso);
    seen.add(key);
    if (dup) return { ok: false, dup: true, line, p: hit.p, date: d.iso, why: 'ya estaba anotada' };
    return { ok: true, line, p: hit.p, date: d.iso, monthOnly: !!d.monthOnly, noYear: !!d.noYear, note: clean(c.note), withIds: c.withIds };
  });
}

export async function importSheet() {
  const { open } = await S();
  open({
    title: '📥 Visitas de pastoreo anteriores',
    body: `<p class="hint">Pega tu registro anterior: <b>una visita por línea</b>, con el nombre del hermano y la fecha. Lo demás de la línea queda como nota; «con …» anota quién fue contigo.</p>
      <p class="hint">Ejemplos: <code>Juan Pérez 12/03/2026</code> · <code>15-01-2026 María Gómez — le animamos con Salmo 23</code> · <code>Luis Rivas, marzo 2026, con José Díaz</code></p>
      <textarea id="past-text" rows="8" placeholder="Nombre y fecha, una visita por línea"></textarea>
      <div class="stack pad"><label class="btn ghost block" for="past-file">📷 Leer de una foto o PDF</label><input id="past-file" type="file" accept="image/*,application/pdf,.pdf" hidden>
      <p class="hint" id="past-step"></p></div>
      <div id="past-review"></div>`,
    actions: '<button type="button" class="btn primary" data-a="past-save" disabled>Guardar visitas</button>',
  });
}

let timer = 0;
export function textChanged() { clearTimeout(timer); timer = setTimeout(review, 300); }
export async function fileChosen(input) {
  const f = input.files?.[0];
  if (!f) return;
  const step = t => { const el = document.getElementById('past-step'); if (el) el.textContent = t; };
  step('Leyendo el archivo…');
  try {
    const { lines } = await readFile(f, step);
    const ta = document.getElementById('past-text');
    const txt = linesToText(lines).replace(/\s{2}\|\s{2}/g, ' | ');
    if (!txt.trim()) { step('No encontré texto. Prueba con otra foto más clara.'); return; }
    ta.value = (ta.value.trim() ? `${ta.value.trim()}\n` : '') + txt;
    step('Listo. Revisa el texto: corrige los nombres o fechas mal leídos y la lista se actualiza sola.');
    review();
  } catch (e) { console.warn(e); step('No se pudo leer el archivo. Prueba con otra foto o escribe las visitas.'); }
  input.value = '';
}

export function review() {
  const box = document.getElementById('past-review'), btn = document.querySelector('[data-a="past-save"]');
  if (!box) return;
  const rows = parse(document.getElementById('past-text')?.value || '');
  const good = rows.filter(r => r.ok);
  if (btn) { btn.disabled = !good.length; btn.textContent = good.length ? `Guardar ${good.length} ${good.length === 1 ? 'visita' : 'visitas'}` : 'Guardar visitas'; }
  if (!rows.length) { box.innerHTML = ''; return; }
  const name = id => M.personName(id) || '';
  box.innerHTML = `<h3 class="sub-h">${good.length} de ${rows.length} ${rows.length === 1 ? 'línea lista' : 'líneas listas'}</h3>
    <ul class="load-list past-list">${rows.map(r => r.ok
      ? `<li>✅ <b>${esc(r.p.name)}</b> · ${esc(fmtShort(r.date))}${r.monthOnly ? ' <span class="hint">(solo el mes: se anota el día 1)</span>' : ''}${r.noYear ? ' <span class="hint">(sin año)</span>' : ''}${r.withIds.length ? ` · con ${esc(r.withIds.map(name).join(', '))}` : ''}${r.note ? ` <span class="hint">· ${esc(r.note)}</span>` : ''}</li>`
      : `<li>${r.dup ? '↩️' : '⚠️'} <span class="hint">${esc(r.line)}</span><br><small>${esc(r.why)}${r.p ? ` (${esc(r.p.name)})` : ''}</small></li>`).join('')}</ul>
    ${rows.some(r => !r.ok && !r.dup) ? '<p class="hint">Corrige esas líneas arriba (el nombre como está en Personas y una fecha como 12/03/2026) o déjalas: solo se guardan las que tienen ✅.</p>' : ''}`;
}

export function save() {
  const rows = parse(document.getElementById('past-text')?.value || '').filter(r => r.ok);
  if (!rows.length) return toast('No hay visitas listas para guardar');
  // Se agrupan por persona para guardar cada ficha una sola vez
  const byP = new Map();
  rows.forEach(r => { if (!byP.has(r.p.id)) byP.set(r.p.id, []); byP.get(r.p.id).push(r); });
  byP.forEach((list, pid) => {
    const p = store.get('people', pid);
    if (!p) return;
    const add = list.map(r => ({ id: uid(), date: r.date, kind: 'pastoreo', note: r.note || '', withIds: r.withIds || [], imported: true }));
    const visits = [...add, ...(p.visits || [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 200);
    const newest = add.reduce((m, v) => (v.date > m ? v.date : m), '');
    store.upsert('people', { ...p, visits, lastContact: !p.lastContact || newest > p.lastContact ? newest : p.lastContact });
  });
  toast(`✓ ${rows.length} ${rows.length === 1 ? 'visita anotada' : 'visitas anotadas'} en ${byP.size} ${byP.size === 1 ? 'ficha' : 'fichas'}`);
  S().then(m => m.close());
}

// Para las pruebas: cuántas visitas de pastoreo hay en total
export const countPastoreo = () => data.people.reduce((n, p) => n + M.visitsOf(p, 'pastoreo').length, 0);
