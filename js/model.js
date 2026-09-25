// Reglas del dominio: categorías, tipos, recurrencia semanal y consultas de agenda.

import { data, session } from './store.js';
import { today, diffDays, fmtShort, fmtTime, norm, dateOf, parseISO, addDays } from './util.js';

export const APP_VERSION = '4.6';

// ───────────── Tipos de perfil (los asigna el administrador en modo nube) ─────────────
// Cada tipo decide qué categorías de evento y de Mi Informe se ofrecen. Lo ya guardado se sigue viendo igual.
export const PROFILE_TYPES = {
  publicador: { n: 'Publicador',                   hideEventCats: ['ancianos', 'pastoreo'], hideServCats: ['pastoreo'] },
  precursor:  { n: 'Precursor',                    hideEventCats: ['ancianos', 'pastoreo'], hideServCats: ['pastoreo'], goal: true },
  anciano:    { n: 'Anciano / Siervo ministerial', hideEventCats: [],                      hideServCats: [] },
};
// Sin tipo asignado (modo local, administrador sin tipo o reglas antiguas) se ve todo.
export const profileType = () => (PROFILE_TYPES[session.type] ? session.type : 'anciano');
export const profileTypeInfo = () => PROFILE_TYPES[profileType()];

// Tipos de evento (el color identifica la categoría en el calendario)
export const CATEGORIAS = {
  reunion:     { n: 'Reunión de congregación', c: 'var(--c-reunion)' },
  predicacion: { n: 'Predicación',             c: 'var(--c-predicacion)' },
  pastoreo:    { n: 'Pastoreo',                c: 'var(--c-pastoreo)' },
  ancianos:    { n: 'Cuerpo de ancianos',      c: 'var(--c-ancianos)' },
  estudio:     { n: 'Estudio y preparación',   c: 'var(--c-estudio)' },
  personal:    { n: 'Personal',                c: 'var(--c-personal)' },
};

// Tipos de evento que se ofrecen según el perfil (si se edita uno con un tipo oculto, se conserva)
export function eventCats(current) {
  const hide = profileTypeInfo().hideEventCats;
  return Object.fromEntries(Object.entries(CATEGORIAS).filter(([k]) => !hide.includes(k) || k === current));
}

export const KINDS = {
  visita:       'Visita',
  capacitacion: 'Capacitación',
  estudio:      'Plan de estudio',
  llamada:      'Llamada o mensaje',
  otro:         'Otro',
};

export const STATUS = {
  pendiente:   'Pendiente',
  seguimiento: 'En seguimiento',
  hecha:       'Hecha',
};

// Privilegios y responsabilidades que puede tener una persona (se pueden agregar otros; quedan en tu lista)
export const PRIVILEGES = [
  'Coordinador del cuerpo de ancianos', 'Secretario', 'Superintendente de servicio',
  'Superintendente de la reunión Vida y Ministerio', 'Conductor de La Atalaya', 'Consejero auxiliar',
  'Superintendente de grupo', 'Auxiliar de grupo',
  'Siervo de cuentas', 'Siervo de publicaciones', 'Siervo de territorios', 'Siervo de acomodadores', 'Siervo de audio y video',
  'Coordinador de mantenimiento', 'Comité de Enlace con los Hospitales', 'Grupo de Visita a Pacientes',
  'Coordinador de discursos públicos', 'Hospitalidad para oradores visitantes', 'Conductor del Estudio Bíblico de la Congregación',
  'Lector', 'Encargado de la predicación pública con exhibidores', 'Encargado de limpieza del Salón', 'Encargado de los grupos de servicio en idioma o señas',
  'Superintendente de circuito sustituto', 'Precursor regular', 'Precursor auxiliar', 'Precursor especial',
];
// Todos los que se ofrecen: los fijos + los que agregaste + los que ya tiene alguien
export function allPrivileges() {
  const extra = [...savedTypes('privileges'), ...data.people.flatMap(p => p.privileges || [])]
    .filter(x => x && !PRIVILEGES.some(b => norm(b) === norm(x)));
  return [...PRIVILEGES, ...[...new Set(extra)].sort((a, b) => a.localeCompare(b, 'es'))];
}

// Sugerencias para el campo "Relación" de una persona (se puede escribir cualquier otra)
export const ROLES = ['Hermano', 'Hermana', 'Estudiante bíblico', 'Publicador', 'Siervo ministerial', 'Precursor', 'Anciano', 'Interesado', 'Familiar'];

