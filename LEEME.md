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

Ejemplos de cambios sencillos:

- **Categorías de eventos:** `CATEGORIAS` en `js/model.js` (y sus colores en `css/styles.css`).
- **Qué ve cada tipo de perfil:** `PROFILE_TYPES` en `js/model.js` (si agregas un tipo, añádelo también a la lista de `firestore.rules`).
- **Iconos de categorías:** `CAT_ICONS` y `ICON_HINTS` en `js/model.js`; los dibujos están en `index.html` (`<symbol id="i-…">`).
- **Categorías de Mi Informe:** `SERVICIO_CATS` en `js/model.js` (nombre, color e ic="tiempo de crédito" o no) y sus colores `--c-s1`/`--c-s2` en `css/styles.css`.
- **Tipos de tarea y sugerencias de "Relación":** `KINDS` y `ROLES` en `js/model.js`.
- **Semana que empieza en domingo:** en `js/views.js`, función `agenda`, cambia `(getDay() + 6) % 7` por `getDay()` y ajusta las letras de los días.
- **Colores:** variables `--primary`, `--bg`, etc. al inicio de `css/styles.css`.

Después de cambiar archivos, sube el número de `VERSION` en `sw.js` (por ejemplo `agenda-v2`) y vuelve a publicar con `firebase deploy --only hosting`.
Si agregas archivos nuevos a `js/` o `css/`, añádelos también a la lista `SHELL` de `sw.js`.

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
5. En la app: **Ajustes (⋯) → Administrar usuarios** → elige el tipo de cada cuenta. Su pantalla se abre sola.
   Elegir «Pendiente» le quita el acceso otra vez.

Colecciones nuevas en Firestore: `admins/{uid}` (a mano), `access/{uid}` (tipo asignado, solo lo escribe el
administrador) y `directory/{uid}` (correo y nombre de cada cuenta, para la lista del administrador).

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
6. Para publicar a mano sin GitHub sigue funcionando `firebase deploy`. En GitHub → Actions → Publicar → *Run workflow*
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
