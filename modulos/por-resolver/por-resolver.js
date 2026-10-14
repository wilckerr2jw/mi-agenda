// 🗂 Por resolver · módulo aparte (no cambia ningún archivo de la app)
//
// Para activarlo:  una línea en index.html →  <script type="module" src="modulos/por-resolver/por-resolver.js"></script>
// Para quitarlo:   se borra esa línea y la carpeta modulos/por-resolver.
//                  Ojo: lo que las importaciones aparten se SIGUE guardando (en `profile.porResolver`);
//                  lo único que pierdes es la pantalla para mirarlo. Nada se borra.
//
// Qué hace:
//   Enseña lo que las importaciones no supieron entender, para que lo arregles a mano. La bandeja en
//   sí vive en `js/por-resolver.js`, porque la usan archivos del núcleo (la limpieza, el programa…)
//   y un módulo nunca puede ser de quien dependan ellos.

import { registrarModulo, refrescar } from '../_nucleo.js';
import * as PR from '../../js/por-resolver.js';
import * as store from '../../js/store.js';
import * as S from '../../js/sheets.js';
import { esc, uid, today, toast, fmtShort } from '../../js/util.js';

const ID = 'por-resolver';
const NOMBRE = 'Por resolver';
const ICONO = '🗂';
const FEATURE = 'general.porresolver';

let filtro = '';   // origen que se está mirando ('' = todos)

// ───────────── Pantalla ─────────────

function abrir() {
  const todos = PR.lista();
  const porOrigen = PR.porOrigen();
  const vistos = filtro && porOrigen[filtro] ? PR.lista(filtro) : (filtro = '', todos);

  const chip = (id, n, activo) => `<button type="button" class="btn small ${activo ? 'primary' : 'ghost'}" data-pr="filtro" data-v="${esc(id)}">${esc(n)}</button>`;

  const body = `<div class="pr2">
    ${!todos.length ? `<p class="pr2-vacio">✓ No hay nada por resolver.</p>
      <p class="pr2-ayuda">Cuando subas un papel o pegues un programa y alguna línea no se entienda, aparecerá aquí en vez de perderse.</p>`
    : `<p class="pr2-resumen"><b>${todos.length === 1 ? 'Queda 1 línea por resolver' : `Quedan ${todos.length} líneas por resolver`}</b></p>
      ${Object.keys(porOrigen).length > 1 ? `<div class="pr2-chips">${chip('', `Todas (${todos.length})`, !filtro)}${Object.entries(porOrigen).map(([k, n]) => chip(k, `${PR.nombreOrigen(k)} (${n})`, filtro === k)).join('')}</div>` : ''}
      <ul class="pr2-lista">${vistos.map(fila).join('')}</ul>
      <div class="pr2-foot"><button type="button" class="btn small ghost danger" data-pr="vaciar" data-v="${esc(filtro)}">Descartar ${filtro ? `las de ${esc(PR.nombreOrigen(filtro))}` : 'todas'}</button></div>`}
  </div>`;

  S.open({ title: `${ICONO} ${NOMBRE}`, body });
}

const fila = x => `<li class="pr2-item">
  <span class="pr2-de">${esc(PR.nombreOrigen(x.de))} · ${esc(fmtShort(x.fecha))}</span>
  <b>${esc(x.texto)}</b>
  ${x.porque ? `<small>${esc(x.porque)}</small>` : ''}
  <span class="pr2-acc">
    <button type="button" class="link" data-pr="tarea" data-id="${esc(x.id)}">Hacerla tarea</button>
    <button type="button" class="link" data-pr="copiar" data-id="${esc(x.id)}">Copiar</button>
    <button type="button" class="link" data-pr="no" data-id="${esc(x.id)}">Descartar</button>
  </span>
</li>`;

// ───────────── Acciones ─────────────

function aTarea(id) {
  const x = PR.resolver(id);
  if (!x) return;
  store.upsert('tasks', {
    id: uid(), title: x.texto.slice(0, 90), kind: 'otro', personId: '', companionId: '',
    due: '', dueTime: '', status: 'pendiente', notes: `${x.texto}\n\n(De ${PR.nombreOrigen(x.de)}: ${x.porque || 'no se pudo leer solo'})`,
    responsibleIds: [], responsibles: [], mine: true, deptId: '', priority: 'normal', log: [], repeat: '', doneAt: '',
  });
  toast('Hecha tarea', 'Deshacer', () => PR.devolver(x));
  refrescar();
  abrir();
}

function descartar(id) {
  const x = PR.resolver(id);
  if (!x) return;
  toast('Descartado', 'Deshacer', () => { PR.devolver(x); refrescar(); abrir(); });
  refrescar();
  abrir();
}

function vaciar(de) {
  const fuera = PR.vaciar(de);
  if (!fuera.length) return;
  toast(`${fuera.length} ${fuera.length === 1 ? 'descartada' : 'descartadas'}`, 'Deshacer', () => { fuera.forEach(PR.devolver); refrescar(); abrir(); });
  refrescar();
  abrir();
}

document.addEventListener('click', async e => {
  const b = e.target.closest?.('[data-pr]');
  if (!b) return;
  e.preventDefault();
  try {
    switch (b.dataset.pr) {
      case 'filtro': filtro = b.dataset.v || ''; abrir(); break;
      case 'tarea': aTarea(b.dataset.id); break;
      case 'no': descartar(b.dataset.id); break;
      case 'vaciar': vaciar(b.dataset.v || ''); break;
      case 'copiar': {
        const x = PR.lista().find(a => a.id === b.dataset.id);
        if (x) { const { copyText } = await import('../../js/util.js'); await copyText(x.texto); }
        break;
      }
    }
  } catch (err) {
    console.warn('🗂 Por resolver:', err);
    toast('Algo no salió bien');
  }
});

// ───────────── Tarjeta en «Hoy» ─────────────

function tarjetaHoy() {
  const n = PR.contar();
  if (!n) return '';
  const de = Object.keys(PR.porOrigen()).map(PR.nombreOrigen);
  return `<button type="button" class="log-now pr2-hoy" data-mod="${ID}">${ICONO} <span>
    <b>${esc(n === 1 ? '1 línea quedó por resolver' : `${n} líneas quedaron por resolver`)}</b>
    <small>${esc(`De ${de.slice(0, 2).join(' y ')}${de.length > 2 ? '…' : ''}. Tócalo para arreglarlas.`)}</small>
  </span></button>`;
}

// ───────────── Conectar el módulo ─────────────

registrarModulo({
  id: ID,
  nombre: NOMBRE,
  icono: ICONO,
  feature: FEATURE,
  css: new URL('./por-resolver.css', import.meta.url).href,
  abrir,
  tarjetaHoy,
  seccion: 'congregacion',   // vive dentro de Congregación, junto a Papeles
  resumenSeccion() {
    const n = PR.contar();
    if (!n) return 'Nada pendiente';
    const de = Object.keys(PR.porOrigen()).map(PR.nombreOrigen);
    return `${n} ${n === 1 ? 'línea' : 'líneas'} de ${de.slice(0, 2).join(' y ')}${de.length > 2 ? '…' : ''}`;
  },
});
