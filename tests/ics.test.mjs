import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { fold, endOf, vevent, vtimezone } = await import('../js/ics.js');
const te = new TextEncoder();

test('fold: ninguna línea pasa de 75 octetos y no corta letras ni emojis', () => {
  const line = `SUMMARY:${'Reunión de ancianos 📖✅ — ñandú '.repeat(8)}`;
  const out = fold(line).split('\r\n');
  assert.ok(out.length > 1);
  out.forEach((l, i) => {
    assert.ok(te.encode(l).length <= 75, `línea ${i} con ${te.encode(l).length} octetos`);
    if (i > 0) assert.equal(l[0], ' ');
    assert.ok(!/[\uD800-\uDBFF]$/.test(l), 'no termina en medio de un emoji');
    assert.ok(!/^ ?[\uDC00-\uDFFF]/.test(l), 'no empieza con medio emoji');
  });
  assert.equal(out.map((l, i) => (i ? l.slice(1) : l)).join(''), line);
});

test('fold: líneas cortas quedan igual', () => {
  assert.equal(fold('SUMMARY:Hola'), 'SUMMARY:Hola');
  const exact = 'X'.repeat(75);
  assert.equal(fold(exact), exact);
});

test('DTEND: una hora después; pasa al día siguiente si cruza la medianoche', () => {
  assert.deepEqual(endOf('2026-10-01', '19:00', ''), { date: '2026-10-01', time: '20:00' });
  assert.deepEqual(endOf('2026-10-01', '23:30', ''), { date: '2026-10-02', time: '00:30' });
  assert.deepEqual(endOf('2026-10-01', '19:00', '21:15'), { date: '2026-10-01', time: '21:15' });
  assert.deepEqual(endOf('2026-12-31', '22:00', '01:00'), { date: '2027-01-01', time: '01:00' });
});

test('vevent: hora de Caracas con TZID y fin al día siguiente', () => {
  const ics = vevent({ uid: 'e1', date: '2026-10-01', time: '23:00', endTime: '00:30', title: 'Vigilia' }, 'America/Caracas');
  assert.match(ics, /DTSTART;TZID=America\/Caracas:20261001T230000/);
  assert.match(ics, /DTEND;TZID=America\/Caracas:20261002T003000/);
  const allDay = vevent({ uid: 'e2', date: '2026-10-01', title: 'Asamblea' });
  assert.match(allDay, /DTEND;VALUE=DATE:20261002/);
});

test('VTIMEZONE de Caracas: UTC−4 fijo', () => {
  const b = vtimezone('America/Caracas').join('\n');
  assert.match(b, /TZID:America\/Caracas/);
  assert.match(b, /TZOFFSETFROM:-0400/);
  assert.match(b, /TZOFFSETTO:-0400/);
});
