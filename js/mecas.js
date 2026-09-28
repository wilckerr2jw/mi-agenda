// Asignaciones mecánicas: importar el arreglo que hizo otro hermano (foto o PDF), ver quién se está usando
// y sugerir al encargado que tome en cuenta a los varones bautizados que todavía no tienen asignación.
// La foto se lee en el propio teléfono (no se envía a ningún servicio); el lector viene con la app.
import * as store from './store.js';
import { data } from './store.js';
import * as M from './model.js';
import { esc, uid, today, toast, fmtShort, norm, addDays, waLink } from './util.js';

// Las bibliotecas vienen con la app (carpeta vendor/): no se descarga nada de otros sitios
const base = new URL('../vendor/', import.meta.url).href;
const OCR_URL = base + 'ocr/tesseract.min.js';
const OCR_OPTS = { workerPath: base + 'ocr/worker.min.js', corePath: base + 'ocr/core', langPath: base + 'ocr/lang', workerBlobURL: false };
const PDF_URL = base + 'pdf/pdf.min.mjs';
const PDF_WORKER = base + 'pdf/pdf.worker.min.mjs';

// ───── Tipos de asignación que se reconocen en el arreglo ─────
export const MECA_ROLES = [
  ['Acomodador', /acomod|auditorio|puerta|entrada|recepci/],
  ['Audio', /\baudio|sonido|consola/],
  ['Video', /\bv[ií]deo|proyecc|pantalla/],
  ['Micrófonos', /micr[oó]f|\bmicros?\b|microfon|pasa ?micr/],
  ['Plataforma', /plataforma|escenario/],
  ['Zoom', /\bzoom\b|videoconfer|anfitri/],
  ['Estacionamiento', /estacionam|parqueo|parking/],
];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTH_RE = /\b(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[a-z]*\.?/;
const WEEKDAY_RE = /^(lun|mar|mie|jue|vie|sab|dom)[a-z]*\.?$/;
const pad = n => String(n).padStart(2, '0');

// Normaliza letra por letra (conserva las posiciones del texto original)
const nk = s => [...s].map(c => { const n = c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); return n.length === 1 ? n : ' '; }).join('');

