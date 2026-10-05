import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { remapIds, matchPeople } = await import('../js/store.js');

// Personas ficticias: las del dueño de la congregación y las de quien la recibe
const owner = [
  { id: 'o1', name: 'Andrés Prueba', accountUid: 'u2' },
  { id: 'o2', name: 'Bruno Ejemplo Pérez' },
  { id: 'o3', name: 'Carlos Ficticio' },
  { id: 'o4', name: 'Daniel Muestra', aliases: 'Dani' },
];
const mine = [
  { id: 'm1', name: 'Yo Mismo', isMe: true },
  { id: 'm2', name: 'Bruno Perez' },
  { id: 'm3', name: 'Dani' },
];

test('reconoce a quien recibe por su cuenta y al resto por el nombre (sin acentos, apellidos de más o alias)', () => {
  const map = matchPeople(owner, mine, 'u2');
  assert.deepEqual(map, { o1: 'm1', o2: 'm2', o4: 'm3' });
});

test('una ficha propia no se usa para dos personas del dueño', () => {
  const map = matchPeople([{ id: 'a', name: 'Bruno Perez' }, { id: 'b', name: 'Bruno Pérez' }], [{ id: 'x', name: 'Bruno Pérez' }]);
  assert.deepEqual(Object.values(map), ['x']);
});

test('cambia los ids en valores, listas y claves (responsables, ayudantes, funciones)', () => {
  const dept = { id: 'd1', headIds: ['o1'], helperIds: ['o2', 'o3'], helperRoles: { o2: 'Auxiliar' }, history: [{ pid: 'o2' }], name: 'o1' };
  const out = remapIds(dept, { o1: 'm1', o2: 'm2' });
  assert.deepEqual(out.headIds, ['m1']);
  assert.deepEqual(out.helperIds, ['m2', 'o3']);
  assert.deepEqual(out.helperRoles, { m2: 'Auxiliar' });
  assert.equal(out.history[0].pid, 'm2');
  assert.equal(out.id, 'd1');
});
