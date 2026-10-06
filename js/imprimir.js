// Hoja para imprimir o guardar como PDF. La usan las secciones de Congregación.
//
// Se abre en una pestaña aparte (no toca la app) con un estilo pensado para el papel, y el
// navegador ofrece «Guardar como PDF» en su propia ventana de impresión. Así no hace falta
// cargar ninguna biblioteca para generar PDF.
import { esc, today, fmtShort, toast } from './util.js';
import * as M from './model.js';

const CSS = `
@page { margin: 13mm; }
body { font: 12px/1.45 "Segoe UI", system-ui, sans-serif; color: #111; margin: 0; }
h1, h2 { margin: 0; }
.pr-h { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 14px; }
.pr-h b { font-size: 13px; white-space: nowrap; }
.pr-h h1 { font: 700 19px/1.2 Georgia, "Times New Roman", serif; text-align: right; }
.pr-tabla { width: 100%; border-collapse: collapse; }
.pr-tabla th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #555; border-bottom: 1px solid #999; padding: 5px 6px; }
.pr-tabla td { padding: 6px; border-bottom: 1px solid #ddd; vertical-align: top; }
.pr-tabla td.d { white-space: nowrap; }
.pr-tabla td.g { font-weight: 600; }
.pr-pie { margin-top: 14px; color: #555; font-size: 10px; }
/* Programa de las reuniones: bloques de colores y dos columnas, como el programa impreso */
.pr-sem { break-inside: avoid; page-break-inside: avoid; margin-bottom: 20px; }
.pr-sem > h2 { font: 700 12px/1.3 "Segoe UI", sans-serif; border-bottom: 1.5px solid #111; padding-bottom: 3px; margin-bottom: 4px; display: flex; justify-content: space-between; gap: 12px; }
.pr-sec { background: #4a4a4a; color: #fff; font-weight: 700; padding: 2px 8px; margin: 9px 0 3px; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
.pr-sec.oro { background: #b8860b; }
.pr-sec.vino { background: #8b1d33; }
.pr-fila { display: grid; grid-template-columns: 40px 1fr 175px; gap: 8px; padding: 1.5px 0; align-items: baseline; }
.pr-fila .t { color: #777; font-size: 10px; }
.pr-fila .q b { font-weight: 400; }
.pr-fila .n { font-weight: 600; text-transform: uppercase; font-size: 11px; }
.pr-fila .et { display: block; color: #777; font-size: 9px; font-weight: 400; text-transform: none; }
.pr-fila.cab { color: #555; font-size: 10px; }
@media print { .pr-no { display: none; } }
.pr-no button { font: 600 14px/1 system-ui; padding: 10px 16px; border-radius: 8px; border: 0; background: #1D5F5A; color: #fff; cursor: pointer; }
`;

// titulo = lo que va arriba a la derecha · cuerpo = el HTML ya escapado de la hoja
//
// Se imprime desde un marco oculto dentro de la propia página, no abriendo una ventana nueva:
// así funciona aunque el navegador bloquee las ventanas emergentes. Si el navegador no deja
// imprimir desde ahí, se abre en una pestaña aparte como alternativa.
export function printDoc(titulo, cuerpo = '') {
  const c = M.profile().congre || {};
  const cab = [c.name, c.number ? `(${c.number})` : ''].filter(Boolean).join(' ') || 'Mi congregación';
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
    <title>${esc(titulo)}</title><style>${CSS}</style></head><body>
    <div class="pr-h"><b>${esc(cab)}</b><h1>${esc(titulo)}</h1></div>
    ${cuerpo}
    <p class="pr-pie">Impreso el ${esc(fmtShort(today()))}</p>
    <p class="pr-no"><button onclick="print()">Imprimir o guardar como PDF</button></p>
    </body></html>`;

  const marco = document.createElement('iframe');
  marco.setAttribute('aria-hidden', 'true');
  marco.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  marco.srcdoc = html;
  marco.onload = () => {
    try {
      marco.contentWindow.focus();
      marco.contentWindow.print();
      // Se quita cuando la ventana de impresión ya se cerró
      setTimeout(() => marco.remove(), 60000);
    } catch {
      marco.remove();
      abrirAparte(html);
    }
  };
  document.body.append(marco);
}

// Alternativa: una pestaña aparte (si el navegador tampoco deja, se avisa)
function abrirAparte(html) {
  const w = window.open('', '_blank');
  if (!w) return toast('Permite las ventanas emergentes para poder imprimir');
  w.document.write(html);
  w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* con el botón */ } }, 450);
}
