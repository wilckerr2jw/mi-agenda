// 📄 Papeles · módulo aparte (no cambia ningún archivo de la app)
//
// Para activarlo:  una línea en index.html →  <script type="module" src="modulos/papeles/papeles.js"></script>
// Para quitarlo:   se borra esa línea y la carpeta modulos/papeles. La app queda como estaba.
//
// Qué hace:
//   Subes el PDF de un papel oficial (hoy: el S-147 «Anuncios y recordatorios») y la app saca
//   las tareas de ese mes. Si vuelves a subir la misma hoja, no duplica nada: compara y te dice
//   qué es nuevo, qué cambió y qué ya no viene.
//
// Cómo se integra sin tocar el código existente:
//   · Las tareas que salen son TAREAS NORMALES de la Agenda, con una marca `origen` que dice
//     de qué papel y de qué mes vinieron. Los avisos, el calendario y el resto funcionan solos.
//   · Lo que no se entiende no se pierde: queda en «Por resolver» (la idea que mejor hace la
//     app de Territorio) para que lo arregles a mano cuando puedas.
//   · Sus ajustes se guardan en el perfil, en un solo campo: profile.papeles.
//
// Cada formulario vive en su propio archivo `papel-XXX.js`: añadir o quitar uno no toca nada más.

import { registrarModulo, refrescar } from '../_nucleo.js';
import * as store from '../../js/store.js';
import { data } from '../../js/store.js';
import * as M from '../../js/model.js';
import * as S from '../../js/sheets.js';
import { esc, uid, today, toast, fmtShort, fmtTime, MESES, cap } from '../../js/util.js';
import { leer, desdeTexto, ErrorLectura } from './lector.js';
import { listos, pendientes, reconocer, pista } from './registro.js';
import { registrarLector } from '../../js/lectores.js';
import { comparar, resumen, aTarea } from './reconciliar.js';
import * as PR from '../../js/por-resolver.js';
import * as Nombres from '../../js/nombres.js';

const ID = 'papeles';
const NOMBRE = 'Papeles';
const ICONO = '📄';
const FEATURE = 'general.papeles';

// ───────────── Ajustes del módulo (profile.papeles) ─────────────

const DEF = { showHoy: true, hidden: false, cargas: {} };
const cfg = () => ({ ...DEF, ...(M.profile().papeles || {}) });
const guardar = cambios => store.patchProfile(v => ({
  papeles: { ...DEF, ...(v.papeles || {}), ...(typeof cambios === 'function' ? cambios({ ...DEF, ...(v.papeles || {}) }) : cambios) },
}));

const mesActual = () => today().slice(0, 7);
const nombreMes = p => `${cap(MESES[Number(p.slice(5, 7)) - 1] || '')} de ${p.slice(0, 4)}`;

// Tareas de la app que vinieron de este papel y este mes
const tareasDe = (papelId, periodo) => data.tasks.filter(t => t.origen?.papel === papelId && t.origen?.periodo === periodo);

// ───────────── Estado de la pantalla (solo mientras está abierta) ─────────────

let pendiente = null;   // { papel, resultado, plan, excluidas } a la espera de que confirmes

const COLECCIONES = { programa: 'Congregación → Programa de las reuniones', asistencia: 'Congregación → Asistencia', mecas: 'Congregación → Asignaciones mecánicas', people: 'Personas', limpieza: 'Congregación → Limpieza del Salón' };
const nombreColeccion = c => COLECCIONES[c] || c;

// ───────────── Menú de carga ─────────────
// Es a donde lleva la tarjeta de «Hoy»: lo que se quiere desde ahí es cargar la hoja, no dar un rodeo.

function menuCarga() {
  S.open({
    title: `${ICONO} Cargar un papel`,
    body: `<div class="pp">
      <button type="button" class="log-now pp-subir" data-pp="elegir">📄 <span><b>Elegir un archivo</b><small>PDF, Word, foto o texto.</small></span></button>
      <button type="button" class="log-now" data-pp="pegar">✍️ <span><b>Pegar el texto</b><small>Si te llegó por mensaje, pégalo tal cual.</small></span></button>
      <div class="pp-foot"><button type="button" class="link" data-pp="inicio">Ver todo lo de Papeles</button></div>
    </div>`,
  });
}

// ───────────── Pantalla principal ─────────────

