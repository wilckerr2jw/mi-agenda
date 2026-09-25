// Tema de colores: automático (sigue al teléfono), claro u oscuro.
// La elección se guarda en el teléfono y se aplica con el atributo data-theme de <html>.

const KEY = 'miagenda.tema';
const COLORS = { light: '#EEF1EC', dark: '#0E1618' };   // color de la barra del navegador
const mq = window.matchMedia('(prefers-color-scheme: dark)');

export function pref() {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'auto'; }
  catch { return 'auto'; }
}

// Tema que se está viendo realmente ('light' o 'dark')
export const resolved = () => { const p = pref(); return p === 'auto' ? (mq.matches ? 'dark' : 'light') : p; };

function apply() {
  const p = pref();
  if (p === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = p;
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
    if (!m.dataset.orig) m.dataset.orig = m.content;
    m.content = p === 'auto' ? m.dataset.orig : COLORS[p];
  });
}

export function set(p) {
  try { if (p === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, p); } catch { /* sin almacenamiento */ }
  apply();
}

// Cambia entre claro y oscuro respecto a lo que se está viendo
export const toggle = () => set(resolved() === 'dark' ? 'light' : 'dark');

// ───── Color de la app y tamaño de letra (por teléfono) ─────
export const ACCENTS = [
  { id: '', n: 'Verde', c: '#1D5F5A' },
  { id: 'azul', n: 'Azul', c: '#2B5C9E' },
  { id: 'vino', n: 'Vino', c: '#8A2D45' },
  { id: 'morado', n: 'Morado', c: '#5E4A9E' },
  { id: 'terracota', n: 'Terracota', c: '#A5522A' },
];
export const SIZES = [{ id: '', n: 'Normal' }, { id: 'l', n: 'Grande' }, { id: 'xl', n: 'Muy grande' }];
const get = k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const put = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* sin almacenamiento */ } };
export const accent = () => get('miagenda.acento');
export const size = () => get('miagenda.letra');
function applyLook() {
  const d = document.documentElement.dataset;
  if (accent()) d.accent = accent(); else delete d.accent;
  if (size()) d.size = size(); else delete d.size;
}
export function setAccent(v) { put('miagenda.acento', v); applyLook(); }
export function setSize(v) { put('miagenda.letra', v); applyLook(); }

export function init(onChange) {
  applyLook();
  apply();
  mq.addEventListener?.('change', () => { apply(); onChange?.(); });
}
