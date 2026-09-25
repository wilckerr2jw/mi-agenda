// Utilidades generales: DOM, fechas en español, escape de HTML, iconos y avisos.

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const esc = (s = '') =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 20) : Math.random().toString(36).slice(2, 12) + Date.now().toString(36));

// Icono SVG (los símbolos están definidos en index.html)
export const ic = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

// Círculo de avatar: la foto si hay una guardada, si no el contenido de respaldo (iniciales o un ícono)
export const avatarHtml = (photo, fallback, cls = '') => photo
  ? `<span class="avatar ${cls}"><img src="${esc(photo)}" alt=""></span>`
  : `<span class="avatar ${cls}">${fallback}</span>`;

// Convierte un archivo de imagen a un dataURL JPEG chico (recortado a cuadrado y reducido),
// para poder guardar fotos de perfil sin llenar Firestore de bytes.
export function photoToDataUrl(file, size = 200) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith('image/')) { reject(new Error('No es una imagen')); return; }
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      img.onerror = () => reject(new Error('No se pudo leer la imagen'));
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ---------- Fechas (siempre como texto AAAA-MM-DD, sin zonas horarias) ----------
export const pad = n => String(n).padStart(2, '0');
export const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => toISO(new Date());
export const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const ymd = s => { const [y, m, d] = s.split('-').map(Number); return [y, m - 1, d]; };
export const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
export const diffDays = (a, b) => Math.round((Date.UTC(...ymd(a)) - Date.UTC(...ymd(b))) / 86400000);
export const dateOf = ts => toISO(new Date(ts));

export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

export const dow = iso => cap(DIAS[parseISO(iso).getDay()]);
export const fmtLong = iso => { const d = parseISO(iso); return `${cap(DIAS[d.getDay()])} ${d.getDate()} de ${MESES[d.getMonth()]}`; };
export const fmtShort = iso => { const d = parseISO(iso); return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`; };
export const fmtMonth = (y, m) => `${cap(MESES[m - 1])} ${y}`;

// Hora en formato de 12 horas: "7:00" + "p. m."
export const timeParts = t => {
  if (!t) return null;
  const [h, mi] = t.split(':').map(Number);
  return { h: `${h % 12 || 12}:${pad(mi)}`, ap: h < 12 ? 'a. m.' : 'p. m.' };
};
export const fmtTime = t => { const p = timeParts(t); return p ? `${p.h} ${p.ap}` : ''; };

export const relDays = iso => {
  const n = diffDays(iso, today());
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  if (n === -1) return 'ayer';
  return n > 0 ? `en ${n} días` : `hace ${-n} días`;
};

// ---------- Texto ----------
export const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const initials = name =>
  String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => (w[0] || '').toUpperCase()).join('') || '?';

// ---------- Contacto ----------
export const telLink = phone => `tel:${String(phone).replace(/[^\d+]/g, '')}`;
// Enlace a WhatsApp. Si el número empieza con 0 o tiene 10 dígitos (formato venezolano), añade el 58.
export const waLink = phone => {
  let d = String(phone).replace(/\D/g, '');
  if (d.startsWith('0')) d = '58' + d.slice(1);
  else if (d.length === 10 && d.startsWith('4')) d = '58' + d;
  return `https://wa.me/${d}`;
};

// ---------- Aviso emergente (con acción opcional, p. ej. "Deshacer") ----------
let toastTimer;
export function toast(msg, actionLabel, action, ms = 6000) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.innerHTML = `<span>${esc(msg)}</span>${actionLabel ? `<button type="button" class="toast-a">${esc(actionLabel)}</button>` : ''}`;
  el.classList.add('show');
  el.querySelector('.toast-a')?.addEventListener('click', () => { action?.(); el.classList.remove('show'); });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}
