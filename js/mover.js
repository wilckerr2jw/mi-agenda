// Tareas por departamento: mover una tarea de un departamento a otro.
//  · Con el dedo o el ratón: tomar la tarea por ⠿ y arrastrarla la tarea hasta el departamento (también a uno cerrado).
//  · Tocar ⠿ sin arrastrar (o Enter con el teclado) abre «Mover a…» con la lista de departamentos.
// Cerca del borde de arriba o de abajo la pantalla se desplaza sola, para llegar a los departamentos que no se ven.
import * as store from './store.js';
import * as M from './model.js';
import { toast } from './util.js';

const START_PX = 6;     // cuánto hay que mover para que empiece a arrastrar
const EDGE_TOP = 90;    // zona de arriba que desplaza hacia arriba
const EDGE_BOT = 150;   // zona de abajo (la barra de pestañas tapa ~70 px)

let drag = null;
let skipClick = false;

// Cambia el departamento de la tarea y ofrece «Deshacer»
export function moveTask(id, deptId, onMoved) {
  const t = store.get('tasks', id);
  if (!t) return;
  const next = M.taskMovedTo(t, deptId);
  if (!next) return;
  onMoved?.(deptId || '__none');
  store.upsert('tasks', next);
  const name = deptId ? M.taskDept(next)?.name || 'el departamento' : 'Sin departamento';
  toast(`«${t.title}» pasó a ${name}`, 'Deshacer', () => store.upsert('tasks', t));
}

const groupAt = (x, y) => document.elementFromPoint(x, y)?.closest?.('details.tgroup.dept') || null;

function start() {
  const r = drag.item.getBoundingClientRect();
  const g = drag.item.cloneNode(true);
  g.classList.add('tdrag-ghost');
  g.setAttribute('aria-hidden', 'true');
  g.style.width = `${r.width}px`;
  document.body.appendChild(g);
  Object.assign(drag, { active: true, ghost: g, dx: drag.x - r.left, dy: drag.y - r.top, from: drag.item.closest('details.tgroup.dept') });
  drag.item.classList.add('is-dragging');
  document.body.classList.add('tdragging');
  navigator.vibrate?.(15);
  scrollLoop();
}

function move(x, y) {
  Object.assign(drag, { cx: x, cy: y });
  drag.ghost.style.transform = `translate(${x - drag.dx}px, ${y - drag.dy}px)`;
  const g = groupAt(x, y);
  if (g !== drag.over) {
    drag.over?.classList.remove('drop-on');
    if (g && g !== drag.from) g.classList.add('drop-on');
    drag.over = g;
  }
}

// Desplaza la página mientras el dedo esté cerca del borde
function scrollLoop() {
  if (!drag?.active) return;
  const y = drag.cy ?? drag.y, h = window.innerHeight;
  // Solo hacia donde vas: si tomas una tarea que ya está cerca del borde, no se desplaza hasta que la lleves hacia allá
  const up = y < drag.y - 30, down = y > drag.y + 30;
  const v = up && y < EDGE_TOP ? -Math.ceil((EDGE_TOP - y) / 6) : down && y > h - EDGE_BOT ? Math.ceil((y - (h - EDGE_BOT)) / 8) : 0;
  if (v) { window.scrollBy(0, v); move(drag.cx ?? drag.x, y); }
  requestAnimationFrame(scrollLoop);
}

function finish(ok, onMoved) {
  const d = drag; drag = null;
  if (!d) return;
  if (!d.active) return;   // fue un toque: el «click» abre «Mover a…»
  skipClick = true; setTimeout(() => { skipClick = false; }, 400);
  d.ghost?.remove();
  d.item.classList.remove('is-dragging');
  d.over?.classList.remove('drop-on');
  document.body.classList.remove('tdragging');
  if (ok && d.over && d.over !== d.from) moveTask(d.id, d.over.dataset.k === '__none' ? '' : d.over.dataset.k, onMoved);
}

// onMoved(clave del departamento): para abrir el departamento si estaba cerrado
export function initTaskDrag(onMoved) {
  document.addEventListener('pointerdown', e => {
    const h = e.target.closest?.('.tdrag');
    if (!h || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const item = h.closest('.row.task, .tcard');
    if (!item) return;
    e.preventDefault();
    drag = { id: h.dataset.id, item, x: e.clientX, y: e.clientY, active: false };
    try { h.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
  });
  document.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.active && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > START_PX) start();
    if (drag.active) { e.preventDefault(); move(e.clientX, e.clientY); }
  }, { passive: false });
  document.addEventListener('pointerup', () => finish(true, onMoved));
  document.addEventListener('pointercancel', () => finish(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && drag?.active) finish(false); });
  // Después de arrastrar no se abre «Mover a…» ni la tarea
  document.addEventListener('click', e => { if (skipClick) { skipClick = false; e.stopPropagation(); e.preventDefault(); } }, true);
  document.addEventListener('contextmenu', e => { if (e.target.closest?.('.tdrag')) e.preventDefault(); });
}
