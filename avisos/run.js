// Avisos de Mi Agenda Teocrática — se ejecuta cada hora desde GitHub Actions (.github/workflows/avisos.yml),
// así el proyecto de Firebase se queda en el plan gratuito (Spark): enviar avisos con FCM es gratis.
//
// En cada ejecución:
//  1. Versión nueva: si cambió version.json del sitio, avisa una vez a todos.
//  2. Eventos compartidos: avisa a los demás cuando alguien comparte o cambia uno (desde la ejecución anterior).
//  3. Aviso de prueba: si alguien tocó «Enviar un aviso de prueba» (users/{uid}/meta/test), se lo manda.
//  4. Aviso diario: a cada usuario, a la hora que eligió (Ajustes → Avisos), con lo pendiente del día.
//
// Privacidad: por defecto el aviso solo dice CUÁNTAS cosas hay, sin títulos. No se guarda nada aparte.
// Credenciales: la cuenta de servicio del secreto FIREBASE_SERVICE_ACCOUNT (Google Application Default Credentials).

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

const PROJECT = process.env.FIREBASE_PROJECT || 'mi-agenda-app-855f1';
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || PROJECT;
initializeApp({ credential: applicationDefault(), projectId: PROJECT });
const db = getFirestore();
const log = { info: (...a) => console.log(...a), warn: (...a) => console.warn(...a), error: (...a) => console.error(...a) };

const DEFAULTS = { hour: 7, tasks: true, events: true, junta: true, supervise: true, shared: true, updates: true, weekly: true, details: false };
const CATCH_UP_HOURS = 3;          // si una hora falla, lo intenta en las 3 siguientes
const SUPERVISE_DAYS = 7;

