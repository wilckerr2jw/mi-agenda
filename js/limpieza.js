// Limpieza del Salón del Reino.
//
// El Salón se limpia según un programa, que se pone en el tablero de anuncios. Suele llevar tres
// clases de limpieza:
//   · ligera   — después de cada reunión
//   · semanal  — más a fondo una vez por semana (muchas congregaciones la rotan entre los grupos
//                para el servicio del campo)
//   · anual    — a fondo, al menos una vez al año
//
// Cada turno: { id, date, tipo, groupId, notes }
import * as store from './store.js';
import { data } from './store.js';
import * as M from './model.js';
import { ic, esc, uid, today, toast, fmtLong, addDays, shareText } from './util.js';
import { printDoc } from './imprimir.js';
import { guardarArchivoHtml, guardarArchivoLuego, borrar as borrarArchivo } from './archivos.js';

export const TIPOS = [
  { k: 'semanal', n: 'Semanal', d: 'La limpieza más a fondo de cada semana', e: '🧹' },
  { k: 'ligera', n: 'Después de la reunión', d: 'Un repaso rápido al terminar', e: '🧽' },
  { k: 'anual', n: 'A fondo', d: 'La general, al menos una vez al año', e: '✨' },
];
export const nombreTipo = k => TIPOS.find(t => t.k === k)?.n || 'Semanal';
const emoji = k => TIPOS.find(t => t.k === k)?.e || '🧹';

export const turnos = () => [...(data.limpieza || [])]
  .filter(x => x.date)
  .sort((a, b) => String(a.date).localeCompare(String(b.date)));

const nombreGrupo = id => data.groups.find(g => g.id === id)?.name || '';
export const proximos = (t = today(), n = 12) => turnos().filter(x => x.date >= t).slice(0, n);
export const proximoTurno = (t = today()) => proximos(t, 1)[0] || null;

// Reparte los grupos, uno por turno, desde una fecha y cada «cadaDias» días.
// Devuelve los turnos (no los guarda), para poder revisarlos antes.
export function repartir({ desde, cadaDias = 7, veces = 12, grupos = [], tipo = 'semanal' }) {
  if (!grupos.length || !desde) return [];
  const out = [];
  for (let i = 0; i < veces; i++) {
    out.push({ date: addDays(desde, i * cadaDias), groupId: grupos[i % grupos.length], tipo });
  }
  return out;
}

// ───────────── Pantalla ─────────────
function fila(x, t) {
  const g = nombreGrupo(x.groupId);
  const cuando = x.date === t ? 'Hoy' : x.date === addDays(t, 1) ? 'Mañana' : fmtLong(x.date);
  return `<button class="card mini lp-turno ${x.date < t ? 'pasado' : ''}" data-a="lp-turno" data-id="${esc(x.id)}">
    <strong>${emoji(x.tipo)} ${esc(cuando)}</strong>
    <span class="meta">${esc(nombreTipo(x.tipo))} · ${g ? esc(g) : '<b class="late">sin grupo</b>'}${x.notes ? ` · ${esc(x.notes)}` : ''}</span>
  </button>`;
}

// El PDF que se subio para estos turnos (el mas reciente), para poder volver a abrirlo
const conArchivo = lista => lista.map(x => x.file).filter(f => f?.url)
  .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))[0]?.url || '';

export function limpiezaSection() {
  const t = today();
  const prox = proximos(t);
  const sig = prox[0];
  return `<section><div class="sec-h"><h2>${ic('hammer')}Limpieza del Salón</h2>${prox.length ? `<span class="hint">${prox.length} por venir</span>` : ''}</div>
    ${sig ? `<div class="card lp-next"><span class="meta">${esc(nombreTipo(sig.tipo))} · le toca a</span><strong>${esc(nombreGrupo(sig.groupId) || 'Sin grupo')}</strong>
      <span class="meta">${sig.date === t ? 'hoy' : sig.date === addDays(t, 1) ? 'mañana' : esc(fmtLong(sig.date))}</span></div>` : ''}
    ${prox.length ? `<div class="stack">${prox.map(x => fila(x, t)).join('')}</div>`
    : `<p class="hint pad">El Salón se limpia según un programa que se pone en el tablero. Reparte los turnos entre los grupos para el servicio del campo y después cambia los que haga falta.</p>`}
    <div class="org-tools">
      <button class="btn small ${prox.length ? 'ghost' : 'primary'}" data-a="lp-gen">${ic('users', 'sm')} Repartir turnos</button>
      <button class="btn small ghost" data-a="lp-turno">${ic('plus', 'sm')} Un turno</button>
      <button class="btn small ghost" data-a="lp-import">${ic('clip', 'sm')} Subir un PDF</button>
      ${conArchivo(prox) ? `<a class="btn small ghost" href="${esc(conArchivo(prox))}" target="_blank" rel="noopener">📄 Ver el PDF</a>` : ''}
      ${prox.length ? `<button class="btn small ghost" data-a="lp-print">🖨 Imprimir</button>
        <button class="btn small ghost" data-a="lp-share">${ic('chat', 'sm')} Compartir</button>` : ''}
    </div>
  </section>`;
}

