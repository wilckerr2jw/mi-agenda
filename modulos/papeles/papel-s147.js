// 📄 S-147 · «Anuncios y recordatorios»
//
// Lee la hoja del mes y saca todos los puntos, de todos los apartados, con su fecha si la traen.
//
// Para dejar de leer este papel: borra este archivo. El registro se da cuenta y sigue sin él.

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MES_RE = MESES.join('|');

// ───────────── Reconocer la hoja ─────────────

// Encabezado: «S-147-26.10-S» o «Anuncios y recordatorios octubre de 2026»
const CABECERA = new RegExp(String.raw`^\s*(S[\s.\-]?147[\s.\-]?\d{2}[.\-]\d{2}\S*|Anuncios\s+y\s+recordatorios(\s+\w+\s+de\s+\d{4})?)\s*$`, 'i');
// El mes, solo en su renglón: «octubre de 2026»
const PERIODO = new RegExp(String.raw`^\s*(${MES_RE})\s+de\s+(\d{4})\s*$`, 'i');
// El mes, esté donde esté
const PERIODO_SUELTO = new RegExp(String.raw`(${MES_RE})\s+de\s+(\d{4})`, 'i');
// Cada punto: «3. Recuerden que…»
const PUNTO = /^\s*(\d{1,2})[.)]\s+(.*)$/;
// Fechas dentro del texto: «el 18 de octubre», «del 3 al 5 de abril de 2027»
const FECHA = new RegExp(String.raw`\b(\d{1,2})\s+de\s+(${MES_RE})(?:\s+de\s+(\d{4}))?`, 'gi');
// Horas: «a las 19:30», «a las 7 p. m.»
const HORA = /\b(?:a\s+las\s+)?([01]?\d|2[0-3])[:.]([0-5]\d)\b|\ba\s+las\s+(\d{1,2})\s*(a|p)\.?\s?m\.?/i;

// ───────────── Apartados (a quién le toca cada punto) ─────────────

export const APARTADOS = [
  { id: 'coordinador',    n: 'Coordinador del cuerpo de ancianos', re: /coordinador/i },
  { id: 'secretario',     n: 'Secretario',                         re: /\bsecretari[oa]\b/i },
  { id: 'superintendente', n: 'Superintendente de servicio',       re: /superintendente\s+de\s+servicio/i },
  { id: 'comite',         n: 'Comité de Servicio',                 re: /comit[eé]\s+de\s+servicio/i },
  { id: 'ancianos',       n: 'Cuerpo de ancianos',                 re: /\bancianos?\b/i },
  { id: 'siervos',        n: 'Siervos ministeriales',              re: /siervos?\s+ministeriales?/i },
  { id: 'grupo',          n: 'Superintendentes de grupo',          re: /superintendentes?\s+de\s+grupo/i },
  { id: 'congregacion',   n: 'Toda la congregación',               re: /congregaci[oó]n|publicadores|todos\b/i },
];
const APARTADO_OTRO = { id: 'otro', n: 'Sin apartado', re: null };

export const apartado = id => [...APARTADOS, APARTADO_OTRO].find(a => a.id === id) || APARTADO_OTRO;

// Un renglón es título de apartado si es corto, no es un punto numerado, nombra a alguien
// conocido y además está escrito como encabezado: «Para el secretario», «A los ancianos»,
// «Anuncios para la congregación» o cualquier cosa que acabe en dos puntos.
const ENCABEZADO = /^(anuncios\s+)?(para|a)\s+(el|la|los|las|todos?|todas?)\b/i;
function esApartado(linea) {
  const t = linea.trim();
  if (!t || t.length > 90 || PUNTO.test(t)) return null;
  if (!ENCABEZADO.test(t) && !/:$/.test(t)) return null;
  const encontrado = APARTADOS.find(a => a.re.test(t));
  return encontrado ? encontrado.id : null;
}

// ───────────── Utilidades ─────────────