// ───── Fechas en la zona horaria del usuario ─────
function localNow(tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(new Date()).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), monday: parts.weekday === 'Mon', sunday: parts.weekday === 'Sun' };
}
const toDate = iso => new Date(`${iso}T12:00:00Z`);
const addDays = (iso, n) => { const d = toDate(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diffDays = (a, b) => Math.round((toDate(a) - toDate(b)) / 86400000);
const fmtTime = t => {
  if (!/^\d{1,2}:\d{2}/.test(t || '')) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const titles = (list, key = 'title') => list.slice(0, 3).map(x => x[key] || 'Sin título').join(', ') + (list.length > 3 ? '…' : '');

// Igual que en la app (js/model.js → occursOn)
function occursOn(ev, iso) {
  if (!ev.date) return false;
  if ((ev.skipDates || []).includes(iso)) return false;
  if (iso < ev.date) return ev.date === iso;
  switch (ev.repeat) {
    case 'daily': return true;
    case 'days': return (ev.days || []).includes(toDate(iso).getUTCDay());
    case 'weekly': return diffDays(iso, ev.date) % 7 === 0;
    case 'biweekly': return diffDays(iso, ev.date) % 14 === 0;
    case 'monthly': return iso.slice(8, 10) === ev.date.slice(8, 10);
    default: return ev.date === iso;
  }
}
const isMine = t => t.mine !== false;
const docs = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));

// ───── Texto del aviso ─────
async function buildMessage(uid, p, now) {
  const user = db.collection('users').doc(uid);
  const today = now.date, tomorrow = addDays(today, 1);
  const lines = [];

  if (p.tasks || (p.supervise && now.monday)) {
    const tasks = docs(await user.collection('tasks').get()).filter(t => t.status !== 'hecha');
    if (p.tasks) {
      const mine = tasks.filter(isMine);
      const dueToday = mine.filter(t => t.due === today);
      const late = mine.filter(t => t.due && t.due < today);
      if (dueToday.length) lines.push(`📋 ${plural(dueToday.length, 'tarea', 'tareas')} para hoy${p.details ? `: ${titles(dueToday)}` : ''}`);
      if (late.length) lines.push(`⏰ ${plural(late.length, 'tarea atrasada', 'tareas atrasadas')}${p.details ? `: ${titles(late)}` : ''}`);
    }
    if (p.supervise && now.monday) {
      const sup = tasks.filter(t => !isMine(t)).filter(t => {
        const last = (t.log || []).map(l => l.d).sort().pop() || (t.createdAt ? String(t.createdAt).slice(0, 10) : today);
        return (t.due && t.due < today) || diffDays(today, last) >= SUPERVISE_DAYS;
      });
      if (sup.length) lines.push(`👀 ${plural(sup.length, 'tarea', 'tareas')} por supervisar (sin novedades o vencidas)`);
    }
  }

  if (p.events) {
    const evs = docs(await user.collection('events').where('date', '<=', today).get()).filter(e => occursOn(e, today))
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    if (evs.length) lines.push(`📅 ${plural(evs.length, 'compromiso', 'compromisos')} hoy${p.details ? `: ${evs.slice(0, 3).map(e => `${e.time ? fmtTime(e.time) + ' ' : ''}${e.title || ''}`.trim()).join(', ')}` : ''}`);
  }

  if (p.junta) {
    const ms = docs(await user.collection('meetings').where('date', 'in', [today, tomorrow]).get())
      .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
    for (const m of ms) {
      const when = m.date === today ? 'Hoy' : 'Mañana';
      const at = m.time ? ` a las ${fmtTime(m.time)}` : '';
      const pending = m.date === tomorrow && (m.agenda || []).length && !m.agendaSentAt ? ' · falta enviar la agenda' : '';
      lines.push(`🗓 ${when}: ${p.details && m.title ? m.title : 'reunión'}${at}${pending}`);
    }
  }

  // Domingo: resumen de la semana (rutinas cumplidas) y lo que viene la próxima
  if (p.weekly && now.sunday) {
    const own = docs(await user.collection('events').get());
    const shared = docs(await db.collection('shared').where('members', 'array-contains', uid).get());
    const all = [...own, ...shared];
    const monday = addDays(today, -6);
    let due = 0, done = 0;
    all.filter(e => e.repeat && e.repeat !== 'none').forEach(e => {
      for (let i = 0; i < 7; i++) {
        const d = addDays(monday, i);
        if (!occursOn(e, d)) continue;
        due++;
        if ((e.doneLog?.[d] || []).includes(uid)) done++;
      }
    });
    if (due && done) lines.push(`🔥 Esta semana cumpliste ${done} de ${due} rutinas`);
    let next = 0;
    for (let i = 1; i <= 7; i++) { const d = addDays(today, i); next += all.filter(e => occursOn(e, d)).length; }
    const nextMeetings = docs(await user.collection('meetings').where('date', '>', today).where('date', '<=', addDays(today, 7)).get());
    if (next || nextMeetings.length) lines.push(`🗓 Próxima semana: ${plural(next, 'evento', 'eventos')}${nextMeetings.length ? ` y ${plural(nextMeetings.length, 'reunión', 'reuniones')}` : ''}`);
  }

  if (!lines.length) return null;
  return { title: 'Mi Agenda · tu día', body: lines.join('\n'), url: './', tag: `agenda-${today}` };
}

// ───── Envío ─────
async function sendTo(uid, devices, msg) {
  const tokens = devices.map(d => d.token).filter(Boolean);
  if (!tokens.length) return 0;
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    data: Object.fromEntries(Object.entries(msg).map(([k, v]) => [k, String(v)])),
    webpush: { headers: { TTL: '43200', Urgency: 'normal' } },
  });
  // Teléfonos que ya no existen o quitaron el permiso: se borran
  const gone = [];
  res.responses.forEach((r, i) => {
    const code = r.error?.code || '';
    if (/registration-token-not-registered|invalid-registration-token|invalid-argument/.test(code)) gone.push(devices.find(d => d.token === tokens[i]));
    else if (r.error) log.warn('Aviso no enviado', { code });
  });
  await Promise.all(gone.filter(Boolean).map(d => db.collection('users').doc(uid).collection('devices').doc(d.id).delete().catch(() => {})));
  return res.successCount;
}

const devicesOf = async uid => docs(await db.collection('users').doc(uid).collection('devices').get());
const prefsOf = async uid => ({ ...DEFAULTS, ...(((await db.doc(`users/${uid}/profile/me`).get()).data() || {}).notif || {}) });
const shortDate = iso => { try { return new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(toDate(iso)); } catch { return iso; } };

