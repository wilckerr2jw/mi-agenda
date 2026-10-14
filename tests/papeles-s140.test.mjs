// Pruebas del lector del S-140 (modulos/papeles/papel-s140.js). Ejecutar: node --test tests/papeles-s140.test.mjs
//
// Las líneas de abajo son EXACTAMENTE las que produce `lector.js` al abrir el S-140_S.docx de verdad
// (tests/papeles/S-140_S.docx), con los huecos [Nombre] y [FECHA] rellenados como en una hoja real.
// Las celdas van separadas por dos espacios, que es como el lector marca las columnas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import s140, { fechaDeSemana } from '../modulos/papeles/papel-s140.js';

const SEMANA = (fecha, presi) => [
  `${fecha} | LECTURA SEMANAL DE LA BIBLIA  Presidente:  ${presi}`,
  '  Consejero de la sala auxiliar:  TOMAS LEON',
  '0:00  Canción 12  Oración:  CARLOS MORA',
  '0:00  Palabras de introducción (1 min.)  ',
  'TESOROS DE LA BIBLIA  Sala auxiliar  Auditorio principal',
  '0:00  1. Confía en Jehová de todo corazón (10 mins.)  MARIO GUZMAN',
  '0:00  2. Busquemos perlas escondidas (10 mins.)  JORGE DIAZ',
  '0:00  3. Lectura de la Biblia (4 mins.)  Estudiante:  PEDRO SILVA  RAUL NAVA',
  'SEAMOS MEJORES MAESTROS  Sala auxiliar  Auditorio principal',
  '0:00  4. Empiece conversaciones (3 mins.)  Estudiante/Ayudante:  CARLA RUIZ / ELENA VEGA  ANA RODRIGUEZ / MARTA SANCHEZ',
  '0:00  5. Haga discípulos (5 mins.)  Estudiante/Ayudante:  LUCIA GIL / EVA PAZ  SOFIA DIAZ / NOA LIMA',
  'NUESTRA VIDA CRISTIANA  ',
  '0:00  Canción 45  ',
  '0:00  8. Necesidades de la congregación (15 mins.)    LUIS PEREZ',
  '0:00  10. Estudio bíblico de la congregación (30 mins.)  Conductor/Lector:  JORGE DIAZ / MARIO GUZMAN',
  '0:00  Palabras de conclusión (3 mins.)  ',
  '0:00  Canción 78  Oración:  TOMAS LEON',
];
const HOJA = ['CONGREGACION CENTRO  Programa para la reunión de entre semana',
  ...SEMANA('5-11 de octubre', 'LUIS PEREZ'),
  ...SEMANA('12-18 de octubre', 'CARLOS MORA')];

const leer = (lineas = HOJA) => s140.leer(lineas);
const semanas = (lineas = HOJA) => leer(lineas).registros[0]?.items || [];
const parte = (s, k) => s.parts.find(p => p.k === k);

// ───────────── Reconocer la hoja ─────────────

test('reconoce un S-140 con mucha confianza', () => {
  assert.ok(s140.reconoce(HOJA) > 0.8);
});

test('no confunde el S-147 con el S-140', () => {
  assert.ok(s140.reconoce(['Anuncios y recordatorios', 'octubre de 2026', '1. Algo']) < 0.3);
});

// ───────────── Las semanas ─────────────

test('saca una semana por cada bloque', () => {
  assert.equal(semanas().length, 2);
});

test('la fecha es el primer día de la semana', () => {
  assert.deepEqual(semanas().map(s => s.date), ['2026-10-05', '2026-10-12']);
});

test('entiende las fechas escritas de varias maneras', () => {
  const hoy = '2026-10-01';
  assert.equal(fechaDeSemana('5-11 de octubre', hoy), '2026-10-05');
  assert.equal(fechaDeSemana('26 de octubre–1 de noviembre', hoy), '2026-10-26');
  assert.equal(fechaDeSemana('05-10-2026', hoy), '2026-10-05');
  assert.equal(fechaDeSemana('1 de diciembre', hoy), '2026-12-01');
});

test('una fecha de un mes ya pasado se entiende como del año que viene', () => {
  assert.equal(fechaDeSemana('5-11 de enero', '2026-10-01'), '2027-01-05');
});

