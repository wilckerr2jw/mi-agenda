// 📄 Reconciliar · comparar lo que ya tienes con lo que trae la hoja
//
// La regla, copiada de lo que mejor hacen estas apps: volver a cargar la misma hoja NO duplica
// nada. Se compara punto por punto y se dice claramente qué cambia:
//
//   · nuevas    → puntos que no tenías
//   · cambiadas → el mismo punto, pero la hoja ahora dice otra cosa
//   · iguales   → no se tocan
//   · quitadas  → las tenías de una carga anterior y ya no vienen en la hoja
//
// Lo que escribiste tú (la fecha, la hora, el responsable, el estado y tus notas) se respeta
// siempre. Lo único que manda la hoja es el texto del punto.
//
// Este archivo no toca la base de datos: solo compara y devuelve el plan. Así se puede probar solo.

/** Campos que trae la hoja y que, por tanto, la hoja puede cambiar. */
const DE_LA_HOJA = ['titulo', 'texto', 'apartado', 'apartadoNombre'];

const limpiar = s => String(s || '').replace(/\s+/g, ' ').trim();

/**
 * @param {Array} existentes  tareas de la app que vinieron de este papel y este mes
 * @param {Array} leidas      tareas que acaba de leer el papel
 * @returns {{ nuevas, cambiadas, iguales, quitadas, hayCambios: boolean }}
 */
export function comparar(existentes, leidas) {
  const porClave = new Map(existentes.map(t => [t.origen?.clave, t]));
  const clavesLeidas = new Set(leidas.map(t => t.clave));

  const nuevas = [];
  const cambiadas = [];
  const iguales = [];

  leidas.forEach(leida => {
    const antes = porClave.get(leida.clave);
    if (!antes) { nuevas.push(leida); return; }
    const cambio = DE_LA_HOJA.some(k => limpiar(antes.origen?.[k] ?? antes[k]) !== limpiar(leida[k]));
    (cambio ? cambiadas : iguales).push({ antes, ahora: leida });
  });

  const quitadas = existentes.filter(t => t.origen?.clave && !clavesLeidas.has(t.origen.clave));

  return {
    nuevas,
    cambiadas,
    iguales,
    quitadas,
    hayCambios: nuevas.length > 0 || cambiadas.length > 0 || quitadas.length > 0,
  };
}

/**
 * Frase corta para contarle al usuario qué va a pasar, en su idioma.
 * Ej.: «3 tareas nuevas, 1 cambió y 2 ya no vienen en la hoja».
 */
export function resumen({ nuevas, cambiadas, iguales, quitadas }) {
  const trozos = [];
  const n = (x, uno, varios) => `${x.length} ${x.length === 1 ? uno : varios}`;
  if (nuevas.length) trozos.push(n(nuevas, 'tarea nueva', 'tareas nuevas'));
  if (cambiadas.length) trozos.push(cambiadas.length === 1 ? '1 cambió' : `${cambiadas.length} cambiaron`);
  if (quitadas.length) trozos.push(quitadas.length === 1 ? '1 ya no viene en la hoja' : `${quitadas.length} ya no vienen en la hoja`);
  if (!trozos.length) return iguales.length ? 'Todo estaba ya al día: no hay nada que cambiar.' : 'La hoja no traía ningún punto.';
  if (trozos.length === 1) return `${trozos[0]}.`;
  return `${trozos.slice(0, -1).join(', ')} y ${trozos[trozos.length - 1]}.`;
}

/**
 * Convierte un punto leído en una tarea de la app.
 * `previa` es la tarea que ya existía (si la hubiera): de ella se conserva todo lo tuyo.
 */
export function aTarea(leida, papelId, periodo, previa = null, nuevoId) {
  const origen = {
    papel: papelId,
    periodo,
    clave: leida.clave,
    titulo: leida.titulo,
    texto: leida.texto,
    apartado: leida.apartado,
    apartadoNombre: leida.apartadoNombre,
    cargadoEl: new Date().toISOString().slice(0, 10),
  };
  if (previa) {
    // La hoja manda en el texto; lo demás es tuyo y no se toca.
    return { ...previa, title: leida.titulo, origen: { ...origen, cargadoEl: previa.origen?.cargadoEl || origen.cargadoEl } };
  }
  return {
    id: nuevoId,
    title: leida.titulo,
    kind: 'otro',
    personId: '',
    companionId: '',
    due: leida.due || '',
    dueTime: leida.dueTime || '',
    status: 'pendiente',
    notes: leida.texto,
    responsibleIds: [],
    responsibles: [],
    mine: true,
    deptId: '',
    priority: 'normal',
    log: [],
    repeat: '',
    doneAt: '',
    origen,
  };
}
