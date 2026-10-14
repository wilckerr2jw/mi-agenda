// Pruebas de «enlazar nombres» (js/nombres.js). Ejecutar: node --test tests/nombres.test.mjs
// La idea viene de la app de S. Servicio: que «J. Pérez» y «Jorge Pérez» sean el mismo hermano.
import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const N = await import('../js/nombres.js');

const GENTE = [
  { id: 'p1', name: 'Jorge Pérez' },
  { id: 'p2', name: 'Ana María Rodríguez' },
  { id: 'p3', name: 'Luis Rodríguez' },
  { id: 'p4', name: 'Marta Sánchez de Pérez' },
];

// ───────────── Normalizar ─────────────

test('quita tildes, puntos y mayúsculas', () => {
  assert.equal(N.normalizar('  JORGE   PÉREZ. '), 'jorge perez');
  assert.equal(N.normalizar('J. Pérez'), 'j perez');
  assert.equal(N.normalizar(''), '');
});

// ───────────── Tal cual ─────────────

test('el nombre tal cual lo tienes', () => {
  const r = N.buscar('Jorge Pérez', GENTE);
  assert.equal(r.id, 'p1');
  assert.equal(r.como, 'exacto');
});

test('da igual cómo esté escrito: mayúsculas, tildes y espacios de más', () => {
  assert.equal(N.buscar('  jorge   perez  ', GENTE).id, 'p1');
});

// ───────────── Abreviado ─────────────

test('inicial y apellido: «J. Pérez»', () => {
  const r = N.buscar('J. Pérez', GENTE);
  assert.equal(r.id, 'p1');
  assert.equal(r.como, 'parecido');
});

test('el nombre a medias: «Jorge Pé»', () => {
  assert.equal(N.buscar('Jorge Pé', GENTE).id, 'p1');
});

test('sobra o falta un nombre de en medio: «Ana Rodríguez»', () => {
  assert.equal(N.buscar('Ana Rodríguez', GENTE).id, 'p2');
});

test('solo el nombre de pila, si no hay otro igual', () => {
  assert.equal(N.buscar('Jorge', GENTE).id, 'p1');
});

// ───────────── Cuando hay duda, no adivina ─────────────

test('si encajan dos, pregunta en vez de elegir', () => {
  const gente = [...GENTE, { id: 'p5', name: 'Jorge Peralta' }];
  const r = N.buscar('J. Per', gente);
  assert.equal(r.id, '', 'no elige a ninguno');
  assert.equal(r.como, 'nada');
});

test('un apellido que comparten varios da duda, no un acierto a ciegas', () => {
  const r = N.buscar('Rodríguez', GENTE);
  assert.equal(r.id, '', 'Ana María y Luis comparten apellido: no se decide solo');
});

test('un nombre que no es de nadie no inventa', () => {
  const r = N.buscar('Pedro Gómez', GENTE);
  assert.equal(r.id, '');
  assert.equal(r.como, 'nada');
});

test('algo demasiado corto ni se intenta', () => {
  assert.equal(N.buscar('JP', GENTE).como, 'nada');
  assert.equal(N.buscar('', GENTE).como, 'nada');
});

// ───────────── Lo que ya enlazaste ─────────────

test('un nombre enlazado a mano gana a cualquier parecido', () => {
  const alias = { 'el hermano jorge': 'p1' };
  const r = N.buscar('El hermano Jorge', GENTE, alias);
  assert.equal(r.id, 'p1');
  assert.equal(r.como, 'alias');
});

test('un enlace a alguien que ya borraste no se usa', () => {
  const r = N.buscar('fulanito', GENTE, { fulanito: 'p99' });
  assert.equal(r.id, '');
});

test('el nombre tal cual manda sobre un enlace equivocado', () => {
  const r = N.buscar('Luis Rodríguez', GENTE, { 'luis rodriguez': 'p1' });
  assert.equal(r.id, 'p3', 'si coincide de verdad, se usa el de verdad');
  assert.equal(r.como, 'exacto');
});

// ───────────── Repasar una lista entera ─────────────

test('separa lo que reconoce de lo que hay que preguntar', () => {
  const { resueltos, preguntar } = N.repasar(['Jorge Pérez', 'J. Pérez', 'Pedro Gómez'], GENTE);
  assert.equal(resueltos.get('Jorge Pérez'), 'p1');
  assert.equal(resueltos.get('J. Pérez'), 'p1');
  assert.deepEqual(preguntar.map(x => x.texto), ['Pedro Gómez']);
});

test('el mismo nombre repetido se pregunta una sola vez', () => {
  const { preguntar } = N.repasar(['Pedro Gómez', 'PEDRO GOMEZ', 'pedro  gómez'], GENTE);
  assert.equal(preguntar.length, 1);
});

test('cuando hay duda, dice entre quiénes', () => {
  const gente = [...GENTE, { id: 'p5', name: 'Jorge Peralta' }];
  const { preguntar } = N.repasar(['Jorge'], gente);
  assert.equal(preguntar.length, 1);
  assert.deepEqual(preguntar[0].entre.map(x => x.id).sort(), ['p1', 'p5']);
});

test('los huecos y los espacios en blanco se ignoran', () => {
  const { resueltos, preguntar } = N.repasar(['', '   ', null, 'Jorge Pérez'], GENTE);
  assert.equal(resueltos.size, 1);
  assert.equal(preguntar.length, 0);
});
