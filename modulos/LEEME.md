# 🧩 Módulos · cada función en su propia carpeta

La idea es sencilla: **una función, una carpeta.** Si mañana quieres dejar de ver una
función, borras su carpeta y su línea en `index.html`. Nada más se entera.

```
modulos/
  _nucleo.js          ← el enchufe (lo único que comparten todos)
  LEEME.md            ← este archivo
  matrimonio/         ← 💑 Matrimonio
  papeles/            ← 📄 Papeles (leer el S-147 y sacar las tareas del mes)
  por-resolver/       ← 🗂 Por resolver (la pantalla; la bandeja vive en js/por-resolver.js)
```

## Cómo se hace un módulo

Un archivo, y ya:

```js
import { registrarModulo } from '../_nucleo.js';

registrarModulo({
  id: 'ejemplo',                                        // sin espacios; es también su dirección #/ejemplo
  nombre: 'Ejemplo',
  icono: '🙂',
  feature: 'general.ejemplo',                           // id de js/perms.js (opcional)
  css: new URL('./ejemplo.css', import.meta.url).href,  // opcional
  abrir(sub) { /* dibuja la pantalla, normalmente con S.open({...}) */ },
  tarjetaHoy() { return ''; },                          // opcional: tarjeta en «Hoy»
  seccion: 'congregacion',                              // opcional: vive DENTRO de esa sección,
  resumenSeccion() { return '3 sin cargar'; },          //   sin pestaña propia, como una tarjeta más
  oculto() { return false; },                           // opcional: el usuario lo escondió
});
```

Y una línea en `index.html`, al final del `<body>`:

```html
<script type="module" src="modulos/ejemplo/ejemplo.js"></script><!-- 🙂 Ejemplo: para quitarlo, borra esta línea y la carpeta modulos/ejemplo -->
```

Con eso, el núcleo se encarga solo de:

- ponerlo en **«Más»** (teléfono) y en el **menú de la izquierda** (computadora);
- poner su **tarjeta en «Hoy»**, si la tiene;
- o, con `seccion`, ponerlo **dentro de una sección** (Congregación, Informe…) como una tarjeta más,
  en vez de darle pestaña propia: es lo que hacen Papeles y Por resolver;
- atender la dirección **`#/ejemplo`**;
- repintar cuando cambian los datos o la pantalla;
- **desconectarlo si da error**, para que un módulo roto nunca tumbe la app.

## Las tres reglas

0. **Si el núcleo necesita algo del módulo, se le da la vuelta.** Un archivo de `js/` nunca importa de
   `modulos/`: en su lugar deja un hueco que el módulo rellena al cargarse. Así, borrar el módulo no
   rompe nada; solo deja de ofrecerse esa función. El ejemplo es `js/lectores.js`: el tablero de
   anuncios pregunta «¿alguien sabe leer este PDF?» y el módulo Papeles contesta, si está puesto.
1. **Un módulo no modifica archivos de la app.** Lee `store.js`, `model.js`, `util.js` y
   `sheets.js`, pero no los cambia. Si un módulo necesita tocar el núcleo de la app, es que
   no debería ser un módulo.
2. **Lo que guarda, lo guarda en su sitio.** Sus ajustes van en un único campo del perfil
   (`profile.<id>`), y lo que produce son datos normales de la app (tareas, eventos, notas),
   para que los avisos, el calendario y los respaldos funcionen sin saber nada del módulo.
3. **Se puede apagar de tres maneras**, de menos a más definitiva:
   - el administrador no le activa la función en `js/perms.js`;
   - el propio usuario lo esconde desde los ajustes del módulo (`oculto()`);
   - tú borras su carpeta y su línea de `index.html`.

## Nota sobre el service worker

Los módulos **no van** en la lista `SHELL` de `sw.js`, a propósito: si estuvieran y borraras
una carpeta, la instalación sin internet fallaría entera. Se guardan solos la primera vez que
se usan, igual que las bibliotecas de `vendor/`.

---

## Pasar a módulos lo que ya está hecho

Hoy la mayor parte de la app vive en unos pocos archivos muy grandes:

| Archivo | Tamaño | Qué guarda |
|---|---|---|
| `js/sheets.js` | ~257 KB | todas las pantallas de detalle |
| `js/model.js` | ~94 KB | los cálculos de todo |
| `js/views.js` | ~94 KB | las vistas principales |
| `js/store.js` | ~64 KB | datos y sincronización |
| `js/app.js` | ~65 KB | arranque y navegación |
| `js/mecas.js` | ~58 KB | asignaciones mecánicas |

Pasarlos a módulos de golpe es arriesgado. El orden que menos duele es de fuera hacia
dentro: se empieza por lo que ya está casi suelto y casi no lo usa nadie más.

**Orden sugerido** (cada paso se puede probar y publicar por separado):

1. `js/limpieza.js` → `modulos/limpieza/` — ya es casi independiente.
2. `js/tablero.js` → `modulos/tablero/`
3. `js/asistencia.js` → `modulos/asistencia/` — y de paso añadirle el «aún no se lo has
   mandado al secretario» que hace tan bien MeetingCounter.
4. `js/pastoreo.js` → `modulos/pastoreo/`
5. `js/visita.js` → `modulos/visita/`
6. `js/mecas.js` → `modulos/mecanicas/` — el lector de PDF y OCR ya está sacado aparte en
   `modulos/papeles/lector.js`, así que aquí sobra código.
7. `js/programa.js` + `js/programa-s140.js` → `modulos/programa/`
8. `js/comite.js`, `js/junta.js` → `modulos/ancianos/`

Lo que **no** conviene mover, porque es el núcleo del que viven todos:
`store.js`, `model.js`, `util.js`, `perms.js`, `sheets.js`, `app.js`, `views.js`.
A esos lo que les hace falta es partirlos en archivos más pequeños **dentro de `js/`**
(por ejemplo `sheets-tarea.js`, `sheets-persona.js`, `sheets-evento.js`), que es otro
trabajo distinto y sin riesgo de romper módulos.
