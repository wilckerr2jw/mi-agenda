// 🧩 Núcleo de módulos · el enchufe donde se conecta cada función suelta de Mi Agenda
//
// Para qué sirve:
//   Cada función de la app puede vivir en su propia carpeta dentro de `modulos/`, sin tocar
//   ni un archivo del resto. Si mañana quieres dejar de ver una función, borras su carpeta
//   y su línea en index.html. Nada más se entera.
//
// Cómo se usa (desde el archivo del módulo):
//
//   import { registrarModulo } from '../_nucleo.js';
//   registrarModulo({
//     id: 'papeles',
//     nombre: 'Papeles',
//     icono: '📄',
//     feature: 'general.papeles',                       // id de js/perms.js (opcional)
//     css: new URL('./papeles.css', import.meta.url).href,
//     abrir(sub) { ... },                               // dibuja la pantalla del módulo
//     tarjetaHoy() { return '<button …>' },             // opcional: tarjeta en «Hoy»
//     seccion: 'congregacion',                          // opcional: vive DENTRO de esa sección,
//     resumenSeccion() { return '3 sin cargar' },       //   sin pestaña propia, como una tarjeta más
//     oculto() { return false },                        // opcional: el usuario lo apagó
//   });
//
// Dónde aparece solo:
//   · En «Más» (teléfono) y en el menú de la izquierda (computadora).
//   · En «Hoy», si el módulo devuelve una tarjeta.
//   · En la dirección `#/<id>` del navegador.
//
// Garantía: si un módulo da error, se desconecta él solo y el resto de la app sigue igual.

import * as store from '../js/store.js';
import * as M from '../js/model.js';

const MODS = new Map();
const ERR = new Set();          // módulos que fallaron: no se vuelven a llamar

// Llama a una función del módulo sin que un error suyo tumbe la app
function seguro(mod, fn, ...args) {
  if (ERR.has(mod.id)) return undefined;
  try {
    return fn.apply(mod, args);
  } catch (err) {
    ERR.add(mod.id);
    console.warn(`🧩 El módulo «${mod.nombre}» se desconectó por un error:`, err);
    quitarDelMenu(mod);
    return undefined;
  }
}

// ¿Esta cuenta puede ver el módulo, y el usuario no lo ha escondido?
function visible(mod) {
  if (ERR.has(mod.id)) return false;
  if (mod.feature && !M.featureOn(mod.feature)) return false;
  return seguro(mod, mod.oculto) !== true;
}

const pill = mod => `<span class="pill">${mod.icono}</span><span>${mod.nombre}</span>`;

function quitarDelMenu(mod) {
  document.querySelectorAll(`[data-mod="${mod.id}"]`).forEach(n => n.remove());
}

// ───────────── Los tres sitios donde se enchufa ─────────────

// 1) Menú «Más» (teléfono). Los módulos que viven dentro de una sección no salen aquí.
function enMas(mod) {
  if (mod.seccion) return;
  const list = document.querySelector('#sheet-root .more-list');
  if (!list) return;
  const ya = list.querySelector(`[data-mod="${mod.id}"]`);
  if (!visible(mod)) { ya?.remove(); return; }
  if (ya) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'more-item';
  b.dataset.mod = mod.id;
  b.innerHTML = pill(mod);
  const anchor = list.querySelector('[data-a="search"]');
  anchor ? list.insertBefore(b, anchor) : list.append(b);
}

// 2) Menú de la izquierda (computadora). Igual: los de dentro de una sección no ponen pestaña.
function enLado(mod) {
  if (mod.seccion) return;
  const tabs = document.getElementById('tabs');
  if (!tabs) return;
  const ya = tabs.querySelector(`.tab[data-mod="${mod.id}"]`);
  if (!visible(mod)) { ya?.remove(); return; }
  if (ya) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tab';
  b.dataset.mod = mod.id;
  b.innerHTML = pill(mod);
  tabs.insertBefore(b, tabs.querySelector('.tab-more'));
}

// 3) Tarjeta en «Hoy»
function enHoy(mod) {
  if (!mod.tarjetaHoy) return;
  const view = document.getElementById('view');
  if (!view) return;
  const ya = view.querySelector(`[data-mod-card="${mod.id}"]`);
  const enInicio = !location.hash || /^#\/?hoy$/.test(location.hash);
  if (!visible(mod) || !enInicio || !view.querySelector('.hero')) { ya?.remove(); return; }
  const html = seguro(mod, mod.tarjetaHoy);
  if (!html) { ya?.remove(); return; }
  const marcado = html.replace(/^(\s*<[a-z]+)/i, `$1 data-mod-card="${mod.id}"`);
  if (ya) { ya.outerHTML = marcado; return; }
  const anchor = view.querySelector('.tiles') || view.querySelector('.hero');
  anchor.insertAdjacentHTML('afterend', marcado);
}

