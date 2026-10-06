// Programa de las reuniones: quién tiene cada parte entre semana y el fin de semana.
//
// Complementa las asignaciones mecánicas (js/mecas.js, que son acomodadores, audio, micrófonos…):
// aquí van las partes del programa en sí.
//
// Cada semana: { id, date, kind: 'semana' | 'finde', parts: [{ k, t, by }] }
//   · k = clave de la parte (para saber cuál es aunque se le cambie el nombre)
//   · t = cómo se llama la parte · by = a quién le toca
import * as store from './store.js';
import { data } from './store.js';
import * as M from './model.js';
import { ic, esc, uid, today, toast, fmtShort, fmtLong, norm, addDays, shareText } from './util.js';

// Las partes de siempre. Sirven de punto de partida: cada semana se puede cambiar, quitar o añadir.
export const PARTES = {
  semana: [
    { k: 'presi', t: 'Presidencia' },
    { k: 'ora1', t: 'Oración inicial' },
    { k: 'tesoros', t: 'Tesoros de la Biblia' },
    { k: 'perlas', t: 'Busquemos perlas escondidas' },
    { k: 'lectura', t: 'Lectura de la Biblia' },
    { k: 'maestros', t: 'Seamos mejores maestros' },
    { k: 'vida1', t: 'Nuestra vida cristiana' },
    { k: 'estudio', t: 'Estudio bíblico de la congregación' },
    { k: 'lector', t: 'Lector del estudio' },
    { k: 'ora2', t: 'Oración final' },
  ],
  finde: [
    { k: 'presi', t: 'Presidencia' },
    { k: 'ora1', t: 'Oración inicial' },
    { k: 'discurso', t: 'Discurso público' },
    { k: 'tema', t: 'Tema del discurso' },
    { k: 'atalaya', t: 'Conductor de La Atalaya' },
    { k: 'lector', t: 'Lector de La Atalaya' },
    { k: 'ora2', t: 'Oración final' },
  ],
};
export const TIPOS = [
  { k: 'semana', n: 'Entre semana' },
  { k: 'finde', n: 'Fin de semana' },
];
const nombreTipo = k => TIPOS.find(x => x.k === k)?.n || k;
// «Tema del discurso» es texto libre, no el nombre de un hermano
const esTexto = k => k === 'tema';

