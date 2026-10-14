// Pruebas de «el evento manda sobre el programa» (js/programa.js). Ejecutar: node --test tests/programa-choque.test.mjs
// La idea viene de la app de Conferencia: si esa semana hay asamblea, la reunión normal no va.
import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const P = await import('../js/programa.js');
const { data } = await import('../js/store.js');

const limpia = () => { data.programa.length = 0; data.events.length = 0; };
const semana = (id, date, kind = 'finde', partes = []) => data.programa.push({ id, date, kind, parts: partes });
const evento = (date, title) => data.events.push({ id: `e-${date}-${title}`, date, title, category: 'reunion' });

test('sin eventos encima, no hay ningún choque', () => {
  limpia();
  semana('s1', '2026-11-08', 'finde', [{ k: 'discurso', t: 'Discurso público', by: 'Luis' }]);
  assert.deepEqual(P.choques('2026-10-13'), []);
});

test('una asamblea esa fecha ocupa el programa', () => {
  limpia();
  semana('s1', '2026-11-08', 'finde', [{ k: 'discurso', t: 'Discurso público', by: 'Luis' }]);
  evento('2026-11-08', 'Asamblea de circuito');
  const ch = P.choques('2026-10-13');
  assert.equal(ch.length, 1);
  assert.equal(ch[0].semana.id, 's1');
  assert.equal(ch[0].evento.title, 'Asamblea de circuito');
});

test('también la cuentan un congreso y la visita del superintendente', () => {
  limpia();
  semana('s1', '2026-11-08');
  semana('s2', '2026-11-15');
  evento('2026-11-08', 'Congreso regional 2026');
  evento('2026-11-15', 'Visita del superintendente de circuito');
  assert.equal(P.choques('2026-10-13').length, 2);
});

test('un evento normal no ocupa nada', () => {
  limpia();
  semana('s1', '2026-11-08');
  evento('2026-11-08', 'Reunión del cuerpo de ancianos');
  assert.deepEqual(P.choques('2026-10-13'), []);
});

test('lista a quién hay que avisar, sin repetir y separando las parejas', () => {
  limpia();
  semana('s1', '2026-11-08', 'semana', [
    { k: 'presi', t: 'Presidencia', by: 'Luis' },
    { k: 'maestros', t: 'Seamos mejores maestros', by: 'Ana / Marta' },
    { k: 'lector', t: 'Lector', by: 'Luis' },
    { k: 'ora2', t: 'Oración final', by: '' },
  ]);
  evento('2026-11-08', 'Asamblea de circuito');
  assert.deepEqual(P.choques('2026-10-13')[0].conGente, ['Luis', 'Ana', 'Marta']);
});

test('si no hay nadie asignado, no hay a quién avisar', () => {
  limpia();
  semana('s1', '2026-11-08', 'finde', [{ k: 'discurso', t: 'Discurso público', by: '' }]);
  evento('2026-11-08', 'Asamblea regional');
  assert.deepEqual(P.choques('2026-10-13')[0].conGente, []);
});

test('lo que ya pasó no molesta', () => {
  limpia();
  semana('s1', '2026-09-01');
  evento('2026-09-01', 'Asamblea de circuito');
  assert.deepEqual(P.choques('2026-10-13'), []);
});

test('lo muy lejano tampoco: solo se mira lo que viene', () => {
  limpia();
  semana('s1', '2027-06-01');
  evento('2027-06-01', 'Congreso regional');
  assert.deepEqual(P.choques('2026-10-13', 60), [], 'a 8 meses vista todavía no avisa');
  assert.equal(P.choques('2026-10-13', 400).length, 1, 'pidiendo más días, sí');
});

test('los choques salen en orden de fecha', () => {
  limpia();
  semana('s2', '2026-12-06');
  semana('s1', '2026-11-08');
  evento('2026-12-06', 'Asamblea regional');
  evento('2026-11-08', 'Asamblea de circuito');
  assert.deepEqual(P.choques('2026-10-13', 120).map(x => x.semana.id), ['s1', 's2']);
});

test('eventoQueOcupa: dice cuál es el evento de esa fecha', () => {
  limpia();
  evento('2026-11-08', 'Asamblea de circuito');
  assert.equal(P.eventoQueOcupa('2026-11-08').title, 'Asamblea de circuito');
  assert.equal(P.eventoQueOcupa('2026-11-09'), null);
});

// ───────────── Avisar a cada uno (idea de la app de Conferencia) ─────────────

const conPersonas = () => { data.people.length = 0; data.people.push({ id: 'p1', name: 'Luis Pérez', phone: '04141234567' }, { id: 'p2', name: 'Jorge Díaz' }); };

test('aQuienAvisar: junta todas las partes de cada hermano', () => {
  limpia(); conPersonas();
  semana('s1', '2026-11-08', 'semana', [
    { k: 'presi', t: 'Presidencia', by: 'Luis Pérez' },
    { k: 'lector', t: 'Lector', by: 'Luis Pérez' },
    { k: 'tesoros', t: 'Tesoros de la Biblia', by: 'Jorge Díaz' },
    { k: 'ora2', t: 'Oración final', by: '' },
  ]);
  const g = P.aQuienAvisar('s1');
  assert.equal(g.length, 2);
  assert.deepEqual(g[0].partes, ['Presidencia', 'Lector']);
  assert.equal(g[0].persona.id, 'p1', 'reconoce a la persona para sacar su teléfono');
  assert.deepEqual(g[1].partes, ['Tesoros de la Biblia']);
});

test('aQuienAvisar: una pareja son dos avisos distintos', () => {
  limpia(); conPersonas();
  semana('s1', '2026-11-08', 'semana', [{ k: 'maestros', t: 'Seamos mejores maestros', by: 'Luis Pérez / Jorge Díaz' }]);
  assert.deepEqual(P.aQuienAvisar('s1').map(x => x.nombre), ['Luis Pérez', 'Jorge Díaz']);
});

test('aQuienAvisar: reconoce al hermano aunque venga abreviado', () => {
  limpia(); conPersonas();
  semana('s1', '2026-11-08', 'semana', [{ k: 'presi', t: 'Presidencia', by: 'L. Pérez' }]);
  assert.equal(P.aQuienAvisar('s1')[0].persona?.id, 'p1');
});

test('el mensaje dice la fecha, la parte y pide confirmación', () => {
  limpia(); conPersonas();
  semana('s1', '2026-11-08', 'finde', [{ k: 'discurso', t: 'Discurso público', by: 'Luis Pérez' }]);
  const m = P.mensajePara('s1', 'Luis Pérez');
  assert.match(m, /^Hola, Luis\./);
  assert.match(m, /Discurso público/);
  assert.match(m, /confirmas/i);
});

test('con varias partes, el mensaje las nombra todas', () => {
  limpia(); conPersonas();
  semana('s1', '2026-11-08', 'semana', [
    { k: 'presi', t: 'Presidencia', by: 'Luis Pérez' },
    { k: 'lector', t: 'Lector', by: 'Luis Pérez' },
  ]);
  const m = P.mensajePara('s1', 'Luis Pérez');
  assert.match(m, /estas partes/);
  assert.match(m, /Presidencia/);
  assert.match(m, /Lector/);
});

test('pedir el mensaje de alguien que no tiene parte no revienta', () => {
  limpia(); conPersonas();
  semana('s1', '2026-11-08', 'semana', [{ k: 'presi', t: 'Presidencia', by: 'Luis Pérez' }]);
  assert.equal(P.mensajePara('s1', 'Pedro Gómez'), '');
  assert.equal(P.mensajePara('no-existe', 'Luis Pérez'), '');
});