export function hoyNotices() {
  if (!M.isModuleVisible('congregacion') || !M.featureOn('congregacion.limpieza')) return [];
  const t = today();
  const sig = proximoTurno(t);
  if (!sig || (sig.date !== t && sig.date !== addDays(t, 1))) return [];
  const g = nombreGrupo(sig.groupId);
  return [`<button class="log-now" data-a="nav" data-v="congregacion">${emoji(sig.tipo)} <span><b>Limpieza del Salón ${sig.date === t ? 'hoy' : 'mañana'}</b><small>${esc(nombreTipo(sig.tipo))}. ${g ? `Le toca a ${esc(g)}.` : 'Todavía sin grupo asignado.'}</small></span></button>`];
}

// ───────────── Hojas ─────────────
const selTipo = (name, valor) => `<label class="f"><span>Clase de limpieza</span><select name="${name}">${TIPOS.map(x => `<option value="${x.k}" ${valor === x.k ? 'selected' : ''}>${x.n} — ${x.d}</option>`).join('')}</select></label>`;

export function turnoSheet(open, id = '') {
  const x = id ? store.get('limpieza', id) : null;
  const grupos = [...data.groups].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  open({
    title: x ? 'Turno de limpieza' : 'Nuevo turno',
    body: `<form id="f" data-form="lp-turno" autocomplete="off">
      <input type="hidden" name="id" value="${esc(x?.id || '')}">
      <label class="f"><span>Día</span><input type="date" name="date" value="${esc(x?.date || today())}" required></label>
      ${selTipo('tipo', x?.tipo || 'semanal')}
      <label class="f"><span>Grupo</span><select name="groupId">${grupos.length ? `<option value="">Sin asignar</option>${grupos.map(g => `<option value="${esc(g.id)}" ${x?.groupId === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}` : '<option value="">Primero crea grupos en Personas</option>'}</select></label>
      <label class="f"><span>Nota (opcional)</span><input name="notes" maxlength="80" value="${esc(x?.notes || '')}" placeholder="Ej. incluye los baños"></label>
      <div class="f-actions"><button type="submit" class="btn primary">Guardar</button>
        ${x ? `<button type="button" class="btn ghost danger" data-a="lp-del" data-id="${esc(x.id)}">Eliminar</button>` : ''}</div>
    </form>`,
  });
}

export function generarSheet(open) {
  const grupos = [...data.groups].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  if (!grupos.length) return toast('Primero crea los grupos en Personas → Grupos');
  open({
    title: 'Repartir turnos',
    body: `<form id="f" data-form="lp-gen" autocomplete="off">
      ${selTipo('tipo', 'semanal')}
      <label class="f"><span>Empezar el</span><input type="date" name="desde" value="${esc(today())}" required></label>
      <label class="f"><span>Cada cuánto</span><select name="cada"><option value="7">Cada semana</option><option value="14">Cada dos semanas</option><option value="30">Cada mes</option><option value="365">Una vez al año</option></select></label>
      <label class="f"><span>Cuántos turnos</span><select name="veces">${[8, 12, 16, 24, 52].map(n => `<option value="${n}" ${n === 12 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <fieldset class="f"><legend>Grupos que participan</legend>
        <div class="chips wrap">${grupos.map(g => `<label class="pchip"><input type="checkbox" name="g" value="${esc(g.id)}" checked><span>${esc(g.name)}</span></label>`).join('')}</div></fieldset>
      <p class="hint">Se reparten en orden, uno por turno, y se vuelve a empezar. Los turnos de esa misma clase que ya existan en esos días se reemplazan.</p>
      <div class="f-actions"><button type="submit" class="btn primary">Repartir</button></div>
    </form>`,
  });
}

// ───────────── Guardar ─────────────
export function saveTurno(form, close) {
  const f = Object.fromEntries(new FormData(form));
  const date = String(f.date || '').slice(0, 10);
  if (!date) return toast('Pon el día');
  const id = String(f.id || '') || uid();
  store.upsert('limpieza', {
    ...(store.get('limpieza', id) || {}), id, date,
    tipo: TIPOS.some(x => x.k === f.tipo) ? String(f.tipo) : 'semanal',
    groupId: String(f.groupId || ''), notes: String(f.notes || '').slice(0, 80),
  });
  close();
  toast('Turno guardado');
}

export function saveGen(form, close) {
  const f = new FormData(form);
  const grupos = f.getAll('g').map(String).filter(Boolean);
  if (!grupos.length) return toast('Elige al menos un grupo');
  const tipo = String(f.get('tipo') || 'semanal');
  const nuevos = repartir({
    desde: String(f.get('desde') || '').slice(0, 10),
    cadaDias: Number(f.get('cada')) || 7,
    veces: Math.min(52, Number(f.get('veces')) || 12),
    grupos, tipo: TIPOS.some(x => x.k === tipo) ? tipo : 'semanal',
  });
  if (!nuevos.length) return toast('Pon la fecha de inicio');
  // Si ya había un turno de esa clase ese día, se reemplaza en vez de duplicarlo
  const previos = new Map(turnos().filter(x => (x.tipo || 'semanal') === nuevos[0].tipo).map(x => [x.date, x]));
  nuevos.forEach(n => {
    const p = previos.get(n.date);
    store.upsert('limpieza', { ...(p || {}), id: p?.id || uid(), date: n.date, tipo: n.tipo, groupId: n.groupId, notes: p?.notes || '' });
  });
  close();
  toast(`${nuevos.length} turnos repartidos`);
}

export function del(id, close) {
  const d = store.get('limpieza', id);
  if (!d) return;
  if (d.file?.ruta) borrarArchivo(d.file, id);
  store.remove('limpieza', id);
  close();
  toast('Turno eliminado');
}

// ───────────── Compartir e imprimir ─────────────
export function texto() {
  const prox = proximos(today(), 12);
  if (!prox.length) return 'Todavía no hay turnos de limpieza repartidos.';
  const lineas = ['*Limpieza del Salón del Reino*', ''];
  prox.forEach(x => lineas.push(`${emoji(x.tipo)} ${fmtLong(x.date)} — ${nombreGrupo(x.groupId) || 'sin grupo'}${(x.tipo || 'semanal') !== 'semanal' ? ` (${nombreTipo(x.tipo).toLowerCase()})` : ''}`));
  return lineas.join('\n');
}

export const compartir = () => shareText(texto(), { title: 'Limpieza del Salón', copied: 'Turnos copiados' });

// Hoja para el tablero: se abre la ventana de impresión y desde ahí se guarda como PDF
export function imprimir() {
  const prox = proximos(today(), 30);
  if (!prox.length) return toast('Todavía no hay turnos que imprimir');
  const filas = prox.map(x => `<tr><td class="d">${esc(fmtLong(x.date))}</td><td>${esc(nombreTipo(x.tipo))}</td><td class="g">${esc(nombreGrupo(x.groupId) || '—')}</td><td>${esc(x.notes || '')}</td></tr>`).join('');
  printDoc('Programa de limpieza del Salón del Reino', `
    <table class="pr-tabla"><thead><tr><th>Día</th><th>Clase</th><th>Grupo</th><th>Notas</th></tr></thead><tbody>${filas}</tbody></table>
    <p class="pr-pie">El Salón se limpia según este programa: un repaso después de cada reunión, una limpieza más a fondo cada semana y una general al menos una vez al año.</p>`);
}

// ───────────── Subir el programa de limpieza (PDF o foto) ─────────────
// Se busca en cada renglon una fecha y, al lado, el nombre de un grupo. El grupo se empareja
// con los de Personas comparando sin acentos ni mayusculas. Se guardan los DATOS, no el archivo.
let leido = null;

const normG = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

// Fecha en cualquiera de las formas habituales: 08-10-2026, 8/10/26, 2026-10-08
function fechaDe(t) {
  const iso = String(t).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const m = String(t).match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (!m) return '';
  const a = m[3].length === 2 ? `20${m[3]}` : m[3];
  const mes = Number(m[2]), d = Number(m[1]);
  if (mes < 1 || mes > 12 || d < 1 || d > 31) return '';
  return `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function leerTurnos(lineas, tipo = 'semanal') {
  const grupos = data.groups.map(g => ({ id: g.id, n: normG(g.name) })).filter(g => g.n);
  const out = [];
  (lineas || []).forEach(l => {
    const t = (l.segs || []).map(x => x.t).join(' ').replace(/\s+/g, ' ').trim();
    const date = fechaDe(t);
    if (!date) return;
    const resto = normG(t.replace(/\d{4}-\d{2}-\d{2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/, ''));
    // El grupo cuyo nombre aparezca en el renglon (el mas largo gana: «Grupo 1» antes que «Grupo»)
    const g = grupos.filter(x => resto.includes(x.n)).sort((a, b) => b.n.length - a.n.length)[0];
    out.push({ date, groupId: g?.id || '', tipo, texto: t });
  });
  return out;
}

let archivo = null;   // el PDF o la foto que se eligió, por si se quiere guardar también

export async function importSheet(open) {
  leido = null;
  archivo = null;
  open({
    title: 'Subir el programa de limpieza',
    body: `<p class="hint">Elige el PDF o una foto del programa que está en el tablero. Se lee aquí mismo, en tu teléfono.</p>
      <label class="btn primary block" for="lp-file">📄 Elegir PDF o foto</label>
      <input id="lp-file" type="file" accept="application/pdf,.pdf,image/*" hidden>
      ${selTipo('tipoImport', 'semanal')}
      <p class="hint" id="lp-step"></p>
      <div id="lp-review"></div>`,
  });
}

const paso = t => { const el = document.getElementById('lp-step'); if (el) el.textContent = t; };

export async function fileChosen(input) {
  const f = input.files?.[0];
  if (!f) return;
  const tipo = document.querySelector('[name="tipoImport"]')?.value || 'semanal';
  archivo = f;
  paso('Leyendo el archivo\u2026');
  try {
    const { readFile } = await import('./mecas.js');
    const { lines } = await readFile(f, paso);
    const turnos = leerTurnos(lines, tipo);
    if (!turnos.length) { paso('No encontr\u00e9 ninguna fecha. \u00bfEs el programa de limpieza?'); return; }
    leido = turnos;
    const sinGrupo = turnos.filter(x => !x.groupId).length;
    paso(`Listo: ${turnos.length} ${turnos.length === 1 ? 'turno' : 'turnos'}${sinGrupo ? ` (${sinGrupo} sin reconocer el grupo)` : ''}.`);
    revisar();
  } catch (e) {
    console.warn(e);
    paso('No se pudo leer el archivo. Si es una foto, prueba con el PDF.');
  }
}

function revisar() {
  const box = document.getElementById('lp-review');
  if (!box || !leido) return;
  const grupos = [...data.groups].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  box.innerHTML = `<h3 class="sub-h">Lo que le\u00ed</h3>
    <p class="hint">Quita la marca de lo que no quieras guardar y corrige el grupo donde haga falta.</p>
    <div class="stack">${leido.map((x, i) => `<label class="card mini tb-pick"><input type="checkbox" name="lp-w" value="${i}" checked>
      <span><strong>${esc(fmtLong(x.date))}</strong>
      <select name="lp-g-${i}"><option value="">Sin grupo</option>${grupos.map(g => `<option value="${esc(g.id)}" ${x.groupId === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></span></label>`).join('')}</div>
    ${guardarArchivoHtml('lp')}
    <button type="button" class="btn primary block" data-a="lp-import-save">Guardar lo marcado</button>`;
}

export function guardarImportado(close) {
  if (!leido) return;
  const marcados = [...document.querySelectorAll('input[name="lp-w"]:checked')].map(x => Number(x.value));
  if (!marcados.length) return toast('No marcaste ninguno');
  const previos = new Map(turnos().map(x => [`${x.date}|${x.tipo || 'semanal'}`, x]));
  const ids = marcados.map(i => previos.get(`${leido[i].date}|${leido[i].tipo}`)?.id || uid());
  marcados.forEach((i, n) => {
    const x = leido[i];
    const g = document.querySelector(`[name="lp-g-${i}"]`)?.value || '';
    const p = previos.get(`${x.date}|${x.tipo}`);
    store.upsert('limpieza', { ...(p || {}), id: ids[n], date: x.date, tipo: x.tipo, groupId: g, notes: p?.notes || '' });
  });
  // El archivo va detrás, sin hacer esperar: una sola copia para todos los turnos que salieron de él
  guardarArchivoLuego('lp', 'limpieza', ids, archivo);
  leido = null;
  archivo = null;
  close();
  toast(`${marcados.length} ${marcados.length === 1 ? 'turno guardado' : 'turnos guardados'}`);
}
