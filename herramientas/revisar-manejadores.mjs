// Revisa los manejadores de clic globales:  node herramientas/revisar-manejadores.mjs
//
// El error que esto caza (nos costo cuatro versiones encontrarlo cuatro veces):
// un modulo escucha los clics de toda la pagina, se queda con lo que lleve «su» atributo
// y le cancela el clic. Si ese atributo lo lleva un boton, perfecto. Pero si lo lleva
// una casilla, cancelar el clic impide que se marque; si lo lleva un <details>, impide
// que se despliegue; si lo lleva un campo, que reciba el foco. Y no hay error, ni aviso,
// ni rastro en la consola: el elemento simplemente no responde.
//
// La regla: un manejador global que cancele el clic tiene que mirar antes si la accion
// es suya, contra una lista explicita. Y esa lista tiene que cuadrar con los «case» del
// switch, para que no se desincronicen al agregar una accion nueva.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const archivos = [
  ...readdirSync(join(root, 'js')).filter(f => f.endsWith('.js')).map(f => `js/${f}`),
  ...readdirSync(join(root, 'modulos'), { recursive: true })
    .map(f => String(f).replace(/[\\/]+/g, '/'))
    .filter(f => f.endsWith('.js')).map(f => `modulos/${f}`),
];

// El cuerpo del manejador: desde el addEventListener hasta donde se vuelve a nivel cero de llaves
function cuerpoDelManejador(src, desde) {
  let i = src.indexOf('{', desde);
  if (i < 0) return '';
  let nivel = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') nivel++;
    else if (src[j] === '}') { nivel--; if (!nivel) return src.slice(i, j + 1); }
  }
  return src.slice(i);
}

const problemas = [];
let revisados = 0;

for (const f of archivos) {
  const src = readFileSync(join(root, f), 'utf8');
  for (const m of src.matchAll(/document\.addEventListener\(\s*'click'/g)) {
    const cuerpo = cuerpoDelManejador(src, m.index);
    const linea = src.slice(0, m.index).split('\n').length;
    revisados++;

    // ¿Se queda con los elementos por un atributo data-*?
    const attr = cuerpo.match(/closest\??\.?\(\s*'\[data-([a-z-]+)\]'/);
    if (!attr) continue;
    const corte = cuerpo.search(/preventDefault\(\)|stopPropagation\(\)/);
    if (corte < 0) continue;

    // Vale como filtro cualquiera de estas tres formas de preguntar «¿esto es mio?»:
    //  · una lista explicita de acciones            → ACCIONES.has(...)
    //  · buscar el dueño en un registro y salir si no está → MODS.get(...)
    //  · cancelar solo en un caso concreto           → if (…) e.preventDefault()
    const antes = cuerpo.slice(0, corte);
    const lineaDelCorte = cuerpo.slice(cuerpo.lastIndexOf('\n', corte) + 1, corte + 40);
    const filtra = /\.has\(|ACCIONES|includes\(\s*[a-z]|\.get\(/i.test(antes) || /^\s*if\s*\(/.test(lineaDelCorte);
    if (!filtra) {
      problemas.push(`${f}:${linea} · cancela el clic de todo lo que lleve data-${attr[1]} sin comprobar si la accion es suya`);
      continue;
    }

    // ¿La lista cuadra con los case del switch?
    const set = src.match(/const ACCIONES = new Set\(\[([\s\S]*?)\]\)/);
    if (set) {
      const enLista = [...set[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
      const enSwitch = [...cuerpo.matchAll(/case '([^']+)':/g)].map(x => x[1]);
      const faltan = enSwitch.filter(c => !enLista.includes(c));
      if (faltan.length) problemas.push(`${f}:${linea} · estas acciones estan en el switch pero no en la lista: ${faltan.join(', ')}`);
    }
  }
}

console.log(`manejadores de clic globales revisados: ${revisados}`);
if (problemas.length) {
  console.error(`\n✗ Manejadores que pueden dejar elementos muertos:\n${problemas.map(p => `  · ${p}`).join('\n')}`);
  console.error('\nArreglo: declara las acciones del modulo en un Set y sal del manejador antes de');
  console.error('cancelar nada si la accion no esta en el. Mira modulos/papeles/papeles.js.');
  process.exit(1);
}
console.log('✓ ninguno cancela clics que no sean suyos, y las listas cuadran con sus switch');
