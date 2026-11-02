// Datos viejos de mentira para probar el modulo de Reuniones (ver sembrar-pruebas.html).
// Nada de esto sale de este archivo: la app real nunca lo carga.

const ag = (t, o = {}) => ({
  id: 'ag' + Math.random().toString(36).slice(2, 10),
  t, by: o.by || '', kind: o.kind || 'informar', min: o.min || 5, ref: o.ref || '',
  subs: o.subs || [], conf: !!o.conf, priv: !!o.priv, notes: o.notes || '',
});

const people = [
  { id: 'p1', name: 'José Medina', role: 'Anciano', privileges: ['Anciano', 'Coordinador del cuerpo de ancianos'], phone: '+584121112233', groupIds: ['g1'], notes: '', visits: [] },
  { id: 'p2', name: 'Carlos Pérez', role: 'Anciano', privileges: ['Anciano', 'Secretario'], phone: '+584142223344', groupIds: ['g1'], notes: '', visits: [] },
  { id: 'p3', name: 'Luis Hernández', role: 'Anciano', privileges: ['Anciano', 'Superintendente de servicio'], phone: '+584163334455', groupIds: ['g1'], notes: '', visits: [] },
  { id: 'p4', name: 'Pedro Gómez', role: 'Siervo ministerial', privileges: ['Siervo ministerial'], phone: '+584244445566', groupIds: ['g2'], notes: '', visits: [] },
  { id: 'p5', name: 'Ana Rivas', role: 'Publicadora', privileges: [], phone: '+584125556677', groupIds: [], notes: '', visits: [] },
  { id: 'p6', name: 'Familia Suárez', role: 'Interesados', privileges: [], phone: '', groupIds: [], notes: '', visits: [] },
  { id: 'pme', name: 'Wilcker Rubio', isMe: true, role: 'Anciano', privileges: ['Anciano', 'Superintendente de la reunión Vida y Ministerio'], phone: '', groupIds: ['g1'], notes: '', visits: [] },
];

const groups = [
  { id: 'g1', name: 'Cuerpo de ancianos', personIds: ['p1', 'p2', 'p3', 'pme'] },
  { id: 'g2', name: 'Siervos ministeriales', personIds: ['p4'] },
];

const profile = [{ id: 'me', myName: 'Wilcker Rubio', goalEnabled: false, congre: { name: 'Congregación Centro', num: '12345', circuito: 'VE-14' } }];

