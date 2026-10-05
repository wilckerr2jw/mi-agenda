// Permisos por cuenta: catálogo de secciones y funciones, plantillas por tipo de perfil y el cálculo de lo que ve cada uno.
// Archivo puro (sin importar nada) para poder probarlo con `node --test tests/admin.test.mjs`.
//
//  · Plantilla (config/plantillas → types[id]):
//      { n, modules:[secciones], features:[funciones], hideEventCats:[], hideServCats:[], goal:bool }
//  · Cuenta (access/{uid}): { type, allow:[ids], deny:[ids] }   (ids de sección o de función)
//  · Lo que ve la cuenta = plantilla ∪ allow − deny. Una función solo cuenta si su sección está activa.

export const TYPE_ID_RE = /^[a-z0-9_-]{1,30}$/;
export const MAX_LIST = 200;

// Secciones de la app («general» no se puede apagar: agrupa funciones que salen en todas partes)
export const SECTION_LIST = [
  { id: 'general', n: 'General', always: true },
  { id: 'agenda', n: 'Agenda' },
  { id: 'tareas', n: 'Tareas' },
  { id: 'personas', n: 'Personas' },
  { id: 'notas', n: 'Notas' },
  { id: 'informe', n: 'Informe' },
  { id: 'congregacion', n: 'Congregación' },
];
export const MODULE_IDS = SECTION_LIST.filter(s => !s.always).map(s => s.id);