// 4) Dentro de una sección de la app (Congregación, Informe…), como una tarjeta más.
// Así una función puede vivir donde le toca por tema, sin ocupar una pestaña propia.
const rutaActual = () => (location.hash.match(/^#\/?([a-z0-9_-]+)/i) || [, 'hoy'])[1].toLowerCase();

function enSeccion(mod) {
  if (!mod.seccion) return;
  const view = document.getElementById('view');
  if (!view) return;
  const ya = view.querySelector(`[data-mod-sec="${mod.id}"]`);
  if (!visible(mod) || rutaActual() !== mod.seccion) { ya?.remove(); return; }
  const resumen = seguro(mod, mod.resumenSeccion) || '';
  const html = `<section class="csec-wrap" data-mod-sec="${mod.id}">
    <button type="button" class="card mini mod-card" data-mod="${mod.id}">
      <strong>${mod.icono} ${mod.nombre}</strong>
      ${resumen ? `<span class="meta">${resumen}</span>` : ''}
    </button>
  </section>`;
  if (ya) { ya.outerHTML = html; return; }
  view.insertAdjacentHTML('beforeend', html);
}

// ───────────── Repintado ─────────────

let pedido = false;
function repintar() {
  if (pedido) return;
  pedido = true;
  requestAnimationFrame(() => {
    pedido = false;
    MODS.forEach(mod => { enMas(mod); enLado(mod); enHoy(mod); enSeccion(mod); });
  });
}

/** Un módulo pide que se vuelva a dibujar su tarjeta de «Hoy» y su entrada del menú. */
export const refrescar = repintar;

// ───────────── Arranque (una sola vez, con el primer módulo) ─────────────

let arrancado = false;
function arrancar() {
  if (arrancado) return;
  arrancado = true;

  // Abrir el módulo al tocar su entrada en cualquiera de los menús o en su tarjeta
  document.addEventListener('click', e => {
    const b = e.target.closest?.('[data-mod]');
    if (!b) return;
    const mod = MODS.get(b.dataset.mod);
    if (!mod || !visible(mod)) return;
    e.preventDefault();
    seguro(mod, mod.abrir, b.dataset.sub || '');
  });

  // Dirección del navegador: #/papeles
  const porHash = () => {
    const id = (location.hash.match(/^#\/?([a-z0-9_-]+)/i) || [])[1];
    const mod = id && MODS.get(id);
    if (mod && visible(mod)) seguro(mod, mod.abrir, '');
  };
  window.addEventListener('hashchange', () => { porHash(); repintar(); });

  const obs = new MutationObserver(repintar);
  ['view', 'sheet-root', 'tabs'].forEach(id => {
    const n = document.getElementById(id);
    if (n) obs.observe(n, { childList: true });
  });
  store.onData(repintar);

  // Al abrir la app directamente en #/<id>, se espera a que la sesión cargue
  setTimeout(porHash, 1200);
  repintar();
}

// ───────────── Registro ─────────────

/**
 * Conecta un módulo a la app.
 * @returns {{ refrescar: () => void, desconectar: () => void }}
 */
export function registrarModulo(def) {
  if (!def?.id || !def.nombre || typeof def.abrir !== 'function') {
    console.warn('🧩 Módulo mal declarado (hace falta id, nombre y abrir):', def);
    return { refrescar() {}, desconectar() {} };
  }
  if (MODS.has(def.id)) {
    console.warn(`🧩 Ya había un módulo llamado «${def.id}»; se queda el primero.`);
    return { refrescar: repintar, desconectar() {} };
  }

  const mod = { icono: '🧩', oculto: () => false, ...def };
  MODS.set(mod.id, mod);

  if (mod.css && !document.querySelector(`link[href="${mod.css}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = mod.css;
    document.head.append(link);
  }

  arrancar();
  repintar();

  return {
    refrescar: repintar,
    desconectar() { MODS.delete(mod.id); quitarDelMenu(mod); repintar(); },
  };
}

/** Lista de los módulos conectados ahora mismo (para los ajustes y para depurar). */
export const modulos = () => [...MODS.values()].map(m => ({ id: m.id, nombre: m.nombre, icono: m.icono, visible: visible(m) }));