const meetings = [
  { id: 'm1', title: 'Reunión de ancianos — primer trimestre', date: '2025-03-12', time: '19:00', place: 'Salón del Reino',
    attendeeIds: ['p1', 'p2', 'p3', 'pme'], attendeeGroupIds: ['g1'], attendees: '',
    topics: 'Revisión del informe del secretario y el territorio.',
    notes: '- José: preparar el organigrama actualizado antes del 30/03/2025\n- Carlos revisará las tarjetas de publicador del grupo 3\n- Luis: hablar con la familia Suárez sobre el estudio',
    agenda: [ag('Informe del secretario', { by: 'Carlos Pérez', kind: 'informar', min: 10 }),
             ag('Organigrama de la congregación', { by: 'José Medina', kind: 'decidir', min: 30, subs: ['Auxiliar de La Atalaya', 'Conductor de estudio bíblico'] }),
             ag('Asunto del comité de servicio', { kind: 'decidir', min: 15, conf: true, priv: true, notes: 'Solo en la app' })],
    agendaMax: 60, agendaShowTimes: true, prayers: { start: 'José Medina', end: 'Luis Hernández' } },

  { id: 'm2', title: 'Reunión con el coordinador', date: '2025-06-20', time: '18:30', place: 'Casa del hermano Medina',
    attendeeIds: ['p1', 'pme'], attendeeGroupIds: [], attendees: 'Hno. visitante del circuito',
    topics: '', notes: '- Preparar el programa de limpieza del segundo semestre para el 05/07/2025\n- Pedro: revisar el equipo de sonido',
    agenda: [ag('Programa de limpieza', { by: 'Pedro Gómez', kind: 'asignar', min: 10 }),
             ag('Mantenimiento del Salón', { kind: 'informar', min: 8, ref: 'km 3/24' })],
    agendaMax: 45, agendaShowTimes: false, prayers: { start: 'José Medina', end: '' } },

  { id: 'm3', title: 'Superintendentes de grupo', date: '2025-09-04', time: '19:30', place: 'Salón del Reino',
    attendeeIds: ['p1', 'p3', 'p4', 'pme'], attendeeGroupIds: ['g1', 'g2'], attendees: '',
    topics: 'Participación en el servicio del campo.',
    notes: '- Luis: organizar las salidas de fin de semana\n- Ana apoyará con las llamadas del grupo 2',
    agenda: [ag('Seguimiento: organigrama', { by: 'José Medina', kind: 'seguimiento', min: 10 }),
             ag('Salidas al servicio', { by: 'Luis Hernández', kind: 'asignar', min: 20, subs: ['Sábado 9:00', 'Domingo 15:00'] })],
    agendaMax: 0, agendaShowTimes: true, prayers: { start: '', end: '' } },

  { id: 'm4', title: 'Comité de servicio', date: '2026-01-15', time: '19:00', place: 'Salón del Reino',
    attendeeIds: ['p1', 'p2', 'pme'], attendeeGroupIds: [], attendees: '',
    topics: '', notes: '- Carlos: entregar el informe anual antes del 20/01/2026\n- Revisar el territorio 14 antes del 15/02/2026',
    agenda: [ag('Informe anual', { by: 'Carlos Pérez', kind: 'informar', min: 15 }),
             ag('Territorios sin trabajar', { kind: 'decidir', min: 20 })],
    agendaMax: 60, agendaShowTimes: true, prayers: { start: 'Carlos Pérez', end: 'José Medina' } },

  { id: 'm5', title: 'Reunión con el siervo de territorios', date: '2026-04-22', time: '18:00', place: 'Salón del Reino',
    attendeeIds: ['p3', 'p4', 'pme'], attendeeGroupIds: [], attendees: '',
    topics: 'Mapa digital.', notes: '- Pedro: digitalizar los mapas para el 30/05/2026',
    agenda: [ag('Mapas digitales', { by: 'Pedro Gómez', kind: 'asignar', min: 25, notes: 'Usar la app del territorio' })],
    agendaMax: 45, agendaShowTimes: false, prayers: { start: '', end: '' } },

  { id: 'm6', title: 'Limpieza y mantenimiento', date: '2026-08-10', time: '17:00', place: 'Salón del Reino',
    attendeeIds: ['p4', 'pme'], attendeeGroupIds: ['g2'], attendees: 'Grupo 1 y 2',
    topics: '', notes: '- Pedro: cotizar la pintura del salón para el 01/09/2026\n- Ana: coordinar el grupo de limpieza del mes',
    agenda: [ag('Seguimiento: mapas digitales', { by: 'Pedro Gómez', kind: 'seguimiento', min: 10 }),
             ag('Pintura del salón', { kind: 'decidir', min: 20 }),
             ag('Horario de limpieza', { kind: 'asignar', min: 10, subs: ['Grupo 1 — semanas 1 y 3', 'Grupo 2 — semanas 2 y 4'] })],
    agendaMax: 45, agendaShowTimes: true, prayers: { start: 'Pedro Gómez', end: '' } },

  { id: 'm7', title: 'Reunión de ancianos — cuarto trimestre', date: '2026-11-20', time: '19:00', place: 'Salón del Reino',
    attendeeIds: ['p1', 'p2', 'p3', 'pme'], attendeeGroupIds: ['g1'], attendees: '',
    topics: '', notes: '',
    agenda: [ag('Seguimiento: pintura del salón', { by: 'Pedro Gómez', kind: 'seguimiento', min: 10 })],
    agendaMax: 60, agendaShowTimes: true, prayers: { start: '', end: '' } },
];

