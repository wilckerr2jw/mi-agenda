// Recorrido guiado: globos que señalan las partes principales de la pantalla, con «Atrás» y «Siguiente».
// Solo muestra lo que existe en pantalla (las secciones ocultas en Ajustes se saltan) y adapta los textos al perfil.
//
// MANTENERLO AL DÍA: si cambia algo que el usuario ve en Hoy, la barra de abajo o los botones de arriba,
// ajustar aquí el paso correspondiente (y las guías: js/guide.js y guia.html).

import * as M from './model.js';
import { isCloud, session } from './store.js';
import { esc } from './util.js';

function steps() {
  const v = M.profile();
  const pioneer = M.isPioneer(v);
  const elder = M.profileType() === 'anciano';
  return [
    { sel: '#view .hero', t: 'Tu día', b: 'Aquí ves la fecha y un resumen: tus compromisos de hoy y las tareas por atender.' },
    { sel: '#quick-row', t: 'Accesos rápidos', b: 'Lo que más usas, a un toque. Eliges cuáles aparecen en Ajustes → Accesos rápidos.' },
    { sel: '#fab', t: 'Botón +', b: 'Agrega algo en la sección donde estás: un evento, una tarea, una persona, una nota o tu tiempo.' },
    { sel: '.tab[data-v="agenda"]', t: 'Agenda', b: 'Tu calendario del mes. Los eventos pueden repetirse cada semana, cada 2 semanas o cada mes.' },
    { sel: '.tab[data-v="tareas"]', t: 'Tareas', b: `Lo que tienes pendiente, con seguimiento y fecha límite.${elder ? ' También las que supervisas de otros hermanos.' : ''}` },
    { sel: '.tab[data-v="personas"]', t: 'Personas', b: `A quienes atiendes, con llamada y WhatsApp.${elder ? ' Puedes guardar sus privilegios y reunirlas en grupos.' : ''}` },
    { sel: '.tab[data-v="notas"]', t: 'Notas y reuniones', b: `Tus apuntes y tus reuniones importantes.${elder ? ' Prepara la agenda, envíala por WhatsApp y convierte los acuerdos en tareas.' : ''}` },
    { sel: '.tab[data-v="informe"]', t: 'Mi Informe', b: `Registra tu tiempo por categoría y planea tu semana.${pioneer ? ' Con tu meta activa verás si vas 🐢 lento, 🦉 al ras o 🐇 adelantado.' : ''}` },
    { sel: '#view [data-a="search"]', t: 'Buscar', b: 'Encuentra cualquier cosa en toda la app: eventos, tareas, personas, notas y reuniones.' },
    { sel: '#view [data-a="settings"]', t: 'Ajustes', b: `Tema, secciones visibles, accesos rápidos, respaldo y la guía rápida.${isCloud && session.isAdmin ? ' Como administrador, aquí apruebas las cuentas.' : ''} Desde aquí puedes repetir este recorrido.` },
  ];
}

let state = null;

const visible = el => {
  if (!el || el.hidden || el.closest('[hidden]')) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

export function startTour(onEnd) {
  endTour(false);
  const list = steps().filter(s => visible(document.querySelector(s.sel)));
  if (!list.length) return;
  const root = document.createElement('div');
  root.id = 'tour';
  root.innerHTML = '<div class="tour-hole"></div><div class="tour-tip" role="dialog" aria-modal="true" aria-live="polite"></div>';
  document.body.append(root);
  state = { list, i: 0, root, onEnd };
  root.addEventListener('click', e => {
    const a = e.target.closest('[data-tour]')?.dataset.tour;
    if (a === 'next') go(1);
    else if (a === 'prev') go(-1);
    else if (a === 'skip' || a === 'done') endTour(true);
  });
  window.addEventListener('resize', place);
  document.addEventListener('keydown', onKey);
  show();
}

function onKey(e) {
  if (!state) return;
  if (e.key === 'Escape') endTour(true);
  else if (e.key === 'ArrowRight') go(1);
  else if (e.key === 'ArrowLeft') go(-1);
}

function go(d) {
  if (!state) return;
  const i = state.i + d;
  if (i < 0) return;
  if (i >= state.list.length) return endTour(true);
  state.i = i;
  show();
}

function show() {
  const { list, i, root } = state;
  const s = list[i];
  const last = i === list.length - 1;
  root.querySelector('.tour-tip').innerHTML = `
    <p class="tour-step">${i + 1} de ${list.length}</p>
    <h3>${esc(s.t)}</h3>
    <p>${esc(s.b)}</p>
    <div class="tour-btns">
      ${i ? '<button type="button" class="btn ghost small" data-tour="prev">Atrás</button>' : '<button type="button" class="link" data-tour="skip">Saltar</button>'}
      <button type="button" class="btn primary small" data-tour="${last ? 'done' : 'next'}">${last ? 'Listo' : 'Siguiente'}</button>
    </div>`;
  const el = document.querySelector(s.sel);
  el?.scrollIntoView({ block: 'nearest' });
  requestAnimationFrame(place);
  root.querySelector(`[data-tour="${last ? 'done' : 'next'}"]`)?.focus({ preventScroll: true });
}

// Coloca el recuadro sobre el elemento y el globo debajo (o encima, si no cabe)
function place() {
  if (!state) return;
  const s = state.list[state.i];
  const el = document.querySelector(s.sel);
  const hole = state.root.querySelector('.tour-hole');
  const tip = state.root.querySelector('.tour-tip');
  if (!el) return;
  const r = el.getBoundingClientRect(), pad = 6;
  Object.assign(hole.style, { top: `${r.top - pad}px`, left: `${r.left - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
  const vw = window.innerWidth, vh = window.innerHeight;
  const tw = Math.min(340, vw - 32);
  tip.style.width = `${tw}px`;
  const th = tip.offsetHeight;
  const below = r.bottom + pad + 12;
  const top = below + th < vh - 8 ? below : Math.max(8, r.top - pad - 12 - th);
  const left = Math.min(Math.max(16, r.left + r.width / 2 - tw / 2), vw - tw - 16);
  Object.assign(tip.style, { top: `${top}px`, left: `${left}px` });
}

export function endTour(finished) {
  if (!state) { document.getElementById('tour')?.remove(); return; }
  const { root, onEnd } = state;
  state = null;
  root.remove();
  window.removeEventListener('resize', place);
  document.removeEventListener('keydown', onKey);
  if (finished) {
    try { localStorage.setItem('miagenda.recorrido', '1'); } catch { /* sin almacenamiento */ }
    onEnd?.();
  }
}
