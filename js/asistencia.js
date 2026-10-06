// Asistencia a las reuniones: se anota por reunión, separando los que vienen al Salón de los que
// se conectan por videoconferencia. Con eso sale el promedio del mes (lo que se informa) y el del
// año de servicio, listos para enviar.
//
// Cada registro: { id, date, kind: 'semana' | 'finde', presencial, online, notes }
import * as store from './store.js';
import { data } from './store.js';
import * as M from './model.js';
import { ic, esc, uid, today, toast, fmtShort, fmtMonth, shareText } from './util.js';
import { printDoc } from './imprimir.js';

export const TIPOS = [
  { k: 'semana', n: 'Entre semana', ic: 'calendar' },
  { k: 'finde', n: 'Fin de semana', ic: 'users' },
];
const nombreTipo = k => TIPOS.find(t => t.k === k)?.n || k;

const lista = () => (data.asistencia || []);
const total = r => (Number(r.presencial) || 0) + (Number(r.online) || 0);
const delMes = (ym, k) => lista().filter(r => String(r.date || '').startsWith(ym) && (!k || r.kind === k));

// Promedio de un grupo de reuniones. Se redondea como se informa: al entero más cercano.
export function promedio(registros) {
  const n = registros.length;
  if (!n) return null;
  const suma = (campo) => registros.reduce((t, r) => t + (Number(r[campo]) || 0), 0);
  const p = suma('presencial'), o = suma('online');
  const med = x => Math.round(x / n);
  return { reuniones: n, presencial: p, online: o, total: p + o, mPresencial: med(p), mOnline: med(o), mTotal: med(p + o) };
}

export const promedioMes = (ym, k) => promedio(delMes(ym, k));

// Año de servicio (septiembre a agosto), por si el superintendente lo pide completo
export function promedioAnio(startYear = M.serviceYearStart(), k) {
  const meses = M.serviceYearMonths(startYear).map(m => m.id);
  return promedio(lista().filter(r => meses.includes(String(r.date || '').slice(0, 7)) && (!k || r.kind === k)));
}

export const mesesConDatos = () => [...new Set(lista().map(r => String(r.date || '').slice(0, 7)).filter(Boolean))].sort().reverse();

// ───────────── Texto para enviar ─────────────
export function textoMes(ym) {
  const [y, m] = ym.split('-').map(Number);
  const lineas = [`*Asistencia · ${fmtMonth(y, m)}*`];
  TIPOS.forEach(t => {
    const p = promedioMes(ym, t.k);
    if (!p) return;
    lineas.push('', `*${t.n}* (${p.reuniones} ${p.reuniones === 1 ? 'reunión' : 'reuniones'})`,
      `Promedio: ${p.mTotal}  ·  Salón ${p.mPresencial} · videoconferencia ${p.mOnline}`);
  });
  if (lineas.length === 1) return `Todavía no hay asistencia anotada en ${fmtMonth(y, m)}.`;
  return lineas.join('\n');
}

// ───────────── Pantalla (dentro de Congregación) ─────────────
function tarjetaTipo(ym, t) {
  const p = promedioMes(ym, t.k);
  return `<div class="as-card">
    <div class="as-top">${ic(t.ic, 'sm')} <b>${esc(t.n)}</b>${p ? `<span class="hint">${p.reuniones} ${p.reuniones === 1 ? 'reunión' : 'reuniones'}</span>` : ''}</div>
    ${p ? `<div class="as-n">${p.mTotal}</div>
      <div class="as-split"><span><b>${p.mPresencial}</b> en el Salón</span><span><b>${p.mOnline}</b> por videoconferencia</span></div>`
    : '<p class="hint">Sin reuniones anotadas este mes.</p>'}</div>`;
}

function fila(r) {
  const t = total(r);
  return `<button class="card mini as-row" data-a="as-new" data-id="${esc(r.id)}">
    <strong>${esc(fmtShort(r.date))} · ${esc(nombreTipo(r.kind))}</strong>
    <span class="meta"><b>${t}</b> en total · ${Number(r.presencial) || 0} en el Salón · ${Number(r.online) || 0} por videoconferencia${r.notes ? ` · ${esc(r.notes)}` : ''}</span>
  </button>`;
}

export function asistenciaSection(st = {}) {
  const meses = mesesConDatos();
  const actual = today().slice(0, 7);
  const ym = st.asMes && (meses.includes(st.asMes) || st.asMes === actual) ? st.asMes : actual;
  const [y, m] = ym.split('-').map(Number);
  const delMesOrdenadas = delMes(ym).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const anio = promedioAnio();
  const opciones = [...new Set([actual, ...meses])].sort().reverse();
  return `<section><div class="sec-h"><h2>${ic('chart')}Asistencia</h2>${delMesOrdenadas.length ? `<span class="hint">${delMesOrdenadas.length} este mes</span>` : ''}</div>
    <div class="pad"><label class="mini-f"><span>Mes</span><select id="as-mes">${opciones.map(o => {
      const [yy, mm] = o.split('-').map(Number);
      return `<option value="${esc(o)}" ${o === ym ? 'selected' : ''}>${esc(fmtMonth(yy, mm))}</option>`;
    }).join('')}</select></label></div>
    <div class="as-grid">${TIPOS.map(t => tarjetaTipo(ym, t)).join('')}</div>
    ${anio ? `<p class="hint pad">Año de servicio ${M.serviceYearStart()}–${M.serviceYearStart() + 1}: ${anio.reuniones} reuniones · promedio ${anio.mTotal} (Salón ${anio.mPresencial} · videoconferencia ${anio.mOnline}).</p>` : ''}
    <div class="org-tools"><button class="btn small primary" data-a="as-new">${ic('plus', 'sm')} Anotar asistencia</button>
      ${delMesOrdenadas.length ? `<button class="btn small ghost" data-a="as-print" data-v="${esc(ym)}">🖨 Imprimir</button>
        <button class="btn small ghost" data-a="as-share" data-v="${esc(ym)}">${ic('chat', 'sm')} Enviar el promedio</button>` : ''}</div>
    ${delMesOrdenadas.length ? `<div class="stack">${delMesOrdenadas.map(fila).join('')}</div>`
    : `<p class="hint pad">Anota cuántos asistieron a cada reunión de ${esc(fmtMonth(y, m))}. La app saca el promedio sola.</p>`}
  </section>`;
}

