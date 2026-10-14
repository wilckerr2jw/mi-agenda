// 📄 S-3 · «Informe de asistencia a las reuniones»
//
// La hoja del tablero, con una fila por tipo de reunión y una columna por semana:
//
//                            Primera   Segunda   Tercera   Cuarta   Quinta   Total    Promedio
//   Reunión de entre semana   74/0      66/30                                140/30   70/15
//   Reunión del fin de semana 105/0     53/40                                158/40   79/20
//
// Cada casilla es «los que vinieron al Salón / los que se conectaron», que es justo como la app
// guarda la asistencia (js/asistencia.js: presencial y online por separado). El Total y el Promedio
// no se leen: la app los calcula sola, y así no hay dos verdades.
//
// La fecha: la hoja no la trae, solo «Primera semana», «Segunda»… Se calcula la semana que toca
// dentro del mes, usando el día en que sueles tener esa reunión (se aprende de lo que ya tienes
// anotado). Las fechas se enseñan en la revisión ANTES de guardar, para que las veas y las corrijas
// si no cuadran.

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const sinTildes = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const pad = n => String(n).padStart(2, '0');

// «74/0» → { presencial: 74, online: 0 }. También vale «74» suelto.
const CASILLA = /^(\d{1,4})\s*[/|]\s*(\d{1,4})$|^(\d{1,4})$/;

// Días en que suelen ser las reuniones, si no hay nada anotado de antes
const DIA_POR_DEFECTO = { semana: 3, finde: 0 };   // miércoles y domingo

/** «Mes: Octubre 2026» → '2026-10' */
export function periodoDe(lineas) {
  for (const l of lineas) {
    const m = sinTildes(l).match(new RegExp(`\\b(${MESES.join('|')})\\s+(?:de\\s+)?(\\d{4})\\b`));
    if (m) return `${m[2]}-${pad(MESES.indexOf(m[1]) + 1)}`;
  }
  return '';
}

/**
 * La fecha de la semana N de un mes, cayendo en el día de la semana que se le diga.
 * Ej.: 3ª semana de octubre de 2026 en domingo → la 3ª aparición de un domingo ese mes.
 */
export function fechaDeSemana(periodo, n, diaSemana) {
  const [a, m] = periodo.split('-').map(Number);
  const primero = new Date(Date.UTC(a, m - 1, 1));
  const salto = (diaSemana - primero.getUTCDay() + 7) % 7;
  const dia = 1 + salto + (n - 1) * 7;
  const d = new Date(Date.UTC(a, m - 1, dia));
  return d.getUTCMonth() === m - 1 ? `${a}-${pad(m)}-${pad(dia)}` : '';   // ese mes no tiene esa semana
}

const valorDe = c => { const m = String(c).match(CASILLA); return { p: Number(m?.[1] ?? m?.[3]) || 0, o: Number(m?.[2]) || 0 }; };

/**
 * Quita el Total y el Promedio del final de la fila.
 *
 * No se puede ir por posición: al sacar el texto del PDF las casillas vacías desaparecen, así que
 * «74/0  66/30  140/30  70/15» tiene las mismas cuatro casillas que un mes con cuatro semanas.
 * Lo que sí se puede es comprobarlo: si la penúltima es justo la SUMA de las anteriores, es el Total.
 */
export function sinTotales(celdas) {
  if (celdas.length < 3) return celdas.slice(0, 5);
  const semanas = celdas.slice(0, -2);
  const total = valorDe(celdas[celdas.length - 2]);
  const suma = semanas.reduce((a, c) => { const v = valorDe(c); return { p: a.p + v.p, o: a.o + v.o }; }, { p: 0, o: 0 });
  return (total.p === suma.p && total.o === suma.o) ? semanas : celdas.slice(0, 5);
}

// ───────────── Contrato del registro ─────────────

export default {
  id: 'asistencia',
  nombre: 'S-3 · Informe de asistencia a las reuniones',
  resumen: 'Las semanas del mes con los del Salón y los conectados, por tipo de reunión.',
  listo: true,
  delTablero: /asistencia/i,

  reconoce(lineas) {
    const todo = sinTildes(lineas.join(' '));
    let puntos = 0;
    if (/informe de asistencia a las reuniones/.test(todo)) puntos += 0.7;
    if (/\bs-?3-?s\b/.test(todo)) puntos += 0.2;
    if (/reunion de entre semana/.test(todo) && /reunion del fin de semana/.test(todo)) puntos += 0.2;
    if (/primera semana|segunda semana/.test(todo)) puntos += 0.1;
    return Math.min(1, puntos);
  },

  /**
   * @param {string[]} lineas
   * @param {object} [ctx] { diaDe: kind => número de día de la semana (0-6) } — lo pasa el módulo
   *   con lo que ya tienes anotado; si no viene, se usan miércoles y domingo.
   */
  leer(lineas, ctx = {}) {
    const diaDe = ctx.diaDe || (k => DIA_POR_DEFECTO[k]);
    const periodo = periodoDe(lineas);
    const dudas = [];
    const items = [];

    if (!periodo) {
      return { periodo: new Date().toISOString().slice(0, 7), titulo: 'S-3 · Asistencia', tareas: [], registros: [],
        dudas: [{ texto: lineas.find(l => l.trim()) || '(hoja vacía)', porque: 'No encontré de qué mes es ese informe de asistencia.' }] };
    }

    lineas.forEach(linea => {
      const plano = sinTildes(linea);
      const esSemana = /reunion\s+de\s+entre\s+semana/.test(plano);
      const esFinde = /reunion\s+del\s+fin\s+de\s+semana/.test(plano);
      if (!esSemana && !esFinde) return;
      const kind = esSemana ? 'semana' : 'finde';

      // Las casillas de esa fila, en orden. El Total y el Promedio van al final: se descartan.
      const celdas = linea.split(/\s{2,}|\t|\|/).map(c => c.trim()).filter(Boolean)
        .filter(c => CASILLA.test(c));
      const semanas = sinTotales(celdas);

      semanas.forEach((c, i) => {
        const m = c.match(CASILLA);
        const presencial = Number(m[1] ?? m[3]) || 0;
        const online = Number(m[2]) || 0;
        if (!presencial && !online) return;              // casilla vacía: esa semana no hubo o no se anotó
        const date = fechaDeSemana(periodo, i + 1, diaDe(kind));
        if (!date) {
          dudas.push({ texto: `${kind === 'semana' ? 'Entre semana' : 'Fin de semana'}, semana ${i + 1}: ${c}`, porque: 'Ese mes no llega a esa semana. Revísalo.' });
          return;
        }
        items.push({ id: `as-${date}-${kind}`, date, kind, presencial, online, notes: '' });
      });
    });

    const m = Number(periodo.slice(5, 7)) - 1;
    const total = items.reduce((a, x) => a + x.presencial + x.online, 0);

    return {
      periodo,
      titulo: `S-3 · Asistencia de ${MESES[m]} de ${periodo.slice(0, 4)}`,
      tareas: [],   // no crea tareas: llena la asistencia, de donde salen los promedios
      dudas,
      registros: items.length ? [{
        coleccion: 'asistencia',
        items,
        resumen: `${items.length} ${items.length === 1 ? 'reunión anotada' : 'reuniones anotadas'} (${total} asistentes en total)`,
      }] : [],
    };
  },
};
