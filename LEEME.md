# Mi Agenda: guía de puesta en marcha

App para el teléfono (PWA): se abre desde el navegador, se instala en la pantalla de inicio,
funciona sin internet y sincroniza tus datos entre dispositivos con Firebase.

Módulos: **Hoy**, **Agenda** (calendario mensual con eventos que se repiten cada semana),
**Tareas** (con seguimiento y fecha límite), **Personas** (con llamada y WhatsApp),
**Notas / Reuniones importantes** (temas, acuerdos y tareas que salen de cada reunión) y
**Mi Informe** (perfil, metas y registro de tiempo por categoría, al estilo de apps de informe de servicio).
Varias personas pueden usarla, cada una con sus datos, y el administrador asigna el tipo de perfil de cada cuenta.
El tema puede ser automático (según el teléfono) o fijarse en claro/oscuro desde el icono de arriba o Ajustes.

---

## 1. Probarla ya en tu computadora (modo local)

Sin configurar nada, la app funciona en **modo local**: guarda todo en el propio navegador.

```
cd mi-agenda
python3 -m http.server 8080
```

Abre http://localhost:8080. (Si prefieres Node: `npx serve .`)

## 2. Crear el proyecto de Firebase

Te recomiendo un proyecto **nuevo** (por ejemplo `mi-agenda`), separado de FinanzaFlow, para que las reglas de seguridad no se mezclen.

1. Entra a https://console.firebase.google.com y crea el proyecto.
2. **Authentication → Método de acceso** → activa **Correo electrónico/contraseña**.
3. **Firestore Database → Crear base de datos** → modo producción. Región sugerida: `southamerica-east1` (São Paulo).
4. **Configuración del proyecto → Tus apps → Web (`</>`)** → registra la app y copia el bloque `firebaseConfig`.
5. Pégalo en `js/config.js`, reemplazando los valores de ejemplo.

Cuando `apiKey` ya no empiece con `PEGA`, la app pide iniciar sesión y guarda todo en la nube.

## 3. Publicar (HTTPS es obligatorio para instalarla en el teléfono)

Con Firebase Hosting (gratis en el plan Spark):

```
npm install -g firebase-tools
firebase login
firebase use --add            # elige tu proyecto
firebase deploy               # sube la app y las reglas de seguridad
```

`firebase.json` y `firestore.rules` ya vienen listos. Las reglas hacen que **cada cuenta solo pueda leer y escribir sus propios datos**.
Al terminar, Firebase te muestra la dirección (algo como `https://mi-agenda.web.app`).

## 4. Instalar en el teléfono

- **Android (Chrome):** abre la dirección → menú ⋮ → **Instalar app**.
- **iPhone (Safari):** abre la dirección → botón Compartir → **Añadir a pantalla de inicio**.

La primera vez, ábrela con internet: así se guarda todo para usarla sin conexión.
Crea tu cuenta con **Crear cuenta** (correo y contraseña).

## 5. Seguridad recomendada

- Otras personas pueden crear su cuenta, pero **no entran hasta que el administrador les asigna un tipo de perfil** (ver «Varias personas y perfiles» abajo). Si prefieres que nadie más cree cuentas, en **Authentication → Configuración → Acciones del usuario** desactiva **Habilitar creación (registro)**.
- Los datos viajan cifrados y solo tu cuenta puede leerlos, pero no están cifrados de extremo a extremo. Conviene usar **notas breves** y no guardar datos muy delicados de las personas.
- En **Ajustes → Descargar respaldo** (menú ⋯ arriba a la derecha) puedes guardar una copia de todo en un archivo, y restaurarla cuando quieras.

## 6. Si ya usaste el modo local

Todo lo que guardaste en modo local se puede pasar a la nube: en el modo local usa **Ajustes → Descargar respaldo**, luego inicia sesión en la versión con Firebase y usa **Restaurar respaldo**.

---

## Guía de uso para compartir

`guia.html` es la guía práctica para quienes usan la app. Se publica junto con la app, así que puedes compartir
el enlace directo (por ejemplo `https://mi-agenda-app-855f1.web.app/guia.html`), y se abre desde
**Ajustes → Guía de uso**, desde la pantalla de inicio de sesión y desde «Cuenta en revisión». También funciona sin internet.

Dentro de la app hay además una **Guía rápida** (Ajustes → Guía rápida, y se ofrece la primera vez que alguien entra)
que muestra **solo los temas que ese usuario usa**: según su tipo de perfil, si es precursor, si es administrador y
qué secciones tiene visibles. Sus temas están en `js/guide.js` (cada uno con su condición `when`). La guía completa
`guia.html` queda para compartir antes de crear la cuenta y, dentro de la app, solo el administrador ve su enlace.

**Mantenerlas al día:** cada cambio que se note en la app debe reflejarse en `js/guide.js` (versión corta) y en la
sección correspondiente de `guia.html`, junto con la versión y la fecha de la portada (`guia-version`, `guia-fecha`)
y la versión del pie.

## Cómo está organizada (para seguir mejorándola)

| Archivo | Para qué sirve |
|---|---|
| `index.html` | Estructura, iconos y barra de pestañas |
| `guia.html` | Guía completa para compartir (se mantiene al día con cada cambio) |
| `js/guide.js` | Guía rápida dentro de la app, filtrada según el perfil de cada usuario |
| `css/styles.css` | Colores (variables al inicio), tema claro/oscuro y estilos |
| `js/config.js` | Tu configuración de Firebase |
| `js/store.js` | Guardado de datos: modo local y modo nube (Firestore + sesión), acceso y administración |
| `js/model.js` | Tipos de perfil, categorías de eventos, iconos, tipos de tarea, repetición, consultas |
| `js/views.js` | Pantallas: Hoy, Agenda, Tareas, Personas, Notas/Reuniones |
| `js/sheets.js` | Formularios y hojas que suben desde abajo, ficha de persona, ajustes |
| `js/app.js` | Arranque, inicio de sesión, navegación y toques |
| `sw.js` | Funcionamiento sin internet |
| `js/respaldo.js` + `js/respaldo-script.js` | 💾 Respaldo completo y cifrado de todas las cuentas en el Google Drive del administrador (lo hace `avisos/run.js`; se configura en `config/respaldo`) |
| `js/adminhub.js` | 🛡 Mi administración (cuentas, uso, novedades, compartido) y 📰 Novedades en Ajustes |
| `js/compartido.js` | 👥 Congregación compartida con otro anciano (solo lectura, siempre al día) y notas o tareas compartidas con comentarios. Los datos: `congres/{uid}` y `sharedItems/{id}` en Firestore (ver `firestore.rules`) |
| `js/asistencia.js` | 📊 Asistencia a las reuniones: en el Salón y por videoconferencia, con el promedio del mes y del año |
| `js/tablero.js` | 📌 Tablero de anuncios: los papeles del tablero, su enlace y cuándo toca cambiarlos |
| `js/limpieza.js` | 🧹 Turnos de limpieza del Salón (después de la reunión, semanal y a fondo), repartidos entre los grupos |
| `js/programa.js` | 🎤 Programa de las reuniones: quién tiene cada parte (complementa `js/mecas.js`, que son las mecánicas) |
| `js/programa-s140.js` | Lee el programa impreso (S-140) de un PDF o una foto: separa las dos columnas y saca fechas, partes y nombres |
| `js/imprimir.js` | Hoja para imprimir o guardar como PDF, compartida por las secciones de Congregación |
| `modulos/matrimonio/` | 💑 Módulo aparte; se activa con una línea en `index.html` y se quita borrando esa línea y la carpeta |

