// Compartir con los ancianos: un enlace y una clave de 6 números para ver el organigrama, los acuerdos y tareas,
// la visita del superintendente de circuito y las asignaciones mecánicas, sin instalar la app ni tener cuenta.
//
// Seguridad: el contenido se cifra en este teléfono (AES-GCM) con una llave que sale del secreto del enlace
// (lo que va después de «#», que no llega a ningún servidor) y de la clave de 6 números. En la nube solo queda
// un texto ilegible (shares/{id}). Cambiar la clave o apagar el enlace deja sin efecto el anterior.
import { data } from './store.js';
import * as store from './store.js';
import * as M from './model.js';
import { esc, today, toast, fmtShort, addDays, dateOf, shareText, isPhone } from './util.js';
import * as V from './visita.js';
import { mecaStats, rowPerson, programOf } from './mecas.js';
import * as A from './agenda.js';

export const SECTIONS = [
  ['agenda', '🗓 Agenda de la próxima reunión', 'Los puntos, a qué hora empieza cada uno y quién lo presenta (sin los privados ni los detalles de los confidenciales)'],
  ['org', '🏛 Organigrama', 'Departamentos, responsables y ayudantes'],
  ['acuerdos', '📋 Acuerdos y tareas', 'De las reuniones que elijas, con responsable, fecha y si ya están hechos'],
  ['visita', '🧳 Visita del superintendente', 'Lo que hay que preparar, quién lo prepara y las fechas límite'],
  ['mecas', '🎛 Asignaciones mecánicas', 'El arreglo actual y quiénes no se están usando'],
];
const ITER = 600000;
const VIEWER = 'ver.html';
const S = () => import('./sheets.js');

