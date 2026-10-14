// 📄 Lector de papeles · saca el texto de un PDF, de una foto o de un .txt
//
// Todo pasa dentro del teléfono: las bibliotecas vienen con la app (carpeta vendor/) y
// el archivo no se manda a ningún servicio.
//
//   · PDF con texto  → se lee directo (rápido).
//   · PDF escaneado  → cada página se convierte en imagen y se lee con el lector de letras.
//   · Foto           → lector de letras.
//
// Devuelve siempre lo mismo:  { lineas: ['…', '…'], como: 'pdf' | 'pdf-foto' | 'foto' | 'texto', paginas: n }
//
// Nota: las apps de Flutter que analizamos se rinden con los PDF escaneados y te piden
// pegar el texto a mano. Aquí no hace falta.

const vendor = new URL('../../vendor/', import.meta.url).href;
const PDF_URL = vendor + 'pdf/pdf.min.mjs';
const PDF_WORKER = vendor + 'pdf/pdf.worker.min.mjs';
const OCR_URL = vendor + 'ocr/tesseract.min.js';
const OCR_OPTS = {
  workerPath: vendor + 'ocr/worker.min.js',
  corePath: vendor + 'ocr/core',
  langPath: vendor + 'ocr/lang',
  workerBlobURL: false,
};

const MAX_PAGINAS = 12;

export class ErrorLectura extends Error {}

// ───────────── Lector de letras (OCR) ─────────────

function cargarOcr() {
  return new Promise((res, rej) => {
    if (window.Tesseract) return res();
    const s = document.createElement('script');
    s.src = OCR_URL;
    s.onload = res;
    s.onerror = () => rej(new ErrorLectura('No se pudo abrir el lector de letras.'));
    document.head.appendChild(s);
  });
}

async function leerImagen(src, paso) {
  await cargarOcr();
  paso?.('Preparando el lector de letras (la primera vez tarda un poco)…');
  const worker = await window.Tesseract.createWorker('spa', 1, {
    ...OCR_OPTS,
    logger: m => { if (m.status === 'recognizing text') paso?.(`Leyendo… ${Math.round((m.progress || 0) * 100)}%`); },
  });
  try {
    const { data } = await worker.recognize(src);
    return (data.lines || []).map(l => String(l.text || '').replace(/\s+$/, ''));
  } finally {
    await worker.terminate();
  }
}

// ───────────── PDF ─────────────

// Junta en un mismo renglón los trozos que están a la misma altura y los ordena de izquierda a derecha.
// Si entre dos trozos hay un hueco grande, se deja doble espacio: así se nota que son columnas distintas.
function renglones(items) {
  const filas = [];
  items
    .filter(i => i.t.trim())
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .forEach(i => {
      let f = filas.find(f => Math.abs(f.y - i.y) <= Math.max(4, i.h * 0.55));
      if (!f) { f = { y: i.y, items: [] }; filas.push(f); }
      f.items.push(i);
    });
  return filas
    .sort((a, b) => a.y - b.y)
    .map(f => {
      const its = f.items.sort((a, b) => a.x - b.x);
      let txt = '';
      let fin = null;
      its.forEach(i => {
        if (fin !== null) {
          const hueco = i.x - fin;
          txt += hueco > i.h * 1.6 ? '  ' : hueco > i.h * 0.15 ? ' ' : '';
        }
        txt += i.t;
        fin = i.x + i.w;
      });
      return txt.replace(/\s+$/, '');
    });
}

async function leerPdf(file, paso) {
  const pdfjs = await import(PDF_URL);
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER;
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  } catch {
    throw new ErrorLectura('Ese archivo no se pudo abrir como PDF.');
  }
  const total = Math.min(doc.numPages, MAX_PAGINAS);
  const lineas = [];
  let escaneado = true;

  for (let p = 1; p <= total; p++) {
    paso?.(total > 1 ? `Leyendo la página ${p} de ${total}…` : 'Leyendo el archivo…');
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const vp = page.getViewport({ scale: 1 });
    const items = tc.items.map(i => ({
      t: i.str,
      x: i.transform[4],
      y: vp.height - i.transform[5],
      w: i.width,
      h: Math.abs(i.transform[3]) || 10,
    }));
    if (items.filter(i => i.t.trim()).length > 8) {
      escaneado = false;
      lineas.push(...renglones(items));
      continue;
    }
    // Página sin texto: es un escaneo o una foto metida en el PDF
    paso?.(`La página ${p} es una imagen: se va a leer letra por letra…`);
    const v2 = page.getViewport({ scale: 2.2 });
    const c = document.createElement('canvas');
    c.width = v2.width;
    c.height = v2.height;
    await page.render({ canvasContext: c.getContext('2d'), viewport: v2 }).promise;
    lineas.push(...await leerImagen(c, paso));
  }
  return { lineas, como: escaneado ? 'pdf-foto' : 'pdf', paginas: total };
}

