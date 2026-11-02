// Que un acuerdo no pierda su tarea cuando se corrige la redacción.
// Sin esto, al arreglar una palabra el acuerdo volvía a ofrecer «Crear tarea» y se duplicaba.
import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const M = await import('../js/model.js');
const { data } = await import('../js/store.js');

const REUNION = {
  id: 'm1', date: '2025-03-12',
  notes: '- Carlos revisará las tarjetas de publicador del grupo 3\n- Luis: hablar con la familia Suárez sobre el estudio',
};

// La reunión con la primera línea escrita de otra forma
const conTexto = linea => ({ ...REUNION, notes: `- ${linea}\n- Luis: hablar con la familia Suárez sobre el estudio` });

function preparar(tareas) {
  data.meetings = [REUNION];
  data.people = [];
  data.tasks = tareas;
}

// La tarea tal como la deja «Crear tarea» sobre el acuerdo de la primera línea
const tareaDelPrimerAcuerdo = () => ({
  id: 't1', meetingId: 'm1', title: 'Revisar las tarjetas de publicador del grupo 3',
  status: 'pendiente', fromAgreement: M.agreementKey('Carlos revisará las tarjetas de publicador del grupo 3'),
});

test('sin tocar nada, cada acuerdo encuentra su tarea', () => {
  preparar([tareaDelPrimerAcuerdo()]);
  const [primero, segundo] = M.parseAgreements(REUNION);
  assert.equal(primero.task?.id, 't1');
  assert.equal(segundo.task, null);
});

test('al corregir la redacción, el acuerdo sigue con su tarea', () => {
  preparar([tareaDelPrimerAcuerdo()]);
  const [primero] = M.parseAgreements(conTexto('Carlos revisará las tarjetas de publicador del grupo 3 y 4'));
  assert.equal(primero.task?.id, 't1', 'la tarea quedó suelta: se ofrecería crear una duplicada');
});

test('una tarea suelta no se le pega a un acuerdo que no tiene nada que ver', () => {
  preparar([tareaDelPrimerAcuerdo()]);
  // La primera línea pasa a hablar de otra cosa: ningún acuerdo se parece a la tarea
  const acuerdos = M.parseAgreements(conTexto('Pedro cotizará la pintura del salón'));
  assert.deepEqual(acuerdos.map(a => a.task), [null, null]);
});

test('las tareas creadas a mano en la reunión se quedan como están', () => {
  // Sin fromAgreement: no sale de ningún acuerdo, aunque el título se parezca
  preparar([{ id: 't9', meetingId: 'm1', title: 'Revisar las tarjetas de publicador del grupo 3', status: 'pendiente' }]);
  const [primero] = M.parseAgreements(REUNION);
  assert.equal(primero.task, null);
});

test('dos tareas sueltas no se van las dos al mismo acuerdo', () => {
  preparar([
    { id: 't1', meetingId: 'm1', title: 'Revisar las tarjetas de publicador del grupo 3', status: 'pendiente', fromAgreement: 'clave vieja uno' },
    { id: 't2', meetingId: 'm1', title: 'Hablar con la familia Suárez sobre el estudio', status: 'pendiente', fromAgreement: 'clave vieja dos' },
  ]);
  const acuerdos = M.parseAgreements(REUNION);
  assert.deepEqual(acuerdos.map(a => a.task?.id), ['t1', 't2']);
});

test('parecido: mide palabras en común y no cuenta las de relleno', () => {
  assert.equal(M.parecido('Revisar el territorio 14', 'Revisar el territorio 14'), 1);
  assert.equal(M.parecido('Revisar el territorio 14', 'Pintar el salón'), 0);
  assert.ok(M.parecido('Revisar el territorio 14', 'Revisar el territorio 14 antes de marzo') > 0.6);
});
