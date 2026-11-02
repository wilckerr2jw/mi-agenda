// Los encabezados tal como vienen en la hoja real: en mayúsculas y en plural.
// Si uno no se reconoce como apartado, sus puntos se quedan colgando del apartado
// anterior y acaban atribuidos a quien no les toca.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import s147 from '../modulos/papeles/papel-s147.js';

// Noviembre de 2026, con los encabezados y el reparto de puntos de la hoja de verdad
const HOJA = `S-147-26.11-S
Anuncios y recordatorios
Noviembre de 2026

PARA LOS ANCIANOS
1. Cómo dirigir el "Estudio bíblico de la congregación" con "Tu palabra es la verdad".
2. No hace falta leer la mayoría de los recuadros (diagramas, tablas, líneas de tiempo y mapas).

PARA LOS COORDINADORES DE LOS CUERPOS DE ANCIANOS
3. Anuncios para las congregaciones. Asegúrense de que se lean en la próxima reunión.

PARA LOS SUPERINTENDENTES DE SERVICIO
4. "Tu palabra es la verdad". La Biblia libro a libro: Amós a Sofonías.
5. Hoja para estudiar "Tu palabra es la verdad". La Biblia libro a libro.
6. Cómo ver en JW Hub los territorios compartidos con otras congregaciones.
`.split('\n');

const puntos = () => s147.leer(HOJA).tareas;

test('cada punto queda en el apartado de su encabezado', () => {
  const porApartado = {};
  puntos().forEach(t => { (porApartado[t.apartado] ||= []).push(t); });
  assert.deepEqual(
    Object.fromEntries(Object.entries(porApartado).map(([k, v]) => [k, v.length])),
    { ancianos: 2, coordinador: 1, superintendente: 3 },
  );
});

test('los puntos del superintendente de servicio no se le cuelgan al coordinador', () => {
  const delCoordinador = puntos().filter(t => t.apartado === 'coordinador');
  assert.equal(delCoordinador.length, 1, 'el coordinador solo tiene el punto 3');
  assert.match(delCoordinador[0].titulo, /Anuncios para las congregaciones/);
});

// Cada encabezado por separado, en plural, que es como vienen en la hoja
const ENCABEZADOS = [
  ['PARA LOS ANCIANOS', 'ancianos'],
  ['PARA LOS COORDINADORES DE LOS CUERPOS DE ANCIANOS', 'coordinador'],
  ['PARA LOS SUPERINTENDENTES DE SERVICIO', 'superintendente'],
  ['PARA LOS SECRETARIOS', 'secretario'],
  ['PARA LOS SUPERINTENDENTES DE GRUPO', 'grupo'],
  ['PARA LOS SIERVOS MINISTERIALES', 'siervos'],
];

ENCABEZADOS.forEach(([linea, esperado]) => {
  test(`reconoce «${linea}»`, () => {
    const hoja = ['S-147-26.11-S', 'Anuncios y recordatorios', 'Noviembre de 2026', '', linea, '1. Un punto cualquiera de prueba.'];
    const [t] = s147.leer(hoja).tareas;
    assert.equal(t.apartado, esperado);
  });
});
