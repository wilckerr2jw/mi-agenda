// 💾 Respaldo completo de todas las cuentas (solo el administrador), en 🛡 Mi administración → Respaldo.
// El servidor de avisos (avisos/run.js) junta los datos de todas las cuentas, los cifra con una clave que solo está
// en config/respaldo (y la que tú guardes aparte) y los manda a tu programa de Google Apps Script, que los guarda en
// tu Google Drive (carpeta «Mi Agenda · Respaldos»). Aquí se conecta, se ve el estado y se abre un respaldo para
// devolverle sus datos a una cuenta.
import * as store from './store.js';
import { session } from './store.js';
import { esc, toast, fmtShort, dateOf } from './util.js';
import { RESPALDO_SCRIPT } from './respaldo-script.js';

const isUrl = u => /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(String(u || ''));
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const rand = n => crypto.getRandomValues(new Uint8Array(n));
const when = iso => (iso ? `${fmtShort(dateOf(iso))} ${new Date(iso).toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit' })}` : '');
const kb = n => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
let cfg = null, opened = null;

async function call(url, body) {
  const r = await fetch(url, { method: body ? 'POST' : 'GET', redirect: 'follow', ...(body ? { headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) } : {}) });
  const text = await r.text();
  try { return JSON.parse(text); } catch { throw new Error(/<html/i.test(text) ? 'Google pidió iniciar sesión: en la implementación, «Quién tiene acceso» debe ser «Cualquier usuario».' : 'Respuesta rara del programa de Google.'); }
}