// ───────────── Word (.docx) ─────────────
//
// Un .docx es un zip con el texto dentro de word/document.xml. Aquí se saca sin biblioteca: lo único
// que hace falta es descomprimir, y eso ya lo sabe hacer el navegador (DecompressionStream).
//
// Las tablas importan: el S-140 es una tabla, y si se pierden las columnas se pierde quién hace qué.
// Por eso cada celda se separa con dos espacios, igual que hacen los PDF de varias columnas.

const desXml = t => String(t)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

async function leerDocx(file) {
  const xml = await sacarDelZip(await file.arrayBuffer(), 'word/document.xml');
  if (!xml) throw new ErrorLectura('Ese archivo de Word está vacío o dañado.');
  const lineas = [];
  // Cada fila de tabla (w:tr) y cada párrafo suelto (w:p) es un renglón
  for (const m of xml.matchAll(/<w:(tr|p)\b[^>]*>([\s\S]*?)<\/w:\1>/g)) {
    const [, tipo, dentro] = m;
    if (tipo === 'tr') {
      const celdas = [...dentro.matchAll(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g)]
        .map(c => textoDe(c[1]));
      if (celdas.some(Boolean)) lineas.push(celdas.join('  '));
    } else if (!/<w:tc\b/.test(dentro)) {
      // Los párrafos de dentro de una celda ya salieron con su fila
      const t = textoDe(dentro);
      if (t) lineas.push(t);
    }
  }
  if (!lineas.length) throw new ErrorLectura('No encontré texto en ese archivo de Word.');
  return { lineas, como: 'word', paginas: 1 };
}

// Un párrafo o celda: se unen sus trozos <w:t> y los saltos <w:br> se vuelven espacios
const textoDe = frag => desXml(
  frag.replace(/<w:br\b[^>]*\/?>/g, ' ')
    .match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g)?.map(t => t.replace(/<[^>]+>/g, '')).join('') || '',
).replace(/[\u00a0\u2002\u2003\u2009]/g, ' ').replace(/\s+/g, ' ').trim();

// Saca un archivo concreto del zip, sin biblioteca (solo «deflate», que es lo que usa Word)
async function sacarDelZip(buf, ruta) {
  const d = new DataView(buf);
  const u8 = new Uint8Array(buf);
  const nombre = new TextEncoder().encode(ruta);
  // Se recorren las cabeceras locales (PK\x03\x04) buscando la que lleva ese nombre
  for (let i = 0; i < u8.length - 30; i++) {
    if (d.getUint32(i, true) !== 0x04034b50) continue;
    const metodo = d.getUint16(i + 8, true);
    const compLen = d.getUint32(i + 18, true);
    const nomLen = d.getUint16(i + 26, true);
    const extraLen = d.getUint16(i + 28, true);
    const ini = i + 30;
    if (nomLen !== nombre.length || !nombre.every((b, n) => u8[ini + n] === b)) continue;
    const datos = u8.subarray(ini + nomLen + extraLen, ini + nomLen + extraLen + compLen);
    if (metodo === 0) return new TextDecoder('utf-8').decode(datos);           // sin comprimir
    if (metodo !== 8) throw new ErrorLectura('Ese archivo de Word usa una compresión que no sé abrir.');
    const flujo = new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(flujo).text();
  }
  return '';
}

// ───────────── Puerta de entrada ─────────────

const esPdf = f => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name);
const esTexto = f => /^text\//i.test(f.type) || /\.(txt|md|csv)$/i.test(f.name);
const esWord = f => /\.docx$/i.test(f.name) || /wordprocessingml/i.test(f.type);

/**
 * Lee un archivo y devuelve sus renglones de texto.
 * @param {File} file
 * @param {(msg: string) => void} [paso]  para ir contando qué está pasando
 */
export async function leer(file, paso) {
  if (!file) throw new ErrorLectura('No elegiste ningún archivo.');
  if (file.size > 40 * 1024 * 1024) throw new ErrorLectura('Ese archivo pesa demasiado (más de 40 MB).');
  if (esPdf(file)) return leerPdf(file, paso);
  if (esWord(file)) { paso?.('Abriendo el archivo de Word…'); return leerDocx(file); }
  if (esTexto(file)) return { lineas: desdeTexto(await file.text()), como: 'texto', paginas: 1 };
  if (/^image\//i.test(file.type)) return { lineas: await leerImagen(file, paso), como: 'foto', paginas: 1 };
  throw new ErrorLectura('Ese tipo de archivo no se puede leer. Usa un PDF, un Word (.docx), una foto o un texto.');
}

/** Texto pegado a mano, por si el archivo no se deja leer de ninguna manera. */
export const desdeTexto = texto => String(texto || '').split(/\r?\n/).map(l => l.replace(/\s+$/, ''));
