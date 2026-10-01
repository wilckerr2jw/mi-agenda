// Página para los ancianos (ver.html): abre el enlace que comparte el coordinador con la clave de 6 números.
// Todo se descifra aquí, en el teléfono de quien lo abre; el servidor solo guarda un texto cifrado.
import { firebaseConfig } from './config.js';

const $app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = new TextEncoder(), dec = new TextDecoder();
const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const parse = iso => { const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const fShort = iso => { if (!iso) return ''; const d = parse(iso); return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}${d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ''}`; };
const fLong = iso => { if (!iso) return ''; const d = parse(iso); return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`; };
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const secret = decodeURIComponent(location.hash.slice(1)).trim();
let doc = null, id = '';
const store = { get: k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* sin almacenamiento */ } } };

async function shareIdOf(s) { return b64u(await crypto.subtle.digest('SHA-256', enc.encode(`mi-agenda-share:${s}`))).slice(0, 22); }
async function fetchDoc() {
  const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/shares/${encodeURIComponent(id)}?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (r.status === 404 || r.status === 403) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  const f = j.fields || {};
  const str = k => f[k]?.stringValue || '';
  return { v: Number(f.v?.integerValue || 1), salt: str('salt'), iv: str('iv'), ct: str('ct'), iter: Number(f.iter?.integerValue || 600000), updatedAt: str('updatedAt') };
}
async function decrypt(code) {
  const base = await crypto.subtle.importKey('raw', enc.encode(`${secret}:${code}`), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64u(doc.salt), iterations: doc.iter }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(doc.iv) }, key, unb64u(doc.ct));
  return JSON.parse(dec.decode(pt));
}

// ───── Pantallas ─────
function message(title, text) { $app.innerHTML = `<div class="card lock"><h1>${esc(title)}</h1><p class="sub">${esc(text)}</p></div>`; }
let tries = 0, lockUntil = 0;
function askCode(err = '') {
  const long = doc?.v === 2;   // clave larga: 10 letras y números
  $app.innerHTML = `<div class="card lock">
    <h1>Para el cuerpo de ancianos</h1>
    <p class="sub">${long ? 'Escribe la clave de 10 letras y números que te mandaron aparte.' : 'Escribe la clave de 6 números que te mandaron aparte.'}</p>
    <form id="f" autocomplete="off">${long
      ? '<input id="code" inputmode="text" autocapitalize="characters" spellcheck="false" maxlength="13" autocomplete="off" aria-label="Clave de 10 letras y números" autofocus>'
      : '<input id="code" inputmode="numeric" pattern="[0-9]*" maxlength="7" autocomplete="one-time-code" aria-label="Clave de 6 números" autofocus>'}
      <br><label class="remember"><input type="checkbox" id="rem"> Recordar la clave en este teléfono</label>
      <br><small class="sub">Márcalo solo si este teléfono es tuyo y nadie más lo usa.</small>
      <br><button class="btn" type="submit">Abrir</button></form>
    ${err ? `<p class="err">${esc(err)}</p>` : ''}</div>`;
  const f = document.getElementById('f');
  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const raw = document.getElementById('code').value;
    const code = long ? raw.toUpperCase().replace(/[^A-Z0-9]/g, '') : raw.replace(/\D/g, '');
    if (long ? code.length !== 10 : code.length !== 6) return askCode(long ? 'La clave tiene 10 letras y números.' : 'La clave tiene 6 números.');
    if (Date.now() < lockUntil) return askCode(`Demasiados intentos. Espera ${Math.ceil((lockUntil - Date.now()) / 1000)} segundos.`);
    f.querySelector('button').disabled = true; f.querySelector('button').textContent = 'Abriendo…';
    try {
      const data = await decrypt(code);
      if (document.getElementById('rem')?.checked) store.set(`miagenda.ver.${id}`, code);
      render(data);
    } catch { tries++; if (tries >= 5) { tries = 0; lockUntil = Date.now() + 30000; } askCode('Clave incorrecta. Revísala e intenta de nuevo.'); }
  });
}

