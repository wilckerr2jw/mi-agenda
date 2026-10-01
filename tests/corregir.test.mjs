import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { parseHM, hmPreview } = await import('../js/corregir.js');

test('parseHM: formatos de siempre', () => {
  assert.equal(parseHM(''), 0);
  assert.equal(parseHM('12'), 720);
  assert.equal(parseHM('12:30'), 750);
  assert.equal(parseHM('12h 30'), 750);
  assert.equal(parseHM('45 min'), 45);
  assert.equal(parseHM('12,5'), 750);     // 12 h y media
  assert.equal(parseHM('12.5'), 750);
  assert.ok(Number.isNaN(parseHM('12:75')));
  assert.ok(Number.isNaN(parseHM('abc')));
});

test('parseHM: «12.30» y «12,30» son 12 h 30 min', () => {
  assert.equal(parseHM('12.30'), 750);
  assert.equal(parseHM('12,30'), 750);
  assert.equal(parseHM('3,05'), 185);
  assert.equal(parseHM('12,75'), 765);    // 75 no es minuto válido: se lee como decimal (12,75 h)
});

test('hmPreview muestra cómo se entendió', () => {
  assert.equal(hmPreview('12,30'), '= 12 h 30 min');
  assert.equal(hmPreview('8'), '= 8 h');
  assert.equal(hmPreview('xx'), '¿?');
  assert.equal(hmPreview(''), '');
});
