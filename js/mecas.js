// Asignaciones mecánicas: importar el arreglo que hizo otro hermano (foto o PDF), ver quién se está usando
// y sugerir al encargado que tome en cuenta a los varones bautizados que todavía no tienen asignación.
// La foto se lee en el propio teléfono (no se envía a ningún servicio); el lector viene con la app.
import * as store from './store.js';
import { data } from './store.js';
import * as M from './model.js';
import { ic, esc, uid, today, toast, fmtShort, norm, addDays, waLink, shareText } from './util.js';

// Las bibliotecas vienen con la app (carpeta vendor/): no se descarga nada de otros sitios
const base = new URL('../vendor/', import.meta.url).href;
const OCR_URL = base + 'ocr/tesseract.min.js';
const OCR_OPTS = { workerPath: base + 'ocr/worker.min.js', corePath: base + 'ocr/core', langPath: base + 'ocr/lang', workerBlobURL: false };
const PDF_URL = base + 'pdf/pdf.min.mjs';
const PDF_WORKER = base + 'pdf/pdf.worker.min.mjs';

// ───── Tipos de asignación que se reconocen en el arreglo ─────
export const MECA_ROLES = [
  ['Acomodador', /acomod|auditorio/],
  ['Audio', /\baudio|sonido|consola/],
  ['Video', /\b(v[ií]deo|video)\b|proyecc|pantalla/],
  ['Micrófonos', /micr[oó]f|\bmicros?\b|microfon|pasa ?micr/],
  ['Plataforma', /plataforma|escenario/],
  ['Puerta', /puerta|entrada|recepci/],
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
const nn = t => norm(t).replace(/\s+/g, ' ').trim();
// «Audio: Juan · Video: Pedro» → [{ role, names }]. Solo si la etiqueta es una asignación conocida
// (o, ya dentro del programa, una etiqueta corta sin números, como «Anfitrión Zoom»).
const NOT_ROLE = /^(fecha|d[ií]a|semana|hora|lugar|nota|notas|observaci[oó]n(es)?|tel[eé]fono|encargado|responsable|programa|mes)$/i;
const W = 'A-Za-zÁÉÍÓÚÑÜáéíóúñü().\\/';
function labeledParts(text) {
  const hits = [];
  for (const m of String(text).matchAll(/[:：]/g)) {
    const pre = text.slice(0, m.index);
    const wm = pre.match(new RegExp(`([${W}]+(?: [${W}]+){0,2})\\s*$`));
    if (!wm) continue;
    const words = wm[1].split(' ');
    let hit = null;
    // La etiqueta más corta que sea una asignación conocida («Sol  Video:» → «Video»)
    for (let k = 1; k <= words.length && !hit; k++) {
      const sfx = words.slice(-k).join(' ');
      if (roleAt(sfx)) hit = { role: roleAt(sfx), known: true, at: wm.index + wm[1].length - sfx.length };
    }
    // Una etiqueta propia («Anfitrión Zoom:») solo al comienzo del renglón o de una columna
    if (!hit && /(^|\||\s{2}|\t)\s*$/.test(pre.slice(0, wm.index)) && !NOT_ROLE.test(wm[1])) hit = { role: wm[1].charAt(0).toUpperCase() + wm[1].slice(1), known: false, at: wm.index };
    if (hit) hits.push({ ...hit, end: m.index + 1 });
  }
  if (!hits.some(h => h.known)) return null;
  const parts = hits.map((h, i) => ({ role: h.role, names: text.slice(h.end, hits[i + 1] ? hits[i + 1].at : undefined).replace(/[|·]+\s*$/, '').trim() })).filter(x => x.names);
  return parts.length ? { before: text.slice(0, hits[0].at), parts } : null;
}
// «Juan Pérez, Luis Gil y Mario Paz» → 3 nombres
const splitNames = t => String(t || '').split(/\s*(?:[,;/&+|]|\s-\s|\sy\s|\se\s)\s*/i).map(x => x.replace(/^(hno|hna|hermano|hermana)\.?\s+/i, '').replace(/[.()\[\]"«»]/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
const looksLikeName = t => /[a-záéíóúñ]{2}/i.test(t) && !/\d/.test(t) && t.length <= 40 && !/^(nadie|pendiente|por asignar|n\/?a|-+|—)$/i.test(t);
// La persona de tu lista que corresponde a un nombre: primero igual (o un «también escrito como»), luego parecido
function matchPerson(name, variants) {
  const k = nn(name);
  const exact = data.people.find(p => nn(p.name) === k || String(p.aliases || '').split(/[,;]/).some(a => a.trim() && nn(a) === k));
  if (exact) return exact;
  const hits = findPeople(name, variants);
  const len = nk(name).trim().length;
  const best = hits.find(h => h.e - h.s >= len * 0.6);
  return best ? best.p : null;
}
// La ficha que corresponde a una fila guardada (por su id o, si no estaba en Personas al importarla, por su nombre)
export function rowPerson(r) {
  const p = r.pid && M.person(r.pid);
  if (p) return p;
  const k = nn(r.n || '');
  return k ? data.people.find(x => nn(x.name) === k || String(x.aliases || '').split(/[,;]/).some(a => a.trim() && nn(a) === k)) || null : null;
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
    // Formato «una asignación por renglón»: «Audio: Juan Pérez» (la fecha va sola en el renglón de arriba o al comienzo)
    const labeled = labeledParts(text);
    if (labeled) {
      const d0 = findDate(labeled.before, ctx) || lastDate;
      if (findDate(labeled.before, ctx)) lastDate = d0;
      labeled.parts.forEach(({ role, names }) => splitNames(names).forEach(nm => {
        const p = matchPerson(nm, variants);
        if (p) rows.push({ d: d0, r: role, pid: p.id, n: p.name });
        else if (looksLikeName(nm)) { rows.push({ d: d0, r: role, pid: '', n: nm }); unknown.add(nm); }
      }));
      return;
    }
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
  const uniq = rows.filter(r => { const k = `${r.d}|${r.r}|${r.pid || nn(r.n)}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return { rows: uniq, unknown: [...unknown].slice(0, 30), dates: [...new Set(uniq.map(r => r.d).filter(Boolean))].sort() };
}

// ───── Seguimiento: quién se usa y quién no ─────
export const isBaptizedMale = p => (p.privileges || []).some(x => /^var[oó]n bautizado/i.test(x)) || M.isElder(p) || M.isMinisterial(p);
export function mecaStats(months = 3, { elders = false } = {}) {
  const from = addDays(today(), -Math.round(months * 30.4));
  const upTo = addDays(today(), 60);   // también cuenta lo ya programado para las próximas semanas
  const rows = (data.mecas || []).flatMap(x => (x.rows || []).map(r => ({ ...r, imp: x.id }))).filter(r => r.d && r.d >= from && r.d <= upTo)
    .map(r => { const p = rowPerson(r); return p ? { ...r, pid: p.id } : r; });
  const by = {};
  rows.filter(r => r.pid && M.person(r.pid)).forEach(r => { const b = by[r.pid] = by[r.pid] || { pid: r.pid, n: 0, roles: {}, last: '' }; b.n++; b.roles[r.r] = (b.roles[r.r] || 0) + 1; if (r.d > b.last) b.last = r.d; });
  const eligible = data.people.filter(p => isBaptizedMale(p) && !p.mecaOff && (elders || !M.isElder(p)));   // los ancianos solo si lo eliges
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
  const s = mecaStats(months, { elders: !!st.me });
  const imports = [...(data.mecas || [])].sort((a, b) => (b.to || '').localeCompare(a.to || ''));
  const d = mecaDept();
  const head = d ? M.deptHeads(d).join(', ') : '';
  const cur = currentArreglo();
  const missing = cur ? [...new Set((cur.rows || []).filter(r => !rowPerson(r)).map(r => r.n).filter(Boolean))] : [];
  const chip = (x, t) => `<button class="chip" data-a="meca-months" data-v="${x}" aria-pressed="${months === x}">${t}</button>`;
  return `<section><div class="sec-h"><h2>${ic('sliders')}Asignaciones mecánicas</h2>${head ? `<span class="hint">★ ${esc(head)}</span>` : ''}</div>
    <div class="org-tools"><button class="btn small primary" data-a="meca-import">📥 Importar programa</button><button class="btn small ghost" data-a="meca-bapt">✔ Varones bautizados (${s.eligible.length + s.off.length})</button>${s.notUsed.length ? `<button class="btn small ghost" data-a="meca-suggest">💬 Sugerir al encargado</button>` : ''}</div>
    ${!imports.length ? `<div class="mc-empty"><span class="mc-empty-ic">🎛</span><p>Importa el programa que hizo el hermano encargado: una <b>foto</b>, un <b>PDF</b>, un archivo de <b>texto</b> o pegándolo. Entiende tablas y también el formato «Audio: Nombre» con la fecha arriba.</p><p class="hint">Se lee en tu teléfono: no se envía a nadie.</p></div>` : `
    ${programHtml(cur, st)}
    ${missing.length ? `<div class="mc-missing"><span>👤 ${missing.length} ${missing.length === 1 ? 'hermano del programa no está' : 'hermanos del programa no están'} en tus Personas. Agrégalos para que cuenten en el seguimiento.</span><button class="btn small" data-a="meca-add-all" data-id="${esc(cur.id)}">+ Agregar ${missing.length === 1 ? 'a Personas' : 'a todos'}</button></div>` : ''}
    <h3 class="sub-h mc-sub">📊 Quiénes se están usando</h3>
    <div class="chips">${chip(1, 'Último mes')}${chip(3, '3 meses')}${chip(6, '6 meses')}${chip(12, '1 año')}<button class="chip" data-a="meca-elders" aria-pressed="${!!st.me}">${st.me ? '✓ ' : ''}Incluir ancianos</button></div>
    <div class="meca-kpis"><div><b>${s.used.length}</b><span>se usan</span></div><div class="${s.notUsed.length ? 'warn' : ''}"><b>${s.notUsed.length}</b><span>sin asignación</span></div><div><b>${s.eligible.length}</b><span>${st.me ? 'varones bautizados' : 'varones (sin ancianos)'}</span></div></div>
    ${s.notUsed.length ? `<h3 class="sub-h">⚠️ No se están usando (${s.notUsed.length})</h3><div class="chips wrap">${s.notUsed.map(p => `<button class="chip warn-chip" data-a="person" data-id="${esc(p.id)}">${esc(p.name)}</button>`).join('')}</div>` : (s.eligible.length ? '<p class="hint pad">✓ Todos los varones bautizados tienen alguna asignación en este tiempo.</p>' : '')}
    ${s.heavy.length ? `<h3 class="sub-h">🔁 Los que más se repiten</h3><div class="chips wrap">${s.heavy.map(b => `<button class="chip" data-a="person" data-id="${esc(b.pid)}">${esc(b.p.name)} · ${b.n}</button>`).join('')}</div>` : ''}
    ${s.used.length ? `<details class="load-row"><summary><span class="grow"><b>Cuántas veces tuvo cada uno</b><small>desde el ${esc(fmtShort(s.from))}</small></span></summary><ul class="load-list">${s.used.map(b => `<li><b>${b.n}</b> · ${esc(b.p.name)} <span class="hint">${esc(Object.entries(b.roles).map(([r, c]) => `${r}${c > 1 ? ` ×${c}` : ''}`).join(', '))} · última: ${esc(fmtShort(b.last))}</span></li>`).join('')}</ul></details>` : ''}
    <h3 class="sub-h">🗂 Programas importados</h3><div class="stack">${imports.map(x => `<div class="card mini row-card${x === cur ? ' mc-cur' : ''}"><span class="grow"><strong>${esc(x.title || 'Arreglo')}</strong><span class="meta">${x.from ? `${esc(fmtShort(x.from))} – ${esc(fmtShort(x.to))} · ` : ''}${(x.rows || []).length} asignaciones${x === cur ? ' · el actual' : ''}</span></span><button class="btn small ghost" data-a="meca-view" data-id="${esc(x.id)}">Ver</button></div>`).join('')}</div>`}
    ${!s.eligible.length && !s.off.length ? '<p class="hint pad">Marca en «✔ Varones bautizados» a quiénes se les puede asignar. Los ancianos y siervos ministeriales ya cuentan.</p>' : ''}
  </section>`;
}
export function addAll(id) {
  const x = store.get('mecas', id);
  if (!x) return 0;
  const names = [...new Set((x.rows || []).filter(r => !rowPerson(r)).map(r => r.n).filter(Boolean))];
  names.forEach(name => store.upsert('people', { id: uid(), name, privileges: ['Varón bautizado'], groupIds: [] }));
  // Enlaza las filas con la ficha nueva
  store.upsert('mecas', { ...x, rows: x.rows.map(r => { const p = rowPerson(r); return p ? { ...r, pid: p.id, n: p.name } : r; }) });
  toast(names.length ? `${names.length} ${names.length === 1 ? 'hermano agregado a Personas como varón bautizado' : 'hermanos agregados a Personas como varones bautizados'}` : 'Ya estaban todos');
  return names.length;
}

// ───── Hojas: importar, revisar, varones bautizados, sugerir ─────
let draft = null;   // { lines, how, title }
const S = () => import('./sheets.js');

// El título del programa: el primer renglón si no trae asignaciones ni es solo una fecha
function titleFrom(text) {
  const first = String(text || '').split(/\r?\n/).map(l => l.trim()).find(Boolean) || '';
  if (!first || first.length > 80 || /[:|\t]/.test(first) || /^\d{1,2}[\/\-.]\d{1,2}/.test(first)) return '';
  return first.charAt(0).toUpperCase() + first.slice(1);
}
export async function importSheet() {
  const { open } = await S();
  draft = null;
  open({ title: 'Importar programa', body: `
    <p class="hint">Elige una foto clara del programa (derecho y con buena luz), el PDF o el archivo de texto. Se lee en tu teléfono: no se envía a ningún servicio.</p>
    <label class="btn primary block" for="meca-file">📷 Elegir foto, PDF o texto</label>
    <input id="meca-file" type="file" accept="image/*,application/pdf,.pdf,text/plain,.txt,.csv" hidden>
    <p class="hint" id="meca-step"></p>
    <details class="mc-paste"><summary class="hint">¿Te lo pasaron por WhatsApp? Pega el texto aquí</summary>
      <p class="hint">Sirve cualquiera de estas dos formas:</p>
      <div class="mc-fmts"><pre>01-10-2026\nAcomodador: Juan Pérez\nAudio: Luis Gil\nPuerta: Mario Paz</pre><pre>Fecha | Acomodador | Audio\nJue 1 | Juan Pérez | Luis Gil</pre></div>
      <textarea id="meca-paste" rows="7" placeholder="Pega aquí el programa"></textarea><button type="button" class="btn small" data-a="meca-paste">Leer texto</button></details>
    <div id="meca-review"></div>
    <p class="hint pad-top" id="meca-off-h">El lector de fotos y PDF se descarga la primera vez que lo usas (unos 11 MB).</p>
    <button type="button" class="btn ghost" data-a="meca-offline">⬇ Guardar para usar sin internet</button>` });
  offlineReady().then(ok => { const h = document.getElementById('meca-off-h'); if (ok && h) { h.textContent = '✓ El lector de fotos y PDF ya está guardado: funciona sin internet.'; h.nextElementSibling?.remove(); } });
}

// El lector (vendor/, unos 11 MB) no se descarga al instalar la app: se guarda la primera vez que se usa
// (sw.js lo pone en la caché «vendor-v1») o desde aquí, con «Guardar para usar sin internet».
const VENDOR_FILES = ['ocr/tesseract.min.js', 'ocr/worker.min.js', 'ocr/core/tesseract-core-lstm.wasm.js', 'ocr/core/tesseract-core-simd-lstm.wasm.js', 'ocr/lang/spa.traineddata.gz', 'pdf/pdf.min.mjs', 'pdf/pdf.worker.min.mjs'].map(f => base + f);
async function offlineReady() {
  try { const c = await caches.open('vendor-v1'); return (await Promise.all(VENDOR_FILES.map(u => c.match(u)))).every(Boolean); } catch { return false; }
}
export async function saveOffline(btn) {
  if (!('caches' in window)) return toast('Este navegador no permite guardar el lector sin internet');
  if (btn) { btn.disabled = true; btn.textContent = 'Descargando… 0 de ' + VENDOR_FILES.length; }
  let n = 0;
  try {
    const c = await caches.open('vendor-v1');
    for (const u of VENDOR_FILES) {
      if (!(await c.match(u))) { const r = await fetch(u, { cache: 'reload' }); if (!r.ok) throw new Error(u); await c.put(u, r); }
      n++;
      if (btn) btn.textContent = `Descargando… ${n} de ${VENDOR_FILES.length}`;
    }
    const h = document.getElementById('meca-off-h'); if (h) h.textContent = '✓ El lector de fotos y PDF ya está guardado: funciona sin internet.';
    btn?.remove();
    toast('✓ Listo: ya puedes leer fotos y PDF sin internet');
  } catch (e) {
    console.warn(e);
    if (btn) { btn.disabled = false; btn.textContent = '⬇ Guardar para usar sin internet'; }
    toast('No se pudo descargar todo. Revisa tu conexión e inténtalo de nuevo');
  }
}
export async function fileChosen(input) {
  const f = input.files?.[0];
  if (!f) return;
  const step = t => { const el = document.getElementById('meca-step'); if (el) el.textContent = t; };
  step('Leyendo el archivo…');
  try {
    if (/^text\//.test(f.type) || /\.(txt|csv)$/i.test(f.name)) {
      const txt = await f.text();
      draft = { lines: linesFromText(txt), how: 'texto', title: titleFrom(txt) || f.name.replace(/\.[a-z0-9]+$/i, '') };
      step('Listo: leí el archivo de texto.'); review(); return;
    }
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
  draft = { lines: linesFromText(t), how: 'texto', title: titleFrom(t) || 'Programa de asignaciones' };
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
  const html = `<h3 class="sub-h">✓ Encontré ${res.rows.length} asignaciones${res.dates.length ? ` en ${res.dates.length} fechas` : ''}</h3>
    ${res.rows.length ? `<div class="mc-grid mc-review">${Object.entries(byDate).sort().map(([d, rs]) => { const L = d === '—' ? null : dayLabel(d); const cells = rs.reduce((o, r) => { (o[r.r] = o[r.r] || []).push(r); return o; }, {});
      return `<article class="mc-day"><div class="mc-date">${L ? `<span class="mc-dow">${L.dow}</span><b>${L.d}</b><span>${L.m}</span>` : '<b>?</b><span>sin fecha</span>'}</div><div class="mc-cells">${Object.keys(cells).sort(roleSort).map(r => `<div class="mc-cell"><span class="mc-r">${roleIc(r)} ${esc(r)}</span>${cells[r].map(x => `<span class="mc-n${x.pid ? '' : ' new'}">${esc(x.n)}</span>`).join('<span class="mc-sep">·</span>')}</div>`).join('')}</div></article>`; }).join('')}</div>` : '<p class="hint">Todavía no reconocí a ningún hermano. Revisa el texto de abajo: corrige los nombres mal leídos o agrégalos a Personas.</p>'}
    ${res.unknown.length ? `<div class="mc-missing"><span>👤 <b>${res.unknown.length}</b> ${res.unknown.length === 1 ? 'no está' : 'no están'} en tus Personas (en <i>cursiva</i>). Se guardan igual; agrégalos para que cuenten en el seguimiento: ${res.unknown.map(n => `<button type="button" class="link sm" data-a="meca-add-person" data-name="${esc(n)}">+ ${esc(n)}</button>`).join(' ')}</span><button type="button" class="btn small" data-a="meca-add-unknown">+ Agregar a todos</button></div>` : ''}
    ${res.rows.some(r => !r.d) ? '<p class="hint">⚠️ Algunas no tienen fecha: escribe el mes en la primera línea del texto (por ejemplo «Octubre 2026») o la fecha arriba de sus asignaciones (01-10-2026).</p>' : ''}
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
export function addUnknown() {
  const names = draft?.res?.unknown || [];
  names.forEach(name => { if (!data.people.some(p => nn(p.name) === nn(name))) store.upsert('people', { id: uid(), name, privileges: ['Varón bautizado'], groupIds: [] }); });
  if (names.length) toast(`${names.length} agregados a Personas como varones bautizados`);
  review();
}
export async function addPerson(name) {
  store.upsert('people', { id: uid(), name, privileges: ['Varón bautizado'], groupIds: [] });
  toast(`${name} agregado a Personas`);
  review();
}
export async function save() {
  if (!draft?.res?.rows.length) return;
  const rows = draft.res.rows.map(r => { const p = rowPerson(r); return p ? { ...r, pid: p.id, n: p.name } : r; });
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
  open({ title: x.title || 'Programa', body: programHtml(x, { mv: 'fechas', all: true }),
    actions: `<button type="button" class="btn ghost danger" data-a="delete" data-col="mecas" data-id="${esc(x.id)}">Eliminar</button>` });
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
  await shareText(text);
}

// ═════════ Programa de asignaciones (el «organigrama» de las mecánicas) ═════════
// Cada fecha es una tarjeta con sus asignaciones; se puede ver por fechas o por hermano,
// imprimir en hoja carta, compartir como imagen y avisar a cada hermano por WhatsApp.
export const ROLE_IC = { Acomodador: '🪑', Puerta: '🚪', Audio: '🎚️', Video: '🎥', 'Micrófonos': '🎤', Plataforma: '🎙️', Zoom: '💻', Estacionamiento: '🅿️' };
const roleIc = r => ROLE_IC[r] || '📌';
const ROLE_ORDER = ['Acomodador', 'Puerta', 'Audio', 'Video', 'Micrófonos', 'Plataforma', 'Zoom', 'Estacionamiento'];
const roleSort = (a, b) => { const i = ROLE_ORDER.indexOf(a), j = ROLE_ORDER.indexOf(b); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j) || a.localeCompare(b, 'es'); };
const DOW3 = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MES3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const pISO = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
const dayLabel = iso => { const d = pISO(iso); return { dow: DOW3[d.getDay()], d: d.getDate(), m: MES3[d.getMonth()] }; };
const rowName = r => rowPerson(r)?.name || r.n || '—';

// El arreglo que está corriendo (o el próximo; si no, el último)
export function currentArreglo() {
  const t = today();
  const all = [...(data.mecas || [])].filter(x => (x.rows || []).length);
  return all.filter(x => (x.from || '') <= t && t <= (x.to || '')).sort((a, b) => (b.from || '').localeCompare(a.from || ''))[0]
    || all.filter(x => (x.from || '') > t).sort((a, b) => a.from.localeCompare(b.from))[0]
    || all.sort((a, b) => (b.to || '').localeCompare(a.to || ''))[0] || null;
}
// { roles: [...], days: [{ d, cells: { rol: [nombres] } }] }
export function programOf(x) {
  const byD = {}, roles = new Set();
  (x?.rows || []).forEach(r => { const d = r.d || ''; const c = (byD[d] = byD[d] || {}); (c[r.r] = c[r.r] || []).push(rowName(r)); roles.add(r.r); });
  return { roles: [...roles].sort(roleSort), days: Object.keys(byD).sort().map(d => ({ d, cells: byD[d] })) };
}
const meNames = () => { const me = data.people.find(p => p.isMe); const v = M.profile(); return new Set([me?.name, v.myName].filter(Boolean).map(nn)); };

// Tus próximas asignaciones mecánicas (para Hoy)
export function myMecas(days = 14) {
  const me = data.people.find(p => p.isMe), mine = meNames();
  if (!me && !mine.size) return [];
  const t = today(), end = addDays(t, days);
  return (data.mecas || []).flatMap(x => x.rows || []).filter(r => r.d && r.d >= t && r.d <= end && ((me && rowPerson(r)?.id === me.id) || mine.has(nn(r.n))))
    .sort((a, b) => a.d.localeCompare(b.d) || roleSort(a.r, b.r))
    .reduce((out, r) => { const last = out[out.length - 1]; if (last && last.d === r.d) last.roles.push(r.r); else out.push({ d: r.d, roles: [r.r] }); return out; }, []);
}

// Vista en la app: tarjetas por fecha (la próxima resaltada) o lista por hermano
export function programHtml(x, st = {}) {
  if (!x) return '';
  const { roles, days } = programOf(x);
  const t = today(), mine = meNames();
  const next = days.find(d => d.d >= t)?.d;
  const past = days.filter(d => d.d && d.d < t), rest = days.filter(d => !d.d || d.d >= t);
  const nameHtml = n => `<span class="mc-n${mine.has(nn(n)) ? ' me' : ''}">${esc(n)}</span>`;
  const dayCard = d => { const L = d.d ? dayLabel(d.d) : null; const isNext = d.d === next, isToday = d.d === t;
    return `<article class="mc-day${isNext ? ' next' : ''}${d.d && d.d < t ? ' past' : ''}">
      <div class="mc-date">${L ? `<span class="mc-dow">${L.dow}</span><b>${L.d}</b><span>${L.m}</span>` : '<b>—</b>'}${isNext ? `<span class="mc-tag">${isToday ? 'Hoy' : 'Próxima'}</span>` : ''}</div>
      <div class="mc-cells">${roles.filter(r => d.cells[r]).map(r => `<div class="mc-cell"><span class="mc-r">${roleIc(r)} ${esc(r)}</span>${d.cells[r].map(nameHtml).join('<span class="mc-sep">·</span>')}</div>`).join('')}</div>
    </article>`; };
  const byPerson = () => {
    const by = {};
    days.forEach(d => roles.forEach(r => (d.cells[r] || []).forEach(n => { (by[n] = by[n] || []).push({ d: d.d, r }); })));
    return `<div class="mc-people">${Object.entries(by).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'es')).map(([n, l]) => `<div class="mc-person${mine.has(nn(n)) ? ' me' : ''}"><div class="mc-ph"><b>${esc(n)}</b><span class="mc-count">${l.length}</span></div>
      <div class="mc-when">${l.map(a => `<span class="mc-pill${a.d && a.d < t ? ' past' : ''}">${a.d ? `${dayLabel(a.d).dow} ${dayLabel(a.d).d} ${dayLabel(a.d).m}` : '—'} · ${roleIc(a.r)} ${esc(a.r)}</span>`).join('')}</div></div>`).join('')}</div>`;
  };
  const view = st.mv === 'hermanos' ? 'hermanos' : 'fechas';
  return `<div class="mc-prog">
    <div class="mc-head"><div><strong>${esc(x.title || 'Programa')}</strong><span class="meta">${x.from ? `${esc(fmtShort(x.from))} – ${esc(fmtShort(x.to))} · ` : ''}${days.length} fechas · ${(x.rows || []).length} asignaciones</span></div>
      ${st.all ? '' : `<div class="seg small" role="group" aria-label="Ver el programa"><button data-a="meca-mv" data-v="fechas" aria-pressed="${view === 'fechas'}">📅 Fechas</button><button data-a="meca-mv" data-v="hermanos" aria-pressed="${view === 'hermanos'}">👤 Hermanos</button></div>`}</div>
    <div class="org-tools mc-tools"><button class="btn small" data-a="meca-share" data-id="${esc(x.id)}">🖼 Compartir imagen</button><button class="btn small ghost" data-a="meca-print" data-id="${esc(x.id)}">🖨 Imprimir carta</button><button class="btn small ghost" data-a="meca-remind" data-id="${esc(x.id)}">💬 Avisar a los hermanos</button></div>
    ${view === 'hermanos' ? byPerson() : `${past.length ? `<details class="mc-past"><summary class="hint">Ver ${past.length} ${past.length === 1 ? 'fecha pasada' : 'fechas pasadas'}</summary><div class="mc-grid">${past.map(dayCard).join('')}</div></details>` : ''}
      <div class="mc-grid">${rest.map(dayCard).join('')}</div>`}
  </div>`;
}

// ───── Imprimir en hoja carta: tabla con fechas en filas y asignaciones en columnas ─────
const escH = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function printProgram(id) {
  const x = store.get('mecas', id) || currentArreglo();
  if (!x) return toast('Primero importa un arreglo');
  if (window.Capacitor?.isNativePlatform?.()) return toast('Para imprimir abre la app en la computadora. Desde el teléfono usa «Compartir imagen».');
  const { roles, days } = programOf(x);
  const cg = M.profile().congre || {};
  const cgLine = [[cg.name, cg.number ? `(${cg.number})` : ''].filter(Boolean).join(' '), cg.circuit].filter(Boolean).join(' · ');
  const reun = [cg.midweek ? `Entre semana: ${cg.midweek}` : '', cg.weekend ? `Fin de semana: ${cg.weekend}` : ''].filter(Boolean);
  const head = mecaDept() ? M.deptHeads(mecaDept()).join(', ') : '';
  const PAL = [{ n: 'Verde', p: '#1D5F5A' }, { n: 'Azul', p: '#1F4E8C' }, { n: 'Vino', p: '#7A2E3A' }, { n: 'Morado', p: '#4B3A7A' }, { n: 'Gris', p: '#3B4652' }];
  let col = PAL[0].p; try { col = JSON.parse(localStorage.getItem('org-print-col') || '{}').p || col; } catch {}
  const land = roles.length > 4;
  const months = [...new Set(days.filter(d => d.d).map(d => d.d.slice(0, 7)))];
  const rowsHtml = days.map((d, i) => { const L = d.d ? dayLabel(d.d) : null; const newMonth = i && d.d && days[i - 1].d && d.d.slice(0, 7) !== days[i - 1].d.slice(0, 7);
    return `<tr class="${newMonth ? 'nm' : ''} ${L && ['Sáb', 'Dom'].includes(L.dow) ? 'we' : ''}"><th><span class="dw">${L ? L.dow : ''}</span> <b>${L ? L.d : '—'}</b> <span class="mo">${L ? L.m : ''}</span></th>${roles.map(r => `<td>${(d.cells[r] || []).map(escH).join('<br>') || '<span class="none">—</span>'}</td>`).join('')}</tr>`; }).join('');
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escH(x.title || 'Programa de asignaciones')}</title><style>
    @page{size:letter ${land ? 'landscape' : 'portrait'};margin:10mm}
    :root{--c2:${col};--c1:color-mix(in srgb,var(--c2) 78%,#000);--c3:color-mix(in srgb,var(--c2) 8%,#fff);--c4:color-mix(in srgb,var(--c2) 30%,#fff)}
    *{box-sizing:border-box} body{margin:0;background:#e9ece8;font-family:Arial,"Helvetica Neue",system-ui,sans-serif;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .page{background:#fff;margin:10mm auto;width:${land ? '259mm' : '195.9mm'};height:${land ? '195.9mm' : '259mm'};overflow:hidden;display:flex;flex-direction:column;padding:0}
    .fit{flex:1;overflow:hidden;display:flex;flex-direction:column}
    .hdr{background:var(--c1);color:#fff;display:flex;justify-content:space-between;align-items:flex-end;gap:1em;padding:.5em .8em;border-radius:0 0 10px 10px}
    .hdr h1{margin:0;font-size:1.55em;letter-spacing:.01em;text-transform:uppercase} .hdr .s{font-weight:700;font-size:.85em;margin-top:.15em;opacity:.95} .hdr .r{text-align:right;font-weight:700;font-size:.72em;line-height:1.45;white-space:nowrap}
    .legend{display:flex;flex-wrap:wrap;gap:.4em 1em;padding:.5em .8em .2em;font-size:.8em;color:#333}
    table{width:calc(100% - 1.6em);margin:.7em .8em 0;border-collapse:separate;border-spacing:0;border:1.5px solid var(--c4);border-radius:10px;overflow:hidden;table-layout:fixed}
    thead th{background:var(--c2);color:#fff;font-size:.68em;text-transform:uppercase;letter-spacing:.02em;padding:.45em .25em;text-align:center;overflow-wrap:anywhere;line-height:1.2} .ri{display:block;font-size:1.3em;margin-bottom:.1em}
    thead th:first-child{width:10em}
    tbody th{background:var(--c3);color:var(--c1);text-align:left;padding:.35em .5em;font-weight:600;white-space:nowrap;border-right:1.5px solid var(--c4)}
    tbody th b{font-size:1.25em} .dw{display:inline-block;min-width:2.2em;font-size:.8em;text-transform:uppercase} .mo{font-size:.8em}
    td{padding:.35em .45em;text-align:center;font-weight:600;font-size:.95em;line-height:1.25;border-left:1px solid #e3e7e2}
    tbody tr:nth-child(even) td{background:#f7f9f6} tbody tr + tr > *{border-top:1px solid #e3e7e2} tr.nm > *{border-top:2.5px solid var(--c2)!important}
    tr.we th{color:var(--c2)} .none{color:#bbb}
    .foot{display:flex;justify-content:space-between;color:#666;font-size:8pt;padding:.4em .8em .3em;margin-top:auto}
    .bar{position:sticky;top:0;background:var(--c1);color:#fff;padding:10px;text-align:center;font:600 15px system-ui;z-index:5} .bar button{font:700 15px system-ui;padding:8px 18px;margin-left:10px;border-radius:8px;border:0;cursor:pointer}
    .sw{width:22px;height:22px;padding:0!important;margin:0 2px!important;border-radius:50%!important;border:2px solid #fff!important;vertical-align:middle} .bar input{width:34px;height:24px;border:0;padding:0;vertical-align:middle}
    @media print{body{background:#fff} .bar{display:none} .page{margin:0}}
    </style></head><body>
    <div class="bar">Hoja carta ${land ? 'horizontal' : 'vertical'} · Colores: ${PAL.map(p => `<button type="button" class="sw" title="${p.n}" style="background:${p.p}" data-p="${p.p}"></button>`).join('')} <input type="color" id="cp" value="${esc(col)}"> <button onclick="print()">🖨 Imprimir / Guardar PDF</button></div>
    <section class="page"><div class="fit">
      <div class="hdr"><div><h1>${escH(x.title || 'Programa de asignaciones')}</h1>${cgLine ? `<div class="s">${escH(cgLine)}</div>` : ''}</div><div class="r">${[...reun, head ? `Encargado: ${head}` : ''].filter(Boolean).map(escH).join('<br>')}</div></div>
      <table><thead><tr><th>Fecha</th>${roles.map(r => `<th><span class="ri">${roleIc(r)}</span>${escH(r)}</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table>
    </div><div class="foot"><span>${months.length ? escH(months.map(m => `${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][+m.slice(5) - 1]} ${m.slice(0, 4)}`).join(' – ')) : ''}</span><span>Actualizado el ${escH(fmtShort(today()))} · Mi Agenda Teocrática</span></div></section>
    <script>
      function fit(){var pg=document.querySelector('.page'),f=pg.querySelector('.fit'),s=15;var used=function(){return f.lastElementChild.getBoundingClientRect().bottom-f.getBoundingClientRect().top};pg.style.fontSize=s+'pt';f.style.zoom='';while(used()<f.clientHeight*.72&&s<17){s+=.5;pg.style.fontSize=s+'pt';}while(used()>f.clientHeight-4&&s>8){s-=.5;pg.style.fontSize=s+'pt';}if(used()>f.clientHeight-4)f.style.zoom=((f.clientHeight-6)/used()).toFixed(3);}
      function setCol(p){document.documentElement.style.setProperty('--c2',p);document.getElementById('cp').value=p;try{var o=JSON.parse(opener.localStorage.getItem('org-print-col')||'{}');o.p=p;opener.localStorage.setItem('org-print-col',JSON.stringify(o))}catch(e){}}
      document.querySelectorAll('.sw').forEach(function(b){b.onclick=function(){setCol(b.dataset.p)}});
      document.getElementById('cp').oninput=function(){setCol(this.value)};
      fit();setTimeout(function(){fit();print();},400);
    <\/script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) return toast('Permite las ventanas emergentes para imprimir');
  w.document.write(html); w.document.close();
}

// ───── Imagen para WhatsApp (tabla dibujada) ─────
export function drawProgram(x) {
  const { roles, days } = programOf(x);
  const cg = M.profile().congre || {};
  // Siempre el tono oscuro del color de la app (en modo oscuro el claro no deja leer el texto blanco)
  const accent = { azul: '#2B5C9E', vino: '#8A2D45', morado: '#5E4A9E', terracota: '#A5522A' }[document.documentElement.dataset.accent] || '#1D5F5A';
  const W = Math.max(1000, 190 + roles.length * 210), PAD = 30, DW = 150, CW = (W - PAD * 2 - DW) / Math.max(1, roles.length);
  const f = (w, s) => `${w} ${s}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const c = document.createElement('canvas'), ctx = c.getContext('2d');
  const lines = (t, w) => { ctx.font = f(600, 21); const words = String(t).split(/\s+/); const out = []; let cur = ''; words.forEach(wd => { const tt = cur ? `${cur} ${wd}` : wd; if (ctx.measureText(tt).width > w && cur) { out.push(cur); cur = wd; } else cur = tt; }); if (cur) out.push(cur); return out; };
  const rowsL = days.map(d => roles.map(r => (d.cells[r] || []).flatMap(n => lines(n, CW - 20))));
  const rowH = rowsL.map(cells => Math.max(56, 22 + Math.max(1, ...cells.map(l => l.length)) * 26));
  const top = 150, headH = 54;
  const H = top + headH + rowH.reduce((a, b) => a + b, 0) + 70;
  const S = 2; c.width = W * S; c.height = H * S; ctx.scale(S, S);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = accent; ctx.fillRect(0, 0, W, 118);
  ctx.fillStyle = '#fff'; ctx.font = f(800, 34); ctx.fillText(String(x.title || 'Programa de asignaciones').toUpperCase().slice(0, 60), PAD, 56);
  ctx.font = f(600, 20); ctx.fillText([[cg.name, cg.number ? `(${cg.number})` : ''].filter(Boolean).join(' '), [cg.midweek, cg.weekend].filter(Boolean).join(' · ')].filter(Boolean).join('   ·   '), PAD, 92);
  let y = top;
  const round = (x0, y0, w, h, r) => { ctx.beginPath(); ctx.moveTo(x0 + r, y0); ctx.arcTo(x0 + w, y0, x0 + w, y0 + h, r); ctx.arcTo(x0 + w, y0 + h, x0, y0 + h, r); ctx.arcTo(x0, y0 + h, x0, y0, r); ctx.arcTo(x0, y0, x0 + w, y0, r); ctx.closePath(); };
  round(PAD, y, W - PAD * 2, headH, 10); ctx.fillStyle = accent; ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = f(800, 19); ctx.textAlign = 'center';
  ctx.fillText('FECHA', PAD + DW / 2, y + 34);
  roles.forEach((r, i) => ctx.fillText(`${roleIc(r)} ${r.toUpperCase()}`, PAD + DW + CW * i + CW / 2, y + 34));
  y += headH;
  const t = today(), next = days.find(d => d.d >= t)?.d;
  days.forEach((d, i) => {
    const h = rowH[i];
    ctx.fillStyle = d.d === next ? '#FFF6DE' : i % 2 ? '#F4F7F3' : '#FFFFFF'; ctx.fillRect(PAD, y, W - PAD * 2, h);
    ctx.fillStyle = '#E3E7E2'; ctx.fillRect(PAD, y + h - 1, W - PAD * 2, 1);
    const L = d.d ? dayLabel(d.d) : null;
    ctx.textAlign = 'left'; ctx.fillStyle = accent; ctx.font = f(700, 16); ctx.fillText(L ? L.dow.toUpperCase() : '', PAD + 14, y + h / 2 + 6);
    ctx.font = f(800, 26); ctx.fillText(L ? String(L.d) : '—', PAD + 62, y + h / 2 + 9);
    ctx.font = f(600, 16); ctx.fillText(L ? L.m : '', PAD + 98, y + h / 2 + 6);
    ctx.textAlign = 'center'; ctx.fillStyle = '#17282A'; ctx.font = f(600, 21);
    rowsL[i].forEach((ls, k) => { const cx = PAD + DW + CW * k + CW / 2; const y0 = y + h / 2 - (Math.max(1, ls.length) - 1) * 13 + 7; (ls.length ? ls : ['—']).forEach((l, j) => { ctx.fillStyle = ls.length ? '#17282A' : '#B8BDB8'; ctx.fillText(l, cx, y0 + j * 26); }); });
    y += h;
  });
  ctx.textAlign = 'right'; ctx.fillStyle = '#7A8584'; ctx.font = f(500, 16); ctx.fillText(`Actualizado el ${fmtShort(t)} · Mi Agenda Teocrática`, W - PAD, H - 26);
  return c;
}
export async function shareProgram(id) {
  const x = store.get('mecas', id) || currentArreglo();
  if (!x) return toast('Primero importa un arreglo');
  const c = drawProgram(x);
  c.toBlob(async blob => {
    const file = new File([blob], `programa-asignaciones-${today()}.png`, { type: 'image/png' });
    try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: x.title || 'Programa de asignaciones' }); return; } } catch (e) { if (e?.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Imagen descargada');
  }, 'image/png');
}

// ───── Avisar a cada hermano sus asignaciones (un mensaje de WhatsApp por persona) ─────
export async function remindSheet(id, span = 'semana') {
  const x = store.get('mecas', id) || currentArreglo();
  if (!x) return;
  const { open } = await S();
  const t = today(), end = span === 'todo' ? '9999' : addDays(t, span === 'mes' ? 31 : 7);
  const by = {};
  (x.rows || []).filter(r => r.d && r.d >= t && r.d <= end).sort((a, b) => a.d.localeCompare(b.d)).forEach(r => { const p = rowPerson(r); const k = p?.id || nn(r.n); (by[k] = by[k] || { p, n: p?.name || r.n, list: [] }).list.push(r); });
  const list = Object.values(by).sort((a, b) => a.n.localeCompare(b.n, 'es'));
  const chip = (v, n) => `<button class="chip" data-a="meca-remind" data-id="${esc(x.id)}" data-v="${v}" aria-pressed="${span === v}">${n}</button>`;
  open({ title: 'Avisar a los hermanos', body: `<p class="hint">Cada hermano recibe sus asignaciones en un mensaje de WhatsApp. Toca «Enviar» en cada uno.</p>
    <div class="chips">${chip('semana', 'Próximos 7 días')}${chip('mes', 'Próximo mes')}${chip('todo', 'Todo el programa')}</div>
    ${list.length ? `<div class="stack">${list.map(b => `<div class="card mini row-card"><span class="grow"><strong>${esc(b.n)}</strong><span class="meta">${esc(b.list.map(r => `${fmtShort(r.d)} ${r.r}`).join(' · '))}</span>${b.p?.phone ? '' : '<span class="meta warn-t">Sin teléfono: se comparte el mensaje</span>'}</span>
      <button class="btn small" data-a="meca-remind-send" data-id="${esc(x.id)}" data-v="${span}" data-k="${esc(b.p?.id || nn(b.n))}">💬 Enviar</button></div>`).join('')}</div>` : '<p class="hint pad">No hay asignaciones en ese tiempo.</p>'}` });
}
export async function remindSend(id, span, key) {
  const x = store.get('mecas', id) || currentArreglo();
  if (!x) return;
  const t = today(), end = span === 'todo' ? '9999' : addDays(t, span === 'mes' ? 31 : 7);
  const rows = (x.rows || []).filter(r => r.d && r.d >= t && r.d <= end).filter(r => (rowPerson(r)?.id || nn(r.n)) === key).sort((a, b) => a.d.localeCompare(b.d));
  if (!rows.length) return;
  const p = rowPerson(rows[0]);
  const first = (p?.name || rows[0].n).split(' ')[0];
  const byD = rows.reduce((o, r) => { (o[r.d] = o[r.d] || []).push(r.r); return o; }, {});
  const text = [`Hola, ${first}. Te recuerdo tus asignaciones:`, '', ...Object.entries(byD).map(([d, rs]) => `• ${fmtLongD(d).charAt(0).toUpperCase() + fmtLongD(d).slice(1)}: ${rs.join(' y ')}`), '', '¡Gracias por tu apoyo!'].join('\n');
  if (p?.phone) { window.open(`${waLink(p.phone)}?text=${encodeURIComponent(text)}`, '_blank'); return; }
  await shareText(text);
}
const fmtLongD = iso => { const d = pISO(iso); return `${['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][d.getDay()]} ${d.getDate()} de ${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][d.getMonth()]}`; };
