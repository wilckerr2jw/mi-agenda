// Reglas del dominio: categorías, tipos, recurrencia semanal y consultas de agenda.

import { data, session } from './store.js';
import { today, diffDays, fmtShort, fmtTime, norm, dateOf, parseISO, addDays } from './util.js';

export const APP_VERSION = '7.7';

// ───────────── Tipos de perfil (los asigna el administrador en modo nube) ─────────────
// Cada tipo decide qué categorías de evento y de Mi Informe se ofrecen. Lo ya guardado se sigue viendo igual.
export const PROFILE_TYPES = {
  publicador: { n: 'Publicador',                   hideEventCats: ['ancianos', 'pastoreo'], hideServCats: ['pastoreo'], hideModules: ['congregacion'] },
  precursor:  { n: 'Precursor',                    hideEventCats: ['ancianos', 'pastoreo'], hideServCats: ['pastoreo'], hideModules: ['congregacion'], goal: true },
  anciano:    { n: 'Anciano / Siervo ministerial', hideEventCats: [],                      hideServCats: [], hideModules: [] },
};
// Sin tipo asignado (modo local, administrador sin tipo o reglas antiguas) se ve todo.
export const profileType = () => (PROFILE_TYPES[session.type] ? session.type : 'anciano');
export const profileTypeInfo = () => PROFILE_TYPES[profileType()];

// Tipos de evento (el color identifica la categoría en el calendario)
// Qué campos del evento tienen sentido según su tipo (los tipos propios muestran todo)
export function eventFields(cat) {
  const known = cat in CATEGORIAS;
  return {
    theme: !known || ['familia', 'estudio', 'asignacion'].includes(cat),
    themeLabel: cat === 'familia' ? 'Tema para la adoración en familia' : cat === 'estudio' ? 'Qué vas a estudiar' : cat === 'asignacion' ? 'Tema o referencia' : 'Tema sugerido',
    themePh: cat === 'familia' ? 'Ej. Proverbios 3 o un video de JW Broadcasting' : cat === 'estudio' ? 'Ej. La Atalaya de esta semana' : cat === 'asignacion' ? 'Ej. «Cómo mantener el gozo» (w24.05)' : 'Opcional',
    companion: !known || ['predicacion', 'pastoreo', 'asignacion', 'personal'].includes(cat),
    companionLabel: cat === 'asignacion' ? 'Ayudante' : 'Persona que me acompaña',
  };
}
export const CATEGORIAS = {
  reunion:     { n: 'Reunión de congregación', c: 'var(--c-reunion)' },
  predicacion: { n: 'Predicación',             c: 'var(--c-predicacion)' },
  pastoreo:    { n: 'Pastoreo',                c: 'var(--c-pastoreo)' },
  ancianos:    { n: 'Cuerpo de ancianos',      c: 'var(--c-ancianos)' },
  estudio:     { n: 'Estudio y preparación',   c: 'var(--c-estudio)' },
  familia:     { n: 'Adoración en familia',    c: 'var(--c-x1)' },
  personal:    { n: 'Personal',                c: 'var(--c-personal)' },
  asignacion:  { n: 'Mi asignación',           c: 'var(--c-asignacion)' },
};

// Asignaciones (evento de tipo «asignacion»: campo asg = qué parte, prep = días antes para prepararse)
export const ASG_TYPES = ['Discurso público', 'Tesoros de la Biblia', 'Busquemos perlas escondidas', 'Lectura de la Biblia', 'Seamos mejores maestros', 'Nuestra vida cristiana', 'Estudio bíblico de congregación', 'Presidente', 'Oración', 'Lector', 'Conductor de La Atalaya', 'Comité de servicio', 'Otra'];
export const PREP_DAYS = [[0, 'Sin aviso'], [1, '1 día antes'], [2, '2 días antes'], [3, '3 días antes'], [5, '5 días antes'], [7, '1 semana antes']];
export const isAssignment = e => e?.category === 'asignacion';
// Próxima fecha (desde hoy) de cada asignación dentro de «days» días
export function upcomingAssignments(from = today(), days = 60) {
  const out = [];
  data.events.filter(isAssignment).forEach(e => {
    for (let i = 0; i <= days; i++) { const iso = addDays(from, i); if (occursOn(e, iso)) { out.push({ e, date: iso, inDays: i }); break; } }
  });
  return out.sort((a, b) => (a.date + (a.e.time || '')).localeCompare(b.date + (b.e.time || '')));
}
// Las que ya entran en su tiempo de preparación (prep días antes, hasta el mismo día)
export const assignmentsToPrepare = (from = today()) => upcomingAssignments(from, 14).filter(x => x.inDays <= (Number(x.e.prep) || 0) || x.inDays === 0);

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

