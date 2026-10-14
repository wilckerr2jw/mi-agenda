// Pruebas de los dos papeles del tablero. Ejecutar: node --test tests/papeles-tablero.test.mjs
//
// Las líneas son las de las hojas de verdad (la tabla de limpieza del Salón y el S-3 de asistencia),
// tal como las deja `lector.js`: las columnas separadas por dos espacios.
import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const limp = (await import('../modulos/papeles/papel-limpieza.js')).default;
const asis = (await import('../modulos/papeles/papel-asistencia.js')).default;
const { periodoDe, fechaDeSemana } = await import('../modulos/papeles/papel-asistencia.js');

// ══════════ Limpieza del Salón ══════════

const TABLA = [
  'Limpieza del Salón del Reino',
  'Semana  Limpieza ligera  Limpieza profunda',
  '(después de cada reunión)  (una vez a la semana)',
  '28-09-2026 a 04-10-2026  -  -',
  '05-10-2026 a 11-10-2026  Grupo 3  Grupo 3',
  '12-10-2026 a 18-10-2026  Grupo 4  Grupo 4',
  '19-10-2026 a 25-10-2026  -  -',
  '26-10-2026 a 01-11-2026  Grupo 5  Grupo 5',
  '09-11-2026 a 15-11-2026  Asamblea de circuito',
  'Impreso el 14-10-2026',
];
const turnos = (l = TABLA) => limp.leer(l).registros[0]?.items || [];

test('reconoce la tabla impresa del tablero', () => {
  assert.ok(limp.reconoce(TABLA) > 0.8);
});

test('una semana con grupo da dos turnos: la ligera y la semanal', () => {
  const t = turnos().filter(x => x.date === '2026-10-05');
  assert.deepEqual(t.map(x => x.tipo).sort(), ['ligera', 'semanal']);
  assert.ok(t.every(x => x.grupoNombre === 'Grupo 3'));
});

test('guarda el rango entero de la semana', () => {
  const t = turnos().find(x => x.date === '2026-10-05');
  assert.equal(t.until, '2026-10-11');
});

test('las semanas con «-» no crean turnos', () => {
  assert.equal(turnos().some(t => t.date === '2026-09-28'), false);
  assert.equal(turnos().some(t => t.date === '2026-10-19'), false);
});

test('las tres semanas con grupo dan seis turnos', () => {
  assert.equal(turnos().length, 6, '3 semanas × (ligera + semanal)');
});

test('la semana de la asamblea no se inventa un grupo: va a «por resolver»', () => {
  const r = limp.leer(TABLA);
  assert.equal(r.registros[0].items.some(t => t.date === '2026-11-09'), false);
  assert.equal(r.dudas.length, 1);
  assert.match(r.dudas[0].texto, /Asamblea de circuito/);
});

test('si el encabezado va al revés, las columnas también', () => {
  const alReves = TABLA.map(l => l.replace('Limpieza ligera  Limpieza profunda', 'Limpieza profunda  Limpieza ligera'));
  const t = turnos(alReves).filter(x => x.date === '2026-10-05');
  assert.equal(t[0].tipo, 'semanal');
  assert.equal(t[1].tipo, 'ligera');
});

test('volver a cargar la misma tabla no duplica: el id es la fecha y el tipo', () => {
  const a = turnos().map(t => t.id);
  const b = turnos().map(t => t.id);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, a.length);
});

test('el mensaje suelto de siempre se sigue leyendo', () => {
  const msg = ['Limpieza', 'Octubre:', '8-10 grupo 3', '15-17 grupo 4'];
  assert.ok(limp.reconoce(msg) > 0, 'lo reconoce');
  assert.equal(limp.leer(msg).registros[0].items.length, 2);
});

test('no se confunde con cualquier papel que lleve fechas', () => {
  assert.equal(limp.reconoce(['Anuncios y recordatorios', 'octubre de 2026', '1. Algo que pasa']), 0);
});

test('este papel no crea tareas', () => {
  const r = limp.leer(TABLA);
  assert.deepEqual(r.tareas, []);
  assert.equal(r.registros[0].coleccion, 'limpieza');
});

// ══════════ S-3 · Asistencia ══════════

const S3 = [
  'INFORME DE ASISTENCIA A LAS REUNIONES',
  'Nombre de la congregación: CENTRO (00000)  Mes: Octubre 2026',
  'Primera semana  Segunda semana  Tercera semana  Cuarta semana  Quinta semana  Total  Promedio',
  'Reunión de entre semana  74/0  66/30  140/30  70/15',
  'Reunión del fin de semana  105/0  53/40  158/40  79/20',
  'S-3-S',
];
// Para que no dependa de lo que tengas anotado: miércoles y domingo
const ctx = { diaDe: k => (k === 'finde' ? 0 : 3) };
const reuniones = (l = S3) => asis.leer(l, ctx).registros[0]?.items || [];

