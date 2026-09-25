// Importar notas de Google Keep.
// Google Takeout (takeout.google.com → Keep) entrega un .zip con un archivo .json por nota.
// Aquí se acepta ese .zip directamente, o los .json sueltos.

const usecToIso = u => {
  const ms = Number(u) / 1000;
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : '';
};

const hash = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h.toString(36); };

const isKeep = d => d && typeof d === 'object' && !Array.isArray(d)
  && ('textContent' in d || 'listContent' in d || 'title' in d)
  && ('userEditedTimestampUsec' in d || 'createdTimestampUsec' in d || 'isTrashed' in d);

// Convierte una nota de Keep al formato de la app
function convert(d) {
  const parts = [];
  if (d.textContent && d.textContent.trim()) parts.push(d.textContent.trim());
  if (Array.isArray(d.listContent) && d.listContent.length) {
    parts.push(d.listContent.map(i => `${i.isChecked ? '☑' : '☐'} ${i.text || ''}`).join('\n'));
  }
  const labels = (d.labels || []).map(l => l.name).filter(Boolean);
  if (labels.length > 1) parts.push(`Etiquetas: ${labels.join(', ')}`);

  const title = (d.title || '').trim();
  const body = parts.join('\n\n');
  if (!title && !body) return null;

  const created = usecToIso(d.createdTimestampUsec);
  const edited = usecToIso(d.userEditedTimestampUsec) || created || new Date().toISOString();
  return {
    // id estable: si importas dos veces, no se duplican las notas
    id: 'keep' + (d.createdTimestampUsec || hash(title + body)),
    title, body,
    tag: labels[0] || '',
    pinned: !!d.isPinned,
    createdAt: created || edited,
    updatedAt: edited,
  };
}

async function inflate(raw) {
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

// Lee los .json dentro de un .zip (lector mínimo, sin librerías)
async function unzipJson(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(bytes.buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('zip inválido');

  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = [];
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (!/\.json$/i.test(name) || csize === 0xFFFFFFFF) continue;
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
    const raw = bytes.subarray(start, start + csize);
    if (method === 0) out.push({ name, text: dec.decode(raw) });
    else if (method === 8) out.push({ name, text: await inflate(raw) });
  }
  return out;
}

// Recibe los archivos elegidos y devuelve las notas listas para guardar
export async function readKeep(files) {
  const jsons = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) jsons.push(...await unzipJson(f));
    else if (/\.json$/i.test(f.name)) jsons.push({ name: f.name, text: await f.text() });
  }
  const notes = [];
  const skipped = { trashed: 0, other: 0, attachments: 0 };
  for (const j of jsons) {
    let d;
    try { d = JSON.parse(j.text); } catch { skipped.other++; continue; }
    if (!isKeep(d)) { skipped.other++; continue; }
    if (d.isTrashed) { skipped.trashed++; continue; }
    const n = convert(d);
    if (!n) { skipped.other++; continue; }
    if (Array.isArray(d.attachments) && d.attachments.length) skipped.attachments++;
    notes.push(n);
  }
  return { notes, skipped };
}
