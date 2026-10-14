// 📄 Registro de papeles · la lista de los formularios que la app sabe leer
//
// Cada papel vive en su propio archivo `papel-XXX.js`. Para añadir uno nuevo, se crea el
// archivo y se escribe su nombre aquí abajo. Para dejar de usar uno, se borra el archivo:
// el registro se da cuenta de que ya no está y sigue sin él, sin romper nada.
//
// Contrato de un archivo `papel-XXX.js` (exporta un objeto por defecto):
//
//   export default {
//     id: 's147',
//     nombre: 'S-147 · Anuncios y recordatorios',
//     resumen: 'Los puntos del mes, repartidos por apartado.',
//     listo: true,                       // false = todavía no sabe leerlo de verdad
//     delTablero: /limpieza/i,           // opcional: a qué campo del tablero corresponde
//     reconoce(lineas) { return 0..1 },  // ¿es este papel? 0 = no, 1 = segurísimo
//     leer(lineas) {                     // saca lo que hay dentro
//       return {
//         periodo: '2026-10',            // mes al que pertenece (YYYY-MM)
//         titulo: 'S-147 de octubre de 2026',
//         tareas: [{ clave, titulo, apartado, due, dueTime, texto }],
//         dudas:  [{ texto, porque }],   // lo que no se pudo entender (va a «por resolver»)
//         // Opcional: lo que el papel guarda y NO son tareas (el programa, la asistencia…).
//         // Se enseña aparte en la revisión, con su propia casilla para incluirlo o no.
//         registros: [{ coleccion: 'programa', items: [...], resumen: '4 semanas del programa' }],
//       };
//     },
//   }

// Papeles que se intentan cargar, en orden de preferencia.
// El nombre sirve para poder decir «este todavía no» aunque su archivo aún no exista.
// `hecho: true` = su archivo papel-XXX.js ya existe y hay que cargarlo.
// Al terminar el lector de un papel, se pone `hecho: true` y ya está.
const ARCHIVOS = [
  { id: 's147', nombre: 'S-147 · Anuncios y recordatorios', hecho: true },
  { id: 's140', nombre: 'S-140 · Programa de la reunión de entre semana', hecho: true },
  { id: 's21', nombre: 'S-21 · Registro de publicador', hecho: true },
  { id: 'limpieza', nombre: 'Limpieza del Salón del Reino', hecho: true },
  { id: 'asistencia', nombre: 'S-3 · Informe de asistencia a las reuniones', hecho: true },
];

// Señas para reconocer los papeles que TODAVÍA no sabemos leer: sirven para poder decir «esto es
// un S-21, pero aún no sé leerlo» en vez de «no reconozco esta hoja».
//
// Ahora mismo está vacío porque los tres papeles de la lista ya tienen su lector. Al añadir uno
// nuevo con `hecho: false`, se le pone aquí su seña (sin tildes: algunos PDF las traen en un
// carácter aparte, y «REGISTRO DE PUBLICADOR DE LA CONGREGACION» sale así de verdad).
const PISTAS = {};

const sinTildes = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

/** ¿A qué papel de los que aún no leemos se parece esto? Devuelve su nombre, o ''. */
export async function pista(lineas) {
  const todo = sinTildes(lineas.join(' '));
  const falta = await pendientes();
  const hit = falta.find(p => PISTAS[p.id]?.test(todo));
  return hit ? hit.nombre : '';
}

let cache = null;
let faltan = [];

/** Carga los papeles que existan. Los que falten (archivo borrado o aún sin hacer) se saltan. */
export async function papeles() {
  if (cache) return cache;
  const sin = new Set();
  const cargados = await Promise.all(ARCHIVOS.map(async a => {
    if (!a.hecho) { sin.add(a.id); return null; }   // todavía no tiene lector: ni se intenta
    try {
      const mod = await import(`./papel-${a.id}.js`);
      const p = mod.default;
      if (!p?.id || typeof p.reconoce !== 'function' || typeof p.leer !== 'function') {
        console.warn(`📄 El papel «${a.id}» no sigue el contrato; se omite.`);
        sin.add(a.id);
        return null;
      }
      return { listo: true, resumen: '', ...p };
    } catch {
      sin.add(a.id);   // el archivo no está: o aún no se ha hecho, o lo borraste a propósito
      return null;
    }
  }));
  faltan = ARCHIVOS.filter(a => sin.has(a.id));   // en el orden de la lista, no en el que acaben de cargar
  cache = cargados.filter(Boolean);
  return cache;
}

/** Los que ya saben leer de verdad. */
export const listos = async () => (await papeles()).filter(p => p.listo);

/** Los que están en la lista pero todavía no tienen lector. */
export async function pendientes() {
  await papeles();
  return faltan;
}

/**
 * Adivina de qué papel se trata.
 * @returns {{ papel, confianza: number } | null}
 */
export async function reconocer(lineas, pista = '') {
  const puntajes = [];
  for (const papel of await listos()) {
    let n = 0;
    try { n = Number(papel.reconoce(lineas)) || 0; } catch (err) { console.warn(`📄 ${papel.id}:`, err); }
    // Algunos papeles no traen encabezado (el programa de limpieza llega por mensaje, sin nada que
    // lo identifique). Si sabemos a qué campo del tablero lo estás adjuntando, eso ya es media pista.
    if (pista && papel.delTablero?.test(pista)) n = Math.max(n, 0.55) + 0.25;
    if (n > 0) puntajes.push({ papel, confianza: Math.min(1, n) });
  }
  puntajes.sort((a, b) => b.confianza - a.confianza);
  return puntajes[0] || null;
}
