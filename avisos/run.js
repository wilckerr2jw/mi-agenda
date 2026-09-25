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

const DEFAULTS = { hour: 7, tasks: true, events: true, junta: true, supervise: true, shared: true, updates: true, weekly: true, details: false,
  before: 10, logAt: 1230, soon: true, routine: true, streak: true, taskTime: true, meetingSoon: true, partner: true, tomorrow: true, report: true };
const CATCH_UP_HOURS = 3;          // si una hora falla, lo intenta en las 3 siguientes
const SUPERVISE_DAYS = 7;

// ───── Fechas en la zona horaria del usuario ─────
function localNow(tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(new Date()).map(p => [p.type, p.value]));
  const hour = Number(parts.hour) % 24;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour, min: hour * 60 + Number(parts.minute), monday: parts.weekday === 'Mon', sunday: parts.weekday === 'Sun', day: Number(parts.day) };
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

  // Con meta de horas: cómo vas y cuánto te toca hoy para llegar
  const prof = (await db.doc(`users/${uid}/profile/me`).get()).data() || {};
  if (prof.goalEnabled && Number(prof.goalMonthly) > 0) {
    const mid = today.slice(0, 7), goal = Number(prof.goalMonthly);
    const ents = docs(await user.collection('entries').where('date', '>=', `${mid}-01`).where('date', '<=', `${mid}-31`).get());
    const done = ents.reduce((a, e) => a + (Number(e.minutes) || 0), 0);
    const [yy, mm] = mid.split('-').map(Number);
    const dim = new Date(Date.UTC(yy, mm, 0)).getUTCDate(), day = Number(today.slice(8, 10));
    const expected = goal * 60 * day / dim, left = Math.max(0, goal * 60 - done), daysLeft = Math.max(1, dim - day + 1);
    const margin = Math.max(60, goal * 60 * 0.08);
    const emoji = done - expected < -margin ? '🐢' : done - expected > margin ? '🐇' : '🦉';
    const hmm = m => `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, '0')}`;
    lines.push(left ? `${emoji} Llevas ${hmm(done)} de ${goal} h; hoy te tocan unas ${hmm(Math.ceil(left / daysLeft / 5) * 5)} h` : `🎉 ¡Ya llegaste a tu meta de ${goal} h este mes!`);
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
  return { title: 'Mi Agenda · tu día', body: lines.join('\n'), url: './', tag: `agenda-${today}`, kind: 'daily' };
}

// ───── Envío ─────
const stats = { ok: 0, fallidos: 0, errores: {} };
// Canal de Android (en la app) según el tipo de aviso: define su sonido
const CHANNEL = { soon: 'eventos', routine: 'rutinas', streak: 'rutinas', partner: 'rutinas', test: 'rutinas', log: 'registro' };
async function sendTo(uid, devices, msg) {
  const valid = devices.filter(d => d.token);
  if (!valid.length) return 0;
  const data = Object.fromEntries(Object.entries(msg).map(([k, v]) => [k, String(v)]));
  // Web (navegador): solo datos; el service worker arma el aviso. App de Android: aviso nativo con su canal.
  const messages = valid.map(d => d.native
    ? { token: d.token, data, notification: { title: msg.title, body: msg.body },
        android: { priority: 'high', notification: { channelId: CHANNEL[msg.kind] || 'general', icon: 'ic_stat_agenda', color: '#1D5F5A', ...(msg.tag ? { tag: String(msg.tag) } : {}) } } }
    : { token: d.token, data, webpush: { headers: { TTL: '43200', Urgency: 'high' } } });
  const res = await getMessaging().sendEach(messages);
  // Teléfonos que ya no existen o quitaron el permiso: se borran
  const gone = [];
  res.responses.forEach((r, i) => {
    const code = r.error?.code || '';
    if (/registration-token-not-registered|invalid-registration-token|invalid-argument/.test(code)) gone.push(valid[i]);
    if (r.error) { stats.fallidos++; stats.errores[code] = (stats.errores[code] || 0) + 1; } else stats.ok++;
    if (r.error && !/registration-token-not-registered|invalid-registration-token|invalid-argument/.test(code)) log.warn('Aviso no enviado', code, r.error.message);
  });
  await Promise.all(gone.map(d => db.collection('users').doc(uid).collection('devices').doc(d.id).delete().catch(() => {})));
  return res.successCount;
}