async function abrir(sub = '') {
  if (sub === 'cargar') return menuCarga();
  const c = cfg();
  const sinLeer = await pendientes();

  const cargas = Object.entries(c.cargas).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
  const dudas = PR.lista('s147');

  const body = `<div class="pp">
    <div class="pp-cab"><span class="ic">📄</span><span><b>${esc(nombreMes(mesActual()))}</b><small>${c.cargas[`s147:${mesActual()}`] ? 'S-147 cargado' : 'Todavía sin cargar el S-147'}</small></span></div>
    <button type="button" class="log-now pp-subir" data-pp="elegir">📄 <span><b>Subir un papel</b><small>PDF, Word, foto o texto.</small></span></button>

    <h3 class="pp-h">Lo que sé leer</h3>
    <ul class="pp-lista">
      ${(await listos()).map(p => `<li class="pp-item ok"><b>${esc(p.nombre)}</b><small>${esc(p.resumen)}</small></li>`).join('')}
      ${sinLeer.map(p => `<li class="pp-item"><b>${esc(p.nombre)}</b><small>Todavía no. Mándame una hoja de ejemplo y le hago su lector.</small></li>`).join('')}
    </ul>

    ${dudas.length ? `<h3 class="pp-h">Por resolver <span class="pp-n">${dudas.length}</span></h3>
    <p class="pp-ayuda">Esto venía en la hoja pero no se pudo entender. No se pierde: míralo y decide.</p>
    <ul class="pp-lista">
      ${dudas.slice(0, 20).map(d => `<li class="pp-duda">
        <b>${esc(d.texto)}</b><small>${esc(d.porque)}</small>
        <span class="pp-acc">
          <button type="button" class="link" data-pp="duda-tarea" data-id="${esc(d.id)}">Hacerla tarea</button>
          <button type="button" class="link" data-pp="duda-no" data-id="${esc(d.id)}">Descartar</button>
        </span>
      </li>`).join('')}
    </ul>` : ''}

    ${cargas.length ? `<h3 class="pp-h">Lo que ya cargaste</h3>
    <ul class="pp-lista">
      ${cargas.map(([k, v]) => {
        const [papelId, periodo] = k.split(':');
        const vivas = tareasDe(papelId, periodo).length;
        return `<li class="pp-item"><b>${esc(v.titulo || k)}</b><small>${vivas} ${vivas === 1 ? 'tarea' : 'tareas'} · cargado el ${esc(fmtShort(v.fecha))}</small></li>`;
      }).join('')}
    </ul>` : ''}

    <div class="pp-foot">
      <button type="button" class="link" data-pp="pegar">✍️ Pegar el texto a mano</button> ·
      <button type="button" class="link" data-pp="ajustes">⚙️ Ajustes del módulo</button> ·
      <button type="button" class="link" data-pp="ayuda">¿Cómo funciona?</button>
    </div>
  </div>`;

  S.open({ title: `${ICONO} ${NOMBRE}`, body });
}

// ───────────── Subir y leer ─────────────

function elegirArchivo() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = ".pdf,.docx,.txt,.csv,image/*";
  inp.onchange = () => { const f = inp.files?.[0]; if (f) procesar(f); };
  inp.click();
}

function estado(msg) {
  const n = document.querySelector('.pp-estado');
  if (n) n.textContent = msg;
  else toast(msg);
}

async function procesar(file) {
  S.open({ title: `${ICONO} Leyendo el papel`, body: `<div class="pp"><p class="pp-estado">Abriendo el archivo…</p><p class="pp-ayuda">Todo pasa dentro de tu teléfono: el archivo no se manda a ningún sitio.</p></div>` });
  try {
    const { lineas, como } = await leer(file, estado);
    await revisar(lineas, como);
  } catch (err) {
    const msg = err instanceof ErrorLectura ? err.message : 'No se pudo leer ese archivo.';
    console.warn('📄 Papeles:', err);
    S.open({
      title: `${ICONO} No se pudo leer`,
      body: `<div class="pp"><p class="pp-mal">${esc(msg)}</p>
        <button type="button" class="log-now" data-pp="pegar">✍️ <span><b>Pegar el texto a mano</b><small>Copia el contenido de la hoja y pégalo aquí.</small></span></button>
        <div class="pp-foot"><button type="button" class="link" data-pp="inicio">Volver</button></div></div>`,
    });
  }
}