Ejemplos de cambios sencillos:

- **Categorías de eventos:** `CATEGORIAS` en `js/model.js` (y sus colores en `css/styles.css`).
- **Qué ve cada tipo de perfil:** `PROFILE_TYPES` en `js/model.js` (si agregas un tipo, añádelo también a la lista de `firestore.rules`).
- **Iconos de categorías:** `CAT_ICONS` y `ICON_HINTS` en `js/model.js`; los dibujos están en `index.html` (`<symbol id="i-…">`).
- **Categorías de Mi Informe:** `SERVICIO_CATS` en `js/model.js` (nombre, color e ic="tiempo de crédito" o no) y sus colores `--c-s1`/`--c-s2` en `css/styles.css`.
- **Tipos de tarea y sugerencias de "Relación":** `KINDS` y `ROLES` en `js/model.js`.
- **Partes del programa de las reuniones:** `PARTES` en `js/programa.js`.
- **Qué lleva el tablero de anuncios:** `SUGERIDOS` en `js/tablero.js`.
- **Clases de limpieza del Salón:** `TIPOS` en `js/limpieza.js`.
- **Semana que empieza en domingo:** en `js/views.js`, función `agenda`, cambia `(getDay() + 6) % 7` por `getDay()` y ajusta las letras de los días.
- **Colores:** variables `--primary`, `--bg`, etc. al inicio de `css/styles.css`. Cada color se escribe
  **una sola vez** con `light-dark(claro, oscuro)`; no hay un bloque aparte para el tema oscuro, así que
  no hace falta acordarse de cambiarlo en dos sitios.

Después de cambiar archivos, sube el número de versión **en todos lados a la vez** y vuelve a publicar:

```
node herramientas/version.mjs parche   # 9.8.1 → 9.8.2  (un módulo o un arreglo)
node herramientas/version.mjs menor    # 9.8.1 → 9.9.0  (varios módulos)
node herramientas/version.mjs mayor    # 9.8.1 → 10.0.0 (cambio grande)
node herramientas/version.mjs          # solo revisa que coincida en todos lados
node herramientas/version.mjs numero   # imprime 10.4.0   (lo usa la publicación automática)
node herramientas/version.mjs codigo   # imprime 100400   (el número que compara Android)
```

**La web y la app de Android llevan el mismo número.** Se cambia en los cinco sitios a la vez
(`version.json`, `js/model.js`, `sw.js`, `guia.html` y `app-android/package.json`). Android necesita
además un entero que solo pueda subir: sale del mismo número (10.4.0 → **100400**) y el cálculo vive
en un solo lugar, `herramientas/version.mjs`; el workflow del APK se lo pregunta en vez de repetirlo.
La publicación del APK etiqueta la versión como `v10.4.0` y `js/native.js` lee esa etiqueta para
avisar de actualizaciones (sigue entendiendo las etiquetas antiguas `apk-12`). Al cambiar
`version.json` se vuelve a construir el APK, para que los dos números no se separen otra vez.

El formato es siempre **MAYOR.MENOR.PARCHE** (3 números). Luego escribe las novedades en `version.json`.
Antes de publicar, revisa que el número coincida con `node herramientas/version.mjs` (no lo comprueba el workflow).
Si agregas archivos nuevos a `js/` o `css/`, añádelos también a la lista `SHELL` de `sw.js`.

## Módulos aparte (el patrón de `modulos/`)

`modulos/matrimonio/` es la plantilla a seguir para cualquier añadido grande que no tenga que
cargar todo el mundo. El trato es este:

- **Se activa con una línea** en `index.html`:
  `<script type="module" src="modulos/<nombre>/<nombre>.js"></script>`
- **Se quita** borrando esa línea y la carpeta. La app queda exactamente como estaba.
- **No toca ningún archivo de la app.** Solo importa de `js/` (`store`, `model`, `sheets`, `util`);
  nunca al revés. Si hace falta cambiar un archivo de `js/` para que el módulo funcione, el patrón
  se rompió: busca otra manera.
- **Guarda lo suyo en un solo campo del perfil** (`profile.matrimonio`), con un objeto `DEF` de
  valores por defecto. Así no hay que tocar `firestore.rules` ni migrar datos.
- **Reaprovecha lo que ya existe**: lo que planea se guarda como evento normal de la Agenda y las
  fechas especiales como tareas que se repiten. De ese modo los avisos del teléfono, el servidor,
  el widget y Google Calendar le funcionan solos, sin escribir nada de eso otra vez.
- **Sus estilos usan solo clases propias** con prefijo (`.mx-…`) y los colores de la app.
- **Se puede apagar por cuenta** desde Mi administración, con una función en `model.js`
  (`general.matrimonio`) que el módulo consulta con `M.featureOn(...)`.

## A quién le toca cada parte del programa

No todas las partes son para todos. La app lo sabe y **solo sugiere a quien encaja**, pero no impide
nada: el campo sigue siendo libre y puedes escribir cualquier nombre.

| | Quién | Partes |
|---|---|---|
| `anciano` | Ancianos | Presidencia, palabras de introducción y de conclusión, Necesidades de la congregación, Estudio Bíblico de la Congregación |
| `nombrado` | Ancianos y siervos ministeriales | Tesoros de la Biblia, Busquemos perlas escondidas y las partes de Nuestra vida cristiana |
| `varon` | Cualquier hermano | Las oraciones, la Lectura de la Biblia y los discursos |
| `todos` | Hermanos y hermanas | Las demostraciones de Seamos mejores maestros |
| — | Nadie | Las canciones y el tema del discurso |

