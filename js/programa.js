// Programa de las reuniones: quién tiene cada parte entre semana y el fin de semana.
//
// Complementa las asignaciones mecánicas (js/mecas.js, que son acomodadores, audio, micrófonos…):
// aquí van las partes del programa en sí.
//
// Cada semana: { id, date, kind: 'semana' | 'finde', parts: [{ k, t, by }] }
//   · k = clave de la parte (para saber cuál es aunque se le cambie el nombre)
//   · t = cómo se llama la parte · by = a quién le toca
import * as store from './store.js';
import { data } from './store.js';
import * as M from './model.js';
import { ic, esc, uid, today, toast, fmtShort, fmtLong, norm, addDays, shareText } from './util.js';
import { leerPrograma, SECCIONES } from './programa-s140.js';
import { printDoc } from './imprimir.js';
import { guardarArchivoHtml, guardarArchivoLuego, borrar as borrarArchivo } from './archivos.js';

// Las partes de siempre. Sirven de punto de partida: cada semana se puede cambiar, quitar o añadir.
export const PARTES = {
  semana: [
    { k: 'presi', t: 'Presidencia' },
    { k: 'ora1', t: 'Oración inicial' },
    { k: 'tesoros', t: 'Tesoros de la Biblia' },
    { k: 'perlas', t: 'Busquemos perlas escondidas' },
    { k: 'lectura', t: 'Lectura de la Biblia' },
    { k: 'maestros', t: 'Seamos mejores maestros' },
    { k: 'vida1', t: 'Nuestra vida cristiana' },
    { k: 'estudio', t: 'Estudio bíblico de la congregación' },
    { k: 'lector', t: 'Lector del estudio' },
    { k: 'ora2', t: 'Oración final' },
  ],
  finde: [
    { k: 'presi', t: 'Presidencia' },
    { k: 'ora1', t: 'Oración inicial' },
    { k: 'discurso', t: 'Discurso público' },
    { k: 'tema', t: 'Tema del discurso' },
    { k: 'atalaya', t: 'Conductor de La Atalaya' },
    { k: 'lector', t: 'Lector de La Atalaya' },
    { k: 'ora2', t: 'Oración final' },
  ],
};
export const TIPOS = [
  { k: 'semana', n: 'Entre semana' },
  { k: 'finde', n: 'Fin de semana' },
];
const nombreTipo = k => TIPOS.find(x => x.k === k)?.n || k;
// «Tema del discurso» es texto libre, no el nombre de un hermano
const esTexto = k => k === 'tema';

