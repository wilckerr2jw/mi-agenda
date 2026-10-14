// 📄 S-140 · «Programa para la reunión de entre semana»
//
// Lee el S-140 en **Word (.docx)**, que es como lo reparte la sucursal y como llega por mensaje.
// (El S-140 ya impreso en PDF lo lee `js/programa-s140.js`, desde Congregación → Programa → Subir
// un PDF. Son dos caminos distintos para el mismo papel: este es el del archivo original.)
//
// Lo que produce NO son tareas: son semanas del programa (`data.programa`), que es donde la app ya
// las sabe mostrar, compartir e imprimir. En cuanto se guardan, «Te toca…» y los avisos funcionan solos.
//
// Para dejar de leer este papel: borra este archivo y pon `hecho: false` en registro.js.

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MES_RE = MESES.join('|');

// Las claves son las mismas que usa js/programa.js, para que las semanas encajen con lo que ya hay
const CLAVES = {
  1: 'tesoros', 2: 'perlas', 3: 'lectura',
  4: 'm4', 5: 'm5', 6: 'm6', 7: 'm7',     // Seamos mejores maestros: cada parte, la suya
  8: 'v8', 9: 'v9',                        // Nuestra vida cristiana
  10: 'estudio',
};

const sinTildes = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const limpiar = t => String(t || '').replace(/\s+/g, ' ').trim();
const pad = n => String(n).padStart(2, '0');

// El lector separa las celdas con dos espacios (ver lector.js)
const celdas = linea => String(linea || '').split(/\s{2,}/).map(c => c.trim());

const esHuecoPlantilla = t => /^\[.*\]$/.test(limpiar(t)) || /^\[nombre/i.test(limpiar(t));
const esEtiqueta = c => /:$/.test(c);
const ES_SECCION = /^(tesoros de la biblia|seamos mejores maestros|nuestra vida cristiana)/;

// ───────────── La fecha de cada semana ─────────────
// En el Word viene como «7-13 de diciembre», «1 de diciembre» o, ya impreso, «08-12-2026».
// Se devuelve el PRIMER día de la semana, que es como la app guarda el programa.

export function fechaDeSemana(texto, hoy = new Date().toISOString().slice(0, 10)) {
  const t = sinTildes(texto);
  const anioHoy = Number(hoy.slice(0, 4));
  const mesHoy = Number(hoy.slice(5, 7));

  // 08-12-2026 o 08/12/2026
  const d1 = t.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/);
  if (d1) return armar(Number(d1[3]), Number(d1[2]), Number(d1[1]));

  // «7-13 de diciembre» → el 7. Va ANTES que el caso suelto: si no, «5-11 de octubre» daría el 11.
  const d3 = t.match(new RegExp(String.raw`\b(\d{1,2})\s*[-–—]\s*\d{1,2}\s+de\s+(${MES_RE})`));
  if (d3) {
    const mes = MESES.indexOf(d3[2]) + 1;
    return armar(anioDe(mes, anioHoy, mesHoy), mes, Number(d3[1]));
  }

  // «26 de octubre–1 de noviembre» o «1 de diciembre» → manda el primero que aparezca
  const d2 = t.match(new RegExp(String.raw`\b(\d{1,2})\s+de\s+(${MES_RE})`));
  if (d2) {
    const mes = MESES.indexOf(d2[2]) + 1;
    return armar(anioDe(mes, anioHoy, mesHoy), mes, Number(d2[1]));
  }
  return '';
}

// Sin año escrito: el de hoy, salvo que el mes ya haya pasado hace rato (entonces es del que viene)
const anioDe = (mes, anioHoy, mesHoy) => (mes < mesHoy - 1 ? anioHoy + 1 : anioHoy);

function armar(anio, mes, dia) {
  if (!(anio > 2000 && mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31)) return '';
  const iso = `${anio}-${pad(mes)}-${pad(dia)}`;
  const d = new Date(`${iso}T12:00:00`);
  return d.getDate() === dia && d.getMonth() + 1 === mes ? iso : '';
}

// ───────────── Una parte ─────────────

/** «4. Seamos amigos de la gente (3 mins.)» → { n: 4, titulo: 'Seamos amigos de la gente' } */
function tituloDe(c) {
  const m = limpiar(c).match(/^(\d{1,2})[.)]\s*(.+)$/);
  if (!m) return null;
  const titulo = m[2].replace(/\s*\(\s*\d+\s*mins?\.?\s*\)\s*$/i, '').trim();
  return { n: Number(m[1]), titulo };
}

/**
 * De una fila saca a quién le toca. En las partes con sala auxiliar vienen dos nombres y, según el
 * encabezado del papel («Sala auxiliar | Auditorio principal»), el ÚLTIMO es el del auditorio.
 * @returns {{ principal: string, auxiliar: string }}
 */
function nombresDe(cs, desde) {
  const nombres = cs.slice(desde).map(limpiar).filter(c => c && !esEtiqueta(c) && !esHuecoPlantilla(c));
  if (!nombres.length) return { principal: '', auxiliar: '' };
  if (nombres.length === 1) return { principal: nombres[0], auxiliar: '' };
  return { principal: nombres[nombres.length - 1], auxiliar: nombres[0] };
}

