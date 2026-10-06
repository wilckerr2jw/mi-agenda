import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const S = await import('../js/programa-s140.js');

// Reproduce un renglón del PDF: trozos con su posición X, como los devuelve js/mecas.js.
// El ancho de la hoja va de 0 a 800; la columna de la derecha empieza hacia 500.
const seg = (t, x) => ({ t, x, end: x + t.length * 5.2 });
const L = (...pares) => ({ segs: pares.map(([t, x]) => seg(t, x)) });

// Una semana como la del S-140 de la congregación
const SEMANA = [
  L(['08-10-2026 | LECTURA SEMANAL DE LA BIBLIA', 48], ['Presidente:', 500], ['GABRIEL MADERA', 600]),
  L(['Oración:', 530], ['GABRIEL MADERA', 600]),
  L(['06:00', 48], ['• Canción', 90]),
  L(['06:05', 48], ['• Palabras de introducción (1 mins.)', 90]),
  L(['TESOROS DE LA BIBLIA', 48], ['Auditorio principal', 600]),
  L(['06:06', 48], ['1. Tengamos un punto de vista equilibrado de la protección de Jehová (10 mins.)', 90], ['LUIGGI SANCHEZ', 600]),
  L(['06:16', 48], ['2. Busquemos perlas escondidas (10 mins.)', 90], ['RONNY PELLICER', 600]),
  L(['06:27', 48], ['3. Lectura de la Biblia (4 mins.)', 90], ['Estudiante:', 505], ['MARIO GUZMAN', 600]),
  L(['SEAMOS MEJORES MAESTROS', 48], ['Auditorio principal', 600]),
  L(['06:32', 48], ['4. Empiece conversaciones (3 mins.)', 90], ['Estudiante/Ayudante:', 500], ['JHOSUA HERNANDEZ / OPNIEL RAMIREZ', 600]),
  L(['NUESTRA VIDA CRISTIANA', 48]),
  L(['06:47', 48], ['• Canción', 90]),
  L(['06:52', 48], ['8. Jehová protege a las viudas (8 mins.)', 90], ['ENRIQUE SEIJAS', 600]),
  L(['07:07', 48], ['9. Estudio Bíblico de la Congregación (30 mins.)', 90], ['ANGEL PIRELA / OPNIEL RAMIREZ', 600]),
  L(['07:37', 48], ['• Palabras de conclusión (3 mins.)', 90], ['GABRIEL MADERA', 600]),
  L(['07:40', 48], ['• Canción', 90]),
  L(['Oración:', 530], ['RAMON ARAY', 600]),
];

test('distingue un nombre en mayúsculas del texto de una parte', () => {
  assert.equal(S.pareceNombre('GABRIEL MADERA'), true);
  assert.equal(S.pareceNombre('JHOSUA HERNANDEZ / OPNIEL RAMIREZ'), true);
  assert.equal(S.pareceNombre('Busquemos perlas escondidas'), false);
  assert.equal(S.pareceNombre('Auditorio principal'), false);
  assert.equal(S.pareceNombre('06:16'), false);
});

test('lee la fecha y la lectura semanal del encabezado', () => {
  const [s] = S.leerPrograma(SEMANA);
  assert.equal(s.date, '2026-10-08');
  assert.equal(s.kind, 'semana');
  assert.match(s.lectura, /LECTURA SEMANAL/i);
});

test('saca a quién le toca cada parte, con su hora', () => {
  const [s] = S.leerPrograma(SEMANA);
  const parte = t => s.parts.find(p => p.t.includes(t));
  assert.equal(parte('Busquemos perlas').by, 'RONNY PELLICER');
  assert.equal(parte('Busquemos perlas').time, '06:16');
  assert.equal(parte('Lectura de la Biblia').by, 'MARIO GUZMAN');
  assert.equal(parte('Lectura de la Biblia').label, 'Estudiante');
  assert.equal(parte('Empiece conversaciones').by, 'JHOSUA HERNANDEZ / OPNIEL RAMIREZ');
  assert.equal(parte('Jehová protege').by, 'ENRIQUE SEIJAS');
});

test('reparte las partes en sus secciones de color', () => {
  const [s] = S.leerPrograma(SEMANA);
  const sec = t => s.parts.find(p => p.t.includes(t))?.sec;
  assert.equal(sec('Busquemos perlas'), 'tesoros');
  assert.equal(sec('Empiece conversaciones'), 'maestros');
  assert.equal(sec('Jehová protege'), 'vida');
});

test('«Auditorio principal» no se toma por el nombre de un hermano', () => {
  const [s] = S.leerPrograma(SEMANA);
  assert.ok(!s.parts.some(p => String(p.by).includes('Auditorio')), 'no debe colarse como nombre');
  // Y la banda de sección no se guarda como si fuera una parte
  assert.ok(!s.parts.some(p => p.t.includes('TESOROS DE LA BIBLIA')));
});

test('las canciones no cuentan como partes sin asignar', () => {
  const [s] = S.leerPrograma(SEMANA);
  const canciones = s.parts.filter(p => /Canción/i.test(p.t));
  assert.ok(canciones.length >= 2);
  assert.ok(canciones.every(p => p.asig === false));
});

test('recoge al presidente y la oración final', () => {
  const [s] = S.leerPrograma(SEMANA);
  assert.equal(s.parts.find(p => p.k === 'presi')?.by, 'GABRIEL MADERA');
  assert.ok(s.parts.some(p => p.by === 'RAMON ARAY'), 'la oración final va sin parte a la izquierda');
});

test('lee varias semanas del mismo documento y no las mezcla', () => {
  const dos = [
    ...SEMANA,
    L(['22-10-2026 | LECTURA SEMANAL DE LA BIBLIA', 48], ['Presidente:', 500], ['MORGAN DUNCAN', 600]),
    L(['06:06', 48], ['1. La esperanza es clave para estar contentos (10 mins.)', 90], ['GABRIEL MADERA', 600]),
  ];
  const semanas = S.leerPrograma(dos);
  assert.equal(semanas.length, 2);
  assert.equal(semanas[0].date, '2026-10-08');
  assert.equal(semanas[1].date, '2026-10-22');
  assert.equal(semanas[1].parts.find(p => p.k === 'presi')?.by, 'MORGAN DUNCAN');
  assert.ok(!semanas[1].parts.some(p => p.by === 'RONNY PELLICER'), 'no debe arrastrar partes de la semana anterior');
});

test('una semana sin nadie asignado se lee igual, con los nombres en blanco', () => {
  const vacia = [
    L(['15-10-2026 | LECTURA SEMANAL DE LA BIBLIA', 48], ['Presidente:', 500]),
    L(['06:16', 48], ['2. Busquemos perlas escondidas (10 mins.)', 90]),
  ];
  const [s] = S.leerPrograma(vacia);
  assert.equal(s.date, '2026-10-15');
  assert.equal(s.parts.find(p => p.t.includes('Busquemos'))?.by, '');
});

test('un documento sin fechas no devuelve nada, en vez de inventarse una semana', () => {
  assert.deepEqual(S.leerPrograma([L(['Hola qué tal', 48])]), []);
  assert.deepEqual(S.leerPrograma([]), []);
});
