# Mejoras pendientes · Mi Agenda Teocrática

Lista viva de mejoras. **Cada vez que hagamos cambios, empezamos por la sección «Próximas».**
Cuando una se hace, pasa a «Hechas» con su versión. Este archivo es solo de esta carpeta: no se publica ni se sube al repositorio.

_Última actualización: 2 oct 2026 · versión de la app 10.0.1_

---

## 🔒 Reglas fijas (se revisan en cada versión)

- **Se sube todo de una sola vez:** las mejoras se juntan y se publican juntas en una sola versión, no una por una.
- **Nunca se borra la persona que usa la sesión.** Con cada versión se comprueba, antes y después de publicar, que sigan intactos:
  - tu ficha «soy yo» en Personas (nombre, foto, relación y privilegios);
  - Mi perfil: nombre, foto, cargos y nombramientos;
  - tus metas personales (meta mensual y anual de horas).
- Si una versión nueva encuentra esos datos vacíos, conserva los que ya tenías; solo cambian cuando tú los editas.
- **Número de versión con 3 partes (desde la 9.8.1): MAYOR.MENOR.PARCHE.**
  - 3.er número (9.8.**1** → 9.8.**2**): cambios en un solo módulo o arreglos.
  - 2.º número (9.**8**.x → 9.**9**.0): mejoras en varios módulos.
  - 1.er número (**9**.x.x → **10**.0.0): un cambio grande en toda la app.
  - Se cambia en todos los archivos a la vez con `node herramientas/version.mjs parche` (o `menor`, `mayor` o el número). Sin nada, revisa que coincida en todos lados; la publicación automática también lo revisa y se detiene si no coincide.

## ⭐ Próximas

1. **Agenda en la computadora con los títulos dentro del mes**
   En pantalla grande, que cada día del calendario muestre los títulos de sus eventos (no solo los puntitos) y que se pueda arrastrar un evento a otro día.
2. **Imprimir o guardar en PDF el informe del año de servicio**
   Desde la computadora: una hoja con los 12 meses (horas, crédito, cursos y otros datos) y los totales, lista para imprimir o archivar.
3. **Historial de correcciones**
   Que «✏️ Corregir un mes» guarde qué cambiaste y cuándo, para poder revisarlo después.

## 🧪 Por probar en el teléfono

- 🏢 **Tareas por departamento** (10.0.1): en Tareas toca «🏢 Por departamento». Revisa que cada tarea salga en su departamento, que «Sin departamento» quede al final y que al cerrar un departamento siga cerrado al cambiar de Lista a Tarjetas. Arrastra una tarea por su ⠿ a otro departamento (también a uno cerrado y a uno que no se ve, para que la pantalla baje sola), toca ⠿ para «Mover a otro departamento» y prueba «Deshacer». Abre una tarea, marca como responsable al encargado de un departamento y revisa que «🏢 Departamento que la ejecuta» se llene solo.

- 🛡 **Administración** (10.0.0): Ajustes → 🛡 Administración. Abre una cuenta, apaga una función (por ejemplo «Asignaciones mecánicas»), guarda y revisa en ese teléfono que el botón ya no salga. Prueba «Restablecer a la plantilla» y crea una plantilla nueva copiando otra.
- 📱 **Barra con «Más»** (10.0.0): Personas, Notas y Congregación están en «Más». Revisa que la letra se lea bien y que los atajos 1–7 sigan funcionando en la computadora.
- 🔄 **Actualizar** (10.0.0): esta primera vez la versión entra sola; desde la próxima te sale «Hay una versión nueva · Actualizar» en Hoy y en Ajustes.
- 💾 **¿Descartar cambios?** (10.0.0): escribe algo en un evento y toca Atrás: debe preguntarte antes de cerrar.
- 📤 **Compartir a la app** (10.0.0): desde WhatsApp, comparte la foto o el PDF del programa de mecánicas y elige Mi Agenda: debe abrir el importador (en la app instalada desde Chrome).
- 📖 **Registros viejos** (10.0.0): edita la nota de un registro antiguo con cursos y revisa que los cursos no se pierdan.

