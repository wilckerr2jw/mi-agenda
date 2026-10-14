// Pruebas del lector del S-21 (modulos/papeles/papel-s21.js). Ejecutar: node --test tests/papeles-s21.test.mjs
//
// Las líneas son las que produce `lector.js` con un PDF de «Tarjetas del grupo» de verdad, pero con
// nombres inventados: el archivo real lleva datos personales de la congregación y no entra al repositorio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import s21, { nombreDeTarjeta } from '../modulos/papeles/papel-s21.js';

const TARJETA = ({ nombre, grupo = 'Grupo 5', sex = 'Mujer', priv = ['Precursor regular'] }) => [
  'REGISTRO DE PUBLICADOR DE LA CONGREGACIÓN',
  `Nombre: ${nombre}  ${grupo}`,
  `Fecha de nacimiento: 22-09-1967  ${sex === 'Hombre' ? '☑' : '☐'} Hombre  ${sex === 'Mujer' ? '☑' : '☐'} Mujer`,
  'Fecha de bautismo: 02-01-2016  ☑ Otras ovejas  ☐ Ungido',
  `${priv.includes('Anciano') ? '☑' : '☐'} Anciano  ${priv.includes('Siervo ministerial') ? '☑' : '☐'} Siervo ministerial  ${priv.includes('Precursor regular') ? '☑' : '☐'} Precursor regular  ☐ Precursor especial  ☐ Misionero que sirve`,
  'en el campo',
  'Septiembre  ☑  ☐',
  'Agosto  ☑  1  ☑  15',
  'Total  15',
  'S-21-S 11/23',
];

const HOJA = [
  ...TARJETA({ nombre: 'CORTES, MARIA GABRIELA' }),
  ...TARJETA({ nombre: 'HERRERA, LUIS ALBERTO', sex: 'Hombre', priv: ['Anciano', 'Precursor regular'] }),
  ...TARJETA({ nombre: 'TORRES, MARTA' }),
];
const gente = (lineas = HOJA) => s21.leer(lineas).registros[0]?.items || [];

// ───────────── El nombre ─────────────

test('«APELLIDO, NOMBRES» se endereza y deja de ir en mayúsculas', () => {
  assert.equal(nombreDeTarjeta('CORTES, MARIA GABRIELA'), 'Maria Gabriela Cortes');
  assert.equal(nombreDeTarjeta('HERRERA, LUIS ALBERTO'), 'Luis Alberto Herrera');
});

test('las partículas se quedan en minúscula', () => {
  assert.equal(nombreDeTarjeta('DE LA ROSA, ANA'), 'Ana de la Rosa');
  assert.equal(nombreDeTarjeta('DEL VALLE, JOSE'), 'Jose del Valle');
});

test('un nombre sin coma también vale', () => {
  assert.equal(nombreDeTarjeta('ANA TORRES'), 'Ana Torres');
});

test('un nombre vacío no revienta', () => {
  assert.equal(nombreDeTarjeta(''), '');
  assert.equal(nombreDeTarjeta(null), '');
});

// ───────────── Reconocer la hoja ─────────────

test('reconoce las tarjetas del grupo', () => {
  assert.ok(s21.reconoce(HOJA) > 0.8);
});

test('no confunde el S-140 con el S-21', () => {
  assert.ok(s21.reconoce(['Programa para la reunión de entre semana', 'TESOROS DE LA BIBLIA']) < 0.3);
});

// ───────────── Lo que saca de cada tarjeta ─────────────

test('saca una persona por tarjeta', () => {
  assert.deepEqual(gente().map(p => p.nombre), ['Maria Gabriela Cortes', 'Luis Alberto Herrera', 'Marta Torres']);
});

test('saca el grupo', () => {
  assert.ok(gente().every(p => p.grupo === 'Grupo 5'));
});

test('saca si es hermano o hermana de la casilla marcada', () => {
  assert.deepEqual(gente().map(p => p.sex), ['m', 'h', 'm']);
});

test('saca solo los privilegios marcados', () => {
  assert.deepEqual(gente()[0].privilegios, ['Precursor regular']);
  assert.deepEqual(gente()[1].privilegios, ['Anciano', 'Precursor regular']);
});

test('una casilla sin marcar no cuenta como privilegio', () => {
  const sinNada = TARJETA({ nombre: 'SOLIS, PEDRO', sex: 'Hombre', priv: [] });
  assert.deepEqual(gente(sinNada)[0].privilegios, []);
});

// ───────────── Las tarjetas repetidas ─────────────

test('la misma tarjeta dos veces es una sola persona', () => {
  // El PDF del grupo trae cada tarjeta repetida (una por hoja)
  assert.equal(gente([...HOJA, ...HOJA]).length, 3);
});

test('si una copia trae más privilegios, se queda la más completa', () => {
  const pobre = TARJETA({ nombre: 'SOLIS, PEDRO', sex: 'Hombre', priv: [] });
  const rica = TARJETA({ nombre: 'SOLIS, PEDRO', sex: 'Hombre', priv: ['Anciano', 'Precursor regular'] });
  assert.deepEqual(gente([...pobre, ...rica])[0].privilegios, ['Anciano', 'Precursor regular']);
  assert.deepEqual(gente([...rica, ...pobre])[0].privilegios, ['Anciano', 'Precursor regular'], 'da igual el orden');
});

// ───────────── Lo que no se puede usar ─────────────

test('el formulario en blanco no crea a nadie', () => {
  const vacio = ['REGISTRO DE PUBLICADOR DE LA CONGREGACIÓN', 'Nombre:', 'Fecha de nacimiento:  ☐ Hombre  ☐ Mujer', 'S-21-S 11/23'];
  const r = s21.leer(vacio);
  assert.deepEqual(r.registros, []);
});

test('una tarjeta sin nombre legible va a «por resolver», no se pierde', () => {
  const rara = ['REGISTRO DE PUBLICADOR DE LA CONGREGACIÓN', 'Algo que no entiendo aquí', '☑ Anciano'];
  const r = s21.leer(rara);
  assert.equal(r.dudas.length, 1);
  assert.match(r.dudas[0].porque, /nombre/i);
});

// ───────────── Qué produce ─────────────

test('no crea tareas: pone al día a las personas', () => {
  const r = s21.leer(HOJA);
  assert.deepEqual(r.tareas, []);
  assert.equal(r.registros[0].coleccion, 'people');
});

test('el título y el resumen dicen de qué grupo son', () => {
  const r = s21.leer(HOJA);
  assert.match(r.titulo, /Grupo 5/);
  assert.equal(r.registros[0].resumen, '3 publicadores del Grupo 5');
});
