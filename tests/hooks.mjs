// Ganchos de carga para las pruebas (node --test tests/): reemplazan lo que solo existe en el navegador.
//  · './sheets.js' (pantallas) → un módulo vacío con open/close, para poder probar corregir.js sin DOM.
//  · Cualquier import https: (Firebase desde el CDN) → un módulo vacío.
const STUB_SHEETS = 'data:text/javascript,export const open=()=>{};export const close=()=>{};export const noteSheet=()=>{};export const taskSheet=()=>{};';
const STUB_EMPTY = 'data:text/javascript,export default {};';

export async function resolve(specifier, context, next) {
  if (specifier === './sheets.js' && context.parentURL && !context.parentURL.endsWith('/js/sheets.js')) return { url: STUB_SHEETS, shortCircuit: true };
  if (specifier.startsWith('https:')) return { url: STUB_EMPTY, shortCircuit: true };
  return next(specifier, context);
}