async function revisar(lineas, como) {
  const hallado = await reconocer(lineas);
  if (!hallado) {
    // ¿Será uno de los que aún no sabemos leer? Mejor decirlo que dejarte a ciegas
    const casi = await pista(lineas);
    if (casi) {
      S.open({
        title: `${ICONO} Todavía no sé leer esta hoja`,
        body: `<div class="pp">
          <p class="pp-aviso">Esto parece un <b>${esc(casi)}</b>, pero aún no tengo su lector.</p>
          <p class="pp-ayuda">Si me mandas una hoja de estas <b>con datos dentro</b> (los nombres y números pueden ser inventados), le hago el suyo. Con el formulario en blanco no hay nada que leer.</p>
          <div class="pp-foot"><button type="button" class="link" data-pp="elegir">Probar con otro archivo</button> · <button type="button" class="link" data-pp="inicio">Volver</button></div>
        </div>`,
      });
      return;
    }
    S.open({
      title: `${ICONO} No reconozco esta hoja`,
      body: `<div class="pp">
        <p class="pp-mal">Ese archivo no parece ninguno de los papeles que sé leer.</p>
        <p class="pp-ayuda">${como === 'pdf-foto' || como === 'foto' ? 'Era una foto o un escaneo, así que puede que se haya leído mal. ' : ''}Revisa que sea la hoja completa y no una página suelta.</p>
        <div class="pp-foot"><button type="button" class="link" data-pp="elegir">Probar con otro archivo</button> · <button type="button" class="link" data-pp="pegar">Pegar el texto</button> · <button type="button" class="link" data-pp="inicio">Volver</button></div>
      </div>`,
    });
    return;
  }

  const { papel, confianza } = hallado;
  let resultado;
  try {
    resultado = papel.leer(lineas, { diaDe: diaDeReunion });
  } catch (err) {
    console.warn(`📄 ${papel.id}:`, err);
    toast('Esa hoja se reconoció, pero no se pudo leer por dentro.');
    abrir();
    return;
  }

  const existentes = tareasDe(papel.id, resultado.periodo);
  const plan = comparar(existentes, resultado.tareas);
  // Todas vienen marcadas; aquí se apunta lo que TÚ desmarcas (por su clave)
  pendiente = { papel, resultado, plan, excluidas: new Set(), conRegistros: true };
  const hayRegistros = (resultado.registros || []).length > 0;
  const soloRegistros = hayRegistros && !plan.nuevas.length && !plan.cambiadas.length && !plan.quitadas.length;
  // La hoja no dio nada: ni tareas, ni registros, ni dudas (lo típico: la plantilla en blanco)
  const vacia = !hayRegistros && !plan.hayCambios && !plan.iguales.length && !resultado.dudas.length;

  S.open({
    title: `${ICONO} ${esc(resultado.titulo)}`,
    body: `<div class="pp">
      ${confianza < 0.6 ? '<p class="pp-aviso">No estoy del todo seguro de que sea esta hoja. Revisa la lista antes de guardar.</p>' : ''}
      ${como === 'pdf-foto' || como === 'foto' ? '<p class="pp-aviso">Era un escaneo: se leyó letra por letra, así que puede traer algún error. Échale un ojo.</p>' : ''}

      ${vacia ? `<p class="pp-resumen"><b>No encontré nada que guardar en esa hoja.</b>Puede que sea la plantilla en blanco, o que sea de otro mes. Si tiene datos y aun así no los veo, dímelo.</p>`
        : soloRegistros ? '' : `<p class="pp-resumen"><b>${esc(resumen(plan))}</b></p>`}

      ${plan.nuevas.length ? `<h3 class="pp-h">Elige cuáles quieres <span class="pp-n" id="pp-cuenta">${plan.nuevas.length}</span></h3>
        <p class="pp-ayuda">Vienen todas marcadas. Desmarca las que no sean para ti: no se crearán.</p>
        <div class="pp-todas" role="group" aria-label="Marcar o desmarcar">
          <button type="button" data-pp="sel-todas">Todas</button>
          <button type="button" data-pp="sel-ninguna">Ninguna</button>
        </div>
        ${grupos(plan.nuevas)}` : ''}

      ${hayRegistros ? `<h3 class="pp-h">${soloRegistros ? 'Se va a guardar' : 'Además se guardará'}</h3>
        <ul class="pp-lista">${resultado.registros.map(r => `<li class="pp-tarea pp-elegible">
          <label><input type="checkbox" data-pp="sel-reg" checked>
            <span><b>${esc(r.resumen)}</b><small>Va a ${esc(nombreColeccion(r.coleccion))}.</small></span>
          </label></li>`).join('')}</ul>
        ${resultado.registros.map(r => (r.coleccion === 'people' ? detallePersonas(r.items) : detalleFilas(r))).join('')}` : ''}

      ${plan.cambiadas.length ? `<h3 class="pp-h">Cambian de texto <span class="pp-n">${plan.cambiadas.length}</span></h3>
        <p class="pp-ayuda">Tu fecha, tu hora y tus notas se conservan.</p>
        <ul class="pp-lista">${plan.cambiadas.map(c => `<li class="pp-tarea"><b>${esc(c.ahora.titulo)}</b><small>${esc(c.ahora.apartadoNombre || '')}</small></li>`).join('')}</ul>` : ''}

      ${plan.quitadas.length ? `<h3 class="pp-h">Ya no vienen en la hoja <span class="pp-n">${plan.quitadas.length}</span></h3>
        <p class="pp-ayuda">No se borran solas. Si quieres, las quitas tú desde Tareas.</p>
        <ul class="pp-lista">${plan.quitadas.map(t => `<li class="pp-tarea vieja"><b>${esc(t.title)}</b><small>${esc(t.origen?.apartadoNombre || '')}</small></li>`).join('')}</ul>` : ''}

      ${plan.iguales.length ? `<p class="pp-ayuda">${plan.iguales.length} ${plan.iguales.length === 1 ? 'punto ya estaba' : 'puntos ya estaban'} y no se tocan.</p>` : ''}

      ${resultado.dudas.length ? `<p class="pp-ayuda">${resultado.dudas.length} ${resultado.dudas.length === 1 ? 'renglón pasa' : 'renglones pasan'} a «Por resolver».</p>` : ''}
    </div>`,
    actions: plan.hayCambios || resultado.dudas.length || hayRegistros
      ? `<button type="button" class="btn" data-pp="inicio">Ahora no</button><button type="button" class="btn primary" data-pp="guardar" id="pp-guardar">Guardar</button>`
      : `<button type="button" class="btn primary" data-pp="inicio">Entendido</button>`,
  });
  pintarSeleccion();
}