// ───── Leer el archivo: PDF con texto, o foto/PDF escaneado con el lector de letras ─────
function loadScript(src) {
  return new Promise((res, rej) => { if (window.Tesseract) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('No se pudo descargar el lector')); document.head.appendChild(s); });
}
// Posición horizontal de cada letra (se reparte el ancho del bloque entre sus letras)
const spread = (t, x, end) => { const n = Math.max(1, t.length); return [...t].map((_, i) => x + ((end ?? x + n * 8) - x) * i / n); };
const join = (a, b, sep = ' ') => ({ t: a.t + sep + b.t, x: a.x, end: b.end, xs: [...a.xs, ...spread(sep, a.end, b.x), ...b.xs] });
// Cada renglón: { segs: [{ t, x }] } — x es la posición horizontal (sirve para saber en qué columna va cada nombre)
function linesFromItems(items) {
  const rows = [];
  items.filter(i => i.t.trim()).sort((a, b) => a.y - b.y || a.x - b.x).forEach(i => {
    let r = rows.find(r => Math.abs(r.y - i.y) <= Math.max(4, i.h * 0.55));
    if (!r) { r = { y: i.y, items: [] }; rows.push(r); }
    r.items.push(i);
  });
  return rows.sort((a, b) => a.y - b.y).map(r => {
    const its = r.items.sort((a, b) => a.x - b.x);
    const segs = [];
    its.forEach(i => {
      const last = segs[segs.length - 1];
      const gap = last ? i.x - last.end : Infinity;
      const cur = { t: i.t, x: i.x, end: i.x + i.w, xs: spread(i.t, i.x, i.x + i.w) };
      if (last && gap < Math.max(6, i.h * 0.9)) segs[segs.length - 1] = join(last, cur, gap > i.h * 0.15 ? ' ' : '');
      else segs.push(cur);
    });
    return { segs };
  });
}
async function readPdf(file, onStep) {
  const pdfjs = await import(PDF_URL);
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const out = [];
  let scanned = true;
  for (let p = 1; p <= Math.min(doc.numPages, 6); p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const vp = page.getViewport({ scale: 1 });
    const items = tc.items.map(i => ({ t: i.str, x: i.transform[4], y: vp.height - i.transform[5], w: i.width, h: Math.abs(i.transform[3]) || 10 }));
    if (items.filter(i => i.t.trim()).length > 8) { scanned = false; out.push(...linesFromItems(items)); continue; }
    // PDF escaneado: se convierte la página en imagen y se lee como una foto
    onStep?.(`Leyendo la página ${p} como imagen…`);
    const v2 = page.getViewport({ scale: 2.2 });
    const c = document.createElement('canvas'); c.width = v2.width; c.height = v2.height;
    await page.render({ canvasContext: c.getContext('2d'), viewport: v2 }).promise;
    out.push(...await ocr(c, onStep));
  }
  return { lines: out, how: scanned ? 'pdf-foto' : 'pdf' };
}
async function ocr(src, onStep) {
  await loadScript(OCR_URL);
  onStep?.('Preparando el lector de letras (solo la primera vez tarda un poco)…');
  const worker = await window.Tesseract.createWorker('spa', 1, { ...OCR_OPTS, logger: m => { if (m.status === 'recognizing text') onStep?.(`Leyendo… ${Math.round((m.progress || 0) * 100)}%`); } });
  try {
    const { data: d } = await worker.recognize(src);
    return (d.lines || []).map(l => {   // une palabras cercanas en un mismo bloque (cada letra guarda su posición)
      const segs = [];
      (l.words || []).forEach(wd => {
        const w = { t: wd.text, x: wd.bbox.x0, end: wd.bbox.x1, xs: spread(wd.text, wd.bbox.x0, wd.bbox.x1) };
        const h = Math.max(10, wd.bbox.y1 - wd.bbox.y0);
        const last = segs[segs.length - 1];
        if (last && w.x - last.end < h * 0.9) segs[segs.length - 1] = join(last, w); else segs.push(w);
      });
      return { segs };
    });
  } finally { await worker.terminate(); }
}
export async function readFile(file, onStep) {
  if (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)) return readPdf(file, onStep);
  return { lines: await ocr(file, onStep), how: 'foto' };
}
// Texto pegado: las columnas se separan con tabulador, «|» o dos espacios
export function linesFromText(text) {
  return String(text || '').split(/\r?\n/).map(l => {
    const segs = []; let x = 0;
    l.split(/(\t+|\s*\|\s*|\s{2,})/).forEach(part => { if (part && !/^(\t+|\s*\|\s*|\s{2,})$/.test(part)) { const t = part.trim(); segs.push({ t, x: x * 8, end: (x + t.length) * 8, xs: spread(t, x * 8, (x + t.length) * 8) }); } x += part.length; });
    return { segs };
  }).filter(l => l.segs.length);
}
export const linesToText = lines => lines.map(l => l.segs.map(s => s.t).join('  |  ')).join('\n');

