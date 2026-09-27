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
  const cg = M.profile().congre || {};
  const sub1 = [[cg.name, cg.number ? `(${cg.number})` : ''].filter(Boolean).join(' '), cg.circuit].filter(Boolean).join(' · ');
  const sub2 = [cg.midweek ? `Entre semana: ${cg.midweek}` : '', cg.weekend ? `Fin de semana: ${cg.weekend}` : '', cg.address].filter(Boolean).join('   ·   ');
  const extra = (sub1 ? 34 : 0) + (sub2 ? 30 : 0);
  const W = 1200, PAD = 40, IND = 56, GAP = 14, top = 150 + extra;
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
  ctx.fillStyle = '#17282A';
  if (sub1) { ctx.font = font(700, 24); ctx.fillText(sub1, W / 2, PAD + 110); }
  if (sub2) { ctx.font = font(500, 19); ctx.fillStyle = '#4B5E5F'; ctx.fillText(sub2, W / 2, PAD + 110 + (sub1 ? 32 : 0)); }
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

// ───── Versión para imprimir o guardar como PDF (en la computadora) ─────
// Cuadro como el de la sucursal: reuniones, superintendentes y auxiliares, grupos, responsabilidades y nombramientos.
const escH = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function printOrg() {
  const Nat = window.Capacitor?.isNativePlatform?.();
  if (Nat) return toast('Para imprimir o sacar PDF abre la app en la computadora. Desde el teléfono usa «Compartir imagen».');
  const cg = M.profile().congre || {};
  const tree = M.deptTree();
  const flat = []; const walk = (n, depth) => { flat.push({ d: n.d, depth, kids: n.children.length }); n.children.forEach(c => walk(c, depth + 1)); }; tree.forEach(n => walk(n, 0));
  const grupos = flat.find(x => x.d.sk === 'grupos' || /^grupos para el servicio/i.test(x.d.name));
  const all = [];
  const collect = (n) => { all.push(n); n.children.forEach(collect); }; tree.forEach(collect);
  const gNode = all.find(n => n.d === grupos?.d);
  const gIds = new Set(gNode ? gNode.children.map(c => c.d.id) : []);
  const people = d => ({ heads: M.deptHeads(d), helpers: M.deptHelpers(d) });
  const row = (x, cls = '') => { const p = people(x.d); return `<tr class="${cls}"><td style="padding-left:${6 + x.depth * 14}px">${escH(x.d.name)}</td><td>${escH(p.heads.join(', ')) || '<i>—</i>'}</td><td>${escH(p.helpers.join(', '))}</td></tr>`; };
  const rows = flat.filter(x => !gIds.has(x.d.id)).map(x => row(x, x.depth === 0 ? 'top' : x.depth === 1 ? 'lvl1' : '')).join('');
  const gTable = gNode && gNode.children.length ? `<h2>Grupos</h2><table><tr><th>#</th><th>Superintendente</th><th>Auxiliar</th><th>Publicadores</th></tr>${gNode.children.map((c, i) => { const h = M.deptHeads(c.d); return `<tr><td>${escH(c.d.name.replace(/^grupo\s*/i, '') || i + 1)}</td><td>${escH(h[0] || '')}</td><td>${escH(h.slice(1).join(', '))}</td><td>${escH(M.deptHelpers(c.d).join(', '))}</td></tr>`; }).join('')}</table>` : '';
  const rost = M.ROSTERS.map(r => ({ r, l: M.roster(r.k) })).filter(x => x.l.length);
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Organigrama</title><style>
    body{font:13px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#17282A;margin:24px}
    h1{font-size:26px;margin:0 0 4px;border-bottom:2px solid #17282A;padding-bottom:4px} h2{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#4B5E5F;margin:18px 0 6px}
    .box{border:1px solid #ccd;border-radius:6px;padding:8px 12px;text-align:center;font-weight:700;margin:8px 0}
    .meet{display:flex;gap:40px;flex-wrap:wrap} table{border-collapse:collapse;width:100%} td,th{padding:4px 6px;border-bottom:1px solid #e3e6e1;text-align:left;vertical-align:top} th{font-size:12px}
    tr.top td{font-weight:800;background:#eaf3f1} tr.lvl1 td:first-child{font-weight:700} .cols{columns:3;column-gap:24px} .cols div{break-inside:avoid;padding:1px 0}
    .foot{margin-top:18px;text-align:right;color:#888;font-size:11px} @media print{body{margin:10mm}}</style></head><body>
    <h1>Organigrama</h1>
    ${cg.name || cg.circuit ? `<div class="box">${escH([cg.name, cg.number ? `(${cg.number})` : ''].filter(Boolean).join(' '))}${cg.circuit ? ` | ${escH(cg.circuit)}` : ''}</div>` : ''}
    ${cg.midweek || cg.weekend || cg.address ? `<h2>Reuniones</h2><div class="meet">${cg.midweek ? `<div><b>Reunión de entre semana</b><br>${escH(cg.midweek)}</div>` : ''}${cg.weekend ? `<div><b>Reunión del fin de semana</b><br>${escH(cg.weekend)}</div>` : ''}${cg.address ? `<div><b>Dirección</b><br>${escH(cg.address)}</div>` : ''}</div>` : ''}
    <h2>Departamentos y responsabilidades</h2><table><tr><th>Departamento</th><th>Responsables</th><th>Ayudantes</th></tr>${rows}</table>
    ${gTable}
    ${rost.map(({ r, l }) => `<h2>${escH(r.n)} (${l.length})</h2><div class="cols">${l.map(p => `<div>${escH(p.name)}</div>`).join('')}</div>`).join('')}
    <div class="foot">Impreso el ${fmtShort(today())} · Mi Agenda Teocrática</div>
    <script>setTimeout(()=>print(),300)<\/script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) return toast('Permite las ventanas emergentes para imprimir');
  w.document.write(html); w.document.close();
}