// ───────────── Contrato del registro ─────────────

export default {
  id: 's140',
  nombre: 'S-140 · Programa de la reunión de entre semana',
  resumen: 'Las semanas con sus partes y a quién le toca cada una. Léelo del Word original.',
  listo: true,

  reconoce(lineas) {
    const todo = sinTildes(lineas.join(' '));
    let puntos = 0;
    if (/programa (para|de) la reunion de entre semana/.test(todo)) puntos += 0.6;
    if (/s-?140/.test(todo)) puntos += 0.3;
    if (/lectura semanal de la biblia/.test(todo)) puntos += 0.2;
    if (/tesoros de la biblia/.test(todo)) puntos += 0.15;
    if (/seamos mejores maestros/.test(todo)) puntos += 0.15;
    return Math.min(1, puntos);
  },

  leer(lineas) {
    const semanas = [];
    const dudas = [];
    let actual = null;
    let seccion = '';

    const cerrar = () => {
      if (!actual) return;
      const s = actual;
      actual = null;
      if (!s.parts.some(p => p.by)) return;            // una semana sin nadie asignado no aporta nada
      if (!s.date) { dudas.push({ texto: s.fechaCruda || '(semana sin fecha)', porque: 'No entendí la fecha de esa semana del S-140.' }); return; }
      semanas.push(s);
    };
    const poner = (k, t, by) => { if (actual && by) actual.parts.push({ k, t, by }); };

    lineas.forEach(linea => {
      const cs = celdas(linea);
      const plano = sinTildes(limpiar(linea));
      if (!plano) return;

      // Encabezado de sección (y de paso dice si esa semana tiene sala auxiliar)
      if (ES_SECCION.test(sinTildes(cs[0] || ''))) { seccion = sinTildes(cs[0]); return; }

      // Empieza una semana: «[FECHA] | LECTURA SEMANAL DE LA BIBLIA   Presidente:   NOMBRE»
      if (/lectura semanal de la biblia/.test(plano)) {
        cerrar();
        const fechaCruda = limpiar((cs[0] || '').split('|')[0]);
        actual = { id: '', date: fechaDeSemana(fechaCruda), kind: 'semana', parts: [], fechaCruda };
        const { principal } = nombresDe(cs, 1);
        poner('presi', 'Presidencia', principal);
        return;
      }
      if (!actual) return;

      // Consejero de la sala auxiliar
      if (/consejero de la sala auxiliar/.test(plano)) {
        poner('consejero', 'Consejero de la sala auxiliar', nombresDe(cs, 1).principal);
        return;
      }

      // Canción con oración: la primera es la inicial, la última la final
      if (/\boracion\s*:/.test(plano)) {
        const { principal } = nombresDe(cs, cs.findIndex(c => /oracion\s*:/i.test(sinTildes(c))) + 1);
        const yaHayInicial = actual.parts.some(p => p.k === 'ora1');
        poner(yaHayInicial ? 'ora2' : 'ora1', yaHayInicial ? 'Oración final' : 'Oración inicial', principal);
        return;
      }

      // Partes numeradas (1 a 10)
      const idx = cs.findIndex(c => tituloDe(c));
      if (idx < 0) return;
      const { n, titulo } = tituloDe(cs[idx]);
      const etiqueta = cs.findIndex((c, i) => i > idx && esEtiqueta(c));
      const { principal, auxiliar } = nombresDe(cs, etiqueta >= 0 ? etiqueta + 1 : idx + 1);
      const k = CLAVES[n] || `p${n}`;
      poner(k, titulo, principal);
      if (auxiliar) poner(`${k}-aux`, `${titulo} (sala auxiliar)`, auxiliar);
      // El estudio bíblico trae «Conductor/Lector: UNO / OTRO»
      if (n === 10 && principal.includes('/')) {
        const [cond, lect] = principal.split('/').map(x => x.trim());
        actual.parts = actual.parts.filter(p => p.k !== 'estudio');
        poner('estudio', 'Estudio bíblico de la congregación', cond);
        poner('lector', 'Lector del estudio', lect);
      }
      if (seccion && n >= 1) seccion = seccion;   // (la sección no cambia la clave; se deja por claridad)
    });
    cerrar();

    const fechas = semanas.map(s => s.date).sort();
    const periodo = (fechas[0] || new Date().toISOString().slice(0, 10)).slice(0, 7);
    const m = Number(periodo.slice(5, 7)) - 1;

    return {
      periodo,
      titulo: semanas.length === 1 ? `S-140 · 1 semana` : `S-140 · ${semanas.length} semanas de ${MESES[m]}`,
      tareas: [],   // este papel no crea tareas: llena el programa, y de ahí salen los avisos solos
      dudas,
      registros: semanas.length ? [{
        coleccion: 'programa',
        items: semanas.map(({ fechaCruda, ...s }) => s),
        resumen: semanas.length === 1
          ? `1 semana del programa (${semanas[0].parts.length} partes)`
          : `${semanas.length} semanas del programa, con ${semanas.reduce((a, s) => a + s.parts.length, 0)} partes en total`,
      }] : [],
    };
  },
};