const pillCls = st => (/^hech|^listo|^s[ií]$/i.test(st) ? 'ok' : /atrasad|^no$/i.test(st) ? 'late' : /seguimiento/i.test(st) ? 'mid' : '');
function acuerdosHtml(list) {
  if (!list?.length) return '<p class="meta">No hay acuerdos para mostrar.</p>';
  const t = todayISO();
  const row = x => `<div class="row"><span class="pill ${pillCls(x.st)}">${esc(x.st)}</span><span class="t"><b>${esc(x.t)}</b>${x.who?.length ? ` <span class="meta">· ${esc(x.who.join(', '))}</span>` : ''}${x.due ? ` <span class="meta ${x.due < t && x.st !== 'Hecha' ? 'late-t' : ''}">· ${x.due < t && x.st !== 'Hecha' ? 'venció el' : 'para el'} ${esc(fShort(x.due))}</span>` : ''}${x.det?.length ? `<ul>${x.det.map(d => `<li class="meta">${esc(d)}</li>`).join('')}</ul>` : ''}</span></div>`;
  return list.map(m => {
    const done = m.items.filter(x => x.st === 'Hecha').length;
    return `<h3>${esc(m.t)} · ${esc(fShort(m.d))} <span class="meta">(${done} de ${m.items.length} hechos)</span></h3>${m.items.map(row).join('')}
      ${m.extra?.length ? `<p class="meta"><b>Otras tareas de la reunión</b></p>${m.extra.map(row).join('')}` : ''}`;
  }).join('');
}
function visitaHtml(v) {
  if (!v) return '<p class="meta">No hay una visita programada.</p>';
  const t = todayISO();
  return `<p><b>Semana del ${esc(fLong(v.start))}</b> · ${v.done} de ${v.total} listos</p><div class="bar"><i style="width:${Math.round(v.done / Math.max(1, v.total) * 100)}%"></i></div>
    ${v.groups.map(g => `<h3>${esc(g.ic)} ${esc(g.n)}${g.who?.length ? ` <span class="meta">· ${esc(g.who.join(', '))}</span>` : ''}</h3>
      ${g.items.map(it => `<div class="row"><span class="pill ${pillCls(it.st)}">${esc(it.st)}</span><span class="t">${esc(it.t)}${it.due ? ` <span class="meta ${it.st === 'Falta' && it.due < t ? 'late-t' : ''}">· antes del ${esc(fShort(it.due))}</span>` : ''}${it.note ? `<br><span class="meta">${esc(it.note).replace(/\n/g, '<br>')}</span>` : ''}</span></div>`).join('')}`).join('')}`;
}
const ROLE_IC = { Acomodador: '🪑', Puerta: '🚪', Audio: '🎚️', Video: '🎥', 'Micrófonos': '🎤', Plataforma: '🎙️', Zoom: '💻', Estacionamiento: '🅿️' };
const DOW3 = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
function mecasHtml(m) {
  if (!m) return '<p class="meta">No hay un arreglo cargado.</p>';
  const t = todayISO();
  return `${m.arreglos.map(a => { const next = a.days.find(d => d.d >= t)?.d; const roles = a.roles?.length ? a.roles : [...new Set(a.days.flatMap(d => d.rows.map(r => r.r)))];
    return `<h3>${esc(a.t)}${a.from ? ` <span class="meta">· ${esc(fShort(a.from))} – ${esc(fShort(a.to))}</span>` : ''}</h3>
    <div class="mc-grid">${a.days.filter(d => !d.d || d.d >= t || a.days.every(x => x.d < t)).map(d => { const dt = d.d ? parse(d.d) : null; const by = d.rows.reduce((o, r) => { (o[r.r] = o[r.r] || []).push(r.n); return o; }, {});
      return `<div class="mc-day${d.d === next ? ' next' : ''}"><div class="mc-date">${dt ? `<small>${DOW3[dt.getDay()]}</small><b>${dt.getDate()}</b><small>${MESES[dt.getMonth()].slice(0, 3)}</small>` : '<b>—</b>'}${d.d === next ? `<em>${d.d === t ? 'Hoy' : 'Próxima'}</em>` : ''}</div>
        <div class="mc-cells">${roles.filter(r => by[r]).map(r => `<div><small>${ROLE_IC[r] || '📌'} ${esc(r)}</small><b>${esc(by[r].join(', '))}</b></div>`).join('')}</div></div>`; }).join('')}</div>`; }).join('')}
    ${m.notUsed?.length ? `<h3>⚠️ Sin asignación en los últimos 3 meses (${m.notUsed.length})</h3><div class="chips">${m.notUsed.map(n => `<span class="chip warn">${esc(n)}</span>`).join('')}</div>` : ''}
    ${m.heavy?.length ? `<h3>🔁 Los que más se repiten</h3><div class="chips">${m.heavy.map(n => `<span class="chip">${esc(n)}</span>`).join('')}</div>` : ''}`;
}
// Agenda de la próxima reunión: cada punto con su hora, quién lo presenta y los minutos
function agendaHtml(a) {
  if (!a) return '<p class="meta">Todavía no hay una agenda preparada para la próxima reunión.</p>';
  const when = [a.d ? fLong(a.d) : '', a.time ? fmtT(a.time) : '', a.place].filter(Boolean).join(' · ');
  const row = (at, t, meta, extra = '') => `<div class="ag-row"><span class="ag-at">${esc(at || '')}</span><span class="ag-t"><b>${t}</b>${meta ? `<br><span class="meta">${meta}</span>` : ''}${extra}</span></div>`;
  let lastK = '';
  return `<p class="ag-when"><b>${esc(a.t)}</b><br><span class="meta">${esc(when.charAt(0).toUpperCase() + when.slice(1))}${a.end ? ` · termina ≈ ${esc(a.end)}` : ''}</span></p>
    <div class="ag">${row(a.pStart?.at, 'Oración inicial', esc(a.pStart?.who || ''))}
    ${a.items.map(x => { const head = x.k && x.k !== lastK ? `<div class="ag-k">${esc(x.k)}</div>` : ''; lastK = x.k;
      return head + row(x.at, `${x.conf ? '🔒 ' : ''}${esc(x.t)}`, [x.by ? `👤 ${esc(x.by)}` : '', x.min ? `${x.min} min` : ''].filter(Boolean).join(' · '),
        `${x.ref ? `<br><span class="meta">📖 ${esc(x.ref)}</span>` : ''}${x.subs?.length ? `<ol type="a">${x.subs.map(s => `<li class="meta">${esc(s)}</li>`).join('')}</ol>` : ''}`); }).join('')}
    ${row(a.pEnd?.at, 'Oración final', esc(a.pEnd?.who || ''))}</div>
    ${a.items.some(x => x.conf) ? '<p class="meta">🔒 Los detalles de los puntos confidenciales se tratarán en la reunión.</p>' : ''}`;
}
const fmtT = t => { const [h, m] = String(t).split(':').map(Number); if (Number.isNaN(h)) return ''; return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`; };
function orgHtml(list) {
  if (!list?.length) return '<p class="meta">Todavía no hay departamentos.</p>';
  const node = n => `<li><b>${esc(n.n)}</b>${n.g ? ' <span class="meta">· pertenecen a la congregación</span>' : n.h?.length ? `<br><span class="meta">★ ${esc(n.h.join(', '))}</span>` : '<br><span class="meta"><i>Sin responsable</i></span>'}${n.a?.length ? `<br><span class="meta">Ayudan: ${esc(n.a.join(', '))}</span>` : ''}${n.c?.length ? `<ul>${n.c.map(node).join('')}</ul>` : ''}</li>`;
  return `<ul class="tree">${list.map(node).join('')}</ul>`;
}
function render(d) {
  const at = d.at ? new Date(d.at) : null;
  const sec = (key, title, html, open = true) => (d[key] !== null && d[key] !== undefined ? `<details class="card" ${open ? 'open' : ''}><summary><h2>${title}</h2></summary>${html}</details>` : '');
  $app.innerHTML = `<h1>Para el cuerpo de ancianos</h1>
    <p class="sub">${d.congre ? `${esc(d.congre)} · ` : ''}${at ? `Actualizado el ${esc(fShort(`${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`))} a las ${esc(at.toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit' }))}` : ''}${d.by ? ` · lo comparte ${esc(d.by)}` : ''}</p>
    ${sec('agenda', '🗓 Próxima reunión', agendaHtml(d.agenda))}
    ${sec('acuerdos', '📋 Acuerdos y tareas', acuerdosHtml(d.acuerdos))}
    ${sec('visita', '🧳 Visita del superintendente de circuito', visitaHtml(d.visita))}
    ${sec('mecas', '🎛 Asignaciones mecánicas', mecasHtml(d.mecas))}
    ${sec('org', '🏛 Organigrama', orgHtml(d.org), false)}
    <div class="noprint" style="display:flex;gap:8px;justify-content:center;margin-top:12px"><button class="btn ghost" id="reload">🔄 Actualizar</button><button class="btn ghost" id="forget">Olvidar la clave</button></div>
    <p class="foot">Información para los ancianos: no la reenvíes. Se ve cifrada con la clave; quien la comparte puede cambiarla o apagar el enlace.</p>`;
  document.getElementById('reload').onclick = start;
  document.getElementById('forget').onclick = () => { store.set(`miagenda.ver.${id}`, ''); askCode(); };
}

async function start() {
  if (!secret || secret.length < 16) return message('Enlace incompleto', 'Abre el enlace completo que te mandaron (con todo lo que va después de «#»).');
  if (!window.crypto?.subtle) return message('Navegador no compatible', 'Ábrelo en Chrome o Safari actualizado.');
  $app.innerHTML = '<p class="sub">Cargando…</p>';
  try {
    id = id || await shareIdOf(secret);
    doc = await fetchDoc();
  } catch { return message('Sin conexión', 'No se pudo cargar. Revisa tu internet e intenta otra vez.'); }
  if (!doc || !doc.ct) return message('Este enlace ya no está disponible', 'Quien lo compartió lo apagó o cambió la clave. Pídele el enlace nuevo.');
  const saved = store.get(`miagenda.ver.${id}`);
  if (saved) { try { render(await decrypt(saved)); return; } catch { store.set(`miagenda.ver.${id}`, ''); } }
  askCode();
}
window.addEventListener('hashchange', () => location.reload());   // otro enlace abierto en la misma pestaña
start();
