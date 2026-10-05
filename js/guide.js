// Guía rápida dentro de la app: corta y a la medida de cada usuario.
// Cada tema tiene una condición («when»): solo se muestra lo que esa persona realmente usa
// según su tipo de perfil, si es precursor, si es administrador y qué secciones tiene visibles.
//
// MANTENERLA AL DÍA: cuando cambie algo que el usuario ve, ajustar aquí el tema correspondiente
// (y también la guía completa para compartir, guia.html).

import { isCloud, session, data } from './store.js';
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
    depts: (data.depts || []).length > 0,
  };
}

const k = s => `<b class="k">${s}</b>`;   // nombre de un botón tal como aparece en la app

// Temas. «g» agrupa los temas bajo un título.
const TOPICS = [
  // ───── Lo básico (para todos)
  { g: 'Lo básico', t: 'Moverte por la app', when: () => true,
    b: c => `Usa la barra de abajo para cambiar de sección: Hoy, Agenda, Tareas, Informe y ${k('Más')} (ahí están Personas, Notas, Congregación, Buscar y Ajustes). El botón verde ${k('+')} agrega algo donde estás. Arriba: 🔍 buscar, 🌙 tema y ${k('⋯')} Ajustes. Si borras algo por error, toca ${k('Deshacer')}.` },
  { g: 'Lo básico', t: '🖥 En la computadora', when: () => true,
    b: () => `Abre la app en el navegador de la computadora con tu mismo correo. Verás un menú a la izquierda, las listas en columnas y las ventanas en el centro. Atajos: ${k('1')}–${k('7')} secciones, ${k('N')} agregar, ${k('/')} buscar, ${k('Esc')} cerrar.` },
  { g: 'Lo básico', t: 'Accesos rápidos', when: () => true,
    b: () => `En Hoy tienes botones para lo que más usas (registrar tiempo, nueva tarea, nueva reunión…). Elige cuáles en Ajustes → ${k('Accesos rápidos')}. En Android también aparecen al mantener presionado el ícono de la app.` },
  { g: 'Lo básico', t: 'Recorrido por la app', when: () => true,
    b: () => `¿Quieres ver de nuevo dónde está cada cosa? Ajustes → ${k('Recorrido por la app')}.` },
  { g: 'Lo básico', t: 'Hoy de un vistazo', when: () => true,
    b: () => `Arriba ves el saludo y unas tarjetas con lo de hoy (compromisos, tareas, tu meta, la próxima reunión): tócalas para ir directo. Si hoy hay reunión con agenda, aparece ${k('▶ Iniciar la junta de hoy')}.` },
  { g: 'Lo básico', t: 'Color y tamaño de letra', when: () => true,
    b: () => `Ajustes → ${k('Apariencia')}: elige el color de la app y el ${k('Tamaño de letra')} (Normal, Grande o Muy grande). Se guarda en cada teléfono.` },
  { g: 'Lo básico', t: 'App de Android', when: () => true,
    b: () => `En ${k('⋯ → Ayuda → Descargar la app (APK)')} instalas la app de Android: avisos exactos sin internet y con sonidos propios. Pon el widget ${k('Agenda Teocrática · Hoy')} en tu pantalla de inicio (mantén presionado un espacio vacío → Widgets) para ver lo de hoy y registrar con un toque. En el aviso de la noche, ${k('Hoy no salí')} evita que te lo recuerde otra vez. Cuando haya una versión nueva de la app, en Hoy aparece ${k('📲 Hay una actualización de la app')}; tócalo e instálala encima (no se borra nada). Si un aviso no te llega, Ajustes → Avisos → ${k('🩺 Revisar mis avisos')} te dice qué falta (batería, permisos…) y cómo arreglarlo. En el widget, los botones ${k('✓')} marcan tus rutinas de hoy sin buscarlas.` },
  { g: 'Lo básico', t: 'Sin internet', when: () => true,
    b: c => `Puedes registrar todo sin señal${c.cloud ? '; se sincroniza solo cuando vuelve la conexión' : ''}.` },

  // ───── Agenda y tareas
  { g: 'Agenda y tareas', t: 'Marcar como hecho y rachas', when: c => c.on('agenda'),
    b: () => `En los eventos que se repiten (texto diario, lectura…) aparece un círculo a la derecha: tócalo para marcarlo ${k('hecho')} ese día. Si lo haces varios días seguidos verás 🔥 y cuántos van. En los compartidos también ves ✓ quién más lo hizo. Con ${k('🔔 Es una rutina')} (dentro del evento), si no la marcas te llega «¿Ya lo hiciste?» y un último aviso a las 9:00 p. m.` },
  { g: 'Agenda y tareas', t: 'Semana: mover y cambiar la duración', when: c => c.on('agenda'),
    b: () => `Agenda → ${k('Semana')}: toda la semana por horas, como un calendario. <b>Arrastra</b> un evento para cambiarlo de hora o de día (con el dedo: mantenlo presionado un momento y muévelo); la rayita de abajo cambia cuánto dura. Si se repite, te pregunta si es ${k('Solo el …')} o ${k('Todas las fechas')}. ${k('Enviar como imagen')} la manda por WhatsApp.` },
  { g: 'Agenda y tareas', t: 'Crear tocando la Semana, 3 días y plantillas', when: c => c.on('agenda'),
    b: () => `En ${k('Semana')}, toca un espacio vacío y se abre un evento nuevo ya con ese día y esa hora. Con ${k('3 días')} ves menos días con letra más grande (cómodo en el teléfono). En ${k('📑 Plantillas')} guardas cómo es una semana y la aplicas a otra con un toque: solo se agrega lo que falta.` },
  { g: 'Agenda y tareas', t: 'Color de cada evento', when: c => c.on('agenda'),
    b: () => `En el evento elige un ${k('Color')} (celeste, amarillo, lila…) para que la agenda se vea como tu calendario impreso. ${k('Del tipo')} usa el color de su tipo.` },
  { g: 'Agenda y tareas', t: 'Cambiar solo un día o duplicar', when: c => c.on('agenda'),
    b: () => `Toca un evento que se repite en una fecha puntual y elige ${k('Cambiar solo el …')}: ese día queda aparte (otra hora, otro lugar) y los demás siguen igual. Con ${k('Duplicar evento')} creas uno parecido sin escribir todo otra vez.` },
  { g: 'Agenda y tareas', t: 'Enviarle una tarea a otra cuenta', when: c => c.cloud && c.on('tareas'),
    b: () => `En Personas, abre su ficha y elige su ${k('📲 Cuenta en la app')} (la app te la sugiere si el nombre se parece). Después, en la tarea, márcala como responsable y elige ${k('Enviársela a …')}. Le llega para aceptarla; ella anota avances y la marca hecha, y tú lo ves. Cambiarla o borrarla solo lo haces tú.` },
  { g: 'Agenda y tareas', t: 'Compartir un evento', when: c => c.cloud && c.on('agenda'),
    b: () => `En el evento, marca a quién en ${k('Compartir con')} y guarda: le aparece en su Agenda (👥) y le llega un aviso. Solo quien lo creó lo cambia o lo borra para todos; los demás marcan su ✓ y pueden tocar ${k('Quitar de mi agenda')} (a los demás no se les borra). Usa ${k('Tema sugerido')} para, por ejemplo, la noche de adoración en familia.` },
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
  { g: 'Personas y notas', t: 'Ordenar mis tareas', when: c => c.on('tareas'),
    b: c => `En Tareas las activas se agrupan en Atrasadas, Hoy, Próximos 7 días, Más adelante y Sin fecha. En cada tarea elige la ${k('Prioridad')}: las 🔴 de prioridad alta van primero y las ⬇ de baja prioridad quedan al final. Arriba cambias entre ${k('☰ Lista')} y ${k('▦ Tarjetas')}.${c.depts ? ` Con ${k('🏢 Por departamento')} las ves agrupadas por el departamento que las ejecuta (lo eliges en la tarea, en ${k('🏢 Departamento que la ejecuta')}). Para cambiarla de departamento, arrástrala por su ${k('⠿')} hasta el otro, o toca ${k('⠿')} y elígelo.` : ''}` },
  { g: 'Personas y notas', t: '¿Me toca a mí o lo superviso?', when: c => c.on('notas') && c.on('tareas'),
    b: c => `Escribe ${k('Tu nombre')} y ${k('Cómo te escriben')} en Mi perfil (por ejemplo «Tony, Antonio J.»). Así cada acuerdo sale como 👉 ${k('Te toca a ti')} o 👁 ${k('Supervisas')}.${c.elder ? ' Las que supervisas aparecen en Hoy, en «Por supervisar», cuando llevan 7 días sin novedades.' : ''} En Tareas puedes filtrar ${k('Me tocan a mí')} o ${k('Las que superviso')}.` },
  { g: 'Personas y notas', t: 'Asignar tareas a un departamento', when: c => c.on('tareas') && c.on('congregacion'),
    b: () => `Abre el departamento en Congregación y toca ${k('＋ Asignar una tarea')}: ya lleva a su responsable. Debajo están las 💡 sugeridas (por ejemplo, «Montar el programa de audio y video»). Para asignar varias a la vez, toca ${k('💡 Asignar tareas sugeridas')} en Congregación.` },
  { g: 'Personas y notas', t: 'Privilegios de cada persona', when: c => c.on('personas') && c.elder,
    b: () => `En la ficha de una persona, ${k('Editar')} → ${k('Privilegios y responsabilidades')}: toca para marcar (Secretario, Superintendente de servicio…) o escribe otro y ${k('Agregar')}. En Personas puedes filtrar por privilegio.` },
  { g: 'Personas y notas', t: 'Nombres con apodos', when: c => c.on('personas'),
    b: () => `En la ficha de una persona, ${k('También escrito como')} guarda sus apodos u otras formas de escribir su nombre, para que la app la reconozca en los acuerdos.` },

  { g: 'Congregación', t: 'Enlace para los ancianos', when: c => c.on('congregacion') && c.elder,
    b: () => `En Congregación → ${k('📋 Para el Cuerpo de ancianos')} → ${k('🔗 Enlace para los ancianos')}: eliges qué ven (agenda de la próxima reunión, organigrama, acuerdos y tareas, visita del superintendente, mecánicas) y mandas el enlace y, aparte, la clave de 6 números. No necesitan la app; va cifrado y se actualiza solo. Puedes cambiar la clave o apagarlo cuando quieras.` },
  { g: 'Congregación', t: 'Compartir la congregación con otro anciano', when: c => c.cloud && c.on('congregacion') && c.elder,
    b: () => `En Congregación toca ${k('👥 Compartir la congregación con otro anciano')} y marca su cuenta. Él ve en su app tu organigrama, grupos, mecánicas, visita y publicadores, siempre al día y solo lectura. Si a ti te la comparten, en Hoy te sale para tocar ${k('Usar esta congregación')}.` },
  { g: 'Personas y notas', t: 'Compartir una nota o una tarea', when: c => c.cloud && c.elder,
    b: () => `Abre la nota o la tarea y toca ${k('👥 Compartir con otro anciano…')}. Él la ve al día en ${k('👥 Compartido conmigo')} y los dos pueden comentar; solo tú cambias el contenido.` },
  { g: 'Congregación', t: 'Programa de asignaciones mecánicas', when: c => c.on('congregacion') && c.elder,
    b: () => `En Congregación → ${k('🎛 Asignaciones mecánicas')} → ${k('📥 Importar programa')}: foto, PDF, archivo de texto o pegado (sirve «Audio: Nombre» con la fecha arriba). Lo ves en tarjetas por fecha o ${k('👤 Hermanos')}, lo mandas con ${k('🖼 Compartir imagen')}, lo imprimes en hoja carta y con ${k('💬 Avisar a los hermanos')} le mandas a cada uno lo suyo.` },
  { g: 'Agenda y tareas', t: 'Recordar tareas atrasadas por WhatsApp', when: c => c.on('tareas'),
    b: () => `Si otros tienen tareas atrasadas o por vencer, en Tareas toca ${k('💬 Recordar por WhatsApp')}: a cada responsable le llega su lista en un mensaje listo para enviar. Con ${k('📋 Copiar')} lo pegas donde quieras (en la computadora, con Ctrl+V en WhatsApp Web).` },
  { g: 'Tus datos', t: 'Google Calendar automático', when: () => true,
    b: () => `Ajustes → ${k('Mis datos')} → ${k('Conectar con Google Calendar')}. Una sola vez pones un pequeño programa en tu cuenta de Google (la app te da el código y los pasos) y desde ahí tu agenda aparece sola en el calendario «Mi Agenda Teocrática», con lo que cambias o borras aquí.` },
  { g: 'Personas y notas', t: 'Seguimiento de cursos y pastoreo', when: c => c.on('personas'),
    b: c => `En la ficha de una persona toca ${k('＋ Anotar visita')} (curso bíblico, revisita${c.elder ? ' o pastoreo' : ''}). En Personas → ${k('Seguimiento')} ves quién necesita tu visita primero.${c.elder ? ` Con ${k('📥 Cargar visitas anteriores')} pegas tu registro de antes (nombre y fecha por línea).` : ''}` },
  { g: 'Agenda y tareas', t: 'Mis asignaciones', when: c => c.on('agenda'),
    b: () => `Crea un evento de tipo ${k('Mi asignación')}: elige la parte, escribe el tema y cuántos días antes prepararte. Sale en Hoy y en el resumen de la mañana.` },
  { g: 'Mi Informe', t: 'Tu año de servicio', when: c => c.on('informe'),
    b: () => `En Informe, la gráfica «Tu año de servicio» muestra tus horas por mes, tu promedio, tu mejor mes y cuántas tendrías al final del año si sigues así.` },

  { g: 'Personas y notas', t: 'Organigrama de la congregación', when: c => c.on('congregacion'),
    b: () => `En ${k('Congregación')} toca ${k('Cargar departamentos sugeridos')}, luego cada departamento para poner a su responsable y ayudantes. ${k('Compartir imagen')} lo manda por WhatsApp y ${k('🖨 Imprimir carta (2 hojas)')} lo deja listo para imprimir con letra grande (organigrama y nombramientos). Al elegir responsables, la app te avisa si esa responsabilidad es para ancianos o si hay más auxiliares de los indicados.` },

  // ───── Mi Informe
  { g: 'Mi Informe', t: 'Registrar tiempo', when: c => c.on('informe'),
    b: () => `En Informe toca ${k('+')}, elige la categoría, ajusta con ${k('+1h')} ${k('+5m')}, agrega tus cursos bíblicos y ${k('Guardar')}. Con ${k('➕ Campos adicionales')} anotas también cartas, publicaciones, kilómetros o lo que quieras llevar.` },
  { g: 'Mi Informe', t: '✏️ Corregir un mes anterior', when: c => c.on('informe'),
    b: () => `En Informe toca ${k('✏️ Corregir un mes anterior')}, elige el mes (también de años pasados) y escribe el total correcto de horas, crédito, cursos u otros datos. ${k('Guardar cambios')} ajusta solo ese mes y puedes ${k('Deshacer')}.` },
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
    b: () => `En Ajustes, ${k('Descargar respaldo')} guarda una copia de todo. Además, cada semana se hace sola una copia automática: en Ajustes → Mis datos → ${k('Ver copias automáticas')} la restauras completa o solo el perfil.` },
  { g: 'Tus datos', t: 'Secciones que no usas', when: () => true,
    b: () => `En Ajustes → ${k('Secciones visibles')} puedes ocultarlas para que la barra de abajo quede más simple.` },

  // ───── Administrador
  { g: 'Administración', t: 'Aprobar cuentas', when: c => c.admin,
    b: () => `Ajustes → ${k('Administración')}: las cuentas nuevas aparecen como «Pendiente». Elige su tipo y se les abre la app. No ves los datos de nadie.` },
  { g: 'Administración', t: 'Secciones y funciones de cada cuenta', when: c => c.admin,
    b: () => `En ${k('Administración')} → ${k('Usuarios')} tocas una cuenta y marcas qué secciones y funciones puede usar; en ${k('Plantillas')} decides lo que trae cada tipo de perfil (y puedes crear tipos propios).` },
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
  const n = M.typeName(c.type);
  return c.pioneer && c.type !== 'precursor' ? `${n} y precursor` : n;
}
