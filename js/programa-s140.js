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
// Renglones que no son del programa: el pie de pagina, la fecha de impresion y el encabezado que
// se repite en cada hoja. «Impreso el 06-10-2026» traia una fecha y abria una semana fantasma.
const BASURA = /(^s-140|^impreso el\b|programa (para|de) la reuni[oó]n)/i;
const ETIQUETAS = /^(presidente|presidencia|oraci[oó]n|estudiante(\s*\/\s*ayudante)?|ayudante|lector|conductor|orador|discurso)\s*:?$/i;
// La misma lista, pero cuando el nombre viene pegado: «Estudiante: MARIO GUZMAN».
// Sirve para saber dónde empieza la columna de la derecha aunque el trozo no sea solo la etiqueta.
const ETIQUETA_INICIO = /^(presidente|presidencia|oraci[oó]n|estudiante(\s*\/\s*ayudante)?|ayudante|lector|conductor|orador|discurso)\s*:/i;

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
    if (ETIQUETA_INICIO.test(s.t) || ETIQUETAS.test(s.t.replace(/:$/, '') + ':') || (pareceNombre(s.t) && s.x > ancho * 0.35)) xs.push(s.x);
  }));
  if (xs.length >= 3) {
    xs.sort((a, b) => a - b);
    // El menor de los habituales, con un pelo de margen: así no se corta una etiqueta larga
    return Math.max(ancho * 0.38, xs[Math.floor(xs.length * 0.1)] - 6);
  }
  return ancho * 0.52;
}

// ¿El renglón trae solo la etiqueta («Estudiante/Ayudante:»), sin ningún nombre detrás?
const esEtiquetaSola = t => ETIQUETAS.test(String(t || '').trim());
// ¿Y este trae solo un nombre a la derecha, sin parte a la izquierda?
const soloNombre = f => !!f && !f.izq && !!f.der && !esEtiquetaSola(f.der) && pareceNombre(f.der);

// Cuando el nombre no cabe en su renglón, el PDF lo reparte entre el de arriba y el de abajo, y en
// el de la parte deja solo la etiqueta. Así se ve «JHOSUA HERNANDEZ / OPNIEL» encima de la parte y
// «RAMIREZ» debajo. Aquí se vuelven a juntar y los renglones sueltos se quitan.
function unirNombresPartidos(filas) {
  const fuera = new Set();
  filas.forEach((f, i) => {
    if (!f.izq || !esEtiquetaSola(f.der)) return;
    const trozos = [];
    [i - 1, i + 1].forEach(j => {          // primero el de arriba: ahí empieza el nombre
      if (fuera.has(j) || !soloNombre(filas[j])) return;
      trozos.push(filas[j].der);
      fuera.add(j);
    });
    if (trozos.length) f.der = `${f.der} ${trozos.join(' ')}`.replace(/\s*\/\s*/g, ' / ').replace(/\s+/g, ' ').trim();
  });
  return filas.filter((_, i) => !fuera.has(i));
}

// Cada hoja pone la columna de la derecha donde le cabe: depende de lo largos que sean los nombres
// de esa semana. En un mismo PDF se han visto en 318, 337, 357 y 360, así que el corte no puede ser
// uno solo para todo: se corta la lista por semanas y cada una calcula el suyo.
function partirEnSemanas(ls) {
  const bloques = [[]];
  ls.forEach(l => {
    const t = texto(l.segs || []);
    if (fechaDe(t) && !BASURA.test(t)) bloques.push([]);
    bloques[bloques.length - 1].push(l);
  });
  return bloques.filter(b => b.length);
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

// Limpia el texto de la parte: se le quita la hora del principio y la viñeta.
// Algunos programas repiten el número («1. 1. La esperanza es clave…»): se deja uno solo.
function limpiarParte(t) {
  return String(t).replace(/^\s*\d{1,2}:\d{2}\s*/, '').replace(/^[•·*-]\s*/, '')
    .replace(/^(\d{1,2})\.\s*\1\.\s*/, '$1. ').replace(/\s+/g, ' ').trim();
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
  // Un bloque corto (el encabezado del documento) no da para calcular su corte: usa el de todo
  const filas = partirEnSemanas(ls).flatMap(b => {
    const corte = calcularCorte(b.length >= 6 ? b : ls);
    return unirNombresPartidos(b.map(l => partirRenglon(l, corte)));
  });
  const semanas = [];
  let actual = null, seccion = '', i = 0;

  const cerrar = () => { if (actual && actual.parts.length) semanas.push(actual); };

  filas.forEach(({ izq, der }) => {
    i++;
    const todo = `${izq} ${der}`.trim();
    if (!todo || BASURA.test(todo)) return;

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

    // Las canciones no llevan a nadie: no cuentan como «parte sin asignar»
    const cancion = /^CANCION/.test(norm(parte));

    // La oración va impresa en el mismo renglón que la canción («06:00 · Canción 33 | Oración:
    // GABRIEL MADERA»), pero es otra parte: ese hermano ora, no canta.
    if (esNombre && /^ORACION$/.test(norm(etiqueta)) && !/^ORACION/.test(norm(parte))) {
      actual.parts.push({ k: claveDe(izq, i), t: parte, by: '', time: hora, sec: seccion, label: '', asig: !cancion });
      actual.parts.push({ k: `oracion${i}`, t: 'Oración', by: nombres, time: '', sec: seccion, label: 'Oración', asig: true });
      return;
    }

    actual.parts.push({
      k: claveDe(izq, i),
      t: parte,
      by: esNombre ? nombres : '',
      time: hora,
      sec: seccion,
      label: etiqueta && esNombre ? etiqueta : '',
      asig: !cancion,
    });
  });
  cerrar();
  return semanas;
}