// Las tareas, repartidas por apartado: así puedes quitar de una vez todo lo que no es de tu cargo
function grupos(nuevas) {
  const porApartado = new Map();
  nuevas.forEach(t => {
    const k = t.apartado || 'otro';
    if (!porApartado.has(k)) porApartado.set(k, { nombre: t.apartadoNombre || 'Sin apartado', tareas: [] });
    porApartado.get(k).tareas.push(t);
  });
  return [...porApartado].map(([k, g]) => `<div class="pp-grupo" data-g="${esc(k)}">
    <label class="pp-grupo-h"><input type="checkbox" data-pp="sel-grupo" data-g="${esc(k)}" checked>
      <b>${esc(g.nombre)}</b><span class="pp-n">${g.tareas.length}</span></label>
    <ul class="pp-lista">${g.tareas.map(t => `<li class="pp-tarea pp-elegible">
      <label><input type="checkbox" data-pp="sel" data-k="${esc(t.clave)}" data-g="${esc(k)}" checked>
        <span><b>${esc(t.titulo)}</b><small>${esc(t.apartadoNombre || '')}${t.due ? ` · ${esc(fmtShort(t.due))}` : ''}${t.dueTime ? ` · ${esc(fmtTime(t.dueTime))}` : ''}</small></span>
      </label></li>`).join('')}</ul>
  </div>`).join('');
}

/** Elegidas = las nuevas que no has desmarcado. */
const elegidas = () => (pendiente ? pendiente.plan.nuevas.filter(t => !pendiente.excluidas.has(t.clave)) : []);

// Repinta el contador, el botón de guardar y las casillas de cada apartado (sin volver a dibujar la hoja)
function pintarSeleccion() {
  if (!pendiente) return;
  const n = elegidas().length;
  const cuenta = document.getElementById('pp-cuenta');
  if (cuenta) cuenta.textContent = String(n);
  const btn = document.getElementById('pp-guardar');
  if (btn) {
    const otros = pendiente.plan.cambiadas.length + pendiente.resultado.dudas.length + (pendiente.conRegistros ? (pendiente.resultado.registros || []).length : 0);
    const hayTareas = pendiente.plan.nuevas.length > 0;
    btn.textContent = n ? `Guardar ${n}` : (otros ? (hayTareas ? 'Guardar el resto' : 'Guardar') : 'Guardar');
    btn.disabled = !n && !otros;
  }
  document.querySelectorAll('.pp-grupo').forEach(div => {
    const casillas = [...div.querySelectorAll('input[data-pp="sel"]')];
    const jefe = div.querySelector('input[data-pp="sel-grupo"]');
    if (!jefe || !casillas.length) return;
    const marcadas = casillas.filter(c => c.checked).length;
    jefe.checked = marcadas === casillas.length;
    jefe.indeterminate = marcadas > 0 && marcadas < casillas.length;
  });
}