**Las demostraciones van en pareja y del mismo sexo.** El campo lleva los dos nombres
(«FULANA / MENGANA»): en cuanto se reconoce a la primera persona, `parEditado()` cambia la lista de
sugerencias a la de su mismo sexo, y al guardar `avisoParejas()` avisa si quedó un hermano con una
hermana. Avisa, no lo impide.

La regla está en `quienPuede()` (`js/programa.js`): primero mira la clave de la parte y, si no la
conoce (las que vienen de un PDF llevan claves como `p4`), el nombre de la parte y su sección.

**Quién es anciano** ya lo deducía la app de la relación y los privilegios de cada persona
(`isElder` en `js/model.js`). **Quién es hermano o hermana** es un campo de la ficha (`sex: 'h' | 'm'`,
en Personas). Si está en blanco, los ancianos y los siervos ministeriales cuentan como hermanos sin
tener que escribirlo; para el resto hace falta ponerlo, porque del nombre de pila no se puede
deducir con fiabilidad.

## Leer el programa de limpieza de un mensaje

Muchas congregaciones lo pasan por WhatsApp, no en PDF, y con los días escritos a mano:

```
Octubre:
8-10 grupo 3
22 nosotros 24 general
```

`leerMensaje()` (`js/limpieza.js`) lo entiende. Lo importante: **el mes manda sobre los números**.
«8-10» son los días 8 al 10 de octubre, no el 8 de octubre; por eso hace falta la línea del mes.
El año no se escribe nunca, así que se toma el de hoy, y si el mes ya pasó hace más de un mes se
entiende que hablan del que viene; cuando la lista retrocede de mes (de diciembre a enero), se
cambia de año.

Otros detalles que salieron del mensaje real:

- Una línea puede traer dos turnos: `22 nosotros 24 general`.
- El número del final de «grupo 3» **no** abre un turno nuevo: solo cuenta un número al que le
  sigue una palabra.
- `general` es la limpieza a fondo y no es de ningún grupo; `nosotros` es mi propio grupo.
- Lo que no empieza por un número se ignora («Aquí esperamos por la otra fecha general»).

Los turnos que duran varios días llevan `until` además de `date`, siguen saliendo en la lista
mientras duran y se leen como «Del jueves 8 al sábado 10 de octubre».

## Subir un PDF e imprimir

**Leer un PDF o una foto.** El lector vive en `js/mecas.js` (`readFile`), usa `vendor/` (pdf.js y el
OCR) y **se hace todo en el propio teléfono**: nada se envía a ningún servicio. Devuelve los
renglones con la posición X de cada trozo, que es lo que permite separar las dos columnas del
programa impreso. `js/programa-s140.js` se apoya en eso para saber qué es el nombre de una parte y
qué es el nombre de un hermano (en el S-140 los nombres van en MAYÚSCULAS).

**Guardar también el archivo original** (`js/archivos.js` + `storage.rules`). Lo que se lee del PDF
se guarda en Firestore como siempre; además, el archivo tal cual puede quedarse en Firebase Storage,
en `users/{tu uid}/{sección}/{id}/{nombre}`, con la misma regla que tus datos: **solo tú lo abres**,
ni el administrador. Se aceptan PDF e imágenes de hasta 10 MB.

Tres detalles que importan:

- **Los datos se guardan primero.** La subida va detrás y no se espera a ella (`guardarArchivoLuego`).
  Si Storage falla, lo leído del PDF ya quedó guardado y solo se avisa de que el archivo no.
- **El botón de subir no aparece si no hay Storage.** `comprobar()` pregunta una vez por sesión al
  bucket; sin bucket responde 404 al instante. Así no se enseña un botón que no podría funcionar.
- **Un archivo, varios registros.** Un PDF del programa deja seis semanas, todas apuntando al mismo
  archivo. Al borrar un registro, `enUso()` mira si queda algún otro que lo use antes de borrarlo.

**Para activarlo** (una sola vez): consola de Firebase → Storage → «Comenzar», y después
`firebase deploy --only storage`. Requiere el plan Blaze; dentro del nivel gratuito de Google Cloud
(5 GB) no se cobra. Mientras no esté activado, la app funciona igual: guarda los datos y nada más.

**Imprimir.** `js/imprimir.js` arma una hoja pensada para el papel y la imprime desde un marco
oculto dentro de la propia página (no una ventana nueva), así funciona aunque el navegador bloquee
las ventanas emergentes; si tampoco deja, abre una pestaña aparte. Desde la ventana de impresión
del navegador se guarda como PDF.

## Rendimiento del arranque

`js/sheets.js` (los formularios) es el archivo más pesado y no hace falta para pintar la primera
pantalla, así que **no se importa de forma estática**. En `js/app.js`, `S` es un intermediario:
mientras el archivo no haya llegado, recibe la llamada y la ejecuta en cuanto llega; una vez
cargado, `S.loQueSea` es ya la función real. El archivo se pide en un hueco libre justo después
del primer pintado, así que al abrir un formulario ya está.

Si añades un módulo que importe `sheets.js`, **hazlo con `import()` dinámico**, no con `import`
arriba del archivo: si no, vuelve a entrar en el arranque y se pierde la mejora. El patrón está
en `js/compartido.js`, `js/adminhub.js`, `js/corregir.js` y `js/admin.js`.

## Ideas para la siguiente versión

- Recordatorios con notificaciones (Firebase Cloud Messaging).
- Reuniones de la semana precargadas con un solo toque.
- Plantillas de plan de estudio y de capacitación.
- Vista semanal, adjuntar fotos o PDF a las notas, inicio de sesión con Google.
- En Mi Informe: estadísticas con gráficos.

## Varias personas y perfiles (v3.0)

La app ya puede usarla más gente con el mismo enlace. Cada persona tiene **sus propios datos** (nadie ve los de otro,
ni siquiera el administrador) y el administrador decide **qué tipo de perfil** tiene cada cuenta:

| Tipo | Qué cambia |
|---|---|
| Publicador | No ve «Cuerpo de ancianos» ni «Pastoreo» (ni en eventos ni en Mi Informe) |
| Precursor | Igual que publicador, y se le invita a activar su meta mensual y anual |
| Anciano / Siervo ministerial | Ve todo |

**Configurarlo (una sola vez, en este orden):**

