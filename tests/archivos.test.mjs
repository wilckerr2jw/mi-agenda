import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const A = await import('../js/archivos.js');
const { data } = await import('../js/store.js');

test('archivos: el nombre se limpia para que la ruta no se rompa', () => {
  assert.equal(A.nombreSeguro('Programa de la reunión.pdf'), 'Programa-de-la-reunion.pdf');
  assert.equal(A.nombreSeguro('a/b c:d*e?.pdf'), 'a-b-c-d-e-.pdf');
  assert.equal(A.nombreSeguro('../../secreto.pdf'), 'secreto.pdf', 'no debe poder subir de carpeta');
  assert.equal(A.nombreSeguro(''), 'archivo');
  assert.equal(A.nombreSeguro('   '), 'archivo');
});

test('archivos: el nombre no se alarga sin fin', () => {
  const n = A.nombreSeguro('x'.repeat(300) + '.pdf');
  assert.ok(n.length <= 60, `son ${n.length}`);
  assert.ok(n.endsWith('.pdf'));
});

test('archivos: solo se aceptan PDF y fotos, y hasta 10 MB', () => {
  assert.equal(A.valida({ name: 'a.pdf', type: 'application/pdf', size: 1000 }), '');
  assert.equal(A.valida({ name: 'a.jpg', type: 'image/jpeg', size: 1000 }), '');
  assert.match(A.valida({ name: 'a.zip', type: 'application/zip', size: 10 }), /PDF o fotos/);
  assert.match(A.valida({ name: 'a.pdf', type: 'application/pdf', size: A.MAX + 1 }), /10 MB/);
  assert.match(A.valida(null), /No elegiste/);
});

test('archivos: un archivo no se borra mientras otro registro lo esté usando', () => {
  data.programa.length = 0;
  try {
    const ruta = 'users/u1/programa/a/s140.pdf';
    data.programa.push({ id: 'a', file: { ruta } }, { id: 'b', file: { ruta } });
    assert.equal(A.enUso(ruta, 'a'), true, 'la semana b todavía lo usa');
    data.programa.length = 1;                       // se borra la b
    assert.equal(A.enUso(ruta, 'a'), false, 'ya no lo usa nadie más');
    assert.equal(A.enUso('', 'a'), false);
  } finally { data.programa.length = 0; }
});

test('archivos: busca el archivo en todas las secciones, no solo en la suya', () => {
  data.programa.length = 0; data.tablero.length = 0;
  try {
    const ruta = 'users/u1/programa/a/s140.pdf';
    data.programa.push({ id: 'a', file: { ruta } });
    data.tablero.push({ id: 'z', file: { ruta } });
    assert.equal(A.enUso(ruta, 'a'), true, 'el del tablero apunta al mismo archivo');
  } finally { data.programa.length = 0; data.tablero.length = 0; }
});

test('archivos: el resumen dice el nombre y el peso en lo que se entiende', () => {
  assert.equal(A.resumen({ nombre: 'S-140.pdf', tam: 2048 }), 'S-140.pdf · 2 KB');
  assert.equal(A.resumen({ nombre: 'S-140.pdf', tam: 3 * 1048576 }), 'S-140.pdf · 3.0 MB');
  assert.equal(A.resumen({ nombre: 'S-140.pdf' }), 'S-140.pdf');
  assert.equal(A.resumen(null), '');
});

test('archivos: sin cuenta en la nube no se ofrece guardar el archivo', () => {
  assert.equal(A.disponible(), false);
  assert.equal(A.guardarArchivoHtml('pg'), '');
});
