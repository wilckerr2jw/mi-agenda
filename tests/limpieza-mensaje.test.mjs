import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const Lp = await import('../js/limpieza.js');
const { data } = await import('../js/store.js');

// El mensaje tal como llegó por WhatsApp, sin tocarle ni una coma
const MENSAJE = `El itinerario de limpieza quedaría de la siguiente manera:

Octubre:
8-10 grupo 3
15-17 grupo 4
22 nosotros 24 general
29-31 grupo 5.

Noviembre:
5-7 grupo 6
12-14 grupo 1
Aqui esperamos por la otra fecha general.`;

const conGrupos = fn => {
  data.groups.length = 0; data.people.length = 0;
  [1, 2, 3, 4, 5, 6].forEach(n => data.groups.push({ id: `g${n}`, name: `Grupo ${n}` }));
  data.people.push({ id: 'yo', name: 'Wilcker Rubio', isMe: true, groupIds: ['g2'] });
  try { return fn(); } finally { data.groups.length = 0; data.people.length = 0; }
};

test('mensaje: los días van dentro del mes que encabeza, no son fechas sueltas', () => {
  conGrupos(() => {
    const t = Lp.leerMensaje(MENSAJE, { hoy: '2026-10-08' });
    assert.equal(t.length, 7, 'siete turnos; la línea sin número no cuenta');
    assert.equal(t[0].date, '2026-10-08');
    assert.equal(t[0].until, '2026-10-10', '«8-10» es del 8 al 10, no el 8 de octubre');
    assert.equal(t[0].groupId, 'g3');
    assert.equal(t[1].date, '2026-10-15');
    assert.equal(t[1].until, '2026-10-17');
    assert.equal(t[1].groupId, 'g4');
  });
});

test('mensaje: una línea puede traer dos turnos', () => {
  conGrupos(() => {
    const t = Lp.leerMensaje(MENSAJE, { hoy: '2026-10-08' });
    const [a, b] = t.filter(x => x.date.startsWith('2026-10-2'));
    assert.equal(a.date, '2026-10-22');
    assert.equal(a.groupId, 'g2', '«nosotros» es mi grupo');
    assert.equal(a.until, '');
    assert.equal(b.date, '2026-10-24');
    assert.equal(b.tipo, 'anual', '«general» es la limpieza a fondo');
    assert.equal(b.groupId, '', 'la general no es de un grupo');
  });
});

test('mensaje: «grupo 3» no se confunde con un día', () => {
  conGrupos(() => {
    const t = Lp.leerMensaje('Octubre:\n8-10 grupo 3', { hoy: '2026-10-01' });
    assert.equal(t.length, 1, 'el 3 de «grupo 3» no abre otro turno');
    assert.equal(t[0].groupId, 'g3');
  });
});

test('mensaje: el mes siguiente sigue en su sitio', () => {
  conGrupos(() => {
    const t = Lp.leerMensaje(MENSAJE, { hoy: '2026-10-08' });
    const nov = t.filter(x => x.date.startsWith('2026-11'));
    assert.deepEqual(nov.map(x => [x.date, x.until, x.groupId]), [
      ['2026-11-05', '2026-11-07', 'g6'],
      ['2026-11-12', '2026-11-14', 'g1'],
    ]);
  });
});

test('mensaje: de diciembre a enero se cambia de año', () => {
  conGrupos(() => {
    const t = Lp.leerMensaje('Diciembre:\n3-5 grupo 1\n\nEnero:\n7-9 grupo 2', { hoy: '2026-12-01' });
    assert.equal(t[0].date, '2026-12-03');
    assert.equal(t[1].date, '2027-01-07', 'enero es del año siguiente');
  });
});

test('mensaje: un mes que ya pasó se entiende como el del año que viene', () => {
  conGrupos(() => {
    const t = Lp.leerMensaje('Febrero:\n3-5 grupo 1', { hoy: '2026-11-20' });
    assert.equal(t[0].date, '2027-02-03');
  });
});

test('mensaje: sin mes no se inventa ninguna fecha', () => {
  conGrupos(() => {
    assert.deepEqual(Lp.leerMensaje('8-10 grupo 3\n15-17 grupo 4', { hoy: '2026-10-08' }), []);
    assert.deepEqual(Lp.leerMensaje('', { hoy: '2026-10-08' }), []);
  });
});

test('mensaje: un turno de varios días sigue saliendo mientras dura', () => {
  data.limpieza.length = 0;
  try {
    data.limpieza.push({ id: 'a', date: '2026-10-08', until: '2026-10-10', tipo: 'semanal', groupId: '' });
    assert.equal(Lp.proximos('2026-10-09').length, 1, 'el día 9 todavía toca');
    assert.equal(Lp.proximos('2026-10-11').length, 0, 'el 11 ya pasó');
    const cuando = Lp.cuandoEs(data.limpieza[0], '2026-10-09');
    assert.match(cuando, /^Del .*8 al .*10 de octubre$/, cuando);
    assert.equal((cuando.match(/octubre/g) || []).length, 1, 'el mes se dice una vez');
  } finally { data.limpieza.length = 0; }
});