// ───── Reconocer fechas, asignaciones y hermanos ─────
function personVariants() {
  const out = [];
  const add = (p, s, kind) => { const v = nk(s).replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim(); if (v.length >= 4) out.push({ p, v, kind }); };
  data.people.forEach(p => {
    add(p, p.name, 'full');
    String(p.aliases || '').split(/[,;]/).forEach(a => a.trim() && add(p, a, 'full'));
    const w = nk(p.name).split(/\s+/).filter(x => x.length > 2 && !['del', 'las', 'los'].includes(x));
    if (w.length >= 2) { out.push({ p, re: new RegExp(`\\b${w[0]}\\b(?:\\s+\\S+){0,2}?\\s+\\b${w[w.length - 1]}\\b`), kind: 'pair' }); out.push({ p, re: new RegExp(`\\b${w[w.length - 1]}\\b,?\\s+\\b${w[0]}\\b`), kind: 'pair' }); }
  });
  // «J. Pérez»: inicial + apellido, solo si ese apellido con esa inicial es único
  const byKey = {};
  data.people.forEach(p => { const w = nk(p.name).split(/\s+/).filter(x => x.length > 2); if (w.length >= 2) { const k = w[0][0] + ' ' + w[w.length - 1]; (byKey[k] = byKey[k] || []).push(p); } });
  Object.entries(byKey).forEach(([k, ps]) => { if (ps.length === 1) { const [i, last] = k.split(' '); out.push({ p: ps[0], re: new RegExp(`\\b${i}\\.\\s*${last}\\b`), kind: 'ini' }); } });
  return out;
}
function findPeople(line, variants) {
  const t = nk(line);
  const hits = [];
  variants.forEach(v => {
    if (v.v) { let i = -1; while ((i = t.indexOf(v.v, i + 1)) >= 0) { const b = t[i - 1], a = t[i + v.v.length]; if ((!b || !/[a-z0-9ñ]/.test(b)) && (!a || !/[a-z0-9ñ]/.test(a))) hits.push({ p: v.p, s: i, e: i + v.v.length }); } }
    else { const re = new RegExp(v.re.source, 'g'); let m; while ((m = re.exec(t))) hits.push({ p: v.p, s: m.index, e: m.index + m[0].length }); }
  });
  hits.sort((a, b) => (b.e - b.s) - (a.e - a.s));
  const kept = [];
  hits.forEach(h => { if (!kept.some(k => h.s < k.e && k.s < h.e)) kept.push(h); });
  return kept.sort((a, b) => a.s - b.s);
}
function roleAt(t) { const n = nk(t); const r = MECA_ROLES.find(([, re]) => re.test(n)); return r ? r[0] : ''; }
function findDate(t, ctx) {
  const n = nk(t);
  let m = n.match(/\b(\d{1,2})\s*(?:de\s+)?(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[a-z]*\.?(?:\s*(?:de\s+)?(\d{4}))?/);
  if (m) return mk(+m[1], MONTHS.indexOf(m[2] === 'set' ? 'sep' : m[2]) + 1, m[3] ? +m[3] : ctx.y);
  m = n.match(/\b(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[a-z]*\.?\s+(\d{1,2})\b/);
  if (m) return mk(+m[2], MONTHS.indexOf(m[1] === 'set' ? 'sep' : m[1]) + 1, ctx.y);
  m = n.match(/\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/);
  if (m && +m[2] <= 12) return mk(+m[1], +m[2], m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : ctx.y);
  // «Jueves 2» o un número al comienzo, con el mes del título
  m = n.trim().match(/^(lun|mar|mie|jue|vie|sab|dom)(?:es|tes|rcoles|ves|rnes|ado|ingo)?\.?\s*([0-9li|]{1,2})(?![a-z])/);   // «Jue 1» (a veces se lee «Juel»)
  if (m && ctx.m) { const dd = +m[2].replace(/[li|]/g, '1'); if (dd) return mk(dd, ctx.m, ctx.y); }
  m = n.trim().match(/^(\d{1,2})\b/);
  if (m && ctx.m) return mk(+m[1], ctx.m, ctx.y);
  return '';
  function mk(d, mo, y) {
    if (!(d >= 1 && d <= 31 && mo >= 1 && mo <= 12)) return '';
    let yy = y || new Date().getFullYear();
    if (!y) { const now = new Date(); if (mo < now.getMonth() + 1 - 6) yy = now.getFullYear() + 1; }
    return `${yy}-${pad(mo)}-${pad(d)}`;
  }
}
const IGNORE = /^(programa|arreglo|asignaciones?|mec[aá]nicas?|congregaci[oó]n|reuni[oó]n|fecha|semana|entre|fin|mes|hermanos?|hno|hna|y|de|del|la|el|los|las)$/i;

// Devuelve { rows: [{ d, r, pid, n }], unknown: [nombres], dates }
export function parseMecas(lines) {
  const variants = personVariants();
  const ctx = { y: 0, m: 0 };
  let cols = [];   // [{ role, x }] de la fila de títulos
  let lastDate = '';
  const rows = [], unknown = new Set();
  lines.forEach(line => {
    const text = line.segs.map(s => s.t).join('  ');
    const n = nk(text);
    // Mes y año del título («Octubre 2026»)
    const my = n.match(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b(?:\s+(?:de\s+)?(\d{4}))?/);
    if (my && !/\d{1,2}\s*(de\s+)?[a-z]+/.test(n.replace(my[0], ''))) { ctx.m = MONTHS.indexOf(my[1].slice(0, 3) === 'set' ? 'sep' : my[1].slice(0, 3)) + 1; if (my[2]) ctx.y = +my[2]; }
    const yr = n.match(/\b(20\d\d)\b/); if (yr && !ctx.y) ctx.y = +yr[1];
    // Fila de títulos: dos o más asignaciones y ningún hermano
    // Posición de cada letra del renglón
    const xs = []; line.segs.forEach((sg, k) => { xs.push(...(sg.xs || spread(sg.t, sg.x, sg.end))); if (k < line.segs.length - 1) xs.push(sg.end ?? sg.x, sg.end ?? sg.x); });
    const xAt = i => xs[Math.min(Math.max(0, i), xs.length - 1)] ?? 0;
    const found = findPeople(text, variants);
    const roleHits = MECA_ROLES.flatMap(([role, re]) => [...nk(text).matchAll(new RegExp(re.source, 'g'))].map(m => ({ role, i: m.index, x: xAt(m.index) })))
      .sort((a, b) => a.i - b.i).filter((h, k, a) => !k || h.i - a[k - 1].i > 3);
    if (roleHits.length >= 2 && !found.length) { cols = roleHits.map(h => ({ role: h.role, x: h.x })); return; }
    const d = findDate(text, ctx) || lastDate;
    if (!found.length) { if (findDate(text, ctx)) lastDate = findDate(text, ctx); return; }
    lastDate = d;
    const starts = []; let pos = 0;
    line.segs.forEach(sg => { starts.push({ from: pos, t: sg.t }); pos += sg.t.length + 2; });
    const segAt = i => starts.filter(sg => sg.from <= i).pop() || starts[0];
    found.forEach(h => {
      const seg = segAt(h.s), nx = xAt(h.s);
      // 1) «Audio: Juan» en el mismo bloque  2) la columna de títulos donde cae el nombre  3) la última asignación escrita antes en el renglón
      let r = roleAt(text.slice(seg.from, h.s));
      if (!r && cols.length) { const left = cols.filter(c => c.x <= nx + 15).pop(); r = (left || [...cols].sort((a, b) => Math.abs(a.x - nx) - Math.abs(b.x - nx))[0]).role; }
      if (!r) { const before = text.slice(0, h.s); const hits = MECA_ROLES.map(([n, re]) => { const m = [...nk(before).matchAll(new RegExp(re.source, 'g'))].pop(); return m ? { n, i: m.index } : null; }).filter(Boolean).sort((a, b) => b.i - a.i); r = hits[0]?.n || ''; }
      rows.push({ d, r: r || 'Asignación', pid: h.p.id, n: h.p.name });
    });
    // Nombres que no están en Personas (dos palabras con mayúscula que sobran)
    let rest = text; found.slice().reverse().forEach(h => { rest = rest.slice(0, h.s) + ' '.repeat(h.e - h.s) + rest.slice(h.e); });
    (rest.match(/\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+(?:de\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)+/g) || [])
      .filter(x => !x.split(/\s+/).some(w => IGNORE.test(w) || roleAt(w) || MONTH_RE.test(nk(w)) || WEEKDAY_RE.test(nk(w))))
      .forEach(x => unknown.add(x));
  });
  const seen = new Set();
  const uniq = rows.filter(r => { const k = `${r.d}|${r.r}|${r.pid}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return { rows: uniq, unknown: [...unknown].slice(0, 30), dates: [...new Set(uniq.map(r => r.d).filter(Boolean))].sort() };
}

// ───── Seguimiento: quién se usa y quién no ─────
export const isBaptizedMale = p => (p.privileges || []).some(x => /^var[oó]n bautizado/i.test(x)) || M.isElder(p) || M.isMinisterial(p);
export function mecaStats(months = 3) {
  const from = addDays(today(), -Math.round(months * 30.4));
  const rows = (data.mecas || []).flatMap(x => (x.rows || []).map(r => ({ ...r, imp: x.id }))).filter(r => r.d && r.d >= from);
  const by = {};
  rows.forEach(r => { const b = by[r.pid] = by[r.pid] || { pid: r.pid, n: 0, roles: {}, last: '' }; b.n++; b.roles[r.r] = (b.roles[r.r] || 0) + 1; if (r.d > b.last) b.last = r.d; });
  const eligible = data.people.filter(p => isBaptizedMale(p) && !p.mecaOff);
  const used = Object.values(by).map(b => ({ ...b, p: M.person(b.pid) })).filter(b => b.p).sort((a, b) => b.n - a.n || a.p.name.localeCompare(b.p.name, 'es'));
  const notUsed = eligible.filter(p => !by[p.id]).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const avg = used.length ? used.reduce((t, b) => t + b.n, 0) / used.length : 0;
  const heavy = used.filter(b => b.n >= Math.max(3, avg * 1.6));
  const dates = [...new Set(rows.map(r => r.d))].sort();
  return { rows, used, notUsed, heavy, avg, eligible, from, dates, off: data.people.filter(p => isBaptizedMale(p) && p.mecaOff) };
}
// El departamento del organigrama que atiende las asignaciones mecánicas (y su responsable)
export function mecaDept() {
  return (data.depts || []).find(d => d.sk === 'mecanicas') || (data.depts || []).find(d => /asignaciones mec[aá]nicas/i.test(d.name || ''));
}

// ───── Sección en Congregación ─────
export function mecaSection(st = {}) {
  const months = st.mm || 3;
  const s = mecaStats(months);
  const imports = [...(data.mecas || [])].sort((a, b) => (b.to || '').localeCompare(a.to || ''));
  const d = mecaDept();
  const head = d ? M.deptHeads(d).join(', ') : '';
  const chip = (x, t) => `<button class="chip" data-a="meca-months" data-v="${x}" aria-pressed="${months === x}">${t}</button>`;
  return `<section><div class="sec-h"><h2>🎛 Asignaciones mecánicas</h2>${head ? `<span class="hint">★ ${esc(head)}</span>` : ''}</div>
    <div class="org-tools"><button class="btn small" data-a="meca-import">📥 Importar arreglo (foto o PDF)</button><button class="btn small ghost" data-a="meca-bapt">✔ Varones bautizados (${s.eligible.length + s.off.length})</button>${s.notUsed.length ? `<button class="btn small ghost" data-a="meca-suggest">💬 Sugerir al encargado</button>` : ''}</div>
    ${!imports.length ? `<p class="hint pad">Importa el arreglo que hizo el hermano encargado (foto o PDF) y aquí verás quiénes se están usando y quiénes no, entre los varones bautizados. La foto se lee en tu teléfono: no se envía a nadie.</p>` : `
    <div class="chips">${chip(1, 'Último mes')}${chip(3, '3 meses')}${chip(6, '6 meses')}${chip(12, '1 año')}</div>
    <div class="meca-kpis"><div><b>${s.used.length}</b><span>se usan</span></div><div class="${s.notUsed.length ? 'warn' : ''}"><b>${s.notUsed.length}</b><span>sin asignación</span></div><div><b>${s.eligible.length}</b><span>varones bautizados</span></div></div>
    ${s.notUsed.length ? `<h3 class="sub-h">⚠️ No se están usando (${s.notUsed.length})</h3><div class="chips wrap">${s.notUsed.map(p => `<button class="chip warn-chip" data-a="person" data-id="${p.id}">${esc(p.name)}</button>`).join('')}</div>` : (s.eligible.length ? '<p class="hint pad">✓ Todos los varones bautizados tienen alguna asignación en este tiempo.</p>' : '')}
    ${s.heavy.length ? `<h3 class="sub-h">🔁 Los que más se repiten</h3><div class="chips wrap">${s.heavy.map(b => `<button class="chip" data-a="person" data-id="${b.pid}">${esc(b.p.name)} · ${b.n}</button>`).join('')}</div>` : ''}
    ${s.used.length ? `<details class="load-row"><summary><span class="grow"><b>Cuántas veces tuvo cada uno</b><small>desde el ${esc(fmtShort(s.from))}</small></span></summary><ul class="load-list">${s.used.map(b => `<li><b>${b.n}</b> · ${esc(b.p.name)} <span class="hint">${esc(Object.entries(b.roles).map(([r, c]) => `${r}${c > 1 ? ` ×${c}` : ''}`).join(', '))} · última: ${esc(fmtShort(b.last))}</span></li>`).join('')}</ul></details>` : ''}
    <h3 class="sub-h">Arreglos importados</h3><div class="stack">${imports.map(x => `<div class="card mini"><span class="grow"><strong>${esc(x.title || 'Arreglo')}</strong><span class="meta">${x.from ? `${esc(fmtShort(x.from))} – ${esc(fmtShort(x.to))} · ` : ''}${(x.rows || []).length} asignaciones</span></span><button class="btn small ghost" data-a="meca-view" data-id="${x.id}">Ver</button></div>`).join('')}</div>`}
    ${!s.eligible.length && !s.off.length ? '<p class="hint pad">Marca en «✔ Varones bautizados» a quiénes se les puede asignar. Los ancianos y siervos ministeriales ya cuentan.</p>' : ''}
  </section>`;
}

// ───── Hojas: importar, revisar, varones bautizados, sugerir ─────
let draft = null;   // { lines, how, title }
const S = () => import('./sheets.js');

export async function importSheet() {
  const { open } = await S();
  draft = null;
  open({ title: 'Importar arreglo', body: `
    <p class="hint">Toma una foto clara del programa (derecho y con buena luz) o elige el PDF. Se lee en tu teléfono: no se envía a ningún servicio.</p>
    <label class="btn primary block" for="meca-file">📷 Elegir foto o PDF</label>
    <input id="meca-file" type="file" accept="image/*,application/pdf,.pdf" hidden>
    <p class="hint" id="meca-step"></p>
    <details><summary class="hint">¿Te lo pasaron como texto? Pégalo aquí</summary><textarea id="meca-paste" rows="6" placeholder="Fecha | Acomodadores | Audio | Video | Micrófonos"></textarea><button type="button" class="btn small" data-a="meca-paste">Leer texto</button></details>
    <div id="meca-review"></div>` });
}
export async function fileChosen(input) {
  const f = input.files?.[0];
  if (!f) return;
  const step = t => { const el = document.getElementById('meca-step'); if (el) el.textContent = t; };
  step('Leyendo el archivo…');
  try {
    const { lines, how } = await readFile(f, step);
    if (!lines.length) { step('No encontré texto. Prueba con otra foto más clara.'); return; }
    draft = { lines, how, title: f.name.replace(/\.[a-z0-9]+$/i, '') };
    step(how === 'pdf' ? 'Listo: leí el PDF.' : 'Listo: leí la foto. Revisa que los nombres estén bien.');
    review();
  } catch (e) { console.warn(e); step('No se pudo leer el archivo. Prueba con otra foto o pega el texto.'); }
}
export function pasteChosen() {
  const t = document.getElementById('meca-paste')?.value || '';
  if (!t.trim()) return toast('Pega el texto del arreglo');
  draft = { lines: linesFromText(t), how: 'texto', title: 'Arreglo' };
  review();
}
// Muestra lo reconocido. El texto se puede corregir y la lista se actualiza sola.
export function review(fromEdit = false) {
  const box = document.getElementById('meca-review');
  if (!box || !draft) return;
  const res = parseMecas(draft.lines);
  draft.res = res;
  const byDate = {};
  res.rows.forEach(r => { (byDate[r.d || '—'] = byDate[r.d || '—'] || []).push(r); });
  const html = `<h3 class="sub-h">Encontré ${res.rows.length} asignaciones${res.dates.length ? ` en ${res.dates.length} fechas` : ''}</h3>
    ${res.rows.length ? `<div class="stack">${Object.entries(byDate).sort().map(([d, rs]) => `<div class="card mini"><span class="grow"><strong>${d === '—' ? 'Sin fecha' : esc(fmtShort(d))}</strong>
      <span class="meta">${esc(Object.entries(rs.reduce((o, r) => { (o[r.r] = o[r.r] || []).push(r.n); return o; }, {})).map(([r, ns]) => `${r}: ${ns.join(', ')}`).join(' · '))}</span></span></div>`).join('')}</div>` : '<p class="hint">Todavía no reconocí a ningún hermano. Revisa el texto de abajo: corrige los nombres mal leídos o agrégalos a Personas.</p>'}
    ${res.unknown.length ? `<p class="hint pad-top">No están en tus Personas: ${res.unknown.map(n => `<button type="button" class="link sm" data-a="meca-add-person" data-name="${esc(n)}">+ ${esc(n)}</button>`).join(' ')}</p>` : ''}
    ${res.rows.some(r => !r.d) ? '<p class="hint">⚠️ Algunas no tienen fecha: escribe el mes en la primera línea del texto (por ejemplo «Octubre 2026»).</p>' : ''}
    <div class="f"><label for="meca-title">Nombre del arreglo</label><input id="meca-title" maxlength="80" value="${esc(draft.title || '')}" placeholder="Ej. Octubre 2026"></div>
    <button type="button" class="btn primary block" data-a="meca-save" ${res.rows.length ? '' : 'disabled'}>Guardar arreglo</button>
    <details ${fromEdit ? 'open' : ''}><summary class="hint">Ver y corregir el texto leído</summary><textarea id="meca-text" rows="10">${esc(linesToText(draft.lines))}</textarea></details>`;
  if (fromEdit) { const keep = document.getElementById('meca-text'); const pos = keep?.selectionStart; box.innerHTML = html; const t = document.getElementById('meca-text'); if (t && keep) { t.focus(); t.setSelectionRange(pos, pos); } }
  else box.innerHTML = html;
}
let editTimer = null;
export function textEdited(el) {
  clearTimeout(editTimer);
  editTimer = setTimeout(() => { if (!draft) return; draft.lines = linesFromText(el.value); review(true); }, 500);
}
export async function addPerson(name) {
  store.upsert('people', { id: uid(), name, privileges: ['Varón bautizado'], groupIds: [] });
  toast(`${name} agregado a Personas`);
  review();
}
export async function save() {
  if (!draft?.res?.rows.length) return;
  const rows = draft.res.rows;
  const dates = rows.map(r => r.d).filter(Boolean).sort();
  const title = document.getElementById('meca-title')?.value.trim() || draft.title || 'Arreglo';
  store.upsert('mecas', { id: uid(), title, from: dates[0] || today(), to: dates[dates.length - 1] || today(), how: draft.how, rows });
  draft = null;
  const { close } = await S(); close();
  toast('Arreglo guardado');
}
export async function viewSheet(id) {
  const x = store.get('mecas', id);
  if (!x) return;
  const { open } = await S();
  const byDate = {};
  (x.rows || []).forEach(r => { (byDate[r.d || '—'] = byDate[r.d || '—'] || []).push(r); });
  open({ title: x.title || 'Arreglo', body: `<div class="stack">${Object.entries(byDate).sort().map(([d, rs]) => `<div class="card mini"><span class="grow"><strong>${d === '—' ? 'Sin fecha' : esc(fmtShort(d))}</strong><span class="meta">${esc(Object.entries(rs.reduce((o, r) => { (o[r.r] = o[r.r] || []).push(r.n); return o; }, {})).map(([r, ns]) => `${r}: ${ns.join(', ')}`).join(' · '))}</span></span></div>`).join('')}</div>`,
    actions: `<button type="button" class="btn ghost danger" data-a="delete" data-col="mecas" data-id="${x.id}">Eliminar</button>` });
}
export async function baptSheet() {
  const { open, personPick } = await S();
  const people = [...data.people].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const on = people.filter(p => (p.privileges || []).some(x => /^var[oó]n bautizado/i.test(x))).map(p => p.id);
  const auto = people.filter(p => M.isElder(p) || M.isMinisterial(p));
  const off = people.filter(p => p.mecaOff).map(p => p.id);
  open({ title: 'Varones bautizados', body: `
    <p class="hint">Marca a los hermanos a quienes se les puede dar asignaciones mecánicas. Los ancianos y siervos ministeriales (${auto.length}) ya cuentan.</p>
    ${personPick('bapt', people.filter(p => !auto.includes(p)), on, null, 'checkbox', { lazy: true })}
    <h3 class="sub-h">No disponibles por ahora</h3><p class="hint">Por salud, trabajo o viaje: no se sugieren aunque no tengan asignación.</p>
    ${personPick('mecaoff', people.filter(p => auto.includes(p) || on.includes(p.id) || off.includes(p.id)), off, null, 'checkbox', { lazy: true })}`,
    actions: `<button type="button" class="btn primary" data-a="meca-bapt-save">Guardar</button>` });
}
export async function baptSave() {
  const on = new Set([...document.querySelectorAll('input[name="bapt"]:checked')].map(i => i.value));
  const off = new Set([...document.querySelectorAll('input[name="mecaoff"]:checked')].map(i => i.value));
  let n = 0;
  data.people.forEach(p => {
    const has = (p.privileges || []).some(x => /^var[oó]n bautizado/i.test(x));
    const auto = M.isElder(p) || M.isMinisterial(p);
    const want = auto ? has : on.has(p.id);
    const privileges = want ? (has ? p.privileges : [...(p.privileges || []), 'Varón bautizado']) : (p.privileges || []).filter(x => !/^var[oó]n bautizado/i.test(x));
    const mecaOff = off.has(p.id);
    if (want !== has || !!p.mecaOff !== mecaOff) { store.upsert('people', { ...p, privileges, mecaOff }); n++; }
  });
  const { close } = await S(); close();
  toast(n ? `Listo: ${n} ${n === 1 ? 'cambio' : 'cambios'}` : 'Sin cambios');
}
export async function suggest(months = 3) {
  const s = mecaStats(months);
  if (!s.notUsed.length) return toast('Todos tienen asignación');
  const d = mecaDept();
  const heads = d ? M.deptHeadIds(d).map(M.person).filter(Boolean) : [];
  const h = heads[0];
  const range = s.dates.length ? `(${fmtShort(s.dates[0])} al ${fmtShort(s.dates[s.dates.length - 1])})` : '';
  const text = [`Hola${h ? `, ${h.name.split(' ')[0]}` : ''}. Revisando el arreglo de asignaciones mecánicas ${range}, vi que estos hermanos todavía no han tenido asignación:`,
    '', ...s.notUsed.map(p => `• ${p.name}`), '',
    s.heavy.length ? `Y estos se repiten bastante: ${s.heavy.map(b => `${b.p.name} (${b.n})`).join(', ')}.` : '',
    '¿Podrías tomar en cuenta a los primeros en el próximo arreglo? Así más hermanos participan y nadie se recarga. ¡Gracias por tu buen trabajo!'].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');
  if (h?.phone) { window.open(`${waLink(h.phone)}?text=${encodeURIComponent(text)}`, '_blank'); return; }
  try { if (navigator.share) { await navigator.share({ text }); return; } } catch (e) { if (e?.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text); toast('Mensaje copiado: pégalo en WhatsApp'); } catch { toast('No se pudo compartir'); }
}
