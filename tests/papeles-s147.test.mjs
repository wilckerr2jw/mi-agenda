// Pruebas del lector del S-147 y de la reconciliación. Ejecutar: node --test tests/papeles-s147.test.mjs
// Los dos archivos que se prueban son puros (no usan el navegador), así que se importan directo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import s147 from '../modulos/papeles/papel-s147.js';
import { comparar, resumen, aTarea } from '../modulos/papeles/reconciliar.js';

// Una hoja de ejemplo, con la forma del S-147 real: cabecera, mes, apartados y puntos numerados.
const HOJA = `S-147-26.10-S
Anuncios y recordatorios
octubre de 2026

Para el coordinador del cuerpo de ancianos
1. Recuerden que la reunión del cuerpo de ancianos será el 18 de octubre a las 19:30 en el
Salón del Reino.
2. Hay que repasar con los siervos ministeriales el folleto de instrucciones antes de fin de mes.

Para el secretario
3. El informe de servicio del mes debe enviarse a la sucursal antes del 6 de noviembre.

Para el superintendente de servicio
4. Organice la salida especial de predicación del 24 de octubre de 2026.

Anuncios para la congregación
5. La asamblea de circuito se celebrará el 7 de noviembre de 2026.
`.split('\n');

// ───────────── Reconocer la hoja ─────────────

test('reconoce una hoja del S-147 con mucha confianza', () => {
  assert.ok(s147.reconoce(HOJA) > 0.8, 'debería reconocerla casi seguro');
});

test('no confunde cualquier papel con un S-147', () => {
  const otro = ['Registro de publicador', 'S-21-S', 'Nombre: Juan', '1. Enero', '2. Febrero'];
  assert.equal(s147.reconoce(otro), 0);
});

// ───────────── Leer la hoja ─────────────

test('saca el mes de la hoja', () => {
  assert.equal(s147.leer(HOJA).periodo, '2026-10');
  assert.equal(s147.leer(HOJA).titulo, 'S-147 de octubre de 2026');
});

test('saca todos los puntos, de todos los apartados', () => {
  const { tareas } = s147.leer(HOJA);
  assert.equal(tareas.length, 5);
});

test('reparte cada punto en su apartado', () => {
  const { tareas } = s147.leer(HOJA);
  assert.deepEqual(tareas.map(t => t.apartado), ['coordinador', 'coordinador', 'secretario', 'superintendente', 'congregacion']);
});

test('junta los renglones partidos en un solo punto', () => {
  const t = s147.leer(HOJA).tareas[0];
  assert.match(t.texto, /Salón del Reino\.$/, 'el punto debe llegar hasta su última línea');
});

test('saca la fecha y la hora cuando la hoja las trae', () => {
  const t = s147.leer(HOJA).tareas[0];
  assert.equal(t.due, '2026-10-18');
  assert.equal(t.dueTime, '19:30');
});

test('un punto sin hora no se inventa una', () => {
  const t = s147.leer(HOJA).tareas[1];
  assert.equal(t.dueTime, '');
});

test('si el mes nombrado es anterior al de la hoja, el año es el siguiente', () => {
  // La hoja es de octubre de 2026 y el punto habla del 6 de noviembre: mismo año.
  assert.equal(s147.leer(HOJA).tareas[2].due, '2026-11-06');
  const dic = HOJA.map(l => l.replace('octubre de 2026', 'diciembre de 2026').replace('6 de noviembre', '6 de enero'));
  const t = s147.leer(dic).tareas[2];
  assert.equal(t.due, '2027-01-06', 'enero, en una hoja de diciembre, es del año siguiente');
});

test('el título es corto y el texto completo se guarda aparte', () => {
  const t = s147.leer(HOJA).tareas[0];
  assert.ok(t.titulo.length <= 91);
  assert.ok(t.texto.length > t.titulo.length);
});

test('la clave de un punto no cambia al volver a leer la misma hoja', () => {
  const a = s147.leer(HOJA).tareas.map(t => t.clave);
  const b = s147.leer(HOJA).tareas.map(t => t.clave);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, a.length, 'cada punto tiene su propia clave');
});

test('una fecha imposible no se toma como fecha', () => {
  const malo = ['Anuncios y recordatorios', 'octubre de 2026', '1. La reunión será el 31 de febrero, según dicen.'];
  assert.equal(s147.leer(malo).tareas[0].due, '');
});

