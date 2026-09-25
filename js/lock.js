// Bloqueo con PIN: pide un PIN al abrir la app y al volver a ella tras un rato.
// Es una protección de privacidad en ESTE teléfono (si alguien toma el teléfono desbloqueado); no cifra los datos.
// El PIN no se guarda: solo su huella (SHA-256 con sal), en el almacenamiento del navegador.

const KEY = 'miagenda.pin';
let lastHidden = 0;
let unlocked = false;

const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
export const isEnabled = () => !!read()?.hash;
export const delay = () => Number(read()?.delay) || 0;   // minutos fuera de la app antes de volver a pedirlo

async function digest(pin, salt) {
  const bytes = new TextEncoder().encode(`${salt}:${pin}`);
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function setPin(pin, minutes = 0) {
  const salt = crypto.getRandomValues(new Uint32Array(2)).join('-');
  localStorage.setItem(KEY, JSON.stringify({ hash: await digest(pin, salt), salt, delay: minutes, len: String(pin).length }));
  unlocked = true;
}
export function setDelay(minutes) {
  const v = read(); if (!v) return;
  localStorage.setItem(KEY, JSON.stringify({ ...v, delay: Number(minutes) || 0 }));
}
// ───── Huella / rostro (WebAuthn con el lector del teléfono) ─────
// Se registra una «llave» local en el teléfono; al desbloquear, el teléfono pide la huella y confirma que es la misma.
// Igual que el PIN, es una protección de este teléfono (no reemplaza la sesión ni cifra los datos).
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = str => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
export async function bioAvailable() {
  try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch { return false; }
}
export const bioEnabled = () => !!read()?.bio;
export async function enableBio() {
  const v = read(); if (!v) return false;
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: { name: 'Mi Agenda', id: location.hostname },
    user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'mi-agenda', displayName: 'Mi Agenda' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
    timeout: 60000,
  } });
  if (!cred) return false;
  localStorage.setItem(KEY, JSON.stringify({ ...v, bio: b64(cred.rawId) }));
  return true;
}
export function disableBio() { const v = read(); if (v) { delete v.bio; localStorage.setItem(KEY, JSON.stringify(v)); } }
async function bioUnlock() {
  const v = read(); if (!v?.bio) return false;
  try {
    const ok = await navigator.credentials.get({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: 'public-key', id: unb64(v.bio), transports: ['internal'] }],
      userVerification: 'required', rpId: location.hostname, timeout: 60000,
    } });
    return !!ok;
  } catch { return false; }
}

export function clearPin() { try { localStorage.removeItem(KEY); } catch { /* sin almacenamiento */ } unlocked = true; hide(); }

export const verify = pin => check(pin);
async function check(pin) {
  const v = read();
  return !!v && (await digest(pin, v.salt)) === v.hash;
}

// Pantalla del PIN (teclado numérico grande, cómodo con el pulgar)
function show(onForgot) {
  if (document.getElementById('lock')) return;
  document.body.classList.add('locked');
  const el = document.createElement('div');
  el.id = 'lock';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'App bloqueada');
  el.innerHTML = `<div class="lock-card">
    <h2>Mi Agenda</h2>
    <p class="sub">Escribe tu PIN</p>
    <div class="lock-dots" aria-live="polite"></div>
    <p class="err lock-err" role="alert"></p>
    <div class="lock-keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(k => k === '' ? '<span></span>' : `<button type="button" data-k="${k}" aria-label="${k === '⌫' ? 'Borrar' : k}">${k}</button>`).join('')}</div>
    ${read()?.bio ? '<button type="button" class="btn lock-bio">☝ Usar huella</button>' : ''}
    <button type="button" class="link lock-forgot">Olvidé mi PIN</button>
  </div>`;
  document.body.append(el);
  let pin = '';
  const dots = el.querySelector('.lock-dots');
  const err = el.querySelector('.lock-err');
  const paint = () => { dots.innerHTML = Array.from({ length: Number(read()?.len) || 4 }, (_, i) => `<i class="${i < pin.length ? 'on' : ''}"></i>`).join(''); };
  const tryPin = async () => {
    const len = Number(read()?.len) || 4;
    if (pin.length < len) return;
    if (await check(pin)) { unlocked = true; hide(); }
    else { err.textContent = 'PIN incorrecto'; pin = ''; paint(); navigator.vibrate?.(120); }
  };
  el.addEventListener('click', e => {
    const k = e.target.closest('[data-k]')?.dataset.k;
    if (k !== undefined) {
      err.textContent = '';
      if (k === '⌫') pin = pin.slice(0, -1); else if (pin.length < 6) pin += k;
      paint(); tryPin();
    }
    if (e.target.closest('.lock-forgot')) onForgot?.();
    if (e.target.closest('.lock-bio')) bioUnlock().then(ok => { if (ok) { unlocked = true; hide(); } else err.textContent = 'No se pudo con la huella: usa tu PIN'; });
  });
  el.addEventListener('keydown', e => {
    if (/^\d$/.test(e.key) && pin.length < 6) { err.textContent = ''; pin += e.key; paint(); tryPin(); }
    if (e.key === 'Backspace') { pin = pin.slice(0, -1); paint(); }
  });
  el.tabIndex = -1; el.focus();
  paint();
  if (read()?.bio) setTimeout(() => bioUnlock().then(ok => { if (ok) { unlocked = true; hide(); } }), 300);   // la pide sola al aparecer
}
function hide() { document.getElementById('lock')?.remove(); document.body.classList.remove('locked'); }

// Se llama al abrir la app: pide el PIN si está activado y vigila cuando se sale y se vuelve
export function init(onForgot) {
  if (isEnabled() && !unlocked) show(onForgot);
  document.addEventListener('visibilitychange', () => {
    if (!isEnabled()) return;
    if (document.hidden) { lastHidden = Date.now(); document.body.classList.add('privacy'); return; }
    document.body.classList.remove('privacy');
    if (Date.now() - lastHidden >= delay() * 60000) { unlocked = false; show(onForgot); }
  });
}
