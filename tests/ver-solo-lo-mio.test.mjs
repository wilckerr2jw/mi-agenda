// Pruebas de «ver solo lo mío»: apagar bloques de Congregación y filtrar la limpieza por tu grupo.
// Ejecutar: node --test tests/ver-solo-lo-mio.test.mjs
import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const M = await import('../js/model.js');
const L = await import('../js/limpieza.js');
const { data } = await import('../js/store.js');

const perfil = () => data.profile[0];
const limpia = () => {
  data.profile.length = 0; data.profile.push({ id: 'me' });
  data.groups.length = 0; data.people.length = 0; data.limpieza.length = 0;
};

// ───────────── Apagar bloques para ti ─────────────

test('de fábrica no se enseñan los bloques marcados como ocultos', () => {
  limpia();
  assert.equal(M.featureHidden('congregacion.tablero'), true, 'el tablero no viene a la vista');
  assert.equal(M.featureHidden('congregacion.asistencia'), true, 'la asistencia tampoco');
  assert.equal(M.featureVisible('congregacion.tablero'), false);
});

test('de fábrica el resto de bloques sí se ven', () => {
  limpia();
  assert.equal(M.featureHidden('congregacion.limpieza'), false);
  assert.equal(M.featureVisible('congregacion.limpieza'), M.featureOn('congregacion.limpieza'));
});

test('aunque no se vean, el permiso sigue estando: puedes encenderlos', () => {
  limpia();
  assert.equal(M.featureOn('congregacion.tablero'), true);
  perfil().hiddenFeatures = [];          // los enciendes tú
  assert.equal(M.featureVisible('congregacion.tablero'), true);
});

test('lo que apagas deja de verse, pero el permiso sigue intacto', () => {
  limpia();
  perfil().hiddenFeatures = ['congregacion.tablero'];
  assert.equal(M.featureVisible('congregacion.tablero'), false, 'no se ve');
  assert.equal(M.featureOn('congregacion.tablero'), true, 'el administrador te lo sigue permitiendo');
});

test('apagar uno no apaga los demás', () => {
  limpia();
  perfil().hiddenFeatures = ['congregacion.tablero', 'congregacion.asistencia'];
  assert.equal(M.featureVisible('congregacion.tablero'), false);
  assert.equal(M.featureVisible('congregacion.asistencia'), false);
  assert.equal(M.featureVisible('congregacion.limpieza'), true);
});

test('volver a encenderlo lo devuelve', () => {
  limpia();
  perfil().hiddenFeatures = ['congregacion.tablero'];
  assert.equal(M.featureVisible('congregacion.tablero'), false);
  perfil().hiddenFeatures = [];
  assert.equal(M.featureVisible('congregacion.tablero'), true);
});

test('una lista rara no revienta: se vuelve a los valores de fábrica', () => {
  limpia();
  perfil().hiddenFeatures = null;
  assert.equal(M.featureVisible('congregacion.limpieza'), true);
  assert.equal(M.featureVisible('congregacion.tablero'), false);
});

test('en cuanto guardas tu lista, manda la tuya y no los valores de fábrica', () => {
  limpia();
  perfil().hiddenFeatures = ['congregacion.limpieza'];   // solo escondes la limpieza
  assert.equal(M.featureVisible('congregacion.limpieza'), false);
  assert.equal(M.featureVisible('congregacion.tablero'), true, 'el tablero vuelve, porque tu lista no lo esconde');
});

// ───────────── La limpieza, solo mi grupo ─────────────

const montar = () => {
  limpia();
  [['g3', 'Grupo 3'], ['g4', 'Grupo 4'], ['g5', 'Grupo 5']].forEach(([id, name]) => data.groups.push({ id, name }));
  data.people.push({ id: 'yo', name: 'Yo', isMe: true, groupIds: ['g5'] });
  // Cinco turnos: dos son míos
  [['g3', 1], ['g4', 2], ['g5', 3], ['g3', 4], ['g5', 5]].forEach(([g, n]) =>
    data.limpieza.push({ id: `t${n}`, date: `2099-0${n}-01`, until: `2099-0${n}-07`, groupId: g, tipo: 'semanal' }));
};

test('de fábrica solo salen los turnos de tu grupo', () => {
  montar();
  assert.equal(L.soloMiGrupo(), true, 'viene encendido');
  const r = L.proximosVisibles('2099-01-01');
  assert.equal(r.lista.length, 2);
  assert.equal(r.total, 5);
  assert.equal(r.filtrando, true);
  assert.ok(r.lista.every(x => x.groupId === 'g5'));
});

test('quitando la marca salen todos', () => {
  montar();
  perfil().lpSoloMiGrupo = false;
  const r = L.proximosVisibles('2099-01-01');
  assert.equal(r.lista.length, 5);
  assert.equal(r.filtrando, false);
});

test('si no estás en ningún grupo, no se filtra nada', () => {
  montar();
  data.people[0].groupIds = [];
  const r = L.proximosVisibles('2099-01-01');
  assert.equal(r.lista.length, 5, 'sin grupo no hay nada que filtrar');
  assert.equal(r.filtrando, false);
});

test('los turnos que ya pasaron no cuentan', () => {
  montar();
  const r = L.proximosVisibles('2099-04-01');
  assert.deepEqual(r.lista.map(x => x.id), ['t5'], 'solo queda el de mayo');
  assert.equal(r.total, 2, 'de los dos que quedan por venir');
});

test('si no te toca ninguno, se dice: la lista queda vacía pero el total no', () => {
  montar();
  data.people[0].groupIds = ['g4'];     // al Grupo 4 solo le toca uno, en febrero
  const r = L.proximosVisibles('2099-03-01');
  assert.equal(r.lista.length, 0);
  assert.ok(r.total > 0, 'hay turnos, pero ninguno tuyo');
});

test('miGrupo coge el que se llama «Grupo …» si estás en varios', () => {
  montar();
  data.groups.push({ id: 'gs', name: 'Siervos ministeriales' });
  data.people[0].groupIds = ['gs', 'g5'];
  assert.equal(L.miGrupo(), 'g5');
});