test('una fecha imposible no se inventa', () => {
  assert.equal(fechaDeSemana('31-37 de febrero', '2026-10-01'), '');
  assert.equal(fechaDeSemana('la semana que viene', '2026-10-01'), '');
});

test('todas las semanas son de entre semana', () => {
  assert.ok(semanas().every(s => s.kind === 'semana'));
});

// ───────────── Las partes ─────────────

test('la presidencia y las dos oraciones', () => {
  const s = semanas()[0];
  assert.equal(parte(s, 'presi').by, 'LUIS PEREZ');
  assert.equal(parte(s, 'ora1').by, 'CARLOS MORA');
  assert.equal(parte(s, 'ora2').by, 'TOMAS LEON');
});

test('el consejero de la sala auxiliar', () => {
  assert.equal(parte(semanas()[0], 'consejero').by, 'TOMAS LEON');
});

test('las partes numeradas van a su clave de siempre', () => {
  const s = semanas()[0];
  assert.equal(parte(s, 'tesoros').by, 'MARIO GUZMAN');
  assert.equal(parte(s, 'perlas').by, 'JORGE DIAZ');
  assert.equal(parte(s, 'v8').by, 'LUIS PEREZ');
});

test('el título de la parte se queda sin los minutos', () => {
  assert.equal(parte(semanas()[0], 'tesoros').t, 'Confía en Jehová de todo corazón');
  assert.equal(parte(semanas()[0], 'v8').t, 'Necesidades de la congregación');
});

test('el estudio bíblico se parte en conductor y lector', () => {
  const s = semanas()[0];
  assert.equal(parte(s, 'estudio').by, 'JORGE DIAZ');
  assert.equal(parte(s, 'lector').by, 'MARIO GUZMAN');
});

// ───────────── Sala auxiliar ─────────────

test('con dos nombres, el del auditorio principal es el que manda', () => {
  // «Estudiante: PEDRO SILVA  RAUL NAVA» → según el encabezado, el 2º es el auditorio principal
  assert.equal(parte(semanas()[0], 'lectura').by, 'RAUL NAVA');
});

test('el de la sala auxiliar no se pierde: va en su propia parte', () => {
  const aux = parte(semanas()[0], 'lectura-aux');
  assert.equal(aux.by, 'PEDRO SILVA');
  assert.match(aux.t, /sala auxiliar/);
});

test('sin sala auxiliar, el único nombre es el del auditorio', () => {
  const lineas = HOJA.map(l => l.replace('Estudiante:  PEDRO SILVA  RAUL NAVA', 'Estudiante:  RAUL NAVA'));
  const s = semanas(lineas)[0];
  assert.equal(parte(s, 'lectura').by, 'RAUL NAVA');
  assert.equal(parte(s, 'lectura-aux'), undefined);
});

test('las parejas estudiante/ayudante se conservan enteras', () => {
  assert.equal(parte(semanas()[0], 'm4').by, 'ANA RODRIGUEZ / MARTA SANCHEZ');
});

// ───────────── Lo que no se puede usar ─────────────

test('la plantilla en blanco no crea semanas vacías', () => {
  // Es el S-140_S.docx tal cual viene de la sucursal, con sus huecos
  const vacia = [
    '[FECHA] | LECTURA SEMANAL DE LA BIBLIA  Presidente:  [Nombre]',
    '0:00  1. [Título] (10 mins.)  [Nombre]',
    '0:00  Canción [Número]  Oración:  [Nombre]',
  ];
  const r = s140.leer(vacia);
  assert.deepEqual(r.registros, [], 'sin nadie asignado, no hay nada que guardar');
});

test('una semana con gente pero sin fecha entendible va a «por resolver»', () => {
  const lineas = HOJA.map(l => l.replace('5-11 de octubre |', 'la semana que viene |'));
  const r = leer(lineas);
  assert.equal(r.registros[0].items.length, 1, 'la otra semana sí se guarda');
  assert.equal(r.dudas.length, 1);
  assert.match(r.dudas[0].porque, /fecha/i);
});

test('este papel no crea tareas: llena el programa', () => {
  const r = leer();
  assert.deepEqual(r.tareas, []);
  assert.equal(r.registros[0].coleccion, 'programa');
  assert.match(r.registros[0].resumen, /semanas del programa/);
});

test('el periodo es el del mes de la primera semana', () => {
  assert.equal(leer().periodo, '2026-10');
});