// Los tipos escritos a mano se guardan como texto; su color sale del propio texto
export function customColor(text) {
  let h = 0;
  for (const c of String(text)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `var(--c-x${(h % 4) + 1})`;
}
export const catOf = key => CATEGORIAS[key] || (key ? { n: key, c: customColor(key) } : CATEGORIAS.personal);
// Color de un evento: el que elegiste para ese evento o, si no, el de su tipo
export const EVENT_COLORS = [['', 'Del tipo'], ['#8FD3E8', 'Celeste'], ['#F5D76E', 'Amarillo'], ['#F4B183', 'Naranja'], ['#C9B6E4', 'Lila'], ['#8E7CC3', 'Morado'], ['#F2A7C3', 'Rosado'], ['#A8D5A2', 'Verde'], ['#E57373', 'Rojo'], ['#9E9E9E', 'Gris']];
export const eventColor = e => (e && e.color) || catOf(e?.category).c;
export const kindLabel = k => KINDS[k] || k || '';

// Fecha que se muestra y usa para ordenar una nota: la que el usuario puso a mano
// (cuándo la hizo o cuándo fue la reunión) y, si no puso ninguna, la última modificación.
export const noteDate = n => n.date || (n.updatedAt ? dateOf(n.updatedAt) : '');

// Tipos escritos a mano que ya se usaron en esa colección (para ofrecerlos de nuevo)
// Tipos propios: los que guardaste en tu lista (Mi perfil → customKinds / customEventCats) más los que ya usa algún
// elemento, sin repetir los de la lista fija. Así lo que escribes una vez queda como una opción más.
export const CUSTOM_TYPE_FIELD = { tasks: 'customKinds', events: 'customEventCats', privileges: 'customPrivileges' };
export const savedTypes = col => profile()[CUSTOM_TYPE_FIELD[col]] || [];
export const customTypes = (col, field, builtIns) =>
  [...new Set([...savedTypes(col), ...data[col].map(x => x[field])].filter(v => v && !builtIns[v]))].sort((a, b) => a.localeCompare(b, 'es'));

// Convierte lo elegido en el formulario a lo que se guarda.
// Devuelve null si eligió «Otro» y no escribió nada. Si lo escrito coincide con un tipo de la lista, usa ese.
export function resolveType(selected, typed, builtIns) {
  if (selected !== '__otro') return selected;
  const t = String(typed || '').trim();
  if (!t) return null;
  for (const [k, v] of Object.entries(builtIns)) {
    if (norm(typeof v === 'string' ? v : v.n) === norm(t) || k === norm(t)) return k;
  }
  return t;
}

export const groupsOf = p => (p.groupIds || [])
  .map(id => data.groups.find(g => g.id === id)).filter(Boolean)
  .sort((a, b) => a.name.localeCompare(b.name, 'es'));
export const person = id => data.people.find(p => p.id === id);
export const groupName = id => data.groups.find(g => g.id === id)?.name || '';

// Cuando cambia a qué grupos pertenece una persona, guarda en qué fecha salió de cada uno
// que dejó (así se sabe desde cuándo ya no forma parte) y borra esa fecha si vuelve a entrar.
export function updateGroupMembership(prevGroupIds, newGroupIds, prevLeftAt) {
  const leftAt = { ...(prevLeftAt || {}) };
  const now = today();
  (prevGroupIds || []).forEach(gid => { if (!newGroupIds.includes(gid)) leftAt[gid] = now; });
  newGroupIds.forEach(gid => { delete leftAt[gid]; });
  return leftAt;
}

// Personas que en algún momento pertenecieron a este grupo y ya no, con la fecha en que salieron
export function formerMembers(groupId) {
  return data.people
    .filter(p => p.groupLeftAt?.[groupId] && !(p.groupIds || []).includes(groupId))
    .map(p => ({ person: p, leftAt: p.groupLeftAt[groupId] }))
    .sort((a, b) => b.leftAt.localeCompare(a.leftAt));
}

// De los grupos participantes de una reunión, quiénes ya no forman parte de ellos
// (pero sí estaban cuando ocurrió la reunión), con la fecha en que salieron.
export function departedSince(groupIds, sinceDate) {
  return data.people
    .filter(p => (groupIds || []).some(gid =>
      p.groupLeftAt?.[gid] && p.groupLeftAt[gid] > sinceDate && !(p.groupIds || []).includes(gid)))
    .map(p => {
      const gid = groupIds.find(g =>
        p.groupLeftAt?.[g] && p.groupLeftAt[g] > sinceDate && !(p.groupIds || []).includes(g));
      return { person: p, groupId: gid, leftAt: p.groupLeftAt[gid] };
    })
    .sort((a, b) => a.leftAt.localeCompare(b.leftAt));
}

// ───────────── Mi Informe: categorías de tiempo, perfil y metas ─────────────
// «credito» = tiempo que no cuenta para tu meta personal salvo que actives «Con crédito» (LDC, Betel…).
export const SERVICIO_CATS = {
  campo:      { n: 'Servicio del Campo',     c: 'var(--c-s1)',          credito: false, ic: 'calendar' },
  familia:    { n: 'Adoración en familia',   c: 'var(--c-s2)',          credito: false, ic: 'users' },
  publica:    { n: 'Predicación pública',    c: 'var(--c-predicacion)', credito: false, ic: 'pin' },
  informal:   { n: 'Informal',               c: 'var(--c-x1)',         credito: false, ic: 'chat' },
  telefonica: { n: 'Predicación telefónica', c: 'var(--c-ancianos)',   credito: false, ic: 'phone' },
  ldc:        { n: 'LDC',                    c: 'var(--c-estudio)',    credito: true,  ic: 'hammer' },
  betel:      { n: 'Betel',                  c: 'var(--c-x2)',         credito: true,  ic: 'building' },
  pastoreo:   { n: 'Pastoreo',               c: 'var(--c-pastoreo)',   credito: false, ic: 'users' },
};
export const catServicioOf = key => SERVICIO_CATS[key] || customCatOf(key) || { n: key || 'Otro', c: 'var(--c-personal)', credito: false, ic: 'clip' };

// Categorías que el propio usuario agregó (además de las fijas), con un color que se les asigna por turno
const CUSTOM_PALETTE = ['var(--c-x3)', 'var(--c-x4)', 'var(--c-mtg)', 'var(--c-x1)', 'var(--c-x2)', 'var(--c-s1)', 'var(--c-s2)', 'var(--c-estudio)'];
function customCatOf(key) {
  const list = profile().customCats || [];
  const idx = list.findIndex(c => c.key === key);
  if (idx === -1) return null;
  const c = list[idx];
  return { n: c.n, c: CUSTOM_PALETTE[idx % CUSTOM_PALETTE.length], credito: !!c.credito, ic: c.ic || 'clip', archived: !!c.archived };
}

// Iconos para las categorías propias
export const CAT_ICONS = [
  ['medical', 'Médico'], ['hospital', 'Hospital'], ['hammer', 'Construcción'], ['building', 'Edificio'],
  ['book', 'Libro'], ['school', 'Escuela'], ['cart', 'Exhibidor'], ['mic', 'Discurso'],
  ['heart', 'Ayuda'], ['letter', 'Cartas'], ['phone', 'Teléfono'], ['globe', 'Idioma'],
  ['car', 'Viaje'], ['users', 'Personas'], ['shield', 'Comité'], ['clip', 'General'],
];
// Sugiere un icono a partir del nombre (p. ej. «CEH» → médico); el usuario lo puede cambiar
const ICON_HINTS = [
  [/\bceh\b|hospital|medic|salud|enlace/, 'medical'],
  [/\bldc\b|constru|obra|remodel|manten/, 'hammer'],
  [/betel|oficina|sucursal|salon|salón/, 'building'],
  [/escuela|curso|capacit|clase|estudio/, 'school'],
  [/carrito|exhib|publica|pública/, 'cart'],
  [/discurso|asamblea|congreso|conferencia/, 'mic'],
  [/carta|correo/, 'letter'], [/telefon|llamad/, 'phone'],
  [/idioma|lengua|traduc|extranjer/, 'globe'], [/viaje|circuito|ruta/, 'car'],
  [/ayuda|socorro|desastre|voluntar/, 'heart'], [/comite|comité|comision|comisión/, 'shield'],
];
export function suggestIcon(name) {
  const n = norm(name);
  const hit = ICON_HINTS.find(([re]) => re.test(n));
  return hit ? hit[1] : 'clip';
}

// Todas las categorías disponibles para elegir al registrar tiempo: las fijas + las que agregaste tú
export function allServicioCats() {
  const hide = profileTypeInfo().hideServCats;
  const fixed = Object.fromEntries(Object.entries(SERVICIO_CATS).filter(([k]) => !hide.includes(k)));
  const custom = Object.fromEntries((profile().customCats || []).filter(c => !c.archived).map(c => [c.key, customCatOf(c.key)]));
  return { ...fixed, ...custom };
}

export const PUBLISHER_ROLES = ['Publicador', 'Precursor auxiliar', 'Precursor regular', 'Precursor especial', 'Anciano', 'Siervo ministerial', 'Coordinador del cuerpo de ancianos', 'Secretario', 'Superintendente de servicio', 'Misionero', 'Superintendente de circuito'];

// «Sirvo como…» admite varias opciones (p. ej. Anciano y Precursor regular).
// Los perfiles antiguos solo tenían un texto en «role»; se leen igual.
export function profileRoles(v = profile()) {
  if (Array.isArray(v.roles)) return v.roles;
  return String(v.role || '').split(/\s*,\s*/).filter(Boolean);
}
export const roleText = (v = profile()) => profileRoles(v).join(', ');

export const profile = () => data.profile.find(p => p.id === 'me') || { id: 'me', role: '', photo: '', goalEnabled: false, goalMonthly: '', goalAnnual: '', hiddenModules: [], customCats: [] };

// ───────────── Secciones que se pueden mostrar u ocultar ─────────────
// «Hoy» siempre está disponible; el resto lo puede apagar cada usuario desde Ajustes.
export const MODULES = [
  { id: 'agenda',   n: 'Agenda' },
  { id: 'tareas',   n: 'Tareas' },
  { id: 'personas', n: 'Personas' },
  { id: 'notas',    n: 'Notas' },
  { id: 'informe',  n: 'Informe' },
];
// ───────────── Accesos rápidos (fila de botones en Hoy y accesos del ícono de la app) ─────────────
export const QUICK_ACTIONS = [
  { id: 'time',      n: 'Registrar tiempo', ic: 'clock',    mod: 'informe' },
  { id: 'task',      n: 'Nueva tarea',      ic: 'tasks',    mod: 'tareas' },
  { id: 'meeting',   n: 'Nueva reunión',    ic: 'clip',     mod: 'notas' },
  { id: 'note',      n: 'Nota rápida',      ic: 'notebook', mod: 'notas' },
  { id: 'event',     n: 'Nuevo evento',     ic: 'calendar', mod: 'agenda' },
  { id: 'person',    n: 'Buscar persona',   ic: 'users',    mod: 'personas' },
  { id: 'week',      n: 'Planear semana',   ic: 'chart',    mod: 'informe' },
  { id: 'supervise', n: 'Por supervisar',   ic: 'check',    mod: 'tareas' },
  { id: 'search',    n: 'Buscar en todo',   ic: 'search',   mod: '' },
];
export const DEFAULT_QUICK = ['time', 'task', 'meeting', 'note'];
// Los que se muestran: los que eligió el usuario (o los de siempre), sin los de secciones ocultas
export const quickActions = () => {
  const chosen = Array.isArray(profile().quickActions) ? profile().quickActions : DEFAULT_QUICK;
  return QUICK_ACTIONS.filter(q => chosen.includes(q.id) && (!q.mod || isModuleVisible(q.mod)));
};

export const isModuleVisible = id => !(profile().hiddenModules || []).includes(id);
export const visibleModules = () => MODULES.filter(m => isModuleVisible(m.id));

// ───────────── Ritmo de la meta mensual ─────────────
// Compara cuánto llevas con cuánto «deberías» llevar según los días transcurridos del mes,
// con un margen de tolerancia para no marcar «atrasado» o «adelantado» por casi nada.
export const PACE = {
  atrasado:    { emoji: '🐢', label: 'Vas lento con tus horas' },
  alDia:       { emoji: '🦉', label: 'Vas al ras' },
  adelantado:  { emoji: '🐇', label: 'Vas adelantado' },
};

export function paceStatus(mid, minutesDone, goalMonthlyHours) {
  const goal = Number(goalMonthlyHours);
  if (!goal) return null;
  const [y, m] = mid.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const isCurrent = mid === today().slice(0, 7);
  const dayOfMonth = isCurrent ? Math.min(daysInMonth, Number(today().slice(8, 10))) : daysInMonth;
  const expectedHours = goal * (dayOfMonth / daysInMonth);
  const actualHours = minutesDone / 60;
  const diffHours = actualHours - expectedHours;
  const margin = Math.max(1, goal * 0.08);   // ~8% de la meta, mínimo 1 hora
  const status = diffHours < -margin ? 'atrasado' : diffHours > margin ? 'adelantado' : 'alDia';
  return { status, diffHours, expectedHours, expectedPct: Math.min(100, expectedHours / goal * 100), isCurrent, ...PACE[status] };
}

// Entradas de un mes ("YYYY-MM"), más recientes primero
export const entriesForMonth = mid => data.entries.filter(e => (e.date || '').startsWith(mid)).sort((a, b) => b.date.localeCompare(a.date));

// Suma de un mes: minutos de servicio (y de crédito si se pide), y cursos bíblicos
export function monthTotals(mid, withCredit = false) {
  let minutes = 0, studies = 0;
  entriesForMonth(mid).forEach(e => {
    const cat = catServicioOf(e.category);
    if (!cat.credito || withCredit) minutes += Number(e.minutes) || 0;
    studies += Array.isArray(e.studyNames) ? e.studyNames.length : (Number(e.studies) || 0);
  });
  return { minutes, studies };
}

// Suma del año de servicio completo, para la meta anual
export function yearTotals(withCredit = false) {
  return serviceYearMonths().reduce((acc, mo) => {
    const t = monthTotals(mo.id, withCredit);
    return { minutes: acc.minutes + t.minutes, studies: acc.studies + t.studies };
  }, { minutes: 0, studies: 0 });
}

export const fmtHM = min => { min = Math.max(0, Math.round(min)); return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`; };

// Días que quedan del mes contando hoy (para saber cuántas horas por día necesitas)
export function daysLeftInMonth(mid) {
  const [y, m] = mid.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const t = today();
  if (mid !== t.slice(0, 7)) return mid > t.slice(0, 7) ? days : 0;
  return days - Number(t.slice(8, 10)) + 1;
}

// ───────────── Mi semana: plan de horas por día y objetivos de la semana ─────────────
export const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const weekStart = (iso = today()) => addDays(iso, -((parseISO(iso).getDay() + 6) % 7));   // lunes
export const weekDates = (iso = today()) => { const s = weekStart(iso); return [0, 1, 2, 3, 4, 5, 6].map(i => addDays(s, i)); };
const dayIdx = iso => (parseISO(iso).getDay() + 6) % 7;                                             // 0 = lunes

// Minutos planeados para cada día de la semana (lunes a domingo); es una plantilla que se repite cada semana
export const weekPlan = (v = profile()) => (Array.isArray(v.weekPlan) && v.weekPlan.length === 7 ? v.weekPlan : [0, 0, 0, 0, 0, 0, 0]).map(n => Number(n) || 0);
export const planWeekTotal = plan => plan.reduce((a, b) => a + b, 0);

// Cuánto harías en un mes siguiendo el plan, contando los días reales del calendario
export function planForMonth(mid, plan = weekPlan()) {
  const [y, m] = mid.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  let min = 0;
  for (let d = 1; d <= days; d++) min += plan[dayIdx(`${mid}-${String(d).padStart(2, '0')}`)];
  return min;
}

// Minutos registrados en una fecha (sin crédito, salvo que se pida)
export const minutesOn = (iso, withCredit = false) => data.entries
  .filter(e => e.date === iso && (withCredit || !catServicioOf(e.category).credito))
  .reduce((a, e) => a + (Number(e.minutes) || 0), 0);

// ¿Es precursor? (por el tipo que asignó el administrador o por lo que marcó en «Sirvo como…»)
export const isPioneer = (v = profile()) => !!profileTypeInfo().goal || profileRoles(v).some(r => /precursor/i.test(r));

// Objetivos de una semana (colección «weeks», un documento por semana con id = fecha del lunes)
export const weekDoc = (ws = weekStart()) => data.weeks.find(w => w.id === ws) || { id: ws, goals: [] };

// Año de servicio: de septiembre a agosto, calculado a partir de una fecha (hoy por defecto).
const MES_NOMBRE = ['septiembre', 'octubre', 'noviembre', 'diciembre', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto'];

export function serviceYearStart(iso = today()) {
  const [y, m] = iso.split('-').map(Number);
  return m >= 9 ? y : y - 1;
}

// Los 12 meses del año de servicio, con el id ("YYYY-MM") usado para guardar cada uno
export function serviceYearMonths(startYear = serviceYearStart()) {
  return MES_NOMBRE.map((name, i) => {
    const year = i < 4 ? startYear : startYear + 1;
    const mm = ((8 + i) % 12) + 1;
    return { id: `${year}-${String(mm).padStart(2, '0')}`, name, year };
  });
}

// ¿El evento ocurre en esa fecha? (soporta repetición semanal y saltarse semanas puntuales)
export const REPEATS = { none: 'No se repite', daily: 'Cada día', days: 'Algunos días de la semana', weekly: 'Cada semana', biweekly: 'Cada 2 semanas', monthly: 'Cada mes (mismo día)' };
// Días para «Algunos días de la semana» (0 = domingo, como getDay), en el orden en que se muestran
export const REPEAT_DAYS = [[1, 'Lun'], [2, 'Mar'], [3, 'Mié'], [4, 'Jue'], [5, 'Vie'], [6, 'Sáb'], [0, 'Dom']];
const weekdayOf = iso => new Date(`${iso}T12:00:00`).getDay();
// Texto corto de la repetición: «Cada día», «Lun, Mar, Vie», «Cada semana (martes)»…
export function repeatText(ev) {
  if (ev.repeat === 'days') { const d = ev.days || []; return d.length === 7 ? 'Cada día' : REPEAT_DAYS.filter(([n]) => d.includes(n)).map(([, t]) => t).join(', ') || 'Sin días'; }
  if (ev.repeat === 'weekly' || ev.repeat === 'biweekly') return `${REPEATS[ev.repeat]} (${['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][weekdayOf(ev.date)]})`;
  return REPEATS[ev.repeat] || REPEATS.none;
}
export const isRepeating = ev => !!ev.repeat && ev.repeat !== 'none';

export function occursOn(ev, iso) {
  if (!ev.date) return false;
  if ((ev.skipDates || []).includes(iso)) return false;
  if (iso < ev.date) return ev.date === iso;
  switch (ev.repeat) {
    case 'daily':    return true;
    case 'days':     return (ev.days || []).includes(weekdayOf(iso));
    case 'weekly':   return diffDays(iso, ev.date) % 7 === 0;
    case 'biweekly': return diffDays(iso, ev.date) % 14 === 0;
    case 'monthly':  return iso.slice(8, 10) === ev.date.slice(8, 10);
    default:         return ev.date === iso;
  }
}

// Agrega o quita una fecha de las semanas saltadas de un evento repetido
export function toggleSkip(ev, iso) {
  const skip = ev.skipDates || [];
  return skip.includes(iso) ? skip.filter(d => d !== iso) : [...skip, iso].sort();
}

const byTime = (a, b) => (a.time || '').localeCompare(b.time || '');

// Todo lo que hay en una fecha: eventos, reuniones importantes y tareas con esa fecha
export function agendaFor(iso) {
  return {
    events: data.events.filter(e => occursOn(e, iso)).sort(byTime),
    meetings: data.meetings.filter(m => m.date === iso).sort(byTime),
    tasks: data.tasks.filter(t => t.due === iso && t.status !== 'hecha').sort((a, b) => (a.dueTime || '').localeCompare(b.dueTime || '')),
  };
}

// ───── Rutinas: marcar como hecho un evento que se repite ─────
// event.doneLog = { 'AAAA-MM-DD': [quién] }  (quién = uid en la nube, «me» en modo local)
export const isDoneBy = (ev, iso, who) => (ev.doneLog?.[iso] || []).includes(who);
// Días seguidos que lo hiciste (si hoy aún no, cuenta desde ayer). Solo cuenta los días en que el evento ocurre.
export function streak(ev, who, from = today()) {
  let d = isDoneBy(ev, from, who) ? from : addDays(from, -1), n = 0;
  for (let i = 0; i < 400 && d >= (ev.date || d); i++, d = addDays(d, -1)) {
    if (!occursOn(ev, d)) continue;
    if (!isDoneBy(ev, d, who)) break;
    n++;
  }
  return n;
}

// ───── Semana en cuadro (como un calendario impreso): filas por hora, columnas por día ─────
export const addDaysISO = addDays;
export function mondayOf(iso) { const d = parseISO(iso); const w = (d.getDay() + 6) % 7; return addDays(iso, -w); }
export function weekGrid(monday) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const rows = new Map();
  days.forEach((iso, col) => {
    const a = agendaFor(iso);
    const items = [...a.events.map(e => ({ kind: 'event', item: e })), ...a.meetings.map(m => ({ kind: 'meeting', item: m }))];
    items.forEach(({ kind, item }) => {
      const key = item.time || '';
      if (!rows.has(key)) rows.set(key, days.map(() => []));
      rows.get(key)[col].push({ kind, item, iso, color: kind === 'meeting' ? 'var(--c-mtg)' : eventColor(item) });
    });
  });
  return { days, rows: [...rows.entries()].sort(([a], [b]) => (a || '00').localeCompare(b || '00')).map(([time, cells]) => ({ time, cells })) };
}

// Eventos + reuniones mezclados y ordenados por hora
export const entriesFor = a =>
  [...a.events.map(item => ({ kind: 'event', item })), ...a.meetings.map(item => ({ kind: 'meeting', item }))]
    .sort((x, y) => byTime(x.item, y.item));

// Texto y estilo de la fecha límite de una tarea
export function dueInfo(t) {
  if (!t.due || t.status === 'hecha') return { label: '', cls: '', time: '' };
  const n = diffDays(t.due, today());
  const time = fmtTime(t.dueTime);
  if (n < 0) return { label: n === -1 ? 'Venció ayer' : `Venció hace ${-n} d`, cls: 'late', time: '' };
  if (n === 0) return { label: 'Hoy', cls: 'soon', time };
  if (n === 1) return { label: 'Mañana', cls: '', time };
  return { label: fmtShort(t.due), cls: '', time };
}

// Activas: primero las más próximas a vencer; las que no tienen fecha, al final
export const sortActive = list =>
  [...list].sort((a, b) => ((a.due || '9999') + (a.dueTime || '')).localeCompare((b.due || '9999') + (b.dueTime || '')) || (a.createdAt || '').localeCompare(b.createdAt || ''));
export const sortDone = list => [...list].sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));

// Participantes de una reunión: grupos y personas elegidos + los nombres escritos a mano
export function attendeesText(m) {
  const g = (m.attendeeGroupIds || []).map(id => data.groups.find(x => x.id === id)?.name).filter(Boolean);
  const p = (m.attendeeIds || []).map(id => person(id)?.name).filter(Boolean);
  return [...g, ...p, m.attendees].filter(Boolean).join(', ');
}

// Quién acompaña en un evento: para «Cuerpo de ancianos» pueden ser varios grupos/personas;
// para el resto, la persona única de siempre.
export function eventCompanionsText(ev) {
  const g = (ev.companionGroupIds || []).map(id => groupName(id)).filter(Boolean);
  const p = (ev.companionPersonIds || []).map(id => person(id)?.name).filter(Boolean);
  if (g.length || p.length) return [...g, ...p].join(', ');
  return person(ev.companionId)?.name || '';
}

// ───────────── Búsqueda global ─────────────
export function globalSearch(q) {
  const nq = norm(q);
  if (!nq) return { events: [], tasks: [], people: [], notes: [], meetings: [] };
  const has = (...parts) => norm(parts.filter(Boolean).join(' ')).includes(nq);
  return {
    events: data.events.filter(e => has(e.title, e.place, e.notes)).slice(0, 20),
    tasks: data.tasks.filter(t => has(t.title, t.notes)).slice(0, 20),
    people: data.people.filter(p => has(p.name, p.role, p.phone, p.notes)).slice(0, 20),
    notes: data.notes.filter(n => has(n.title, n.body, n.tag)).slice(0, 20),
    meetings: data.meetings.filter(m => has(m.title, m.place, m.topics, m.notes, m.attendees, (m.agenda || []).map(x => [x.t, ...(x.subs || [])].join(' ')).join(' '))).slice(0, 20),
  };
}


// ───────────── Acuerdos de una reunión → tareas ─────────────
// Lee «Acuerdos y notas» y encuentra cada acuerdo (una línea por acuerdo). No «entiende» el texto:
// reconoce líneas con viñeta (-, •, *, 1.) y, dentro de cada una, el nombre de alguien de Personas
// y fechas escritas de forma común («el viernes», «15/10», «20 de octubre», «mañana», «en 2 semanas»).

const DOW_WORDS = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
const MONTH_WORDS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const BULLET = /^\s*(?:[-•*·–—]|\d{1,2}[.)])\s+/;

