// Deslizar una tarea en la lista: a la derecha la marcas hecha, a la izquierda la pasas a mañana.
// Para no tener que abrirla ni apuntar al circulito.
//
// No toca el HTML de las tareas: se engancha por el documento a los .row.task que ya existen,
// así que sirve igual para las de Hoy, las de Tareas y las de cualquier módulo que use taskRow.
// Tampoco decide qué pasa al soltar: avisa con el evento «tarea-deslizada» y quien lo escuche verá.
//
// Lo que NO se puede deslizar: las que ya están hechas (no hay nada que hacerles) y las que te
// compartió otra cuenta (ahí el circulito está al lado y lo demás no es tuyo).

const UMBRAL = 88;      // cuánto hay que arrastrar para que cuente
const TOPE = 140;       // más allá de esto la tarjeta ya no sigue al dedo
const ARRANQUE = 12;    // hasta aquí no se decide si quieres deslizar o rodar la página

export const GESTOS = {
  derecha: { a: 'hecha', t: '✓ Hecha', c: 'var(--ok, var(--primary))' },
  izquierda: { a: 'manana', t: 'Mañana →', c: 'var(--warn)' },
};

let act = null;   // { row, x0, y0, eje: ''|'x'|'y', dx }

const tareaDe = el => el?.closest?.('.row.task:not(.is-done):not(.shared-in)');
// El circulito y el asa de arrastrar tienen lo suyo: ahí no empezamos a deslizar
const zonaViva = el => el?.closest?.('.chk, .drag, [draggable="true"]');

// El letrero («✓ Hecha», «Mañana →») es un elemento de verdad, no un ::after de la fila:
// esas filas no dejan pintar sus pseudoelementos, y así además se coloca justo en el hueco.
let pista = null;
function letrero() {
  if (!pista || !pista.isConnected) {
    pista = document.createElement('div');
    pista.className = 'deslizar-pista';
    pista.setAttribute('aria-hidden', 'true');
    document.body.append(pista);
  }
  return pista;
}

function pintar(row, dx) {
  const g = dx > 0 ? GESTOS.derecha : GESTOS.izquierda;
  const listo = Math.abs(dx) >= UMBRAL;
  row.style.setProperty('--dx', `${dx}px`);
  row.style.setProperty('--gesto-c', g.c);
  row.classList.toggle('va-a-soltar', listo);
  // El hueco que deja la fila al correrse: a un lado o al otro, según hacia dónde vaya
  const r = row.getBoundingClientRect();
  const el = letrero();
  el.textContent = g.t;
  el.classList.toggle('listo', listo);
  el.style.cssText = `left:${(dx > 0 ? r.left - dx : r.right).toFixed(1)}px;top:${r.top.toFixed(1)}px;`
    + `width:${Math.abs(dx).toFixed(1)}px;height:${r.height.toFixed(1)}px;--gesto-c:${g.c};`;
}

function limpiar(row) {
  row.classList.remove('deslizando', 'va-a-soltar');
  row.style.removeProperty('--dx');
  row.style.removeProperty('--gesto-c');
  if (pista) { pista.remove(); pista = null; }
}

function abajo(e) {
  // Un toque nuevo manda sobre el anterior: si el de antes se quedó a medias (porque la
  // pantalla se repintó mientras arrastrabas), se suelta aquí y no bloquea los siguientes.
  if (act) { limpiar(act.row); act = null; }
  if (e.button > 0 || !e.isPrimary) return;
  const row = tareaDe(e.target);
  if (!row || zonaViva(e.target)) return;
  const id = row.querySelector('[data-a="toggle-task"]')?.dataset.id;
  if (!id) return;
  act = { row, id, x0: e.clientX, y0: e.clientY, eje: '', dx: 0 };
}

function mover(e) {
  if (!act) return;
  if (!act.row.isConnected) { limpiar(act.row); act = null; return; }   // se repintó la lista debajo del dedo
  const dx = e.clientX - act.x0, dy = e.clientY - act.y0;
  if (!act.eje) {
    if (Math.abs(dx) < ARRANQUE && Math.abs(dy) < ARRANQUE) return;
    act.eje = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (act.eje === 'y') { act = null; return; }           // querías rodar la página
    act.row.classList.add('deslizando');
    act.row.setPointerCapture?.(e.pointerId);
  }
  // Pasado el tope, el dedo sigue pero la tarjeta casi no: se nota que ya no hace falta más
  const s = Math.sign(dx), n = Math.abs(dx);
  act.dx = s * (n <= TOPE ? n : TOPE + (n - TOPE) * 0.12);
  pintar(act.row, act.dx);
  e.preventDefault();
}

function arriba() {
  if (!act) return;
  const { row, id, dx, eje } = act;
  act = null;
  limpiar(row);   // siempre, lo primero: aunque la fila ya no esté, el letrero hay que quitarlo
  if (eje !== 'x' || !row.isConnected || Math.abs(dx) < UMBRAL) return;
  const hacia = dx > 0 ? 'derecha' : 'izquierda';
  document.dispatchEvent(new CustomEvent('tarea-deslizada', { detail: { id, hacia, accion: GESTOS[hacia].a } }));
}

export function empezar() {
  if (typeof document === 'undefined') return;
  document.addEventListener('pointerdown', abajo, { passive: true });
  document.addEventListener('pointermove', mover, { passive: false });
  document.addEventListener('pointerup', arriba);
  document.addEventListener('pointercancel', arriba);
}