// ───── Versión nueva publicada: se revisa version.json del sitio y se avisa a todos una vez ─────
async function checkNewVersion() {
  const project = process.env.GCLOUD_PROJECT || JSON.parse(process.env.FIREBASE_CONFIG || '{}').projectId;
  if (!project) return;
  let info;
  try {
    const res = await fetch(`https://${project}.web.app/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    info = await res.json();
  } catch { return; }
  const v = String(info.version || '');
  if (!v) return;
  const ref = db.doc('meta/app');
  if ((await ref.get()).data()?.notifiedVersion === v) return;
  await ref.set({ notifiedVersion: v, at: new Date().toISOString() }, { merge: true });
  const body = (info.notes || []).slice(0, 3).join(' · ') || 'Ábrela y toca «Actualizar».';
  const users = await db.collection('directory').get();
  let sent = 0;
  for (const u of users.docs) {
    try {
      const devices = await devicesOf(u.id);
      if (!devices.length || !(await prefsOf(u.id)).updates) continue;
      sent += await sendTo(u.id, devices, { title: `Mi Agenda: versión nueva ${v}`, body, url: './', tag: `version-${v}` });
    } catch (e) { log.warn('Aviso de versión no enviado', { error: e.message }); }
  }
  log.info('Aviso de versión', { v, sent });
}

// ───── Eventos compartidos: avisa a los demás cuando alguien comparte o cambia uno ─────
// sharedMeta/{id} (solo el servidor lo usa) recuerda a quién ya se avisó y qué versión del evento.
const SHARED_FIELDS = ['title', 'date', 'time', 'endTime', 'place', 'theme', 'notes', 'repeat', 'category'];
async function checkShared(since) {
  const snap = await db.collection('shared').where('updatedAt', '>', since).get();
  let sent = 0;
  for (const d of snap.docs) {
    const after = d.data();
    const metaRef = db.collection('sharedMeta').doc(d.id);
    const meta = (await metaRef.get()).data() || {};
    const known = new Set(meta.members || []);
    const sig = JSON.stringify(SHARED_FIELDS.map(k => after[k] ?? ''));
    const changed = meta.sig !== undefined && meta.sig !== sig;
    const actor = after.updatedBy || after.owner;
    const actorName = after.updatedByName || after.ownerName || 'Alguien';
    for (const uid of after.members || []) {
      if (uid === actor) continue;
      const isNew = !known.has(uid);
      if (!isNew && !changed) continue;
      try {
        const devices = await devicesOf(uid);
        if (!devices.length) continue;
        const p = await prefsOf(uid);
        if (!p.shared) continue;
        const what = p.details ? `: ${after.title || 'evento'}${after.date ? ` (${shortDate(after.date)}${after.time ? ` ${fmtTime(after.time)}` : ''})` : ''}` : '';
        const body = isNew ? `👥 ${actorName} te compartió un evento${what}` : `✏️ ${actorName} cambió un evento compartido${what}`;
        sent += await sendTo(uid, devices, { title: 'Mi Agenda Teocrática', body, url: './', tag: `shared-${d.id}` });
      } catch (e) { log.warn('Aviso compartido no enviado', e.message); }
    }
    await metaRef.set({ members: after.members || [], sig, at: new Date().toISOString() });
  }
  // Limpia lo de eventos que ya no existen
  const metas = await db.collection('sharedMeta').get();
  for (const m of metas.docs) if (!(await db.collection('shared').doc(m.id).get()).exists) await m.ref.delete();
  log.info('Compartidos', { cambiados: snap.size, sent });
}

// ───── Aviso de prueba pedido desde Ajustes ─────
async function checkTest(uid, devices) {
  const ref = db.doc(`users/${uid}/meta/test`);
  const t = await ref.get();
  if (!t.exists) return 0;
  await ref.delete();
  return sendTo(uid, devices, { title: 'Mi Agenda Teocrática', body: '✓ Los avisos funcionan en este teléfono.', url: './', tag: 'prueba' });
}

// ───── Aviso diario de un usuario ─────
async function daily(uid, devices) {
  const tz = devices.find(d => d.tz)?.tz || 'America/Caracas';
  const now = localNow(tz);
  const p = await prefsOf(uid);
  const hour = Number(p.hour);
  if (now.hour < hour || now.hour >= hour + CATCH_UP_HOURS) return 0;
  const metaRef = db.doc(`users/${uid}/meta/notif`);
  if ((await metaRef.get()).data()?.lastSent === now.date) return 0;
  const msg = await buildMessage(uid, p, now);
  const n = msg ? await sendTo(uid, devices, msg) : 0;
  await metaRef.set({ lastSent: now.date }, { merge: true });
  return n;
}

async function main() {
  const runRef = db.doc('meta/avisos');
  const lastRun = (await runRef.get()).data()?.lastRun || new Date(Date.now() - 2 * 3600e3).toISOString();
  const startedAt = new Date().toISOString();
  await checkNewVersion().catch(e => log.error('Versión', e.message));
  await checkShared(lastRun).catch(e => log.error('Compartidos', e.message));
  const users = await db.collection('directory').get();
  let tests = 0, sent = 0;
  for (const u of users.docs) {
    try {
      const devices = await devicesOf(u.id);
      if (!devices.length) continue;
      tests += await checkTest(u.id, devices);
      sent += await daily(u.id, devices);
    } catch (e) { log.error('Error con un usuario', e.message); }
  }
  await runRef.set({ lastRun: startedAt }, { merge: true });
  log.info('Listo', { usuarios: users.size, diarios: sent, pruebas: tests });
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
