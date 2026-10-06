// Tablero de anuncios: los papeles que están puestos en el tablero del Salón, a mano desde el
// teléfono. Cada uno guarda un enlace (a la carpeta compartida, a jw.org, a un PDF…) o solo una
// nota de quién lo tiene y cuándo se cambió, para saber de un vistazo cuál quedó viejo.
//
// Cada documento: { id, title, url, notes, date, every, order }
//   · date  = cuándo se puso o se actualizó por última vez
//   · every = cada cuántos meses se renueva (0 = no caduca). Si pasa el tiempo, se marca.
import * as store from './store.js';
import { data } from './store.js';
import * as M from './model.js';
import { ic, esc, uid, today, toast, fmtShort, diffDays, shareText } from './util.js';

// Los de siempre, en el orden en que suelen estar en el tablero. «every» = meses que duran.
export const SUGERIDOS = [
  { title: 'Programa de servicio del campo', every: 1 },
  { title: 'Programa de predicación pública', every: 1 },
  { title: 'Programa para la reunión de entre semana', every: 2 },
  { title: 'Programa para la reunión del fin de semana', every: 2 },
  { title: 'Asignaciones de tareas', every: 1 },
  { title: 'Limpieza del Salón del Reino', every: 1 },
  { title: 'Organigrama', every: 0 },
  { title: 'Grupos para el servicio del campo', every: 0 },
  { title: 'Mapa de la congregación', every: 0 },
  { title: 'Informe de asistencia a las reuniones', every: 1 },
  { title: 'Programa de mantenimiento preventivo', every: 0 },
  { title: 'Aviso de la visita del superintendente de circuito', every: 0 },
  { title: 'Aviso de las próximas asambleas de circuito', every: 0 },
  { title: 'Informe mensual de las cuentas de la congregación', every: 1 },
];

const lista = () => [...(data.tablero || [])].sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || String(a.title).localeCompare(String(b.title), 'es'));

// Cuándo le toca renovarse y si ya se pasó
export function estado(d, t = today()) {
  const cada = Number(d.every) || 0;
  if (!cada || !d.date) return { vence: '', vencido: false, dias: null };
  const f = new Date(`${d.date}T00:00:00`);
  f.setMonth(f.getMonth() + cada);
  const vence = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
  return { vence, vencido: vence < t, dias: diffDays(vence, t) };
}

export const vencidos = (t = today()) => lista().filter(d => estado(d, t).vencido);

// ───────────── Pantalla ─────────────
function fila(d, t) {
  const e = estado(d, t);
  const sub = [
    d.date ? `${e.vencido ? 'desde' : 'puesto el'} ${fmtShort(d.date)}` : '',
    e.vencido ? `<b class="late">toca cambiarlo</b>` : e.vence ? `se renueva el ${fmtShort(e.vence)}` : '',
    d.notes ? esc(d.notes) : '',
  ].filter(Boolean).join(' · ');
  return `<div class="tb-row ${e.vencido ? 'late' : ''}">
    <button class="card mini tb-doc" data-a="tb-new" data-id="${esc(d.id)}">
      <strong>${ic('clip', 'sm')} ${esc(d.title)}</strong>
      ${sub ? `<span class="meta">${sub}</span>` : ''}
    </button>
    ${d.url ? `<a class="wa-side" href="${esc(d.url)}" target="_blank" rel="noopener" aria-label="Abrir ${esc(d.title)}" title="Abrir">${ic('eye')}</a>` : ''}
  </div>`;
}

export function tableroSection() {
  const t = today();
  const docs = lista();
  const mal = docs.filter(d => estado(d, t).vencido).length;
  return `<section><div class="sec-h"><h2>${ic('clip')}Tablero de anuncios</h2>${docs.length ? `<span class="hint">${mal ? `${mal} por cambiar` : `${docs.length} al día`}</span>` : ''}</div>
    ${docs.length ? `<div class="stack tb-list">${docs.map(d => fila(d, t)).join('')}</div>
      <div class="org-tools"><button class="btn small" data-a="tb-new">${ic('plus', 'sm')} Agregar</button>
        <button class="btn small ghost" data-a="tb-share">${ic('chat', 'sm')} Compartir la lista</button></div>
      <p class="hint pad">Toca uno para poner su enlace o apuntar cuándo lo cambiaste. Los que se renuevan cada mes se marcan solos cuando les toca.</p>`
    : `<p class="hint pad">Ten a mano lo que está puesto en el tablero: su enlace y cuándo se cambió por última vez.</p>
      <div class="stack"><button class="btn primary" data-a="tb-sugeridos">Cargar los del tablero</button>
        <button class="btn" data-a="tb-new">Empezar desde cero</button></div>`}
  </section>`;
}

