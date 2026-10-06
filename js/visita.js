// Visita del superintendente de circuito: lo que hay que tener listo (según la hoja de la visita),
// quién lo prepara (coordinador, secretario, superintendente de servicio) y las fechas límite.
// Las preguntas del final las llena el superintendente de circuito; aquí solo se lleva la cuenta de cómo van.
import * as store from './store.js';
import { data } from './store.js';
import * as M from './model.js';
import { ic, esc, uid, today, toast, fmtShort, fmtLong, addDays, diffDays, waLink, shareText } from './util.js';

// who: coord | secre | serv | sc (lo llena el superintendente de circuito)   q: 2 = Sí/No, 3 = Sí/No/N/A
export const VISIT_ITEMS = [
  { g: 'coord', k: 's62', t: 'El secretario envió el S-62 (recomendaciones de nombramiento), si hay alguna (al menos un mes antes)', due: -30 },
  { g: 'coord', k: 'recomendados', t: 'Nombres de los hermanos recomendados para nombramiento o baja' },
  { g: 'coord', k: 'temas', t: 'Temas para la agenda de la reunión con los ancianos' },
  { g: 'coord', k: 'pastoreo', t: 'Hermanos que recibirán visita de pastoreo del superintendente (y quién lo acompaña)' },
  { g: 'coord', k: 'anfitrion', t: 'Anfitrión y sus datos de contacto (si pidió alojamiento)' },
  { g: 'coord', k: 'comidas', t: 'Publicadores que ofrecerán las comidas del mediodía a él y a su esposa' },
  { g: 'coord', k: 'entrega', t: 'Entregar todo al superintendente a más tardar el martes de la visita', due: 0 },
  { g: 'secre', k: 's21', t: 'Registro de publicador de la congregación (S-21)' },
  { g: 'secre', k: 's88', t: 'Registro de asistencia a las reuniones (S-88)' },
  { g: 'secre', k: 'cuentas', t: 'Cuentas de la congregación, aprobaciones vigentes y las 2 últimas auditorías' },
  { g: 'secre', k: 'cuentasMant', t: 'Cuentas del Comité de Mantenimiento, aprobaciones y 2 últimas auditorías (solo si son la congregación de contacto)', opt: true },
  { g: 'secre', k: 'contactos', t: 'Datos de contacto de todos los publicadores' },
  { g: 'serv', k: 's13', t: 'Registro de asignación de territorio (S-13)' },
  { g: 'serv', k: 's28', t: 'Movimiento mensual de publicaciones (S-28) o el informe de JW Hub (si aplica)', opt: true },
  { g: 'serv', k: 'territorios', t: 'Territorios variados para la semana (y la predicación pública con horarios y participantes)' },
  { g: 'serv', k: 'predican', t: 'Publicadores que predicarán con él y su esposa en los horarios que indicó' },
  { g: 'sc', k: 'q1', q: 2, t: 'Datos de contacto del coordinador y del secretario al día en JW Hub' },
  { g: 'sc', k: 'q2', q: 2, t: 'Resolución aprobada para contribuir cada mes a la obra mundial' },
  { g: 'sc', k: 'q3', q: 3, t: 'Registros personales según las instrucciones de JW Hub (S-135)' },
  { g: 'sc', k: 'q4', q: 3, t: 'Cambios de los precursores regulares notificados a la sucursal' },
  { g: 'sc', k: 'q5', q: 3, t: 'Expulsiones o desasociaciones desde la última visita notificadas a la sucursal' },
  { g: 'sc', k: 'q6', q: 3, t: 'Readmisiones o fallecimientos notificados a la sucursal' },
  { g: 'sc', k: 'q7', q: 3, t: 'Seguimiento cercano a publicadores con restricciones' },
  { g: 'sc', k: 'q8', q: 3, t: 'Casos graves de hermanos con privilegios consultados con la sucursal' },
  { g: 'sc', k: 'q9', q: 3, t: 'Cartas de presentación de los que se mudaron enviadas' },
  { g: 'sc', k: 'q10', q: 2, t: 'Archivo y retención de registros según las instrucciones' },
  { g: 'sc', k: 'q11', q: 3, t: 'Cambios en el grupo de publicaciones notificados a la sucursal' },
  { g: 'sc', k: 'q12', q: 2, t: 'Preparación para desastres: contactos y contactos de emergencia al día' },
  { g: 'sc', k: 'q13', q: 3, t: 'Medidas tomadas si se envió alguna notificación de incidente (TO-5)' },
  { g: 'sc', k: 'q14', q: 3, t: 'Publicadores encarcelados: informada la congregación de contacto' },
  { g: 'sc', k: 'q15', q: 3, t: 'Ayuda a los publicadores que viven lejos' },
];
export const GROUPS = {
  coord: { n: 'Coordinador del cuerpo de ancianos', ic: '★' },
  secre: { n: 'Pedir al secretario', ic: '📁' },
  serv: { n: 'Pedir al superintendente de servicio', ic: '🗺' },
  sc: { n: 'Preguntas que llena el superintendente de circuito', ic: '📝', hint: 'Las marca él. Tú revisa que cada una esté al día antes de la visita.' },
};