// ───── Tareas que se repiten ─────
export const TASK_REPEATS = { '': 'No se repite', semanal: 'Cada semana', quincenal: 'Cada 2 semanas', 'mensual-semana': 'Cada mes, misma semana y día', mensual: 'Cada mes, mismo día', anual: 'Cada año' };
const WD = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const ORD = ['1.er', '2.º', '3.er', '4.º', 'último'];
const isoOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// Texto claro de cómo se repite, según la fecha límite («Cada mes, el 2.º jueves»)
export function repeatLabel(repeat, due) {
  if (!repeat) return '';
  if (!due) return TASK_REPEATS[repeat] || '';
  const d = parseISO(due);
  if (repeat === 'semanal') return `Cada ${WD[d.getDay()]}`;
  if (repeat === 'quincenal') return `Cada 2 semanas, el ${WD[d.getDay()]}`;
  if (repeat === 'mensual-semana') return `Cada mes, el ${ORD[Math.min(4, Math.ceil(d.getDate() / 7) - 1)]} ${WD[d.getDay()]}`;
  if (repeat === 'mensual') return `Cada mes, el día ${d.getDate()}`;
  if (repeat === 'anual') return `Cada año, el ${fmtShort(due)}`;
  return '';
}
// Próxima fecha límite de una tarea que se repite
export function nextDue(repeat, due) {
  const base = due || today();
  if (repeat === 'semanal') return addDays(base, 7);
  if (repeat === 'quincenal') return addDays(base, 14);
  const d = parseISO(base);
  if (repeat === 'mensual' || repeat === 'anual') {
    const add = repeat === 'anual' ? 12 : 1; const day = d.getDate();
    const n = new Date(d.getFullYear(), d.getMonth() + add, 1);
    const last = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate();
    n.setDate(Math.min(day, last)); return isoOf(n);
  }
  if (repeat === 'mensual-semana') {
    const nth = Math.ceil(d.getDate() / 7), wd = d.getDay();
    const first = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const off = (wd - first.getDay() + 7) % 7;
    let day = 1 + off + (nth - 1) * 7;
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    while (day > last) day -= 7;   // si ese mes no tiene 5.º, el último
    first.setDate(day); return isoOf(first);
  }
  return '';
}
// Al completar una tarea que se repite, la siguiente (nueva, pendiente y con la próxima fecha)
export function repeatNext(t, newId) {
  if (!t.repeat || t.repeatDone) return null;
  const due = nextDue(t.repeat, t.due);
  if (!due) return null;
  const n = { ...t, id: newId, due, status: 'pendiente', doneAt: '', log: [], repeatDone: false, repeatFrom: t.id, fromAgreement: '' };
  delete n.createdAt; delete n.updatedAt;
  return n;
}

export const STATUS = {
  pendiente:   'Pendiente',
  seguimiento: 'En seguimiento',
  hecha:       'Hecha',
};

// Privilegios y responsabilidades que puede tener una persona (se pueden agregar otros; quedan en tu lista)
export const PRIVILEGES = [
  'Anciano', 'Siervo ministerial',
  'Coordinador del cuerpo de ancianos', 'Auxiliar del coordinador', 'Auxiliar del superintendente de servicio', 'Superintendente de asignaciones mecánicas', 'Siervo de JW Hub', 'Secretario', 'Superintendente de servicio',
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
  { id: 'congregacion', n: 'Congregación' },
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
  { id: 'assign',    n: 'Nueva asignación', ic: 'flag',     mod: 'agenda' },
  { id: 'follow',    n: 'Seguimiento',      ic: 'users',    mod: 'personas' },
];
export const DEFAULT_QUICK = ['time', 'task', 'meeting', 'note'];
// Los que se muestran: los que eligió el usuario (o los de siempre), sin los de secciones ocultas
export const quickActions = () => {
  const chosen = Array.isArray(profile().quickActions) ? profile().quickActions : DEFAULT_QUICK;
  return QUICK_ACTIONS.filter(q => chosen.includes(q.id) && (!q.mod || isModuleVisible(q.mod)));
};

// Secciones que el tipo de perfil no usa (p. ej. el organigrama solo es para ancianos y siervos)
export const moduleAllowed = id => !(profileTypeInfo().hideModules || []).includes(id);
export const isModuleVisible = id => moduleAllowed(id) && !(profile().hiddenModules || []).includes(id);
export const visibleModules = () => MODULES.filter(m => isModuleVisible(m.id));

// ───── Asignaciones por hermano: en cuántos departamentos está cada uno ─────
export function deptLoad(pid) {
  const heads = [], helps = [];
  (data.depts || []).forEach(d => { if (deptHeadIds(d).includes(pid)) heads.push(d); else if ((d.helperIds || []).includes(pid)) helps.push(d); });
  return { heads, helps, total: heads.length + helps.length };
}


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

