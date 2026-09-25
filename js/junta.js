// Modo junta: durante la reunión, pantalla completa con el punto actual, un cronómetro por punto y del total,
// botones para pasar al siguiente y un campo para anotar el acuerdo (se guarda en «Acuerdos y notas»).
// Mantiene la pantalla encendida mientras está abierto (si el teléfono lo permite).

import * as store from './store.js';
import { esc, toast, fmtTime } from './util.js';
import * as A from './agenda.js';

let st = null;   // { m, steps, i, startedAt, stepStart, times: {}, timer, wake }

const mmss = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function buildSteps(m) {
  const pr = m.prayers || {};
  const items = A.sortByBlock(m.agenda || []);
  return [
    { id: '_start', t: 'Oración inicial', by: pr.start || '', min: A.PRAYER_MIN, kind: 'oracion', subs: [] },
    ...items.map(x => ({ ...x, by: A.joinNames(A.splitNames(x.by)) })),
    { id: '_end', t: 'Oración final', by: pr.end || '', min: A.PRAYER_MIN, kind: 'oracion', subs: [] },
  ];
}

export function startJunta(meetingId) {
  const m = store.get('meetings', meetingId);
  if (!m || !(m.agenda || []).length) return toast('Esta reunión aún no tiene agenda');
  endJunta(false);
  const steps = buildSteps(m);
  const saved = m.juntaRun?.times || {};
  st = { id: m.id, steps, i: 0, startedAt: Date.now(), stepStart: Date.now(), times: { ...saved }, timer: 0, wake: null };
  const el = document.createElement('div');
  el.id = 'junta';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Modo junta');
  document.body.append(el);
  document.body.classList.add('lock');
  el.addEventListener('click', onClick);
  keepAwake();
  paint();
  st.timer = setInterval(tick, 1000);
}

async function keepAwake() {
  try { st.wake = await navigator.wakeLock?.request('screen'); } catch { /* no disponible */ }
}
document.addEventListener('visibilitychange', () => { if (st && !document.hidden) keepAwake(); });

function spent(i) { return (st.times[st.steps[i].id] || 0) + (i === st.i ? Date.now() - st.stepStart : 0); }

function tick() {
  if (!st) return;
  const s = st.steps[st.i];
  const used = spent(st.i), allowed = (Number(s.min) || 0) * 60000;
  const t = document.getElementById('j-step-time');
  if (t) {
    t.textContent = mmss(used);
    t.className = 'j-clock' + (allowed && used > allowed + 120000 ? ' over2' : allowed && used > allowed ? ' over' : '');
  }
  const left = document.getElementById('j-left');
  if (left) left.textContent = allowed ? (used > allowed ? `+${mmss(used - allowed)} de más` : `quedan ${mmss(allowed - used)}`) : '';
  const tot = document.getElementById('j-total');
  if (tot) tot.textContent = mmss(Date.now() - st.startedAt);
  const bar = document.getElementById('j-step-bar');
  if (bar && allowed) bar.style.width = `${Math.min(100, used / allowed * 100)}%`;
}

