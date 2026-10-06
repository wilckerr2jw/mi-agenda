import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { marcar } = await import('../js/util.js');

test('marca lo buscado sin importar los acentos', () => {
  assert.equal(marcar('Canción nueva', 'cancion'), '<mark>Canción</mark> nueva');
  // La coincidencia cae justo sobre la letra acentuada: debe marcarla con su acento
  assert.equal(marcar('Reunión', 'nio'), 'Reu<mark>nió</mark>n');
  assert.equal(marcar('Reunión', 'uni'), 'Re<mark>uni</mark>ón');
});

test('marca todas las veces que aparece, no solo la primera', () => {
  assert.equal(marcar('casa y casa', 'casa'), '<mark>casa</mark> y <mark>casa</mark>');
});

test('sin búsqueda devuelve el texto tal cual', () => {
  assert.equal(marcar('Hola', ''), 'Hola');
  assert.equal(marcar('Hola', '   '), 'Hola');
});

test('escapa el HTML del texto y de lo que coincide', () => {
  assert.equal(marcar('<b>hola</b>', 'hola'), '&lt;b&gt;<mark>hola</mark>&lt;/b&gt;');
  assert.equal(marcar('a <script> b', '<script>'), 'a <mark>&lt;script&gt;</mark> b');
});

test('no rompe con texto vacío ni sin coincidencias', () => {
  assert.equal(marcar('', 'x'), '');
  assert.equal(marcar(null, 'x'), '');
  assert.equal(marcar('nada que ver', 'zzz'), 'nada que ver');
});