test('reconoce el S-3 del tablero', () => {
  assert.ok(asis.reconoce(S3) > 0.8);
});

test('saca el mes del informe', () => {
  assert.equal(periodoDe(S3), '2026-10');
  assert.equal(asis.leer(S3, ctx).periodo, '2026-10');
});

test('«74/0» son los del Salón y los conectados', () => {
  const r = reuniones().filter(x => x.kind === 'semana');
  assert.equal(r[0].presencial, 74);
  assert.equal(r[0].online, 0);
  assert.equal(r[1].presencial, 66);
  assert.equal(r[1].online, 30);
});

test('separa entre semana del fin de semana', () => {
  assert.equal(reuniones().filter(x => x.kind === 'semana').length, 2);
  assert.equal(reuniones().filter(x => x.kind === 'finde').length, 2);
});

test('las semanas vacías no se anotan', () => {
  assert.equal(reuniones().length, 4, 'solo las dos primeras semanas tenían datos');
});

test('el Total y el Promedio no se leen como si fueran semanas', () => {
  // 140/30 y 70/15 van al final de la fila: si se colaran, saldrían 4 reuniones por tipo
  assert.equal(reuniones().filter(x => x.kind === 'semana').length, 2);
  assert.ok(!reuniones().some(x => x.presencial === 140 || x.presencial === 70));
});

test('la fecha cae en el día que sueles tener esa reunión', () => {
  const semana = reuniones().filter(x => x.kind === 'semana');
  assert.deepEqual(semana.map(x => x.date), ['2026-10-07', '2026-10-14'], 'miércoles');
  const finde = reuniones().filter(x => x.kind === 'finde');
  assert.deepEqual(finde.map(x => x.date), ['2026-10-04', '2026-10-11'], 'domingos');
});

test('fechaDeSemana: la enésima vez que cae ese día en el mes', () => {
  assert.equal(fechaDeSemana('2026-10', 1, 0), '2026-10-04', 'primer domingo');
  assert.equal(fechaDeSemana('2026-10', 4, 0), '2026-10-25', 'cuarto domingo');
  assert.equal(fechaDeSemana('2026-10', 5, 0), '', 'octubre de 2026 no tiene quinto domingo');
});

test('sinTotales: el Total y el Promedio se van porque la suma cuadra', async () => {
  const { sinTotales } = await import('../modulos/papeles/papel-asistencia.js');
  assert.deepEqual(sinTotales(['74/0', '66/30', '140/30', '70/15']), ['74/0', '66/30']);
  assert.deepEqual(sinTotales(['105/0', '53/40', '158/40', '79/20']), ['105/0', '53/40']);
});

test('sinTotales: si la suma no cuadra, no se tira nada a ciegas', () => {
  // Una fila pegada a mano, sin Total ni Promedio
  const r = asis.leer(['Mes: Octubre 2026', 'Reunión de entre semana  10/0  20/0  30/0'], ctx);
  assert.equal(r.registros[0].items.length, 3, 'las tres son semanas');
});

test('una quinta semana que no existe avisa en vez de inventar', () => {
  const quinta = S3.map(l => l.replace('Reunión de entre semana  74/0  66/30', 'Reunión de entre semana  74/0  66/30  50/0  60/0  70/0'));
  const r = asis.leer(quinta, { diaDe: () => 0 });
  assert.ok(r.dudas.length >= 1);
  assert.match(r.dudas[0].porque, /no llega a esa semana/i);
});

test('sin mes, no se guarda nada y se dice por qué', () => {
  const r = asis.leer(['INFORME DE ASISTENCIA A LAS REUNIONES', 'Reunión de entre semana  74/0'], ctx);
  assert.deepEqual(r.registros, []);
  assert.match(r.dudas[0].porque, /de qué mes/i);
});

test('volver a cargar el mismo mes no duplica', () => {
  const a = reuniones().map(x => x.id);
  assert.equal(new Set(a).size, a.length);
  assert.deepEqual(a, reuniones().map(x => x.id));
});

test('este papel no crea tareas', () => {
  const r = asis.leer(S3, ctx);
  assert.deepEqual(r.tareas, []);
  assert.equal(r.registros[0].coleccion, 'asistencia');
});
