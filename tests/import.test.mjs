import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = await import('../js/store.js');
const { data } = store;

const reset = () => { store.COLS.forEach(c => { data[c] = []; }); };

test('cleanImportItem: ids y tipos', () => {
  reset();
  assert.equal(store.cleanImportItem('notes', { id: 'a b<script>' }), null);
  assert.equal(store.cleanImportItem('notes', { id: 'x'.repeat(61) }), null);
  assert.equal(store.cleanImportItem('notes', ['no', 'objeto']), null);
  assert.equal(store.cleanImportItem('desconocida', { id: 'n1' }), null);
  const ev = store.cleanImportItem('events', { id: 'e1', title: 'Estudio', days: 'lunes', doneLog: [], color: 'red;x', date: 5, sharedId: 'abc', members: ['u1'] });
  assert.equal(ev.days, undefined);
  assert.equal(ev.doneLog, undefined);
  assert.equal(ev.color, '');
  assert.equal(ev.date, undefined);
  assert.equal(ev.sharedId, undefined);
  assert.equal(ev.members, undefined);
  assert.equal(store.cleanImportItem('events', { id: 'sh_abc', title: 'x' }), null);
  assert.equal(store.cleanImportItem('tasks', { id: 'as_abc', title: 'x' }), null);
  const tk = store.cleanImportItem('tasks', { id: 't1', title: 'x', assignedId: 'zz', assignTo: 'otra' });
  assert.equal(tk.assignedId, undefined);
  assert.equal(tk.assignTo, undefined);
});

test('cleanImportItem: el perfil no trae enlace, Google Calendar ni avisos; conserva los tuyos', () => {
  reset();
  const cur = { id: 'me', myName: 'Ana Prueba', share: { secret: 'mio' }, gcal: { url: 'https://script.google.com/macros/s/A/exec' } };
  const out = store.cleanImportItem('profile', { id: 'me', myName: 'Otro', share: { secret: 'ajeno' }, gcal: { url: 'https://malo.example' }, notif: { hour: 3 }, nativeSched: {}, nativeAppSeen: 'x' }, cur);
  assert.deepEqual(out.share, cur.share);
  assert.deepEqual(out.gcal, cur.gcal);
  assert.equal('notif' in out, false);
  assert.equal('nativeSched' in out, false);
  assert.equal('nativeAppSeen' in out, false);
});

test('importAll: no toca la marca «soy yo», ni la vacía, y descarta lo inválido', () => {
  reset();
  data.people = [{ id: 'p1', name: 'Ana Prueba', isMe: true, photo: 'data:foto', role: 'Publicador' }];
  const json = JSON.stringify({
    data: {
      people: [
        { id: 'p1', name: '', photo: '', role: '' },              // intento de vaciar tu ficha
        { id: 'p2', name: 'Luis Ejemplo', isMe: true },           // otra ficha que dice ser «yo»
        { id: '../p3', name: 'Mal id' },
      ],
      events: [{ id: 'e1', title: 'Predicación', date: '2026-10-03', sharedId: 'otro' }],
      raro: [{ id: 'z1' }],
    },
    remove: { people: ['p1'] },
  });
  const n = store.importAll(json, { inbox: true });
  assert.equal(n, 3);
  const me = data.people.find(p => p.id === 'p1');
  assert.equal(me.isMe, true);
  assert.equal(me.name, 'Ana Prueba');
  assert.equal(me.photo, 'data:foto');
  assert.equal(data.people.find(p => p.id === 'p2').isMe, undefined);
  assert.equal(data.people.some(p => p.id === '../p3'), false);
  assert.equal(data.events[0].sharedId, undefined);
});

test('importPlan: cuenta nuevos, reemplazos y descartados por colección', () => {
  reset();
  data.notes = [{ id: 'n1', title: 'Vieja' }];
  const plan = store.importPlan({ data: { notes: [{ id: 'n1' }, { id: 'n2' }, { id: 'mal id' }] } });
  const notes = plan.find(r => r.col === 'notes');
  assert.deepEqual({ add: notes.add, replace: notes.replace, bad: notes.bad }, { add: 1, replace: 1, bad: 1 });
});
