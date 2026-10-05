// Panel para la reunión del Cuerpo de ancianos: lo pendiente de un vistazo
// (acuerdos de la última reunión, tareas que supervisas, capacitaciones por revisar, pastoreo de tu grupo y asignaciones mecánicas).
import { data } from './store.js';
import * as M from './model.js';
import { esc, today, fmtShort, toast, shareText } from './util.js';
import { mecaStats } from './mecas.js';

export function comiteData(t = today()) {
  const meetings = [...data.meetings].filter(m => (m.date || '') <= t).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const last = meetings.find(m => M.parseAgreements(m).length);
  const agreements = last ? M.parseAgreements(last) : [];
  const withTask = agreements.filter(a => a.task);
  const done = withTask.filter(a => a.task.status === 'hecha');
  const pending = agreements.filter(a => !a.task || a.task.status !== 'hecha').map(a => {
    const tk = a.task;
    return { a, tk, late: !!tk?.due && tk.due < t, who: tk ? (tk.responsibles || []) : a.responsibles };
  });
  const supervise = M.toSupervise().slice(0, 8);
  const reviews = M.reviewsDue(t, 14);
  const pastoreo = M.pastoreoLate(t);
  const mec = (data.mecas || []).length ? mecaStats(3) : null;
  return { last, agreements, done, pending, supervise, reviews, pastoreo, mec };
}

export function comiteSection() {
  const c = comiteData();
  const t = today();
  const nothing = !c.last && !c.supervise.length && !c.reviews.length;
  const block = (title, body, n) => `<details class="load-row cm-box" ${n ? 'open' : ''}><summary><span class="load-n ${n ? 'hi' : ''}">${n}</span><span class="grow"><b>${title}</b></span></summary>${body}</details>`;
  const agr = c.last ? block(`Acuerdos de «${esc(c.last.title || 'la última reunión')}» · ${esc(fmtShort(c.last.date))}`,
    `<p class="hint">${c.done.length} de ${c.agreements.length} hechos${c.agreements.length - c.done.length - c.pending.filter(p => p.tk).length ? ` · ${c.agreements.length - c.done.length - c.pending.filter(p => p.tk).length} sin tarea` : ''}</p>
    <ul class="load-list">${c.pending.map(p => `<li>${p.late ? '🔴' : p.tk ? '🟡' : '⚪'} ${p.tk ? `<button class="link" data-a="task" data-id="${esc(p.tk.id)}">${esc(p.tk.title)}</button>` : esc(p.a.title)}${p.who.length ? ` <span class="hint">· ${esc(p.who.join(', '))}</span>` : ''}${p.tk?.due ? ` <span class="hint">· ${p.late ? 'venció' : 'para'} el ${esc(fmtShort(p.tk.due))}</span>` : ''}</li>`).join('') || '<li>✓ Todo hecho</li>'}</ul>
    <button class="btn small ghost" data-a="meeting" data-id="${esc(c.last.id)}">Abrir la reunión</button>`, c.pending.length) : '';
  const sup = block('Tareas que supervisas sin novedad', c.supervise.length
    ? `<ul class="load-list">${c.supervise.map(x => `<li>${x.late ? '🔴' : '🟡'} <button class="link" data-a="task" data-id="${esc(x.task.id)}">${esc(x.task.title)}</button> <span class="hint">· ${esc((x.task.responsibles || []).join(', '))} · ${x.late ? `venció el ${esc(fmtShort(x.task.due))}` : `${x.quiet} días sin novedad`}</span></li>`).join('')}</ul>${c.supervise.some(x => x.late) ? '<button class="btn small" data-a="remind-tasks" data-v="3">💬 Recordar por WhatsApp</button>' : ''}`
    : '<p class="hint">✓ Nada atrasado.</p>', c.supervise.length);
  const rev = block('Capacitaciones por revisar (próximas 2 semanas)', c.reviews.length
    ? `<ul class="load-list">${c.reviews.map(d => `<li>${d.reviewAt < t ? '🔴' : '🎓'} <button class="link" data-a="dept" data-id="${esc(d.id)}">${esc(d.name)}</button> <span class="hint">· ${esc(fmtShort(d.reviewAt))}${d.reviewNote ? ` · ${esc(d.reviewNote)}` : ''}</span></li>`).join('')}</ul>`
    : '<p class="hint">Ninguna fecha de revisión cerca.</p>', c.reviews.length);
  const pas = block('Pastoreo de tu grupo pendiente', c.pastoreo.length
    ? `<div class="chips wrap">${c.pastoreo.slice(0, 20).map(p => `<button class="chip warn-chip" data-a="person" data-id="${esc(p.id)}">${esc(p.name)}</button>`).join('')}${c.pastoreo.length > 20 ? `<span class="hint">y ${c.pastoreo.length - 20} más</span>` : ''}</div>`
    : '<p class="hint">✓ Al día.</p>', c.pastoreo.length);
  const mec = c.mec ? block('Varones bautizados sin asignación mecánica (3 meses)', c.mec.notUsed.length
    ? `<div class="chips wrap">${c.mec.notUsed.map(p => `<button class="chip warn-chip" data-a="person" data-id="${esc(p.id)}">${esc(p.name)}</button>`).join('')}</div>`
    : '<p class="hint">✓ Todos tienen alguna.</p>', c.mec.notUsed.length) : '';
  const link = `<button class="btn small ${M.profile().share?.secret ? '' : 'ghost'}" data-a="sh-open">🔗 ${M.profile().share?.secret ? 'Enlace activo' : 'Enlace para los ancianos'}</button>`;
  return `<section><div class="sec-h"><h2>📋 Para el Cuerpo de ancianos</h2></div>
    <div class="org-tools">${link}${nothing ? '' : '<button class="btn small ghost" data-a="comite-share">📤 Compartir resumen</button>'}</div>
    ${nothing ? '<p class="hint pad">Cuando tengas reuniones con acuerdos y tareas que supervisas, aquí verás lo pendiente para la reunión del cuerpo de ancianos.</p>' : `<div class="stack">${agr}${sup}${rev}${pas}${mec}</div>`}</section>`;
}