const lista = () => [...(data.programa || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
export const semanaDe = (date, kind) => lista().find(x => x.date === date && x.kind === kind) || null;

// Las próximas, de la más cercana a la más lejana
export const proximas = (t = today(), n = 6) => lista().filter(x => x.date >= t).reverse().slice(0, n);

// ¿Me toca algo? Se compara con mi nombre y con el de mi ficha
export function misPartes(t = today(), dias = 21) {
  const v = M.profile();
  const yo = data.people.find(p => p.isMe);
  const nombres = [v.myName, yo?.name].filter(Boolean).map(norm);
  if (!nombres.length) return [];
  const hasta = addDays(t, dias);
  const out = [];
  lista().filter(x => x.date >= t && x.date <= hasta).forEach(s => {
    (s.parts || []).forEach(p => {
      if (esTexto(p.k) || !p.by) return;
      const quien = norm(p.by);
      if (nombres.some(n => quien.includes(n) || n.includes(quien))) out.push({ semana: s, parte: p });
    });
  });
  return out.sort((a, b) => String(a.semana.date).localeCompare(String(b.semana.date)));
}

// Partes sin nadie, para no llegar a la reunión con un hueco
export const huecos = s => (s.parts || [])
  .filter(p => p.asig !== false && !esTexto(p.k) && !String(p.by || '').trim()).length;

// A quién le puede tocar cada parte. Solo sirve para SUGERIR: el campo sigue siendo libre y se
// puede escribir cualquier nombre, esto no impide nada.
//   anciano = presidir, dirigir la reunión y el Estudio Bíblico de la Congregación
//   varon   = las oraciones, la Lectura de la Biblia, los discursos y las partes de enseñanza
//   todos   = las demostraciones de Seamos mejores maestros, donde también participan las hermanas
const POR_CLAVE = { presi: 'anciano', estudio: 'anciano', atalaya: 'anciano', ora1: 'varon', ora2: 'varon',
  lectura: 'varon', lector: 'varon', tesoros: 'varon', perlas: 'varon', vida1: 'varon', discurso: 'varon',
  maestros: 'todos', tema: '' };

export function quienPuede(p = {}) {
  if (p.k in POR_CLAVE) return POR_CLAVE[p.k];
  const t = norm(p.t || '');            // norm() de util.js devuelve minúsculas y sin acentos
  if (/^\s*cancion/.test(t)) return '';
  if (/presidenc|palabras de (introduccion|conclusion)|necesidades de la congregacion|estudio biblico de la congregacion/.test(t)) return 'anciano';
  if (/oracion|lectura de la biblia|discurso|lector\b/.test(t)) return 'varon';
  if (p.sec === 'maestros') return 'todos';
  if (p.sec === 'tesoros' || p.sec === 'vida') return 'varon';
  return 'todos';
}

const ETIQUETA_QUIEN = { anciano: 'ancianos', varon: 'hermanos' };

// Las tres listas de sugerencias, de la más corta a la más larga
function listasDeGente() {
  const nombre = p => p.name;
  const orden = (a, b) => a.localeCompare(b, 'es');
  const todos = data.people.filter(p => p.name);
  const uno = l => [...new Set(l.map(nombre))].sort(orden);
  return { anciano: uno(todos.filter(M.isElder)), varon: uno(todos.filter(M.esVaron)), todos: uno(todos) };
}

// ───────────── Pantalla ─────────────
function tarjetaSemana(s, t) {
  const falta = huecos(s);
  const partes = (s.parts || []).filter(p => String(p.by || '').trim());
  return `<button class="card mini pg-card ${falta ? 'late' : ''}" data-a="pg-new" data-id="${esc(s.id)}">
    <strong>${esc(nombreTipo(s.kind))} · ${esc(fmtShort(s.date))}${s.date === t ? ' · hoy' : ''}</strong>
    <span class="meta">${partes.length ? esc(partes.slice(0, 3).map(p => `${p.t}: ${p.by}`).join(' · ')) : 'Sin nadie asignado todavía'}${partes.length > 3 ? '…' : ''}</span>
    ${falta ? `<span class="meta"><b class="late">${falta} ${falta === 1 ? 'parte sin asignar' : 'partes sin asignar'}</b></span>` : ''}
  </button>`;
}

// El PDF que se subio para estas semanas (el mas reciente), para poder volver a abrirlo
const conArchivo = lista => lista.map(x => x.file).filter(f => f?.url)
  .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))[0]?.url || '';

export function programaSection() {
  const t = today();
  const prox = proximas(t);
  const mias = misPartes(t);
  return `<section><div class="sec-h"><h2>${ic('mic')}Programa de las reuniones</h2>${prox.length ? `<span class="hint">${prox.length} ${prox.length === 1 ? 'próxima' : 'próximas'}</span>` : ''}</div>
    ${mias.length ? `<div class="card pg-mine"><strong>${ic('flag', 'sm')} Te toca</strong>
      ${mias.map(({ semana, parte }) => `<span class="meta">${esc(parte.t)} · ${esc(fmtLong(semana.date))}</span>`).join('')}</div>` : ''}
    ${prox.length ? `<div class="stack">${prox.map(s => tarjetaSemana(s, t)).join('')}</div>`
    : '<p class="hint pad">Anota quién tiene cada parte para tenerlo a mano y poder enviarlo.</p>'}
    <div class="org-tools">
      <button class="btn small ${prox.length ? 'ghost' : 'primary'}" data-a="pg-new" data-v="semana">${ic('plus', 'sm')} Entre semana</button>
      <button class="btn small ${prox.length ? 'ghost' : 'primary'}" data-a="pg-new" data-v="finde">${ic('plus', 'sm')} Fin de semana</button>
      <button class="btn small ghost" data-a="pg-import">${ic('clip', 'sm')} Subir un PDF</button>
      ${conArchivo(prox) ? `<a class="btn small ghost" href="${esc(conArchivo(prox))}" target="_blank" rel="noopener">📄 Ver el PDF</a>` : ''}
      ${prox.length ? `<button class="btn small ghost" data-a="pg-print">🖨 Imprimir</button>
        <button class="btn small ghost" data-a="pg-share" data-id="${esc(prox[0].id)}">${ic('chat', 'sm')} Compartir la próxima</button>` : ''}
    </div>
  </section>`;
}