1. En la consola de Firebase → **Authentication → Usuarios**, copia el **UID de usuario** de tu cuenta.
2. **Firestore Database → Datos → Iniciar colección**: ID de la colección `admins`, ID del documento = **tu UID**,
   y agrega un campo cualquiera (por ejemplo `nombre` = tu nombre). Esto te marca como administrador.
3. Recién entonces publica las reglas nuevas: `firebase deploy` (o `firebase deploy --only firestore:rules,hosting`).
   ⚠️ Si publicas las reglas antes del paso 2, tu cuenta quedará «en revisión» hasta que crees ese documento
   (tus datos no se pierden, solo no se ven mientras tanto).
4. Comparte el enlace. Cuando alguien crea su cuenta ve «Cuenta en revisión» y puede enviarte su nombre.
5. En la app: **Ajustes (⋯) → Administración** → elige el tipo de cada cuenta. Su pantalla se abre sola.
   Elegir «Pendiente» le quita el acceso otra vez. Desde la v10.0 también eliges ahí qué secciones y funciones usa
   cada cuenta y editas las plantillas de cada tipo (ver «Novedades de la v10.0»).

Colecciones nuevas en Firestore: `admins/{uid}` (a mano), `access/{uid}` (tipo asignado, solo lo escribe el
administrador) y `directory/{uid}` (correo y nombre de cada cuenta, para la lista del administrador).

## App de Android (v5.0) — `app-android/`

- Proyecto **Capacitor 8** que abre la web publicada (`server.url`), así las pantallas se actualizan solas.
  Solo hace falta un APK nuevo si cambia algo nativo (permisos, sonidos, íconos, complementos).
- `js/native.js`: cuando la web corre dentro de la app, programa **avisos locales** (exactos, sin internet) con
  4 canales y sonidos (`res/raw/*.mp3`), botón «✓ Ya lo hice» y «📝 Registrar ahora», y revisa si hay APK nuevo
  (último release `apk-N` de GitHub frente al número de versión instalado).
- **GitHub Actions → App Android** (`.github/workflows/android.yml`) construye el APK firmado y lo publica en
  Releases. Descarga fija: `https://github.com/wilckerr2jw/mi-agenda/releases/latest/download/agenda-teocratica.apk`.
- **Llave de firma** (una sola vez): en `.publicar/android-llave.txt` están los dos secretos que hay que crear en
  GitHub → Settings → Secrets and variables → Actions: `ANDROID_KEYSTORE_PASS` y `ANDROID_KEYSTORE_B64`.
  Guarda también `.publicar/miagenda.jks`: **sin esa llave no se pueden publicar actualizaciones de la app**.

## Novedades de la v10.0: Administración de funciones

**Ajustes → 🛡 Administración** (solo el administrador, con cuenta en la nube) tiene dos pestañas:

- **Usuarios**: buscador, «X con acceso · Y pendientes» y la lista (pendientes primero). Al tocar una cuenta eliges su
  tipo (o «Pendiente (sin acceso)») y, por sección, qué funciones puede usar: cada sección se despliega, tiene su
  interruptor y sus funciones con casillas. Lo que difiere de la plantilla se marca «• cambiado»; «Restablecer a la
  plantilla» lo deja igual que su tipo. Sigue estando «📤 Enviarle un respaldo».
- **Plantillas**: lo que trae cada tipo de perfil (nombre, secciones, funciones, tipos de evento, categorías de Mi Informe
  y si se le invita a activar la meta). «＋ Nueva plantilla» copia una existente para crear un tipo propio
  (p. ej. «Siervo ministerial»); las propias se pueden eliminar si ninguna cuenta las usa.

**Modelo de datos**

- `js/perms.js` (puro, sin dependencias; pruebas en `tests/admin.test.mjs` → `node --test tests/admin.test.mjs`):
  catálogo `FEATURES` por sección (`general`, `agenda`, `tareas`, `personas`, `notas`, `informe`, `congregacion`), cada
  función con `id` (`congregacion.mecanicas`…), nombre, descripción y los botones (`data-a`) que controla;
  `defaultTemplates`, `mergeTemplates`, `effectivePerms(plantilla, acceso)` y `overridesFor`.
- `config/plantillas` → `{ types: { <id>: { n, modules, features, hideEventCats, hideServCats, goal } }, updatedAt, by }`.
  Lo escribe solo el administrador y lo leen las cuentas aprobadas; los cambios se aplican al instante (`watchAccess`).
  Si no existe, se usan las de siempre, calculadas de `PROFILE_TYPES` (Publicador y Precursor sin Congregación ni
  Pastoreo; Anciano con todo), así que nada cambia hasta que edites una.
- `access/{uid}` → `{ type, allow: [ids], deny: [ids], updatedAt, by }` (`type` = id de plantilla, `^[a-z0-9_-]{1,30}$`;
  listas de hasta 200). Lo que ve la cuenta = plantilla ∪ `allow` − `deny`; una función solo cuenta si su sección
  está encendida. El administrador sin tipo, el modo local y las reglas sin publicar siguen viendo todo.
- En la app: `M.featureOn(id)`; `moduleAllowed`, `isModuleVisible`, `profileTypeInfo()` y `canShepherd()` ahora salen de
  la plantilla. Los botones de las funciones apagadas no se muestran (CSS generado con `permCss()` y condiciones en las
  vistas) y, si se tocan por otro camino, salen con «Esta función no está activada para tu cuenta».

**Importante (seguridad):** estos permisos se aplican en la **interfaz** de la app. Los datos de cada persona ya son
privados por las reglas (`users/{uid}` solo lo lee su dueño), pero las funciones compartidas —crear eventos compartidos
(`shared`), tareas enviadas (`assigned`) o el enlace para los ancianos (`shares`)— **no se bloquean en el servidor** según
estas funciones: una cuenta aprobada con conocimientos técnicos podría usarlas igual. Recuerda publicar las reglas
(`firebase deploy --only firestore:rules`) para que funcionen las plantillas.

## Novedades de la v9.8: mínimo privilegio y tareas enviadas a otra cuenta

- **Mecánicas** (`js/mecas.js`): `parseMecas` reconoce además el formato «una asignación por renglón» (`labeledParts`: «Audio: Nombre», con la
  fecha sola arriba o al comienzo); las filas de quien no está en Personas se guardan con `pid: ''` y su nombre, y `rowPerson(r)` las enlaza
  por nombre o alias cuando lo agregas. `programHtml` (tarjetas por fecha / por hermano), `printProgram` (hoja carta), `drawProgram` +
  `shareProgram` (PNG), `remindSheet`/`remindSend` (WhatsApp por hermano) y `myMecas` (tarjeta en Hoy).
