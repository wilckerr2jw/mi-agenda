// Tareas que se repiten (v10.12): marcar tarde, saltar, cuándo termina, ritmos nuevos e historial.
import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const M = await import('../js/model.js');
const { data } = await import('../js/store.js');

const limpiar = () => { data.tasks.length = 0; };

// ───── 1. Marcarla tarde no debe crear una que ya nazca vencida ─────

test('semanal marcada tarde: la próxima no nace vencida', () => {
  // Vencía el 5 de octubre y la marco hecha el 19. Un solo paso daría el 12: otra vez vencida.
  const t = { id: 't1', repeat: 'semanal', due: '2026-10-05' };
  assert.equal(M.nextDue('semanal', t.due, t), '2026-10-12');            // el paso suelto sigue igual
  const n = M.repeatNext(t, 't2', '2026-10-19');
  assert.equal(n.due, '2026-10-26');
  assert.equal(M.nextDueFuture('semanal', t.due, t, '2026-10-19').saltados, 2);
});

test('mensual atrasada dos meses: vuelve al mes que viene, el mismo día', () => {
  const t = { id: 'a', repeat: 'mensual', due: '2026-08-15' };
  const n = M.repeatNext(t, 'b', '2026-10-19');
  assert.equal(n.due, '2026-11-15');
});

test('si la marco el mismo día que vence, la próxima es la de siempre', () => {
  const t = { id: 'a', repeat: 'semanal', due: '2026-10-19' };
  assert.equal(M.repeatNext(t, 'b', '2026-10-19').due, '2026-10-26');
});

test('la que cae justo hoy también se salta: no nace una para hoy mismo', () => {
  const t = { id: 'a', repeat: 'semanal', due: '2026-10-12' };          // +7 = hoy
  assert.equal(M.repeatNext(t, 'b', '2026-10-19').due, '2026-10-26');
});

// ───── 2. Ritmos nuevos ─────

test('cada tantos días: usa el número que pusiste', () => {
  const t = { id: 'a', repeat: 'dias', repeatEvery: 10, due: '2026-10-19' };
  assert.equal(M.repeatNext(t, 'b', '2026-10-19').due, '2026-10-29');
  assert.equal(M.repeatLabel('dias', t.due, t), 'Cada 10 días');
});

test('cada tantos días: sin número, cada 10; y nunca menos de 1 ni más de 365', () => {
  assert.equal(M.nextDue('dias', '2026-10-19', {}), '2026-10-29');
  assert.equal(M.nextDue('dias', '2026-10-19', { repeatEvery: 0 }), '2026-10-29');
  assert.equal(M.nextDue('dias', '2026-10-19', { repeatEvery: 9999 }), M.nextDue('dias', '2026-10-19', { repeatEvery: 365 }));
});

test('trimestral y semestral saltan 3 y 6 meses', () => {
  assert.equal(M.nextDue('trimestral', '2026-10-19', {}), '2027-01-19');
  assert.equal(M.nextDue('semestral', '2026-10-19', {}), '2027-04-19');
  assert.equal(M.nextDue('bimestral', '2026-10-19', {}), '2026-12-19');
  assert.equal(M.repeatLabel('trimestral', '2026-10-19', {}), 'Cada 3 meses, el día 19');
});

test('trimestral desde el 31: pasa por los meses cortos y vuelve al 31', () => {
  let t = { id: 'a', repeat: 'trimestral', due: '2026-07-31' };
  const visto = [];
  for (let i = 0; i < 3; i++) { t = M.repeatNext(t, `b${i}`, '2026-01-01'); visto.push(t.due); }
  assert.deepEqual(visto, ['2026-10-31', '2027-01-31', '2027-04-30']);
  assert.equal(t.repeatDay, 31);
});

// ───── 3. Hasta cuándo se repite ─────

test('hasta una fecha: la última se crea y después ya no', () => {
  const t = { id: 'a', repeat: 'semanal', due: '2026-10-19', repeatUntil: '2026-11-02' };
  const n1 = M.repeatNext(t, 'b', '2026-10-19');
  assert.equal(n1.due, '2026-10-26');
  const n2 = M.repeatNext(n1, 'c', '2026-10-26');
  assert.equal(n2.due, '2026-11-02');                                    // justo el tope: todavía vale
  assert.equal(M.repeatNext(n2, 'd', '2026-11-02'), null);               // la siguiente se pasaría
});

test('después de tantas veces: va descontando y se para en la última', () => {
  const t = { id: 'a', repeat: 'semanal', due: '2026-10-19', repeatTimes: 3 };
  const n1 = M.repeatNext(t, 'b', '2026-10-19');
  assert.equal(n1.repeatTimes, 2);
  const n2 = M.repeatNext(n1, 'c', '2026-10-26');
  assert.equal(n2.repeatTimes, 1);
  assert.equal(M.repeatNext(n2, 'd', '2026-11-02'), null);
  assert.match(M.repeatLabel('semanal', n2.due, n2), /esta es la última/);
  assert.match(M.repeatLabel('semanal', n1.due, n1), /quedan 2/);
});

test('sin tope puesto, se repite siempre', () => {
  const t = { id: 'a', repeat: 'semanal', due: '2026-10-19', repeatUntil: '', repeatTimes: '' };
  assert.ok(M.repeatNext(t, 'b', '2026-10-19'));
  assert.equal(M.repeatEnd(t), '');
  assert.equal(M.repeatEnd({ repeatUntil: '2026-12-01' }), 'fecha');
  assert.equal(M.repeatEnd({ repeatTimes: 4 }), 'veces');
});