export function hoyNotices() {
  if (!M.isModuleVisible('congregacion') || !M.featureOn('congregacion.programa')) return [];
  const t = today();
  const mias = misPartes(t, 7);
  if (!mias.length) return [];
  const { semana, parte } = mias[0];
  const cuando = semana.date === t ? 'hoy' : semana.date === addDays(t, 1) ? 'mañana' : `el ${fmtLong(semana.date)}`;
  return [`<button class="log-now" data-a="nav" data-v="congregacion">🎤 <span><b>Te toca «${esc(parte.t)}» ${esc(cuando)}</b><small>${esc(nombreTipo(semana.kind))}${mias.length > 1 ? ` · y ${mias.length - 1} parte${mias.length > 2 ? 's' : ''} más esta semana` : ''}. Toca para verlo.</small></span></button>`];
}

// ───────────── Hoja ─────────────
export function sheet(open, id = '', kind = 'semana') {
  const s = id ? store.get('programa', id) : null;
  const tipo = s?.kind || (kind === 'finde' ? 'finde' : 'semana');
  const partes = s?.parts?.length ? s.parts : PARTES[tipo].map(p => ({ ...p, by: '' }));
  // Para sugerir nombres mientras se escribe, cada parte con los suyos
  const listas = listasDeGente();
  open({
    title: s ? `${nombreTipo(tipo)} · ${fmtShort(s.date)}` : `Programa · ${nombreTipo(tipo)}`,
    body: `<form id="f" data-form="programa" autocomplete="off">
      <input type="hidden" name="id" value="${esc(s?.id || '')}">
      <input type="hidden" name="kind" value="${esc(tipo)}">
      <label class="f"><span>Día de la reunión</span><input type="date" name="date" value="${esc(s?.date || today())}" required></label>
      ${Object.entries(listas).map(([k, l]) => `<datalist id="pg-g-${k}">${l.map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist>`).join('')}
      <fieldset class="f"><legend>Partes</legend>
        ${partes.map((p, i) => {
          const quien = esTexto(p.k) ? '' : quienPuede(p);
          return `<label class="f pg-part">
          <span>${p.time ? `<i class="pg-h">${esc(p.time)}</i> ` : ''}${esc(p.t)}${ETIQUETA_QUIEN[quien] ? ` <i class="pg-q">${ETIQUETA_QUIEN[quien]}</i>` : ''}</span>
          <input name="by_${i}" maxlength="120" value="${esc(p.by || '')}" placeholder="${esTexto(p.k) ? 'Tema del discurso' : 'Nombre'}" ${quien ? `list="pg-g-${quien}"` : ''}>
          <input type="hidden" name="k_${i}" value="${esc(p.k)}">
          <input type="hidden" name="t_${i}" value="${esc(p.t)}">
        </label>`;
        }).join('')}
      </fieldset>
      <p class="hint">Deja en blanco lo que no se sepa todavía: la app avisa de las partes que quedan sin asignar.</p>
      <div class="f-actions"><button type="submit" class="btn primary">Guardar</button>
        ${s ? `<button type="button" class="btn ghost" data-a="pg-share" data-id="${esc(s.id)}">Compartir</button>
               <button type="button" class="btn ghost danger" data-a="pg-del" data-id="${esc(s.id)}">Eliminar</button>` : ''}</div>
    </form>`,
  });
}

export function save(form, close) {
  const f = Object.fromEntries(new FormData(form));
  const date = String(f.date || '').slice(0, 10);
  if (!date) return toast('Pon el día de la reunión');
  const kind = f.kind === 'finde' ? 'finde' : 'semana';
  const parts = [];
  for (let i = 0; `k_${i}` in f; i++) {
    const prev = (store.get('programa', String(f.id || ''))?.parts || [])[i] || {};
    parts.push({ ...prev, k: String(f[`k_${i}`]), t: String(f[`t_${i}`]).slice(0, 80), by: String(f[`by_${i}`] || '').trim().slice(0, 120) });
  }
  // Una sola entrada por reunión: si ya existe la de ese día y tipo, se actualiza
  const previa = lista().find(x => x.date === date && x.kind === kind && x.id !== f.id);
  const id = String(f.id || '') || previa?.id || uid();
  store.upsert('programa', { ...(store.get('programa', id) || {}), id, date, kind, parts });
  close();
  toast('Programa guardado');
}

export function del(id, close) {
  const d = store.get('programa', id);
  if (!d) return;
  if (d.file?.ruta) borrarArchivo(d.file, id);
  store.remove('programa', id);
  close();
  toast('Programa eliminado');
}

// ───────────── Compartir ─────────────
export function texto(id) {
  const s = store.get('programa', id);
  if (!s) return '';
  const lineas = [`*${nombreTipo(s.kind)} · ${fmtLong(s.date)}*`, ''];
  (s.parts || []).forEach(p => {
    const v = String(p.by || '').trim();
    lineas.push(`• ${p.t}: ${v || '—'}`);
  });
  const falta = huecos(s);
  if (falta) lineas.push('', `Faltan ${falta} por asignar.`);
  return lineas.join('\n');
}

export const compartir = id => shareText(texto(id), { title: 'Programa de la reunión', copied: 'Programa copiado' });

// ───────────── Subir el programa impreso (PDF o foto) ─────────────
// El PDF se lee en el propio telefono con el lector que ya trae la app (js/mecas.js):
// no se envia a ningun servicio. Se guardan los DATOS y, si quieres, tambien el archivo
// original en tu cuenta (js/archivos.js), para poder volver a abrirlo tal cual.
let leido = null;   // lo que se acaba de leer, a la espera de confirmar
let archivo = null; // el PDF o la foto que se eligó, por si se quiere guardar también

export async function importSheet(open) {
  leido = null;
  archivo = null;
  open({
    title: 'Subir el programa',
    body: `<p class="hint">Elige el PDF del programa (S-140) o una foto clara. Se lee aquí mismo, en tu teléfono.</p>
      <label class="btn primary block" for="pg-file">📄 Elegir PDF o foto</label>
      <input id="pg-file" type="file" accept="application/pdf,.pdf,image/*" hidden>
      <label class="f"><span>Es el programa de</span><select id="pg-kind">${TIPOS.map(t => `<option value="${t.k}">${t.n}</option>`).join('')}</select></label>
      <p class="hint" id="pg-step"></p>
      <div id="pg-review"></div>`,
  });
}

const paso = t => { const el = document.getElementById('pg-step'); if (el) el.textContent = t; };

export async function fileChosen(input) {
  const f = input.files?.[0];
  if (!f) return;
  const kind = document.getElementById('pg-kind')?.value === 'finde' ? 'finde' : 'semana';
  archivo = f;
  paso('Leyendo el archivo…');
  try {
    const { readFile } = await import('./mecas.js');
    const { lines, how } = await readFile(f, paso);
    if (!lines?.length) { paso('No encontré texto. Prueba con el PDF, o con una foto más clara y derecha.'); return; }
    const semanas = leerPrograma(lines, kind);
    if (!semanas.length) { paso('Leí el archivo, pero no encontré ninguna semana con su fecha. ¿Es el programa de la reunión?'); return; }
    leido = semanas;
    paso(how === 'pdf' ? `Listo: encontré ${semanas.length} ${semanas.length === 1 ? 'semana' : 'semanas'}.` : `Leí la foto: encontré ${semanas.length} ${semanas.length === 1 ? 'semana' : 'semanas'}. Revisa que los nombres estén bien.`);
    revisar();
  } catch (e) {
    console.warn(e);
    paso('No se pudo leer el archivo. Si es una foto, prueba con el PDF.');
  }
}

// Vista previa: se ve lo que se leyó y se puede dejar fuera lo que no se quiera guardar
function revisar() {
  const box = document.getElementById('pg-review');
  if (!box || !leido) return;
  box.innerHTML = `<h3 class="sub-h">Lo que leí</h3>
    <p class="hint">Quita la marca de lo que no quieras guardar. Después de guardar puedes corregir cualquier nombre.</p>
    ${leido.map((s, i) => `<details class="pg-prev" open>
      <summary><label class="pchip"><input type="checkbox" name="pg-w" value="${i}" checked><span>${esc(nombreTipo(s.kind))} · ${esc(fmtLong(s.date))}</span></label>
        <span class="hint">${s.parts.filter(p => p.by).length} con nombre de ${s.parts.filter(p => p.asig !== false).length}</span></summary>
      <ul class="load-list">${s.parts.map(p => `<li>${p.time ? `<span class="hint">${esc(p.time)}</span> ` : ''}${esc(p.t)}${p.by ? ` — <b>${esc(p.by)}</b>` : ''}</li>`).join('')}</ul>
    </details>`).join('')}
    ${guardarArchivoHtml('pg')}
    <button type="button" class="btn primary block" data-a="pg-import-save">Guardar lo marcado</button>`;
}

export function guardarImportado(close) {
  if (!leido) return;
  const marcadas = [...document.querySelectorAll('input[name="pg-w"]:checked')].map(x => Number(x.value));
  const elegidas = leido.filter((_, i) => marcadas.includes(i));
  if (!elegidas.length) return toast('No marcaste ninguna semana');
  const ids = elegidas.map(s => lista().find(x => x.date === s.date && x.kind === s.kind)?.id || uid());
  elegidas.forEach((s, i) => {
    const previa = store.get('programa', ids[i]);
    store.upsert('programa', {
      ...(previa || {}), id: ids[i],
      date: s.date, kind: s.kind, lectura: s.lectura || '', parts: s.parts,
    });
  });
  // El archivo va detrás, sin hacer esperar: una sola copia para todas las semanas que salieron de él
  guardarArchivoLuego('pg', 'programa', ids, archivo);
  leido = null;
  archivo = null;
  close();
  toast(`${elegidas.length} ${elegidas.length === 1 ? 'semana guardada' : 'semanas guardadas'}`);
}

// ───────────── Imprimir o guardar como PDF ─────────────
// Sale parecido al programa impreso: bandas de colores, horas a la izquierda y nombres a la derecha.
const claseSec = k => SECCIONES.find(x => x.k === k)?.clase || '';
const nombreSec = k => SECCIONES.find(x => x.k === k)?.n || '';

function hojaSemana(s) {
  let sec = '';
  const filas = (s.parts || []).map(p => {
    let banda = '';
    if (p.sec && p.sec !== sec) { sec = p.sec; banda = `<div class="pr-sec ${claseSec(sec)}">${esc(nombreSec(sec))}</div>`; }
    return `${banda}<div class="pr-fila">
      <span class="t">${esc(p.time || '')}</span>
      <span class="q">${esc(p.t)}</span>
      <span class="n">${p.label ? `<span class="et">${esc(p.label)}</span>` : ''}${esc(p.by || '')}</span>
    </div>`;
  }).join('');
  return `<section class="pr-sem"><h2><span>${esc(fmtLong(s.date))}${s.lectura ? ` | ${esc(s.lectura)}` : ''}</span><span>${esc(nombreTipo(s.kind))}</span></h2>${filas}</section>`;
}

export function imprimir(id = '') {
  const t = today();
  const semanas = id ? [store.get('programa', id)].filter(Boolean) : proximas(t, 8);
  if (!semanas.length) return toast('Todavía no hay programa que imprimir');
  printDoc(semanas[0].kind === 'finde' ? 'Programa para la reunión del fin de semana' : 'Programa para la reunión de entre semana',
    semanas.map(hojaSemana).join(''));
}
