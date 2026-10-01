// Cambia el número de versión de la app en TODOS los lugares a la vez.
//
//   node herramientas/version.mjs            → muestra la versión actual y revisa que coincida en todos lados
//   node herramientas/version.mjs 9.8.2      → pone 9.8.2 en todos lados
//   node herramientas/version.mjs parche     → sube el 3.er número  (9.8.1 → 9.8.2)  un cambio en un módulo
//   node herramientas/version.mjs menor      → sube el 2.º número   (9.8.1 → 9.9.0)  varios módulos
//   node herramientas/version.mjs mayor      → sube el 1.er número  (9.8.1 → 10.0.0) un cambio grande
//
// Formato: MAYOR.MENOR.PARCHE (siempre 3 números). Las notas de la versión se escriben a mano en version.json.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FMT = /^\d+\.\d+\.\d+$/;
const V = String.raw`(\d+(?:\.\d+){1,2})`;
// Dónde vive el número: archivo, patrón (el grupo 1 es la versión) y cuántas veces debe aparecer
const PLACES = [
  { f: 'version.json', re: new RegExp(String.raw`("version":\s*")${V}(")`, 'g'), n: 1 },
  { f: 'js/model.js', re: new RegExp(String.raw`(export const APP_VERSION = ')${V}(')`, 'g'), n: 1 },
  { f: 'sw.js', re: new RegExp(String.raw`(const VERSION = 'agenda-v)${V}(')`, 'g'), n: 1 },
  { f: 'guia.html', re: new RegExp(String.raw`(<b id="guia-version">)${V}(</b>)`, 'g'), n: 1 },
  { f: 'guia.html', re: new RegExp(String.raw`(Guía de uso · versión <span>)${V}(</span>)`, 'g'), n: 1 },
];

const read = f => readFileSync(join(root, f), 'utf8');
const found = PLACES.map(p => ({ ...p, vals: [...read(p.f).matchAll(p.re)].map(m => m[2]) }));
const current = JSON.parse(read('version.json')).version;
const arg = (process.argv[2] || '').trim().toLowerCase();

// Archivos que el service worker guarda para usar sin internet (SHELL en sw.js):
// cada uno debe existir y todo js/*.js debe estar en la lista (si falta uno, la app sin internet se rompe).
function shellProblems() {
  const m = read('sw.js').match(/const SHELL = \[([\s\S]*?)\];/);
  if (!m) return ['No encontré la lista SHELL en sw.js'];
  const shell = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
  const out = [];
  shell.filter(f => f !== './' && !existsSync(join(root, f))).forEach(f => out.push(`SHELL tiene «${f}», pero el archivo no existe`));
  readdirSync(join(root, 'js')).filter(f => f.endsWith('.js') && !shell.includes(`js/${f}`)).forEach(f => out.push(`js/${f} no está en SHELL (sw.js)`));
  return out;
}
const shellBad = shellProblems();

if (!arg) {
  let ok = true;
  for (const p of found) {
    const good = p.vals.length === p.n && p.vals.every(v => v === current);
    if (!good) ok = false;
    console.log(`${good ? '✓' : '✗'} ${p.f.padEnd(14)} ${p.vals.join(', ') || '(no se encontró)'}`);
  }
  console.log(ok ? `\nVersión ${current} en todos lados.` : `\n⚠️ No coincide. Arréglalo con: node herramientas/version.mjs ${FMT.test(current) ? current : '9.8.1'}`);
  console.log(shellBad.length ? `\n✗ Archivos sin internet (SHELL):\n${shellBad.map(x => `  · ${x}`).join('\n')}` : '✓ SHELL de sw.js: todos los archivos existen y están todos los js/*.js');
  process.exit(ok && !shellBad.length ? 0 : 1);
}

const parts = (FMT.test(current) ? current : `${current}.0`.split('.').slice(0, 3).join('.')).split('.').map(Number);
const next = arg === 'parche' ? `${parts[0]}.${parts[1]}.${parts[2] + 1}`
  : arg === 'menor' ? `${parts[0]}.${parts[1] + 1}.0`
  : arg === 'mayor' ? `${parts[0] + 1}.0.0` : arg;
if (!FMT.test(next)) { console.error(`«${arg}» no es una versión válida. Usa tres números, por ejemplo 9.8.2`); process.exit(1); }

if (shellBad.length) { console.error(`✗ Arregla primero la lista SHELL de sw.js:\n${shellBad.map(x => `  · ${x}`).join('\n')}`); process.exit(1); }

const files = new Map();
for (const p of found) {
  if (p.vals.length !== p.n) { console.error(`✗ No encontré el número en ${p.f}`); process.exit(1); }
  const txt = files.get(p.f) ?? read(p.f);
  files.set(p.f, txt.replace(p.re, (_, a, _v, b) => `${a}${next}${b}`));
}
for (const [f, txt] of files) writeFileSync(join(root, f), txt);
console.log(`Listo: ${current} → ${next} en ${[...files.keys()].join(', ')}.\nNo olvides escribir las notas nuevas en version.json.`);