test('el texto dice hasta cuándo', () => {
  const t = { repeat: 'semanal', due: '2026-10-19', repeatUntil: '2026-12-01' };
  assert.match(M.repeatLabel('semanal', t.due, t), /^Cada lunes, hasta el /);
});

// ───── 4. Saltar esta vez ─────

test('saltar: la cierra como saltada, no como hecha, y deja constancia', () => {
  const t = { id: 'a', repeat: 'semanal', due: '2026-10-19', log: [] };
  const s = M.repeatSkipped(t, '2026-10-19');
  assert.equal(s.skipped, true);
  assert.equal(s.status, 'hecha');                 // para que salga de la lista de pendientes
  assert.equal(s.log.length, 1);
  assert.match(s.log[0].t, /salt/i);
  // y la siguiente nace limpia, sin la marca de saltada
  assert.equal(M.repeatNext(t, 'b', '2026-10-19').skipped, undefined);
});

// ───── 5. Historial de la cadena ─────

test('historial: cuenta las veces, a tiempo, tarde y saltadas', () => {
  limpiar();
  data.tasks.push(
    { id: '1', repeat: 'semanal', due: '2026-09-07', status: 'hecha', doneAt: '2026-09-07' },
    { id: '2', repeatFrom: '1', repeat: 'semanal', due: '2026-09-14', status: 'hecha', doneAt: '2026-09-18' },
    { id: '3', repeatFrom: '2', repeat: 'semanal', due: '2026-09-21', status: 'hecha', doneAt: '2026-09-21', skipped: true },
    { id: '4', repeatFrom: '3', repeat: 'semanal', due: '2026-09-28', status: 'hecha', doneAt: '2026-09-28' },
    { id: '5', repeatFrom: '4', repeat: 'semanal', due: '2026-10-05', status: 'pendiente' },
  );
  try {
    const h = M.repeatHistory(data.tasks[4]);
    assert.equal(h.veces, 4);
    assert.equal(h.hechas, 3);
    assert.equal(h.aTiempo, 2);
    assert.equal(h.tarde, 1);
    assert.equal(h.saltadas, 1);
    assert.equal(h.desde, '2026-09-07');
    const txt = M.repeatHistoryText(h);
    assert.match(txt, /3 veces/);
    assert.match(txt, /1 tarde/);
    assert.match(txt, /1 saltada\b/);
  } finally { limpiar(); }
});

test('historial: la primera de la cadena no tiene historia', () => {
  limpiar();
  data.tasks.push({ id: '1', repeat: 'semanal', due: '2026-10-19', status: 'pendiente' });
  try {
    assert.equal(M.repeatHistory(data.tasks[0]).veces, 0);
    assert.equal(M.repeatHistoryText(M.repeatHistory(data.tasks[0])), '');
  } finally { limpiar(); }
});

test('historial: si se borraron las viejas, no se inventa nada', () => {
  limpiar();
  data.tasks.push({ id: '9', repeatFrom: 'ya-no-existe', repeat: 'semanal', due: '2026-10-19', status: 'pendiente' });
  try { assert.equal(M.repeatHistory(data.tasks[0]).veces, 0); } finally { limpiar(); }
});

test('historial: una cadena con un círculo no deja la app colgada', () => {
  limpiar();
  data.tasks.push(
    { id: 'x', repeatFrom: 'y', repeat: 'semanal', due: '2026-10-05', status: 'hecha', doneAt: '2026-10-05' },
    { id: 'y', repeatFrom: 'x', repeat: 'semanal', due: '2026-10-12', status: 'pendiente' },
  );
  try { assert.equal(M.repeatHistory(data.tasks[1]).veces, 1); } finally { limpiar(); }
});

// ───── 6. Al desmarcarla, la siguiente sobra ─────

test('desmarcar: la siguiente que nadie tocó sobra', () => {
  limpiar();
  data.tasks.push(
    { id: 'm', repeat: 'semanal', due: '2026-10-19', status: 'hecha', repeatDone: true },
    { id: 'h', repeatFrom: 'm', repeat: 'semanal', due: '2026-10-26', status: 'pendiente', log: [] },
  );
  try { assert.equal(M.repeatChild(data.tasks[0]).id, 'h'); } finally { limpiar(); }
});

test('desmarcar: si ya trabajaste en la siguiente, se queda', () => {
  limpiar();
  data.tasks.push(
    { id: 'm', repeat: 'semanal', due: '2026-10-19', status: 'hecha', repeatDone: true },
    { id: 'h', repeatFrom: 'm', repeat: 'semanal', due: '2026-10-26', status: 'seguimiento', log: [{ d: '2026-10-20', t: 'Ya la empecé' }] },
  );
  try { assert.equal(M.repeatChild(data.tasks[0]), null); } finally { limpiar(); }
});

test('desmarcar: si la siguiente ya tuvo su propia siguiente, se queda', () => {
  limpiar();
  data.tasks.push(
    { id: 'm', repeat: 'semanal', due: '2026-10-19', status: 'hecha', repeatDone: true },
    { id: 'h', repeatFrom: 'm', repeat: 'semanal', due: '2026-10-26', status: 'pendiente', log: [], repeatDone: true },
  );
  try { assert.equal(M.repeatChild(data.tasks[0]), null); } finally { limpiar(); }
});

test('una tarea que no se repite no tiene hija que quitar', () => {
  limpiar();
  assert.equal(M.repeatChild({ id: 'z' }), null);
});
