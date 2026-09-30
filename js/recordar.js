// Recordar por WhatsApp las tareas atrasadas (o que vencen pronto) de otros hermanos.
// Arma un mensaje para cada responsable con sus tareas y lo abre en WhatsApp con su número, listo para enviar.
import { data } from './store.js';
import * as M from './model.js';
import { esc, today, addDays, fmtShort, toast, waLink, norm, diffDays } from './util.js';

const S = () => import('./sheets.js');
const nn = t => norm(t).replace(/\s+/g, ' ').trim();

// { key, p (ficha o null), name, tasks: [{ t, late }] } de quienes tienen tareas atrasadas o que vencen en `soon` días
export function remindList(soon = 3) {
  const t = today(), limit = addDays(t, soon);
  const me = data.people.find(p => p.isMe);
  const by = {};
  data.tasks.filter(x => x.status !== 'hecha' && !M.isMineTask(x) && x.due && x.due <= limit).forEach(x => {
    const ids = (x.responsibleIds || []).filter(id => id !== me?.id);
    const names = ids.length ? [] : (x.responsibles || []).filter(n => !me || nn(n) !== nn(me.name));
    const add = (key, p, name) => { const b = (by[key] = by[key] || { key, p, name, tasks: [] }); if (!b.tasks.some(y => y.t.id === x.id)) b.tasks.push({ t: x, late: x.due < t }); };
    ids.forEach(id => { const p = M.person(id); if (p) add(id, p, p.name); });
    names.forEach(n => { const p = data.people.find(q => nn(q.name) === nn(n)); add(p?.id || `n:${nn(n)}`, p || null, p?.name || n); });
    if (!ids.length && !names.length && x.assignTo && x.assignToName) add(`n:${nn(x.assignToName)}`, data.people.find(q => nn(q.name) === nn(x.assignToName)) || null, x.assignToName);
  });
  return Object.values(by).map(b => ({ ...b, tasks: b.tasks.sort((a, c) => a.t.due.localeCompare(c.t.due)), late: b.tasks.filter(y => y.late).length }))
    .sort((a, b) => b.late - a.late || a.name.localeCompare(b.name, 'es'));
}

export function messageFor(b) {
  const t = today();
  const first = String(b.name).split(' ')[0];
  const line = ({ t: x, late }) => {
    const n = diffDays(x.due, t);
    const when = late ? `venció el ${fmtShort(x.due)}` : n === 0 ? 'vence hoy' : n === 1 ? 'vence mañana' : `vence el ${fmtShort(x.due)}`;
    return `• ${x.title} (${when})`;
  };
  const late = b.tasks.filter(x => x.late), soon = b.tasks.filter(x => !x.late);
  return [
    `Hola, ${first}. ¿Cómo vas? Te escribo para recordarte ${b.tasks.length === 1 ? 'esta tarea' : 'estas tareas'}:`, '',
    ...(late.length ? [...(soon.length ? ['*Atrasadas*'] : []), ...late.map(line)] : []),
    ...(late.length && soon.length ? [''] : []),
    ...(soon.length ? [...(late.length ? ['*Vencen pronto*'] : []), ...soon.map(line)] : []),
    '', late.length ? '¿Me cuentas cómo va o si necesitas ayuda? ¡Gracias!' : '¿Me avisas cuando esté lista? ¡Gracias!',
  ].join('\n');
}

export async function sheet(soon = 3) {
  const { open } = await S();
  const list = remindList(soon);
  const chip = (v, n) => `<button class="chip" data-a="remind-tasks" data-v="${v}" aria-pressed="${soon === v}">${n}</button>`;
  open({
    title: '💬 Recordar por WhatsApp',
    body: `<p class="hint">Un mensaje para cada responsable con sus tareas atrasadas y las que vencen pronto. Toca «Enviar»: se abre WhatsApp con su número y el mensaje listo.</p>
      <div class="chips">${chip(0, 'Solo atrasadas')}${chip(3, '+ vencen en 3 días')}${chip(7, '+ vencen esta semana')}</div>
      ${list.length ? `<div class="stack">${list.map(b => `<div class="card mini rm-card">
        <div class="rm-h"><strong>${esc(b.name)}</strong>${b.late ? `<span class="rm-late">${b.late} ${b.late === 1 ? 'atrasada' : 'atrasadas'}</span>` : ''}</div>
        <ul class="rm-list">${b.tasks.map(({ t: x, late }) => `<li class="${late ? 'late' : ''}">${esc(x.title)} <span class="hint">· ${late ? 'venció' : 'vence'} el ${esc(fmtShort(x.due))}</span></li>`).join('')}</ul>
        <div class="rm-f">${b.p?.phone ? '' : '<span class="hint warn-t">Sin teléfono en Personas: se comparte el mensaje</span>'}<button class="btn small primary" data-a="remind-send" data-v="${soon}" data-k="${esc(b.key)}">💬 Enviar</button></div>
      </div>`).join('')}</div>` : `<div class="empty-mini">✓ Nadie tiene tareas ${soon ? 'atrasadas ni por vencer' : 'atrasadas'}.</div>`}`,
  });
}

export async function send(soon, key) {
  const b = remindList(Number(soon) || 0).find(x => x.key === key);
  if (!b) return toast('Ya no tiene tareas pendientes');
  const text = messageFor(b);
  if (b.p?.phone) { window.open(`${waLink(b.p.phone)}?text=${encodeURIComponent(text)}`, '_blank'); return; }
  try { if (navigator.share) { await navigator.share({ text }); return; } } catch (e) { if (e?.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text); toast('Mensaje copiado: pégalo en WhatsApp'); } catch { toast('No se pudo compartir'); }
}
