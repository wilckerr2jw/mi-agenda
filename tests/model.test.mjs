import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const M = await import('../js/model.js');

test('mensual: el 31 pasa por el 28 de febrero y vuelve al 31', () => {
  let t = { id: 't1', title: 'Informe', repeat: 'mensual', due: '2027-01-31' };
  const seen = [];
  for (let i = 0; i < 3; i++) { t = M.repeatNext(t, `t${i + 2}`); seen.push(t.due); }
  assert.deepEqual(seen, ['2027-02-28', '2027-03-31', '2027-04-30']);
  assert.equal(t.repeatDay, 31);
  assert.equal(M.repeatLabel(t.repeat, t.due, t), 'Cada mes, el día 31');
});

test('mensual: si cambias la fecha a mano, manda la fecha nueva', () => {
  const t = { id: 't1', repeat: 'mensual', due: '2027-03-15', repeatDay: 31 };
  assert.equal(M.nextDue(t.repeat, t.due, t), '2027-04-15');
});

test('mensual-semana: el último jueves sigue siendo el último', () => {
  // 29 de octubre de 2026 es el 5.º (y último) jueves
  let t = { id: 'a', repeat: 'mensual-semana', due: '2026-10-29' };
  const seen = [];
  for (let i = 0; i < 4; i++) { t = M.repeatNext(t, `b${i}`); seen.push(t.due); }
  // nov: 26 (4.º y último), dic: 31 (5.º), ene 2027: 28, feb 2027: 25
  assert.deepEqual(seen, ['2026-11-26', '2026-12-31', '2027-01-28', '2027-02-25']);
  assert.equal(t.repeatNth, 'last');
  assert.match(M.repeatLabel(t.repeat, t.due, t), /último jueves/);
});

test('mensual-semana: el 2.º martes sigue siendo el 2.º', () => {
  assert.equal(M.nextDue('mensual-semana', '2026-10-13'), '2026-11-10');
});

test('cursos bíblicos: cada estudiante una vez en el mes y los registros viejos (número) siguen contando', () => {
  const entries = [
    { id: 'e1', date: '2026-09-02', studyNames: ['Ana Prueba'] },
    { id: 'e2', date: '2026-09-09', studyNames: ['ana prueba', 'Luis Ejemplo'] },
    { id: 'e3', date: '2026-09-15', studies: 2 },                        // registro viejo, sin nombres
    { id: 'e4', date: '2026-09-20', studyNames: [], studies: 1, adj: true }, // ajuste de «Corregir un mes»
    { id: 'e5', date: '2026-09-21', studyNames: [], studies: 5 },         // con lista (vacía): el número ya no cuenta
  ];
  assert.equal(M.studiesCount(entries), 2 + 2 + 1);
  assert.equal(M.studiesIn(entries[2]), 2);
  assert.equal(M.studiesIn(entries[4]), 0);
});

test('safeColor: solo colores #hex o var(--…)', () => {
  assert.equal(M.safeColor('#8FD3E8'), '#8FD3E8');
  assert.equal(M.safeColor('var(--c-mtg)'), 'var(--c-mtg)');
  assert.equal(M.safeColor('red;background:url(x)', '#000'), '#000');
  assert.equal(M.safeColor('"><script>', '#000'), '#000');
  assert.equal(M.safeColor('var(--x);color:red', '#000'), '#000');
  assert.equal(M.safeColor(null, '#111'), '#111');
  assert.equal(M.eventColor({ color: 'javascript:alert(1)', category: 'personal' }), M.safeColor(M.catOf('personal').c));
});

test('buscar: no muestra lo de secciones ocultas', async () => {
  const { data } = await import('../js/store.js');
  data.people.push({ id: 'pz', name: 'Zacarías Buscado' });
  data.notes.push({ id: 'nz', title: 'Zacarías nota' });
  assert.equal(M.globalSearch('zacarias').people.length, 1);
  data.profile.push({ id: 'me', hiddenModules: ['personas'] });
  try {
    const r = M.globalSearch('zacarias');
    assert.equal(r.people.length, 0);
    assert.equal(r.notes.length, 1);
  } finally {
    data.profile.pop(); data.people.pop(); data.notes.pop();
  }
});