// Marcar o desmarcar: solo se toca el DOM, para no perder dónde ibas leyendo
function marcar(casillas, valor) {
  if (!pendiente) return;
  casillas.forEach(c => {
    c.checked = valor;
    valor ? pendiente.excluidas.delete(c.dataset.k) : pendiente.excluidas.add(c.dataset.k);
  });
  pintarSeleccion();
}

// Lo que se va a guardar, fila por fila. Sobre todo por las fechas: en el S-3 la hoja solo dice
// «primera semana», así que la fecha la pone la app y tienes que poder verla antes de guardar.
function detalleFilas(r) {
  const fila = it => {
    if (r.coleccion === 'asistencia') return { a: `${fmtShort(it.date)} · ${it.kind === 'semana' ? 'Entre semana' : 'Fin de semana'}`, b: `${it.presencial} en el Salón · ${it.online} por videoconferencia` };
    if (r.coleccion === 'limpieza') return { a: `${fmtShort(it.date)}${it.until ? ` a ${fmtShort(it.until)}` : ''}`, b: `${it.grupoNombre || 'Sin grupo'} · ${it.tipo === 'ligera' ? 'después de la reunión' : it.tipo === 'anual' ? 'a fondo' : 'semanal'}` };
    if (r.coleccion === 'programa') return { a: fmtShort(it.date), b: `${it.parts?.length || 0} partes` };
    return null;
  };
  const filas = (r.items || []).map(fila).filter(Boolean);
  if (!filas.length) return '';
  return `<ul class="pp-lista">${filas.map(f => `<li class="pp-tarea"><b>${esc(f.a)}</b><small>${esc(f.b)}</small></li>`).join('')}</ul>`;
}

// Qué va a pasar con cada publicador, para no guardar a ciegas
function detallePersonas(items) {
  const plan = planDePersonas(items);
  const nuevos = plan.filter(x => !x.previo).length;
  const cambian = plan.filter(x => x.previo && x.cambios.length).length;
  const igual = plan.length - nuevos - cambian;
  return `<p class="pp-ayuda">${[
    nuevos ? `${nuevos} ${nuevos === 1 ? 'se crea' : 'se crean'}` : '',
    cambian ? `${cambian} ${cambian === 1 ? 'se actualiza' : 'se actualizan'}` : '',
    igual ? `${igual} ya ${igual === 1 ? 'estaba al día' : 'estaban al día'}` : '',
  ].filter(Boolean).join(' · ')}</p>
  <ul class="pp-lista">${plan.map(x => `<li class="pp-tarea${x.previo && !x.cambios.length ? ' vieja' : ''}">
    <b>${esc(x.previo?.name || x.tarjeta.nombre)}</b>
    <small>${x.previo ? (x.cambios.length ? `Se le añade: ${esc(x.cambios.join(' · '))}` : 'Ya estaba al día') : `Nuevo · ${esc([x.tarjeta.grupo, ...(x.tarjeta.privilegios || [])].filter(Boolean).join(' · ') || 'sin privilegios')}`}</small>
  </li>`).join('')}</ul>`;
}

// El día de la semana en que sueles tener cada reunión, aprendido de lo que ya tienes anotado.
// El S-3 solo dice «primera semana», «segunda»…, así que hay que saber en qué día cae.
function diaDeReunion(kind) {
  const suyos = (data.asistencia || []).filter(r => r.kind === kind && r.date);
  const cuenta = {};
  suyos.forEach(r => { const d = new Date(`${r.date}T12:00:00`).getDay(); cuenta[d] = (cuenta[d] || 0) + 1; });
  const masComun = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0];
  return masComun ? Number(masComun[0]) : (kind === 'finde' ? 0 : 3);   // si no hay nada: domingo y miércoles
}

// ───────────── Personas (las tarjetas del S-21) ─────────────
//
// La gracia es no tener que entrar uno por uno. Para eso hay que reconocer a quien ya tienes:
// se usa el mismo buscador de nombres de toda la app (js/nombres.js), que entiende «J. Pérez».
// Lo que ya tienes NO se pisa: solo se rellena lo que esté vacío y se suman los privilegios nuevos.

function grupoPorNombre(nombre) {
  if (!nombre) return '';
  const ya = data.groups.find(g => g.name.trim().toLowerCase() === nombre.trim().toLowerCase());
  if (ya) return ya.id;
  return store.upsert('groups', { id: uid(), name: nombre }).id;
}

