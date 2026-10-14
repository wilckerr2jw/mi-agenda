// 📄 S-21 · «Registro de publicador de la congregación» (las tarjetas del grupo)
//
// El problema que resuelve: para poner al día a los publicadores de tu grupo habría que entrar uno
// por uno en cada ficha. Aquí subes el PDF de las tarjetas y se actualizan todos de una vez.
//
// Lo que saca de cada tarjeta: el nombre, el grupo, si es hermano o hermana y sus privilegios
// (anciano, siervo ministerial, precursor regular, especial o misionero).
//
// Lo que NO saca: la rejilla de meses (participación, cursos y horas). Eso es el informe de ESA
// persona, y «Mi Informe» solo lleva el tuyo; meterlo en la ficha de otro no tendría dónde vivir.
// La fecha de nacimiento y la de bautismo tampoco: la app no tiene esos campos y no conviene
// guardar datos delicados de otros en las notas.
//
// Para dejar de leer este papel: borra este archivo y pon `hecho: false` en registro.js.

const sinTildes = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const limpiar = t => String(t || '').replace(/\s+/g, ' ').trim();

// Las casillas del PDF: ☑ marcada, ☐ vacía (algunos lectores las dan como X o como un cuadrito raro)
const MARCADA = /[☑☒✓✔x]/i;
const esMarca = c => MARCADA.test(c);

// Los privilegios de la tarjeta, con el nombre exacto que usa js/model.js (PRIVILEGES)
const PRIVILEGIOS = [
  { re: /anciano/i, n: 'Anciano' },
  { re: /siervo ministerial/i, n: 'Siervo ministerial' },
  { re: /precursor regular/i, n: 'Precursor regular' },
  { re: /precursor especial/i, n: 'Precursor especial' },
  { re: /misionero/i, n: 'Misionero que sirve en el campo' },
];

const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'do', 'dos']);

/**
 * «PEREZ, MARIA GABRIELA» → «Maria Gabriela Perez».
 * Las tarjetas vienen en MAYÚSCULAS y con el apellido delante; la app los guarda al derecho.
 */
export function nombreDeTarjeta(crudo) {
  const t = limpiar(crudo);
  if (!t) return '';
  const [apellidos, nombres] = t.includes(',') ? t.split(',').map(limpiar) : ['', t];
  const orden = nombres ? `${nombres} ${apellidos}` : apellidos;
  return limpiar(orden).toLowerCase().split(' ')
    .map((p, i) => (i > 0 && PARTICULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

// ───────────── Leer una tarjeta ─────────────

function tarjetaDe(lineas) {
  const t = { nombre: '', grupo: '', sex: '', privilegios: [] };

  lineas.forEach(linea => {
    const plano = sinTildes(linea);
    const cs = linea.split(/\s{2,}/).map(limpiar);

    // «Nombre: PEREZ, MARIA GABRIELA   Grupo 5»
    const nom = plano.match(/^Nombre:\s*(.+)$/i);
    if (nom) {
      const partes = linea.replace(/^[^:]*:\s*/, '').split(/\s{2,}/).map(limpiar);
      t.nombre = nombreDeTarjeta(partes[0]);
      const g = partes.slice(1).join(' ').match(/grupo\s*([\w\s-]+)/i);
      if (g) t.grupo = `Grupo ${limpiar(g[1])}`;
      return;
    }

    // «Fecha de nacimiento: 22-09-1967   ☐ Hombre   ☑ Mujer»
    if (/Hombre/i.test(plano) || /Mujer/i.test(plano)) {
      cs.forEach(c => {
        if (/Hombre/i.test(sinTildes(c)) && esMarca(c)) t.sex = 'h';
        if (/Mujer/i.test(sinTildes(c)) && esMarca(c)) t.sex = 'm';
      });
    }

    // La fila de los privilegios (una o dos líneas: «Misionero que sirve» / «en el campo»)
    PRIVILEGIOS.forEach(p => {
      cs.forEach(c => { if (p.re.test(sinTildes(c)) && esMarca(c) && !t.privilegios.includes(p.n)) t.privilegios.push(p.n); });
    });
  });

  return t.nombre ? t : null;
}

// ───────────── Contrato del registro ─────────────

export default {
  id: 's21',
  nombre: 'S-21 · Registro de publicador',
  resumen: 'Las tarjetas del grupo: pone al día a todos los publicadores de una vez.',
  listo: true,

  reconoce(lineas) {
    const todo = sinTildes(lineas.join(' '));
    let puntos = 0;
    if (/REGISTRO DE PUBLICADOR DE LA CONGREGACION/i.test(todo)) puntos += 0.7;
    if (/S-?21-?S/i.test(todo)) puntos += 0.25;
    if (/Precursor auxiliar/i.test(todo)) puntos += 0.1;
    if (/Ano de servicio|Participacion/i.test(todo)) puntos += 0.1;
    return Math.min(1, puntos);
  },

  leer(lineas) {
    // Cada tarjeta empieza en su encabezado. En el PDF del grupo vienen todas seguidas
    // (y a veces repetidas, una por hoja): eso se resuelve al final quitando las iguales.
    const bloques = [];
    let actual = null;
    lineas.forEach(l => {
      if (/REGISTRO DE PUBLICADOR/i.test(sinTildes(l))) { if (actual) bloques.push(actual); actual = []; return; }
      if (actual) actual.push(l);
    });
    if (actual) bloques.push(actual);

    const vistos = new Map();
    const dudas = [];
    bloques.forEach(b => {
      const t = tarjetaDe(b);
      if (!t) {
        const pista = b.map(limpiar).find(x => x.length > 6);
        if (pista) dudas.push({ texto: pista, porque: 'Esa tarjeta del S-21 no traía un nombre que pudiera leer.' });
        return;
      }
      // La misma persona dos veces: se queda la tarjeta más completa
      const clave = sinTildes(t.nombre).toLowerCase();
      const antes = vistos.get(clave);
      if (!antes || t.privilegios.length > antes.privilegios.length) vistos.set(clave, t);
    });

    const gente = [...vistos.values()];
    const grupo = gente.find(p => p.grupo)?.grupo || '';

    return {
      periodo: new Date().toISOString().slice(0, 7),
      titulo: grupo ? `S-21 · Tarjetas del ${grupo}` : `S-21 · ${gente.length} tarjetas`,
      tareas: [],    // este papel no crea tareas: pone al día a las personas
      dudas,
      registros: gente.length ? [{
        coleccion: 'people',
        items: gente,
        resumen: gente.length === 1
          ? `1 publicador${grupo ? ` del ${grupo}` : ''}`
          : `${gente.length} publicadores${grupo ? ` del ${grupo}` : ''}`,
      }] : [],
    };
  },
};