// Contenido de la pestaña «Respaldo» (se llena cuando llega config/respaldo)
export async function tabHtml() {
  if (!session.isAdmin) return '';
  try { cfg = await store.respaldo.get(); } catch (e) { console.warn(e); return '<p class="err pad">No se pudo leer la configuración. ¿Ya se publicaron las reglas nuevas de Firestore?</p>'; }
  return cfg?.url ? statusHtml() : setupHtml();
}
function setupHtml() {
  return `<p class="hint">Cada semana se guarda en <b>tu Google Drive</b> una copia de los datos de <b>todas las cuentas</b> (organigrama, personas, notas, tareas, informes…). Si un día se pierde algo, o quieres salir de Firebase, desde aquí lo recuperas. El archivo va <b>cifrado</b>: sin la clave no se puede leer.</p>
    <p class="hint">Se hace una sola vez, mejor desde la computadora (unos 5 minutos):</p>
    <ol class="gc-steps">
      <li>Abre <a href="https://script.google.com/home/projects/create" target="_blank" rel="noopener"><b>script.google.com</b></a> con tu cuenta de Google. Ponle de nombre «Mi Agenda · Respaldos».</li>
      <li>Borra lo que aparece escrito y pega este código: <button type="button" class="btn small" data-a="rs-copy">📋 Copiar el código</button></li>
      <li>Guarda (💾). Arriba: <b>Implementar → Nueva implementación</b> → tipo <b>Aplicación web</b>. «Ejecutar como»: <b>Yo</b>; «Quién tiene acceso»: <b>Cualquier usuario</b>. Toca <b>Implementar</b> y <b>Autorizar acceso</b> con tu cuenta (si dice «Google no verificó esta app», toca <b>Configuración avanzada → Ir a…</b>).</li>
      <li>Copia la <b>URL de la aplicación web</b> (termina en <code>/exec</code>) y pégala aquí:</li>
    </ol>
    <div class="f"><input id="rs-url" type="url" inputmode="url" placeholder="https://script.google.com/macros/s/…/exec" aria-label="URL de la aplicación web"></div>
    <button type="button" class="btn primary" data-a="rs-connect">Conectar</button>`;
}
function statusHtml() {
  const l = cfg.last || {};
  const every = Number(cfg.every) || 7;
  const next = cfg.lastAt ? new Date(Date.parse(cfg.lastAt) + every * 864e5).toISOString() : '';
  return `${l.at ? (l.ok ? `<p class="hint ok">✓ Último respaldo: ${esc(when(l.at))} · ${esc(String(l.cuentas || 0))} cuentas · ${esc(kb(l.size || 0))}</p>` : `<p class="hint warn">⚠️ El último intento (${esc(when(l.at))}) falló: ${esc(l.error || 'error')}. Se vuelve a intentar solo en unas horas.</p>`)
      : '<p class="hint">⏳ El primer respaldo se hace en los próximos minutos (cuando corra el servidor de avisos).</p>'}
    ${cfg.requestAt && (!cfg.lastAt || cfg.requestAt > cfg.lastAt) ? '<p class="hint">⏳ Pediste uno ahora: se hace en los próximos 15 minutos.</p>' : next ? `<p class="hint">Siguiente: ${esc(fmtShort(dateOf(next)))}.</p>` : ''}
    <div class="stack pad-top">
      <button type="button" class="btn primary" data-a="rs-now">💾 Hacer un respaldo ahora</button>
      ${cfg.folderUrl ? `<a class="btn ghost" href="${esc(cfg.folderUrl)}" target="_blank" rel="noopener">📁 Abrir la carpeta en Drive</a>` : ''}
    </div>
    <div class="two pad-top"><div class="f"><label for="rs-every">Cada cuánto</label><select id="rs-every">${[[1, 'Cada día'], [3, 'Cada 3 días'], [7, 'Cada semana']].map(([v, n]) => `<option value="${v}" ${v === every ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="f"><label for="rs-keep">Guardar los últimos</label><select id="rs-keep">${[4, 8, 12, 26].map(v => `<option value="${v}" ${v === (Number(cfg.keep) || 8) ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>
    <h3 class="sub-h">🔑 La clave de los respaldos</h3>
    <p class="hint">Sin ella no se pueden abrir. Está guardada en la app, pero <b>guárdala también aparte</b> (por ejemplo, en una nota privada de Google Keep o en tu gestor de contraseñas): si algún día se pierde Firebase, es lo único que necesitas para abrir tus respaldos.</p>
    <button type="button" class="btn small" data-a="rs-key">📋 Copiar la clave</button>
    <h3 class="sub-h">📂 Abrir un respaldo</h3>
    <p class="hint">Descarga de tu Drive un archivo <code>.agenda</code> y ábrelo aquí para devolverle sus datos a una cuenta.</p>
    <input type="file" id="rs-file" accept=".agenda,application/json" data-rs-file>
    <div id="rs-open"></div>
    <p class="pad-top"><button type="button" class="link danger" data-a="rs-off">Desconectar los respaldos</button></p>
    <p class="hint">🔒 Los respaldos tienen los datos de todas las cuentas. Úsalos solo para recuperar información, y avísales a los hermanos que existe esta copia de seguridad.</p>`;
}

export async function copyScript() {
  try { await navigator.clipboard.writeText(RESPALDO_SCRIPT); toast('Código copiado: pégalo en script.google.com'); }
  catch { toast('No se pudo copiar. Hazlo desde la computadora.'); }
}
export async function connect() {
  const url = (document.getElementById('rs-url')?.value || '').trim();
  if (!isUrl(url)) return toast('Pega la URL completa de la aplicación web (https://script.google.com/macros/s/…/exec)', null, null, 9000);
  toast('Conectando con tu Google Drive…', null, null, 20000);
  try {
    const hi = await call(url);
    if (hi?.app !== 'mi-agenda-respaldo') throw new Error('Esa dirección no es del programa de respaldos. Revisa que pegaste el código de respaldos.');
    const token = b64(rand(24)).replace(/[^\w]/g, '').padEnd(24, 'x');
    const t = await call(url, { token, action: 'probar' });
    if (!t?.ok) throw new Error(t?.error === 'clave' ? 'Ese programa ya está unido a otra clave: crea una implementación nueva.' : t?.error || 'No respondió bien');
    const key = cfg?.key || b64(rand(32));
    await store.respaldo.save({ url, token, key, on: true, every: 7, keep: 8, folderUrl: t.url || '', requestAt: new Date().toISOString() });
    toast('✓ Conectado. El primer respaldo se guarda en tu Drive en los próximos minutos. Copia y guarda la clave.', null, null, 10000);
  } catch (e) { console.warn(e); return toast(`⚠️ ${e.message}`, null, null, 12000); }
  return true;
}
export async function now() { await store.respaldo.save({ requestAt: new Date().toISOString() }); toast('💾 Listo: se hace en los próximos 15 minutos'); return true; }
export async function setOpt() {
  const every = Number(document.getElementById('rs-every')?.value) || 7, keep = Number(document.getElementById('rs-keep')?.value) || 8;
  await store.respaldo.save({ every, keep }); toast('Guardado');
}
export async function copyKey() {
  if (!cfg?.key) return;
  try { await navigator.clipboard.writeText(`Clave de respaldos de Mi Agenda: ${cfg.key}`); toast('🔑 Clave copiada: guárdala en un lugar seguro'); }
  catch { toast('No se pudo copiar'); }
}
export async function off() {
  await store.respaldo.save({ on: false, url: '', token: '' });
  toast('Respaldos desconectados. Los archivos que ya están en tu Drive se quedan ahí.', null, null, 8000);
  return true;
}

// ───── Abrir un respaldo (.agenda) ─────
async function decrypt(file, keyB64) {
  const wrap = JSON.parse(await file.text());
  if (wrap.app !== 'mi-agenda-respaldo') throw new Error('Ese archivo no es un respaldo de Mi Agenda');
  const key = await crypto.subtle.importKey('raw', unb64(keyB64), 'AES-GCM', false, ['decrypt']);
  let plain;
  try { plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(wrap.iv) }, key, unb64(wrap.data)); }
  catch { throw new Error('La clave no corresponde a este respaldo'); }
  const stream = new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}
export async function openFile(input) {
  const f = input.files?.[0];
  if (!f) return;
  const box = document.getElementById('rs-open');
  let key = cfg?.key;
  if (!key) key = (window.prompt('Pega la clave de los respaldos') || '').replace(/^.*:\s*/, '').trim();
  if (!key) return;
  try { opened = await decrypt(f, key); }
  catch (e) { opened = null; if (box) box.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
  const dir = Object.fromEntries((opened.global?.directory || []).map(d => [d.id, d]));
  const rows = Object.entries(opened.users || {}).map(([uid, cols]) => ({ uid, name: dir[uid]?.name || dir[uid]?.email || uid.slice(0, 6), email: dir[uid]?.email || '', n: Object.values(cols).reduce((t, l) => t + l.length, 0), cols }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  if (box) box.innerHTML = `<p class="hint ok">✓ Respaldo del ${esc(when(opened.at))}: ${rows.length} cuentas.</p>
    <div class="stack">${rows.map(r => `<div class="ah-user"><span class="grow"><b>${esc(r.name)}</b><small>${esc(r.email)} · ${r.n} elementos (${r.cols.people?.length || 0} personas, ${r.cols.notes?.length || 0} notas, ${r.cols.tasks?.length || 0} tareas, ${r.cols.entries?.length || 0} registros)</small></span>
      <span class="row-btns"><button type="button" class="btn small ghost" data-a="rs-dl" data-id="${esc(r.uid)}">⬇</button><button type="button" class="btn small" data-a="rs-send" data-id="${esc(r.uid)}" data-name="${esc(r.name)}">📤 Enviarle</button></span></div>`).join('')}</div>
    <p class="hint">⬇ descarga sus datos como un respaldo normal (se restaura en Ajustes → Mis datos). 📤 se lo envía a su app: le sale «📥 Datos para ti» y lo importa con un toque (no borra lo que ya tiene).</p>`;
}
const accountBackup = uid => JSON.stringify({ app: 'mi-agenda-teocrática', version: 1.3, exportedAt: opened?.at, data: opened?.users?.[uid] || {} });
export function download(uid) {
  if (!opened?.users?.[uid]) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([accountBackup(uid)], { type: 'application/json' }));
  a.download = `mi-agenda-${uid.slice(0, 6)}-${String(opened.at || '').slice(0, 10)}.json`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export async function send(uid, name) {
  if (!opened?.users?.[uid]) return;
  const txt = accountBackup(uid);
  if (txt.length > 880000) return toast('Es muy grande para enviarlo por la app: descárgalo (⬇) y pásaselo como archivo.', null, null, 9000);
  if (!window.confirm(`¿Enviarle a ${name} sus datos de este respaldo? Le saldrá para importarlos en su app.`)) return;
  try { await store.admin.sendData(uid, txt, 'Respaldo'); toast(`📤 Enviado. Cuando ${String(name).split(' ')[0]} abra la app, le saldrá «Importar».`); }
  catch (e) { console.error(e); toast('No se pudo enviar'); }
}

// Cambios en las opciones y el archivo elegido
document.addEventListener('change', e => {
  if (e.target.id === 'rs-every' || e.target.id === 'rs-keep') setOpt();
  if (e.target.matches?.('[data-rs-file]')) openFile(e.target);
});
