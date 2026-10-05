// Pruebas del cálculo de permisos (js/perms.js). Ejecutar: node --test tests/admin.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../js/perms.js';

// Copia de PROFILE_TYPES de js/model.js (model.js usa el navegador; aquí basta con los datos)
const TYPES = {
  publicador: { n: 'Publicador', hideEventCats: ['ancianos', 'pastoreo'], hideServCats: ['pastoreo'], hideModules: ['congregacion'] },
  precursor: { n: 'Precursor', hideEventCats: ['ancianos', 'pastoreo'], hideServCats: ['pastoreo'], hideModules: ['congregacion'], goal: true },
  anciano: { n: 'Anciano / Siervo ministerial', hideEventCats: [], hideServCats: [], hideModules: [] },
};
const D = P.defaultTemplates(TYPES);
const cong = P.FEATURES.congregacion.map(f => f.id);

test('las plantillas por defecto reproducen los tipos de siempre', () => {
  const pub = P.effectivePerms(D.publicador, {});
  assert.deepEqual(pub.hideModules, ['congregacion']);
  assert.deepEqual(pub.hideEventCats, ['ancianos', 'pastoreo']);
  assert.deepEqual(pub.hideServCats, ['pastoreo']);
  assert.equal(pub.goal, false);
  assert.equal(pub.features.has('personas.pastoreo'), false);
  cong.forEach(id => assert.equal(pub.features.has(id), false));
  assert.equal(pub.features.has('agenda.ics'), true);
  assert.equal(pub.features.has('notas.junta'), true);
  assert.equal(P.effectivePerms(D.precursor, {}).goal, true);
  const anc = P.effectivePerms(D.anciano, {});
  assert.equal(anc.modules.size, P.MODULE_IDS.length);
  assert.equal(anc.features.size, P.FEATURE_LIST.filter(f => !f.off).length);
  assert.deepEqual(anc.hideModules, []);
});

test('💑 Matrimonio viene apagado en todas las plantillas y se activa solo a quien se le da', () => {
  Object.values(D).forEach(t => assert.equal(P.effectivePerms(t, {}).features.has('general.matrimonio'), false));
  assert.equal(P.effectivePerms(D.publicador, { allow: ['general.matrimonio'] }).features.has('general.matrimonio'), true);
  assert.equal(P.effectivePerms(null, {}, { all: true }).features.has('general.matrimonio'), true);   // el administrador lo ve
});

test('sin plantilla o con all se ve todo', () => {
  for (const p of [P.effectivePerms(null), P.effectivePerms(D.publicador, { deny: ['agenda'] }, { all: true })]) {
    assert.equal(p.all, true);
    assert.equal(p.features.size, P.FEATURE_IDS.length);
    assert.deepEqual(p.hideServCats, []);
  }
});

test('efectivo = plantilla ∪ allow − deny, y la función necesita su sección', () => {
  const p = P.effectivePerms(D.publicador, { allow: ['congregacion', 'congregacion.mecanicas', 'personas.pastoreo'], deny: ['agenda.gcal', 'notas'] });
  assert.equal(p.modules.has('congregacion'), true);
  assert.equal(p.features.has('congregacion.mecanicas'), true);
  assert.equal(p.features.has('congregacion.organigrama'), false);
  assert.equal(p.features.has('personas.pastoreo'), true);
  assert.equal(p.features.has('agenda.gcal'), false);
  assert.equal(p.modules.has('notas'), false);
  assert.equal(p.features.has('notas.junta'), false, 'sección apagada → sus funciones también');
  assert.equal(p.features.has('general.dictado'), true, '«General» no depende de una sección');
  // allow de una función sin su sección no la enciende
  assert.equal(P.effectivePerms(D.publicador, { allow: ['congregacion.visita'] }).features.has('congregacion.visita'), false);
  // deny gana sobre allow
  assert.equal(P.effectivePerms(D.anciano, { allow: ['agenda.ics'], deny: ['agenda.ics'] }).features.has('agenda.ics'), false);
});

test('overridesFor guarda solo las diferencias y vuelve al mismo resultado', () => {
  const tpl = D.anciano;
  const mods = tpl.modules.filter(m => m !== 'congregacion');
  const feats = tpl.features.filter(f => f !== 'agenda.ics');
  const o = P.overridesFor(tpl, mods, feats);
  assert.deepEqual(o.allow, []);
  assert.deepEqual([...o.deny].sort(), ['agenda.ics', 'congregacion']);
  const p = P.effectivePerms(tpl, o);
  assert.equal(p.modules.has('congregacion'), false);
  assert.equal(p.features.has('agenda.ics'), false);
  assert.equal(p.features.has('agenda.gcal'), true);
  assert.deepEqual(P.overridesFor(tpl, tpl.modules, tpl.features), { allow: [], deny: [] });
  assert.deepEqual(P.overridesFor(D.publicador, [...D.publicador.modules, 'inventado'], D.publicador.features), { allow: [], deny: [] }, 'ids desconocidos se ignoran');
});

test('mergeTemplates: plantillas propias, ids válidos y datos limpios', () => {
  const m = P.mergeTemplates(D, {
    auxiliar: { n: 'Auxiliar', modules: ['agenda', 'xx'], features: ['agenda.ics', 'nada'], goal: 1 },
    'Mal Id!': { n: 'x' },
    publicador: { n: 'Publicador (editado)' },
  });
  assert.deepEqual(m.auxiliar.modules, ['agenda']);
  assert.deepEqual(m.auxiliar.features, ['agenda.ics']);
  assert.equal(m.auxiliar.goal, true);
  assert.equal(m['Mal Id!'], undefined);
  assert.equal(m.publicador.n, 'Publicador (editado)');
  assert.deepEqual(m.publicador.modules, D.publicador.modules, 'lo que falta sale de la de siempre');
  assert.ok(m.anciano && m.precursor);
  assert.deepEqual(P.mergeTemplates(D, null), D);
});

test('acciones y CSS de lo apagado', () => {
  assert.equal(P.actionFeature('meca-import'), 'congregacion.mecanicas');
  assert.equal(P.actionFeature('seg', 'reuniones'), 'notas.reuniones');
  assert.equal(P.actionFeature('seg', 'notas'), '');
  assert.equal(P.actionFeature('qa', 'supervise'), 'tareas.supervision');
  assert.equal(P.actionFeature('event'), '');
  const css = P.hiddenCss(P.effectivePerms(D.publicador, {}).features);
  assert.match(css, /\[data-a="meca-import"\]/);
  assert.match(css, /\[data-a="past-import"\]/);
  assert.doesNotMatch(css, /\[data-a="ics-export"\]/);
  assert.equal(P.hiddenCss(new Set(P.FEATURE_IDS)), '');
  assert.ok(P.TYPE_ID_RE.test('siervo-ministerial') && !P.TYPE_ID_RE.test('Con Espacio'));
});
