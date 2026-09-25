// Semana como calendario de verdad: cada evento ocupa su hora y su duración, y se puede
//  · mover (arrastrar a otra hora u otro día) — con el dedo: mantén presionado un momento y arrastra;
//  · alargar o acortar (arrastrar la rayita de abajo).
// Al soltar, avisa con onChange({ kind, id, occ, fromDate, toDate, start, end }) — minutos desde las 00:00.
// Si solo se toca (sin arrastrar), el evento se abre como siempre.

export const START_H = 5;       // primera hora visible
export const END_H = 24;        // última
export const PX_H = 52;         // alto de una hora
const SNAP = 15;                // se ajusta de 15 en 15 minutos
const HOLD_MS = 330;            // toque largo para empezar a mover con el dedo

const toMin = t => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
export const hhmm = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const fmt = m => { const h = Math.floor(m / 60) % 24, mm = m % 60; return `${h % 12 || 12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Posición de un evento (con su hora de fin, o 1 hora si no tiene)
export function span(item) {
  const s = toMin(item.time);
  if (s == null) return null;
  let e = toMin(item.endTime);
  if (e == null || e <= s) e = s + 60;
  return { s, e };
}

// Reparte en carriles los que se cruzan el mismo día (para que no queden uno encima del otro)
export function lanes(list) {
  const sorted = [...list].sort((a, b) => a.s - b.s || b.e - a.e);
  const out = []; let group = []; let groupEnd = -1;
  const flush = () => { const cols = []; group.forEach(x => { let i = cols.findIndex(end => end <= x.s); if (i < 0) { i = cols.length; cols.push(0); } cols[i] = x.e; x.lane = i; }); group.forEach(x => { x.lanes = cols.length; }); out.push(...group); group = []; };
  sorted.forEach(x => { if (x.s >= groupEnd && group.length) flush(); group.push(x); groupEnd = Math.max(groupEnd, x.e); });
  if (group.length) flush();
  return out;
}

let lastScroll = null;           // recuerda dónde estabas al volver a pintar
let suppressClick = false;
let drag = null;                 // { el, mode: 'move'|'resize', startX, startY, s0, e0, date0, s, e, date, active, timer, pointer }
let api = null;                  // funciones de la vista montada ahora (move/end/activate)
let winBound = false;

export function mount(onChange) {
  const scroller = document.getElementById('wc-scroll');
  if (!scroller) return;
  if (lastScroll) { scroller.scrollTop = lastScroll.top; scroller.scrollLeft = lastScroll.left; }
  else scroller.scrollTop = Math.max(0, (6 - START_H) * PX_H - 8);
  scroller.addEventListener('scroll', () => { lastScroll = { top: scroller.scrollTop, left: scroller.scrollLeft }; }, { passive: true });

  // Que un arrastre no abra el evento al soltar
  scroller.addEventListener('click', e => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); suppressClick = false; } }, true);

  const cols = () => [...scroller.querySelectorAll('.wc-col')];
  const bodyTop = () => scroller.querySelector('.wc-body').getBoundingClientRect().top;

  function begin(el, mode, x, y, pointer) {
    drag = { el, mode, startX: x, startY: y, s0: Number(el.dataset.s), e0: Number(el.dataset.e), date0: el.dataset.date, active: false, pointer, timer: 0 };
    drag.s = drag.s0; drag.e = drag.e0; drag.date = drag.date0;
  }
  function activate() {
    if (!drag || drag.active) return;
    drag.active = true;
    drag.el.classList.add('dragging');
    document.body.classList.add('wc-dragging');
    navigator.vibrate?.(15);
  }
  function move(x, y) {
    if (!drag?.active) return;
    // Desplazar solo la vista si te acercas al borde
    const r = scroller.getBoundingClientRect();
    if (y < r.top + 40) scroller.scrollTop -= 12; else if (y > r.bottom - 40) scroller.scrollTop += 12;
    if (x < r.left + 40) scroller.scrollLeft -= 12; else if (x > r.right - 40) scroller.scrollLeft += 12;
    const min = Math.round(((y - bodyTop()) / PX_H * 60 + START_H * 60) / SNAP) * SNAP;
    if (drag.mode === 'resize') {
      drag.e = clamp(min, drag.s + SNAP, END_H * 60);
    } else {
      const delta = Math.round(((y - drag.startY) / PX_H * 60) / SNAP) * SNAP;
      const len = drag.e0 - drag.s0;
      drag.s = clamp(drag.s0 + delta, START_H * 60, END_H * 60 - len);
      drag.e = drag.s + len;
      const col = cols().find(c => { const b = c.getBoundingClientRect(); return x >= b.left && x < b.right; });
      if (col && col.dataset.date !== drag.date) { drag.date = col.dataset.date; col.querySelector('.wc-evs').append(drag.el); }
    }
    drag.el.style.top = `${(drag.s - START_H * 60) / 60 * PX_H}px`;
    drag.el.style.height = `${Math.max(18, (drag.e - drag.s) / 60 * PX_H - 2)}px`;
    if (drag.mode === 'move') { drag.el.style.left = '2px'; drag.el.style.width = 'calc(100% - 4px)'; }
    const t = drag.el.querySelector('.wc-t');
    if (t) t.textContent = `${fmt(drag.s)} – ${fmt(drag.e)}`;
  }
  function end() {
    if (!drag) return;
    clearTimeout(drag.timer);
    const d = drag; drag = null;
    document.body.classList.remove('wc-dragging');
    if (!d.active) return;
    d.el.classList.remove('dragging');
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 400);
    if (d.s === d.s0 && d.e === d.e0 && d.date === d.date0) return;
    onChange({ kind: d.el.dataset.kind, id: d.el.dataset.id, occ: d.el.dataset.occ || d.date0, fromDate: d.date0, toDate: d.date, start: d.s, end: d.e, resized: d.mode === 'resize' });
  }

  api = { move, end, activate };
  if (!winBound) {
    winBound = true;
    window.addEventListener('pointermove', e => {
      if (!drag?.pointer || !api) return;
      if (!drag.active && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 5) api.activate();
      if (drag.active) { e.preventDefault(); api.move(e.clientX, e.clientY); }
    });
    window.addEventListener('pointerup', () => { if (drag?.pointer) api?.end(); });
  }

  // Ratón / lápiz: arrastrar directamente
  scroller.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch' || e.button !== 0) return;
    const el = e.target.closest('.wc-ev[data-drag]');
    if (!el) return;
    begin(el, e.target.closest('.wc-resize') ? 'resize' : 'move', e.clientX, e.clientY, true);
    if (drag.mode === 'resize') activate();
  });

  // Dedo: mantener presionado y arrastrar (si mueves antes, se desplaza la vista como siempre)
  scroller.addEventListener('touchstart', e => {
    const el = e.target.closest('.wc-ev[data-drag]');
    if (!el || e.touches.length > 1) return;
    const p = e.touches[0];
    const resize = !!e.target.closest('.wc-resize');
    begin(el, resize ? 'resize' : 'move', p.clientX, p.clientY, false);
    if (resize) activate();
    else drag.timer = setTimeout(activate, HOLD_MS);
  }, { passive: true });
  scroller.addEventListener('touchmove', e => {
    if (!drag || drag.pointer) return;
    const p = e.touches[0];
    if (!drag.active) {
      if (Math.hypot(p.clientX - drag.startX, p.clientY - drag.startY) > 8) { clearTimeout(drag.timer); drag = null; }
      return;
    }
    e.preventDefault();
    move(p.clientX, p.clientY);
  }, { passive: false });
  scroller.addEventListener('touchend', () => { if (drag && !drag.pointer) end(); });
  scroller.addEventListener('touchcancel', () => { if (drag && !drag.pointer) { clearTimeout(drag.timer); drag = null; document.body.classList.remove('wc-dragging'); } });
  scroller.addEventListener('contextmenu', e => { if (e.target.closest('.wc-ev')) e.preventDefault(); });
}
