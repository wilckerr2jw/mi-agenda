// Repaso de la interfaz (v10.13): posponer deslizando y el saco «Otro» de las estadísticas.
import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const M = await import('../js/model.js');
const { data } = await import('../js/store.js');

// ───── Deslizar a la izquierda: «a mañana» ─────

test('posponer: una tarea vencida o de hoy pasa a mañana', () => {
  assert.equal(M.posponerA('2026-10-05', '2026-10-19'), '2026-10-20');   // vencida
  assert.equal(M.posponerA('2026-10-19', '2026-10-19'), '2026-10-20');   // hoy
  assert.equal(M.posponerA('', '2026-10-19'), '2026-10-20');             // sin fecha
});

test('posponer: si vencía más adelante, se le suma un día a esa fecha', () => {
  // Dos veces seguidas no la dejan siempre en mañana: avanza de verdad
  const uno = M.posponerA('2026-10-23', '2026-10-19');
  assert.equal(uno, '2026-10-24');
  assert.equal(M.posponerA(uno, '2026-10-19'), '2026-10-25');
});

test('posponer: cruza el fin de mes sin perderse', () => {
  assert.equal(M.posponerA('2026-10-31', '2026-10-19'), '2026-11-01');
});

// ───── Estadísticas: los registros sin categoría ─────

test('registros sin categoría van a un saco con nombre, no a «undefined»', () => {
  data.entries.push(
    { id: 'a', date: '2026-10-05', minutes: 60 },                     // sin categoría (registro viejo)
    { id: 'b', date: '2026-10-06', minutes: 30, category: 'campo' },
  );
  try {
    const st = M.monthStats('2026-10');
    const claves = Object.keys(st.perCat);
    assert.ok(!claves.includes('undefined'), `salió una clave «undefined»: ${claves}`);
    assert.equal(st.perCat[''], 60);
    assert.equal(st.perCat.campo, 30);
    assert.equal(M.catServicioOf('').n, 'Otro');
  } finally { data.entries.length = 0; }
});

test('las categorías de siempre siguen con su nombre', () => {
  assert.equal(M.catServicioOf('campo').n, 'Servicio del Campo');
  assert.equal(M.catServicioOf('ldc').credito, true);
});
