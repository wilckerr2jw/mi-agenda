// Dibuja el organigrama de la congregación en una imagen PNG para enviarla por WhatsApp o guardarla.
// Cada departamento es una caja; los que dependen de él van debajo, con sangría y una línea que los une.
import * as M from './model.js';
import { toast, fmtShort, today } from './util.js';

const cssColor = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#1D5F5A';
const font = (w, s) => `${w} ${s}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

function wrap(ctx, text, width) {
  const words = String(text).split(/\s+/); const lines = []; let cur = '';
  words.forEach(w => { const t = cur ? `${cur} ${w}` : w; if (ctx.measureText(t).width > width && cur) { lines.push(cur); cur = w; } else cur = t; });
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

export function drawOrg(title = 'Organigrama de la congregación') {
  const W = 1200, PAD = 40, IND = 56, GAP = 14, top = 150;
  const accent = cssColor('--primary');
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  // Aplana el árbol con su nivel y calcula el alto de cada caja
  const rows = [];
  const walk = (n, depth, parentRow) => {
    const x = PAD + depth * IND, w = W - x - PAD;
    ctx.font = font(700, 24); const nameL = wrap(ctx, n.d.name, w - 40);
    const head = M.deptHead(n.d), helpers = M.deptHelpers(n.d);
    ctx.font = font(500, 20);
    const headL = wrap(ctx, head ? `★ ${head}` : 'Sin responsable', w - 40);
    const helpL = helpers.length ? wrap(ctx, `Ayudan: ${helpers.join(', ')}`, w - 40) : [];
    const h = 22 + nameL.length * 30 + headL.length * 26 + helpL.length * 26 + 16;
    const row = { n, depth, x, w, h, nameL, headL, helpL, head: !!head, parentRow };
    rows.push(row);
    n.children.forEach(ch => walk(ch, depth + 1, row));
  };
  M.deptTree().forEach(n => walk(n, 0, null));
  let y = top;
  rows.forEach(r => { r.y = y; y += r.h + GAP; });
  const H = Math.max(y + 60, 320);
  c.width = W; c.height = H;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  // Encabezado
  ctx.fillStyle = accent; ctx.fillRect(PAD, PAD, W - PAD * 2, 70);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = font(700, 32);
  ctx.fillText(title, W / 2, PAD + 46);
  ctx.textAlign = 'left';
  // Líneas que unen cada caja con la de arriba
  ctx.strokeStyle = '#b9c4bd'; ctx.lineWidth = 3;
  rows.forEach(r => {
    if (!r.parentRow) return;
    const px = r.parentRow.x + 22, py = r.parentRow.y + r.parentRow.h;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, r.y + 30); ctx.lineTo(r.x, r.y + 30); ctx.stroke();
  });
  // Cajas
  rows.forEach(r => {
    const tint = r.depth === 0 ? accent : r.depth === 1 ? '#3D6FB6' : '#75828F';
    ctx.fillStyle = r.depth === 0 ? '#eaf3f1' : '#f6f8f6';
    ctx.strokeStyle = tint; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 14); ctx.fill(); ctx.stroke();
    ctx.fillStyle = tint; ctx.fillRect(r.x, r.y + 10, 6, r.h - 20);
    let yy = r.y + 38;
    ctx.fillStyle = '#17282A'; ctx.font = font(700, 24);
    r.nameL.forEach(l => { ctx.fillText(l, r.x + 24, yy); yy += 30; });
    ctx.font = font(500, 20); ctx.fillStyle = r.head ? '#1D5F5A' : '#9A5B0C';
    r.headL.forEach(l => { ctx.fillText(l, r.x + 24, yy - 4); yy += 26; });
    ctx.fillStyle = '#4B5E5F';
    r.helpL.forEach(l => { ctx.fillText(l, r.x + 24, yy - 4); yy += 26; });
  });
  ctx.fillStyle = '#888'; ctx.font = font(500, 16); ctx.textAlign = 'right';
  ctx.fillText(`Actualizado el ${fmtShort(today())} · Mi Agenda Teocrática`, W - PAD, H - 24);
  return c;
}

// Comparte la imagen (WhatsApp, etc.) o la descarga si el teléfono no puede compartir archivos
export function shareOrg() {
  if (!M.deptTree().length) return toast('Primero agrega departamentos');
  const c = drawOrg();
  c.toBlob(async blob => {
    if (!blob) return toast('No se pudo crear la imagen');
    const file = new File([blob], `organigrama-${today()}.png`, { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Organigrama' }); return; }
    } catch (e) { if (e?.name === 'AbortError') return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Imagen descargada');
  }, 'image/png');
}