- **Recordar por WhatsApp** (`js/recordar.js`): `remindList(días)` junta por responsable las tareas de otros atrasadas o por vencer;
  `messageFor` arma el texto y `send` lo abre con `waLink(teléfono)`.
- **Enlace para los ancianos**: sección nueva `agenda` (`nextAgendaMeeting`/`agendaSnap` en `js/compartir.js`, `agendaHtml` en `js/ver.js`);
  sin puntos privados y sin subpuntos de los confidenciales. `sectionsOf(c)` la agrega a los enlaces ya creados salvo que `agendaOff`.
- **Publicación**: `firebase.json` ya no publica `*.md`, `*.txt` de la raíz, `.publicar/**`, `Claude outputs/**` ni `asignaciones-*.json`.

- **Eventos compartidos** (`shared/{id}`): solo el dueño (`owner`) cambia el contenido, los miembros o lo borra. Los demás
  solo tocan su ✓ (`doneLog`, `doneAt`, `doneBy`, `doneDay`, con `doneBy` = su uid). En la app, quien no lo creó lo ve
  bloqueado y solo tiene «Quitar de mi agenda» (`profile.sharedHidden`); `sharedWrite` no envía cambios de quien no es el dueño.
- **Tareas asignadas** (`assigned/{id}` → `owner`, `to`, `title`, `notes`, `kind`, `priority`, `due`, `dueTime`, `state`
  `nueva|aceptada|rechazada`, `done`, `doneAt`, `log[{d,t,by,byName}]`…): las leen solo `owner` y `to`. El dueño cambia el
  contenido o la borra (no el estado); quien la recibe solo cambia `state`, `done`, `doneAt` y `log`. `done` exige
  `state == 'aceptada'`. Los avances ya anotados no se pueden quitar ni cambiar (`log[0:n]` igual al anterior).
- En la app: la persona lleva `accountUid`/`accountName` (su cuenta, sugerida por el nombre). La tarea enviada lleva
  `assignedId`, `assignTo`, `assignToName`, `assignState`; las recibidas y aceptadas se muestran en Tareas con id `as_…`
  y `assignedFrom` (no se guardan en `users/{uid}/tasks` ni en el respaldo).

## Novedades de la v9.3: enlace para los ancianos y Google Calendar automático

- **Enlace para los ancianos** (`js/compartir.js` y `ver.html` + `js/ver.js`): el contenido (organigrama, acuerdos y tareas,
  visita del superintendente, mecánicas) se cifra en el teléfono con AES-GCM. La llave sale (PBKDF2, 600 000 vueltas) del
  secreto que va en el enlace después de `#` —nunca llega a un servidor— y de la clave de 6 números. En Firestore solo queda
  `shares/{id}` = `{ owner, v, salt, iv, iter, ct, updatedAt }`, donde `id` es un resumen del secreto. Las reglas dejan
  pedir un enlace por su número (`get`) pero no listarlos; solo el dueño lo cambia o lo borra.
- **Google Calendar automático** (`js/gcal.js` y `js/gcal-script.js`): cada persona pone en su cuenta de Google un
  programa de Apps Script (el código está en `gcal-script.js`, sin claves; usa el servicio avanzado «Google Calendar API»)
  implementado como aplicación web. La app le envía su agenda (POST text/plain) cuando cambia algo; el programa mantiene
  un calendario propio, «Mi Agenda Teocrática», con id de evento fijo por elemento y una huella para no reescribir lo que
  no cambió. La primera conexión le deja la clave de la app y desde ahí solo acepta esa.
- **Widget:** botones ✓ para las rutinas de hoy (`app.miagenda.teocratica://hecho?eid=…&dia=…`).
- **Plan B de avisos:** la app informa en `profile.nativeSched.until` hasta cuándo tiene avisos programados; si quedan menos
  de 12 horas, `avisos/run.js` manda los avisos del día también al teléfono (FCM).

## Novedades de la v4.1: eventos compartidos y aviso de versión nueva

- **Eventos compartidos**: colección `shared/{id}` (`owner`, `members`, `memberNames`, campos del evento). Todos los
  miembros lo ven y lo editan; solo `owner` cambia `members` o lo borra (ver `firestore.rules`). En la app se mezclan con
  los eventos propios (`id` «sh_…», `sharedId`); quitarlos de la agenda se guarda en `profile.sharedHidden`.
- **Cuentas para compartir**: `members/{uid}` = `{ name }`, lo escribe cada cuenta aprobada al abrir la app.
- **Tema sugerido** en los eventos (`events.theme`).
- **Avisos**: `avisoCompartido` (función que se activa al crear o cambiar un evento compartido) y aviso de **versión nueva**:
  cada hora se lee `version.json` del sitio y, si cambió, se avisa una vez a todos (`meta/app.notifiedVersion`; `meta/avisos.lastRun`; `sharedMeta/{id}` recuerda a quién ya se avisó).
  ➜ **En cada versión nueva, actualiza `version.json`** (número y hasta 3 novedades cortas).

### Publicación automática con GitHub (`.github/workflows/publicar.yml` y `avisos.yml`; copia en `ci/`)

Cada cambio que llega a la rama `main` del repositorio se publica solo en Firebase.

1. **Repositorio**: en GitHub crea un repositorio **privado** llamado `mi-agenda`, vacío (sin README).
2. **Cuenta de servicio** (para que GitHub pueda publicar): Google Cloud Console → proyecto `mi-agenda-app-855f1` →
   IAM y administración → Cuentas de servicio → **Crear** `github-publicar` con el rol **Editor** →
   en la cuenta creada, Claves → Agregar clave → JSON (se descarga un archivo).
3. En GitHub, el repositorio → Settings → Secrets and variables → Actions → **New repository secret**:
   nombre `FIREBASE_SERVICE_ACCOUNT`, valor = todo el contenido del JSON. Después **borra el JSON descargado**.
5. **Token para que Claude suba los cambios**: GitHub → Settings → Developer settings → Personal access tokens →
   **Fine-grained tokens** → Generate. Repository access: *Only select repositories* → `mi-agenda`.
   Permisos: **Contents: Read and write**, **Workflows: Read and write**, **Actions: Read-only**. Vence en 1 año.
   Guárdalo en `.publicar/github.txt` dentro de esta carpeta: línea 1 el token, línea 2 `tu-usuario/mi-agenda`.
   Esa carpeta nunca se sube a GitHub ni a la web (`.gitignore` y `firebase.json`).
