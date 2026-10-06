// Limpieza y mantenimiento del Salón del Reino.
//
// Dos cosas en la misma colección, separadas por «kind»:
//   · turno = { kind:'turno', date, groupId, notes }        a qué grupo le toca limpiar ese día
//   · mant  = { kind:'mant', title, every, last, notes }    revisión que se repite cada N meses
//
// Los turnos se generan de una vez repartiendo los grupos de Personas por turno; después se
// pueden cambiar uno a uno. El mantenimiento avisa cuando se pasa la fecha.
import * as store from './store.js';
import { data } from './store.js';
import * as M from './model.js';
import { ic, esc, uid, today, toast, fmtShort, fmtLong, addDays, diffDays, shareText } from './util.js';

// Revisiones típicas de un Salón, por si se quieren cargar de una vez (meses entre revisiones)
export const MANT_SUGERIDO = [
  { title: 'Aire acondicionado: limpieza de filtros', every: 3 },
  { title: 'Extintores: revisión y carga', every: 12 },
  { title: 'Botiquín: revisar y reponer', every: 6 },
  { title: 'Luces de emergencia', every: 6 },
  { title: 'Techo y canales: revisar antes de lluvias', every: 6 },
  { title: 'Equipo de sonido y micrófonos', every: 6 },
  { title: 'Jardín y exteriores', every: 3 },
  { title: 'Plomería y tanques de agua', every: 6 },
];

const todos = () => (data.limpieza || []);
export const turnos = () => todos().filter(x => x.kind === 'turno').sort((a, b) => String(a.date).localeCompare(String(b.date)));
export const mantenimientos = () => todos().filter(x => x.kind === 'mant');

const nombreGrupo = id => data.groups.find(g => g.id === id)?.name || '';

// ───────────── Turnos de limpieza ─────────────
export const proximoTurno = (t = today()) => turnos().find(x => x.date >= t) || null;

// Reparte los grupos, uno por turno, empezando en una fecha y cada «cadaDias» días.
// Devuelve los turnos nuevos (no los guarda): así se pueden revisar antes.
export function repartir({ desde, cadaDias = 7, veces = 12, grupos = [] }) {
  if (!grupos.length || !desde) return [];
  const out = [];
  for (let i = 0; i < veces; i++) {
    out.push({ date: addDays(desde, i * cadaDias), groupId: grupos[i % grupos.length] });
  }
  return out;
}

// ───────────── Mantenimiento ─────────────
// Cuándo toca la próxima revisión y si ya se pasó
export function vence(m, t = today()) {
  const cada = Number(m.every) || 0;
  if (!cada) return { next: '', tarde: false, dias: null };
  if (!m.last) return { next: '', tarde: true, dias: null };   // nunca se ha hecho
  const d = new Date(`${m.last}T00:00:00`);
  d.setMonth(d.getMonth() + cada);
  const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { next, tarde: next < t, dias: diffDays(next, t) };
}

export const mantPendientes = (t = today()) => mantenimientos().filter(m => vence(m, t).tarde);

// ───────────── Pantalla ─────────────
function filaTurno(x, t) {
  const g = nombreGrupo(x.groupId);
  const cuando = x.date === t ? 'Hoy' : x.date === addDays(t, 1) ? 'Mañana' : fmtLong(x.date);
  return `<button class="card mini lp-turno ${x.date < t ? 'pasado' : ''}" data-a="lp-turno" data-id="${esc(x.id)}">
    <strong>${esc(cuando)}</strong>
    <span class="meta">${g ? esc(g) : '<b class="late">sin grupo</b>'}${x.notes ? ` · ${esc(x.notes)}` : ''}</span>
  </button>`;
}