/** Qué pasaría con cada tarjeta, sin guardar nada todavía. */
export function planDePersonas(items) {
  return items.map(t => {
    const previo = data.people.find(x => x.id === Nombres.quienEs(t.nombre).id) || null;
    const privNuevos = (t.privilegios || []).filter(x => !(previo?.privileges || []).some(y => y.toLowerCase() === x.toLowerCase()));
    const cambios = [];
    if (!previo) cambios.push('se crea');
    else {
      if (privNuevos.length) cambios.push(privNuevos.join(', '));
      if (t.sex && !previo.sex) cambios.push(t.sex === 'h' ? 'hermano' : 'hermana');
      if (t.grupo && !(previo.groupIds || []).some(id => data.groups.find(g => g.id === id)?.name === t.grupo)) cambios.push(t.grupo);
    }
    return { tarjeta: t, previo, privNuevos, cambios };
  });
}

function guardarPersonas(items) {
  let nuevos = 0;
  let cambiados = 0;
  planDePersonas(items).forEach(({ tarjeta: t, previo, privNuevos, cambios }) => {
    if (previo && !cambios.length) return;              // ya estaba todo: no se toca
    const gid = t.grupo ? grupoPorNombre(t.grupo) : '';
    const grupos = [...new Set([...(previo?.groupIds || []), ...(gid ? [gid] : [])])];
    store.upsert('people', {
      ...(previo || { id: uid(), role: '', photo: '', phone: '', address: '', notes: '', aliases: '' }),
      name: previo?.name || t.nombre,                   // si ya lo tenías escrito a tu manera, se respeta
      sex: previo?.sex || t.sex || '',
      privileges: [...(previo?.privileges || []), ...privNuevos],
      groupIds: grupos,
    });
    previo ? cambiados++ : nuevos++;
  });
  return { nuevos, cambiados };
}

// ───────────── Guardar ─────────────

function guardarPlan() {
  if (!pendiente) return;
  const { papel, resultado, plan } = pendiente;
  const quiero = elegidas();   // solo las que dejaste marcadas

  quiero.forEach(t => store.upsert('tasks', aTarea(t, papel.id, resultado.periodo, null, uid())));
  plan.cambiadas.forEach(({ antes, ahora }) => store.upsert('tasks', aTarea(ahora, papel.id, resultado.periodo, antes)));

  // Lo que el papel guarda aparte (el programa de las reuniones, por ejemplo)
  let nRegistros = 0;
  let personas = null;
  if (pendiente.conRegistros) {
    (resultado.registros || []).forEach(r => {
      if (r.coleccion === 'people') { personas = guardarPersonas(r.items || []); nRegistros += personas.nuevos + personas.cambiados; return; }
      if (r.coleccion === 'limpieza') {
        (r.items || []).forEach(({ grupoNombre, ...turno }) => {
          const gid = turno.groupId || (grupoNombre ? grupoPorNombre(grupoNombre) : '');
          store.upsert('limpieza', { ...(store.get('limpieza', turno.id) || {}), ...turno, groupId: gid });
          nRegistros++;
        });
        return;
      }
      (r.items || []).forEach(item => {
      const previo = item.date ? data[r.coleccion]?.find(x => x.date === item.date && x.kind === item.kind) : null;
      store.upsert(r.coleccion, { ...(previo || {}), ...item, id: previo?.id || item.id || uid() });
      nRegistros++;
    });
    });
  }

  guardar(v => ({ cargas: { ...v.cargas, [`${papel.id}:${resultado.periodo}`]: { titulo: resultado.titulo, fecha: today() } } }));
  // Lo que no se entendió va a la bandeja común, la misma que usan los demás importadores
  const apartados = PR.anotar(papel.id, resultado.dudas);

  const creadas = quiero.length;
  const fuera = plan.nuevas.length - creadas;
  if (!creadas && personas) {
    pendiente = null;
    const partes = [personas.nuevos ? `${personas.nuevos} ${personas.nuevos === 1 ? 'publicador nuevo' : 'publicadores nuevos'}` : '', personas.cambiados ? `${personas.cambiados} al día` : ''].filter(Boolean);
    toast(partes.length ? `Guardado: ${partes.join(' y ')}` : 'Ya estaban todos al día');
    refrescar(); abrir(); return;
  }
  if (!creadas && nRegistros) { pendiente = null; toast(`Guardado: ${nRegistros} ${nRegistros === 1 ? 'semana' : 'semanas'}${apartados ? ` · ${apartados} por resolver` : ''}`); refrescar(); abrir(); return; }
  toast(creadas
    ? `${creadas} ${creadas === 1 ? 'tarea creada' : 'tareas creadas'}${fuera ? ` · ${fuera} que desmarcaste se quedan fuera` : ''}${apartados ? ` · ${apartados} por resolver` : ''}`
    : (fuera ? 'No creé ninguna: las desmarcaste todas' : 'Todo quedó al día'));
  pendiente = null;
  refrescar();
  abrir();
}

