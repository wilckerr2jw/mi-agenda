// ✏️ Corregir un mes anterior (Mi Informe, 9.8.1)
// Eliges cualquier mes (también de años de servicio pasados) y ves su tiempo por tipo, sus cursos y sus otros datos.
// Puedes escribir el TOTAL CORRECTO de cada cosa y la app hace el ajuste por ti:
//  · Si falta: suma la diferencia en un registro de ajuste (uno por tipo y mes, marcado adj: true) el último día del mes.
//  · Si sobra: primero baja los ajustes y luego los registros más recientes de ese mes (un registro que se queda
//    en cero y sin nada más se quita). Nunca quedan números negativos.
// También puedes editar, borrar o agregar registros sueltos del mes. Todo se puede deshacer.
import * as store from './store.js';
import { data } from './store.js';
import { esc, ic, uid, today, toast, fmtShort, fmtMonth, addDays, cap, norm } from './util.js';
import * as M from './model.js';
// Las hojas se piden solo cuando se abre una (así no pesan en el arranque de la app)
const Sheets = () => import('./sheets.js');
const open = (...a) => Sheets().then(m => m.open(...a));

const ADJ_NOTE = 'Ajuste del total (corrección)';
const mid0 = () => today().slice(0, 7);
const prevMid = mid => { const [y, m] = mid.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };
const nextMid = mid => { const [y, m] = mid.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };
const lastDay = mid => { const [y, m] = mid.split('-').map(Number); return `${mid}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; };
// El ajuste va el último día del mes (o hoy, si es el mes en curso)
const adjDate = mid => (mid === mid0() ? today() : lastDay(mid));
const studiesOf = e => M.studiesIn(e);

// Meses que se pueden elegir: desde el primer registro (o 2 años atrás) hasta el mes actual, el más nuevo primero
export function monthsList() {
  const first = data.entries.reduce((a, e) => (e.date && e.date.slice(0, 7) < a ? e.date.slice(0, 7) : a), mid0());
  let from = mid0();
  for (let i = 0; i < 24; i++) from = prevMid(from);
  if (first < from) from = first;
  const out = [];
  for (let m = mid0(); m >= from; m = prevMid(m)) out.push(m);
  return out;
}
const label = mid => { const [y, m] = mid.split('-').map(Number); return fmtMonth(y, m); };

// ───── Lectura de horas: «12», «12:30», «12h 30», «12,5» (12 h y media), «12.30» o «12,30» (12 h 30 min) ─────
export function parseHM(s) {
  const t = String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return 0;
  let m = t.match(/^(\d{1,4})\s*(?::|h|hrs?|horas?)\s*(\d{1,2})?\s*(?:m|min)?$/);
  if (m) { const mm = Number(m[2] || 0); return mm < 60 ? Number(m[1]) * 60 + mm : NaN; }
  // Con punto o coma y exactamente dos cifras menores de 60: se lee como horas y minutos (así se suele escribir)
  m = t.match(/^(\d{1,4})[.,](\d{2})$/);
  if (m && Number(m[2]) < 60) return Number(m[1]) * 60 + Number(m[2]);
  m = t.match(/^(\d{1,4})(?:[.,](\d{1,2}))?$/);
  if (m) return Math.round(Number(`${m[1]}.${m[2] || 0}`) * 60);
  m = t.match(/^(\d{1,3})\s*(?:m|min|minutos?)$/);
  if (m) return Number(m[1]);
  return NaN;
}

// «= 12 h 30 min»: cómo se entendió lo escrito (se muestra al escribir, antes de guardar)
export function hmPreview(raw) {
  if (!String(raw ?? '').trim()) return '';
  const v = parseHM(raw);
  if (!Number.isFinite(v) || v < 0) return '¿?';
  const h = Math.floor(v / 60), mi = v % 60;
  return `= ${h} h${mi ? ` ${mi} min` : ''}`;
}

// Lo que hay en un mes: minutos por tipo, cursos y otros datos
function monthState(mid) {
  const entries = M.entriesForMonth(mid);
  const mins = {};
  entries.forEach(e => { mins[e.category] = (mins[e.category] || 0) + (Number(e.minutes) || 0); });
  const studies = M.studiesCount(entries);   // cada estudiante una vez en el mes
  return { entries, mins, studies, extra: M.monthExtras(mid) };
}
// Tipos que salen en la lista: los que puedes usar hoy + los que tienen tiempo en ese mes (aunque ya no los uses)
function catsFor(mins) {
  const cats = { ...M.allServicioCats() };
  Object.keys(mins).forEach(k => { if (!cats[k] && mins[k]) cats[k] = M.catServicioOf(k); });
  return Object.entries(cats);
}

// «Luis (3 veces) · Ana»: con quién estudiaste en el mes; cada uno cuenta como un curso
function studentsLine(entries) {
  const map = new Map();
  entries.forEach(e => (e.studyNames || []).forEach(n => { const k = norm(n); if (!k) return; const x = map.get(k) || { n, c: 0 }; x.c++; if (x.n === x.n.toLowerCase() && n !== n.toLowerCase()) x.n = n; map.set(k, x); }));
  if (!map.size) return '';
  return `<p class="hint">${[...map.values()].map(x => `${esc(x.n)}${x.c > 1 ? ` (${x.c} veces)` : ''}`).join(' · ')}. Cada estudiante cuenta como un curso en el mes, aunque estudies con él varias veces.</p>`;
}

export function fixMonthSheet(mid = prevMid(mid0())) {
  const list = monthsList();
  if (!list.includes(mid)) mid = list[Math.min(1, list.length - 1)];
  const st = monthState(mid);
  const cats = catsFor(st.mins);
  const totS = M.monthTotals(mid), totC = M.monthTotals(mid, true);
  const fields = M.infoFields();
  const i = list.indexOf(mid);
  const row = ([k, c]) => {
    const cur = st.mins[k] || 0;
    return `<div class="fx-row"><span class="dot" style="--c:${esc(c.c)}"></span><span class="grow">${esc(c.n)}${cur ? '' : ' <span class="hint">· sin tiempo</span>'} <span class="hint fx-prev" data-prev="m_${esc(k)}" aria-live="polite"></span></span>
      <input class="fx-in" name="m_${esc(k)}" inputmode="decimal" autocomplete="off" value="${cur ? M.fmtHM(cur) : ''}" placeholder="0:00" data-cur="${cur}" aria-label="Total correcto de ${esc(c.n)} (horas:minutos)"></div>`;
  };
  const serv = cats.filter(([, c]) => !c.credito), cred = cats.filter(([, c]) => c.credito);
  const isCur = mid === mid0();
  open({
    title: '✏️ Corregir un mes',
    body: `<div class="fx-nav">
        <button type="button" class="icon-btn" data-a="fix-month" data-id="${list[i + 1] || ''}" ${list[i + 1] ? '' : 'disabled'} aria-label="Mes anterior">${ic('left')}</button>
        <select id="fix-month" aria-label="Mes que quieres corregir">${list.map(m => `<option value="${m}" ${m === mid ? 'selected' : ''}>${esc(label(m))}${m === mid0() ? ' (este mes)' : ''}</option>`).join('')}</select>
        <button type="button" class="icon-btn" data-a="fix-month" data-id="${list[i - 1] || ''}" ${list[i - 1] ? '' : 'disabled'} aria-label="Mes siguiente">${ic('right')}</button>
      </div>
      <div class="fx-sum"><span><b>${M.fmtHM(totS.minutes)}</b><small>servicio</small></span><span><b>${M.fmtHM(totC.minutes - totS.minutes)}</b><small>crédito</small></span><span><b>${totS.studies}</b><small>${totS.studies === 1 ? 'curso' : 'cursos'}</small></span></div>
      <p class="hint">Escribe el <b>total correcto</b> de lo que esté mal (por ejemplo <b>12:30</b> o <b>12,5</b>) y toca «Guardar cambios». La app ajusta los registros de ${esc(label(mid).toLowerCase())}${isCur ? '' : ' sin tocar los otros meses'}.</p>
      <form id="f" data-form="fixmonth" data-id="${esc(mid)}" autocomplete="off">
        <h3 class="sub-h">Tiempo de servicio</h3><div class="fx-list">${serv.map(row).join('') || '<p class="hint">No hay tipos de servicio.</p>'}</div>
        ${cred.length ? `<h3 class="sub-h">Tiempo de crédito</h3><div class="fx-list">${cred.map(row).join('')}</div>` : ''}
        <h3 class="sub-h">Cursos bíblicos</h3>
        <div class="fx-list"><div class="fx-row"><span class="grow">Cursos bíblicos del mes</span><input class="fx-in" name="studies" type="number" min="0" step="1" inputmode="numeric" value="${st.studies}" data-cur="${st.studies}" aria-label="Total correcto de cursos bíblicos"></div></div>
        ${studentsLine(st.entries)}
        ${fields.length ? `<h3 class="sub-h">Otros datos</h3><div class="fx-list">${fields.map(f => `<div class="fx-row"><span class="grow">${esc(f.ic)} ${esc(f.n)}</span><input class="fx-in" name="x_${esc(f.id)}" inputmode="${f.dec ? 'decimal' : 'numeric'}" value="${st.extra[f.id] ? esc(M.fmtExtra(f, st.extra[f.id])) : ''}" placeholder="0" data-cur="${Number(st.extra[f.id]) || 0}" aria-label="Total correcto de ${esc(f.n)}"></div>`).join('')}</div>` : ''}
      </form>
      <h3 class="sub-h">Registros de ${esc(label(mid).toLowerCase())} <span class="hint">· toca uno para cambiarlo o borrarlo</span></h3>
      ${st.entries.length ? `<div class="stack">${st.entries.map(e => {
        const c = M.catServicioOf(e.category);
        const names = (e.studyNames || []).join(', ');
        const xt = M.extrasText(e.extra || {});
        const n = studiesOf(e) - (e.studyNames?.length || 0);
        return `<button type="button" class="card mini entry-row ${e.adj ? 'is-adj' : ''}" data-a="fix-entry" data-id="${esc(e.id)}" data-mid="${esc(mid)}"><span class="dot" style="--c:${esc(c.c)}"></span><span class="grow"><strong>${e.adj ? '✏️ ' : ''}${esc(c.n)}</strong><span class="meta">${fmtShort(e.date)}${e.notes ? ` · ${esc(e.notes)}` : ''}${names ? ` · ${esc(names)}` : ''}${n ? ` · ${n} ${n === 1 ? 'curso' : 'cursos'}` : ''}${xt ? ` · ${esc(xt)}` : ''}</span></span><span>${M.fmtHM(e.minutes)}</span></button>`;
      }).join('')}</div>` : '<p class="hint">Este mes no tiene registros. Escribe arriba los totales o agrega un registro.</p>'}`,
    actions: `<button type="button" class="btn ghost" data-a="fix-add" data-mid="${esc(mid)}">＋ Registro</button><button type="submit" form="f" class="btn primary">Guardar cambios</button>`,
  });
  // Al escribir un total, al lado del tipo se ve cómo se entendió («= 12 h 30 min»)
  document.querySelector('form[data-form="fixmonth"]')?.addEventListener('input', ev => {
    const inp = ev.target;
    if (!inp?.name?.startsWith('m_')) return;
    const out = [...document.querySelectorAll('.fx-prev')].find(x => x.dataset.prev === inp.name);
    if (out) out.textContent = String(inp.value) === String(inp.defaultValue) ? '' : hmPreview(inp.value);
  });
}

// ───── Guardar: compara lo escrito con lo que hay y ajusta ─────
const snapshot = mid => M.entriesForMonth(mid).map(e => JSON.parse(JSON.stringify(e)));
const isEmptyEntry = e => !(Number(e.minutes) > 0) && !studiesOf(e) && !Object.values(e.extra || {}).some(n => Number(n) > 0) && (e.adj || !String(e.notes || '').trim());

// Baja `amount` de un campo, primero de los ajustes y después de los registros más nuevos del mes
function reduce(entries, amount, take) {
  const order = [...entries.filter(e => e.adj), ...entries.filter(e => !e.adj).sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')))];
  const changed = new Map();
  for (const e of order) {
    if (amount <= 0) break;
    const cur = changed.get(e.id) || e;
    const { next, used } = take(cur, amount);
    if (used > 0) { changed.set(e.id, next); amount -= used; }
  }
  return changed;
}

export function saveFixMonth(mid, form) {
  const before = snapshot(mid);
  const r = Object.fromEntries(new FormData(form).entries());
  const work = new Map(M.entriesForMonth(mid).map(e => [e.id, { ...e, extra: { ...(e.extra || {}) } }]));
  const entries = () => [...work.values()];
  const changes = [];
  const bad = [];

  // 1) Tiempo por tipo
  for (const [key, raw] of Object.entries(r)) {
    if (!key.startsWith('m_')) continue;
    const cat = key.slice(2);
    const want = parseHM(raw);
    if (!Number.isFinite(want) || want < 0) { bad.push(M.catServicioOf(cat).n); continue; }
    const mine = entries().filter(e => e.category === cat);
    const have = mine.reduce((s, e) => s + (Number(e.minutes) || 0), 0);
    const delta = want - have;
    if (!delta) continue;
    if (delta > 0) {
      const adj = mine.find(e => e.adj && !e.monthAdj);
      if (adj) work.set(adj.id, { ...adj, minutes: (Number(adj.minutes) || 0) + delta });
      else { const id = uid(); work.set(id, { id, category: cat, date: adjDate(mid), minutes: delta, studyNames: [], notes: ADJ_NOTE, extra: {}, adj: true }); }
    } else {
      reduce(mine, -delta, (e, left) => { const used = Math.min(left, Number(e.minutes) || 0); return { next: { ...e, minutes: (Number(e.minutes) || 0) - used }, used }; })
        .forEach((e, id) => work.set(id, e));
    }
    changes.push(`${delta > 0 ? '+' : '−'}${M.fmtHM(Math.abs(delta))} ${M.catServicioOf(cat).n}`);
  }
  if (bad.length) { toast(`Revisa el tiempo de: ${bad.join(', ')} (escríbelo como 12:30 o 12,5)`); return; }

  // Ajuste general del mes (cursos y otros datos): un solo registro sin tiempo
  const monthAdj = () => {
    let a = entries().find(e => e.monthAdj);
    if (!a) {
      const cats = Object.entries(M.allServicioCats());
      const key = (cats.find(([k, c]) => k === 'campo' && !c.credito) || cats.find(([, c]) => !c.credito) || cats[0] || ['campo'])[0];
      a = { id: uid(), category: key, date: adjDate(mid), minutes: 0, studyNames: [], studies: 0, notes: ADJ_NOTE, extra: {}, adj: true, monthAdj: true };
    }
    return a;
  };

  // 2) Cursos bíblicos
  const wantS = Math.max(0, Math.round(Number(r.studies) || 0));
  const haveS = M.studiesCount(entries());
  if (wantS !== haveS && String(r.studies ?? '').trim() !== '') {
    const d = wantS - haveS;
    if (d > 0) { const a = monthAdj(); work.set(a.id, { ...a, studies: (Number(a.studies) || 0) + d }); }
    else {
      // Primero se bajan los números sueltos (ajustes y registros viejos)…
      let left = -d;
      reduce(entries(), left, (e, rest) => {
        const n = e.adj || !Array.isArray(e.studyNames) ? Number(e.studies) || 0 : 0, used = Math.min(rest, n);
        return { next: { ...e, studies: n - used }, used };
      }).forEach((e, id) => { left -= (Number(work.get(id).studies) || 0) - (Number(e.studies) || 0); work.set(id, e); });
      // …y después se quita del mes al estudiante anotado más recientemente (en todos sus registros de ese mes)
      while (left > 0) {
        const latest = entries().filter(e => (e.studyNames || []).length).sort((a, b) => b.date.localeCompare(a.date))[0];
        if (!latest) break;
        const key = norm(latest.studyNames[latest.studyNames.length - 1]);
        entries().forEach(e => { if ((e.studyNames || []).some(n => norm(n) === key)) work.set(e.id, { ...e, studyNames: e.studyNames.filter(n => norm(n) !== key) }); });
        left--;
      }
    }
    changes.push(`${d > 0 ? '+' : '−'}${Math.abs(d)} ${Math.abs(d) === 1 ? 'curso' : 'cursos'}`);
  }

  // 3) Otros datos (cartas, kilómetros…)
  for (const f of M.infoFields()) {
    const raw = String(r[`x_${f.id}`] ?? '').replace(',', '.').trim();
    const want = f.dec ? Math.round((Number(raw) || 0) * 100) / 100 : Math.round(Number(raw) || 0);
    if (!(want >= 0)) continue;
    const have = Math.round(entries().reduce((s, e) => s + (Number(e.extra?.[f.id]) || 0), 0) * 100) / 100;
    const d = Math.round((want - have) * 100) / 100;
    if (!d) continue;
    if (d > 0) { const a = monthAdj(); work.set(a.id, { ...a, extra: { ...(a.extra || {}), [f.id]: Math.round(((Number(a.extra?.[f.id]) || 0) + d) * 100) / 100 } }); }
    else reduce(entries(), -d, (e, left) => {
      const n = Number(e.extra?.[f.id]) || 0, used = Math.min(left, n);
      const extra = { ...(e.extra || {}) }; const rest = Math.round((n - used) * 100) / 100;
      if (rest > 0) extra[f.id] = rest; else delete extra[f.id];
      return { next: { ...e, extra }, used };
    }).forEach((e, id) => work.set(id, e));
    changes.push(`${d > 0 ? '+' : '−'}${M.fmtExtra(f, Math.abs(d))} ${f.n}`);
  }

  if (!changes.length) { toast('No cambiaste ningún total'); return; }

  // Guardar: lo que cambió se actualiza y lo que quedó vacío se quita
  const prev = new Map(before.map(e => [e.id, e]));
  for (const e of work.values()) {
    const old = prev.get(e.id);
    if (isEmptyEntry(e)) { if (old) store.remove('entries', e.id); continue; }
    if (!old || JSON.stringify({ ...old, updatedAt: 0 }) !== JSON.stringify({ ...e, updatedAt: 0 })) store.upsert('entries', e);
  }
  fixMonthSheet(mid);
  toast(`${cap(label(mid))} corregido: ${changes.join(' · ')}`, 'Deshacer', () => undoTo(mid, before), 10000);
}

// Deshacer: el mes vuelve a quedar exactamente como estaba
function undoTo(mid, before) {
  const ids = new Set(before.map(e => e.id));
  M.entriesForMonth(mid).forEach(e => { if (!ids.has(e.id)) store.remove('entries', e.id); });
  before.forEach(e => store.restore('entries', e));
  if (document.getElementById('fix-month')) fixMonthSheet(mid);
}

export { prevMid, nextMid, adjDate };
