// Dictado por voz: hablas y la app escribe. Cada frase se agrega como una línea nueva
// (en «Acuerdos y notas», cada línea es un acuerdo que luego puedes convertir en tarea).
// En la app de Android usa el reconocedor de voz del teléfono; en la computadora, el del navegador.
import { toast, esc } from './util.js';

let rec = null, recBtn = null;
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
// Idioma del dictado: el del teléfono si es español (es-MX, es-ES…); si no, español de Venezuela
const LANG = (() => { const l = String(navigator.language || ''); return /^es\b/i.test(l) && l.length > 2 ? l : 'es-VE'; })();

function insertLine(el, text) {
  text = cap(String(text || '').trim());
  if (!el || !text) return;
  const v = el.value;
  el.value = v + (v && !v.endsWith('\n') ? '\n' : '') + text;
  el.dispatchEvent(new Event('input', { bubbles: true }));   // actualiza la lista de acuerdos
  el.scrollTop = el.scrollHeight;
}

export const micButton = (target, hint = 'Cada frase que digas se agrega en una línea nueva.') =>
  `<div class="mic-row"><button type="button" class="btn small ghost" data-a="dictate" data-target="${esc(target)}">🎤 Dictar</button><span class="hint">${esc(hint)}</span></div>`;

export async function dictate(btn) {
  const el = document.getElementById(btn.dataset.target);
  if (!el) return;
  const C = window.Capacitor;
  if (C?.isNativePlatform?.()) {
    try {
      const r = await C.Plugins.AgendaWidget.dictate({ lang: LANG, prompt: 'Dicta el acuerdo o la nota' });
      if (r?.text) insertLine(el, r.text); else toast('No te escuché. Toca 🎤 e intenta de nuevo');
    } catch (e) {
      toast(/no-disponible/.test(String(e?.message || e)) ? 'Tu teléfono no tiene reconocimiento de voz. Usa el micrófono del teclado.' : 'Actualiza la app (Ajustes → App de Android) para dictar. Mientras, usa el micrófono del teclado.');
    }
    return;
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return toast('Este navegador no permite dictar. Usa el micrófono de tu teclado o Chrome.');
  if (rec) { rec.stop(); return; }   // segundo toque: detener
  rec = new SR();
  rec.lang = LANG; rec.continuous = true; rec.interimResults = false;
  recBtn = btn; btn.textContent = '⏹ Detener'; btn.classList.add('rec');
  rec.onresult = ev => { for (let i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i].isFinal) insertLine(el, ev.results[i][0].transcript); };
  rec.onerror = ev => { if (ev.error === 'not-allowed') toast('Permite el micrófono para dictar'); else if (ev.error !== 'no-speech' && ev.error !== 'aborted') toast('No se pudo dictar'); };
  rec.onend = () => { rec = null; if (recBtn) { recBtn.textContent = '🎤 Dictar'; recBtn.classList.remove('rec'); } recBtn = null; };
  try { rec.start(); toast('Te escucho… toca «Detener» al terminar'); } catch { rec = null; }
}
export function stopDictation() { try { rec?.stop(); } catch { /* ya se detuvo */ } }