// Clave para saber si un acuerdo ya tiene su tarea (no cambia con mayúsculas, acentos ni espacios)
export const agreementKey = text => norm(text).replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();

// Fecha (AAAA-MM-DD) mencionada en el texto, tomando como referencia el día de la reunión
export function findDate(text, base) {
  const n = norm(text);
  const pad2 = x => String(x).padStart(2, '0');
  const future = (y, m, d) => {   // si la fecha ya pasó respecto a la reunión, es del año siguiente
    let iso = `${y}-${pad2(m)}-${pad2(d)}`;
    if (iso < base) iso = `${y + 1}-${pad2(m)}-${pad2(d)}`;
    return iso;
  };
  const by = Number(base.slice(0, 4));
  let r;
  if ((r = n.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/))) {
    const d = +r[1], m = +r[2];
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      if (r[3]) { const y = r[3].length === 2 ? 2000 + +r[3] : +r[3]; return `${y}-${pad2(m)}-${pad2(d)}`; }
      return future(by, m, d);
    }
  }
  if ((r = n.match(new RegExp(`\\b(\\d{1,2}) de (${MONTH_WORDS.join('|')})\\b`)))) return future(by, MONTH_WORDS.indexOf(r[2]) + 1, +r[1]);
  if ((r = n.match(/\b(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/))) {
    const diff = ((DOW_WORDS[r[1]] - parseISO(base).getDay()) + 7) % 7 || 7;   // el próximo, nunca el mismo día
    return addDays(base, diff);
  }
  if (/\bpasado manana\b/.test(n)) return addDays(base, 2);
  if (/(^|[^a-z])manana\b/.test(n) && !/\b(la|una|esta|cada) manana\b/.test(n)) return addDays(base, 1);   // «mañana», no «la mañana»
  if (/\bhoy\b/.test(n)) return base;
  if ((r = n.match(/\ben (\d{1,2}|un|una|dos|tres) (dia|dias|semana|semanas)\b/))) {
    const q = { un: 1, una: 1, dos: 2, tres: 3 }[r[1]] || +r[1];
    return addDays(base, r[2].startsWith('semana') ? q * 7 : q);
  }
  if (/\b(proxima semana|semana que viene|siguiente semana)\b/.test(n)) return addDays(base, 7);
  return '';
}