// ───────────── Pegar el texto a mano ─────────────

function pegar() {
  S.open({
    title: `${ICONO} Pegar el texto`,
    body: `<div class="pp">
      <p class="pp-ayuda">Copia el contenido de la hoja y pégalo aquí, con un punto por renglón.</p>
      <textarea id="pp-texto" class="pp-texto" rows="12" placeholder="1. Recuerden que…"></textarea>
    </div>`,
    actions: `<button type="button" class="btn" data-pp="inicio">Cancelar</button><button type="button" class="btn primary" data-pp="leer-texto">Leer</button>`,
    focus: '#pp-texto',
  });
}

// ───────────── «Por resolver» ─────────────

function dudaATarea(id) {
  const d = PR.resolver(id);
  if (!d) return;
  store.upsert('tasks', {
    id: uid(), title: d.texto.slice(0, 90), kind: 'otro', personId: '', companionId: '',
    due: '', dueTime: '', status: 'pendiente', notes: d.texto, responsibleIds: [], responsibles: [],
    mine: true, deptId: '', priority: 'normal', log: [], repeat: '', doneAt: '',
  });
  toast('Hecha tarea', 'Deshacer', () => { PR.devolver(d); abrir(); });
  abrir();
}

function descartarDuda(id) {
  const d = PR.resolver(id);
  if (!d) return;
  toast('Descartado', 'Deshacer', () => { PR.devolver(d); abrir(); });
  abrir();
}

// ───────────── Ajustes y ayuda ─────────────

function ajustes() {
  const c = cfg();
  S.open({
    title: `${ICONO} Ajustes de ${NOMBRE}`,
    body: `<div class="pp">
      <label class="check"><input type="checkbox" id="pp-hoy" ${c.showHoy ? 'checked' : ''}> Mostrar la tarjeta 📄 en Hoy</label>
      <label class="check"><input type="checkbox" id="pp-hide" ${c.hidden ? 'checked' : ''}> Esconder el módulo del menú</label>
      <p class="pp-ayuda">Esconderlo no borra nada: las tareas que ya cargaste siguen en su sitio.</p>
    </div>`,
    actions: `<button type="button" class="btn" data-pp="inicio">Cancelar</button><button type="button" class="btn primary" data-pp="ajustes-ok">Guardar</button>`,
  });
}

function ayuda() {
  S.open({
    title: `${ICONO} ¿Cómo funciona?`,
    body: `<div class="pp pp-ayuda-larga">
      <p><b>1.</b> Subes el PDF del mes (por ahora, el S-147 «Anuncios y recordatorios»).</p>
      <p><b>2.</b> La app lo lee dentro de tu teléfono. Si es un escaneo o una foto, lo lee letra por letra.</p>
      <p><b>3.</b> Te enseña lo que encontró antes de guardar nada. Tú decides.</p>
      <p><b>4.</b> Cada punto se convierte en una tarea normal de la Agenda, con su fecha y su hora si la hoja las traía.</p>
      <p><b>5.</b> Si vuelves a subir la misma hoja, no se duplica: se compara y se te dice qué cambió.</p>
      <h3 class="pp-h">Lo que es tuyo, no se toca</h3>
      <p>La hoja solo manda en el texto del punto. La fecha que tú pusiste, la hora, el responsable, el estado y tus notas se respetan siempre.</p>
      <h3 class="pp-h">Lo que no se entiende, no se pierde</h3>
      <p>Va a «Por resolver», para que lo mires con calma.</p>
    </div>`,
    actions: `<button type="button" class="btn primary" data-pp="inicio">Entendido</button>`,
  });
}

// ───────────── Clics ─────────────

