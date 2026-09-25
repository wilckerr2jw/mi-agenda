// Guía rápida dentro de la app: corta y a la medida de cada usuario.
// Cada tema tiene una condición («when»): solo se muestra lo que esa persona realmente usa
// según su tipo de perfil, si es precursor, si es administrador y qué secciones tiene visibles.
//
// MANTENERLA AL DÍA: cuando cambie algo que el usuario ve, ajustar aquí el tema correspondiente
// (y también la guía completa para compartir, guia.html).

import { isCloud, session } from './store.js';
import * as M from './model.js';

// Contexto del usuario actual
function ctx() {
  const v = M.profile();
  return {
    v,
    type: M.profileType(),                        // publicador | precursor | anciano
    pioneer: M.isPioneer(v),
    elder: M.profileType() === 'anciano',
    admin: isCloud && session.isAdmin,
    cloud: isCloud,
    hasGoal: v.goalEnabled && Number(v.goalMonthly) > 0,
    on: id => M.isModuleVisible(id),
  };
}

const k = s => `<b class="k">${s}</b>`;   // nombre de un botón tal como aparece en la app

// Temas. «g» agrupa los temas bajo un título.
const TOPICS = [
  // ───── Lo básico (para todos)
  { g: 'Lo básico', t: 'Moverte por la app', when: () => true,
    b: c => `Usa la barra de abajo para cambiar de sección. El botón verde ${k('+')} agrega algo donde estás. Arriba: 🔍 buscar, 🌙 tema y ${k('⋯')} Ajustes. Si borras algo por error, toca ${k('Deshacer')}.` },
  { g: 'Lo básico', t: 'Accesos rápidos', when: () => true,
    b: () => `En Hoy tienes botones para lo que más usas (registrar tiempo, nueva tarea, nueva reunión…). Elige cuáles en Ajustes → ${k('Accesos rápidos')}. En Android también aparecen al mantener presionado el ícono de la app.` },
  { g: 'Lo básico', t: 'Recorrido por la app', when: () => true,
    b: () => `¿Quieres ver de nuevo dónde está cada cosa? Ajustes → ${k('Recorrido por la app')}.` },
  { g: 'Lo básico', t: 'Hoy de un vistazo', when: () => true,
    b: () => `Arriba ves el saludo y unas tarjetas con lo de hoy (compromisos, tareas, tu meta, la próxima reunión): tócalas para ir directo. Si hoy hay reunión con agenda, aparece ${k('▶ Iniciar la junta de hoy')}.` },
  { g: 'Lo básico', t: 'Color y tamaño de letra', when: () => true,
    b: () => `Ajustes → ${k('Apariencia')}: elige el color de la app y el ${k('Tamaño de letra')} (Normal, Grande o Muy grande). Se guarda en cada teléfono.` },
  { g: 'Lo básico', t: 'App de Android', when: () => true,
    b: () => `En ${k('⋯ → Ayuda → Descargar la app (APK)')} instalas la app de Android: avisos exactos sin internet y con sonidos propios. Cuando haya una versión nueva de la app, en Hoy aparece ${k('📲 Hay una actualización de la app')}; tócalo e instálala encima (no se borra nada).` },
  { g: 'Lo básico', t: 'Sin internet', when: () => true,
    b: c => `Puedes registrar todo sin señal${c.cloud ? '; se sincroniza solo cuando vuelve la conexión' : ''}.` },

  // ───── Agenda y tareas
  { g: 'Agenda y tareas', t: 'Marcar como hecho y rachas', when: c => c.on('agenda'),
    b: () => `En los eventos que se repiten (texto diario, lectura…) aparece un círculo a la derecha: tócalo para marcarlo ${k('hecho')} ese día. Si lo haces varios días seguidos verás 🔥 y cuántos van. En los compartidos también ves ✓ quién más lo hizo.` },
  { g: 'Agenda y tareas', t: 'Semana: mover y cambiar la duración', when: c => c.on('agenda'),
    b: () => `Agenda → ${k('Semana')}: toda la semana por horas, como un calendario. <b>Arrastra</b> un evento para cambiarlo de hora o de día (con el dedo: mantenlo presionado un momento y muévelo); la rayita de abajo cambia cuánto dura. Si se repite, te pregunta si es ${k('Solo el …')} o ${k('Todas las fechas')}. ${k('Enviar como imagen')} la manda por WhatsApp.` },
  { g: 'Agenda y tareas', t: 'Crear tocando la Semana, 3 días y plantillas', when: c => c.on('agenda'),
    b: () => `En ${k('Semana')}, toca un espacio vacío y se abre un evento nuevo ya con ese día y esa hora. Con ${k('3 días')} ves menos días con letra más grande (cómodo en el teléfono). En ${k('📑 Plantillas')} guardas cómo es una semana y la aplicas a otra con un toque: solo se agrega lo que falta.` },
  { g: 'Agenda y tareas', t: 'Color de cada evento', when: c => c.on('agenda'),
    b: () => `En el evento elige un ${k('Color')} (celeste, amarillo, lila…) para que la agenda se vea como tu calendario impreso. ${k('Del tipo')} usa el color de su tipo.` },
  { g: 'Agenda y tareas', t: 'Cambiar solo un día o duplicar', when: c => c.on('agenda'),
    b: () => `Toca un evento que se repite en una fecha puntual y elige ${k('Cambiar solo el …')}: ese día queda aparte (otra hora, otro lugar) y los demás siguen igual. Con ${k('Duplicar evento')} creas uno parecido sin escribir todo otra vez.` },
  { g: 'Agenda y tareas', t: 'Compartir un evento', when: c => c.cloud && c.on('agenda'),
    b: () => `En el evento, marca a quién en ${k('Compartir con')} y guarda: le aparece en su Agenda (👥) y le llega un aviso. Los dos pueden cambiarlo; solo quien lo creó lo borra para todos. Quien lo recibe puede tocar ${k('Quitar de mi agenda')}. Usa ${k('Tema sugerido')} para, por ejemplo, la noche de adoración en familia.` },
  { g: 'Agenda y tareas', t: 'Eventos que se repiten', when: c => c.on('agenda'),
    b: () => `Al crear un evento elige ${k('Cada día')}, ${k('Algunos días de la semana')} (marcas cuáles), ${k('Cada semana')}, ${k('Cada 2 semanas')} o ${k('Cada mes')}. Arriba de la Agenda cambia entre ${k('Mes')}, ${k('Próximos')} (los próximos 30 días en lista) y ${k('Todos')} (cada evento una vez, para revisarlo, compartirlo o borrarlo). En ${k('Todos')}, ${k('Seleccionar varios')} te deja marcar muchos y ${k('Compartir')} o ${k('Eliminar')} de una vez (con ${k('Deshacer')}). Para saltarte un día puntual, toca el evento en esa fecha y elige ${k('Cancelar solo el …')}.` },
  { g: 'Agenda y tareas', t: 'Reuniones del cuerpo de ancianos', when: c => c.on('agenda') && c.elder,
    b: () => `Con el tipo ${k('Cuerpo de ancianos')} puedes marcar varios participantes o grupos a la vez.` },
  { g: 'Agenda y tareas', t: 'Tareas con seguimiento', when: c => c.on('tareas'),
    b: () => `Dentro de una tarea escribe cada avance en ${k('Seguimiento')}. Toca el círculo para marcarla como hecha.` },
  { g: 'Agenda y tareas', t: 'Tipos propios', when: c => c.on('tareas') || c.on('agenda'),
    b: () => `En «Tipo» elige ${k('✏️ Nuevo tipo…')} y escríbelo (por ejemplo «Pastoreo»): queda en la lista para la próxima vez. Los quitas en Ajustes → ${k('Tus tipos propios')}.` },
  { g: 'Agenda y tareas', t: 'Responsables', when: c => c.on('tareas'),
    b: () => `En la tarea marca ${k('Yo')} y/o a las personas que la harán. A quien no esté en Personas escríbelo abajo y tócalo en ${k('+ Agregar a Personas')}. Si marcas a otros y no a ti, la supervisas.` },

  // ───── Personas y notas
  { g: 'Personas y notas', t: 'Personas', when: c => c.on('personas'),
    b: c => `En la ficha de cada persona tienes ${k('Llamar')}, ${k('WhatsApp')} y sus tareas.${c.elder ? ` Usa ${k('Grupos')} para tu cuerpo de ancianos o tus grupos de predicación.` : ''}` },
  { g: 'Personas y notas', t: 'Notas y reuniones', when: c => c.on('notas'),
    b: () => `Puedes vincular una nota a una persona o a una reunión. En una reunión anotas los temas a tratar y los acuerdos.` },
  { g: 'Personas y notas', t: 'Preparar la agenda de una reunión', when: c => c.on('notas'),
    b: () => `En la reunión, ${k('+ Agregar punto')}: escribe el punto, quién lo presenta, los minutos y si es ${k('Para decidir')}, ${k('Informativo')}, ${k('Seguimiento')} o ${k('Asignación')}. Ponle ${k('Referencia')} (se ordena sola) y subpuntos si hace falta; si es ${k('Confidencial')}, al enviar solo sale su título; en ${k('Recibir puntos hasta')} eliges la fecha tope; marca ${k('No incluir en la agenda que se envía')} para lo que solo tratarás con algunos. Con ${k('⇣ Pegar varios puntos')} cargas una lista de una vez, y con ${k('Duración máxima')} la app te avisa si te pasas. Con ${k('↻ Temas anteriores')} traes lo pendiente de otras reuniones, resumido en un solo punto general o uno por uno. Con ${k('⇄ Unir puntos')} juntas varios en uno (los demás quedan como subpuntos) y con ${k('👥 Asignar')} pones de una vez quién hace las oraciones y quién presenta cada punto (marca grupos o personas, uno o varios). ${k('Preparar la próxima reunión')} crea la siguiente con los mismos datos. ${k('Enviar agenda')} la manda por WhatsApp (los puntos 🔒 confidenciales salen solo con su título) y ${k('Pasar a acuerdos')} copia los puntos para anotar lo acordado.` },
  { g: 'Personas y notas', t: 'Hora de cada punto', when: c => c.on('notas'),
    b: () => `Con la hora de la reunión puesta, la agenda calcula a qué hora empieza cada punto y muestra una barra de colores con el tiempo de cada tipo. Marca ${k('Mostrar la hora de cada punto al enviar')} si quieres que salga en el mensaje.` },
  { g: 'Personas y notas', t: 'Modo junta', when: c => c.on('notas'),
    b: () => `En la reunión, ${k('▶ Modo junta')} (o desde Hoy) abre el punto actual en grande con su cronómetro: se pone ámbar si te pasas y rojo si te pasas mucho. ${k('Guardar acuerdo')} lo anota en «Acuerdos y notas»; ${k('Siguiente ▶')} pasa al otro punto. Al ${k('Terminar junta')} ves cuánto duró cada punto frente a lo previsto. La pantalla se queda encendida mientras está abierto.` },
  { g: 'Personas y notas', t: 'Plantillas de agenda', when: c => c.on('notas'),
    b: () => `En la agenda, ${k('📑 Plantillas')}: guarda una agenda que repites (por ejemplo, la junta mensual) y cárgala con un toque en la próxima.` },
  { g: 'Personas y notas', t: 'Supervisión y participación', when: c => c.on('notas') && c.on('tareas') && c.elder,
    b: () => `En Reuniones: ${k('📋 Supervisión')} muestra las tareas de las reuniones (atrasadas, en curso, pendientes y hechas), con su última novedad, y la puedes ${k('Enviar')}. ${k('📊 Participación')} cuenta quién presentó puntos o hizo oraciones en 3, 6 o 12 meses, y quién con privilegios no ha participado.` },
  { g: 'Personas y notas', t: 'De acuerdo a tarea', when: c => c.on('notas') && c.on('tareas'),
    b: () => `En «Acuerdos y notas» escribe un acuerdo por línea, por ejemplo «Ana: los hermanos Pedro y Juan hablarán con ella el viernes». La app reconoce a quién atender, quiénes son responsables y la fecha. Toca ${k('Crear tarea')}, revísala y guárdala.` },
  { g: 'Personas y notas', t: '¿Me toca a mí o lo superviso?', when: c => c.on('notas') && c.on('tareas'),
    b: c => `Escribe ${k('Tu nombre')} y ${k('Cómo te escriben')} en Mi perfil (por ejemplo «Tony, Antonio J.»). Así cada acuerdo sale como 👉 ${k('Te toca a ti')} o 👁 ${k('Supervisas')}.${c.elder ? ' Las que supervisas aparecen en Hoy, en «Por supervisar», cuando llevan 7 días sin novedades.' : ''} En Tareas puedes filtrar ${k('Me tocan a mí')} o ${k('Las que superviso')}.` },
  { g: 'Personas y notas', t: 'Privilegios de cada persona', when: c => c.on('personas') && c.elder,
    b: () => `En la ficha de una persona, ${k('Editar')} → ${k('Privilegios y responsabilidades')}: toca para marcar (Secretario, Superintendente de servicio…) o escribe otro y ${k('Agregar')}. En Personas puedes filtrar por privilegio.` },
  { g: 'Personas y notas', t: 'Nombres con apodos', when: c => c.on('personas'),
    b: () => `En la ficha de una persona, ${k('También escrito como')} guarda sus apodos u otras formas de escribir su nombre, para que la app la reconozca en los acuerdos.` },

  // ───── Mi Informe
  { g: 'Mi Informe', t: 'Registrar tiempo', when: c => c.on('informe'),
    b: () => `En Informe toca ${k('+')}, elige la categoría, ajusta con ${k('+1h')} ${k('+5m')}, agrega tus cursos bíblicos y ${k('Guardar')}.` },
  { g: 'Mi Informe', t: 'Tiempo de crédito', when: c => c.on('informe'),
    b: () => `LDC, Betel y las categorías que marques como crédito no cuentan para tu meta, pero se ven aparte en un tono más claro.` },
  { g: 'Mi Informe', t: 'Tus propias categorías (ej. CEH)', when: c => c.on('informe'),
    b: () => `${k('Editar mi perfil')} → ${k('Categorías propias de Mi Informe')}: escribe el nombre (el icono se sugiere solo), marca si es crédito, ${k('Agregar categoría')} y ${k('Guardar')}. No la pongas en «Otro» de «Sirvo como…».` },
  { g: 'Mi Informe', t: 'Activar tu meta', when: c => c.on('informe') && c.pioneer && !c.hasGoal,
    b: () => `En ${k('Editar mi perfil')} marca ${k('Meta personal')} y pon tu meta mensual (por ejemplo, 50). Así verás cómo vas.` },
  { g: 'Mi Informe', t: '¿Cómo voy? 🐢 🦉 🐇', when: c => c.on('informe') && (c.hasGoal || c.pioneer),
    b: () => `La <b>marca roja</b> de la barra es donde deberías ir hoy. 🐢 vas por debajo, 🦉 vas al ras, 🐇 vas por delante. «Para ir al día» es lo que te falta para alcanzar la marca; «para tu meta», lo que falta para completar el mes.` },
  { g: 'Mi Informe', t: 'Mi semana', when: c => c.on('informe'),
    b: c => `En la tarjeta ${k('Mi semana')} toca ${k('Planear')} y pon las horas de cada día. La app te dice cuánto harías en el mes${c.hasGoal || c.pioneer ? ' y si alcanzas tu meta' : ''}.` },
  { g: 'Mi Informe', t: 'Objetivos de la semana', when: c => c.on('informe') && c.pioneer,
    b: () => `Debajo de Mi semana escribe tus objetivos como precursor y márcalos al cumplirlos. Cada lunes empieza una lista nueva.` },
  { g: 'Mi Informe', t: 'Enviar tu informe', when: c => c.on('informe'),
    b: () => `Abre el mes y toca ${k('Enviar')} para mandarlo por WhatsApp, correo o SMS.` },

  // ───── Tus datos
  { g: 'Tus datos', t: 'Bloqueo con PIN', when: () => true,
    b: c => `Ajustes → ${k('Activar bloqueo con PIN')}: la app lo pedirá al abrirla y al volver a ella. Mientras está en segundo plano, el contenido se ve borroso.${c.cloud ? ' Si lo olvidas, cierra sesión y vuelve a entrar.' : ''}` },
  { g: 'Tus datos', t: 'Desbloquear con la huella', when: () => true,
    b: () => `Con el PIN activo, en Ajustes → Privacidad marca ${k('Desbloquear también con la huella')} (o la cara, según el teléfono). El PIN sigue sirviendo si la huella falla.` },
  { g: 'Tus datos', t: 'Avisos en el teléfono', when: c => c.cloud,
    b: () => `Ajustes → ${k('Avisos')} → ${k('Recibir avisos en este teléfono')} (debe decir «✓ Este teléfono está registrado»). Por la mañana llega un resumen; durante el día, avisos antes de cada evento (tú eliges cuántos minutos), tareas con hora, reuniones 1 hora antes, «aún no marcaste la lectura de hoy», racha en peligro, cuando alguien de tu familia hace una rutina compartida, lo de mañana por la noche y el recordatorio del informe. Apaga los que no quieras. En las rutinas el aviso trae ${k('✓ Ya lo hice')} para marcarla sin abrir nada. Cada noche llega el aviso importante ${k('📝 Registra tu actividad de hoy')} (eliges la hora). En ${k('🔊 Sonidos de Mi Agenda')} eliges y descargas un sonido propio; para que el teléfono lo use: mantén presionado un aviso → ⚙️ → Sonido → personalizado. En iPhone, primero instala la app en la pantalla de inicio.` },
  { g: 'Tus datos', t: 'Respaldo', when: () => true,
    b: () => `En Ajustes, ${k('Descargar respaldo')} guarda una copia de todo. Hazlo de vez en cuando.` },
  { g: 'Tus datos', t: 'Secciones que no usas', when: () => true,
    b: () => `En Ajustes → ${k('Secciones visibles')} puedes ocultarlas para que la barra de abajo quede más simple.` },

  // ───── Administrador
  { g: 'Administración', t: 'Aprobar cuentas', when: c => c.admin,
    b: () => `Ajustes → ${k('Administrar usuarios')}: las cuentas nuevas aparecen como «Pendiente». Elige su tipo y se les abre la app. No ves los datos de nadie.` },
];

// Temas que aplican a este usuario, agrupados
export function guideGroups() {
  const c = ctx();
  const groups = [];
  TOPICS.filter(x => x.when(c)).forEach(x => {
    let g = groups.find(y => y.g === x.g);
    if (!g) groups.push(g = { g: x.g, items: [] });
    g.items.push({ t: x.t, b: x.b(c) });
  });
  return groups;
}

// Texto corto de a quién está dirigida la guía (p. ej. «Precursor»)
export function guideAudience() {
  const c = ctx();
  if (!c.cloud) return '';
  const n = M.PROFILE_TYPES[c.type].n;
  return c.pioneer && c.type !== 'precursor' ? `${n} y precursor` : n;
}