// Resumen en texto para compartir con los ancianos (lleva nombres: solo con ellos)
export async function shareSummary() {
  const c = comiteData();
  const lines = ['📋 *Pendientes para el Cuerpo de ancianos*', `_${fmtShort(today())}_`, ''];
  if (c.last) {
    lines.push(`*Acuerdos de ${c.last.title || 'la última reunión'} (${fmtShort(c.last.date)})*: ${c.done.length} de ${c.agreements.length} hechos`);
    c.pending.forEach(p => lines.push(`${p.late ? '🔴' : '•'} ${p.tk ? p.tk.title : p.a.title}${p.who.length ? ` — ${p.who.join(', ')}` : ''}${p.tk?.due ? ` (${p.late ? 'venció' : 'para'} el ${fmtShort(p.tk.due)})` : ''}`));
    lines.push('');
  }
  if (c.supervise.length) { lines.push('*Tareas sin novedad*'); c.supervise.forEach(x => lines.push(`• ${x.task.title} — ${(x.task.responsibles || []).join(', ')}`)); lines.push(''); }
  if (c.reviews.length) { lines.push('*Capacitaciones por revisar*'); c.reviews.forEach(d => lines.push(`• ${d.name} (${fmtShort(d.reviewAt)})`)); lines.push(''); }
  if (c.mec?.notUsed.length) lines.push(`*Sin asignación mecánica:* ${c.mec.notUsed.map(p => p.name).join(', ')}`);
  const text = lines.join('\n').trim();
  await shareText(text, { copied: '📋 Resumen copiado. Pégalo en WhatsApp con Ctrl+V' });
}
