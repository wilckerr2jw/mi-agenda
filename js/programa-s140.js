// Lector del programa impreso de la reunión de entre semana (S-140) y del fin de semana.
//
// El PDF trae dos columnas: a la izquierda la hora y el nombre de la parte, a la derecha a quién
// le toca (y a veces una etiqueta: «Estudiante:», «Estudiante/Ayudante:», «Presidente:»…).
// El lector de PDF de la app (js/mecas.js) devuelve cada renglón con la posición X de sus trozos,
// así que las dos columnas se pueden separar.
//
// Los nombres vienen en MAYÚSCULAS: eso es lo que más ayuda a distinguirlos del texto de la parte.

// Las bandas de colores del programa impreso
export const SECCIONES = [
  { k: 'tesoros', n: 'TESOROS DE LA BIBLIA', clase: '' },
  { k: 'maestros', n: 'SEAMOS MEJORES MAESTROS', clase: 'oro' },
  { k: 'vida', n: 'NUESTRA VIDA CRISTIANA', clase: 'vino' },
];
// Lo que sale en la columna de la derecha pero NO es el nombre de un hermano
const NO_ES_NOMBRE = /^(auditorio principal|sala auxiliar|sala b|sala c|aula\b)/i;
const ETIQUETAS = /^(presidente|presidencia|oraci[oó]n|estudiante(\s*\/\s*ayudante)?|ayudante|lector|conductor|orador|discurso)\s*:?$/i;

const texto = segs => segs.map(s => s.t).join(' ').replace(/\s+/g, ' ').trim();
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

// ¿Parece el nombre de un hermano? En el programa impreso van en mayúsculas.
// Se admite «JUAN PÉREZ / LUIS GIL» (estudiante y ayudante) y los puntos de las iniciales.
export function pareceNombre(t) {
  const s = String(t || '').trim();
  if (s.length < 3 || s.length > 90) return false;
  if (NO_ES_NOMBRE.test(s)) return false;
  if (!/[A-ZÁÉÍÓÚÑ]/.test(s)) return false;
  // Si trae minúsculas (más allá de preposiciones sueltas), es texto de la parte, no un nombre
  if (/[a-záéíóúñ]{3,}/.test(s.replace(/\b(de|del|la|las|los|y|e)\b/gi, ''))) return false;
  return /^[A-ZÁÉÍÓÚÑÜ.\s/·,-]+$/.test(s);
}

const esSeccion = t => SECCIONES.find(s => norm(t).startsWith(norm(s.n)));