- 📖 **Cursos bíblicos** (9.8.2): revisa que septiembre diga 1 curso y que «✏️ Corregir un mes» muestre «(3 veces)».
- ✏️ **Corregir un mes anterior** (9.8.1): Informe → ✏️ Corregir un mes anterior. Elige agosto, cambia un total y revisa que el mes y el año de servicio sumen bien; prueba también «Deshacer».
- 🖥 **Versión para computadora** (9.8.1): abre la app en Chrome o Edge en la computadora y revisa el menú de la izquierda, la Agenda (mes y día lado a lado), las ventanas centradas y los atajos 1–7, N y /. Si quieres, instálala con el ícono de la barra de direcciones.

- 🗂 **Tareas** (9.7): prueba ▦ Tarjetas, ponle 🔴 Alta o ⬇ Baja a unas tareas y dime si el orden se entiende bien.
- 💡 **Tareas sugeridas** (9.6): abre un departamento en Congregación, asigna una sugerida y revisa que las sugerencias apliquen a tu congregación; dime cuáles cambiar o agregar.
- 🖨 **Imprimir carta (2 hojas)** en Congregación desde la computadora: revisa que todo quepa y se lea bien.

- 📲 **Instalar la app nueva** (te sale «Hay una actualización de la app» en Hoy): trae el ✓ del widget, los avisos exactos sin pedir permiso y el botón para quitar la restricción de batería.
- 🩺 **Revisar mis avisos** (Ajustes → Avisos): si algo sale con ⚠️, arréglalo con su botón o mándame una captura.
- 📖 **Texto diario:** «¿Ya lo hiciste?» a las 7:30 a. m. y el último aviso a las 9:00 p. m. si no lo marcas.
- ✓ **Widget:** pon de nuevo el widget si no ves los botones ✓ y toca «✓ Análisis del texto diario».
- 🔗 **Enlace para los ancianos:** créalo, ábrelo desde otro teléfono con la clave y revisa que se vea bien.
- 🎤 **Dictado por voz** en la app de Android.
- ☁️ **Guardar respaldo en Google Drive** desde el teléfono.

## 📌 Pendientes tuyos (fuera de la app)

- 🚨 **Revocar el token de GitHub** que estaba en `.publicar/github.txt` y crear uno nuevo; revisar que `https://mi-agenda-app-855f1.web.app/.publicar/github.txt` dé 404 y borrar en Firebase → Hosting las versiones viejas que lo tengan. Si la app está en Play, pedir el cambio de la llave de subida.
- **Copiar `ci/publicar.yml` a `.github/workflows/publicar.yml`** (ahora corre las pruebas antes de publicar y guarda el registro de errores en privado).
- **Publicar las reglas nuevas de Firestore** junto con esta versión (se publican solas con «Publicar»); sin ellas, la Administración no puede guardar.
- **Conectar Google Calendar** (unos 5 minutos, mejor en la computadora): Ajustes → Mis datos → **Conectar con Google Calendar** y sigue los 5 pasos (usa la cuenta de Google de tu calendario).
- **Crear el enlace para los ancianos:** Congregación → 📋 Para el Cuerpo de ancianos → **🔗 Enlace para los ancianos**; manda el enlace y, aparte, la clave.
- **Visitas de pastoreo anteriores:** pega tu registro en Personas → Seguimiento → Pastoreo → **📥 Cargar visitas anteriores** (una visita por línea: nombre y fecha). Si prefieres, mándamelo y lo cargo yo.
- Yovanna: tiene que abrir la app (dos veces si no carga la versión nueva) y tocar **Importar** para recibir sus horas desde julio de 2024; luego en Mi Informe, con ◀, ve el año anterior.
- Borrar la carpeta **«Claude outputs»** de esta carpeta cuando ya no la necesites.

---

## ✅ Hechas