const devicesOf = async uid => docs(await db.collection('users').doc(uid).collection('devices').get());
const prefsOf = async uid => { const pr = (await db.doc(`users/${uid}/profile/me`).get()).data() || {}; return { ...DEFAULTS, ...(pr.notif || {}), _native: !!pr.nativeAppSeen && Date.now() - Date.parse(pr.nativeAppSeen) < 3 * 86400e3 }; };
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
      sent += await sendTo(u.id, devices, { title: `Mi Agenda: versión nueva ${v}`, body, url: './', tag: `version-${v}`, kind: 'update' });
    } catch (e) { log.warn('Aviso de versión no enviado', { error: e.message }); }
  }
  log.info('Aviso de versión', { v, sent });
}

// ───── Eventos compartidos: avisa a los demás cuando alguien comparte o cambia uno ─────
// sharedMeta/{id} (solo el servidor lo usa) recuerda a quién ya se avisó y qué versión del evento.
const SHARED_FIELDS = ['title', 'date', 'time', 'endTime', 'place', 'theme', 'notes', 'repeat', 'category'];
const forceStale = new Set();   // cuentas con eventos compartidos que cambiaron: se rehace su plan
async function checkShared(since) {
  const snap = await db.collection('shared').where('updatedAt', '>', since).get();
  snap.docs.forEach(d => (d.data().members || []).forEach(u => forceStale.add(u)));
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
        sent += await sendTo(uid, devices, { title: 'Mi Agenda Teocrática', body, url: './', tag: `shared-${d.id}`, kind: 'shared' });
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
  return sendTo(uid, devices, { title: 'Mi Agenda Teocrática', body: '✓ Los avisos funcionan en este teléfono.', url: './', tag: 'prueba', kind: 'test' });
}

// ───── Aviso diario de un usuario ─────
async function daily(uid, allDevices) {
  const tz = allDevices.find(d => d.tz)?.tz || 'America/Caracas';
  const now = localNow(tz);
  const p = await prefsOf(uid);
  // Con la app de Android, el teléfono ya programa estos avisos: por la web solo van a la computadora
  const devices = p._native ? allDevices.filter(d => d.mobile === false) : allDevices;
  if (!devices.length) return 0;
  const hour = Number(p.hour);
  if (now.hour < hour || now.hour >= hour + CATCH_UP_HOURS) return 0;
  const metaRef = db.doc(`users/${uid}/meta/notif`);
  if ((await metaRef.get()).data()?.lastSent === now.date) return 0;
  const msg = await buildMessage(uid, p, now);
  const n = msg ? await sendTo(uid, devices, msg) : 0;
  await metaRef.set({ lastSent: now.date }, { merge: true });
  return n;
}