// Fecha del encabezado de cada semana: 08-10-2026, 08/10/2026
function fechaDe(t) {
  const m = String(t).match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (!m) return '';
  const [, d, mes, a] = m;
  const iso = `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && Number(mes) >= 1 && Number(mes) <= 12 && Number(d) >= 1 && Number(d) <= 31 ? iso : '';
}

// Separa cada renglón en «lo de la izquierda» y «lo de la derecha» (etiqueta + nombres).
// corte = la X a partir de la cual empieza la columna de la derecha.
function partirRenglon(linea, corte) {
  const segs = linea.segs || [];
  const izq = [], der = [];
  segs.forEach(s => ((s.x >= corte ? der : izq).push(s)));
  return { izq: texto(izq), der: texto(der) };
}

// Dónde empieza la columna de la derecha: se busca en qué X están las etiquetas y los nombres.
function calcularCorte(lineas) {
  const anchos = lineas.flatMap(l => (l.segs || []).map(s => s.end));
  const ancho = anchos.length ? Math.max(...anchos) : 1000;
  // Las etiquetas («Estudiante:», «Presidente:») marcan el borde de la columna derecha
  const xs = [];
  lineas.forEach(l => (l.segs || []).forEach(s => {
    if (ETIQUETAS.test(s.t.replace(/:$/, '') + ':') || (pareceNombre(s.t) && s.x > ancho * 0.35)) xs.push(s.x);
  }));
  if (xs.length >= 3) {
    xs.sort((a, b) => a - b);
    // El menor de los habituales, con un pelo de margen: así no se corta una etiqueta larga
    return Math.max(ancho * 0.38, xs[Math.floor(xs.length * 0.1)] - 6);
  }
  return ancho * 0.52;
}

// Clave estable de cada parte: el número si lo trae, si no un nombre corto
function claveDe(izq, i) {
  const n = String(izq).match(/^\s*(\d{1,2})\s*[.)]/);
  if (n) return `p${n[1]}`;
  const t = norm(izq);
  if (t.includes('CANCION')) return `cancion${i}`;
  if (t.includes('PALABRAS DE INTRODUCCION')) return 'intro';
  if (t.includes('PALABRAS DE CONCLUSION')) return 'conclusion';
  if (t.includes('ORACION')) return 'oracion';
  return `l${i}`;
}

// Limpia el texto de la parte: se le quita la hora del principio y la viñeta
function limpiarParte(t) {
  return String(t).replace(/^\s*\d{1,2}:\d{2}\s*/, '').replace(/^[•·*-]\s*/, '').replace(/\s+/g, ' ').trim();
}

/**
 * Lee las semanas de un programa impreso.
 * @param {Array} lineas  renglones de js/mecas.js readFile(): { segs: [{ t, x, end }] }
 * @param {string} kind   'semana' o 'finde'
 * @returns {Array} [{ date, kind, lectura, parts: [{ k, t, by, time, sec, label, asig }] }]
 */
export function leerPrograma(lineas, kind = 'semana') {
  const ls = (lineas || []).filter(l => (l.segs || []).length);
  if (!ls.length) return [];
  const corte = calcularCorte(ls);
  const semanas = [];
  let actual = null, seccion = '', i = 0;

  const cerrar = () => { if (actual && actual.parts.length) semanas.push(actual); };

  ls.forEach(l => {
    i++;
    const { izq, der } = partirRenglon(l, corte);
    const todo = `${izq} ${der}`.trim();
    if (!todo) return;

    // ¿Empieza una semana nueva?
    const f = fechaDe(izq) || (izq ? '' : fechaDe(der));
    if (f) {
      cerrar();
      seccion = '';
      actual = { date: f, kind, lectura: limpiarParte(izq).replace(/^.*?\d{4}\s*\|?\s*/, '').trim(), parts: [] };
      // El encabezado puede traer ya al presidente en la misma línea
      if (der && pareceNombre(der.replace(/^[^:]*:\s*/, ''))) {
        actual.parts.push({ k: 'presi', t: 'Presidencia', by: der.replace(/^[^:]*:\s*/, '').trim(), time: '', sec: '', label: 'Presidente', asig: true });
      }
      return;
    }
    if (!actual) return;   // todavía no empezó ninguna semana (encabezado del documento)

    // ¿Es una banda de sección?
    const sec = esSeccion(izq || todo);
    if (sec && !/\d{1,2}:\d{2}/.test(izq)) { seccion = sec.k; return; }

    const hora = (izq.match(/^\s*(\d{1,2}:\d{2})/) || [])[1] || '';
    const etiqueta = (der.match(/^([^:]{3,30}):/) || [])[1] || '';
    const nombres = der.replace(/^[^:]{3,30}:\s*/, '').trim();
    const esNombre = pareceNombre(nombres);
    const parte = limpiarParte(izq);

    // Un renglón suelto de la derecha (p. ej. «Oración: RAMON ARAY» al final) sin parte a la izquierda
    if (!parte && esNombre) {
      actual.parts.push({ k: etiqueta ? norm(etiqueta).toLowerCase().replace(/[^a-z]/g, '') : `l${i}`, t: etiqueta || 'Oración', by: nombres, time: hora, sec: seccion, label: etiqueta, asig: true });
      return;
    }
    if (!parte) return;

    actual.parts.push({
      k: claveDe(izq, i),
      t: parte,
      by: esNombre ? nombres : '',
      time: hora,
      sec: seccion,
      label: etiqueta && esNombre ? etiqueta : '',
      // Las canciones no llevan a nadie: no cuentan como «parte sin asignar»
      asig: !/^CANCION/.test(norm(parte)),
    });
  });
  cerrar();
  return semanas;
}
