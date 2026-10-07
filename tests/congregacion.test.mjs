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

test('limpieza: los turnos llevan su clase (semanal, después de la reunión o a fondo)', () => {
  const t = Lp.repartir({ desde: '2026-10-05', cadaDias: 7, veces: 2, grupos: ['g1'], tipo: 'anual' });
  assert.ok(t.every(x => x.tipo === 'anual'));
  assert.equal(Lp.nombreTipo('ligera'), 'Después de la reunión');
  assert.equal(Lp.nombreTipo('anual'), 'A fondo');
  assert.equal(Lp.nombreTipo(''), 'Semanal');   // lo de antes, sin clase, es la semanal
});

test('limpieza: al leer un PDF empareja el grupo por su nombre, sin acentos ni mayúsculas', () => {
  limpiar();
  try {
    data.groups.push({ id: 'g1', name: 'Grupo 1' }, { id: 'g2', name: 'Grupo 2' });
    const linea = t => ({ segs: [{ t, x: 0, end: 100 }] });
    const r = Lp.leerTurnos([
      linea('08-10-2026   GRUPO 2'),
      linea('15/10/2026 - grupo 1'),
      linea('22-10-2026   Grupo que no existe'),
      linea('Esto no tiene fecha'),
    ]);
    assert.equal(r.length, 3, 'solo los renglones con fecha');
    assert.equal(r[0].date, '2026-10-08');
    assert.equal(r[0].groupId, 'g2');
    assert.equal(r[1].date, '2026-10-15');
    assert.equal(r[1].groupId, 'g1');
    assert.equal(r[2].groupId, '', 'si no reconoce el grupo, lo deja en blanco');
  } finally { limpiar(); }
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

// ───────────── Las hojas no deben dejar que el navegador rellene por su cuenta ─────────────
// Los campos de nombres son de OTRAS personas, no datos del que usa la app: si el navegador
// los autocompleta, aparecen hermanos que el PDF dejó en blanco.
test('congregación: las hojas llevan autocomplete="off"', async () => {
  const As = await import('../js/asistencia.js');
  const hojas = [
    ['programa', o => Pg.sheet(o)],
    ['tablero', o => Tb.sheet(o)],
    ['limpieza · turno', o => Lp.turnoSheet(o)],
    ['limpieza · repartir', o => Lp.generarSheet(o)],
    ['asistencia', o => As.sheet(o)],
  ];
  data.groups.push({ id: 'g1', name: 'Grupo 1' });   // «Repartir turnos» no se abre sin grupos
  try {
  hojas.forEach(([nombre, abrir]) => {
    let cap = null;
    abrir(o => { cap = o; });
    assert.ok(cap, `${nombre}: no abrió la hoja`);
    assert.match(cap.body, /<form[^>]*autocomplete="off"/, `${nombre}: le falta autocomplete="off"`);
  });
  } finally { data.groups.length = 0; }
});

// ───────────── A quién le toca cada parte ─────────────
// No bloquea nada: el campo sigue siendo libre. Solo decide a quién sugiere la app.
test('programa: las partes de dirigir la reunión son de ancianos', () => {
  ['Presidencia', 'Palabras de introducción (1 mins.)', 'Palabras de conclusión (3 mins.)',
    '7. Necesidades de la congregación (15 mins.)', '8. Estudio Bíblico de la Congregación (30 mins.)']
    .forEach(t => assert.equal(Pg.quienPuede({ t }), 'anciano', t));
});

test('programa: las oraciones, la lectura y los discursos son de hermanos', () => {
  ['Oración', '3. Lectura de la Biblia (4 mins.)', '7. Discurso (4 mins.)']
    .forEach(t => assert.equal(Pg.quienPuede({ t }), 'varon', t));
  // Las de Tesoros las da un anciano o un siervo ministerial
  assert.equal(Pg.quienPuede({ t: '2. Busquemos perlas escondidas (10 mins.)', sec: 'tesoros' }), 'varon');
});

test('programa: en las demostraciones también participan las hermanas', () => {
  ['4. Empiece conversaciones (3 mins.)', '5. Haga revisitas (4 mins.)', '6. Haga discípulos (5 mins.)']
    .forEach(t => assert.equal(Pg.quienPuede({ t, sec: 'maestros' }), 'todos', t));
});

test('programa: a las canciones no les toca nadie', () => {
  assert.equal(Pg.quienPuede({ t: 'Canción 33' }), '');
  assert.equal(Pg.quienPuede({ k: 'tema', t: 'Tema del discurso' }), '');
});

test('programa: un anciano cuenta como hermano aunque no lo hayan puesto en su ficha', async () => {
  const M = await import('../js/model.js');
  assert.equal(M.esVaron({ name: 'A', role: 'Anciano' }), true, 'por su relación');
  assert.equal(M.esVaron({ name: 'B', privileges: ['Siervo ministerial'] }), true, 'por su privilegio');
  assert.equal(M.esVaron({ name: 'C', sex: 'h' }), true);
  assert.equal(M.esVaron({ name: 'D', sex: 'm', role: 'Anciano' }), false, 'lo escrito en la ficha manda');
  assert.equal(M.esVaron({ name: 'E' }), false, 'sin dato no se supone nada');
  assert.equal(M.esHermana({ name: 'F', sex: 'm' }), true);
});