// ───── Cifrado ─────
const enc = new TextEncoder();
export const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const rand = n => crypto.getRandomValues(new Uint8Array(n));
export async function shareIdOf(secret) {
  const h = await crypto.subtle.digest('SHA-256', enc.encode(`mi-agenda-share:${secret}`));
  return b64u(h).slice(0, 22);
}
export async function deriveKey(secret, code, salt, iter = ITER) {
  const base = await crypto.subtle.importKey('raw', enc.encode(`${secret}:${code}`), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
const newCode = () => { const x = new Uint32Array(1); let n; do { crypto.getRandomValues(x); n = x[0]; } while (n >= 4294000000); return String(n % 1000000).padStart(6, '0'); };
// Clave larga (opcional): 10 letras y números, sin los que se confunden (0/O, 1/I/L)
const LONG_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newLongCode = () => { const out = []; const x = new Uint8Array(1); while (out.length < 10) { crypto.getRandomValues(x); if (x[0] < 248) out.push(LONG_ABC[x[0] % LONG_ABC.length]); } return out.join(''); };
export const fmtCode = code => (/^\d{6}$/.test(code) ? code.replace(/(\d{3})(\d{3})/, '$1 $2') : String(code).replace(/(.{5})(?=.)/, '$1-'));
async function sha(text) { return b64u(await crypto.subtle.digest('SHA-256', enc.encode(text))).slice(0, 24); }

// ───── Lo que se comparte ─────
const cfg = () => M.profile().share || null;
// Las partes que se comparten. «Agenda» es nueva (9.8): en los enlaces ya creados se agrega sola, salvo que la quites.
export const sectionsOf = c => { const all = SECTIONS.map(x => x[0]); if (!c?.sections) return all; return c.sections.includes('agenda') || c.agendaOff ? c.sections : ['agenda', ...c.sections]; };
// La próxima reunión del cuerpo de ancianos con agenda (o, si no hay, la próxima reunión con agenda)
export function nextAgendaMeeting() {
  const t = today();
  const up = data.meetings.filter(m => (m.date || '') >= t && (m.agenda || []).some(x => !x.priv)).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  return up.find(m => /ancianos|cuerpo/i.test(m.title || '')) || up[0] || null;
}
function agendaSnap() {
  const m = nextAgendaMeeting();
  if (!m) return null;
  const list = A.sortByBlock((m.agenda || []).filter(x => !x.priv));
  const prayer = true;
  const sch = A.schedule(list, m.time, prayer);
  const pr = m.prayers || {};
  const total = A.agendaTotal(list, prayer);
  return {
    t: m.title || 'Reunión', d: m.date || '', time: m.time || '', place: m.place || '',
    end: m.time && total ? A.endTime(m.time, total) : '', total,
    pStart: { at: sch.prayerStart || '', who: pr.start || '' }, pEnd: { at: sch.prayerEnd || '', who: pr.end || '' },
    items: list.map(x => ({ t: x.t || '', at: sch.items[x.id] || '', by: A.joinNames(A.splitNames(x.by)), min: Number(x.min) || 0, k: A.AGENDA_KINDS[x.kind || 'informar']?.n || '', conf: x.conf ? 1 : 0, ref: x.ref ? A.formatRef(x.ref) : '', subs: x.conf ? [] : (x.subs || []) })),
  };
}
export const isActive = () => !!cfg()?.secret;
// Reuniones con acuerdos (las más recientes primero)
export const meetingsWithAgreements = () => [...data.meetings].filter(m => (m.date || '') <= addDays(today(), 7) && M.parseAgreements(m).length)
  .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
// «auto» = la última reunión con acuerdos (cambia sola cuando haces otra); además, las que elijas
function chosenMeetings(c) {
  const all = meetingsWithAgreements();
  const list = Array.isArray(c.meetings) ? c.meetings : ['auto'];
  const out = [...(list.includes('auto') ? all.slice(0, 1) : []), ...list.filter(id => id !== 'auto').map(id => all.find(m => m.id === id)).filter(Boolean)];
  return out.filter((m, i) => out.findIndex(x => x.id === m.id) === i).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}
const taskState = t => (!t ? 'Sin tarea' : t.status === 'hecha' ? 'Hecha' : t.due && t.due < today() ? 'Atrasada' : M.STATUS[t.status] || 'Pendiente');
function orgSnap() {
  const node = n => ({ n: n.d.name || '', g: M.isGroupBox(n.d) ? 1 : 0, h: M.isGroupBox(n.d) ? [] : M.deptHeadsLabeled(n.d), a: M.deptHelpers(n.d), c: n.children.map(node) });
  return M.deptTree().map(node);
}
function acuerdosSnap(c) {
  return chosenMeetings(c).map(m => {
    const ags = M.parseAgreements(m);
    const used = new Set(ags.map(a => a.task?.id).filter(Boolean));
    return {
      t: m.title || 'Reunión', d: m.date || '',
      items: ags.map(a => ({ t: a.task?.title || a.title, who: a.task ? (a.task.responsibles || []) : a.responsibles, due: a.task?.due || a.due || '', st: taskState(a.task), det: a.details || [] })),
      extra: data.tasks.filter(t => t.meetingId === m.id && !used.has(t.id)).map(t => ({ t: t.title, who: t.responsibles || [], due: t.due || '', st: taskState(t) })),
    };
  });
}
function visitaSnap() {
  const v = V.currentVisit();
  if (!v) return null;
  const p = V.progress(v);
  const names = ids => (ids || []).map(M.personName).filter(Boolean);
  const heads = { coord: M.headsOf('coord'), secre: M.headsOf('secre'), serv: M.headsOf('serv') };
  return {
    start: v.start, done: p.done, total: p.total,
    groups: Object.entries(V.GROUPS).map(([g, x]) => ({
      n: x.n, ic: x.ic, who: (heads[g] || []).map(h => h.name),
      items: V.VISIT_ITEMS.filter(i => i.g === g).map(it => {
        const s = v.items?.[it.k] || {};
        const st = it.q ? ({ si: 'Sí', no: 'No', na: 'N/A' }[s.ans] || 'Falta') : s.na ? 'No aplica' : s.done ? 'Listo' : 'Falta';
        const note = it.k === 'pastoreo' ? [names(s.ids).join(', '), s.note ? `Acompaña: ${s.note}` : ''].filter(Boolean).join(' · ') : (s.note || '');
        return { t: it.t, st, due: it.due != null ? addDays(v.start, it.due) : '', note };
      }),
    })),
  };
}
function mecasSnap() {
  const imps = [...(data.mecas || [])].sort((a, b) => (b.to || '').localeCompare(a.to || ''));
  if (!imps.length) return null;
  const t = today();
  const cur = imps.filter(x => (x.to || '') >= addDays(t, -7)).slice(0, 2);
  const show = cur.length ? cur : imps.slice(0, 1);
  const s = mecaStats(3);
  return {
    arreglos: show.map(x => {
      const byD = {};
      (x.rows || []).forEach(r => { (byD[r.d || ''] = byD[r.d || ''] || []).push({ r: r.r, n: rowPerson(r)?.name || r.n }); });
      return { t: x.title || 'Arreglo', from: x.from || '', to: x.to || '', roles: programOf(x).roles, days: Object.keys(byD).sort().map(d => ({ d, rows: byD[d] })) };
    }),
    notUsed: s.notUsed.map(p => p.name), heavy: s.heavy.map(b => `${b.p.name} (${b.n})`),
  };
}
export function snapshot(c = cfg() || {}) {
  const sec = sectionsOf(c);
  const v = M.profile();
  return {
    v: 1, by: v.myName || '', congre: v.congre?.name || '',
    agenda: sec.includes('agenda') ? agendaSnap() : null,
    org: sec.includes('org') ? orgSnap() : null,
    acuerdos: sec.includes('acuerdos') ? acuerdosSnap(c) : null,
    visita: sec.includes('visita') ? visitaSnap() : null,
    mecas: sec.includes('mecas') ? mecasSnap() : null,
  };
}

// ───── Guardar en la nube (cifrado) ─────
let keyCache = null;
async function keyFor(c) {
  const k = `${c.secret}|${c.code}|${c.salt}`;
  if (keyCache?.k !== k) keyCache = { k, key: await deriveKey(c.secret, c.code, unb64u(c.salt), c.iter || ITER) };
  return keyCache.key;
}
// El documento cifrado que se guarda en la nube (sin la clave nadie lo puede leer)
export async function sealed(c, snap = snapshot(c)) {
  const iv = rand(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFor(c), enc.encode(JSON.stringify({ ...snap, at: new Date().toISOString() })));
  return { v: c.codeLong ? 2 : 1, salt: c.salt, iv: b64u(iv), iter: c.iter || ITER, ct: b64u(ct), updatedAt: new Date().toISOString() };
}
// Cifra lo de ahora y lo sube; devuelve la huella (hash) para no volver a subir lo mismo
async function publish(c, force = false) {
  const snap = snapshot(c);
  const hash = await sha(JSON.stringify(snap));
  if (!force && hash === c.hash) return null;
  await store.shareSave(c.id || await shareIdOf(c.secret), await sealed(c, snap));
  return hash;
}
export const newConfig = (sections = SECTIONS.map(x => x[0]), meetings = ['auto'], long = false) => {
  const secret = b64u(rand(16));
  return shareIdOf(secret).then(id => ({ secret, id, code: long ? newLongCode() : newCode(), ...(long ? { codeLong: true } : {}), salt: b64u(rand(16)), iter: ITER, sections, meetings, createdAt: new Date().toISOString() }));
};
export const linkOf = c => `${location.origin}${location.pathname.replace(/[^/]*$/, '')}${VIEWER}#${c.secret}`;

// Se actualiza solo cuando cambian tus datos (espera un poco para juntar los cambios)
let timer = 0, busy = false;
export function autoUpdate() {
  if (!store.isCloud || !isActive()) return;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (busy) return;
    busy = true;
    try {
      const c = cfg();
      const hash = c?.secret ? await publish(c) : null;
      if (hash) store.patchProfile(cur => (cur.share?.secret === c.secret ? { share: { ...cur.share, hash, updatedAt: new Date().toISOString() } } : null));
    } catch (e) { console.warn('Enlace para los ancianos no actualizado', e); }
    busy = false;
  }, 20000);
}

