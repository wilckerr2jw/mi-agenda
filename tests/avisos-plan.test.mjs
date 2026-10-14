// Pruebas de la política de avisos (js/avisos-plan.js). Ejecutar: node --test tests/avisos-plan.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POLITICA, enSilencio, agrupar, limitar, aplicar, explicar, prioridad } from '../js/avisos-plan.js';

const it = (at, kind, body, extra = {}) => ({ at, key: `${kind}:${at}`, title: 'Mi Agenda', body, kind, eid: '', ...extra });
const hhmm = h => h * 60;

// ───────────── Horas de silencio ─────────────

test('de noche no suena nada (la ventana cruza la medianoche)', () => {
  assert.equal(enSilencio(hhmm(23)), true, '11 de la noche');
  assert.equal(enSilencio(hhmm(3)), true, '3 de la madrugada');
  assert.equal(enSilencio(hhmm(6) + 59), true, 'un minuto antes de las 7');
});

test('de día sí suena', () => {
  assert.equal(enSilencio(hhmm(7)), false, 'justo a las 7 ya se puede');
  assert.equal(enSilencio(hhmm(12)), false);
  assert.equal(enSilencio(hhmm(21) + 59), false, 'un minuto antes de las 10');
});

test('el aviso de «mañana» de las 9:30 p. m. sigue cabiendo', () => {
  assert.equal(enSilencio(21 * 60 + 30), false);
});

test('se puede apagar el silencio', () => {
  assert.equal(enSilencio(hhmm(3), { ...POLITICA, silencio: false }), false);
});

test('una ventana dentro del mismo día también funciona', () => {
  const siesta = { ...POLITICA, silencioDe: 1300, silencioA: 1500 };
  assert.equal(enSilencio(hhmm(14), siesta), true);
  assert.equal(enSilencio(hhmm(16), siesta), false);
});

// ───────────── Juntar los cercanos ─────────────

test('los dos avisos de tareas que salían con un minuto de diferencia llegan en uno solo', () => {
  const r = agrupar([it(540, 'task', '📋 Hoy vencen 3 tareas'), it(541, 'task', '⏰ 2 tareas atrasadas')]);
  assert.equal(r.length, 1);
  assert.equal(r[0].body, '📋 Hoy vencen 3 tareas\n⏰ 2 tareas atrasadas');
  assert.equal(r[0].at, 540, 'sale a la hora del primero');
  assert.equal(r[0].juntos, 2);
});

test('los que están lejos no se juntan', () => {
  const r = agrupar([it(540, 'task', 'A'), it(700, 'routine', 'B')]);
  assert.equal(r.length, 2);
});

test('el más importante del grupo manda en el tono y en el botón', () => {
  const r = agrupar([it(600, 'tomorrow', 'B'), it(610, 'soon', 'A', { eid: 'ev1' })]);
  assert.equal(r.length, 1);
  assert.equal(r[0].kind, 'soon');
  assert.equal(r[0].eid, 'ev1', 'se conserva el botón de acción del más importante');
});

test('juntar en cadena no arrastra hasta el infinito', () => {
  // 9:00, 9:40, 10:20 → el tercero está a 80 min del primero, así que abre grupo nuevo
  const r = agrupar([it(540, 'task', 'A'), it(580, 'task', 'B'), it(620, 'task', 'C')], 45);
  assert.equal(r.length, 2);
  assert.equal(r[0].juntos, 2);
  assert.equal(r[1].body, 'C');
});

test('con juntar en 0 no se toca nada', () => {
  const r = agrupar([it(540, 'task', 'A'), it(541, 'task', 'B')], 0);
  assert.equal(r.length, 2);
});

// ───────────── Tope del día ─────────────

test('por debajo del tope no se quita nada', () => {
  const l = [it(540, 'task', 'A'), it(700, 'routine', 'B')];
  assert.equal(limitar(l, 4).length, 2);
});

test('pasado el tope se quedan los más importantes', () => {
  const l = [it(500, 'tomorrow', 'mañana'), it(540, 'soon', 'evento ya'), it(600, 'routine', 'rutina'), it(660, 'meeting', 'reunión')];
  const r = limitar(l, 2);
  assert.deepEqual(r.map(x => x.kind), ['soon', 'meeting']);
});