// ───────────── Reconciliar ─────────────

const comoTareas = leidas => leidas.map((t, i) => aTarea(t, 's147', '2026-10', null, `id-${i}`));

test('cargar la misma hoja dos veces no duplica nada', () => {
  const leidas = s147.leer(HOJA).tareas;
  const plan = comparar(comoTareas(leidas), leidas);
  assert.equal(plan.nuevas.length, 0);
  assert.equal(plan.cambiadas.length, 0);
  assert.equal(plan.iguales.length, 5);
  assert.equal(plan.hayCambios, false);
});

test('la primera carga crea todo', () => {
  const plan = comparar([], s147.leer(HOJA).tareas);
  assert.equal(plan.nuevas.length, 5);
  assert.equal(plan.quitadas.length, 0);
});

test('un punto que cambia de texto se marca como cambiado, no como nuevo', () => {
  const antes = comoTareas(s147.leer(HOJA).tareas);
  // La misma hoja, pero el punto 3 ahora dice otra fecha límite
  const corregida = HOJA.map(l => l.replace('antes del 6 de noviembre', 'antes del 4 de noviembre'));
  const plan = comparar(antes, s147.leer(corregida).tareas);
  // El texto cambió, así que su clave cambia: para la app es uno nuevo y el viejo ya no viene.
  assert.equal(plan.nuevas.length, 1);
  assert.equal(plan.quitadas.length, 1);
  assert.equal(plan.iguales.length, 4);
});

test('un punto que desaparece de la hoja se marca como quitado, pero no se borra', () => {
  const antes = comoTareas(s147.leer(HOJA).tareas);
  const corta = HOJA.filter(l => !l.startsWith('5. '));
  const plan = comparar(antes, s147.leer(corta).tareas);
  assert.equal(plan.quitadas.length, 1);
  assert.equal(plan.quitadas[0].origen.apartado, 'congregacion');
});

test('lo que escribiste tú se respeta al recargar la hoja', () => {
  const leidas = s147.leer(HOJA).tareas;
  const mia = { ...aTarea(leidas[0], 's147', '2026-10', null, 'id-0'), due: '2026-10-20', dueTime: '08:00', status: 'seguimiento', notes: 'Hablar con Luis', responsibleIds: ['p1'] };
  const actualizada = aTarea({ ...leidas[0], titulo: 'Otro título' }, 's147', '2026-10', mia);
  assert.equal(actualizada.title, 'Otro título', 'la hoja manda en el texto');
  assert.equal(actualizada.due, '2026-10-20', 'tu fecha se conserva');
  assert.equal(actualizada.dueTime, '08:00');
  assert.equal(actualizada.status, 'seguimiento');
  assert.equal(actualizada.notes, 'Hablar con Luis');
  assert.deepEqual(actualizada.responsibleIds, ['p1']);
});

test('el resumen se lee como una frase normal', () => {
  assert.equal(resumen({ nuevas: [1], cambiadas: [], iguales: [], quitadas: [] }), '1 tarea nueva.');
  assert.equal(resumen({ nuevas: [1, 2, 3], cambiadas: [1], iguales: [], quitadas: [1, 2] }), '3 tareas nuevas, 1 cambió y 2 ya no vienen en la hoja.');
  assert.equal(resumen({ nuevas: [], cambiadas: [], iguales: [1], quitadas: [] }), 'Todo estaba ya al día: no hay nada que cambiar.');
});

// ───────────── Tolerancia a un escaneo mal leído ─────────────

test('aunque el lector de letras se coma algún acento, la hoja se reconoce', () => {
  const ocr = HOJA.map(l => l.replace(/ó/g, 'o').replace(/é/g, 'e'));
  assert.ok(s147.reconoce(ocr) > 0.5);
  assert.equal(s147.leer(ocr).tareas.length, 5);
});

test('un punto demasiado corto no se convierte en tarea', () => {
  const malo = ['Anuncios y recordatorios', 'octubre de 2026', '1. Sí.', '2. Este punto sí tiene texto suficiente para valer.'];
  const r = s147.leer(malo);
  assert.equal(r.tareas.length, 1);
  assert.equal(r.dudas.length, 1);
});
