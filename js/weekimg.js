// Dibuja la semana (como el calendario impreso) en una imagen PNG para enviarla por WhatsApp o guardarla.
import * as M from './model.js';
import { fmtTime, fmtShort, DIAS, parseISO, cap, toast } from './util.js';

// Convierte «var(--c-estudio)» en su color real
const cssColor = v => { const m = /var\((--[^)]+)\)/.exec(v || ''); return m ? getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || '#1D5F5A' : v || '#1D5F5A'; };

function wrap(ctx, text, width) {
  const words = String(text).split(/\s+/); const lines = []; let cur = '';
  words.forEach(w => { const t = cur ? `${cur} ${w}` : w; if (ctx.measureText(t).width > width && cur) { lines.push(cur); cur = w; } else cur = t; });
  if (cur) lines.push(cur);
  return lines;
}

export function drawWeek(monday, title = 'Calendario semanal') {
  const g = M.weekGrid(monday);
  const W = 1600, HW = 150, CW = (W - HW - 40) / 7, PAD = 20, LINE = 24;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = (w, s) => `${w} ${s}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.font = font(600, 18);
  // Alto de cada fila según el texto que lleva
  const rowH = g.rows.map(r => Math.max(56, ...r.cells.map(list => list.reduce((h, x) => h + wrap(ctx, x.item.title, CW - 24).length * LINE + (x.item.endTime ? 20 : 0) + 14, 12))));
  const top = 176, H = top + rowH.reduce((a, b) => a + b, 0) + 60;
  c.width = W; c.height = H;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  // Encabezado
  const accent = cssColor('var(--primary)');
  ctx.fillStyle = accent; ctx.fillRect(PAD, PAD, W - PAD * 2, 64);
  ctx.fillStyle = '#fff'; ctx.font = font(700, 30); ctx.textAlign = 'center';
  ctx.fillText(title.toUpperCase(), W / 2, PAD + 43);
  ctx.fillStyle = '#555'; ctx.font = font(500, 18);
  ctx.fillText(`${fmtShort(g.days[0])} – ${fmtShort(g.days[6])}`, W / 2, PAD + 92);
  // Días
  ctx.font = font(700, 18);
  g.days.forEach((iso, i) => {
    const x = PAD + HW + i * CW;
    ctx.fillStyle = accent; ctx.fillRect(x + 2, top - 40, CW - 4, 36);
    ctx.fillStyle = '#fff'; ctx.fillText(`${cap(DIAS[parseISO(iso).getDay()]).toUpperCase()} ${Number(iso.slice(8))}`, x + CW / 2, top - 16);
  });
  ctx.fillStyle = accent; ctx.fillRect(PAD, top - 40, HW - 4, 36);
  ctx.fillStyle = '#fff'; ctx.fillText('HORA', PAD + HW / 2, top - 16);
  // Filas
  let y = top;
  g.rows.forEach((r, ri) => {
    const h = rowH[ri];
    ctx.fillStyle = ri % 2 ? '#f6f7f5' : '#ffffff'; ctx.fillRect(PAD, y, W - PAD * 2, h);
    ctx.fillStyle = '#333'; ctx.font = font(600, 17); ctx.textAlign = 'right';
    ctx.fillText(r.time ? fmtTime(r.time) : 'Sin hora', PAD + HW - 16, y + 32);
    r.cells.forEach((list, ci) => {
      let yy = y + 8; const x = PAD + HW + ci * CW;
      list.forEach(it => {
        ctx.font = font(600, 18);
        const lines = wrap(ctx, it.item.title, CW - 24);
        const bh = lines.length * LINE + (it.item.endTime ? 20 : 0) + 8;
        const col = cssColor(it.color);
        ctx.globalAlpha = 0.16; ctx.fillStyle = col; ctx.fillRect(x + 4, yy, CW - 8, bh); ctx.globalAlpha = 1;
        ctx.fillStyle = col; ctx.fillRect(x + 4, yy, 5, bh);
        ctx.fillStyle = '#1b1b1b'; ctx.textAlign = 'left';
        lines.forEach((l, li) => ctx.fillText(l, x + 16, yy + 22 + li * LINE));
        if (it.item.endTime) { ctx.font = font(500, 14); ctx.fillStyle = '#666'; ctx.fillText(`hasta ${fmtTime(it.item.endTime)}`, x + 16, yy + 18 + lines.length * LINE); }
        yy += bh + 6;
      });
    });
    ctx.strokeStyle = '#e3e6e1'; ctx.beginPath(); ctx.moveTo(PAD, y + h); ctx.lineTo(W - PAD, y + h); ctx.stroke();
    y += h;
  });
  ctx.fillStyle = '#888'; ctx.font = font(500, 14); ctx.textAlign = 'right';
  ctx.fillText('Mi Agenda Teocrática', W - PAD, H - 22);
  return c;
}

// Comparte la imagen (WhatsApp, etc.) o la descarga si el teléfono no puede compartir archivos
export function shareWeek(monday) {
  const c = drawWeek(monday);
  c.toBlob(async blob => {
    if (!blob) return toast('No se pudo crear la imagen');
    const file = new File([blob], `semana-${monday}.png`, { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Calendario semanal' }); return; }
    } catch (e) { if (e?.name === 'AbortError') return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Imagen descargada');
  }, 'image/png');
}
