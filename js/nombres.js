// 👥 Enlazar nombres · que «J. Pérez», «Jorge P.» y «Jorge Pérez» sean el mismo hermano.
//
// La idea viene de la app de S. Servicio, que tiene una pantalla para enlazar los nombres que vienen
// escritos de otra manera. El problema es siempre el mismo: lo que llega en un PDF, en una foto o en
// un mensaje no está escrito como lo tienes tú en Personas, y la app no lo reconoce.
//
// Cómo funciona, en tres pasos y en este orden:
//   1. Tal cual      → el nombre coincide con el de Personas (sin tildes ni mayúsculas).
//   2. Lo que dijiste→ ya enlazaste antes ese nombre con alguien (`profile.alias`).
//   3. Parecido      → inicial + apellido («J. Pérez»), solo el nombre, o el apellido con el nombre.
//      Si hay más de uno que encaja, NO elige: devuelve que hay duda, para preguntarte.
//
// Lo que enlazas se recuerda, así que cada nombre raro se pregunta una sola vez.
//
// La parte de arriba es pura (se prueba con `node --test tests/nombres.test.mjs`); la de abajo guarda.

import * as store from './store.js';
import * as M from './model.js';

// ───────────── Parte pura ─────────────

/** Sin tildes, sin puntos, en minúsculas y con un solo espacio. */
export const normalizar = t => String(t || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[.,_]/g, ' ').replace(/\s+/g, ' ').trim();

const trozos = t => normalizar(t).split(' ').filter(Boolean);

/** «Jorge Pérez» → «j perez» (la inicial y el apellido), que es como suele venir abreviado. */
function inicialApellido(nombre) {
  const p = trozos(nombre);
  return p.length >= 2 ? `${p[0][0]} ${p[p.length - 1]}` : '';
}

/**
 * Busca a quién se refiere un nombre suelto.
 * @param {string} texto      el nombre tal cual venía escrito
 * @param {Array} personas    [{ id, name }]
 * @param {object} alias      { 'nombre normalizado': 'idDePersona' }
 * @returns {{ id: string, como: 'exacto'|'alias'|'parecido'|'duda'|'nada', entre?: Array }}
 */
export function buscar(texto, personas = [], alias = {}) {
  const q = normalizar(texto);
  if (q.length < 3) return { id: '', como: 'nada' };

  // 1. Tal cual
  const exacto = personas.find(p => normalizar(p.name) === q);
  if (exacto) return { id: exacto.id, como: 'exacto' };

  // 2. Lo que ya enlazaste
  const enlazado = alias[q];
  if (enlazado && personas.some(p => p.id === enlazado)) return { id: enlazado, como: 'alias' };

  // 3. Parecido
  const qt = trozos(q);
  const candidatos = personas.filter(p => {
    const pt = trozos(p.name);
    if (!pt.length) return false;
    if (inicialApellido(p.name) === q) return true;                       // «J. Pérez»
    if (pt.join(' ').startsWith(q) || q.startsWith(pt.join(' '))) return true;
    // Mismo nombre de pila y mismo apellido, aunque sobren o falten nombres de en medio
    if (qt.length >= 2 && pt.length >= 2 && qt[0] === pt[0] && qt[qt.length - 1] === pt[pt.length - 1]) return true;
    // Solo el nombre de pila, si es único
    if (qt.length === 1 && pt[0] === qt[0]) return true;
    return false;
  });

  if (candidatos.length === 1) return { id: candidatos[0].id, como: 'parecido' };
  if (candidatos.length > 1) return { id: '', como: 'duda', entre: candidatos.map(p => ({ id: p.id, name: p.name })) };
  return { id: '', como: 'nada' };
}

/**
 * Pasa una lista de nombres y separa lo resuelto de lo que hay que preguntar.
 * @returns {{ resueltos: Map<string,string>, preguntar: Array<{ texto, entre }> }}
 */
export function repasar(textos, personas = [], alias = {}) {
  const resueltos = new Map();
  const preguntar = [];
  const vistos = new Set();
  textos.map(t => String(t || '').trim()).filter(Boolean).forEach(t => {
    const k = normalizar(t);
    if (vistos.has(k)) return;
    vistos.add(k);
    const r = buscar(t, personas, alias);
    if (r.id) resueltos.set(t, r.id);
    else preguntar.push({ texto: t, entre: r.entre || [] });
  });
  return { resueltos, preguntar };
}

// ───────────── Parte que guarda ─────────────

const personas = () => M.data?.people || store.all('people');
export const alias = () => M.profile().alias || {};

/** A quién se refiere este nombre. */
export const quienEs = texto => buscar(texto, personas(), alias());

/** Recuerda que este nombre es esta persona. Se pregunta una sola vez. */
export function enlazar(texto, personaId) {
  const k = normalizar(texto);
  if (!k || !personaId) return;
  store.patchProfile(v => ({ alias: { ...(v.alias || {}), [k]: personaId } }));
}

/** Deshace un enlace. */
export function desenlazar(texto) {
  const k = normalizar(texto);
  store.patchProfile(v => {
    const a = { ...(v.alias || {}) };
    delete a[k];
    return { alias: a };
  });
}

/** Los enlaces que has hecho, para poder revisarlos: [{ texto, persona }] */
export function enlaces() {
  const gente = personas();
  return Object.entries(alias())
    .map(([texto, id]) => ({ texto, persona: gente.find(p => p.id === id) || null }))
    .filter(x => x.persona)
    .sort((a, b) => a.texto.localeCompare(b.texto));
}

/** Repasa una lista de nombres con los datos de verdad. */
export const repasarTodos = textos => repasar(textos, personas(), alias());