// ───────────── Seguimiento: cursos bíblicos, revisitas y pastoreo ─────────────
// person.visits = [{ id, date, kind: 'estudio'|'revisita'|'pastoreo', lesson, note }]
// person.study  = { active, pub, lesson, every }   (every = cada cuántos días estudian)
export const VISIT_KINDS = { estudio: '📖 Curso bíblico', revisita: '🚪 Revisita', pastoreo: '🐑 Pastoreo' };
export const canShepherd = () => !profileTypeInfo().hideServCats.includes('pastoreo');
export const visitKinds = () => Object.fromEntries(Object.entries(VISIT_KINDS).filter(([k]) => k !== 'pastoreo' || canShepherd()));
export const isStudent = p => !!p && (p.study ? !!p.study.active : /estudiante/i.test(p.role || ''));
export const isInterested = p => !!p && !isStudent(p) && (/interesad/i.test(p.role || '') || (p.visits || []).some(v => v.kind === 'revisita'));
export const isShepherdable = p => !!p && !p.isMe && !isStudent(p) && !/interesad|estudiante|familiar/i.test(p.role || '');
export const visitsOf = (p, kind) => (p.visits || []).filter(v => !kind || v.kind === kind).sort((a, b) => b.date.localeCompare(a.date));
export const lastVisit = (p, kind) => visitsOf(p, kind)[0]?.date || '';
export const studyEvery = p => Number(p.study?.every) || 7;
export const pastoreoMonths = () => Number(profile().pastoreoMonths) || 6;
export function studyStatus(p, t = today()) {
  const last = lastVisit(p, 'estudio');
  const days = last ? diffDays(t, last) : null;
  return { last, days, late: days == null || days > studyEvery(p), next: last ? addDays(last, studyEvery(p)) : '' };
}
export function revisitStatus(p, t = today()) {
  const last = lastVisit(p, 'revisita');
  const days = last ? diffDays(t, last) : null;
  return { last, days, late: days == null || days > 14 };
}
export function pastoreoStatus(p, t = today()) {
  const last = lastVisit(p, 'pastoreo');
  const days = last ? diffDays(t, last) : null;
  return { last, days, late: days == null || days > pastoreoMonths() * 30 };
}
export const studentsLate = (t = today()) => data.people.filter(isStudent).filter(p => studyStatus(p, t).late);
// A quién pastoreo: por omisión, los de mi grupo (los grupos de Personas donde estoy yo) y los siervos ministeriales.
// Cada anciano atiende su propio grupo. profile.pastoreoScope = 'all' muestra a toda la congregación.
// Ancianos: por su relación o privilegios, o por estar en un grupo de ancianos en Personas
export const isElder = p => [...String(p.role || '').split(','), ...(p.privileges || [])].some(x => /^\s*anciano\b|coordinador del cuerpo|^\s*secretario\s*$|superintendente de (servicio|la reuni)/i.test(x))
  || (p.groupIds || []).some(id => /anciano/i.test(data.groups.find(g => g.id === id)?.name || ''));
