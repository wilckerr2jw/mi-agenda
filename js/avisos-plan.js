// Política de avisos: decide CUÁNTOS avisos salen y CUÁNDO, una vez que ya se sabe qué hay que avisar.
//
// Hay dos sitios que arman la lista del día y los dos pasan por aquí, para que lleguen igual
// por el servidor y por el teléfono:
//   · avisos/run.js   → buildPlan()  (servidor, se ejecuta cada hora)
//   · js/native.js    → planFor()    (app de Android, los programa el propio teléfono)
//
// Tres reglas, en este orden:
//   1. Horas de silencio → lo que cae de noche no suena. No se mueve de hora: simplemente no sale
//      (al día siguiente lo ves en la app y en el resumen de la mañana).
//   2. Juntar los cercanos → varios avisos seguidos se convierten en UNO con varias líneas.
//      Así «hoy vencen 3 tareas» y «2 tareas atrasadas», que salían con un minuto de diferencia,
//      llegan en un solo aviso.
//   3. Tope del día → si aún quedan demasiados, se quedan los más importantes. El resto no suena.
//
// Archivo puro (no importa nada) para poder probarlo con `node --test tests/avisos-plan.test.mjs`.

/** Valores de fábrica. El usuario los cambia en Ajustes → Avisos. */
export const POLITICA = {
  silencio: true,        // respetar las horas de silencio
  silencioDe: 2200,      // 10:00 p. m.
  silencioA: 700,        // 7:00 a. m.
  juntar: 45,            // minutos: los avisos a menos de esto se juntan en uno
  maxDia: 4,             // cuántos avisos programados pueden sonar al día (0 = sin tope)
  log: true,             // el recordatorio de «registra tu actividad» (antes no se podía apagar)
};

// Qué es más importante cuando hay que recortar. Más alto = se queda antes.
const PRIORIDAD = {
  daily: 5,      // el resumen de la mañana: NUNCA se recorta, porque ahí sale lo que no sonó
  soon: 4,       // un evento empieza enseguida
  meeting: 4,    // una reunión empieza en una hora
  task: 3,       // una tarea con hora
  log: 2,        // registrar la actividad del día
  report: 2,     // enviar el informe del mes
  routine: 1,    // una rutina sin marcar
  streak: 1,     // la racha en peligro
  last: 1,       // el último aviso de rutinas de la noche
  tomorrow: 0,   // lo que tienes mañana
  backup: 0,     // acuérdate del respaldo semanal
};
export const prioridad = it => PRIORIDAD[it?.kind] ?? 2;

const hhmmAMin = n => { const v = Number(n) || 0; return Math.floor(v / 100) * 60 + (v % 100); };

/** ¿Ese minuto del día cae dentro de las horas de silencio? */
export function enSilencio(min, p = POLITICA) {
  if (!p.silencio) return false;
  const de = hhmmAMin(p.silencioDe);
  const a = hhmmAMin(p.silencioA);
  if (de === a) return false;                 // sin ventana
  return de > a ? (min >= de || min < a)      // cruza la medianoche (lo normal: 22:00 → 7:00)
    : (min >= de && min < a);                 // dentro del mismo día
}

/**
 * Junta en un solo aviso los que caen a menos de `minutos` uno de otro.
 * El aviso que queda lleva la hora del primero y el tono del más importante del grupo.
 */
export function agrupar(items, minutos = POLITICA.juntar) {
  const orden = [...items].sort((a, b) => a.at - b.at || prioridad(b) - prioridad(a));
  if (minutos <= 0) return orden;

  const grupos = [];
  orden.forEach(it => {
    const g = grupos[grupos.length - 1];
    if (g && it.at - g[0].at <= minutos) g.push(it);
    else grupos.push([it]);
  });

  return grupos.map(g => {
    if (g.length === 1) return g[0];
    // El más importante manda en el tono, en el título y en el botón de acción
    const jefe = [...g].sort((a, b) => prioridad(b) - prioridad(a))[0];
    return {
      at: g[0].at,
      key: `grupo:${g.map(x => x.key).join('+')}`,
      title: jefe.title,
      body: g.map(x => x.body).join('\n'),
      kind: jefe.kind || '',
      eid: jefe.eid || '',
      de: jefe.key,        // de cuál de los originales salen el tono y el botón
      juntos: g.length,
    };
  });
}

/** Deja como mucho `max` avisos: se quedan los más importantes y, a igualdad, los primeros del día. */
export function limitar(items, max = POLITICA.maxDia) {
  if (!max || items.length <= max) return [...items].sort((a, b) => a.at - b.at);
  return [...items]
    .sort((a, b) => prioridad(b) - prioridad(a) || a.at - b.at)
    .slice(0, max)
    .sort((a, b) => a.at - b.at);
}

/**
 * Aplica las tres reglas de una vez. Es lo único que necesitan llamar los dos planificadores.
 * @param {Array<{at:number,key:string,title:string,body:string,kind?:string,eid?:string}>} items
 * @param {object} [p] preferencias del usuario (se completan con POLITICA)
 */
export function aplicar(items, p = {}) {
  const pol = { ...POLITICA, ...p };
  const despiertos = items.filter(it => !enSilencio(it.at, pol));
  return limitar(agrupar(despiertos, Number(pol.juntar) || 0), Number(pol.maxDia) || 0);
}

/** Frase para los ajustes: «Como mucho 4 avisos al día, y nada entre 10:00 p. m. y 7:00 a. m.» */
export function explicar(p = {}) {
  const pol = { ...POLITICA, ...p };
  const hh = n => { const m = hhmmAMin(n); const h = Math.floor(m / 60); return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`; };
  const trozos = [];
  trozos.push(pol.maxDia ? `Como mucho ${pol.maxDia} ${pol.maxDia === 1 ? 'aviso' : 'avisos'} al día` : 'Sin tope de avisos');
  if (pol.juntar > 0) trozos.push(`los que caigan juntos (menos de ${pol.juntar} min) llegan en uno solo`);
  if (pol.silencio) trozos.push(`y nada entre ${hh(pol.silencioDe)} y ${hh(pol.silencioA)}`);
  const frase = trozos.join(', ').replace(', y ', ' y ');
  return frase.endsWith('.') ? frase : `${frase}.`;   // «7:00 a. m.» ya trae su punto
}