function filaMant(m, t) {
  const v = vence(m, t);
  const sub = !m.last ? '<b class="late">nunca se ha hecho</b>'
    : v.tarde ? `<b class="late">tocaba el ${esc(fmtShort(v.next))}</b>`
      : `última vez el ${esc(fmtShort(m.last))} · toca el ${esc(fmtShort(v.next))}`;
  return `<div class="tb-row ${v.tarde ? 'late' : ''}">
    <button class="card mini" data-a="lp-mant" data-id="${esc(m.id)}">
      <strong>${esc(m.title)}</strong>
      <span class="meta">${sub}${m.notes ? ` · ${esc(m.notes)}` : ''}</span>
    </button>
    <button class="wa-side" data-a="lp-hecho" data-id="${esc(m.id)}" aria-label="Marcar ${esc(m.title)} como hecho hoy" title="Hecho hoy">${ic('check')}</button>
  </div>`;
}

export function limpiezaSection() {
  const t = today();
  const prox = turnos().filter(x => x.date >= t).slice(0, 8);
  const sig = prox[0];
  const mant = mantenimientos().sort((a, b) => {
    const va = vence(a, t), vb = vence(b, t);
    return (vb.tarde ? 1 : 0) - (va.tarde ? 1 : 0) || String(va.next || '9999').localeCompare(String(vb.next || '9999'));
  });
  const tarde = mant.filter(m => vence(m, t).tarde).length;
  return `<section><div class="sec-h"><h2>${ic('hammer')}Limpieza y mantenimiento</h2>${tarde ? `<span class="hint">${tarde} por hacer</span>` : ''}</div>

    <h3 class="sub-h">Turnos de limpieza</h3>
    ${sig ? `<div class="card lp-next"><span class="meta">Le toca a</span><strong>${esc(nombreGrupo(sig.groupId) || 'Sin grupo')}</strong>
      <span class="meta">${sig.date === t ? 'hoy' : sig.date === addDays(t, 1) ? 'mañana' : esc(fmtLong(sig.date))}</span></div>` : ''}
    ${prox.length ? `<div class="stack">${prox.map(x => filaTurno(x, t)).join('')}</div>`
    : '<p class="hint pad">Aún no hay turnos. Repártelos entre los grupos y después puedes cambiar los que haga falta.</p>'}
    <div class="org-tools"><button class="btn small ${prox.length ? 'ghost' : 'primary'}" data-a="lp-gen">${ic('users', 'sm')} Repartir turnos</button>
      <button class="btn small ghost" data-a="lp-turno">${ic('plus', 'sm')} Un turno</button>
      ${prox.length ? `<button class="btn small ghost" data-a="lp-share">${ic('chat', 'sm')} Compartir</button>` : ''}</div>

    <h3 class="sub-h">Mantenimiento preventivo</h3>
    ${mant.length ? `<div class="stack">${mant.map(m => filaMant(m, t)).join('')}</div>
      <p class="hint pad">El ✓ anota que se hizo hoy y calcula sola la próxima revisión.</p>`
    : '<p class="hint pad">Revisiones que no se pueden pasar: filtros del aire, extintores, botiquín…</p>'}
    <div class="org-tools"><button class="btn small ${mant.length ? 'ghost' : 'primary'}" data-a="lp-mant">${ic('plus', 'sm')} Agregar revisión</button></div>
  </section>`;
}

export function hoyNotices() {
  if (!M.isModuleVisible('congregacion') || !M.featureOn('congregacion.limpieza')) return [];
  const t = today();
  const out = [];
  const sig = proximoTurno(t);
  if (sig && (sig.date === t || sig.date === addDays(t, 1))) {
    const g = nombreGrupo(sig.groupId);
    out.push(`<button class="log-now" data-a="nav" data-v="congregacion">🧹 <span><b>Limpieza del Salón ${sig.date === t ? 'hoy' : 'mañana'}</b><small>${g ? `Le toca a ${esc(g)}.` : 'Todavía sin grupo asignado.'} Toca para verlo.</small></span></button>`);
  }
  const mal = mantPendientes(t);
  if (mal.length) {
    out.push(`<button class="log-now" data-a="nav" data-v="congregacion">🔧 <span><b>${mal.length === 1 ? 'Una revisión del Salón pendiente' : `${mal.length} revisiones del Salón pendientes`}</b><small>${esc(mal.slice(0, 2).map(m => m.title).join(' · '))}${mal.length > 2 ? ` y ${mal.length - 2} más` : ''}.</small></span></button>`);
  }
  return out;
}

