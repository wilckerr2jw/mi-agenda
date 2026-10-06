import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const Tb = await import('../js/tablero.js');
const Lp = await import('../js/limpieza.js');
const Pg = await import('../js/programa.js');
const { data } = await import('../js/store.js');

const limpiar = () => {
  data.tablero.length = 0;
  data.limpieza.length = 0;
  data.programa.length = 0;
  data.groups.length = 0;
  data.people.length = 0;
};

// ───────────── Tablero ─────────────

test('tablero: lo que se renueva cada mes se marca cuando se pasa la fecha', () => {
  const d = { title: 'Programa de servicio', every: 1, date: '2026-08-01' };
  assert.equal(Tb.estado(d, '2026-08-20').vencido, false);
  assert.equal(Tb.estado(d, '2026-09-01').vencido, false);   // justo el día: todavía vale
  assert.equal(Tb.estado(d, '2026-09-02').vencido, true);
  assert.equal(Tb.estado(d, '2026-09-02').vence, '2026-09-01');
});

test('tablero: lo que no caduca nunca sale como vencido', () => {
  const d = { title: 'Organigrama', every: 0, date: '2020-01-01' };
  const e = Tb.estado(d, '2026-10-06');
  assert.equal(e.vencido, false);
  assert.equal(e.vence, '');
});

test('tablero: sin fecha no se inventa un vencimiento', () => {
  assert.equal(Tb.estado({ title: 'X', every: 1, date: '' }, '2026-10-06').vencido, false);
});

test('tablero: los sugeridos son los del tablero y no se duplican al cargarlos dos veces', () => {
  limpiar();
  try {
    assert.ok(Tb.SUGERIDOS.some(s => s.title === 'Limpieza del Salón del Reino'));
    Tb.cargarSugeridos();
    const n = data.tablero.length;
    assert.equal(n, Tb.SUGERIDOS.length);
    Tb.cargarSugeridos();
    assert.equal(data.tablero.length, n, 'no debe duplicarlos');
  } finally { limpiar(); }
});

// ───────────── Limpieza ─────────────

test('limpieza: los turnos se reparten en orden y vuelven a empezar', () => {
  const t = Lp.repartir({ desde: '2026-10-05', cadaDias: 7, veces: 5, grupos: ['g1', 'g2'] });
  assert.deepEqual(t.map(x => x.groupId), ['g1', 'g2', 'g1', 'g2', 'g1']);
  assert.deepEqual(t.map(x => x.date), ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02']);
});

test('limpieza: sin grupos o sin fecha no reparte nada', () => {
  assert.deepEqual(Lp.repartir({ desde: '2026-10-05', grupos: [] }), []);
  assert.deepEqual(Lp.repartir({ desde: '', grupos: ['g1'] }), []);
});

test('limpieza: una revisión vence a los meses que le toquen', () => {
  const m = { title: 'Extintores', every: 12, last: '2025-10-01' };
  assert.equal(Lp.vence(m, '2026-09-30').tarde, false);
  assert.equal(Lp.vence(m, '2026-10-02').tarde, true);
  assert.equal(Lp.vence(m, '2026-10-02').next, '2026-10-01');
});

test('limpieza: una revisión que nunca se hizo queda pendiente', () => {
  assert.equal(Lp.vence({ title: 'Botiquín', every: 6, last: '' }, '2026-10-06').tarde, true);
});

// ───────────── Programa ─────────────

test('programa: cuenta las partes sin asignar, sin contar el tema del discurso', () => {
  const s = {
    kind: 'finde',
    parts: [
      { k: 'presi', t: 'Presidencia', by: 'Juan' },
      { k: 'discurso', t: 'Discurso público', by: '' },
      { k: 'tema', t: 'Tema del discurso', by: '' },
    ],
  };
  assert.equal(Pg.huecos(s), 1);
});

test('programa: «te toca» encuentra mi parte aunque el nombre esté escrito distinto', () => {
  limpiar();
  try {
    data.people.push({ id: 'p1', name: 'Wilcker Rubio', isMe: true });
    data.programa.push({
      id: 's1', date: '2026-10-08', kind: 'semana',
      parts: [{ k: 'lectura', t: 'Lectura de la Biblia', by: 'Wilcker' }],
    });
    const mias = Pg.misPartes('2026-10-06', 21);
    assert.equal(mias.length, 1);
    assert.equal(mias[0].parte.t, 'Lectura de la Biblia');
  } finally { limpiar(); }
});

test('programa: no confunde el tema del discurso con un nombre', () => {
  limpiar();
  try {
    data.people.push({ id: 'p1', name: 'Wilcker Rubio', isMe: true });
    data.programa.push({
      id: 's1', date: '2026-10-11', kind: 'finde',
      parts: [{ k: 'tema', t: 'Tema del discurso', by: 'Wilcker y la esperanza' }],
    });
    assert.deepEqual(Pg.misPartes('2026-10-06', 21), []);
  } finally { limpiar(); }
});

test('programa: el texto para enviar trae cada parte y lo que falta', () => {
  limpiar();
  try {
    data.programa.push({
      id: 's1', date: '2026-10-08', kind: 'semana',
      parts: [
        { k: 'presi', t: 'Presidencia', by: 'Juan Pérez' },
        { k: 'lectura', t: 'Lectura de la Biblia', by: '' },
      ],
    });
    const t = Pg.texto('s1');
    assert.match(t, /Entre semana/);
    assert.match(t, /Presidencia: Juan P[eé]rez/);
    assert.match(t, /Lectura de la Biblia: —/);
    assert.match(t, /Faltan 1 por asignar/);
  } finally { limpiar(); }
});