function paint() {
  const m = store.get('meetings', st.id) || {};
  const s = st.steps[st.i];
  const planned = st.steps.reduce((a, x) => a + (Number(x.min) || 0), 0);
  const next = st.steps[st.i + 1];
  const el = document.getElementById('junta');
  el.innerHTML = `
    <header class="j-top">
      <div><strong>${esc(m.title || 'Junta')}</strong><span>Total <b id="j-total">0:00</b> de ${A.fmtMin(planned)}${m.time ? ` · empezó ${fmtTime(m.time)}` : ''}</span></div>
      <button type="button" class="icon-btn" data-j="close" aria-label="Salir del modo junta">✕</button>
    </header>
    <div class="j-dots">${st.steps.map((x, i) => `<i class="${i < st.i ? 'done' : i === st.i ? 'on' : ''}" style="--c:${x.kind === 'oracion' ? 'var(--line)' : A.KIND_COLORS[x.kind] || 'var(--primary)'}"></i>`).join('')}</div>
    <section class="j-card" style="--c:${s.kind === 'oracion' ? 'var(--ink-2)' : A.KIND_COLORS[s.kind] || 'var(--primary)'}">
      <p class="j-kind">${st.i + 1} de ${st.steps.length} · ${s.kind === 'oracion' ? 'Oración' : esc(A.AGENDA_KINDS[s.kind]?.n || '')}${s.conf ? ' · 🔒 Confidencial' : ''}${s.priv ? ' · no estaba en la agenda enviada' : ''}</p>
      <h2>${esc(s.t)}</h2>
      ${s.by ? `<p class="j-by">${esc(s.by)}</p>` : ''}
      ${s.ref ? `<p class="j-ref">📖 ${esc(A.formatRef(s.ref))}</p>` : ''}
      ${(s.subs || []).length ? `<ol class="j-subs" type="a">${s.subs.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
      ${s.notes ? `<p class="j-notes">${esc(s.notes)}</p>` : ''}
      <div class="j-timer"><span id="j-step-time" class="j-clock">0:00</span><span id="j-left" class="j-left"></span></div>
      <div class="j-bar"><i id="j-step-bar"></i></div>
    </section>
    ${s.kind === 'oracion' ? '' : `<div class="j-note">
      <textarea id="j-note" rows="2" placeholder="Anota lo que se acordó en este punto"></textarea>
      <button type="button" class="btn small" data-j="note">Guardar acuerdo</button>
    </div>`}
    <footer class="j-nav">
      <button type="button" class="btn ghost" data-j="prev" ${st.i === 0 ? 'disabled' : ''}>◀ Anterior</button>
      ${next ? `<button type="button" class="btn primary" data-j="next">Siguiente ▶<small>${esc(next.t)}</small></button>`
        : '<button type="button" class="btn primary" data-j="finish">Terminar junta</button>'}
    </footer>`;
  tick();
}

function move(d) {
  const s = st.steps[st.i];
  st.times[s.id] = spent(st.i);
  st.i = Math.max(0, Math.min(st.steps.length - 1, st.i + d));
  st.stepStart = Date.now();
  st.times[st.steps[st.i].id] = st.times[st.steps[st.i].id] || 0;
  saveRun();
  paint();
}

function saveRun(finished = false) {
  const m = store.get('meetings', st.id);
  if (!m) return;
  store.upsert('meetings', { ...m, juntaRun: { times: st.times, startedAt: new Date(st.startedAt).toISOString(), ...(finished ? { finishedAt: new Date().toISOString() } : {}) } });
}

function saveNote() {
  const box = document.getElementById('j-note');
  const text = (box?.value || '').trim();
  if (!text) return box?.focus();
  const m = store.get('meetings', st.id);
  const s = st.steps[st.i];
  const line = `- ${s.t}: ${text}`;
  store.upsert('meetings', { ...m, notes: (m.notes ? m.notes.trim() + '\n' : '') + line });
  box.value = '';
  toast('Acuerdo guardado en «Acuerdos y notas»');
}

function summary() {
  st.times[st.steps[st.i].id] = spent(st.i);
  saveRun(true);
  const rows = st.steps.map(s => {
    const real = st.times[s.id] || 0, plan = (Number(s.min) || 0) * 60000;
    const diff = real - plan;
    return `<div class="part-row"><span>${esc(s.t)}</span><span>${s.min || 0} min</span><span>${mmss(real)}</span><span class="${diff > 60000 ? 'late' : ''}">${diff > 0 ? '+' : ''}${Math.round(diff / 60000)}</span></div>`;
  }).join('');
  const total = Date.now() - st.startedAt;
  const planned = st.steps.reduce((a, x) => a + (Number(x.min) || 0), 0);
  document.getElementById('junta').innerHTML = `
    <header class="j-top"><div><strong>Junta terminada</strong><span>Duró <b>${mmss(total)}</b> de ${A.fmtMin(planned)} previstos</span></div>
      <button type="button" class="icon-btn" data-j="close" aria-label="Cerrar">✕</button></header>
    <p class="hint">Así se usó el tiempo. Te sirve para planear mejor la próxima.</p>
    <div class="part-table"><div class="part-row head"><span>Punto</span><span>Previsto</span><span>Real</span><span>Dif.</span></div>${rows}</div>
    <p class="hint">Los acuerdos que anotaste están en «Acuerdos y notas» de la reunión: desde ahí conviértelos en tareas.</p>
    <footer class="j-nav"><button type="button" class="btn primary" data-j="close">Volver a la reunión</button></footer>`;
  clearInterval(st.timer); st.timer = 0;
}

function onClick(e) {
  const a = e.target.closest('[data-j]')?.dataset.j;
  if (!a || !st) return;
  if (a === 'next') move(1);
  else if (a === 'prev') move(-1);
  else if (a === 'note') saveNote();
  else if (a === 'finish') summary();
  else if (a === 'close') endJunta(true);
}

export function endJunta(reopen) {
  if (!st) { document.getElementById('junta')?.remove(); return; }
  const id = st.id;
  if (st.timer) { st.times[st.steps[st.i].id] = spent(st.i); saveRun(); clearInterval(st.timer); }
  try { st.wake?.release(); } catch { /* sin bloqueo */ }
  st = null;
  document.getElementById('junta')?.remove();
  document.body.classList.remove('lock');
  if (reopen) onClose?.(id);
}

let onClose = null;
export const setOnClose = fn => { onClose = fn; };