// ───────────── Hoja para anotar ─────────────
export function sheet(open, id = '') {
  const r = id ? store.get('asistencia', id) : null;
  const hoy = today();
  // Por defecto, el tipo que toca segun el dia: domingo o sabado = fin de semana
  const d = new Date();
  const tipoSugerido = [0, 6].includes(d.getDay()) ? 'finde' : 'semana';
  open({
    title: r ? 'Asistencia' : 'Anotar asistencia',
    body: `<form id="f" data-form="asistencia">
      <input type="hidden" name="id" value="${esc(r?.id || '')}">
      <label class="f"><span>Fecha</span><input type="date" name="date" value="${esc(r?.date || hoy)}" required></label>
      <label class="f"><span>Reunión</span><select name="kind">${TIPOS.map(t => `<option value="${t.k}" ${(r?.kind || tipoSugerido) === t.k ? 'selected' : ''}>${t.n}</option>`).join('')}</select></label>
      <div class="two">
        <label class="f"><span>En el Salón</span><input type="number" name="presencial" min="0" max="9999" inputmode="numeric" value="${esc(r?.presencial ?? '')}" placeholder="0"></label>
        <label class="f"><span>Por videoconferencia</span><input type="number" name="online" min="0" max="9999" inputmode="numeric" value="${esc(r?.online ?? '')}" placeholder="0"></label>
      </div>
      <label class="f"><span>Nota (opcional)</span><input name="notes" maxlength="80" value="${esc(r?.notes || '')}" placeholder="Ej. semana de la visita"></label>
      <p class="hint">Se cuentan por separado para que el promedio del mes salga como se informa.</p>
      <div class="f-actions"><button type="submit" class="btn primary">Guardar</button>
        ${r ? `<button type="button" class="btn ghost danger" data-a="as-del" data-id="${esc(r.id)}">Eliminar</button>` : ''}</div>
    </form>`,
  });
}

export function save(form, close) {
  const f = Object.fromEntries(new FormData(form));
  const date = String(f.date || '').slice(0, 10);
  if (!date) return toast('Pon la fecha de la reunión');
  const num = v => Math.max(0, Math.min(9999, Math.round(Number(v) || 0)));
  const presencial = num(f.presencial), online = num(f.online);
  if (!presencial && !online) return toast('Pon cuántos asistieron');
  const kind = f.kind === 'finde' ? 'finde' : 'semana';
  // Una sola anotación por reunión: si ya hay una de esa fecha y tipo, se actualiza
  const previa = lista().find(x => x.date === date && x.kind === kind && x.id !== f.id);
  const id = String(f.id || '') || previa?.id || uid();
  store.upsert('asistencia', { ...(store.get('asistencia', id) || {}), id, date, kind, presencial, online, notes: String(f.notes || '').slice(0, 80) });
  close();
  toast(previa && !f.id ? 'Se actualizó la de ese día' : 'Asistencia guardada');
}

export function del(id, close) {
  if (!store.get('asistencia', id)) return;
  store.remove('asistencia', id);
  close();
  toast('Anotación eliminada');
}

export const compartirMes = ym => shareText(textoMes(ym), { title: 'Asistencia', copied: 'Promedio copiado' });

// Hoja para el tablero: el informe de asistencia del mes
export function imprimir(ym) {
  const [y, m] = String(ym).split('-').map(Number);
  const reg = delMes(ym).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (!reg.length) return toast('Ese mes no tiene asistencia anotada');
  const filas = reg.map(r => `<tr><td class="d">${esc(fmtShort(r.date))}</td><td>${esc(nombreTipo(r.kind))}</td><td class="g">${(Number(r.presencial) || 0) + (Number(r.online) || 0)}</td><td>${Number(r.presencial) || 0}</td><td>${Number(r.online) || 0}</td></tr>`).join('');
  const prom = TIPOS.map(t => {
    const p = promedioMes(ym, t.k);
    return p ? `<tr><td class="g">${esc(t.n)}</td><td>${p.reuniones}</td><td class="g">${p.mTotal}</td><td>${p.mPresencial}</td><td>${p.mOnline}</td></tr>` : '';
  }).join('');
  printDoc(`Informe de asistencia · ${fmtMonth(y, m)}`, `
    <table class="pr-tabla"><thead><tr><th>Promedio</th><th>Reuniones</th><th>Total</th><th>En el Salón</th><th>Videoconferencia</th></tr></thead><tbody>${prom}</tbody></table>
    <h2 style="font:700 12px/1.3 system-ui;margin:16px 0 4px">Reunión por reunión</h2>
    <table class="pr-tabla"><thead><tr><th>Fecha</th><th>Reunión</th><th>Total</th><th>En el Salón</th><th>Videoconferencia</th></tr></thead><tbody>${filas}</tbody></table>`);
}