// ═════════════ AVISOS DURANTE EL DÍA (cada 5 minutos) ═════════════
// Para no leer toda la base de datos cada 5 minutos, se arma un «plan» del día por usuario
// (users/{uid}/meta/plan) y solo se vuelve a armar cuando cambia algo, cambia el día o pasa 1 hora.
const toMin = t => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const hm = m => fmtTime(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const isRoutine = e => e.repeat && e.repeat !== 'none' && (e.category === 'estudio' || e.category === 'personal' || Object.keys(e.doneLog || {}).length > 0);
function streakOf(e, uid, today) {
  let n = 0;
  for (let i = 1, d = addDays(today, -1); i < 400 && d >= (e.date || d); i++, d = addDays(d, -1)) {
    if (!occursOn(e, d)) continue;
    if (!(e.doneLog?.[d] || []).includes(uid)) break;
    n++;
  }
  return n;
}

async function changedSince(uid, since) {
  const user = db.collection('users').doc(uid);
  for (const c of ['events', 'tasks', 'meetings', 'profile', 'entries']) {
    const q = await user.collection(c).where('updatedAt', '>', since).limit(1).get();
    if (!q.empty) return true;
  }
  return false;
}

async function buildPlan(uid, p, now) {
  const user = db.collection('users').doc(uid);
  const today = now.date, tomorrow = addDays(today, 1);
  const prof = (await db.doc(`users/${uid}/profile/me`).get()).data() || {};
  const hidden = new Set(prof.sharedHidden || []);
  const own = docs(await user.collection('events').get());
  const shared = docs(await db.collection('shared').where('members', 'array-contains', uid).get()).filter(e => !hidden.has(e.id));
  const events = [...own.map(e => ({ ...e, _eid: e.id })), ...shared.map(e => ({ ...e, _eid: `sh_${e.id}` }))];
  const items = [];
  const add = (at, key, body, kind = '', eid = '', title = 'Mi Agenda Teocrática') => { if (at >= 0 && at < 24 * 60) items.push({ at, key, title, body, kind, eid }); };
  const before = Math.max(0, Number(p.before) || 0);

  events.filter(e => occursOn(e, today)).forEach(e => {
    const s = toMin(e.time);
    const done = (e.doneLog?.[today] || []).includes(uid);
    if (p.soon && s != null && before) add(s - before, `ev:${e.id}:${today}`, `⏰ En ${before} min: ${e.title || 'evento'} (${fmtTime(e.time)})${e.place ? ` · ${e.place}` : ''}`, isRoutine(e) ? 'routine' : 'soon');
    if (isRoutine(e) && !done) {
      const endM = toMin(e.endTime) ?? (s != null ? s + 60 : null);
      if (p.routine) add(endM != null ? Math.min(endM + 30, 23 * 60 + 30) : 21 * 60, `rt:${e.id}:${today}`, `📖 Aún no marcaste «${e.title || 'tu rutina'}» de hoy. ¿Ya lo hiciste?`, 'routine', e._eid);
      const st = streakOf(e, uid, today);
      if (p.streak && st >= 3) add(21 * 60 + 15, `st:${e.id}:${today}`, `🔥 Llevas ${st} días seguidos con «${e.title}». ¡No pierdas la racha hoy!`, 'streak', e._eid);
    }
  });
  if (p.taskTime) {
    docs(await user.collection('tasks').where('due', '==', today).get())
      .filter(t => t.status !== 'hecha' && isMine(t) && toMin(t.dueTime) != null)
      .forEach(t => add(toMin(t.dueTime) - before, `tk:${t.id}:${today}`, p.details ? `📋 A las ${fmtTime(t.dueTime)}: ${t.title}` : `📋 Tienes una tarea a las ${fmtTime(t.dueTime)}`, 'task'));
  }
  if (p.meetingSoon) {
    docs(await user.collection('meetings').where('date', '==', today).get()).filter(m => toMin(m.time) != null).forEach(m => {
      const n = (m.agenda || []).length;
      add(toMin(m.time) - 60, `mt:${m.id}:${today}`, `🗓 En 1 hora: ${p.details && m.title ? m.title : 'reunión'} (${fmtTime(m.time)})${n ? ` · agenda de ${plural(n, 'punto', 'puntos')}` : ''}${n && !m.agendaSentAt ? ' · aún no la enviaste' : ''}`, 'meeting');
    });
  }
  if (p.tomorrow) {
    const tmr = events.filter(e => occursOn(e, tomorrow) && e.time).sort((a, b) => a.time.localeCompare(b.time));
    if (tmr.length) add(21 * 60 + 30, `tm:${today}`, `🌙 Mañana: ${plural(tmr.length, 'evento', 'eventos')}; el primero, ${tmr[0].title} a las ${fmtTime(tmr[0].time)}.`, 'tomorrow');
  }
  // Aviso importante de cada noche: registra tu actividad (horas y cursos) antes de que termine el día.
  // Siempre sale (no se puede apagar), salvo que la sección «Mi Informe» esté oculta.
  if (!(prof.hiddenModules || []).includes('informe') && !(prof.noActivityDays || []).includes(today)) {
    const hoy = docs(await user.collection('entries').where('date', '==', today).get());
    const mins = hoy.reduce((a, e) => a + (Number(e.minutes) || 0), 0);
    const cursos = hoy.reduce((a, e) => a + (Array.isArray(e.studyNames) ? e.studyNames.length : Number(e.studies) || 0), 0);
    const hhmm = `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')} h`;
    const body = hoy.length
      ? `📝 Hoy registraste ${hhmm}${cursos ? ` y ${plural(cursos, 'curso', 'cursos')}` : ''}. ¿Te falta algo por anotar antes de que termine el día?`
      : '📝 Registra tu actividad de hoy: aún no guardaste horas ni cursos. Hazlo antes de que termine el día.';
    add(Number(p.logAt) || 1230, `lg:${today}`, body, 'log', '', 'Importante · Mi Agenda');
  }
  if (p.report && now.day <= 3) {
    const [y, m] = today.split('-').map(Number);
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    const had = !(await user.collection('entries').where('date', '>=', `${prev}-01`).where('date', '<=', `${prev}-31`).limit(1).get()).empty;
    if (had) add(Number(p.hour || 7) * 60 + 30, `rp:${prev}`, `📊 Recuerda enviar tu informe de ${MESES[Number(prev.slice(5)) - 1]}. Ábrelo en Mi Informe → Enviar.`, 'report');
  }
  return items.sort((a, b) => a.at - b.at);
}

async function dayReminders(uid, allDevices) {
  const tz = allDevices.find(d => d.tz)?.tz || 'America/Caracas';
  const now = localNow(tz);
  const p = await prefsOf(uid);
  // Con la app de Android, el teléfono ya programa estos avisos: por la web solo van a la computadora
  const devices = p._native ? allDevices.filter(d => d.mobile === false) : allDevices;
  if (!devices.length) return 0;
  const ref = db.doc(`users/${uid}/meta/plan`);
  let plan = (await ref.get()).data();
  const stale = forceStale.has(uid) || !plan || plan.date !== now.date || Date.now() - Date.parse(plan.builtAt || 0) > 3600e3 || await changedSince(uid, plan.builtAt);
  if (stale) {
    const sent = plan && plan.date === now.date ? plan.sent || [] : [];
    plan = { date: now.date, builtAt: new Date().toISOString(), items: await buildPlan(uid, p, now), sent };
  }
  const already = new Set(plan.sent || []);
  const due = plan.items.filter(it => it.at <= now.min && it.at > now.min - 40 && !already.has(it.key));
  let n = 0;
  for (const it of due) { n += await sendTo(uid, devices, { title: it.title, body: it.body, url: './', tag: it.key, kind: it.kind || '', eid: it.eid || '', day: it.eid ? now.date : '' }); already.add(it.key); }
  if (stale || due.length) await ref.set({ ...plan, sent: [...already] });
  return n;
}

// Alguien marcó hecha una rutina compartida: avisa a los demás («✓ Persona B ya hizo…»)
async function checkPartnerDone(since) {
  const snap = await db.collection('shared').where('doneAt', '>', since).get();
  snap.docs.forEach(d => (d.data().members || []).forEach(u => forceStale.add(u)));
  let n = 0;
  for (const d of snap.docs) {
    const e = d.data();
    const who = e.doneBy, day = e.doneDay;
    if (!who || !day || !(e.doneLog?.[day] || []).includes(who)) continue;
    const name = e.memberNames?.[who] || 'Alguien';
    for (const uid of e.members || []) {
      if (uid === who) continue;
      const devices = await devicesOf(uid);
      if (!devices.length || !(await prefsOf(uid)).partner) continue;
      n += await sendTo(uid, devices, { title: 'Mi Agenda Teocrática', body: `✓ ${name} ya hizo «${e.title || 'la rutina'}»${(e.doneLog?.[day] || []).includes(uid) ? ' (y tú también 🙌)' : '. ¿Y tú?'}`, url: './', tag: `pd-${d.id}-${day}`, kind: 'partner', ...((e.doneLog?.[day] || []).includes(uid) ? {} : { eid: `sh_${d.id}`, day }) });
    }
  }
  return n;
}

async function main() {
  const runRef = db.doc('meta/avisos');
  const lastRun = (await runRef.get()).data()?.lastRun || new Date(Date.now() - 2 * 3600e3).toISOString();
  const startedAt = new Date().toISOString();
  await checkNewVersion().catch(e => log.error('Versión', e.message));
  await checkShared(lastRun).catch(e => log.error('Compartidos', e.message));
  const partner = await checkPartnerDone(lastRun).catch(e => { log.error('Rutinas compartidas', e.message); return 0; });
  const users = await db.collection('directory').get();
  let tests = 0, sent = 0, during = 0, phones = 0, withPhone = 0;
  for (const u of users.docs) {
    try {
      const devices = await devicesOf(u.id);
      if (!devices.length) continue;
      withPhone++; phones += devices.length;
      tests += await checkTest(u.id, devices);
      sent += await daily(u.id, devices);
      during += await dayReminders(u.id, devices);
    } catch (e) { log.error('Error con un usuario', e.message); }
  }
  await runRef.set({ lastRun: startedAt }, { merge: true });
  log.info('Listo', { cuentas: users.size, cuentasConAvisos: withPhone, telefonos: phones, resumenDiario: sent, avisosDelDia: during, pruebas: tests, rutinasCompartidas: partner, entregadosAGoogle: stats.ok, fallidos: stats.fallidos, errores: stats.errores });
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