// La visita más próxima (o la que está en curso)
export function currentVisit(t = today()) {
  const list = [...(data.visitas || [])].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  return list.find(v => v.start && addDays(v.start, 6) >= t) || null;
}
const isDone = (v, it) => { const x = v.items?.[it.k] || {}; return it.q ? !!x.ans : !!(x.done || x.na); };
export function progress(v) {
  const items = VISIT_ITEMS;
  const done = items.filter(it => isDone(v, it)).length;
  const byG = Object.fromEntries(Object.keys(GROUPS).map(g => { const its = items.filter(i => i.g === g); return [g, { total: its.length, done: its.filter(i => isDone(v, i)).length }]; }));
  const no = items.filter(it => it.q && v.items?.[it.k]?.ans === 'no');
  return { done, total: items.length, byG, no };
}
export function deadlines(v) {
  return VISIT_ITEMS.filter(it => it.due != null && !isDone(v, it)).map(it => ({ it, date: addDays(v.start, it.due) })).sort((a, b) => a.date.localeCompare(b.date));
}
const who = g => g === 'coord' ? M.headsOf('coord') : g === 'secre' ? M.headsOf('secre') : g === 'serv' ? M.headsOf('serv') : [];

// ───── Sección en Congregación ─────
export function visitaSection() {
  const v = currentVisit();
  if (!v) {
    const last = [...(data.visitas || [])].sort((a, b) => (b.start || '').localeCompare(a.start || ''))[0];
    return `<section><div class="sec-h"><h2>${ic('suitcase')}Visita del superintendente de circuito</h2></div>
      <p class="hint pad">Prepara la visita con la lista de lo que hay que entregar: quién lo prepara, qué falta y las fechas límite (el S-62 un mes antes, todo lo demás el martes).${last ? ` La última fue el ${esc(fmtShort(last.start))}.` : ''}</p>
      <button class="btn" data-a="visita-new">＋ Preparar la próxima visita</button></section>`;
  }
  const t = today(), p = progress(v), d = diffDays(v.start, t);
  const when = d > 1 ? `en ${d} días` : d === 1 ? 'mañana' : d === 0 ? 'hoy' : 'esta semana';
  const dl = deadlines(v);
  return `<section><div class="sec-h"><h2>${ic('suitcase')}Visita del superintendente de circuito</h2><span class="hint">${esc(when)}</span></div>
    <button class="card visit-card" data-a="visita-open" data-id="${esc(v.id)}">
      <span class="grow"><strong>Semana del ${esc(fmtLong(v.start))}</strong>
        <span class="meta">${p.done} de ${p.total} listos${p.no.length ? ` · ⚠️ ${p.no.length} con «No»` : ''}</span>
        <span class="visit-bar"><i style="width:${Math.round(p.done / p.total * 100)}%"></i></span>
        <span class="visit-groups">${Object.entries(GROUPS).map(([g, x]) => `<span class="${p.byG[g].done === p.byG[g].total ? 'ok' : ''}">${x.ic} ${p.byG[g].done}/${p.byG[g].total}</span>`).join('')}</span>
        ${dl.length ? `<span class="meta ${dl[0].date < t ? 'warn-t' : ''}">⏰ ${esc(dl[0].it.t.split(' (')[0])}: ${dl[0].date < t ? 'venció' : 'antes del'} ${esc(fmtShort(dl[0].date))}</span>` : ''}
      </span><span class="btn small ghost">Abrir</span></button></section>`;
}