document.addEventListener('click', async e => {
  const b = e.target.closest?.('[data-pp]');
  if (!b) return;
  e.preventDefault();
  const id = b.dataset.id || '';
  try {
    switch (b.dataset.pp) {
      case 'inicio': abrir(); break;
      case 'elegir': elegirArchivo(); break;
      case 'guardar': guardarPlan(); break;
      case 'pegar': pegar(); break;
      case 'leer-texto': {
        const t = document.getElementById('pp-texto')?.value || '';
        if (!t.trim()) { toast('Pega primero el texto'); return; }
        await revisar(desdeTexto(t), 'texto');
        break;
      }
      case 'duda-tarea': dudaATarea(id); break;
      case 'duda-no': descartarDuda(id); break;
      case 'ajustes': ajustes(); break;
      case 'ajustes-ok':
        guardar({ showHoy: document.getElementById('pp-hoy').checked, hidden: document.getElementById('pp-hide').checked });
        refrescar();
        abrir();
        break;
      case 'ayuda': ayuda(); break;
      case 'sel-todas': marcar([...document.querySelectorAll('input[data-pp="sel"]')], true); break;
      case 'sel-reg': break;   // lo maneja el 'change'
      case 'sel-ninguna': marcar([...document.querySelectorAll('input[data-pp="sel"]')], false); break;
    }
  } catch (err) {
    console.warn('📄 Papeles:', err);
    toast('Algo no salió bien');
  }
});

document.addEventListener('change', e => {
  const c = e.target;
  if (!c?.matches?.('input[data-pp="sel"], input[data-pp="sel-grupo"], input[data-pp="sel-reg"]')) return;
  if (c.dataset.pp === 'sel-reg') { pendiente && (pendiente.conRegistros = c.checked); pintarSeleccion(); return; }
  if (c.dataset.pp === 'sel') marcar([c], c.checked);
  else marcar([...document.querySelectorAll(`input[data-pp="sel"][data-g="${CSS.escape(c.dataset.g)}"]`)], c.checked);
});

// ───────────── Tarjeta en «Hoy» ─────────────

function tarjetaHoy() {
  const c = cfg();
  if (!c.showHoy) return '';
  const periodo = mesActual();
  const carga = c.cargas[`s147:${periodo}`];
  const dudas = PR.contar('s147');

  let main;
  let sub;
  if (!carga) {
    main = `Aún no has cargado el S-147 de ${nombreMes(periodo).toLowerCase()}`;
    sub = 'Súbelo y te saco las tareas del mes.';
  } else {
    const tareas = tareasDe('s147', periodo);
    const pend = tareas.filter(t => t.status !== 'hecha');
    const prox = pend.filter(t => t.due && t.due >= today()).sort((a, b) => a.due.localeCompare(b.due))[0];
    if (!pend.length) { main = `El S-147 de ${nombreMes(periodo).toLowerCase()}, al día`; sub = 'No te queda nada pendiente de la hoja.'; }
    else {
      main = `${pend.length} ${pend.length === 1 ? 'tarea' : 'tareas'} del S-147 sin hacer`;
      sub = prox ? `La próxima: ${prox.title.slice(0, 48)} · ${fmtShort(prox.due)}` : 'Ninguna tiene fecha todavía.';
    }
  }
  if (dudas) sub += ` · ${dudas} por resolver`;

  return `<button type="button" class="log-now pp-hoy" data-mod="${ID}" data-sub="cargar">${ICONO} <span><b>${esc(main)}</b><small>${esc(sub)}</small></span></button>`;
}

// ───────────── Conectar el módulo ─────────────

// El tablero de anuncios (y quien quiera) puede preguntar si un archivo es un papel conocido.
// Si borras este módulo, el hueco se queda vacío y la app sigue igual, solo que sin ofrecer la lectura.
registrarLector(async (file, pista = '') => {
  const { lineas, como } = await leer(file);
  const hallado = await reconocer(lineas, pista);
  if (!hallado) return null;
  return { nombre: hallado.papel.nombre, leer: () => revisar(lineas, como) };
});

registrarModulo({
  id: ID,
  nombre: NOMBRE,
  icono: ICONO,
  feature: FEATURE,
  css: new URL('./papeles.css', import.meta.url).href,
  abrir,
  tarjetaHoy,
  seccion: 'congregacion',   // vive dentro de Congregación, no ocupa una pestaña propia
  resumenSeccion() {
    const periodo = mesActual();
    const cargado = cfg().cargas[`s147:${periodo}`];
    const dudas = PR.contar('s147');
    return `${cargado ? `S-147 de ${nombreMes(periodo).toLowerCase()} cargado` : `Falta cargar el S-147 de ${nombreMes(periodo).toLowerCase()}`}${dudas ? ` · ${dudas} por resolver` : ''}`;
  },
  oculto: () => cfg().hidden,
});