// Funciones. a = acciones (data-a, o «acción:valor») que se bloquean; q = accesos rápidos; sel = otros elementos que se ocultan.
// shep = viene apagada si la plantilla oculta la categoría «pastoreo» de Mi Informe (como hacían Publicador y Precursor).
export const FEATURES = {
  general: [
    { id: 'general.dictado', n: 'Dictado por voz', d: 'Botón 🎤 Dictar en notas, tareas y reuniones', a: ['dictate'], sel: ['.mic-row'] },
    { id: 'general.buscar', n: 'Buscar en todo', d: 'Lupa para buscar en eventos, tareas, personas y notas', a: ['search'], q: ['search'] },
  ],
  agenda: [
    { id: 'agenda.compartir', n: 'Compartir eventos con otras cuentas', d: '«Compartir con» en el evento y compartir varios a la vez', a: ['ev-bulk-share', 'bulk-share-go'] },
    { id: 'agenda.gcal', n: 'Google Calendar automático', d: 'Conectar la agenda con su Google Calendar', a: ['gcal-open', 'gcal-copy', 'gcal-connect', 'gcal-sync', 'gcal-pause', 'gcal-off', 'gcal-off-go'] },
    { id: 'agenda.ics', n: 'Exportar al calendario (.ics)', d: 'Pasar la agenda al calendario del teléfono con un archivo', a: ['ics-export'] },
    { id: 'agenda.plantillas', n: 'Plantillas de semana', d: 'Guardar y aplicar semanas tipo', a: ['wk-tpl', 'wk-tpl-save', 'wk-tpl-apply', 'wk-tpl-del'] },
    { id: 'agenda.imagen', n: 'Enviar la semana como imagen', d: 'Botón «Enviar imagen» en la vista Semana', a: ['wk-share'] },
    { id: 'agenda.asignaciones', n: 'Mis asignaciones', d: 'Discursos y partes con aviso para prepararlas', a: ['new-assign'], q: ['assign'] },
  ],
  tareas: [
    { id: 'tareas.asignar', n: 'Enviar tareas a otra cuenta', d: 'Mandar una tarea a la app de su responsable para que la acepte', a: [] },
    { id: 'tareas.supervision', n: 'Supervisión', d: 'Tareas de otros sin novedades y su resumen', a: ['supervision', 'sup-task', 'sup-share'], q: ['supervise'] },
    { id: 'tareas.recordar', n: 'Recordar por WhatsApp', d: 'Mensaje a cada responsable con sus tareas pendientes', a: ['remind-tasks', 'remind-send', 'remind-copy'] },
    { id: 'tareas.sugeridas', n: 'Tareas sugeridas por departamento', d: 'Crear de una vez las tareas típicas de cada departamento', a: ['dept-suggest-tasks', 'dept-suggest-save'] },
  ],
  personas: [
    { id: 'personas.seguimiento', n: 'Seguimiento y cursos bíblicos', d: 'Lista de cursos bíblicos y revisitas por visitar', a: ['seguimiento', 'pseg:seguimiento', 'study-edit'], q: ['follow'] },
    { id: 'personas.pastoreo', n: 'Pastoreo', d: 'Visitas de pastoreo y cargar las anteriores', a: ['past-import', 'past-save'], shep: true },
  ],
  notas: [
    { id: 'notas.reuniones', n: 'Reuniones y agenda de reunión', d: 'Reuniones con puntos, acuerdos y tareas', a: ['seg:reuniones', 'new-meeting', 'quick:meeting', 'meeting-next'], q: ['meeting'] },
    { id: 'notas.junta', n: 'Modo junta', d: 'Llevar la reunión punto por punto con tiempos', a: ['junta-start'] },
    { id: 'notas.plantillas', n: 'Plantillas de reunión', d: 'Guardar y cargar el orden de una reunión', a: ['tpl-save', 'tpl-load', 'tpl-del'] },
    { id: 'notas.participacion', n: 'Participación', d: 'Quién participó en las reuniones de los últimos meses', a: ['participation'] },
    { id: 'notas.enviar', n: 'Enviar una nota a otra cuenta', d: 'Copia de la nota a la app de otra persona', a: ['send-note', 'send-note-go'] },
    { id: 'notas.keep', n: 'Importar de Google Keep', d: 'Traer notas desde Google Takeout', a: ['keep', 'keep-import'] },
  ],
  informe: [
    { id: 'informe.corregir', n: 'Corregir un mes anterior', d: 'Arreglar horas, crédito o cursos de otro mes', a: ['fix-open', 'fix-month', 'fix-entry', 'fix-add'] },
    { id: 'informe.estadisticas', n: 'Estadísticas', d: 'Gráfica del año y estadísticas del mes', a: [] },
    { id: 'informe.campos', n: 'Campos adicionales', d: 'Contar otras cosas en el informe (revistas, videos…)', a: ['info-fields', 'xf-new'] },
    { id: 'informe.meta', n: 'Meta de horas', d: 'Meta mensual y anual con el ritmo 🐢 🦉 🐇', a: [] },
    { id: 'informe.semana', n: 'Planear la semana', d: 'Plan de horas por día y objetivos de la semana', a: ['week-plan'], q: ['week'] },
    { id: 'informe.compartir', n: 'Enviar el informe', d: 'Compartir el informe del mes', a: ['share-month'] },
  ],
  congregacion: [
    { id: 'congregacion.organigrama', n: 'Organigrama', d: 'Departamentos, responsables, ayudantes y capacitaciones', a: ['dept-new', 'dept-suggest', 'org-paste', 'org-pick', 'org-sort'] },
    { id: 'congregacion.imprimir', n: 'Imprimir o compartir el organigrama', d: 'Imagen y carta de 2 hojas', a: ['org-print', 'org-share', 'org-download'] },
    { id: 'congregacion.mecanicas', n: 'Asignaciones mecánicas', d: 'Programa de audio, video, acomodadores…', a: ['meca-import', 'meca-paste', 'meca-save', 'meca-suggest', 'meca-share', 'meca-print', 'meca-remind', 'meca-remind-send', 'meca-bapt'] },
    { id: 'congregacion.visita', n: 'Visita del superintendente', d: 'Lista de lo que hay que tener listo para la visita', a: ['visita-new', 'visita-create', 'visita-open'] },
    { id: 'congregacion.comite', n: 'Panel Cuerpo de ancianos', d: 'Pendientes para la reunión de ancianos y su resumen', a: ['comite-share'] },
    { id: 'congregacion.enlace', n: 'Enlace para los ancianos', d: 'Enlace cifrado con organigrama, acuerdos y programa', a: ['sh-open', 'sh-create', 'sh-save', 'sh-rekey', 'sh-rekey-go', 'sh-off', 'sh-off-go', 'sh-copy', 'sh-send'] },
    { id: 'congregacion.nombramientos', n: 'Nombramientos y cargas', d: 'Ancianos, siervos y precursores; asignaciones por hermano', a: ['load-g'] },
  ],
};
export const FEATURE_LIST = Object.entries(FEATURES).flatMap(([s, list]) => list.map(f => ({ ...f, s })));
export const FEATURE_IDS = FEATURE_LIST.map(f => f.id);
const KNOWN = new Set([...MODULE_IDS, ...FEATURE_IDS]);

const strList = (x, max = MAX_LIST) => (Array.isArray(x) ? [...new Set(x.filter(v => typeof v === 'string' && v.length <= 60))].slice(0, max) : []);

