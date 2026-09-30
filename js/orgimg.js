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
    const head = M.deptHeadsLabeled(n.d).join(', '), helpers = M.deptHelpers(n.d);
    ctx.font = font(500, 20);
    const box = M.isGroupBox(n.d);
    const headL = wrap(ctx, box ? 'Pertenecen a la congregación' : head ? `★ ${head}` : 'Sin responsable', w - 40);
    const helpL = helpers.length ? wrap(ctx, `Ayudan: ${helpers.join(', ')}`, w - 40) : [];
    const h = 22 + nameL.length * 30 + headL.length * 26 + helpL.length * 26 + 16;
    const row = { n, depth, x, w, h, nameL, headL, helpL, head: !!head || box, parentRow };
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
    const tint = r.depth === 0 ? accent : r.depth === 1 ? '#3E8A80' : '#75828F';
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

// Descarga la imagen (en el teléfono abre «Compartir», desde ahí se guarda en Galería o Archivos)
export function downloadOrg() {
  if (!M.deptTree().length) return toast('Primero agrega departamentos');
  if (window.Capacitor?.isNativePlatform?.()) { toast('Elige «Guardar» o tu Galería para descargarla'); return shareOrg(); }
  drawOrg().toBlob(blob => {
    if (!blob) return toast('No se pudo crear la imagen');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `organigrama-${today()}.png`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Imagen descargada');
  }, 'image/png');
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

// ───── Versión para imprimir en hoja carta (2 hojas, letra grande) ─────
// Hoja 1: organigrama (cada departamento en su caja, con sus subdepartamentos adentro, y los grupos en cuadrícula).
// Hoja 2: ancianos, siervos ministeriales y precursores. Si algo no cabe, la letra se achica sola hasta 13 pt.
const escH = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function printOrg() {
  const Nat = window.Capacitor?.isNativePlatform?.();
  if (Nat) return toast('Para imprimir o sacar PDF abre la app en la computadora. Desde el teléfono usa «Compartir imagen».');
  const cg = M.profile().congre || {};
  const tree = M.deptTree();
  const all = []; const collect = n => { all.push(n); n.children.forEach(collect); }; tree.forEach(collect);
  const gNode = all.find(n => M.isGroupBox(n.d));
  const cuerpo = all.find(n => M.isCuerpo(n.d)), comite = all.find(n => M.isComite(n.d));
  const has = d => M.deptHeads(d).length || M.deptHelpers(d).length;
  // Hoja 1 (horizontal): arriba el Cuerpo de ancianos y el Comité; abajo 4 columnas con los departamentos que tienen a alguien
  const COLS = [
    { t: 'Coordinación', k: ['coord'], re: /^coordinador del cuerpo/i },
    { t: 'Secretaría', k: ['secre'], re: /^secretario$/i },
    { t: 'Servicio', k: ['serv'], re: /^superintendente de servicio$/i },
    { t: 'Reuniones y mantenimiento', k: ['vym', 'atalaya', 'mant'], re: /vida y ministerio|la atalaya|mantenimiento/i },
  ].map(c => ({ ...c, cards: [] }));
  const card = d => { const h = M.deptHeadsLabeled(d), a = M.deptHelpers(d); return `<div class="card"><div class="cn">${escH(d.name)}</div>${h.length ? `<div class="ch">${escH(h.join(', '))}</div>` : ''}${a.length ? `<div class="ca">${a.length > 1 ? 'Ayudan' : 'Ayuda'}: ${escH(a.join(', '))}</div>` : ''}</div>`; };
  const flat = (n, out) => { if (M.isGroupBox(n.d) || M.isCuerpo(n.d) || M.isComite(n.d)) return; if (has(n.d)) out.push(card(n.d)); n.children.forEach(c => flat(c, out)); };
  const colOf = d => COLS.find(c => c.k.includes(d.sk) || c.re.test(d.name || ''));
  const shortest = () => COLS.reduce((a, b) => (b.cards.length < a.cards.length ? b : a));
  // Las ramas bajo el Cuerpo (o sueltas) van a su columna; las que no encajan, a la columna más corta
  const roots = [...(cuerpo ? cuerpo.children : []), ...tree.filter(n => n !== cuerpo), ...(comite ? comite.children : [])].filter(n => n !== comite && n !== cuerpo);
  roots.forEach(n => { if (M.isGroupBox(n.d)) return; const tmp = []; flat(n, tmp); if (tmp.length) (colOf(n.d) || shortest()).cards.push(...tmp); });
  const bigBox = (n, t) => { if (!n) return ''; const h = M.deptHeadsLabeled(n.d), a = M.deptHelpers(n.d); return `<div class="big"><div class="bt">${escH(t)}</div><div>${escH(h.join(' • ')) || '—'}</div>${a.length ? `<div class="ba">Ayudantes: ${escH(a.join(', '))}</div>` : ''}</div>`; };
  const grupos = gNode && gNode.children.length ? `<div class="gtit">Grupos para el servicio del campo</div><div class="grp">${gNode.children.map((c, i) => `<div class="g"><b>${escH(c.d.name || `Grupo ${i + 1}`)}</b><div>${escH(M.deptHeads(c.d).join(' / ') || '—')}</div></div>`).join('')}</div>` : '';
  const cgLine = [[cg.name, cg.number ? `(${cg.number})` : ''].filter(Boolean).join(' '), cg.circuit].filter(Boolean).join(' — ');
  const reun = [cg.midweek, cg.weekend].filter(Boolean).join(' | ');
  const rost = ['anc', 'sm', 'pr', 'pe', 'pa'].map(k => ({ r: M.ROSTERS.find(x => x.k === k), l: M.roster(k) })).filter(x => x.r && (x.l.length || !['pe', 'pa'].includes(x.r.k)));
  // Los precursores auxiliares cambian cada mes: salen solo si marcas la casilla (se recuerda)
  let withPA = false; try { withPA = localStorage.getItem('org-print-pa') === '1'; } catch {}
  const mes = new Date().toLocaleDateString('es', { month: 'long', year: 'numeric' });
  const meet = [cg.midweek ? `<span><b>Entre semana:</b> ${escH(cg.midweek)}</span>` : '', cg.weekend ? `<span><b>Fin de semana:</b> ${escH(cg.weekend)}</span>` : '', cg.address ? `<span><b>Salón:</b> ${escH(cg.address)}</span>` : ''].filter(Boolean).join('');
  const cg2 = cgLine.replace(' — ', ' · ');
  // Colores elegidos por ti (se recuerdan): uno principal y otro para los grupos; los tonos claros salen solos
  const PAL = [{ n: 'Verde', p: '#1D5F5A', g: '#4E9A5B' }, { n: 'Azul', p: '#1F4E8C', g: '#3A8FB7' }, { n: 'Vino', p: '#7A2E3A', g: '#B5763C' }, { n: 'Morado', p: '#4B3A7A', g: '#7A6BB8' }, { n: 'Gris', p: '#3B4652', g: '#7A8794' }];
  let col = PAL[0]; try { col = { ...PAL[0], ...JSON.parse(localStorage.getItem('org-print-col') || '{}') }; } catch {}
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Organigrama · hoja carta</title><style>
    @page horiz{size:letter landscape;margin:9mm} @page vert{size:letter portrait;margin:11mm}
    :root{--c2:${col.p};--c1:color-mix(in srgb,var(--c2) 78%,#000);--c3:color-mix(in srgb,var(--c2) 9%,#fff);--c4:color-mix(in srgb,var(--c2) 38%,#fff);--g:${col.g};--g1:color-mix(in srgb,var(--g) 45%,#fff);--g2:color-mix(in srgb,var(--g) 8%,#fff)}
    *{box-sizing:border-box} body{margin:0;background:#e9ece8;font-family:Arial,"Helvetica Neue",system-ui,sans-serif;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .page{background:#fff;margin:10mm auto;overflow:hidden;display:flex;flex-direction:column}
    .fit{flex:1;overflow:hidden;display:flex;flex-direction:column}
    .land{page:horiz;width:259mm;height:190mm}
    .port{page:vert;width:193.9mm;height:256mm}
    /* Hoja 1 */
    .hdr{background:var(--c1);color:#fff;display:flex;justify-content:space-between;align-items:flex-end;padding:.45em .8em}
    .hdr h1{margin:0;font-size:1.75em;letter-spacing:.01em} .hdr .s{font-weight:700;font-size:.9em;margin-top:.1em} .hdr .r{text-align:right;font-weight:700;font-size:.9em}
    .tops{display:flex;gap:1.2em;justify-content:center;padding:.6em .8em 0}
    .big{flex:1;max-width:48%;border:2px solid var(--c1);background:var(--c3);border-radius:10px;padding:.35em .6em;text-align:center;line-height:1.3;font-size:.9em}
    .bt{font-weight:800;color:var(--c1);text-transform:uppercase;font-size:1.1em;margin-bottom:.1em} .ba{font-size:.9em;color:#333}
    .tree{height:1.3em;margin:0 12.5%;border-bottom:2px solid var(--c4);position:relative} .tree:before{content:"";position:absolute;left:50%;top:0;height:100%;border-left:2px solid var(--c4)}
    .cols{display:grid;grid-template-columns:repeat(4,1fr);gap:.55em;padding:0 .8em;align-items:start}
    .col{display:flex;flex-direction:column;gap:.35em;position:relative;padding-top:.7em} .col:before{content:"";position:absolute;left:50%;top:0;height:.7em;border-left:2px solid var(--c4)}
    .ct{background:var(--c2);color:#fff;font-weight:800;text-align:center;text-transform:uppercase;border-radius:6px;padding:.3em .2em;font-size:.85em}
    .card{border:1.5px solid var(--c4);border-radius:7px;padding:.25em .45em;line-height:1.25;break-inside:avoid}
    .cn{font-weight:800;color:var(--c1);font-size:.88em} .ch{font-weight:600;font-size:.95em} .ca{font-size:.82em;color:#333}
    .gtit{font-weight:800;color:var(--c1);text-transform:uppercase;padding:.5em .8em .25em;font-size:.95em;margin-top:auto}
    .grp{display:grid;grid-template-columns:repeat(auto-fit,minmax(8em,1fr));gap:.35em;padding:0 .8em}
    .g{border:1.5px solid var(--g1);background:var(--g2);border-radius:6px;padding:.2em .4em;font-size:.85em;line-height:1.25} .g b{color:var(--c1)}
    .foot{text-align:right;color:#666;font-size:8.5pt;padding:.3em .8em .2em}
    /* Hoja 2 (nombramientos) */
    .top{text-align:center;border-bottom:3px solid var(--c2);padding-bottom:.25em;margin-bottom:.45em}
    .top h1{font-size:1.45em;margin:0;color:var(--c2);letter-spacing:.02em;text-transform:uppercase}
    .cg{font-size:1.05em;font-weight:800;margin-top:.1em} .meet{font-size:.8em;display:flex;gap:1.2em;justify-content:center;flex-wrap:wrap;margin-top:.15em}
    .ros{border:2px solid var(--c2);border-radius:10px;padding:.35em .6em .45em;margin-bottom:.6em;break-inside:avoid}
    .ros h2{margin:0 0 .3em;font-size:1.15em;display:flex;justify-content:space-between;color:var(--c2);text-transform:uppercase;letter-spacing:.04em} .ros h2 span{background:var(--c2);color:#fff;border-radius:99px;padding:0 .6em;font-size:.85em}
    .names{columns:2;column-gap:1.4em} .names div{break-inside:avoid;padding:.12em 0;border-bottom:1px solid #e3e6e1;font-size:1.05em;font-weight:600}
    .names.c3{columns:3} .none{color:#777;font-style:italic}
    .cols-pick{display:inline-flex;gap:6px;align-items:center;margin-left:12px} .sw{width:22px!important;height:22px;padding:0!important;margin:0!important;border-radius:50%!important;border:2px solid #fff!important} .cols-pick input{width:34px;height:24px;border:0;padding:0;vertical-align:middle}
    .bar{position:sticky;top:0;background:var(--c1);color:#fff;padding:10px;text-align:center;font:600 15px system-ui;z-index:5} .bar button{font:700 15px system-ui;padding:8px 18px;margin-left:10px;border-radius:8px;border:0;cursor:pointer}
    .measure .gtit{margin-top:0!important}
    @media print{body{background:#fff} .bar{display:none} .page{margin:0} .land{break-after:page;page-break-after:always}}
    </style></head><body>
    <div class="bar">Hoja 1 horizontal y hoja 2 vertical, tamaño carta ${rost.some(x => x.r.k === 'pa') ? `<label style="margin-left:12px"><input type="checkbox" id="pa" ${withPA ? 'checked' : ''}> Incluir precursores auxiliares del mes</label>` : ''} <span class="cols-pick">Colores: ${PAL.map(x => `<button type="button" class="sw" title="${x.n}" style="background:${x.p}" data-p="${x.p}" data-g="${x.g}"></button>`).join('')} <label>Principal <input type="color" id="cp" value="${col.p}"></label> <label>Grupos <input type="color" id="cg" value="${col.g}"></label></span> <button onclick="print()">🖨 Imprimir / Guardar PDF</button></div>
    <section class="page land"><div class="fit">
      <div class="hdr"><div><h1>ORGANIGRAMA DE LA CONGREGACIÓN</h1>${cgLine ? `<div class="s">${escH(cgLine)}</div>` : ''}</div><div class="r">${reun ? `Reuniones: ${escH(reun)}` : ''}</div></div>
      <div class="tops">${bigBox(cuerpo, 'Cuerpo de ancianos')}${bigBox(comite, 'Comité de Servicio de la Congregación')}</div>
      ${cuerpo || comite ? '<div class="tree"></div>' : ''}
      <div class="cols">${COLS.map(c => `<div class="col"><div class="ct">${escH(c.t)}</div>${c.cards.join('')}</div>`).join('')}</div>
      ${grupos}</div><div class="foot">Página 1 de 2 · Actualizado el ${fmtShort(today())} · Mi Agenda Teocrática</div></section>
    <section class="page port"><div class="fit"><div class="top"><h1>Nombramientos de la congregación</h1>${cg2 ? `<div class="cg">${escH(cg2)}</div>` : ''}${meet ? `<div class="meet">${meet}</div>` : ''}</div>
      ${rost.map(({ r, l }) => `<div class="ros${r.k === 'pa' ? ' pa' : ''}"><h2>${escH(r.k === 'pa' ? `${r.n} · ${mes}` : r.n)} <span>${l.length}</span></h2>${l.length ? `<div class="names${l.length > 24 ? ' c3' : ''}">${l.map(p => `<div>${escH(p.name)}</div>`).join('')}</div>` : '<div class="none">Nadie anotado todavía</div>'}</div>`).join('')}</div>
      <div class="foot">Página 2 de 2 · Actualizado el ${fmtShort(today())} · Mi Agenda Teocrática</div></section>
    <script>
      // Letra grande (15 pt en la hoja 1 y 16 pt en la 2); si algo no cabe se achica poco a poco (mínimo 9 y 13 pt)
      // Se mide lo que ocupa el contenido (scrollHeight nunca es menor que la caja, por eso no sirve para esto)
      function fit(){document.body.classList.add('measure');document.querySelectorAll('.page').forEach(function(pg){var land=pg.classList.contains('land'),f=pg.querySelector('.fit'),s=land?15:16,min=land?9:13;var used=function(){var l=f.lastElementChild;return l?l.getBoundingClientRect().bottom-f.getBoundingClientRect().top:0};pg.style.fontSize=s+'pt';f.style.zoom='';while(used()>f.clientHeight-8&&s>min){s-=.5;pg.style.fontSize=s+'pt';}if(used()>f.clientHeight-8){f.style.zoom=((f.clientHeight-10)/used()).toFixed(3);}});document.body.classList.remove('measure');}
      function pa(){var c=document.getElementById('pa'),on=c&&c.checked;document.querySelectorAll('.ros.pa').forEach(function(e){e.style.display=on?'':'none'});try{opener&&opener.localStorage.setItem('org-print-pa',on?'1':'0')}catch(e){}fit();}
      function setCol(p,g){var r=document.documentElement.style;r.setProperty('--c2',p);r.setProperty('--g',g);document.getElementById('cp').value=p;document.getElementById('cg').value=g;try{opener&&opener.localStorage.setItem('org-print-col',JSON.stringify({p:p,g:g}))}catch(e){}}
      document.querySelectorAll('.sw').forEach(function(b){b.onclick=function(){setCol(b.dataset.p,b.dataset.g)}});
      document.getElementById('cp').oninput=function(){setCol(this.value,document.getElementById('cg').value)};
      document.getElementById('cg').oninput=function(){setCol(document.getElementById('cp').value,this.value)};
      var cb=document.getElementById('pa');if(cb)cb.onchange=pa;pa();
      setTimeout(function(){fit();print();},400);
    <\/script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) return toast('Permite las ventanas emergentes para imprimir');
  w.document.write(html); w.document.close();
}
