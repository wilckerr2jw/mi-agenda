// 🔎 Enganche de lectores · para que la app pueda ofrecer «leer lo que trae este PDF» sin saber quién lo lee.
//
// El problema: el tablero de anuncios (js/tablero.js) es del núcleo, y quien sabe leer los papeles
// oficiales es el módulo Papeles (modulos/papeles/). Si el tablero importara del módulo, borrar el
// módulo rompería el tablero, y la regla de modulos/LEEME.md es justo la contraria: los módulos
// dependen del núcleo, nunca al revés.
//
// La solución es darle la vuelta: aquí hay un hueco. Si el módulo Papeles está puesto, lo rellena al
// cargarse. Si no está, `hayLector()` devuelve false y la app sigue igual que siempre, solo que sin
// ofrecer la lectura.
//
// Lo usa:  js/tablero.js (al adjuntar un archivo)
// Lo llena: modulos/papeles/papeles.js

let lector = null;

/**
 * Lo llama el módulo que sepa leer papeles.
 * @param {(file: File, pista?: string) => Promise<{ nombre: string, leer: () => void } | null>} fn
 *   Recibe el archivo (y, si se sabe, para qué campo es) y devuelve cómo se llama el papel y qué
 *   hacer para leerlo.
 */
export const registrarLector = fn => { lector = typeof fn === 'function' ? fn : null; };

/** ¿Hay alguien que sepa leer papeles ahora mismo? */
export const hayLector = () => !!lector;

/**
 * ¿Este archivo es un papel conocido?
 * @param {string} [pista] para qué es (p. ej. el nombre del campo del tablero)
 * @returns {Promise<{ nombre, leer } | null>} null si no hay lector o no lo reconoce.
 */
export async function reconocer(file, pista = '') {
  if (!lector || !file) return null;
  try {
    return await lector(file, pista);
  } catch (err) {
    console.warn('🔎 No se pudo mirar el archivo:', err);
    return null;
  }
}
