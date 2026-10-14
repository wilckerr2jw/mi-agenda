# Análisis de las 6 apps (APK) y qué nos llevamos a Mi Agenda

> Las seis son **Flutter compiladas (AOT)**: no hay código fuente dentro. Lo que sigue se sacó
> de `libapp.so` (nombres de clases, rutas de navegación, esquemas SQL, expresiones regulares
> y todos los textos de pantalla). Es suficiente para reconstruir *qué hace cada una y cómo*.

## Lo que comparten las seis (su arquitectura)

Todas están hechas con el mismo molde, y es un molde bueno:

| Pieza | Qué usan | Equivalente en Mi Agenda |
|---|---|---|
| Base de datos | Drift sobre SQLite **cifrado** (`libsqlite3mc`) | Firestore + `store.js` |
| Estado | Riverpod (`xRepositorioProvider`) | `store.js` / `model.js` |
| Navegación | GoRouter con rutas de texto (`/territorios/t/`) | `data-v` + `views.js` |
| Avisos | `flutter_local_notifications` | `notify.js` |
| Respaldo | Un solo archivo cifrado, con versión | `respaldo.js` |
| Entrada de datos | PDF, .xlsx, .docx, .csv, texto pegado | `mecas.js` (PDF.js + Tesseract) |
| Calendario | `add_2_calendar` | `gcal.js` / `ics.js` |

**La idea más valiosa de todas no es una pantalla: es que cada app es un módulo que se
habla con los otros por archivos.** S. Servicio dice literalmente *«Enviado por Territorio»*,
*«Enviado por Secretaria»*, *«Ese archivo no es un respaldo de Territorio»*. Cada app exporta
un archivo que la otra reconoce. Eso es exactamente lo que tú quieres: piezas separables.

---

## Una por una

### 1. `mistarea` — la más pequeña y la que más nos sirve

Es, en el fondo, **una sola función hecha muy bien**: cargar el PDF **S-147 (Anuncios y
recordatorios)** del mes y sacar de ahí todas las tareas.

Lo que hace:

- Lee el PDF **sin librería nativa** (su propio extractor) y detecta la hoja con:
  - Encabezado: `^\s*(S-147-\d{2}\.\d{2}\S*|Anuncios y recordatorios(\s+\w+\s+de\s+\d{4})?)\s*$`
  - Período: `^\s*(enero|...|diciembre)\s+de\s+\d{4}\s*$`
  - Cada punto: `^\s*(\d{1,2})\.\s+(.*)$`
  - Fechas dentro del texto: `\b(\d{1,2})\s+de\s+(enero|...)(?:\s+de\s+(\d{4}))?`
- Clasifica cada punto por **apartado/rol**: `ANCIANO`, `SECRETARIO`, `SUPERINTENDENTE`,
  `COORDINADOR`, `CONGREGACION`, `PROPIAS`.
- Guarda `tareas` con índice por `periodo`, y **el texto del S-147 no se edita**
  («se perderá al volver a cargar la hoja; la fecha y la hora sí se conservan»).
- Al cargar otra vez el mismo mes: *«N tareas nuevas, N cambiaron, N se quitaron»* —
  **reconciliación**, no duplicados.
- Botón «Agendar en el calendario» por tarea.
- Respaldo cifrado en un archivo, con aviso si es de otra versión.

**→ Esto es, tal cual, la función de PDF que me pediste. Nos la llevamos entera.**

### 2. `Secretaria-universal` — informes, asistencia y personas

Rutas: `/personas`, `/grupos`, `/asistencia`, `/asistencia/anio`, `/precursores`, `/visitas`,
`/s21`, `/s10`, `/importar-s21`, `/importar-historico`, `/tareas/cargar`, `/captura`,
`/contar`, `/respaldo`, `/ajustes/seguridad`.

Lo mejor:

- **Alta de publicadores leyendo el Excel S-21** de cada uno («crea a quien no esté»).
- **Captura de informes** en una pantalla pensada para teclear rápido.
- **Asistencia** por mes y por año de servicio, con promedio, desde un S-88.
- Avisos: *«Recoge los informes que falten»*, *«1 precursor regular por debajo de lo esperado»*.
- **Bloqueo con PIN/biometría** para la sección de informes (`/ajustes/seguridad`, `BloqueoPantalla`).
- Trae los **PDF de los formularios oficiales dentro de la app** (S-1, S-10, S-88).
- También carga el S-147 y, si el PDF es un escaneo, avisa: *«puede que sea una foto; pega el texto a mano»*.

**→ Nos llevamos: el bloqueo por PIN, la captura rápida, el año de servicio y los avisos de «falta».**

### 3. `S_Servicio` — el puente entre apps + inventario

Rutas: `/publicadores`, `/publicadores/grupos`, `/publicadores/metricas`, `/publicaciones`
(catálogo, entradas, salidas, existencias, informe), `/servicio/s13`, `/servicio/censos`,
`/servicio/actividad`, `/exhibidores`, `/tareas`, `/agenda`.