// La llave con la que un acuerdo encuentra su tarea: el texto normalizado (ver model.js → agreementKey)
const key = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
const acuerdo = (mid, i) => key(meetings.find(m => m.id === mid).notes.split('\n')[i].replace(/^-\s*/, ''));

const tasks = [
  { id: 't1', title: 'Preparar el organigrama actualizado', status: 'hecha', due: '2025-03-30', meetingId: 'm1', fromAgreement: acuerdo('m1', 0), kind: 'otro', personId: 'p1', responsibles: ['José Medina'], notes: '', createdAt: '2025-03-12' },
  { id: 't2', title: 'Revisar las tarjetas de publicador del grupo 3', status: 'seguimiento', due: '2025-04-15', meetingId: 'm1', fromAgreement: acuerdo('m1', 1), kind: 'otro', personId: 'p2', responsibles: ['Carlos Pérez'], notes: '', createdAt: '2025-03-12' },
  { id: 't3', title: 'Hablar con la familia Suárez sobre el estudio', status: 'pendiente', due: '2025-04-01', meetingId: 'm1', fromAgreement: acuerdo('m1', 2), kind: 'visita', personId: 'p3', responsibles: ['Luis Hernández'], notes: '', createdAt: '2025-03-12' },
  { id: 't4', title: 'Preparar el programa de limpieza del segundo semestre', status: 'hecha', due: '2025-07-05', meetingId: 'm2', fromAgreement: acuerdo('m2', 0), kind: 'otro', personId: 'p4', responsibles: ['Pedro Gómez'], notes: '', createdAt: '2025-06-20' },
  { id: 't5', title: 'Entregar el informe anual', status: 'hecha', due: '2026-01-20', meetingId: 'm4', fromAgreement: acuerdo('m4', 0), kind: 'otro', personId: 'p2', responsibles: ['Carlos Pérez'], notes: '', createdAt: '2026-01-15' },
  { id: 't6', title: 'Revisar el territorio 14', status: 'pendiente', due: '2026-02-15', meetingId: 'm4', fromAgreement: acuerdo('m4', 1), kind: 'otro', personId: '', responsibles: ['Wilcker Rubio'], notes: '', createdAt: '2026-01-15' },
  { id: 't7', title: 'Digitalizar los mapas', status: 'seguimiento', due: '2026-05-30', meetingId: 'm5', fromAgreement: acuerdo('m5', 0), kind: 'otro', personId: 'p4', responsibles: ['Pedro Gómez'], notes: '', createdAt: '2026-04-22' },
  { id: 't8', title: 'Cotizar la pintura del salón', status: 'pendiente', due: '2026-09-01', meetingId: 'm6', fromAgreement: acuerdo('m6', 0), kind: 'otro', personId: 'p4', responsibles: ['Pedro Gómez'], notes: '', createdAt: '2026-08-10' },
  { id: 't9', title: 'Coordinar el grupo de limpieza del mes', status: 'pendiente', due: '2026-08-31', meetingId: 'm6', fromAgreement: acuerdo('m6', 1), kind: 'otro', personId: 'p5', responsibles: ['Ana Rivas'], notes: '', createdAt: '2026-08-10' },
];

const notes = [
  { id: 'n1', title: 'Detalle del organigrama', body: 'Propuestas de nombres para cada asignación.', tag: 'Reuniones', meetingId: 'm1', createdAt: '2025-03-12' },
  { id: 'n2', title: 'Ideas para la pintura', body: 'Dos presupuestos: ferretería central y la del mercado.', tag: 'Salón', meetingId: 'm6', createdAt: '2026-08-10' },
];

export const SEED = {
  notes, events: [], tasks, people, groups, meetings, entries: [], profile,
  weeks: [], depts: [], mecas: [], visitas: [], asistencia: [], tablero: [], limpieza: [], programa: [],
};