// Avisos de Hoy: si hay papeles que ya tocaba cambiar
export function hoyNotices() {
  if (!M.isModuleVisible('congregacion') || !M.featureOn('congregacion.tablero')) return [];
  const v = vencidos();
  if (!v.length) return [];
  return [`<button class="log-now" data-a="nav" data-v="congregacion">📌 <span><b>${v.length === 1 ? 'Un papel del tablero' : `${v.length} papeles del tablero`} por cambiar</b><small>${esc(v.slice(0, 2).map(d => d.title).join(' · '))}${v.length > 2 ? ` y ${v.length - 2} más` : ''}. Toca para verlos.</small></span></button>`];
}

// ───────────── Guardar ─────────────
export function cargarSugeridos() {
  const t = today();
  const hay = new Set((data.tablero || []).map(d => String(d.title).toLowerCase()));
  let n = 0;
  SUGERIDOS.forEach((s, i) => {
    if (hay.has(s.title.toLowerCase())) return;
    store.upsert('tablero', { id: uid(), title: s.title, every: s.every, url: '', notes: '', date: t, order: i });
    n++;
  });
  toast(n ? `Listo: ${n} ${n === 1 ? 'documento' : 'documentos'}` : 'Ya los tenías todos');
}

export function sheet(open, id = '') {
  const d = id ? store.get('tablero', id) : null;
  const meses = [0, 1, 2, 3, 6, 12];
  open({
    title: d ? 'Documento del tablero' : 'Agregar al tablero',
    body: `<form id="f" data-form="tablero">
      <input type="hidden" name="id" value="${esc(d?.id || '')}">
      <label class="f"><span>Qué es</span><input name="title" maxlength="80" required value="${esc(d?.title || '')}" placeholder="Ej. Programa de servicio del campo"></label>
      <label class="f"><span>Enlace (opcional)</span><input name="url" type="url" inputmode="url" maxlength="400" value="${esc(d?.url || '')}" placeholder="https://…"></label>
      <label class="f"><span>Puesto o cambiado el</span><input type="date" name="date" value="${esc(d?.date || today())}"></label>
      <label class="f"><span>Se renueva</span><select name="every">${meses.map(m => `<option value="${m}" ${Number(d?.every || 0) === m ? 'selected' : ''}>${m === 0 ? 'No caduca' : m === 1 ? 'Cada mes' : `Cada ${m} meses`}</option>`).join('')}</select></label>
      <label class="f"><span>Nota (opcional)</span><input name="notes" maxlength="100" value="${esc(d?.notes || '')}" placeholder="Ej. lo imprime el hermano encargado"></label>
      <p class="hint">El enlace puede ser a la carpeta compartida, a jw.org o a un PDF. Si no hay enlace, sirve igual para saber cuándo toca cambiarlo.</p>
      <div class="f-actions"><button type="submit" class="btn primary">Guardar</button>
        ${d ? `<button type="button" class="btn ghost danger" data-a="tb-del" data-id="${esc(d.id)}">Eliminar</button>` : ''}</div>
    </form>`,
  });
}

export function save(form, close) {
  const f = Object.fromEntries(new FormData(form));
  const title = String(f.title || '').trim().slice(0, 80);
  if (!title) return toast('Ponle un nombre');
  const url = String(f.url || '').trim().slice(0, 400);
  // Solo enlaces de internet: no se aceptan javascript: ni otros esquemas
  if (url && !/^https?:\/\//i.test(url)) return toast('El enlace tiene que empezar por https://');
  const id = String(f.id || '') || uid();
  const previo = store.get('tablero', id);
  store.upsert('tablero', {
    ...(previo || {}), id, title, url,
    date: String(f.date || '').slice(0, 10),
    every: Math.max(0, Math.min(12, Number(f.every) || 0)),
    notes: String(f.notes || '').slice(0, 100),
    order: previo?.order ?? (data.tablero || []).length,
  });
  close();
  toast('Guardado');
}

export function del(id, close) {
  if (!store.get('tablero', id)) return;
  store.remove('tablero', id);
  close();
  toast('Quitado del tablero');
}

export function texto() {
  const t = today();
  const docs = lista();
  if (!docs.length) return 'El tablero está vacío.';
  const lineas = ['*Tablero de anuncios*'];
  docs.forEach(d => {
    const e = estado(d, t);
    lineas.push(`${e.vencido ? '🔴' : '•'} ${d.title}${d.date ? ` — ${fmtShort(d.date)}` : ''}${e.vencido ? ' (toca cambiarlo)' : ''}`);
  });
  const mal = docs.filter(d => estado(d, t).vencido).length;
  lineas.push('', mal ? `${mal} por cambiar de ${docs.length}.` : `Los ${docs.length} están al día.`);
  return lineas.join('\n');
}

export const compartir = () => shareText(texto(), { title: 'Tablero de anuncios', copied: 'Lista copiada' });