6. **`ci/` es solo la copia**: GitHub ejecuta lo que está en `.github/workflows/`. Cada vez que cambies `ci/publicar.yml`
   (o `ci/avisos.yml`, `ci/android.yml`) copia el archivo a `.github/workflows/` con el mismo nombre y súbelo.
   `publicar.yml` corre las pruebas (`node --test "tests/*.test.mjs"`, carpeta `tests/`) antes de publicar y, si algo falla, guarda
   `deploy.log` como artefacto de la ejecución (Actions → la ejecución → *Artifacts*, 7 días) en vez de subirlo a la rama `diag`.
   Ya no necesita permiso de escritura (`contents: read`). La rama `diag` vieja se puede borrar.
7. Para publicar a mano sin GitHub sigue funcionando `firebase deploy`. En GitHub → Actions → Publicar → *Run workflow*
   se puede volver a publicar la última versión.

## Novedades de la v4.0: modo junta, avisos y diseño

- **Hora de cada punto** (`schedule` en `js/agenda.js`): con la hora de la reunión calcula a qué hora empieza cada
  punto; barra de colores por tipo. `meetings.agendaShowTimes` = poner la hora en el mensaje enviado.
- **Modo junta** (`js/junta.js`): pantalla completa con el punto actual, cronómetro por punto y total, «Guardar acuerdo»
  (se agrega a `notes`) y resumen previsto/real al terminar (`meetings.juntaRun`). Mantiene la pantalla encendida.
- **Hoy** con saludo, tarjetas y botón «▶ Iniciar la junta de hoy». Estados vacíos con icono y animación al cambiar de sección.
- **Apariencia**: color de la app (`data-accent`) y tamaño de letra (`data-size`), guardados en el teléfono.
- **Huella** (WebAuthn, en `js/lock.js`): desbloqueo opcional, solo en el teléfono; el PIN sigue funcionando.
- **Avisos** (`js/notify.js` + `functions/`): un aviso diario por usuario a la hora que elija. Ver sección «Avisos» abajo.
  `meetings.agendaSentAt` se anota al tocar «Enviar agenda».

### Avisos: puesta en marcha (una sola vez) — sin plan Blaze

Los avisos se mandan desde **GitHub Actions** (`.github/workflows/avisos.yml` → `avisos/run.js`), cada hora y gratis.
El proyecto de Firebase se queda en el plan gratuito (Spark): FCM no cobra. La carpeta `functions/` ya no se usa
(era la versión con Blaze; se puede borrar).

1. ⚙️ **Configuración del proyecto** → **Cloud Messaging** → **Certificados push web** → **Generar par de claves**.
   Copia la clave y pégala en `js/config.js` en `VAPID_KEY`.
2. Haz la configuración de GitHub (sección siguiente): el mismo secreto `FIREBASE_SERVICE_ACCOUNT` sirve para publicar y para los avisos.
3. En la app: **Ajustes → Avisos → Recibir avisos en este teléfono** y **Enviar un aviso de prueba** (llega en menos de una hora).
4. En GitHub → Actions → **Avisos** → *Run workflow* lo ejecuta en el momento (útil para probar).

Frecuencia: con el repositorio **público** y la variable `CADA5` = `si` (Settings → Secrets and variables → Actions → Variables) corre cada 5 minutos (avisos «en 10 min…», sin costo). Sin esa variable corre una vez por hora (≈ 750 de los 2000 minutos gratis al mes de un repositorio privado). El plan de avisos de cada usuario se guarda en `users/{uid}/meta/plan` y solo se rehace cuando algo cambia, para no gastar lecturas de Firestore.
Los avisos de eventos compartidos y el de versión nueva llegan en la siguiente ejecución (hasta 1 hora).

Datos: `users/{uid}/devices/{id}` (`token`, `tz`) guarda la dirección de cada teléfono; `users/{uid}/meta/notif`
anota el último día avisado; `profile.notif` guarda la hora y qué incluir. Los teléfonos que ya no existen se borran solos.

## Novedades de la v3.14: confidencial de verdad, fecha tope y referencias

- **Corrección**: un punto confidencial ya no envía sus subpuntos (solo título, encargados, minutos y referencia).
- **Fecha tope** para recibir puntos, editable (`meetings.agendaDeadline`: sin valor = día antes de la reunión,
  `''` = no se muestra, o una fecha).
- **Referencias uniformes** (`formatRef` en `js/agenda.js`): «Sfg CAP 1 parr 4;12» → «Sfg cap. 1, párrs. 4, 12».

## Novedades de la v3.13: supervisión, participación y plantillas

- `js/reports.js`: **informe de supervisión** (tareas de una reunión, o de todas, agrupadas en atrasadas / en curso /
  pendientes / hechas, con avance y última novedad; se puede enviar) y **participación** (puntos presentados y
  oraciones por persona en 3, 6 o 12 meses, y quién con privilegios no participó).
- **Plantillas de agenda** en `profile.agendaTemplates` (puntos sin encargados ni temas anteriores).
- Accesos: botones «📋 Supervisión» y «📊 Participación» en Reuniones, e «Informe de supervisión» dentro de cada reunión.

## Novedades de la v3.12: encargados con casillas, PIN y próxima reunión

- **Selector de encargados** (`pickerHtml` en `js/sheets.js`): casillas de «Yo», grupos y personas (con búsqueda y
  un campo «Otro») para quién presenta cada punto y quién hace cada oración.
- **Bloqueo con PIN** (`js/lock.js`): opcional, por teléfono; guarda solo la huella SHA-256 con sal. Se pide al abrir y al
  volver tras el tiempo elegido; con la app en segundo plano el contenido se ve borroso. No cifra los datos.
- **Preparar la próxima reunión** a partir de una anterior (mismo título, hora, lugar y participantes, +7 días).
- En Hoy, las próximas reuniones muestran cuántos puntos tiene su agenda; la búsqueda también busca en las agendas.

## Novedades de la v3.11: agenda con herramientas y app más rápida

- Agenda: «↻ Temas anteriores» (elegir tareas abiertas de otras reuniones y traerlas resumidas en un punto con
  `fromTaskIds`, o una por una), «⇄ Unir puntos» (`mergeItems`) y «👥 Asignar» (oraciones en `meetings.prayers` y
  encargado/referencia de cada punto). Varios encargados por punto, separados por coma (`splitNames`/`joinNames`).
