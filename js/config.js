// ─────────────────────────────────────────────────────────────
//  CONFIGURACIÓN DE FIREBASE
//
//  1. Entra a https://console.firebase.google.com y crea un proyecto.
//  2. Configuración del proyecto → "Tus apps" → agrega una app Web (</>).
//  3. Copia aquí los valores de "firebaseConfig".
//
//  Mientras el apiKey empiece con "PEGA", la app funciona en MODO LOCAL:
//  los datos se guardan solo en este teléfono (sin cuenta ni sincronización).
// ─────────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey: "AIzaSyCPlKLH4IIMh6Q-13aN4gRUn6pzGEHFgas",
  authDomain: "mi-agenda-app-855f1.firebaseapp.com",
  projectId: "mi-agenda-app-855f1",
  storageBucket: "mi-agenda-app-855f1.firebasestorage.app",
  messagingSenderId: "1051733184146",
  appId: "1:1051733184146:web:ea8fa999e9249e04cc604b"
};

// Versión del SDK de Firebase que se descarga (y queda guardada para uso sin conexión).
export const FIREBASE_VERSION = '12.19.0';

// Avisos en el teléfono (notificaciones). Se saca en la consola de Firebase:
// Configuración del proyecto → Cloud Messaging → Certificados push web → «Generar par de claves».
// Copia la clave pública aquí. Mientras diga «PEGA…», la opción de avisos no aparece.
export const VAPID_KEY = 'PEGA_AQUI_LA_CLAVE_VAPID';