// Persona de tu lista mencionada en el texto (nombre completo, o solo el primer nombre si no se repite)
export function findPerson(text) {
  const n = ` ${norm(text).replace(/[^a-z0-9ñ ]/g, ' ')} `;
  const people = data.people.filter(p => p.name && !p.isMe);
  const full = people.filter(p => n.includes(` ${norm(p.name)} `)).sort((a, b) => b.name.length - a.name.length);
  if (full.length) return full[0];
  const first = people.filter(p => { const f = norm(p.name).split(/\s+/)[0]; return f.length > 2 && n.includes(` ${f} `); });
  const uniq = [...new Set(first.map(p => norm(p.name).split(/\s+/)[0]))];
  return first.length && uniq.length === first.length ? first[0] : null;   // si dos personas se llaman igual, no adivina
}

// Tipo de tarea según palabras clave
function guessKind(text) {
  const n = norm(text);
  if (/\b(visit|revisita)/.test(n)) return 'visita';
  if (/\b(llam|mensaj|whatsapp|escribir a|avisar)/.test(n)) return 'llamada';
  if (/\b(capacit|entrenar|ensenar)/.test(n)) return 'capacitacion';
  if (/\b(estudio|plan de estudio|estudiar)/.test(n)) return 'estudio';
  return 'otro';
}