const lista = () => [...(data.programa || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
export const semanaDe = (date, kind) => lista().find(x => x.date === date && x.kind === kind) || null;

// Las próximas, de la más cercana a la más lejana
export const proximas = (t = today(), n = 6) => lista().filter(x => x.date >= t).reverse().slice(0, n);

// ¿Me toca algo? Se compara con mi nombre y con el de mi ficha
export function misPartes(t = today(), dias = 21) {
  const v = M.profile();
  const yo = data.people.find(p => p.isMe);
  const nombres = [v.myName, yo?.name].filter(Boolean).map(norm);
  if (!nombres.length) return [];
  const hasta = addDays(t, dias);
  const out = [];
  lista().filter(x => x.date >= t && x.date <= hasta).forEach(s => {
    (s.parts || []).forEach(p => {
      if (esTexto(p.k) || !p.by) return;
      const quien = norm(p.by);
      if (nombres.some(n => quien.includes(n) || n.includes(quien))) out.push({ semana: s, parte: p });
    });
  });
  return out.sort((a, b) => String(a.semana.date).localeCompare(String(b.semana.date)));
}

// Partes sin nadie, para no llegar a la reunión con un hueco
export const huecos = s => (s.parts || []).filter(p => !esTexto(p.k) && !String(p.by || '').trim()).length;

// ───────────── Pantalla ─────────────
function tarjetaSemana(s, t) {
  const falta = huecos(s);
  const partes = (s.parts || []).filter(p => String(p.by || '').trim());
  return `<button class="card mini pg-card ${falta ? 'late' : ''}" data-a="pg-new" data-id="${esc(s.id)}">
    <strong>${esc(nombreTipo(s.kind))} · ${esc(fmtShort(s.date))}${s.date === t ? ' · hoy' : ''}</strong>
    <span class="meta">${partes.length ? esc(partes.slice(0, 3).map(p => `${p.t}: ${p.by}`).join(' · ')) : 'Sin nadie asignado todavía'}${partes.length > 3 ? '…' : ''}</span>
    ${falta ? `<span class="meta"><b class="late">${falta} ${falta === 1 ? 'parte sin asignar' : 'partes sin asignar'}</b></span>` : ''}
  </button>`;
}

export function programaSection() {
  const t = today();
  const prox = proximas(t);
  const mias = misPartes(t);
  return `<section><div class="sec-h"><h2>${ic('mic')}Programa de las reuniones</h2>${prox.length ? `<span class="hint">${prox.length} ${prox.length === 1 ? 'próxima' : 'próximas'}</span>` : ''}</div>
    ${mias.length ? `<div class="card pg-mine"><strong>${ic('flag', 'sm')} Te toca</strong>
      ${mias.map(({ semana, parte }) => `<span class="meta">${esc(parte.t)} · ${esc(fmtLong(semana.date))}</span>`).join('')}</div>` : ''}
    ${prox.length ? `<div class="stack">${prox.map(s => tarjetaSemana(s, t)).join('')}</div>`
    : '<p class="hint pad">Anota quién tiene cada parte para tenerlo a mano y poder enviarlo.</p>'}
    <div class="org-tools">
      <button class="btn small ${prox.length ? 'ghost' : 'primary'}" data-a="pg-new" data-v="semana">${ic('plus', 'sm')} Entre semana</button>
      <button class="btn small ${prox.length ? 'ghost' : 'primary'}" data-a="pg-new" data-v="finde">${ic('plus', 'sm')} Fin de semana</button>
      ${prox.length ? `<button class="btn small ghost" data-a="pg-share" data-id="${esc(prox[0].id)}">${ic('chat', 'sm')} Compartir la próxima</button>` : ''}
    </div>
  </section>`;
}

export function hoyNotices() {
  if (!M.isModuleVisible('congregacion') || !M.featureOn('congregacion.programa')) return [];
  const t = today();
  const mias = misPartes(t, 7);
  if (!mias.length) return [];
  const { semana, parte } = mias[0];
  const cuando = semana.date === t ? 'hoy' : semana.date === addDays(t, 1) ? 'mañana' : `el ${fmtLong(semana.date)}`;
  return [`<button class="log-now" data-a="nav" data-v="congregacion">🎤 <span><b>Te toca «${esc(parte.t)}» ${esc(cuando)}</b><small>${esc(nombreTipo(semana.kind))}${mias.length > 1 ? ` · y ${mias.length - 1} parte${mias.length > 2 ? 's' : ''} más esta semana` : ''}. Toca para verlo.</small></span></button>`];
}

// ───────────── Hoja ─────────────
export function sheet(open, id = '', kind = 'semana') {
  const s = id ? store.get('programa', id) : null;
  const tipo = s?.kind || (kind === 'finde' ? 'finde' : 'semana');
  const partes = s?.parts?.length ? s.parts : PARTES[tipo].map(p => ({ ...p, by: '' }));
  // Para sugerir nombres mientras se escribe
  const gente = [...new Set(data.people.map(p => p.name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  open({
    title: s ? `${nombreTipo(tipo)} · ${fmtShort(s.date)}` : `Programa · ${nombreTipo(tipo)}`,
    body: `<form id="f" data-form="programa">
      <input type="hidden" name="id" value="${esc(s?.id || '')}">
      <input type="hidden" name="kind" value="${esc(tipo)}">
      <label class="f"><span>Día de la reunión</span><input type="date" name="date" value="${esc(s?.date || today())}" required></label>
      <datalist id="pg-gente">${gente.map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist>
      <fieldset class="f"><legend>Partes</legend>
        ${partes.map((p, i) => `<label class="f pg-part">
          <span>${esc(p.t)}</span>
          <input name="by_${i}" maxlength="120" value="${esc(p.by || '')}" placeholder="${esTexto(p.k) ? 'Tema del discurso' : 'Nombre'}" ${esTexto(p.k) ? '' : 'list="pg-gente"'}>
          <input type="hidden" name="k_${i}" value="${esc(p.k)}">
          <input type="hidden" name="t_${i}" value="${esc(p.t)}">
        </label>`).join('')}
      </fieldset>
      <p class="hint">Deja en blanco lo que no se sepa todavía: la app avisa de las partes que quedan sin asignar.</p>
      <div class="f-actions"><button type="submit" class="btn primary">Guardar</button>
        ${s ? `<button type="button" class="btn ghost" data-a="pg-share" data-id="${esc(s.id)}">Compartir</button>
               <button type="button" class="btn ghost danger" data-a="pg-del" data-id="${esc(s.id)}">Eliminar</button>` : ''}</div>
    </form>`,
  });
}

export function save(form, close) {
  const f = Object.fromEntries(new FormData(form));
  const date = String(f.date || '').slice(0, 10);
  if (!date) return toast('Pon el día de la reunión');
  const kind = f.kind === 'finde' ? 'finde' : 'semana';
  const parts = [];
  for (let i = 0; `k_${i}` in f; i++) {
    parts.push({ k: String(f[`k_${i}`]), t: String(f[`t_${i}`]).slice(0, 60), by: String(f[`by_${i}`] || '').trim().slice(0, 120) });
  }
  // Una sola entrada por reunión: si ya existe la de ese día y tipo, se actualiza
  const previa = lista().find(x => x.date === date && x.kind === kind && x.id !== f.id);
  const id = String(f.id || '') || previa?.id || uid();
  store.upsert('programa', { ...(store.get('programa', id) || {}), id, date, kind, parts });
  close();
  toast('Programa guardado');
}

export function del(id, close) {
  if (!store.get('programa', id)) return;
  store.remove('programa', id);
  close();
  toast('Programa eliminado');
}

// ───────────── Compartir ─────────────
export function texto(id) {
  const s = store.get('programa', id);
  if (!s) return '';
  const lineas = [`*${nombreTipo(s.kind)} · ${fmtLong(s.date)}*`, ''];
  (s.parts || []).forEach(p => {
    const v = String(p.by || '').trim();
    lineas.push(`• ${p.t}: ${v || '—'}`);
  });
  const falta = huecos(s);
  if (falta) lineas.push('', `Faltan ${falta} por asignar.`);
  return lineas.join('\n');
}

export const compartir = id => shareText(texto(id), { title: 'Programa de la reunión', copied: 'Programa copiado' });