| Versión | Qué se hizo |
|---|---|
| 10.0.1 | 🏢 **Tareas por departamento**: en Tareas, «📅 Por fecha / 🏢 Por departamento» (sale solo si hay departamentos y recuerda lo que elegiste). Cada departamento, en el orden del organigrama, muestra su ícono, de qué departamento depende, cuántas tareas tiene, cuántas están atrasadas y cuántas son de prioridad alta, y se puede cerrar. «Sin departamento» va al final. Funciona con Activas, En seguimiento y Hechas, en Lista y en Tarjetas · ⠿ mover una tarea de un departamento a otro arrastrándola (dedo o ratón, se desplaza sola cerca del borde, abre el departamento cerrado donde la sueltas) o tocando ⠿ para elegirlo de una lista, con «Deshacer»; «Sin departamento» a propósito ya no la ubica por su responsable (`js/mover.js`) · campo «🏢 Departamento que la ejecuta» en la tarea; si no se elige, se usa el único departamento donde los responsables son encargados (sin el Comité ni el Cuerpo) · 🧪 5 pruebas nuevas (30 en total) |
| 10.0.0 | 🛡 **Administración de funciones**: el administrador elige por cuenta qué secciones y funciones usa (37 funciones agrupadas por sección), con plantillas editables (Publicador, Precursor, Anciano y las que crees) y cambios por persona · 📱 barra de 5 pestañas con «Más» y letra más grande · 🔄 la versión nueva se instala al tocar «Actualizar» · 💾 «¿Descartar cambios?» al cerrar un formulario · avisos en fila y «Deshacer» de 10 s · contraste y tema oscuro corregidos · ventanas accesibles con teclado y lector de pantalla · Informe solo con los meses que tienen datos · tipo de evento según el título · compartir el programa de mecánicas desde WhatsApp a la app · número de pendientes en el ícono · lector de mecánicas «para usar sin internet» · 🔒 seguridad: eventos compartidos, respaldos importados, Google Calendar, enlace (clave de 10 caracteres opcional, «Recordar» apagado), espera tras varios PIN fallidos, reglas más estrictas · 🐞 cursos de registros viejos, guardado por campos (sin pisar datos entre teléfono y computadora), .ics con acentos y zona horaria, tareas del día 31, «12.30» = 12 h 30 min, fechas después de las 8 p. m., aviso de rutinas de la noche · 🧪 24 pruebas automáticas que corren antes de publicar |
| 9.8.2 ✅ publicada 1 oct | 📖 Cursos bíblicos: cada estudiante cuenta una sola vez en el mes aunque estudies con él varias veces (antes se sumaba cada registro: 1 estudiante 3 veces salía como 3 cursos) · el total del año cuenta estudiantes distintos · «✏️ Corregir un mes» muestra con quién estudiaste y cuántas veces |
| 9.8.1 ✅ publicada 1 oct | ✏️ Mi Informe: corregir un mes anterior (cualquier mes, también de años pasados): totales por tipo de servicio y de crédito, cursos y otros datos; escribes el total correcto y la app ajusta (sube con un registro de ajuste el último día del mes, baja primero los ajustes y luego los registros más recientes), con «Deshacer»; editar, borrar o agregar registros del mes sin salir · 🖥 versión para computadora (la misma app en pantalla grande): menú a la izquierda, listas en columnas, Agenda con el mes y el día lado a lado, ventanas centradas y atajos 1–7, N y / · número de versión con 3 partes y un solo comando para cambiarlo (se corrigió que Ajustes mostraba «9.4») · se incluye todo lo de la 9.8: mínimo privilegio en eventos compartidos, tareas enviadas a otra cuenta, asignaciones mecánicas desde texto, recordatorio por WhatsApp de las tareas atrasadas y la agenda de la próxima reunión en el enlace para los ancianos |
| 9.7 | 🗂 Tareas más ordenadas: grupos Atrasadas → Hoy → Próximos 7 días → Más adelante → Sin fecha, con resumen arriba · prioridad en cada tarea (🔴 Alta, Normal, ⬇ Baja): altas primero y bajas al final en «⬇ Baja prioridad» · vista ☰ Lista / ▦ Tarjetas |
| 9.6 | 📋 Asignar tareas desde cada departamento a su responsable · 💡 tareas sugeridas por departamento (una o varias a la vez desde Congregación) · se quitó lo de la 9.5 que agrupaba tus tareas por departamento (filtro, tarjeta en Hoy y campo en la tarea): tus tareas quedan como estaban |
| 9.5 | 👁 Tareas de los departamentos que supervisas (donde eres responsable y los que dependen de ellos, sin el Cuerpo ni el Comité): campo «Departamento» en la tarea (automático según el responsable o elegido a mano) · Tareas → «De mis departamentos» agrupado y con atrasadas · «👁 Mis departamentos» en Hoy · «📋 Tareas pendientes» al abrir un departamento · se arregló el inicio de la guía (dos líneas fuera de lugar) |
| 9.4 | 🖨 Organigrama para imprimir en hoja carta: 2 hojas con letra grande (organigrama con subdepartamentos dentro de su caja y grupos en cuadrícula · ancianos, siervos y precursores con su total); la letra se ajusta sola para que quepa |
| 9.3 | 🔗 Enlace para los ancianos: organigrama, acuerdos y tareas, visita del superintendente y asignaciones mecánicas en una página cifrada con clave de 6 números (sin app ni cuenta), que se actualiza sola y se puede apagar · 📅 Google Calendar automático (calendario propio «Mi Agenda Teocrática» con eventos y su repetición, tareas y reuniones; lo que cambias o borras aquí se cambia allá) · ✓ en el widget para marcar las rutinas de hoy · plan B de avisos: si el teléfono se queda sin avisos programados, el servidor manda los importantes |
| 9.2 | Rutinas (texto diario, lectura…): «¿Ya lo hiciste?» más confiable, «✓ Ya lo hice» también en el aviso de antes, último aviso a las 9:00 p. m. y casilla «Es una rutina» en cada evento · 🩺 Revisar mis avisos (permiso, avisos exactos, batería, tipos de aviso apagados, rutinas de hoy) y aviso en Hoy si un tipo de aviso está apagado · app de Android nueva: avisos exactos sin pedir permiso y quitar la restricción de batería · Mi Informe: campos adicionales (cartas, publicaciones, kilómetros, gastos o uno tuyo) · Pastoreo: cargar visitas anteriores pegando el registro o con una foto |
| 9.1 | Mi Informe: años de servicio anteriores (◀ ▶) · estadísticas del mes: horas por día contra el mes anterior, por día de la semana, avance a la meta y por tipo (ideas de la otra app) |
| 9.0 | Tu ficha «soy yo» protegida en cada versión · Mi perfil muestra tus responsabilidades de Congregación (y se corrigió «WIlcker») · visita del superintendente: crear la reunión con los temas, anotar el pastoreo con él y ver lo pendiente de la visita anterior · mecánicas: ancianos opcionales y botones más compactos · enviar una nota a otra cuenta · avisos de Hoy agrupados |
| 8.5 | Buzón: el administrador envía un respaldo a otra cuenta y ella lo importa con un toque (sin abrir archivos .json) |
| 8.4 | Visita del superintendente de circuito (lista por responsable, fechas límite, pedir por WhatsApp, avisos) · reuniones de la congregación automáticas en la agenda · respaldo a Google Drive con recordatorio semanal |
| 8.3 | Día y hora de las reuniones con selector · borradores recuperables si la app se recarga · datos de la congregación protegidos |
| 8.2 | Avisos de tareas del día y atrasadas · avisos programados para toda la semana · ver avisos programados |
| 8.1 | Secciones de Congregación que se despliegan y ocultan · panel «Para el Cuerpo de ancianos» · filtro «Varones bautizados» |
| 8.0 | Asignaciones mecánicas (importar foto o PDF, quién no se usa, sugerir al encargado) · panel del cuerpo de ancianos · dictado por voz · pasar la agenda a Google Calendar · tarjeta «Ahora» · organigrama en árbol |
| 7.7 | Campos del evento según el tipo · Adoración en familia · Comité de Servicio y Cuerpo de ancianos se llenan solos · PDF bien en el teléfono |
| 7.6 | Grupos para el servicio del campo como de la congregación · descargar imagen del organigrama · se quitaron los sugeridos |
| 7.5 | Detalles de un acuerdo con guion |
| 7.4 | Tareas que se repiten · responsables con búsqueda |
| 7.1–7.3 | Acuerdos solo desde «Tareas:» · responsables «Nombre: hacer algo» y «Tema: nombres» |
| 7.0 | Foto y perfil protegidos al actualizar · participantes de reuniones con búsqueda |

_Quitadas de la lista a tu pedido (29 sep): la IA, y afinar la lectura del arreglo de mecánicas (cuando tengas el formato me lo pasas)._
