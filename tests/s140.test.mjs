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

// ─────────────────────────────────────────────────────────────────────────────
// Lo que salió de un S-140 de verdad (octubre de 2026). Los renglones son los que
// devuelve js/mecas.js, con la X de cada trozo tal cual venía del PDF.
// Cada semana pone la columna de la derecha en otra X: la del 8 en 360-430, la
// del 29 en 337-407. Por eso el corte no puede ser uno solo para todo el PDF.
// ─────────────────────────────────────────────────────────────────────────────
const REAL = [
  L(['EL CAMPITO (12047)', 31], ['Programa para la reunión de entre semana', 221]),
  L(['08-10-2026 | JEREMÍAS 40, 41', 31], ['Presidente: GABRIEL MADERA', 392]),
  L(['06:00', 31], ['• Canción 33', 56], ['Oración: GABRIEL MADERA', 400]),
  L(['06:05', 31], ['• Palabras de introducción (1 mins.)', 56]),
  L(['TESOROS DE LA BIBLIA', 31], ['Auditorio principal', 430]),
  L(['06:06', 31], ['1. Tengamos un punto de vista equilibrado (10 mins.)', 56], ['LUIGGI SANCHEZ', 430]),
  L(['06:27', 31], ['3. Lectura de la Biblia (4 mins.)', 56], ['Estudiante: MARIO GUZMAN', 392]),
  L(['SEAMOS MEJORES MAESTROS', 31], ['Auditorio principal', 430]),
  L(['JHOSUA HERNANDEZ / OPNIEL', 430]),
  L(['06:32', 31], ['4. Empiece conversaciones (3 mins.)', 56], ['Estudiante/Ayudante:', 360]),
  L(['RAMIREZ', 430]),
  L(['06:36', 31], ['5. Empiece conversaciones (3 mins.)', 56], ['Estudiante/Ayudante: IVONNE ACABAN / YENNY DIAZ', 360]),
  L(['07:40', 31], ['• Canción 38', 56], ['Oración: RAMON ARAY', 400]),
  L(['Impreso el 06-10-2026', 501]),
  L(['S-140-S 11/23', 28]),
  L(['EL CAMPITO (12047)', 31], ['Programa para la reunión de entre semana', 221]),
  L(['29-10-2026 | JEREMÍAS 47, 48', 31], ['Presidente: WILCKER RUBIO', 368]),
  L(['06:00', 31], ['• Canción 125', 56], ['Oración: WILCKER RUBIO', 377]),
  L(['06:06', 31], ['1. 1. Jehová es un juez justo y misericordioso (10 mins.)', 56], ['JOSE ANTONIO AFONZO', 407]),
  L(['06:32', 31], ['4. Empiece conversaciones (3 mins.)', 56], ['Estudiante/Ayudante: BEISY VASQUEZ / JESSIKA NORIEGA', 337]),
  L(['JOSE ANTONIO BLANCO / JHONNY', 407]),
  L(['06:36', 31], ['5. Haga revisitas (4 mins.)', 56], ['Estudiante/Ayudante:', 337]),
  L(['RODRIGUEZ', 407]),
];

const porFecha = (w, f) => w.find(s => s.date === f);
const parte = (s, t) => s.parts.find(p => p.t.startsWith(t));

test('S-140 de verdad: salen las semanas que hay, ni una más', () => {
  assert.deepEqual(S.leerPrograma(REAL).map(s => s.date), ['2026-10-08', '2026-10-29'],
    'el pie «Impreso el 06-10-2026» no debe abrir una semana');
});

test('S-140 de verdad: la oración de la canción es una parte aparte', () => {
  const s = porFecha(S.leerPrograma(REAL), '2026-10-08');
  assert.equal(parte(s, 'Canción 33').by, '', 'a la canción no le toca nadie');
  assert.equal(parte(s, 'Canción 33').asig, false, 'y no cuenta como parte sin asignar');
  const oraciones = s.parts.filter(p => p.t === 'Oración');
  assert.equal(oraciones.length, 2, 'la de abrir y la de cerrar');
  assert.equal(oraciones[0].by, 'GABRIEL MADERA');
  assert.equal(oraciones[1].by, 'RAMON ARAY');
});

test('S-140 de verdad: un nombre partido en tres renglones se vuelve a juntar', () => {
  const s = porFecha(S.leerPrograma(REAL), '2026-10-08');
  assert.equal(parte(s, '4. Empiece').by, 'JHOSUA HERNANDEZ / OPNIEL RAMIREZ');
  assert.equal(parte(s, '5. Empiece').by, 'IVONNE ACABAN / YENNY DIAZ', 'los enteros siguen bien');
  assert.ok(!s.parts.some(p => p.by === 'RAMIREZ'), 'el trozo suelto no deja una parte fantasma');
});

test('S-140 de verdad: cada semana tiene su columna en otra X', () => {
  const w = S.leerPrograma(REAL);
  assert.equal(parte(porFecha(w, '2026-10-08'), '3. Lectura').by, 'MARIO GUZMAN');
  assert.equal(parte(porFecha(w, '2026-10-29'), '4. Empiece').by, 'BEISY VASQUEZ / JESSIKA NORIEGA');
  assert.equal(parte(porFecha(w, '2026-10-29'), '5. Haga revisitas').by, 'JOSE ANTONIO BLANCO / JHONNY RODRIGUEZ');
});

test('S-140 de verdad: el número repetido del programa se deja una sola vez', () => {
  const s = porFecha(S.leerPrograma(REAL), '2026-10-29');
  assert.ok(parte(s, '1. Jehová'), 'debe quedar «1. Jehová…», no «1. 1. Jehová…»');
});

test('S-140 de verdad: el encabezado y el pie no se cuelan como partes', () => {
  S.leerPrograma(REAL).forEach(s => s.parts.forEach(p => {
    assert.ok(!/CAMPITO|S-140|Impreso el/i.test(p.t), `se coló: ${p.t}`);
  }));
});