// ───── Nombres: personas de tu lista (con sus otras formas de escribirse) y tú mismo ─────
const splitAliases = str => String(str || '').split(/[,;\n]/).map(x => x.trim()).filter(Boolean);
const PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e']);
const NOT_NAMES = new Set(['se', 'le', 'les', 'lo', 'la', 'el', 'los', 'las', 'ellos', 'ellas', 'el', 'ella', 'aunque', 'tambien', 'luego', 'ademas', 'todos', 'ambos', 'quien', 'quienes', 'hermanos', 'hermanas']);
const titleCase = str => str.split(/\s+/).map((w, i) => (i && PARTICLES.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');

// Cómo te llamas y cómo te escriben en las notas (Mi perfil, y la persona marcada como «soy yo»)
export function myNames() {
  const v = profile();
  const me = data.people.find(p => p.isMe);
  return [v.myName, ...splitAliases(v.myAliases), me?.name, ...splitAliases(me?.aliases)].filter(Boolean);
}

// Busca un nombre escrito en una nota entre tus Personas y tus propios nombres.
// Coincide el nombre completo o una de sus otras formas; o solo el primer nombre si nadie más lo tiene.
export function resolveName(raw) {
  const q = norm(raw).replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!q) return null;
  const cands = [
    ...data.people.filter(p => p.name && !p.isMe).map(p => ({ id: p.id, name: p.name, isMe: false, names: [p.name, ...splitAliases(p.aliases)] })),
    ...(myNames().length ? [{ id: data.people.find(p => p.isMe)?.id || '', name: profile().myName || myNames()[0], isMe: true, names: myNames() }] : []),
  ];
  const nn = x => norm(x).replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
  const exact = cands.find(c => c.names.some(n => nn(n) === q));
  if (exact) return exact;
  const first = q.split(' ')[0];
  if (first.length < 3) return null;
  const byFirst = cands.filter(c => c.names.some(n => nn(n).split(' ')[0] === first));
  // «antonio Rojas» → primer nombre coincide y el resto también aparece
  const words = c => new Set(c.names.flatMap(n => nn(n).split(' ')));
  const both = byFirst.filter(c => q.split(' ').every(w => words(c).has(w)));
  if (both.length === 1) return both[0];
  return q.split(' ').length === 1 && byFirst.length === 1 ? byFirst[0] : null;
}

// ───── Lectura de un acuerdo ─────
const ROLE_WORDS = /^(precursor|precursora|anciano|siervo|publicador|publicadora|hermano|hermana|estudiante|coordinador|secretario|superintendente)$/i;
const RESP_VERBS = /\b(hablaran|hablara|haran|hara|visitaran|visitara|quedo en|quedaron en|daran|dara|iran|ira|se encargaran|se encargara|llamaran|llamara|acompanaran|acompanara|revisaran|revisara|conversaran|conversara|atenderan|atendera)\b/g;
const HERMANOS = /\b(los|las) hermanos?\b|\b(los|las) hermanas\b|\bel hermano\b|\bla hermana\b/g;

// Texto normalizado que conserva las posiciones del original (una letra por letra)
const normKeep = text => [...text].map(ch => { const n = norm(ch); return n.length === 1 ? n : ch.toLowerCase(); }).join('');

// Quién es el acuerdo («Nombre: …» al inicio, o un nombre al comienzo de la línea)
function findSubject(text) {
  const colon = text.match(/^([^:]{2,45}):\s*(.+)$/);
  if (colon && colon[1].trim().split(/\s+/).length <= 5) return { raw: colon[1].trim(), body: colon[2].trim() };
  const words = text.split(/\s+/);
  for (let n = Math.min(4, words.length - 1); n >= 1; n--) {   // un nombre de tu lista al comienzo
    const hit = resolveName(words.slice(0, n).join(' '));
    if (hit && (n > 1 || hit.names.some(x => norm(x) === norm(words[0])))) return { raw: words.slice(0, n).join(' '), body: words.slice(n).join(' ') };
  }
  const caps = [];   // o palabras con mayúscula seguidas (Juan Pérez), hasta un cargo o una minúscula
  for (const w of words) {
    if (ROLE_WORDS.test(norm(w)) || !(/^[A-ZÁÉÍÓÚÑ]/.test(w) || (caps.length && PARTICLES.has(w.toLowerCase())))) break;
    caps.push(w);
  }
  while (caps.length && PARTICLES.has(caps[caps.length - 1].toLowerCase())) caps.pop();
  if (caps.length >= 2) return { raw: caps.join(' '), body: words.slice(caps.length).join(' ') };
  return { raw: '', body: text };
}

// Responsables: los nombres que van justo antes de «hablarán», «harán visita», «quedó en»…
function findResponsibles(body) {
  const nb = normKeep(body);
  const out = [];
  let m;
  RESP_VERBS.lastIndex = 0;
  while ((m = RESP_VERBS.exec(nb))) {
    let seg = body.slice(0, m.index), nseg = nb.slice(0, m.index);
    let cut = Math.max(nseg.lastIndexOf(','), nseg.lastIndexOf(';'), nseg.lastIndexOf('.'), nseg.lastIndexOf(':'));
    HERMANOS.lastIndex = 0; let h;
    while ((h = HERMANOS.exec(nseg))) cut = Math.max(cut, h.index + h[0].length - 1);
    seg = seg.slice(cut + 1).trim();
    if (!seg) continue;
    seg.split(/\s*,\s*|\s+y\s+|\s+e\s+/).map(x => x.trim()).filter(Boolean).forEach(name => {
      const words = name.split(/\s+/);
      if (words.length > 4) return;
      const hit = resolveName(name);
      const looksName = !NOT_NAMES.has(norm(words[0])) && words.every((w, i) => /^[A-ZÁÉÍÓÚÑ]/.test(w) || (i && PARTICLES.has(w.toLowerCase())));
      if (!hit && !looksName) return;
      const entry = hit ? { name: hit.name, id: hit.id, isMe: hit.isMe } : { name: titleCase(name), id: '', isMe: false };
      if (!out.some(o => norm(o.name) === norm(entry.name))) out.push(entry);
    });
  }
  return out;
}

// Título corto a partir de la acción principal (el texto completo va a las notas de la tarea)
const shorten = (str, max = 60) => { str = str.trim(); if (str.length <= max) return str; const cut = str.slice(0, max); return cut.slice(0, cut.lastIndexOf(' ') > 30 ? cut.lastIndexOf(' ') : max).trim() + '…'; };
function tailAfter(text, nt, end) {
  const rest = text.slice(end), nrest = nt.slice(end);
  const stops = [',', ';', '.', ' para ', ' en caso ', ' si hay '].map(x => nrest.indexOf(x)).filter(i => i > 0);
  return rest.slice(0, stops.length ? Math.min(...stops) : undefined).trim().replace(/^a que (puedan|pueda) /i, 'a ');
}
const ACTIONS = [
  [/\b(haran|hara|hacer|realizaran|realizara) (una |la )?visita\b|\bvisitar(an|a)?\b/, (s, t) => s ? `Visitar a ${s}` : `Hacer visita ${t}`],
  [/\bhablar(an|a)?\b|\bconversar(an|a)?\b/, (s, t) => s ? `Hablar con ${s}` : `Hablar ${t}`],
  [/\bllamar(an|a)?\b/, (s, t) => s ? `Llamar a ${s}` : `Llamar ${t}`],
  [/\bconsultar(an|a)?\b/, (s, t) => `Consultar ${t}`],
  [/\b(se )?revisar(an|a)?\b/, (s, t) => `Revisar ${t}`],
  [/\b(se )?(les |le )?animar(an|a)?\b/, (s, t) => `Animar ${t}`],
  [/\bpreparar(an|a)?\b/, (s, t) => `Preparar ${t}`],
  [/\borganizar(an|a)?\b/, (s, t) => `Organizar ${t}`],
  [/\bdar(an|a)? ayuda\b|\bayudar(la|lo|les)?\b/, (s, t) => s ? `Dar ayuda práctica a ${s}` : `Ayudar ${t}`],
];
function makeTitle(text, subject) {
  const nt = normKeep(text);
  let best = null;
  ACTIONS.forEach(([re, build]) => { const m = nt.match(re); if (m && (!best || m.index < best.m.index)) best = { m, build }; });
  let title;
  if (best) title = best.build(subject, tailAfter(text, nt, best.m.index + best.m[0].length));
  else title = text.split(/[,.;]/)[0];
  title = title.replace(/\s+/g, ' ').trim();
  if (subject && !norm(title).includes(norm(subject))) title = `${subject}: ${title.charAt(0).toLowerCase()}${title.slice(1)}`;
  title = shorten(title, 70);
  return title.charAt(0).toUpperCase() + title.slice(1);
}

// Acuerdos encontrados en una reunión: a quién atender, responsables, si te toca a ti, fecha y si ya tienen tarea
export function parseAgreements(m) {
  const lines = String(m.notes || '').split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const bulleted = lines.filter(l => BULLET.test(l));
  const source = bulleted.length ? bulleted : lines.filter(l => l.split(/\s+/).length >= 3);   // sin viñetas: cada línea con sentido
  const base = m.date || today();
  const tasks = data.tasks.filter(t => t.meetingId === m.id);
  return source.map(l => {
    const text = l.replace(BULLET, '').replace(/^acuerdo\s*:\s*/i, '').trim();
    const key = agreementKey(text);
    const subj = findSubject(text);
    const subjHit = subj.raw ? resolveName(subj.raw) : null;
    const subjectName = subjHit && !subjHit.isMe ? subjHit.name : (subj.raw ? titleCase(subj.raw) : '');
    const responsibles = findResponsibles(subj.body).filter(r => norm(r.name) !== norm(subjectName));
    const title = makeTitle(subj.body, subjectName);
    return {
      text, key, title, due: findDate(text, base), kind: guessKind(title),
      subjectName, personId: subjHit && !subjHit.isMe ? subjHit.id : '', subjectKnown: !!(subjHit && !subjHit.isMe),
      personName: subjectName,
      responsibles: responsibles.map(r => r.name),
      mine: !responsibles.length || responsibles.some(r => r.isMe),
      task: tasks.find(t => t.fromAgreement === key) || null,
    };
  }).filter(a => a.key.length > 2);
}

// ¿La tarea te toca a ti? (las tareas sin responsables, o las que no dicen nada, son tuyas)
export const isMineTask = t => t.mine !== false;
// Tareas de otros que supervisas y que llevan días sin novedades (o ya vencieron)
export const SUPERVISE_DAYS = 7;
export function toSupervise() {
  const t = today();
  return data.tasks.filter(x => !isMineTask(x) && x.status !== 'hecha').map(x => {
    const last = (x.log || []).map(l => l.d).sort().pop() || (x.createdAt ? dateOf(x.createdAt) : t);
    return { task: x, quiet: diffDays(t, last), late: !!x.due && x.due < t };
  }).filter(x => x.late || x.quiet >= SUPERVISE_DAYS).sort((a, b) => b.quiet - a.quiet);
}
