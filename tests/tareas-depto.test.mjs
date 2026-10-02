import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const M = await import('../js/model.js');
const { data } = await import('../js/store.js');

// Organigrama ficticio: Servicio → Territorios; Literatura; Comité (se llena solo); Grupos (caja)
function seed() {
  data.people.push(
    { id: 'pa', name: 'Andrés Prueba' }, { id: 'pb', name: 'Bruno Ejemplo' }, { id: 'pc', name: 'Carlos Ficticio' },
  );
  data.depts.push(
    { id: 'd1', name: 'Superintendente de servicio', order: 1, headIds: ['pa'] },
    { id: 'd2', name: 'Territorios', parentId: 'd1', order: 1, headIds: ['pb'] },
    { id: 'd3', name: 'Literatura', order: 2, headIds: ['pb', 'pc'] },
    { id: 'd4', name: 'Comité de Servicio', sk: 'comite', order: 0 },
    { id: 'd5', name: 'Grupos para el servicio del campo', sk: 'grupos', order: 3 },
  );
}
function clean() { data.people.length = 0; data.depts.length = 0; data.tasks.length = 0; }

test('orden del organigrama: padre, luego su hijo, y sin la caja de grupos al elegir', () => {
  seed();
  try {
    assert.deepEqual(M.deptFlat().map(x => [x.d.id, x.depth]), [['d4', 0], ['d1', 0], ['d2', 1], ['d3', 0], ['d5', 0]]);
    assert.ok(!M.taskDeptChoices().some(x => x.d.id === 'd5'));
  } finally { clean(); }
});

test('departamento propuesto: solo si es el único que atienden todos los responsables', () => {
  seed();
  try {
    assert.equal(M.guessDept(['pa'])?.id, 'd1');       // solo encargado de Servicio (el Comité no cuenta)
    assert.equal(M.guessDept(['pb']), null);           // Territorios y Literatura: no se adivina
    assert.equal(M.guessDept(['pb', 'pc'])?.id, 'd3'); // los dos están en Literatura
    assert.equal(M.guessDept(['pc', 'pa']), null);
    assert.equal(M.guessDept([]), null);
  } finally { clean(); }
});

test('grupos por departamento: elegido, por su responsable y «Sin departamento» al final', () => {
  seed();
  try {
    const tasks = [
      { id: 't1', title: 'Revisar tarjetas', deptId: 'd2', due: '2026-10-10' },
      { id: 't2', title: 'Pedido', deptId: 'd3', due: '2026-10-20', priority: 'baja' },
      { id: 't3', title: 'Inventario', deptId: 'd3', due: '2026-10-25', priority: 'alta' },
      { id: 't4', title: 'Programa', responsibleIds: ['pa'] },          // sin elegir: va a Servicio por su responsable
      { id: 't5', title: 'Llamar', responsibleIds: ['pb'] },            // no se puede adivinar
      { id: 't6', title: 'Viejo', deptId: 'no-existe' },                 // departamento borrado
    ];
    const g = M.taskDeptGroups(tasks);
    assert.deepEqual(g.map(x => x.k), ['d1', 'd2', 'd3', '']);
    assert.equal(g[0].guessed, 1);
    assert.equal(g[1].parent?.id, 'd1');
    assert.deepEqual(g[2].tasks.map(t => t.id), ['t3', 't2']);   // alta primero, baja al final
    assert.deepEqual(g[3].tasks.map(t => t.id).sort(), ['t5', 't6']);
    assert.equal(g[3].n, 'Sin departamento');
  } finally { clean(); }
});

test('hechas por departamento: la más reciente primero', () => {
  seed();
  try {
    const g = M.taskDeptGroups([
      { id: 'a', deptId: 'd3', status: 'hecha', doneAt: '2026-09-01' },
      { id: 'b', deptId: 'd3', status: 'hecha', doneAt: '2026-09-20' },
    ], true);
    assert.deepEqual(g[0].tasks.map(t => t.id), ['b', 'a']);
  } finally { clean(); }
});

test('mover: a otro departamento, a «Sin departamento» (ya no se ubica por su responsable) y de vuelta', () => {
  seed();
  try {
    const t = { id: 'm1', title: 'Programa', responsibleIds: ['pa'] };   // por su responsable: Servicio
    assert.equal(M.taskDeptOf(t).d?.id, 'd1');
    assert.equal(M.taskMovedTo(t, 'd1'), null);                          // ya está ahí
    const a = M.taskMovedTo(t, 'd3');
    assert.equal(M.taskDeptOf(a).d?.id, 'd3');
    const b = M.taskMovedTo(a, '');
    assert.equal(b.deptNone, true);
    assert.equal(M.taskDeptOf(b).d, null);
    assert.equal(M.taskDeptGroups([b]).at(-1).k, '');
    const c = M.taskMovedTo(b, 'd2');
    assert.equal(c.deptNone, false);
    assert.equal(M.taskDeptOf(c).d?.id, 'd2');
  } finally { clean(); }
});