- **Velocidad**: el service worker ahora responde al instante con la copia guardada y actualiza en segundo plano
  (stale-while-revalidate) en vez de esperar a la red; `index.html` precarga los módulos en paralelo y adelanta la
  conexión con Firebase. Al publicar una versión nueva, la app sigue avisando «Actualizar».
- Más asignaciones en la lista de privilegios (discursos públicos, hospitalidad, exhibidores, limpieza…).

## Novedades de la v3.10: agenda más completa

- Cada punto admite `ref` (referencia), `subs` (subpuntos → a, b, c en el mensaje) y `priv` (no se envía, queda solo
  en la app). La reunión guarda `agendaMax` (duración máxima): la app avisa cuánto queda libre o por cuánto se pasa.
  El total incluye 2 min por cada oración (`PRAYER_MIN`). «⇣ Pegar varios puntos» (`parsePasted`) crea varios puntos
  de una vez: sangría o guion = subpunto; `[decidir 30]`, `[informativo 10]`, `[privado 5]` al final de la línea.

## Novedades de la v3.9: agenda de reuniones, recorrido guiado y accesos rápidos

- **Agenda de la reunión** (`js/agenda.js` + sección «Agenda» de la reunión): puntos con título, quién lo presenta,
  minutos, tipo (seguimiento, para decidir, informativo, asignación), confidencial y detalle privado. Se guarda en
  `meetings.agenda`. «↻ Traer pendientes» suma las tareas abiertas de reuniones anteriores; «Enviar agenda» arma el
  texto para WhatsApp (los detalles nunca se envían); «Pasar a acuerdos» copia los puntos a «Acuerdos y notas».
- **Recorrido guiado** (`js/tour.js`): globos con Atrás/Siguiente sobre Hoy, la barra de abajo y los botones de arriba;
  se salta lo que no está visible y adapta los textos al perfil. Se ofrece la primera vez y está en Ajustes.
- **Accesos rápidos**: fila de botones en Hoy (`QUICK_ACTIONS` en `js/model.js`, elegidos en Ajustes →
  `profile.quickActions`) y `shortcuts` del manifiesto (mantener presionado el ícono en Android), que abren `#/do/<acción>`.

## Novedades de la v3.8: privilegios de cada persona

- En la ficha de una persona, «Privilegios y responsabilidades» (plegable): etiquetas para marcar los privilegios
  (`PRIVILEGES` en `js/model.js`) y un campo para agregar otros, que quedan en tu lista (`profile.customPrivileges`)
  y se quitan en Ajustes → «Tus tipos propios». Se guardan en `people.privileges`, se ven en la ficha y en la lista,
  cuentan en la búsqueda y hay un filtro «Todos los privilegios» en Personas.

## Novedades de la v3.7: tipos propios y responsables con casillas

- **Tipos propios**: lo que escribes con «✏️ Nuevo tipo…» (tareas y eventos) se guarda en tu lista
  (`profile.customKinds`, `profile.customEventCats`) y aparece siempre como opción. Se quitan en Ajustes →
  «Tus tipos propios» (si algún elemento ya lo usa, sigue apareciendo).
- **Responsables con casillas**: «Yo» + tus Personas (los marcados arriba) + un campo para quienes aún no están en
  Personas, con «+ Agregar a Personas» para guardarlos y marcarlos. Se guarda `responsibleIds`, `responsibles` y `mine`
  (sin nadie marcado, la tarea es tuya). Si la persona a atender de un acuerdo no está en Personas, la tarea ofrece
  «Agregarla y elegirla».

## Novedades de la v3.6: responsables y supervisión

- **Lectura de acuerdos mejorada**: reconoce «Nombre: …» (o un nombre al inicio) como la persona a atender, los
  responsables (nombres antes de «hablarán», «harán visita», «quedó en»…, o después de «los hermanos»), arma un título
  corto y pone el acuerdo completo en las notas de la tarea. Si la persona a atender no está en Personas, ofrece
  «Agregar a Personas». Lógica en `findSubject`, `findResponsibles`, `makeTitle` y `resolveName` de `js/model.js`.
- **Tu nombre y apodos**: Mi perfil → «Tu nombre» y «Cómo te escriben» (`profile.myName`, `profile.myAliases`); en
  Personas, «También escrito como» (`people.aliases`). Así los acuerdos salen como 👉 «Te toca a ti» o 👁 «Supervisas».
- **Supervisión**: cada tarea guarda `responsibles` y `mine`. En Tareas se filtra «Me tocan a mí» / «Las que superviso»,
  y en Hoy aparece «Por supervisar» con las de otros que llevan `SUPERVISE_DAYS` (7) días sin novedades o vencidas.
- «Sirvo como…» suma Coordinador del cuerpo de ancianos, Secretario y Superintendente de servicio.

## Novedades de la v3.5: de los acuerdos de una reunión a las tareas

- **Acuerdos detectados**: en una reunión, cada línea de «Acuerdos y notas» que empieza con viñeta (-, •, *, 1.)
  es un acuerdo. La app muestra «Encontré N acuerdos», reconoce la persona (de tu lista de Personas; si hay dos con
  el mismo primer nombre no adivina) y la fecha (el viernes, mañana, 15/10, 20 de octubre, en 2 semanas…), y con
  «Crear tarea» abre la tarea ya llena y vinculada. Se guarda en la tarea `fromAgreement` para marcar el acuerdo con ✓.
  Lógica en `parseAgreements`, `findDate` y `findPerson` de `js/model.js`.
- **Tareas de reuniones**: en la lista de Tareas se ve de qué reunión sale cada una, con un filtro «Solo de reuniones»
  o por reunión, y en el formulario de la tarea se puede elegir o cambiar «Viene de la reunión…».

## Novedades de la v3.1–v3.3: ritmo de la meta y Mi semana

- **Ritmo con emoji** sobre tu foto y en la meta del mes: 🐢 vas lento, 🦉 vas al ras, 🐇 vas adelantado. La marca roja
  de la barra indica dónde deberías ir hoy. Si hay tiempo de crédito, se ve en un tono más claro con su propio
  indicador «con crédito» (sin contar para la meta).
- **Cuánto falta**: «para ir al día» (según los días transcurridos) y «para tu meta», con las horas por día que
  necesitas en los días que quedan.
- **Mi semana** (en Informe): planea cuántas horas harás cada día (el plan se repite cada semana), ve lo hecho
  contra lo planeado y cuánto sumarías en el mes (contando los días reales del calendario).
- **Mis objetivos como precursor esta semana**: lista de objetivos que marcas como cumplidos; se guardan por semana
  en la colección `weeks` (un documento por semana, id = fecha del lunes).

