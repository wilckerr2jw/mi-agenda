// 📄 Limpieza del Salón del Reino
//
// Lee las DOS formas en que llega este programa:
//
//   1. La tabla impresa (la del tablero), con una fila por semana y dos columnas:
//        Semana                    | Limpieza ligera        | Limpieza profunda
//        05-10-2026 a 11-10-2026   | Grupo 3                | Grupo 3
//      Las columnas son los tipos que ya maneja la app (js/limpieza.js → TIPOS):
//        «ligera»  = después de cada reunión      «semanal» = la de una vez a la semana
//
//   2. El mensaje suelto («Octubre:» y debajo «8-10 grupo 3»), que ya sabía leer `js/limpieza.js`.
//      Eso no se reescribe: se le pasa tal cual.
//
// Reconocerlo: la tabla se delata sola por los rangos de fechas. El mensaje no tiene encabezado,
// así que ahí manda la pista del campo del tablero (ver `delTablero` y registro.js).

import { leerMensaje, TIPOS } from '../../js/limpieza.js';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const sinTildes = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const limpiar = t => String(t || '').replace(/\s+/g, ' ').trim();
const nombreTipo = k => TIPOS.find(t => t.k === k)?.n || k;

// «05-10-2026 a 11-10-2026» (también vale «al», «/» o un guion largo)
const RANGO = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\s*(?:a|al|–|—|-)\s*(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/;
const iso = (d, m, a) => `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// Una celda con «-», vacía o con un aviso no es un grupo
const SIN_GRUPO = /^[-–—\s.]*$/;
const esGrupo = c => /\bgrupo\b|\bnosotros\b/i.test(c);

/** ¿La hoja viene como tabla impresa? */
export const esTabla = lineas => lineas.filter(l => RANGO.test(l)).length >= 2;

// ───────────── La tabla impresa ─────────────

function leerTabla(lineas) {
  const turnos = [];
  const dudas = [];

  // El encabezado dice en qué orden van las columnas. Si no está, se asume ligera y luego profunda.
  const cab = lineas.find(l => /limpieza\s+ligera/i.test(sinTildes(l)) && /limpieza\s+profunda/i.test(sinTildes(l)));
  let orden = ['ligera', 'semanal'];
  if (cab) {
    const p = sinTildes(cab);
    orden = p.indexOf('ligera') < p.indexOf('profunda') ? ['ligera', 'semanal'] : ['semanal', 'ligera'];
  }

  lineas.forEach(linea => {
    const m = linea.match(RANGO);
    if (!m) return;
    const desde = iso(+m[1], +m[2], +m[3]);
    const hasta = iso(+m[4], +m[5], +m[6]);
    // Lo que va después del rango son las celdas de esa fila
    const resto = linea.slice(linea.indexOf(m[0]) + m[0].length);
    const celdas = resto.split(/\s{2,}|\t|\|/).map(limpiar).filter(c => c !== '');

    const conGrupo = celdas.filter(esGrupo);
    if (!conGrupo.length) {
      // Esa semana no le toca a nadie: puede ser un hueco («-») o un aviso que ocupa toda la fila
      const aviso = celdas.find(c => !SIN_GRUPO.test(c));
      if (aviso) dudas.push({ texto: `${desde}: ${aviso}`, porque: 'Esa semana no trae grupo, trae un aviso. Míralo por si hay que anotar algo.' });
      return;
    }

    // Si la misma celda se repite en las dos columnas, son dos turnos (ligera y semanal)
    celdas.forEach((c, i) => {
      if (!esGrupo(c)) return;
      const tipo = orden[Math.min(i, orden.length - 1)];
      turnos.push({ date: desde, until: hasta, grupoNombre: limpiar(c), tipo, texto: limpiar(c) });
    });
  });

  return { turnos, dudas };
}

// ───────────── Contrato del registro ─────────────

export default {
  id: 'limpieza',
  nombre: 'Limpieza del Salón del Reino',
  resumen: 'La tabla del tablero o el mensaje suelto: llena los turnos de cada grupo.',
  listo: true,
  delTablero: /limpieza/i,

  reconoce(lineas) {
    const texto = sinTildes(lineas.join('\n'));
    const diceLimpieza = /\blimpieza\b/.test(texto);

    // La tabla impresa se reconoce sola
    if (esTabla(lineas)) return Math.min(1, (diceLimpieza ? 0.75 : 0.45) + 0.2);

    // El mensaje suelto: hace falta un mes en su renglón y varios turnos, o se confunde con todo
    const hayMes = lineas.some(l => MESES.includes(sinTildes(l).replace(/[:.]+$/, '').trim()));
    const turnos = (texto.match(/\b\d{1,2}\s*(?:[-–—/]|\s+al\s+)?\s*\d{0,2}\s+(grupo|nosotros|general)/g) || []).length;
    if (!hayMes || !turnos) return 0;
    return Math.min(1, (diceLimpieza ? 0.5 : 0.2) + Math.min(0.4, turnos * 0.12));
  },

  leer(lineas) {
    let turnos;
    let dudas;

    if (esTabla(lineas)) {
      ({ turnos, dudas } = leerTabla(lineas));
    } else {
      // El mensaje de siempre: lo lee js/limpieza.js, que ya sabe de meses, rangos y «nosotros»
      dudas = [];
      turnos = leerMensaje(lineas.join('\n'), { dudas }).map(t => ({ ...t, grupoNombre: '' }));
      turnos.filter(t => !t.groupId && t.tipo !== 'anual').forEach(t => dudas.push({
        texto: `${t.date}: ${t.texto}`,
        porque: 'No reconocí a qué grupo se refiere. Ponlo tú desde Limpieza.',
      }));
    }

    const fechas = turnos.map(t => t.date).sort();
    const periodo = (fechas[0] || new Date().toISOString().slice(0, 10)).slice(0, 7);
    const m = Number(periodo.slice(5, 7)) - 1;

    // El id se arma con la fecha y el tipo: volver a cargar el mismo programa no duplica, pone al día
    const items = turnos.map(t => ({ ...t, id: `lp-${t.date}-${t.tipo}` }));
    const porTipo = [...new Set(items.map(t => t.tipo))].map(k => `${items.filter(t => t.tipo === k).length} ${nombreTipo(k).toLowerCase()}`);

    return {
      periodo,
      titulo: `Limpieza desde ${MESES[m]} de ${periodo.slice(0, 4)}`,
      tareas: [],   // no crea tareas: llena los turnos, donde la app ya los sabe mostrar y compartir
      dudas,
      registros: items.length ? [{
        coleccion: 'limpieza',
        items,
        resumen: `${items.length} ${items.length === 1 ? 'turno' : 'turnos'} de limpieza (${porTipo.join(' · ')})`,
      }] : [],
    };
  },
};
