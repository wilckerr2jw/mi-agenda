// Pruebas de la bandeja «Por resolver» (js/por-resolver.js). Ejecutar: node --test tests/por-resolver.test.mjs
// Se prueba la parte pura: la que guarda es un envoltorio de una línea sobre estas mismas funciones.
import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const PR = await import('../js/por-resolver.js');

const HOY = '2026-10-13';
const uno = (de, texto, extra = {}) => ({ id: `${de}-${texto}`, de, texto, porque: '', fecha: HOY, ...extra });

// ───────────── Apartar ─────────────

test('apartar una línea que no se entendió', () => {
  const { lista, puestos } = PR.fusionar([], 's147', [{ texto: '  Algo   raro  ', porque: 'No venía numerado' }], HOY);
  assert.equal(puestos, 1);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].texto, 'Algo raro', 'el texto se normaliza');
  assert.equal(lista[0].de, 's147');
  assert.equal(lista[0].porque, 'No venía numerado');
  assert.equal(lista[0].fecha, HOY);
});

test('lo mismo dos veces no se apunta dos veces', () => {
  const a = PR.fusionar([], 'limpieza', [{ texto: '8-10 grupo 3', porque: 'No sé qué grupo es' }], HOY);
  const b = PR.fusionar(a.lista, 'limpieza', [{ texto: '8-10   GRUPO 3', porque: 'otra razón' }], HOY);
  assert.equal(b.puestos, 0, 'no distingue mayúsculas ni espacios de más');
  assert.equal(b.lista.length, 1);
});

test('el mismo texto desde otro importador sí es otra cosa', () => {
  const a = PR.fusionar([], 'limpieza', [{ texto: 'grupo 3', porque: '' }], HOY);
  const b = PR.fusionar(a.lista, 'programa', [{ texto: 'grupo 3', porque: '' }], HOY);
  assert.equal(b.puestos, 1);
  assert.equal(b.lista.length, 2);
});

test('las líneas vacías no ensucian la bandeja', () => {
  const { puestos, lista } = PR.fusionar([], 's147', [{ texto: '   ', porque: 'x' }, { texto: '', porque: 'y' }], HOY);
  assert.equal(puestos, 0);
  assert.equal(lista.length, 0);
});

test('un apunte suelto, sin lista, también vale', () => {
  const { puestos } = PR.fusionar([], 's147', { texto: 'una línea', porque: 'no sé' }, HOY);
  assert.equal(puestos, 1);
});

test('el importador puede guardar datos para arreglarlo luego', () => {
  const { lista } = PR.fusionar([], 'limpieza', [{ texto: '8-10 grupo 3', porque: 'No sé qué grupo', datos: { desde: '2026-10-08', grupo: '3' } }], HOY);
  assert.deepEqual(lista[0].datos, { desde: '2026-10-08', grupo: '3' });
});

test('un texto larguísimo se recorta, no se guarda entero', () => {
  const { lista } = PR.fusionar([], 's147', [{ texto: 'x'.repeat(500), porque: 'y'.repeat(400) }], HOY);
  assert.equal(lista[0].texto.length, 300);
  assert.equal(lista[0].porque.length, 160);
});

test('la bandeja no crece sin límite y se quedan los más recientes', () => {
  const muchos = Array.from({ length: 120 }, (_, i) => ({ texto: `linea ${i}`, porque: '' }));
  const { lista } = PR.fusionar([], 's147', muchos, HOY);
  assert.equal(lista.length, 80);
  assert.ok(lista.some(x => x.texto === 'linea 119'), 'el último entra');
  assert.ok(!lista.some(x => x.texto === 'linea 0'), 'el primero se cae');
});

test('cada apunte tiene su propia identidad', () => {
  const { lista } = PR.fusionar([], 's147', [{ texto: 'a', porque: '' }, { texto: 'b', porque: '' }], HOY);
  assert.notEqual(lista[0].id, lista[1].id);
});

// ───────────── Mirar la bandeja ─────────────

test('se ordena de lo más reciente a lo más antiguo', () => {
  const l = [uno('s147', 'vieja', { fecha: '2026-09-01' }), uno('s147', 'nueva', { fecha: '2026-10-13' })];
  assert.deepEqual(PR.ordenar(l).map(x => x.texto), ['nueva', 'vieja']);
});

test('se puede mirar solo un origen', () => {
  const l = [uno('s147', 'a'), uno('limpieza', 'b'), uno('s147', 'c')];
  assert.deepEqual(PR.ordenar(l, 's147').map(x => x.texto), ['a', 'c']);
});

test('se cuentan por origen', () => {
  const l = [uno('s147', 'a'), uno('limpieza', 'b'), uno('s147', 'c')];
  assert.deepEqual(PR.contarPorOrigen(l), { s147: 2, limpieza: 1 });
});

test('el nombre del origen se lee bien, y uno desconocido no deja hueco', () => {
  assert.equal(PR.nombreOrigen('s147'), 'S-147');
  assert.equal(PR.nombreOrigen('limpieza'), 'Limpieza del Salón');
  assert.equal(PR.nombreOrigen('loquesea'), 'Importación');
});

// ───────────── Quitar ─────────────

test('quitar devuelve el apunte, para poder deshacer', () => {
  const l = [uno('s147', 'a'), uno('s147', 'b')];
  const { lista, fuera } = PR.quitar(l, 's147-a');
  assert.equal(lista.length, 1);
  assert.equal(fuera.texto, 'a');
});

test('quitar algo que ya no está deja la lista igual', () => {
  const l = [uno('s147', 'a')];
  const { lista, fuera } = PR.quitar(l, 'no-existe');
  assert.equal(fuera, null);
  assert.equal(lista, l, 'ni siquiera copia la lista');
});

test('vaciar un origen no toca los demás', () => {
  const l = [uno('s147', 'a'), uno('limpieza', 'b'), uno('s147', 'c')];
  const { lista, fuera } = PR.vaciarDe(l, 's147');
  assert.equal(fuera.length, 2);
  assert.deepEqual(lista.map(x => x.texto), ['b']);
});

test('vaciar sin decir origen los quita todos', () => {
  const l = [uno('s147', 'a'), uno('limpieza', 'b')];
  const { lista, fuera } = PR.vaciarDe(l);
  assert.equal(fuera.length, 2);
  assert.equal(lista.length, 0);
});

// ───────────── La frase que ve el usuario ─────────────

test('el resumen de una importación se lee como lo diría una persona', () => {
  assert.equal(PR.resumen(12, 2), 'Se guardaron 12. Quedaron 2 por resolver.');
  assert.equal(PR.resumen(1, 1), 'Se guardó 1. Quedó 1 por resolver.');
  assert.equal(PR.resumen(5, 0), 'Se guardaron 5.');
  assert.equal(PR.resumen(0, 3), 'Quedaron 3 por resolver.');
  assert.equal(PR.resumen(0, 0), 'No se pudo guardar nada.');
});