## Novedades de la v3.0

- **Perfiles por tipo** asignados por el administrador y aprobación de cuentas nuevas (ver arriba).
- **«Sirvo como…» con varias opciones**: casillas (Publicador, Precursor auxiliar/regular/especial, Anciano,
  Siervo ministerial, Misionero…) y un campo «Otro» para lo que no esté en la lista. Se guarda en `roles`
  (y en `role` como texto, para compatibilidad).
- **Categorías propias con icono**: al escribir el nombre se sugiere un icono (CEH → médico, LDC → construcción,
  Betel → edificio, Escuela → birrete…) y puedes elegir otro entre 16. Toca una categoría para editarla. Si quitas
  una que ya tiene registros, se oculta pero tus registros la conservan.
- **Se quitó «Registrar contacto hoy»** y la sección «Sin contacto reciente» de Hoy: guardar a alguien ya no lo
  deja como pendiente. El «último contacto» solo aparece si anotaste un seguimiento en una de sus tareas.
- **Meta anual visible** en Informe, con lo que te falta para alcanzarla.
- **Repetición quincenal y mensual** en eventos (además de semanal); cualquier ocurrencia se puede cancelar sola.
- **Restaurar respaldo pide confirmación** y avisa cuántos elementos se reemplazarán.

## Novedades de la v2.5: fotos de perfil y categorías propias

- **Foto de perfil**: tanto en Mi perfil como en cada Persona, tocas el círculo del avatar para elegir
  una foto de la galería; se recorta a cuadrado y se reduce a 200×200 antes de guardarse (para no
  llenar Firestore de bytes), y hay un enlace «Quitar foto» para regresar a las iniciales o al ícono.
- **«Sirvo como…» con texto libre**: dejó de ser una lista cerrada; ahora es un campo de texto con
  sugerencias (Publicador, Precursor auxiliar/regular/especial, Anciano, Siervo ministerial…) igual que
  la «Relación» de Personas, así que puedes escribir cualquier variante que no esté en la lista.
- **Categorías propias de Mi Informe**: en Mi perfil, además de las fijas (Servicio del Campo, LDC,
  Betel…) puedes agregar las tuyas —por ejemplo «CEH»— con su propio nombre y si cuentan o no como
  «tiempo de crédito». Aparecen igual que las demás al elegir categoría para registrar tiempo.

## Novedades de la v2.3–v2.4: ritmo de la meta y módulos a la medida

- **¿Cómo vas con tu meta?**: en Informe, junto a la barra de la meta del mes aparece un indicador:
  🐢 si vas más lento de lo esperado según los días transcurridos, 🐇 si vas adelantado, y 🦉 si vas
  al ritmo justo (con un margen de tolerancia de ~8% de la meta para no marcar por casi nada).
- **Módulos a la medida**: en Ajustes puedes ocultar las secciones que no uses (Agenda, Tareas,
  Personas, Notas, Informe) para que la barra de abajo solo muestre lo que quieres ver. «Hoy» siempre
  está disponible.

## Novedades de la v2.2: cursos bíblicos por nombre y «Enviar»

- **Cursos bíblicos con nombre**: en el registro de tiempo, «Cursos bíblicos» ahora es una lista de
  nombres (con autocompletado de las Personas cuya «Relación» incluya «estudiante»), no solo un número.
  Cada registro guarda `studyNames` (antes era un simple contador `studies`); el total del mes sigue
  siendo la cuenta de nombres.
- **Botón «Enviar»** en la ficha de cada mes: arma un resumen de texto (rol, total de tiempo, cursos
  bíblicos y el desglose por categoría) y lo entrega al selector de compartir del teléfono
  (`navigator.share`: WhatsApp, correo, SMS…); si el navegador no lo soporta, abre un borrador de
  correo (`mailto:`) con el mismo resumen. No requiere servidor propio.

## Novedades de la v2.1: Mi Informe

Se reemplazó el informe simple (horas/revisitas/estudios de un solo valor por mes) por un sistema
completo, inspirado en apps de informe de servicio de campo:

- **Perfil y metas**: en Informe → «Editar mi perfil» eliges tu rol («Sirvo como…») y activas una
  meta personal, mensual y/o anual, en horas. Se guarda en la nueva colección `profile`.
- **Categorías de tiempo con color**: Servicio del Campo, Adoración en familia, Predicación pública,
  Informal, Predicación telefónica, LDC, Betel y Pastoreo (`SERVICIO_CATS` en `model.js`). LDC y Betel
  son «tiempo de crédito»: no cuentan para tu meta salvo que actives «Con crédito» en la ficha del mes.
- **Registro rápido**: al tocar una categoría se abre un cronómetro con botones +1h / +5m / −1h / −5m,
  fecha, cursos bíblicos y notas. Cada registro se guarda en la nueva colección `entries`.
- **Ficha de mes**: totales del mes, barra de progreso hacia la meta, alternador Con/Sin crédito y la
  lista de registros (editables o eliminables). La pantalla de Informe muestra el total del año y un
  vistazo de la meta del mes en curso.
- **Diseño**: se sumó un patrón floral muy sutil de fondo (respeta el tema claro/oscuro) y dos colores
  nuevos (`--c-s1`, `--c-s2`) para las categorías que no tenían uno propio ya en la app.

## Novedades de la v2.0

- **Notas con fecha propia**: cada nota tiene un campo «Fecha» editable (para saber cuándo se hizo o cuándo fue la reunión), y la lista de Notas se ordena por esa fecha.
- **Notas vinculadas a una reunión o persona**: al editar una nota puedes asociarla a una reunión importante o a una persona; aparece luego en la ficha de esa reunión o persona.
- **Excepciones en eventos repetidos**: al tocar una ocurrencia de un evento semanal (desde Hoy o Agenda) aparece la opción «Cancelar solo esta semana», sin afectar las demás.
- **Búsqueda global**: la lupa del encabezado abre un buscador que recorre eventos, tareas, personas, notas y reuniones a la vez.
- **Aviso de contacto atrasado**: en Hoy aparece una sección con las personas sin contacto registrado o con más de 30 días sin uno (ajustable en `model.js`, constante `STALE_DAYS`).
- **Filtro de tareas por persona**: en Tareas, un selector debajo de los chips de estado permite ver solo las tareas de una persona.
- (El cambio manual de tema claro/oscuro ya existía: icono de sol/luna arriba a la derecha, o Ajustes → Apariencia.)