// Plantillas por defecto: reproducen los tipos de siempre (PROFILE_TYPES): todo encendido salvo lo que el tipo ocultaba
export function defaultTemplates(types) {
  return Object.fromEntries(Object.entries(types).map(([k, t]) => [k, templateFromType(t)]));
}
export function templateFromType(t) {
  const hideM = t.hideModules || [], hideS = t.hideServCats || [];
  const modules = MODULE_IDS.filter(m => !hideM.includes(m));
  const features = FEATURE_LIST.filter(f => (f.s === 'general' || modules.includes(f.s)) && !(f.shep && hideS.includes('pastoreo'))).map(f => f.id);
  return { n: t.n, modules, features, hideEventCats: [...(t.hideEventCats || [])], hideServCats: [...hideS], goal: !!t.goal };
}

// Limpia una plantilla que viene de Firestore (nombres, ids conocidos, listas acotadas)
export function cleanTemplate(t, fallback = {}) {
  const src = t && typeof t === 'object' ? t : {};
  const pick = (k, ok) => strList(src[k] !== undefined ? src[k] : fallback[k]).filter(ok);
  return {
    n: String(src.n || fallback.n || 'Sin nombre').slice(0, 60),
    modules: pick('modules', id => MODULE_IDS.includes(id)),
    features: pick('features', id => FEATURE_IDS.includes(id)),
    hideEventCats: pick('hideEventCats', () => true),
    hideServCats: pick('hideServCats', () => true),
    goal: src.goal !== undefined ? !!src.goal : !!fallback.goal,
  };
}

// Las del documento sobre las de por defecto (las de siempre no se pueden borrar)
export function mergeTemplates(defaults, stored) {
  const out = { ...defaults };
  Object.entries(stored && typeof stored === 'object' ? stored : {}).forEach(([k, t]) => {
    if (TYPE_ID_RE.test(k)) out[k] = cleanTemplate(t, defaults[k]);
  });
  return out;
}

// Lo que realmente puede usar la cuenta. all = sin restricciones (modo local, administrador sin tipo, reglas antiguas…)
export function effectivePerms(tpl, access = {}, { all = false } = {}) {
  if (all || !tpl) {
    return { all: true, n: tpl?.n || '', modules: new Set(MODULE_IDS), features: new Set(FEATURE_IDS), hideEventCats: [], hideServCats: [], hideModules: [], goal: false };
  }
  const allow = new Set(strList(access?.allow)), deny = new Set(strList(access?.deny));
  const tm = new Set(tpl.modules || []), tf = new Set(tpl.features || []);
  const modules = new Set(MODULE_IDS.filter(m => (tm.has(m) || allow.has(m)) && !deny.has(m)));
  const features = new Set(FEATURE_LIST.filter(f => (f.s === 'general' || modules.has(f.s)) && (tf.has(f.id) || allow.has(f.id)) && !deny.has(f.id)).map(f => f.id));
  return {
    all: false, n: tpl.n || '', modules, features,
    hideEventCats: [...(tpl.hideEventCats || [])], hideServCats: [...(tpl.hideServCats || [])],
    hideModules: MODULE_IDS.filter(m => !modules.has(m)), goal: !!tpl.goal,
  };
}

// Lo que el administrador marcó para una cuenta → { allow, deny } mínimos frente a su plantilla
export function overridesFor(tpl, modules, features) {
  const want = new Set([...modules, ...features].filter(id => KNOWN.has(id)));
  const base = new Set([...(tpl?.modules || []), ...(tpl?.features || [])]);
  return {
    allow: [...want].filter(id => !base.has(id)).slice(0, MAX_LIST),
    deny: [...base].filter(id => !want.has(id)).slice(0, MAX_LIST),
  };
}

// Acción de un botón (data-a y data-v) → función que la controla (o '' si ninguna)
const ACTIONS = new Map();
const QUICKS = new Map();
FEATURE_LIST.forEach(f => { (f.a || []).forEach(a => ACTIONS.set(a, f.id)); (f.q || []).forEach(q => QUICKS.set(q, f.id)); });
export const actionFeature = (a, v = '') => ACTIONS.get(v ? `${a}:${v}` : a) || ACTIONS.get(a) || (a === 'qa' ? QUICKS.get(v) || '' : '');
export const quickFeature = id => QUICKS.get(id) || '';

// CSS que esconde los botones de las funciones apagadas
export function hiddenCss(features) {
  const off = FEATURE_LIST.filter(f => !features.has(f.id));
  const sel = off.flatMap(f => [
    ...(f.a || []).map(a => { const [x, v] = a.split(':'); return v ? `[data-a="${x}"][data-v="${v}"]` : `[data-a="${x}"]`; }),
    ...(f.q || []).map(q => `[data-a="qa"][data-v="${q}"]`),
    ...(f.sel || []),
  ]);
  return sel.length ? `${sel.join(',\n')} { display: none !important; }` : '';
}
