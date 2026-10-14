// 🗂 Por resolver · lo que una importación no supo entender, guardado en vez de tirado.
//
// La idea viene de la app de Territorio: cuando importas algo y una línea no cuadra, la app no la
// pierde ni se inventa el dato: la aparta y te dice «quedaron N por resolver». Luego lo miras con
// calma y decides. Aquí vale para TODAS las importaciones: el S-147, la limpieza del Salón, el
// programa de las reuniones, las asignaciones mecánicas…
//
// Dónde vive: `profile.porResolver`, un solo campo del perfil (no hay que tocar firestore.rules).
// Quién lo usa: cualquier importador llama a `anotar(...)`; la pantalla está en
// `modulos/por-resolver/` (si borras ese módulo se siguen guardando, solo que no los ves).
//
// Un apunte: { id, de, texto, porque, fecha, datos }
//   de     → quién lo apartó ('s147', 'limpieza', 'programa', 'mecanicas'…)
//   texto  → la línea tal cual venía
//   porque → por qué no se pudo usar, en cristiano
//   datos  → lo que el importador quiera recordar para poder arreglarlo luego (opcional)
//
// La mitad de arriba del archivo es pura (no toca la base de datos) para poder probarla con
// `node --test tests/por-resolver.test.mjs`; la de abajo es la que guarda y lee de verdad.

import * as store from './store.js';
import * as M from './model.js';

const MAX = 80;   // más de esto es ruido: se quedan los más recientes

export const ORIGENES = {
  s147: 'S-147',
  limpieza: 'Limpieza del Salón',
  programa: 'Programa de las reuniones',
  mecanicas: 'Asignaciones mecánicas',
  personas: 'Personas',
  otro: 'Importación',
};
export const nombreOrigen = de => ORIGENES[de] || ORIGENES.otro;

// ───────────── Parte pura ─────────────

const limpiar = s => String(s || '').replace(/\s+/g, ' ').trim();
const clave = (de, texto) => `${de}|${limpiar(texto).toLowerCase()}`;

/** De lo más reciente a lo más antiguo, y si quieres solo los de un origen. */
export const ordenar = (lista, de = '') => (de ? lista.filter(x => x.de === de) : [...lista])
  .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));

/** Cuántos hay de cada origen: { s147: 3, limpieza: 1 } */
export function contarPorOrigen(lista) {
  const out = {};
  lista.forEach(x => { out[x.de] = (out[x.de] || 0) + 1; });
  return out;
}

/**
 * Mezcla apuntes nuevos con los que ya había, sin repetir.
 * @returns {{ lista: Array, puestos: number }}
 */
export function fusionar(antes, de, apuntes, hoy = new Date().toISOString().slice(0, 10)) {
  const nuevos = (Array.isArray(apuntes) ? apuntes : [apuntes]).filter(a => limpiar(a?.texto));
  const vistos = new Set(antes.map(x => clave(x.de, x.texto)));
  const añadir = [];
  nuevos.forEach(a => {
    const k = clave(de, a.texto);
    if (vistos.has(k)) return;   // ya estaba apuntado lo mismo, del mismo importador
    vistos.add(k);
    añadir.push({
      id: `pr-${Date.now().toString(36)}-${añadir.length}-${Math.random().toString(36).slice(2, 6)}`,
      de,
      texto: limpiar(a.texto).slice(0, 300),
      porque: limpiar(a.porque).slice(0, 160),
      fecha: hoy,
      ...(a.datos ? { datos: a.datos } : {}),
    });
  });
  return { lista: añadir.length ? [...antes, ...añadir].slice(-MAX) : antes, puestos: añadir.length };
}

/** Quita uno. Devuelve también el apunte, para poder ofrecer «Deshacer». */
export function quitar(antes, id) {
  const fuera = antes.find(a => a.id === id) || null;
  return { lista: fuera ? antes.filter(a => a.id !== id) : antes, fuera };
}

/** Quita todos los de un origen (o todos, si no se dice). */
export function vaciarDe(antes, de = '') {
  const fuera = de ? antes.filter(a => a.de === de) : [...antes];
  if (!fuera.length) return { lista: antes, fuera };
  const ids = new Set(fuera.map(x => x.id));
  return { lista: antes.filter(a => !ids.has(a.id)), fuera };
}

/**
 * Frase para contarle al usuario cómo fue la importación, en su idioma.
 * Ej.: «Se guardaron 12. Quedaron 2 por resolver.»
 */
export function resumen(guardados, apartados) {
  const a = guardados === 1 ? 'Se guardó 1.' : `Se guardaron ${guardados}.`;
  if (!apartados) return guardados ? a : 'No se pudo guardar nada.';
  const b = apartados === 1 ? 'Quedó 1 por resolver.' : `Quedaron ${apartados} por resolver.`;
  return guardados ? `${a} ${b}` : b;
}

// ───────────── Parte que guarda ─────────────

const actual = () => M.profile().porResolver || [];
const guardar = lista => store.patchProfile(() => ({ porResolver: lista }));

export const lista = (de = '') => ordenar(actual(), de);
export const contar = (de = '') => lista(de).length;
export const porOrigen = () => contarPorOrigen(actual());

/**
 * Aparta lo que no se entendió. No repite.
 * @param {string} de  quién lo aparta (una clave de ORIGENES)
 * @param {Array<{texto:string, porque:string, datos?:object}>} apuntes
 * @returns {number} cuántos se apuntaron de verdad
 */
export function anotar(de, apuntes) {
  const { lista: nueva, puestos } = fusionar(actual(), de, apuntes);
  if (puestos) guardar(nueva);
  return puestos;
}

export function resolver(id) {
  const { lista: nueva, fuera } = quitar(actual(), id);
  if (fuera) guardar(nueva);
  return fuera;
}

export function devolver(apunte) {
  if (apunte) guardar([...actual(), apunte].slice(-MAX));
}

export function vaciar(de = '') {
  const { lista: nueva, fuera } = vaciarDe(actual(), de);
  if (fuera.length) guardar(nueva);
  return fuera;
}