const pad = n => String(n).padStart(2, '0');
const limpiar = s => String(s || '').replace(/\s+/g, ' ').trim();
const sinAcentos = s => limpiar(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Clave estable: el mismo punto, en el mismo mes y apartado, da siempre la misma clave.
// Así, al volver a cargar la hoja, se reconoce lo que ya estaba en vez de duplicarlo.
function clave(periodo, apartadoId, texto) {
  const base = `${periodo}|${apartadoId}|${sinAcentos(texto).replace(/[^a-z0-9 ]/g, '')}`;
  let h = 5381;
  for (let i = 0; i < base.length; i++) h = ((h * 33) ^ base.charCodeAt(i)) >>> 0;
  return `s147-${periodo}-${apartadoId}-${h.toString(36)}`;
}

function mesDe(linea) {
  const m = linea.match(PERIODO) || linea.match(PERIODO_SUELTO);
  if (!m) return null;
  const i = MESES.indexOf(m[1].toLowerCase());
  return i < 0 ? null : `${m[2]}-${pad(i + 1)}`;
}

// Primera fecha que aparezca en el texto, en formato YYYY-MM-DD
function fechaDe(texto, periodo) {
  FECHA.lastIndex = 0;
  const m = FECHA.exec(texto);
  if (!m) return '';
  const dia = Number(m[1]);
  const mes = MESES.indexOf(m[2].toLowerCase()) + 1;
  if (!mes || dia < 1 || dia > 31) return '';
  // Si la hoja no dice el año, se toma el del mes de la hoja; y si el mes es anterior al de la
  // hoja, es del año siguiente (una hoja de diciembre que habla de enero).
  let anio = m[3] ? Number(m[3]) : Number(periodo.slice(0, 4));
  if (!m[3] && mes < Number(periodo.slice(5, 7))) anio += 1;
  const iso = `${anio}-${pad(mes)}-${pad(dia)}`;
  const d = new Date(`${iso}T12:00:00`);
  return d.getDate() === dia && d.getMonth() + 1 === mes ? iso : '';
}

function horaDe(texto) {
  const m = texto.match(HORA);
  if (!m) return '';
  if (m[1] != null) return `${pad(m[1])}:${m[2]}`;
  let h = Number(m[3]);
  if (m[4].toLowerCase() === 'p' && h < 12) h += 12;
  if (m[4].toLowerCase() === 'a' && h === 12) h = 0;
  return h >= 0 && h <= 23 ? `${pad(h)}:00` : '';
}

// Título corto para la tarea: la primera frase, sin pasarse de largo
function tituloDe(texto) {
  const t = limpiar(texto);
  const corte = t.search(/[.;:]\s/);
  let titulo = corte > 18 ? t.slice(0, corte) : t;
  if (titulo.length > 90) titulo = `${titulo.slice(0, 87).replace(/[\s,;]+\S*$/, '')}…`;
  return titulo;
}

// ───────────── Contrato del registro ─────────────

export default {
  id: 's147',
  nombre: 'S-147 · Anuncios y recordatorios',
  resumen: 'Todos los puntos del mes, repartidos por apartado, con su fecha y su hora.',
  listo: true,

  reconoce(lineas) {
    let puntos = 0;
    let cabecera = false;
    let mes = false;
    for (const l of lineas) {
      if (CABECERA.test(l)) cabecera = true;
      else if (PERIODO.test(l)) mes = true;
      if (PUNTO.test(l)) puntos++;
    }
    if (!cabecera && !/anuncios y recordatorios/i.test(lineas.join(' '))) return 0;
    // La cabecera ya es señal fuerte; el mes y los puntos numerados la confirman.
    return Math.min(1, (cabecera ? 0.6 : 0.35) + (mes ? 0.2 : 0) + (puntos >= 3 ? 0.2 : puntos * 0.06));
  },

  leer(lineas) {
    const periodo = lineas.map(mesDe).find(Boolean) || new Date().toISOString().slice(0, 7);
    const tareas = [];
    const dudas = [];
    let apartadoActual = 'otro';
    let actual = null;

    const cerrar = () => {
      if (!actual) return;
      const texto = limpiar(actual.texto);
      actual = null;
      if (texto.length < 8) { if (texto) dudas.push({ texto, porque: 'El punto quedó demasiado corto para entenderlo.' }); return; }
      const due = fechaDe(texto, periodo);
      tareas.push({
        clave: clave(periodo, apartadoActual, texto),
        titulo: tituloDe(texto),
        apartado: apartadoActual,
        apartadoNombre: apartado(apartadoActual).n,
        due,
        dueTime: due ? horaDe(texto) : '',
        texto,
      });
    };

    lineas.forEach(linea => {
      const l = String(linea || '');
      if (!l.trim()) { cerrar(); return; }
      if (CABECERA.test(l) || PERIODO.test(l)) { cerrar(); return; }

      const nuevoApartado = esApartado(l);
      if (nuevoApartado) { cerrar(); apartadoActual = nuevoApartado; return; }

      const p = l.match(PUNTO);
      if (p) { cerrar(); actual = { texto: p[2] }; return; }

      // Continuación del punto anterior (los puntos del S-147 ocupan varios renglones)
      if (actual) { actual.texto += ` ${l.trim()}`; return; }

      // Texto suelto que no cuelga de ningún punto: solo molesta si parece una instrucción
      const t = limpiar(l);
      if (t.length > 25 && /\b(recuerden|recuérdese|deben|debe|hay que|se enviará|se celebrará|no olviden)\b/i.test(t)) {
        dudas.push({ texto: t, porque: 'Parece un aviso, pero no venía numerado en la hoja.' });
      }
    });
    cerrar();

    const m = Number(periodo.slice(5, 7)) - 1;
    return {
      periodo,
      titulo: `S-147 de ${MESES[m]} de ${periodo.slice(0, 4)}`,
      tareas,
      dudas,
    };
  },
};
