// Avisos diarios de Mi Agenda Teocrática.
//
//  · avisoDiario (cada hora): para cada usuario con avisos activos, si en su zona horaria ya es la hora
//    que eligió (Ajustes → Avisos) y hoy aún no recibió el suyo, le manda UN aviso con lo pendiente:
//    tareas de hoy y atrasadas, compromisos de hoy, reunión de hoy o de mañana (y si falta enviar la agenda)
//    y, los lunes, las tareas que supervisa.
//  · probarAviso (desde Ajustes): manda un aviso de prueba a los teléfonos del usuario.
//
// Privacidad: por defecto el aviso solo dice CUÁNTAS cosas hay, sin títulos (se ve en la pantalla bloqueada).
// Nada se guarda aparte: se lee lo del propio usuario en el momento y se descarta.

const { onSchedule } = require('firebase-functions/scheduler');
const { onCall, HttpsError } = require('firebase-functions/https');
const { onDocumentWritten } = require('firebase-functions/firestore');
const logger = require('firebase-functions/logger');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();
const db = getFirestore();

const DEFAULTS = { hour: 7, tasks: true, events: true, junta: true, supervise: true, shared: true, updates: true, details: false };
const CATCH_UP_HOURS = 3;          // si una hora falla, lo intenta en las 3 siguientes
const SUPERVISE_DAYS = 7;

// ───── Fechas en la zona horaria del usuario ─────
function localNow(tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(new Date()).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), monday: parts.weekday === 'Mon' };
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
    else if (r.error) logger.warn('Aviso no enviado', { code });
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
    } catch (e) { logger.warn('Aviso de versión no enviado', { error: e.message }); }
  }
  logger.info('Aviso de versión', { v, sent });
}

exports.avisoDiario = onSchedule({ schedule: '0 * * * *', timeZone: 'America/Caracas', maxInstances: 1, timeoutSeconds: 300, memory: '256MiB' }, async () => {
  await checkNewVersion().catch(e => logger.error('Revisión de versión', { error: e.message }));
  const users = await db.collection('directory').get();
  let sent = 0;
  for (const u of users.docs) {
    const uid = u.id;
    try {
      const devices = docs(await db.collection('users').doc(uid).collection('devices').get());
      if (!devices.length) continue;
      const tz = devices.find(d => d.tz)?.tz || 'America/Caracas';
      const now = localNow(tz);
      const prof = (await db.doc(`users/${uid}/profile/me`).get()).data() || {};
      const p = { ...DEFAULTS, ...(prof.notif || {}) };
      const hour = Number(p.hour);
      if (now.hour < hour || now.hour >= hour + CATCH_UP_HOURS) continue;
      const metaRef = db.doc(`users/${uid}/meta/notif`);
      if ((await metaRef.get()).data()?.lastSent === now.date) continue;
      const msg = await buildMessage(uid, p, now);
      if (msg) sent += await sendTo(uid, devices, msg);
      await metaRef.set({ lastSent: now.date }, { merge: true });
    } catch (e) {
      logger.error('Error con un usuario', { uid, error: e.message });
    }
  }
  logger.info('Avisos enviados', { sent });
});

exports.probarAviso = onCall({ maxInstances: 2 }, async req => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Inicia sesión');
  const uid = req.auth.uid;
  const devices = docs(await db.collection('users').doc(uid).collection('devices').get());
  const sent = await sendTo(uid, devices, { title: 'Mi Agenda Teocrática', body: '✓ Los avisos funcionan en este teléfono.', url: './', tag: 'prueba' });
  return { sent };
});

// ───── Eventos compartidos: avisa a los demás cuando alguien comparte o cambia uno ─────
exports.avisoCompartido = onDocumentWritten({ document: 'shared/{id}', maxInstances: 2 }, async event => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!after) return;                                             // se borró
  const actor = after.updatedBy || after.owner;
  const actorName = after.updatedByName || after.ownerName || 'Alguien';
  const oldMembers = new Set(before?.members || []);
  const fields = ['title', 'date', 'time', 'endTime', 'place', 'theme', 'notes', 'repeat', 'category'];
  const changed = before && fields.some(k => JSON.stringify(before[k] ?? '') !== JSON.stringify(after[k] ?? ''));
  for (const uid of after.members || []) {
    if (uid === actor) continue;
    const isNew = !oldMembers.has(uid);
    if (!isNew && !changed) continue;
    try {
      const devices = await devicesOf(uid);
      if (!devices.length) continue;
      const p = await prefsOf(uid);
      if (!p.shared) continue;
      const what = p.details ? `: ${after.title || 'evento'}${after.date ? ` (${shortDate(after.date)}${after.time ? ` ${fmtTime(after.time)}` : ''})` : ''}` : '';
      const body = isNew ? `👥 ${actorName} te compartió un evento${what}` : `✏️ ${actorName} cambió un evento compartido${what}`;
      await sendTo(uid, devices, { title: 'Mi Agenda Teocrática', body, url: './', tag: `shared-${event.params.id}` });
    } catch (e) { logger.warn('Aviso compartido no enviado', { error: e.message }); }
  }
});