// ───────────── Hojas ─────────────
export function turnoSheet(open, id = '') {
  const x = id ? store.get('limpieza', id) : null;
  const grupos = [...data.groups].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  open({
    title: x ? 'Turno de limpieza' : 'Nuevo turno',
    body: `<form id="f" data-form="lp-turno">
      <input type="hidden" name="id" value="${esc(x?.id || '')}">
      <label class="f"><span>Día</span><input type="date" name="date" value="${esc(x?.date || today())}" required></label>
      <label class="f"><span>Grupo</span><select name="groupId">${grupos.length ? `<option value="">Sin asignar</option>${grupos.map(g => `<option value="${esc(g.id)}" ${x?.groupId === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}` : '<option value="">Primero crea grupos en Personas</option>'}</select></label>
      <label class="f"><span>Nota (opcional)</span><input name="notes" maxlength="80" value="${esc(x?.notes || '')}" placeholder="Ej. limpieza a fondo"></label>
      <div class="f-actions"><button type="submit" class="btn primary">Guardar</button>
        ${x ? `<button type="button" class="btn ghost danger" data-a="lp-del" data-id="${esc(x.id)}">Eliminar</button>` : ''}</div>
    </form>`,
  });
}

export function generarSheet(open) {
  const grupos = [...data.groups].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  if (!grupos.length) return toast('Primero crea los grupos en Personas → Grupos');
  open({
    title: 'Repartir turnos',
    body: `<form id="f" data-form="lp-gen">
      <label class="f"><span>Empezar el</span><input type="date" name="desde" value="${esc(today())}" required></label>
      <label class="f"><span>Cada cuánto</span><select name="cada"><option value="7">Cada semana</option><option value="14">Cada dos semanas</option><option value="30">Cada mes</option></select></label>
      <label class="f"><span>Cuántos turnos</span><select name="veces">${[8, 12, 16, 24, 52].map(n => `<option value="${n}" ${n === 12 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <fieldset class="f"><legend>Grupos que participan</legend>
        <div class="chips wrap">${grupos.map(g => `<label class="pchip"><input type="checkbox" name="g" value="${esc(g.id)}" checked><span>${esc(g.name)}</span></label>`).join('')}</div></fieldset>
      <p class="hint">Se reparten en orden, uno por turno, y se vuelve a empezar. Después puedes cambiar los que haga falta. Los turnos que ya existan en esos días se reemplazan.</p>
      <div class="f-actions"><button type="submit" class="btn primary">Repartir</button></div>
    </form>`,
  });
}

export function mantSheet(open, id = '') {
  const m = id ? store.get('limpieza', id) : null;
  const meses = [1, 2, 3, 6, 12, 24];
  const sugerencias = MANT_SUGERIDO.filter(s => !mantenimientos().some(x => x.title === s.title));
  open({
    title: m ? 'Revisión' : 'Nueva revisión',
    body: `<form id="f" data-form="lp-mant">
      <input type="hidden" name="id" value="${esc(m?.id || '')}">
      <label class="f"><span>Qué se revisa</span><input name="title" maxlength="80" required value="${esc(m?.title || '')}" placeholder="Ej. Extintores"></label>
      <label class="f"><span>Cada cuánto</span><select name="every">${meses.map(x => `<option value="${x}" ${Number(m?.every || 6) === x ? 'selected' : ''}>${x === 1 ? 'Cada mes' : x === 12 ? 'Cada año' : x === 24 ? 'Cada dos años' : `Cada ${x} meses`}</option>`).join('')}</select></label>
      <label class="f"><span>Última vez que se hizo</span><input type="date" name="last" value="${esc(m?.last || '')}"></label>
      <label class="f"><span>Nota (opcional)</span><input name="notes" maxlength="80" value="${esc(m?.notes || '')}" placeholder="Ej. lo hace la empresa del mantenimiento"></label>
      ${!m && sugerencias.length ? `<p class="hint">O carga las de siempre:</p><div class="chips wrap">${sugerencias.map(s => `<button type="button" class="chip" data-a="lp-mant" data-sug="${esc(s.title)}">${esc(s.title)}</button>`).join('')}</div>` : ''}
      <div class="f-actions"><button type="submit" class="btn primary">Guardar</button>
        ${m ? `<button type="button" class="btn ghost danger" data-a="lp-del" data-id="${esc(m.id)}">Eliminar</button>` : ''}</div>
    </form>`,
  });
}

// ───────────── Guardar ─────────────
export function saveTurno(form, close) {
  const f = Object.fromEntries(new FormData(form));
  const date = String(f.date || '').slice(0, 10);
  if (!date) return toast('Pon el día');
  const id = String(f.id || '') || uid();
  store.upsert('limpieza', { ...(store.get('limpieza', id) || {}), id, kind: 'turno', date, groupId: String(f.groupId || ''), notes: String(f.notes || '').slice(0, 80) });
  close();
  toast('Turno guardado');
}

export function saveGen(form, close) {
  const f = new FormData(form);
  const grupos = f.getAll('g').map(String).filter(Boolean);
  if (!grupos.length) return toast('Elige al menos un grupo');
  const nuevos = repartir({
    desde: String(f.get('desde') || '').slice(0, 10),
    cadaDias: Number(f.get('cada')) || 7,
    veces: Math.min(52, Number(f.get('veces')) || 12),
    grupos,
  });
  if (!nuevos.length) return toast('Pon la fecha de inicio');
  // Si ya había un turno ese día, se reemplaza en vez de duplicarlo
  const porFecha = new Map(turnos().map(x => [x.date, x]));
  nuevos.forEach(n => {
    const previo = porFecha.get(n.date);
    store.upsert('limpieza', { ...(previo || {}), id: previo?.id || uid(), kind: 'turno', date: n.date, groupId: n.groupId, notes: previo?.notes || '' });
  });
  close();
  toast(`${nuevos.length} turnos repartidos`);
}

export function saveMant(form, close) {
  const f = Object.fromEntries(new FormData(form));
  const title = String(f.title || '').trim().slice(0, 80);
  if (!title) return toast('Pon qué se revisa');
  const id = String(f.id || '') || uid();
  store.upsert('limpieza', {
    ...(store.get('limpieza', id) || {}), id, kind: 'mant', title,
    every: Math.max(1, Math.min(24, Number(f.every) || 6)),
    last: String(f.last || '').slice(0, 10),
    notes: String(f.notes || '').slice(0, 80),
  });
  close();
  toast('Revisión guardada');
}

// El ✓ de la lista: queda hecha hoy y se recalcula la próxima
export function marcarHecho(id) {
  const m = store.get('limpieza', id);
  if (!m || m.kind !== 'mant') return;
  store.upsert('limpieza', { ...m, last: today() });
  const v = vence({ ...m, last: today() });
  toast(v.next ? `Hecho. La próxima toca el ${fmtShort(v.next)}` : 'Hecho');
}

export function del(id, close) {
  if (!store.get('limpieza', id)) return;
  store.remove('limpieza', id);
  close();
  toast('Eliminado');
}

export function texto() {
  const t = today();
  const prox = turnos().filter(x => x.date >= t).slice(0, 10);
  if (!prox.length) return 'Todavía no hay turnos de limpieza repartidos.';
  const lineas = ['*Limpieza del Salón del Reino*', ''];
  prox.forEach(x => lineas.push(`• ${fmtLong(x.date)} — ${nombreGrupo(x.groupId) || 'sin grupo'}`));
  const mal = mantPendientes(t);
  if (mal.length) {
    lineas.push('', '*Revisiones pendientes*');
    mal.forEach(m => lineas.push(`🔧 ${m.title}`));
  }
  return lineas.join('\n');
}

export const compartir = () => shareText(texto(), { title: 'Limpieza del Salón', copied: 'Turnos copiados' });