// ───── Hoja con la lista ─────
const S = () => import('./sheets.js');
export async function newVisit() {
  const { open } = await S();
  // Las visitas empiezan el martes: se propone el próximo martes dentro de un mes
  const d = new Date(`${addDays(today(), 30)}T12:00:00`); while (d.getDay() !== 2) d.setDate(d.getDate() + 1);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  open({ title: 'Próxima visita', body: `<div class="f"><label for="visit-start">¿Qué martes empieza la visita?</label><input id="visit-start" type="date" value="${esc(iso)}"></div>
      <label class="check"><input type="checkbox" id="visit-cal" checked> Ponerla en mi agenda</label>
      <p class="hint">Luego vas marcando lo que está listo. El S-62 debe enviarse al menos un mes antes; lo demás se entrega a más tardar el martes.</p>`,
    actions: '<button type="button" class="btn primary" data-a="visita-create">Crear la lista</button>' });
}
export async function createVisit() {
  const start = document.getElementById('visit-start')?.value;
  if (!start) return toast('Elige la fecha');
  const v = store.upsert('visitas', { id: uid(), start, items: {} });
  if (document.getElementById('visit-cal')?.checked) store.upsert('events', { id: uid(), title: 'Visita del superintendente de circuito', category: 'reunion', date: start, repeat: 'none', notes: 'Semana de la visita (martes a domingo).', time: '', place: '' });
  openVisit(v.id);
}
export async function openVisit(id) {
  const v = store.get('visitas', id);
  if (!v) return;
  const { open, personPick: pick } = await S();
  const p = progress(v), t = today();
  const pastPool = () => [...data.people].filter(pp => M.isShepherdable(pp)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const row = it => {
    const x = v.items?.[it.k] || {};
    const due = it.due != null ? addDays(v.start, it.due) : '';
    const ctl = it.q
      ? `<span class="seg tiny" role="group" aria-label="Respuesta">${['si', 'no', ...(it.q === 3 ? ['na'] : [])].map(a => `<button type="button" data-a="visita-ans" data-id="${esc(v.id)}" data-k="${esc(it.k)}" data-v="${a}" aria-pressed="${x.ans === a}">${a === 'si' ? 'Sí' : a === 'no' ? 'No' : 'N/A'}</button>`).join('')}</span>`
      : `<input type="checkbox" data-a="visita-check" data-id="${esc(v.id)}" data-k="${esc(it.k)}" ${x.done ? 'checked' : ''} aria-label="Listo">`;
    return `<li class="visit-it ${isDone(v, it) ? 'done' : ''} ${x.ans === 'no' ? 'no' : ''}">
      <div class="visit-row">${it.q ? '' : ctl}<span class="grow">${esc(it.t)}${due ? ` <span class="hint ${!isDone(v, it) && due < t ? 'warn-t' : ''}">· antes del ${esc(fmtShort(due))}</span>` : ''}${it.opt ? ' <button type="button" class="link sm" data-a="visita-na" data-id="' + v.id + '" data-k="' + it.k + '">' + (x.na ? 'Sí aplica' : 'No aplica') + '</button>' : ''}</span>${it.q ? ctl : ''}</div>
      ${it.k === 'temas' ? `<textarea class="visit-note" data-visit-note="${esc(v.id)}" data-k="${esc(it.k)}" rows="3" maxlength="800" placeholder="Un tema por línea">${esc(x.note || '')}</textarea>
        <button type="button" class="btn small ghost" data-a="visita-meeting" data-id="${esc(v.id)}">${v.meetingId && store.get('meetings', v.meetingId) ? '🗓 Abrir la reunión con el superintendente' : '🗓 Crear la reunión con estos temas'}</button>`
      : it.k === 'pastoreo' ? `${pick ? pick('visitPast', pastPool(), x.ids || [], null, 'checkbox', { lazy: true }) : ''}
        <input class="visit-note" data-visit-note="${esc(v.id)}" data-k="${esc(it.k)}" maxlength="200" value="${esc(x.note || '')}" placeholder="Quién lo acompaña (opcional)">
        ${(x.ids || []).length ? `<button type="button" class="btn small ghost" data-a="visita-past-log" data-id="${esc(v.id)}">${x.logged ? `✓ Anotadas el ${esc(fmtShort(x.logged))} · volver a anotar` : `✓ Anotar estas ${x.ids.length} visitas en su seguimiento`}</button>` : ''}`
      : `<input class="visit-note" data-visit-note="${esc(v.id)}" data-k="${esc(it.k)}" maxlength="200" value="${esc(x.note || '')}" placeholder="Nota (opcional)">`}
    </li>`;
  };
  const prev = previousVisit(v);
  const prevLeft = prev ? VISIT_ITEMS.filter(it => !isDone(prev, it) || prev.items?.[it.k]?.ans === 'no') : [];
  open({ title: `Visita del ${fmtShort(v.start)}`, back: null, body: `
    <div class="f"><label for="visit-start-e">Semana de la visita (martes)</label><input id="visit-start-e" type="date" data-visit-start="${esc(v.id)}" value="${esc(v.start)}"></div>
    <p class="hint">${p.done} de ${p.total} listos. Se guarda solo al marcar.</p>
    ${prev && prevLeft.length ? `<details class="load-row visit-prev"><summary><span class="load-n hi">${prevLeft.length}</span><span class="grow"><b>De la visita anterior (${esc(fmtShort(prev.start))})</b><small>Lo que quedó pendiente o con «No»</small></span></summary>
      <ul class="load-list">${prevLeft.map(it => `<li>${prev.items?.[it.k]?.ans === 'no' ? '⚠️ No:' : '⚪'} ${esc(it.t)}${prev.items?.[it.k]?.note ? ` <span class="hint">· ${esc(prev.items[it.k].note)}</span>` : ''}</li>`).join('')}</ul></details>` : ''}
    ${Object.entries(GROUPS).map(([g, x]) => {
      const people = who(g);
      const pend = VISIT_ITEMS.filter(it => it.g === g && !isDone(v, it)).length;
      return `<h3 class="sub-h">${x.ic} ${esc(x.n)}${people.length ? ` <span class="hint">· ${esc(people.map(pp => pp.name).join(', '))}</span>` : ''}</h3>
        ${x.hint ? `<p class="hint">${esc(x.hint)}</p>` : ''}
        <ul class="visit-list">${VISIT_ITEMS.filter(it => it.g === g).map(row).join('')}</ul>
        ${(g === 'secre' || g === 'serv') && pend ? `<button type="button" class="btn small ghost" data-a="visita-ask" data-id="${esc(v.id)}" data-v="${g}">📤 Pedirle lo que falta por WhatsApp</button>` : ''}`;
    }).join('')}
    <div class="f pad-top"><label for="visit-notes">Notas de la visita</label><textarea id="visit-notes" rows="3" data-visit-notes="${esc(v.id)}">${esc(v.notes || '')}</textarea></div>`,
    actions: `<button type="button" class="btn ghost danger" data-a="delete" data-col="visitas" data-id="${esc(v.id)}">Eliminar</button><button type="button" class="btn primary" data-a="sheet-close">Listo</button>` });
}
function setItem(id, k, patch) {
  const v = store.get('visitas', id);
  if (!v) return null;
  const items = { ...(v.items || {}), [k]: { ...(v.items?.[k] || {}), ...patch } };
  return store.upsert('visitas', { ...v, items });
}
export function check(el) { setItem(el.dataset.id, el.dataset.k, { done: el.checked, at: today() }); el.closest('.visit-it')?.classList.toggle('done', el.checked); }
export function answer(el) {
  const v = store.get('visitas', el.dataset.id); const cur = v?.items?.[el.dataset.k]?.ans;
  const ans = cur === el.dataset.v ? '' : el.dataset.v;
  setItem(el.dataset.id, el.dataset.k, { ans });
  const li = el.closest('.visit-it'); li?.querySelectorAll('[data-a="visita-ans"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === ans)));
  li?.classList.toggle('done', !!ans); li?.classList.toggle('no', ans === 'no');
}
export function toggleNa(el) { const v = store.get('visitas', el.dataset.id); const na = !v?.items?.[el.dataset.k]?.na; setItem(el.dataset.id, el.dataset.k, { na }); openVisit(el.dataset.id); }
let noteTimer = 0;
export function noteInput(el) {
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => {
    if (el.dataset.visitNote) setItem(el.dataset.visitNote, el.dataset.k, { note: el.value.trim() });
    else if (el.dataset.visitNotes) { const v = store.get('visitas', el.dataset.visitNotes); if (v) store.upsert('visitas', { ...v, notes: el.value }); }
  }, 500);
}
export function startChanged(el) { const v = store.get('visitas', el.dataset.visitStart); if (v && el.value) { store.upsert('visitas', { ...v, start: el.value }); openVisit(v.id); } }
// Mensaje al secretario o al superintendente de servicio con lo que falta
export async function ask(id, g) {
  const v = store.get('visitas', id);
  if (!v) return;
  const pend = VISIT_ITEMS.filter(it => it.g === g && !isDone(v, it));
  const h = who(g)[0];
  const text = [`Hola${h ? `, ${h.name.split(' ')[0]}` : ''}. Para la visita del superintendente de circuito (semana del ${fmtLong(v.start)}), ¿me ayudas a tener listo esto a más tardar el martes?`,
    '', ...pend.map(it => `• ${it.t}`), '', '¡Gracias!'].join('\n');
  if (h?.phone) { window.open(`${waLink(h.phone)}?text=${encodeURIComponent(text)}`, '_blank'); return; }
  await shareText(text);
}

// Para Hoy y el resumen de la mañana
export function visitNotice(t = today()) {
  const v = currentVisit(t);
  if (!v) return null;
  const d = diffDays(v.start, t), p = progress(v), dl = deadlines(v);
  const soonDl = dl.find(x => diffDays(x.date, t) <= 7);
  if (d > 30 && !soonDl) return null;
  return { v, days: d, pend: p.total - p.done, next: soonDl };
}

// La visita anterior a esta (para ver lo que quedó pendiente)
export function previousVisit(v) {
  return [...(data.visitas || [])].filter(x => x.id !== v.id && (x.start || '') < (v.start || '')).sort((a, b) => b.start.localeCompare(a.start))[0] || null;
}
// Hermanos que recibirán visita de pastoreo con el superintendente (se guarda al marcar)
export function pastPicked(el) {
  const f = el.closest('.visit-it');
  const id = f?.querySelector('[data-visit-note]')?.dataset.visitNote;
  if (!id) return;
  const ids = [...f.querySelectorAll('input[name="visitPast"]:checked')].map(i => i.value);
  setItem(id, 'pastoreo', { ids, done: ids.length ? true : !!store.get('visitas', id)?.items?.pastoreo?.done });
}
// Anota la visita de pastoreo en el seguimiento de cada hermano marcado
export async function logPastoreo(id) {
  const v = store.get('visitas', id);
  const x = v?.items?.pastoreo || {};
  if (!v || !(x.ids || []).length) return;
  const S2 = await S();
  const t = today();
  const date = t >= v.start && t <= addDays(v.start, 6) ? t : v.start;
  let n = 0;
  x.ids.forEach(pid => {
    const person = store.get('people', pid);
    if (!person) return;
    if ((person.visits || []).some(vv => vv.kind === 'pastoreo' && vv.date === date && /superintendente de circuito/i.test(vv.note || ''))) return;
    S2.addVisit(person, { date, kind: 'pastoreo', note: `Con el superintendente de circuito${x.note ? ` y ${x.note}` : ''}`, withIds: [] });
    n++;
  });
  setItem(id, 'pastoreo', { logged: date, done: true });
  toast(n ? `Anotadas ${n} visitas de pastoreo (${fmtShort(date)})` : 'Ya estaban anotadas');
  openVisit(id);
}
// Crea (o abre) la reunión de los ancianos con el superintendente, con los temas como puntos de la agenda
export async function meetingFromTopics(id) {
  const v = store.get('visitas', id);
  if (!v) return;
  const S2 = await S();
  if (v.meetingId && store.get('meetings', v.meetingId)) return S2.meetingSheet(v.meetingId, () => openVisit(id));
  const topics = String(v.items?.temas?.note || '').split(/\r?\n|;/).map(x => x.replace(/^\s*[-•*\d.)]+\s*/, '').trim()).filter(Boolean);
  const m = store.upsert('meetings', { id: uid(), title: 'Reunión de ancianos con el superintendente de circuito', date: v.start, time: '', place: '', attendees: '', attendeeIds: [], attendeeGroupIds: [], topics: '', notes: '',
    agenda: topics.map(t2 => ({ id: uid(), t: t2, kind: 'informar', min: 10 })), agendaMax: 0, prayers: {} });
  store.upsert('visitas', { ...store.get('visitas', id), meetingId: m.id });
  toast(topics.length ? `Reunión creada con ${topics.length} temas` : 'Reunión creada: agrega los temas en su agenda');
  S2.meetingSheet(m.id, () => openVisit(id));
}