// ───── Hoja: crear, enviar, actualizar, cambiar la clave o apagar ─────
export async function sheet() {
  const { open } = await S();
  if (!store.isCloud) { open({ title: '🔗 Enlace para los ancianos', body: '<p class="hint warn">Para compartir necesitas usar la app con tu cuenta (modo nube).</p>' }); return; }
  const c = cfg();
  const sec = sectionsOf(c);
  const nm = nextAgendaMeeting();
  const mts = meetingsWithAgreements().slice(0, 8);
  const list = Array.isArray(c?.meetings) ? c.meetings : ['auto'];
  const chosen = new Set(list);
  const secHtml = SECTIONS.map(([k, n, d]) => `<label class="check"><input type="checkbox" name="shsec" value="${esc(k)}" ${sec.includes(k) ? 'checked' : ''}> <span><b>${n}</b><br><small class="hint">${esc(d)}${k === 'agenda' ? (nm ? ` · ahora: ${esc(nm.title || 'Reunión')}, ${esc(fmtShort(nm.date))}` : ' · saldrá cuando prepares la agenda de una reunión') : ''}</small></span></label>`).join('');
  const mtHtml = `<div class="f" id="sh-mts" ${sec.includes('acuerdos') ? '' : 'hidden'}><span class="lbl">Acuerdos de qué reuniones</span>
    <label class="check"><input type="checkbox" name="shmt" value="auto" ${chosen.has('auto') ? 'checked' : ''}> <span><b>La última reunión con acuerdos</b><br><small class="hint">Cambia sola cuando haces otra reunión${mts[0] ? ` (ahora: ${esc(mts[0].title || 'Reunión')}, ${esc(fmtShort(mts[0].date))})` : ''}</small></span></label>
    ${mts.slice(1).map(m => `<label class="check"><input type="checkbox" name="shmt" value="${esc(m.id)}" ${chosen.has(m.id) ? 'checked' : ''}> ${esc(m.title || 'Reunión')} <span class="hint">· ${esc(fmtShort(m.date))}</span></label>`).join('')}
    ${mts.length ? '' : '<p class="hint">Todavía no tienes reuniones con acuerdos: saldrán aquí cuando las tengas.</p>'}</div>`;
  if (!c?.secret) {
    open({
      title: '🔗 Enlace para los ancianos',
      body: `<p class="hint">Los ancianos ven lo que elijas en un enlace, con una clave de 6 números. No necesitan la app ni una cuenta. Todo va cifrado con la clave; se actualiza solo cuando cambias algo y lo puedes apagar cuando quieras.</p>
        <p class="hint">🔐 El enlace es la llave principal y la clave es un segundo candado: mándalos por separado (por ejemplo, el enlace por WhatsApp y la clave en otro mensaje o de palabra).</p>
        <div class="stack pad" id="sh-form">${secHtml}</div>${mtHtml}
        <label class="check pad"><input type="checkbox" id="sh-long"> <span>Usar una clave más larga<br><small class="hint">10 letras y números en vez de 6 números: más difícil de adivinar, un poco más larga de escribir</small></span></label>`,
      actions: '<button type="button" class="btn primary" data-a="sh-create">Crear el enlace</button>',
    });
    return;
  }
  const link = linkOf(c);
  open({
    title: '🔗 Enlace para los ancianos',
    body: `<p class="hint ok">✓ Activo${c.updatedAt ? ` · actualizado el ${esc(fmtShort(dateOf(c.updatedAt)))} a las ${esc(new Date(c.updatedAt).toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit' }))}` : ''}. Se actualiza solo cuando cambias algo.</p>
      <div class="f"><span class="lbl">Enlace</span><div class="log-add"><input id="sh-link" readonly value="${esc(link)}" aria-label="Enlace"><button type="button" class="btn" data-a="sh-copy" data-v="link">Copiar</button></div></div>
      <div class="f"><span class="lbl">Clave</span><div class="sh-code" aria-label="Clave">${esc(fmtCode(c.code))}</div></div>
      <div class="two"><button type="button" class="btn" data-a="sh-send" data-v="link">📤 Enviar el enlace</button><button type="button" class="btn" data-a="sh-send" data-v="code">📤 Enviar la clave</button></div>
      <p class="hint">🔐 El enlace es la llave principal y la clave es un segundo candado: manda la clave en un mensaje aparte. Quien tenga el enlace y la clave puede verlo, así que compártelo solo con los ancianos.</p>
      <h3 class="sub-h">Qué ven</h3><div class="stack" id="sh-form">${secHtml}</div>${mtHtml}
      <button type="button" class="btn pad-top" data-a="sh-save">Guardar lo que ven y actualizar</button>
      <div class="stack pad"><button type="button" class="btn ghost" data-a="sh-rekey">🔑 Cambiar la clave (el enlace anterior deja de servir)</button>
      <button type="button" class="btn ghost danger" data-a="sh-off">⛔ Apagar el enlace</button></div>`,
  });
}
function formChoice() {
  const sections = [...document.querySelectorAll('input[name="shsec"]:checked')].map(i => i.value);
  const meetings = [...document.querySelectorAll('input[name="shmt"]:checked')].map(i => i.value);
  return { sections, meetings, agendaOff: !sections.includes('agenda'), long: !!document.getElementById('sh-long')?.checked };
}
async function saveCfg(c) {
  const v = M.profile();
  store.upsert('profile', { ...v, id: 'me', share: c }, { explicit: true });
}
export async function create(rekey = false) {
  const prev = cfg();
  const { sections, meetings, agendaOff, long } = rekey && prev ? { sections: sectionsOf(prev), meetings: prev.meetings, agendaOff: !!prev.agendaOff, long: !!prev.codeLong } : formChoice();
  if (!sections.length) return toast('Marca al menos una parte para compartir');
  toast('Creando el enlace cifrado…');
  try {
    const c = { ...await newConfig(sections, meetings, long), agendaOff };
    const hash = await publish(c, true);
    if (prev?.id && prev.id !== c.id) await store.shareRemove(prev.id).catch(() => {});
    await saveCfg({ ...c, hash, updatedAt: new Date().toISOString() });
    toast(rekey ? '🔑 Clave nueva: manda el enlace y la clave otra vez' : '✓ Enlace listo: mándalo a los ancianos');
    setTimeout(sheet, 300);
  } catch (e) { console.warn(e); toast('No se pudo crear el enlace. Revisa la conexión e intenta de nuevo.'); }
}
export async function saveChoice() {
  const c = cfg(); if (!c) return;
  const { sections, meetings, agendaOff } = formChoice();
  if (!sections.length) return toast('Marca al menos una parte para compartir');
  const next = { ...c, sections, meetings, agendaOff };
  try { const hash = await publish(next, true); await saveCfg({ ...next, hash, updatedAt: new Date().toISOString() }); toast('✓ Actualizado: los ancianos ya lo ven así'); setTimeout(sheet, 300); } catch (e) { console.warn(e); toast('No se pudo actualizar. Revisa la conexión.'); }
}
export async function confirm(what) {
  const { open } = await S();
  const off = what === 'off';
  open({ title: off ? 'Apagar el enlace' : 'Cambiar la clave', back: sheet,
    body: `<p>${off ? 'El enlace deja de funcionar para todos y se borra lo compartido.' : 'Se crea un enlace y una clave nuevos. El enlace anterior deja de funcionar: tendrás que mandar los nuevos.'}</p>`,
    actions: `<button type="button" class="btn ghost" data-a="sh-open">Cancelar</button><button type="button" class="btn ${off ? 'danger' : 'primary'}" data-a="${off ? 'sh-off-go' : 'sh-rekey-go'}">${off ? 'Sí, apagar' : 'Sí, cambiar'}</button>` });
}
export async function turnOff() {
  const c = cfg(); if (!c) return;
  try { await store.shareRemove(c.id || await shareIdOf(c.secret)); } catch (e) { console.warn(e); return toast('No se pudo apagar. Revisa la conexión.'); }
  store.upsert('profile', { ...M.profile(), id: 'me', share: null }, { explicit: true });
  toast('⛔ Enlace apagado: ya nadie lo puede abrir');
  (await S()).close();
}
export async function copy(what) {
  const c = cfg(); if (!c) return;
  const text = what === 'code' ? c.code : linkOf(c);
  try { await navigator.clipboard.writeText(text); toast(what === 'code' ? 'Clave copiada' : 'Enlace copiado'); } catch { document.getElementById('sh-link')?.select(); toast('Mantén presionado el enlace para copiarlo'); }
}
export async function send(what) {
  const c = cfg(); if (!c) return;
  const text = what === 'code' ? `Clave para abrir el enlace: ${c.code}`
    : `📋 Para el cuerpo de ancianos${M.profile().congre?.name ? ` de ${M.profile().congre.name}` : ''}: ${SECTIONS.filter(([k]) => sectionsOf(c).includes(k)).map(x => x[1].replace(/^\S+\s/, '').toLowerCase()).join(', ')}. Se actualiza solo.\n${linkOf(c)}\nLa clave te la mando aparte.`;
  if (!isPhone()) return shareText(text, { copied: what === 'code' ? '📋 Clave copiada. Pégala en WhatsApp con Ctrl+V' : '📋 Enlace copiado. Pégalo en WhatsApp con Ctrl+V' });
  try { if (navigator.share) { await navigator.share({ text }); return; } } catch (e) { if (e?.name === 'AbortError') return; }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}