Lo mejor:

- **Inventario de publicaciones completo**: catálogo, movimientos, conteo, existencias e informe.
- **Enlazar nombres** entre apps (`/publicadores/enlazar`) cuando el mismo hermano se escribe distinto.
- **Intercambio de archivos con Territorio y Secretaria** en los dos sentidos, con marca de quién y cuándo.
- *«1 publicador no vino: te preguntará…»* — seguimiento de ausencias.

**→ Nos llevamos: el enlazado de nombres y el formato de intercambio entre módulos.**

### 4. `Territorio` — la más completa de las cinco

Tablas: territorios, asignaciones, salidas, grupos, personas, eventos, lugares de encuentro,
censos, congregaciones censadas, sordos encontrados, programas, filas especiales.
Rutas: `/territorios`, `/territorios/t/`, `/territorios/importar-s13`, `/territorios/por-resolver`,
`/territorios/registro`, `/conductores`, `/censos`, `/metricas`, `/eventos`, `/programa`,
`/ajustes/feriados`, `/ajustes/automatico`, `/ajustes/impresion`.

Lo mejor:

- **Territorios por resolver**: cuando importas y algo no cuadra, no se pierde — queda en una
  bandeja aparte (*«N asignaciones quedaron por resolver»*). **Este patrón es oro.**
- Importar el **S-13 desde .xlsx**, exportar a **.csv para Excel**, enlace de mapa y tarjeta en Drive.
- **Métricas**: a qué hora se sale más (`GROUP BY hora ORDER BY salidas DESC`), territorios sin terminar.
- **Feriados** configurables y salidas automáticas.
- Avisa honestamente del límite: *«la prueba de 1 minuto no llega con la app cerrada: es el ahorro de batería»*.

**→ Nos llevamos: la bandeja «por resolver», el importar/exportar y las métricas.**

### 5. `Conferencia` — discursos públicos

Tablas: conferenciantes, bosquejos, congregaciones, fechas del programa, salidas, asambleas,
arreglos del mes, programas generados.

Lo mejor:

- **Bosquejos por conferenciante** (quién puede dar qué), con índice único.
- Importa el **S-99 en .docx, .pdf, .xlsx o texto** — cuatro formatos para lo mismo.
- **Mensajes de asignación y de confirmación** listos para enviar al que viene y al que sale.
- **Los eventos mandan sobre el programa**: *«El evento tiene prioridad y ocupa la fecha; te dejo
  un recordatorio en Seguimiento para avisarles»*.
- Asambleas, visita del superintendente y discursos especiales en un solo lugar.
- Opciones de impresión del PDF (horizontal, una hoja).

**→ Nos llevamos: la prioridad evento > programa y los mensajes listos para enviar.**

### 6. `MeetingCounter` — una sola cosa, perfecta

Contar la asistencia de la reunión y mandarla al secretario. Nada más.

- `CounterScreen`, `HistorialScreen`, `AjustesScreen`.
- `ALTER TABLE registros ADD COLUMN enviado` — sabe qué ya mandaste.
- **Aviso si pasaron N minutos y no has enviado la asistencia.**
- *«Ya hay una asistencia de hoy»* antes de duplicar.
- Mensaje listo: `_Asistencia Total:_ …` → al secretario.

**→ Nos llevamos: el «aún no lo has enviado» y la guarda contra duplicados del mismo día.**

---

## Resumen: lo mejor de cada una

| De | Nos llevamos | Dónde encaja |
|---|---|---|
| mistarea | **Leer el S-147 del mes y sacar las tareas** + reconciliar al recargar | módulo nuevo |
| mistarea | Texto importado = de solo lectura; la fecha y la hora sí son tuyas | módulo nuevo |
| Secretaria | Bloqueo con PIN para lo sensible | `general` |
| Secretaria | Año de servicio y «faltan informes de…» | `informe` |
| S. Servicio | Enlazar nombres escritos distinto | `personas` |
| S. Servicio | Archivo de intercambio entre módulos, con firma de origen | núcleo |
| Territorio | Bandeja **«por resolver»** en toda importación | núcleo |
| Territorio | Métricas simples sobre lo que ya tienes | `informe` |
| Conferencia | El evento manda sobre el programa + recordatorio automático | `agenda` |
| Conferencia | Mensajes de asignación/confirmación listos | `congregacion` |
| MeetingCounter | «No lo has enviado todavía» y no duplicar el mismo día | `congregacion` |

## Lo que Mi Agenda ya hace mejor que las seis

- **Lee PDF escaneado**: ya traes PDF.js **+ Tesseract** en `vendor/`. Las seis se rinden
  (*«pega el texto a mano»*). Tu S-147 va a funcionar aunque sea una foto.
- **Es web/PWA**: se comparte con un enlace, no con un APK por persona.
- **Ya tienes el catálogo de funciones encendibles** (`js/perms.js`) y **el molde de módulo
  suelto** (`modulos/matrimonio/`). Ellos no tienen nada de eso.
