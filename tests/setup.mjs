// Preparación común de las pruebas: lo mínimo del navegador que usan los módulos de la app.
import { register } from 'node:module';

register('./hooks.mjs', import.meta.url);

const mem = new Map();
globalThis.localStorage ??= {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: k => { mem.delete(k); },
};
globalThis.requestAnimationFrame ??= fn => setTimeout(fn, 0);
globalThis.cancelAnimationFrame ??= id => clearTimeout(id);