export const helpedByName = p => personName(p.helpedById) || p.helpedByName || '';
export const elders = () => data.people.filter(p => isElder(p)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
export const isMinisterial = p => [...String(p.role || '').split(','), ...(p.privileges || [])].some(x => /^\s*siervo ministerial/i.test(x));
// Mis grupos: si estoy en un grupo para el servicio del campo («Grupo 5»), solo ese; si no, todos los míos
export function myGroupIds() {
  const me = data.people.find(p => p.isMe);
  const mine = me?.groupIds || [];
  const field = mine.filter(id => /^grupo\s*\d+/i.test(data.groups.find(g => g.id === id)?.name || ''));
  return field.length ? field : mine;
}
export function pastoreoPool() {
  const all = data.people.filter(p => isShepherdable(p) && !isElder(p));   // a los ancianos no se les cuenta en el pastoreo
  const mine = myGroupIds();
  if (profile().pastoreoScope === 'all' || !mine.length) return all;
  return all.filter(p => isMinisterial(p) || (p.groupIds || []).some(g => mine.includes(g)));
}
export const pastoreoLate = (t = today()) => (canShepherd() ? pastoreoPool().filter(p => pastoreoStatus(p, t).late) : []);

// ───────────── Congregación: organigrama de departamentos ─────────────
// depts/{id} = { name, ic, parentId, order, headIds, headNames, helperIds, helperNames, notes, info }
// (headId / headName: versión anterior con un solo responsable; se siguen leyendo)
// Lista sugerida: k = clave, p = de quién depende, info = qué atiende, old = nombres de la lista anterior
export const DEPT_SUGGESTED = [
  { k: 'cuerpo',    n: 'Cuerpo de ancianos',                              ic: 'shield',   info: 'Todos los ancianos pastorean a la congregación y deciden los grupos y sus superintendentes.' },
  { k: 'comite',    n: 'Comité de Servicio de la Congregación',           ic: 'users',    p: 'cuerpo', info: 'Coordinador, secretario y superintendente de servicio.' },
  { k: 'c-grupos',  n: 'Asignar publicadores a los grupos',               ic: 'users',    p: 'comite' },
  { k: 'c-inact',   n: 'Cursos bíblicos a inactivos',                     ic: 'book',     p: 'comite' },
  { k: 'c-novis',   n: 'Direcciones «no visitar»',                        ic: 'pin',      p: 'comite' },
  { k: 'c-prec',    n: 'Precursores regulares',                           ic: 'flag',     p: 'comite' },
  { k: 'c-resid',   n: 'Predicación en residencias de ancianos y de jubilados', ic: 'heart', p: 'comite' },
  { k: 'c-reun',    n: 'Reuniones para el servicio del campo',            ic: 'calendar', p: 'comite' },
  { k: 'c-ayuda',   n: 'Servir donde se necesita ayuda',                  ic: 'globe',    p: 'comite' },
  { k: 'c-solic',   n: 'Solicitudes, correspondencia y registros',        ic: 'letter',   p: 'comite' },
  { k: 'c-salon',   n: 'Uso del Salón del Reino para bodas y funerales',  ic: 'building', p: 'comite' },
  { k: 'circuito',  n: 'Visita del superintendente de circuito',          ic: 'car',      p: 'comite' },
  { k: 'emergencia',n: 'Preparación para desastres',                      ic: 'shield',   p: 'comite', old: ['Plan de emergencia y desastres'], info: 'Listas de contacto por grupo.' },
  { k: 'conmem',    n: 'Conmemoración',                                   ic: 'calendar', p: 'cuerpo' },
  { k: 'enlace',    n: 'Contacto con el Comité de Enlace con los Hospitales', ic: 'heart', p: 'cuerpo' },
  { k: 'visitapac', n: 'Grupo de Visita a Pacientes',                     ic: 'heart',    p: 'enlace' },
  { k: 'coord',     n: 'Coordinador del cuerpo de ancianos',              ic: 'flag',     p: 'cuerpo' },
  { k: 'aux-coord', n: 'Auxiliar del coordinador',                      ic: 'flag',     p: 'coord' },
  { k: 'mecanicas', n: 'Superintendente de asignaciones mecánicas',     ic: 'calendar', p: 'coord', info: 'Programa de acomodadores, audio y video, micrófonos y plataforma.' },
  { k: 'acom',      n: 'Acomodadores',                                    ic: 'users',    p: 'coord' },
  { k: 'discursos', n: 'Coordinador de discursos públicos',               ic: 'mic',      p: 'coord', old: ['Coordinador de discursos públicos'] },
  { k: 'av',        n: 'Coordinador de apoyo a audio y video',            ic: 'mic',      p: 'coord', old: ['Audio y video'] },
  { k: 'sonido',    n: 'Sonido',                                          ic: 'mic',      p: 'av' },
  { k: 'video',     n: 'Video y videoconferencia',                        ic: 'globe',    p: 'av' },
  { k: 'micros',    n: 'Micrófonos',                                      ic: 'mic',      p: 'av' },
  { k: 'plataforma',n: 'Plataforma',                                      ic: 'building', p: 'av' },
  { k: 'hospital',  n: 'Hospitalidad para oradores visitantes',          ic: 'heart',    p: 'discursos' },
  { k: 'presid',    n: 'Presidentes del discurso público',                ic: 'calendar', p: 'coord', info: 'Programa de presidentes.' },
  { k: 'lectores',  n: 'Lectores del Estudio de La Atalaya',              ic: 'book',     p: 'coord', info: 'Programa de lectores.' },
  { k: 'anuncios',  n: 'Anuncios a la congregación',                      ic: 'letter',   p: 'coord', info: 'Revisa y aprueba los anuncios.' },
  { k: 'auditoria', n: 'Auditoría de las cuentas',                        ic: 'clip',     p: 'coord' },
  { k: 'nobaut',    n: 'Publicadores no bautizados',                      ic: 'heart',    p: 'coord', info: 'Dos hermanos se reúnen con quienes desean ser publicadores.' },
  { k: 'bautismo',  n: 'Candidatos al bautismo',                          ic: 'heart',    p: 'coord', info: 'Ancianos que analizan las preguntas con los candidatos.' },
  { k: 'secre',     n: 'Secretario',                                      ic: 'letter',   p: 'cuerpo', info: 'Responsabilidades legales y financieras a tiempo.' },
  { k: 'aux-secre', n: 'Auxiliares del secretario',                     ic: 'letter',   p: 'secre' },
  { k: 'jwhub',     n: 'Siervo de JW y JW Hub',                         ic: 'globe',    p: 'secre' },
  { k: 'cuentas',   n: 'Siervo de cuentas',                               ic: 'clip',     p: 'secre', old: ['Cuentas'], info: 'Ayudantes de cuentas: márcalos como ayudantes.' },
  { k: 'asamblea',  n: 'Asamblea regional',                               ic: 'calendar', p: 'secre' },
  { k: 'informe',   n: 'Informe de actividad de la congregación',         ic: 'clip',     p: 'secre', old: ['Informes y registros'], info: 'Puede ayudar un siervo ministerial capacitado.' },
  { k: 'registros', n: 'Registros de los publicadores',                   ic: 'book',     p: 'secre' },
  { k: 'serv',      n: 'Superintendente de servicio',                     ic: 'globe',    p: 'cuerpo', info: 'Visita cada grupo por lo menos una vez al año.' },
  { k: 'aux-serv',  n: 'Auxiliar del superintendente de servicio',      ic: 'globe',    p: 'serv' },
  { k: 'pubs',      n: 'Siervo de publicaciones',                         ic: 'book',     p: 'serv', old: ['Literatura'] },
  { k: 'accesible', n: 'Publicaciones accesibles (sordos, ciegos, baja visión)', ic: 'heart', p: 'pubs' },
  { k: 'terr',      n: 'Siervo de territorios',                           ic: 'pin',      p: 'serv', old: ['Territorios'] },
  { k: 'campanas',  n: 'Predicación en días festivos y campañas especiales', ic: 'calendar', p: 'serv' },
  { k: 'idioma',    n: 'Grupos en otro idioma o lengua de señas',         ic: 'chat',     p: 'serv' },
  { k: 'ppub',      n: 'Predicación pública (exhibidores)',               ic: 'cart',     p: 'serv', old: ['Predicación pública'] },
  { k: 'grupos',    n: 'Grupos para el servicio del campo',               ic: 'users',    p: 'serv', old: ['Grupos de servicio'], info: 'Cada grupo: superintendente de grupo y auxiliar.' },
  { k: 'grupo1',    n: 'Grupo 1',                                         ic: 'users',    p: 'grupos', info: 'Responsables: superintendente y auxiliar. Ayudantes: los publicadores del grupo.' },
  { k: 'vym',       n: 'Superintendente de la reunión Vida y Ministerio', ic: 'school',   p: 'cuerpo' },
  { k: 'aux-vym',   n: 'Auxiliar del superintendente de la reunión Vida y Ministerio', ic: 'school', p: 'vym' },
  { k: 'consejero', n: 'Consejero auxiliar',                              ic: 'chat',     p: 'vym' },
  { k: 'sala',      n: 'Sala auxiliar',                                   ic: 'school',   p: 'vym' },
  { k: 'atalaya',   n: 'Conductor del Estudio de La Atalaya',             ic: 'book',     p: 'cuerpo', old: ['Conductor de La Atalaya'] },
  { k: 'aux-atal',  n: 'Auxiliar del conductor del Estudio de La Atalaya', ic: 'book',    p: 'atalaya' },
  { k: 'mant',      n: 'Comité de mantenimiento del Salón del Reino',     ic: 'hammer',   p: 'cuerpo', old: ['Mantenimiento del Salón del Reino'] },
  { k: 'limpieza',  n: 'Coordinador de limpieza',                         ic: 'building', p: 'mant', old: ['Limpieza'], info: 'Programa de limpieza por grupos.' },
  { k: 'seguridad', n: 'Seguridad del Salón',                             ic: 'shield',   p: 'mant' },
];
export const DEPT_ICONS = ['shield', 'flag', 'letter', 'globe', 'school', 'book', 'mic', 'clip', 'hammer', 'building', 'users', 'pin', 'cart', 'chat', 'heart', 'car', 'calendar'];
const byOrder = (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || (a.name || '').localeCompare(b.name || '', 'es');
// Árbol: raíces (sin padre o con un padre que ya no existe) y sus hijos, sin ciclos
export function deptTree() {
  const all = data.depts || [];
  const ids = new Set(all.map(d => d.id));
  const kids = id => all.filter(d => d.parentId === id && d.id !== id).sort(byOrder);
  const seen = new Set();
  const node = d => { if (seen.has(d.id)) return null; seen.add(d.id); return { d, children: kids(d.id).map(node).filter(Boolean) }; };
  return all.filter(d => !d.parentId || !ids.has(d.parentId)).sort(byOrder).map(node).filter(Boolean);
}
// Hermanos de un departamento (en el orden en que se ven) y su lista padre
export function deptSiblings(id) {
  let found = null;
  const walk = (list, parent) => list.forEach(n => { if (n.d.id === id) found = { list: list.map(x => x.d), parent }; else walk(n.children, n.d); });
  walk(deptTree(), null);
  return found || { list: [], parent: null };
}
// Los que cuelgan de un departamento (para no elegirlos como su «padre»)
export function deptDescendants(id) {
  const out = new Set(); const all = data.depts || [];
  const walk = x => all.filter(d => d.parentId === x).forEach(d => { if (!out.has(d.id)) { out.add(d.id); walk(d.id); } });
  walk(id);
  return out;
}
export const personName = id => data.people.find(p => p.id === id)?.name || '';
// Nombramientos: quiénes son ancianos, siervos ministeriales y precursores (según su relación o privilegios en Personas)
export const ROSTERS = [
  { k: 'anc',  n: 'Ancianos',             re: /^anciano|coordinador del cuerpo|^secretario$|superintendente de (servicio|la reunión)/i },
  { k: 'sm',   n: 'Siervos ministeriales', re: /^siervo ministerial/i },
  { k: 'pr',   n: 'Precursores regulares', re: /^precursor(a)? regular/i },
  { k: 'pa',   n: 'Precursores auxiliares', re: /^precursor(a)? auxiliar/i },
  { k: 'pe',   n: 'Precursores especiales', re: /^precursor(a)? especial/i },
];
export function roster(k) {
  const r = ROSTERS.find(x => x.k === k);
  return data.people.filter(p => [...String(p.role || '').split(','), ...(p.privileges || [])].some(x => r.re.test(String(x || '').trim())))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
const splitNames = t => String(t || '').split(/\s*[,;\n]\s*/).map(x => x.trim()).filter(Boolean);
// «Grupos para el servicio del campo» no es un departamento: los grupos pertenecen a la congregación y no llevan responsable
export const isGroupBox = d => !!d && (d.sk === 'grupos' || /^grupos para el servicio/i.test(d.name || ''));
const rawHeadIds = d => (Array.isArray(d?.headIds) ? d.headIds : d?.headId ? [d.headId] : []);
// El Comité de Servicio y el Cuerpo de ancianos se llenan solos con los de los otros departamentos
const findDept = (sk, re) => (data.depts || []).find(x => x.sk === sk) || (data.depts || []).find(x => re.test(x.name || ''));
const COMITE_PARTS = [['coord', /^coordinador del cuerpo/i, 'Coordinador'], ['secre', /^secretario$/i, 'Secretario'], ['serv', /^superintendente de servicio$/i, 'Sup. de servicio']];
export const isComite = d => !!d && (d.sk === 'comite' || /^comit[eé] de servicio/i.test(d.name || ''));
export const isCuerpo = d => !!d && (d.sk === 'cuerpo' || /^cuerpo de ancianos$/i.test(d.name || ''));
export const canAutoHeads = d => isComite(d) || isCuerpo(d);
export const autoHeads = d => canAutoHeads(d) && d.autoHeads !== false;
function derivedHeadIds(d) {
  const ids = [];
  const add = id => { if (id && !ids.includes(id)) ids.push(id); };
  if (isComite(d)) COMITE_PARTS.forEach(([k, re]) => rawHeadIds(findDept(k, re)).forEach(add));
  else if (isCuerpo(d)) { rawHeadIds(findDept('coord', COMITE_PARTS[0][1])).forEach(add); roster('anc').forEach(p => add(p.id)); }
  return ids;
}
export const deptHeadIds = d => { if (autoHeads(d)) { const ids = derivedHeadIds(d); if (ids.length) return ids; } return rawHeadIds(d); };
// Qué es cada uno dentro del comité o del cuerpo («Coordinador», «Secretario»…)
export function headRole(d, pid) {
  if (!autoHeads(d)) return '';
  if (isComite(d)) return COMITE_PARTS.filter(([k, re]) => rawHeadIds(findDept(k, re)).includes(pid)).map(x => x[2]).join(' y ');
  return rawHeadIds(findDept('coord', COMITE_PARTS[0][1])).includes(pid) ? 'Coordinador' : '';
}
export const deptHeadsLabeled = d => autoHeads(d) && derivedHeadIds(d).length
  ? deptHeadIds(d).map(id => { const n = personName(id), r = headRole(d, id); return n ? (r ? `${n} (${r})` : n) : ''; }).filter(Boolean)
  : deptHeads(d);
export const deptHeads = d => [...deptHeadIds(d).map(personName).filter(Boolean), ...(autoHeads(d) && derivedHeadIds(d).length ? [] : splitNames(d.headNames ?? d.headName))];
export const deptHelpers = d => [...(d.helperIds || []).map(id => { const n = personName(id); const r = d.helperRoles?.[id]; return n ? (r ? `${n} (${r})` : n) : ''; }).filter(Boolean), ...splitNames(d.helperNames)];
export const deptHead = d => deptHeads(d).join(', ');
// Historial: quién entró o salió de un departamento y desde cuándo está cada uno
// d.history = [{ d: fecha, pid, n: nombre, as: 'resp'|'ayud', op: '+'|'-' }]   d.since = { pid: fecha }
export function withHistory(prev, next, date = today()) {
  const was = { resp: new Set(deptHeadIds(prev || {})), ayud: new Set(prev?.helperIds || []) };
  const now = { resp: new Set(deptHeadIds(next)), ayud: new Set(next.helperIds || []) };
  const history = [...(prev?.history || [])];
  const since = { ...(prev?.since || {}) };
  ['resp', 'ayud'].forEach(as => {
    now[as].forEach(pid => { if (!was[as].has(pid)) { history.push({ d: date, pid, n: personName(pid), as, op: '+' }); if (!was.resp.has(pid) && !was.ayud.has(pid)) since[pid] = date; } });
    was[as].forEach(pid => { if (!now[as].has(pid)) history.push({ d: date, pid, n: personName(pid), as, op: '-' }); });
  });
  Object.keys(since).forEach(pid => { if (!now.resp.has(pid) && !now.ayud.has(pid)) delete since[pid]; });
  return { ...next, history: history.slice(-120), since };
}
export const reviewsDue = (t = today(), ahead = 3) => (data.depts || []).filter(d => d.reviewAt && d.reviewAt <= addDays(t, ahead)).sort((a, b) => a.reviewAt.localeCompare(b.reviewAt));
export const deptsOfPerson = pid => (data.depts || []).filter(d => deptHeadIds(d).includes(pid) || (d.helperIds || []).includes(pid))
  .map(d => ({ d, head: deptHeadIds(d).includes(pid) })).sort((a, b) => (b.head ? 1 : 0) - (a.head ? 1 : 0) || byOrder(a.d, b.d));

// ───────────── Resumen del año de servicio (para la gráfica) ─────────────
export function yearSummary(withCredit = false) {
  const t = today(), cur = t.slice(0, 7);
  const months = serviceYearMonths().map(mo => ({ ...mo, minutes: monthTotals(mo.id, withCredit).minutes, past: mo.id < cur, current: mo.id === cur }));
  const counted = months.filter(m => m.past || (m.current && m.minutes > 0));
  const total = months.reduce((s, m) => s + m.minutes, 0);
  const avg = counted.length ? counted.reduce((s, m) => s + m.minutes, 0) / counted.length : 0;
  const best = months.reduce((b, m) => (m.minutes > (b?.minutes || 0) ? m : b), null);
  const left = months.filter(m => m.id > cur).length + (months.some(m => m.current) ? 1 : 0);
  const curMin = months.find(m => m.current)?.minutes || 0;
  const projection = total - curMin + Math.max(curMin, avg) + avg * Math.max(0, left - 1);
  return { months, total, avg, best: best && best.minutes ? best : null, projection, counted: counted.length };
}
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

// ¿Parece un nombre? (está en tus Personas, o todas sus palabras empiezan con mayúscula: «Juan de la Cruz»)
const looksLikeName = str => { const w = String(str).trim().split(/\s+/);
  if (resolveName(str)) return true;
  return !NOT_NAMES.has(norm(w[0])) && !/\d/.test(str) && w.every((x, i) => /^[A-ZÁÉÍÓÚÑ]/.test(x) || (i && PARTICLES.has(x.toLowerCase()))); };
// Palabras que indican un tema y no una persona antes de los dos puntos («Reunión de precursores: …»)
const NOT_SUBJECT = /\b(reunion|protocolo|recordatorio|tareas?|texto|anuncio|comite|cuerpo|departamento|organigrama|nota|acuerdos?|capacitacion|asamblea|visita del|programa|limpieza|mantenimiento|informe|cuentas|territorio|grupo)\b/;
// «Enrique: hablar con…» → el nombre es quien lo hace (empieza con un verbo en infinitivo)
const STARTS_INFINITIVE = /^[a-záéíóúñ]{2,}(ar|er|ir)\b/i;   // «visitarla» (con la/lo) sí habla de la persona
// «Protocolo de la reunión: Ana, Luisa y Marta» → los nombres del final son los responsables
function tailNames(text) {
  const m = text.match(/^(.{4,}?):\s*([^:]+)$/);
  if (!m) return null;
  const names = m[2].split(/\s*,\s*|\s+y\s+|\s+e\s+/).map(x => x.trim().replace(/[.;]$/, '')).filter(Boolean);
  if (!names.length || names.length > 8 || !names.every(n => n.split(/\s+/).length <= 4 && looksLikeName(n))) return null;
  return { head: m[1].trim(), names };
}

// Quién es el acuerdo («Nombre: …» al inicio, o un nombre al comienzo de la línea)
function findSubject(text) {
  const colon = text.match(/^([^:]{2,45}):\s*(.+)$/);
  if (colon && colon[1].trim().split(/\s+/).length <= 5 && !/\d/.test(colon[1]) && !NOT_SUBJECT.test(norm(colon[1]))) return { raw: colon[1].trim(), body: colon[2].trim() };
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
  else title = text.split(/[,;]|\.(?=\s|$)/)[0];
  title = title.replace(/\s+/g, ' ').trim();
  if (subject && !norm(title).includes(norm(subject))) title = `${subject}: ${title.charAt(0).toLowerCase()}${title.slice(1)}`;
  title = shorten(title, 70);
  return title.charAt(0).toUpperCase() + title.slice(1);
}

// Acuerdos encontrados en una reunión: a quién atender, responsables, si te toca a ti, fecha y si ya tienen tarea
export function parseAgreements(m) {
  const raw = String(m.notes || '').split(/\r?\n/).filter(l => l.trim());
  const lines = raw.map(l => l.replace(/\s+/g, ' ').trim());
  // Si la nota tiene una sección «Tareas:» o «Acuerdos:», solo cuenta lo que está debajo (el resto es contexto, como el organigrama)
  const isHead = l => /^(tareas?|acuerdos?|pendientes?|por hacer|asignaciones)\b[^:]{0,30}:?\s*$/i.test(l);
  const isCaps = l => l.length > 6 && /[A-ZÁÉÍÓÚÑ]/.test(l) && l === l.toUpperCase();
  const hi = lines.map(isHead).lastIndexOf(true);
  let source;
  if (hi >= 0) {
    const after = lines.slice(hi + 1); const end = after.findIndex(l => isCaps(l) || isHead(l));
    const sec = (end >= 0 ? after.slice(0, end) : after).map((l, j) => ({ l, r: raw[hi + 1 + j] }));
    // Una línea con guion o sangría debajo de un acuerdo es un detalle de ese acuerdo (si los demás no llevan guion)
    const SUB = /^\s*[-•*·–—]\s*/;
    const isSub = x => SUB.test(x.r) || /^\s/.test(x.r);
    const hasPlain = sec.some(x => !isSub(x));
    source = [];
    sec.forEach(x => {
      if (hasPlain && isSub(x) && source.length) { const d = x.l.replace(SUB, '').trim(); if (d) source[source.length - 1].details.push(d); return; }
      const line = x.l.replace(SUB, '').trim();
      if (line.split(/\s+/).length >= 2) source.push({ line, details: [] });
    });
  } else {
    const bulleted = lines.filter(l => BULLET.test(l));
    source = (bulleted.length ? bulleted : lines.filter(l => l.split(/\s+/).length >= 3)).map(line => ({ line, details: [] }));   // sin viñetas: cada línea con sentido
  }
  const base = m.date || today();
  const tasks = data.tasks.filter(t => t.meetingId === m.id);
  return source.map(({ line: l, details }) => {
    const text = l.replace(BULLET, '').replace(/^acuerdo\s*:\s*/i, '').trim();
    const key = agreementKey(text);
    const tail = tailNames(text);
    let subj = tail ? { raw: '', body: tail.head } : findSubject(text);
    let lead = [];   // «Nombre: hacer algo» → esa persona es la responsable, no a quien se atiende
    if (subj.raw && STARTS_INFINITIVE.test(subj.body)) { const h = resolveName(subj.raw); lead = [h ? { name: h.name, id: h.id, isMe: h.isMe } : { name: titleCase(subj.raw), id: '', isMe: false }]; subj = { raw: '', body: subj.body }; }
    if (tail) lead = tail.names.map(n => { const h = resolveName(n); return h ? { name: h.name, id: h.id, isMe: h.isMe } : { name: titleCase(n), id: '', isMe: false }; });
    const subjHit = subj.raw ? resolveName(subj.raw) : null;
    const subjectName = subjHit && !subjHit.isMe ? subjHit.name : (subj.raw ? titleCase(subj.raw) : '');
    const responsibles = [...lead, ...findResponsibles(subj.body)].filter((r, i, a) => norm(r.name) !== norm(subjectName) && a.findIndex(x => norm(x.name) === norm(r.name)) === i);
    const cap = x => x.charAt(0).toUpperCase() + x.slice(1);
    const title = tail ? shorten(tail.head, 70) : lead.length ? shorten(cap(subj.body), 70) : makeTitle(subj.body, subjectName);
    return {
      text, key, title, details, due: findDate(text, base), kind: guessKind(title),
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