test('lo que queda sale en orden de hora, no de importancia', () => {
  const l = [it(900, 'soon', 'tarde'), it(500, 'meeting', 'temprano'), it(700, 'tomorrow', 'x')];
  assert.deepEqual(limitar(l, 2).map(x => x.at), [500, 900]);
});

test('con tope 0 no hay tope', () => {
  const l = [it(500, 'a'), it(600, 'b'), it(700, 'c'), it(800, 'd'), it(900, 'e')];
  assert.equal(limitar(l, 0).length, 5);
});

// ───────────── Las tres reglas juntas ─────────────

test('un día cargado pasa de 10 avisos a 4', () => {
  const dia = [
    it(420, 'log', '📝 resumen'),            // 7:00
    it(530, 'soon', '⏰ En 10 min: reunión'), // 8:50
    it(540, 'task', '📋 Hoy vencen 3 tareas'), // 9:00
    it(541, 'task', '⏰ 2 tareas atrasadas'),  // 9:01
    it(600, 'meeting', '🗓 En 1 hora: ancianos'),
    it(750, 'log', '📝 Registra tu actividad'),
    it(1140, 'routine', '📖 Aún no marcaste lectura'),
    it(1260, 'streak', '🔥 Llevas 5 días'),    // 21:00
    it(1290, 'tomorrow', '🌙 Mañana: 2 eventos'), // 21:30
    it(1380, 'routine', '🌙 Último aviso'),    // 23:00 → silencio
  ];
  const r = aplicar(dia);
  assert.ok(r.length <= 4, `salieron ${r.length}`);
  assert.ok(!r.some(x => x.at >= 1320), 'nada después de las 10 de la noche');
  assert.ok(r.every((x, i, a) => i === 0 || a[i - 1].at <= x.at), 'en orden de hora');
});

test('lo urgente nunca se cae por el tope', () => {
  const dia = [
    it(500, 'tomorrow', 'a'), it(560, 'routine', 'b'), it(620, 'streak', 'c'),
    it(900, 'soon', 'EMPIEZA YA'), it(960, 'meeting', 'REUNIÓN'),
  ];
  const r = aplicar(dia, { maxDia: 2, juntar: 0 });
  assert.deepEqual(r.map(x => x.body), ['EMPIEZA YA', 'REUNIÓN']);
});

test('con las tres reglas apagadas, la lista sale tal cual', () => {
  const dia = [it(540, 'task', 'A'), it(541, 'task', 'B'), it(1380, 'routine', 'C')];
  const r = aplicar(dia, { silencio: false, juntar: 0, maxDia: 0 });
  assert.equal(r.length, 3);
});

test('una lista vacía no revienta', () => {
  assert.deepEqual(aplicar([]), []);
});

// ───────────── Cómo se le explica al usuario ─────────────

test('la frase de los ajustes se lee bien', () => {
  assert.equal(explicar(), 'Como mucho 4 avisos al día, los que caigan juntos (menos de 45 min) llegan en uno solo y nada entre 10:00 p. m. y 7:00 a. m.');
  assert.match(explicar({ maxDia: 1, silencio: false, juntar: 0 }), /^Como mucho 1 aviso al día\.$/);
});

test('la prioridad de un tipo desconocido queda en medio', () => {
  assert.equal(prioridad({ kind: 'loquesea' }), 2);
  assert.ok(prioridad({ kind: 'soon' }) > prioridad({ kind: 'tomorrow' }));
});

test('el resumen de la mañana nunca se recorta: ahí sale lo que no sonó', () => {
  const dia = [
    it(420, 'daily', '📅 tu día'),
    it(530, 'soon', 'evento'), it(600, 'meeting', 'reunión'), it(700, 'task', 'tarea'),
  ];
  const r = aplicar(dia, { maxDia: 1, juntar: 0 });
  assert.equal(r.length, 1);
  assert.equal(r[0].kind, 'daily');
});

test('al juntar el resumen con otro, manda el resumen', () => {
  const r = agrupar([it(420, 'daily', '📅 tu día'), it(440, 'routine', '📖 lectura')]);
  assert.equal(r.length, 1);
  assert.equal(r[0].kind, 'daily');
  assert.equal(r[0].de, 'daily:420');
});
