import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const A = await import('../js/asistencia.js');
const { data } = await import('../js/store.js');

const limpia = () => { data.asistencia.length = 0; };
const anotar = (date, kind, presencial, online) =>
  data.asistencia.push({ id: date + kind, date, kind, presencial, online });

test('promedio: suma por separado el Salón y la videoconferencia', () => {
  const p = A.promedio([
    { presencial: 50, online: 10 },
    { presencial: 60, online: 20 },
  ]);
  assert.equal(p.reuniones, 2);
  assert.equal(p.presencial, 110);
  assert.equal(p.online, 30);
  assert.equal(p.mPresencial, 55);
  assert.equal(p.mOnline, 15);
  assert.equal(p.mTotal, 70);
});

test('promedio: redondea al entero más cercano, como se informa', () => {
  // 3 reuniones, 100 en total → 33,33 → 33
  const p = A.promedio([{ presencial: 40 }, { presencial: 30 }, { presencial: 30 }]);
  assert.equal(p.mPresencial, 33);
  // 3 reuniones, 101 → 33,67 → 34
  const q = A.promedio([{ presencial: 41 }, { presencial: 30 }, { presencial: 30 }]);
  assert.equal(q.mPresencial, 34);
});

test('promedio: sin reuniones no inventa un cero', () => {
  assert.equal(A.promedio([]), null);
});

test('el promedio del mes separa entre semana y fin de semana', () => {
  limpia();
  try {
    anotar('2026-10-07', 'semana', 80, 12);
    anotar('2026-10-14', 'semana', 90, 8);
    anotar('2026-10-11', 'finde', 120, 20);
    const sem = A.promedioMes('2026-10', 'semana');
    const fin = A.promedioMes('2026-10', 'finde');
    assert.equal(sem.reuniones, 2);
    assert.equal(sem.mTotal, 95);
    assert.equal(fin.reuniones, 1);
    assert.equal(fin.mTotal, 140);
    // El mes completo son las tres
    assert.equal(A.promedioMes('2026-10').reuniones, 3);
    // Otro mes no se mezcla
    assert.equal(A.promedioMes('2026-09'), null);
  } finally { limpia(); }
});

test('el texto para enviar trae los dos promedios', () => {
  limpia();
  try {
    anotar('2026-10-07', 'semana', 80, 12);
    anotar('2026-10-11', 'finde', 120, 20);
    const t = A.textoMes('2026-10');
    assert.match(t, /Octubre 2026/);
    assert.match(t, /Entre semana/);
    assert.match(t, /Fin de semana/);
    assert.match(t, /Sal[oó]n 80/);
    assert.match(t, /videoconferencia 20/);
  } finally { limpia(); }
});

test('un mes sin datos lo dice, en vez de dar un texto vacío', () => {
  limpia();
  assert.match(A.textoMes('2026-10'), /Todav[ií]a no hay asistencia/);
});

test('meses con datos: los más recientes primero y sin repetir', () => {
  limpia();
  try {
    anotar('2026-09-03', 'semana', 70, 5);
    anotar('2026-10-07', 'semana', 80, 12);
    anotar('2026-10-11', 'finde', 120, 20);
    assert.deepEqual(A.mesesConDatos(), ['2026-10', '2026-09']);
  } finally { limpia(); }
});

// ───────────── Mandarla al secretario (idea de MeetingCounter) ─────────────

test('sinEnviar: solo las que todavía no has mandado, de la más vieja a la más nueva', () => {
  limpia();
  data.asistencia.push({ id: 'a', date: '2026-10-15', kind: 'semana', presencial: 90, online: 10 });
  data.asistencia.push({ id: 'b', date: '2026-10-08', kind: 'semana', presencial: 88, online: 12, enviado: '2026-10-09T10:00:00Z' });
  data.asistencia.push({ id: 'c', date: '2026-10-11', kind: 'finde', presencial: 120, online: 20 });
  assert.deepEqual(A.sinEnviar().map(r => r.id), ['c', 'a'], 'la enviada no sale; las otras, por fecha');
});

test('sinEnviar: se puede pedir solo las de un mes', () => {
  limpia();
  data.asistencia.push({ id: 'a', date: '2026-10-15', kind: 'semana', presencial: 90 });
  data.asistencia.push({ id: 'b', date: '2026-09-15', kind: 'semana', presencial: 80 });
  assert.deepEqual(A.sinEnviar('2026-10').map(r => r.id), ['a']);
});

test('sinEnviar: sin nada anotado, no hay nada pendiente', () => {
  limpia();
  assert.deepEqual(A.sinEnviar(), []);
});

test('textoDe: el mensaje trae el total y el desglose', () => {
  const t = A.textoDe([{ date: '2026-10-15', kind: 'semana', presencial: 90, online: 10 }]);
  assert.match(t, /Entre semana/);
  assert.match(t, /Total: 100/);
  assert.match(t, /En el Salón: 90/);
  assert.match(t, /videoconferencia: 10/);
});

test('textoDe: varias reuniones van separadas en un solo mensaje', () => {
  const t = A.textoDe([
    { date: '2026-10-11', kind: 'finde', presencial: 120, online: 20 },
    { date: '2026-10-15', kind: 'semana', presencial: 90, online: 10 },
  ]);
  assert.equal(t.split('\n\n').length, 2);
  assert.match(t, /Total: 140/);
  assert.match(t, /Total: 100/);
});

test('textoDe: la nota de la reunión se incluye si la hay', () => {
  const t = A.textoDe([{ date: '2026-10-15', kind: 'semana', presencial: 90, online: 10, notes: 'semana de la visita' }]);
  assert.match(t, /\(semana de la visita\)/);
});
