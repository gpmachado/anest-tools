'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, near } = require('./helpers');
const S = load('scales.js', 'ScalesCalc');

test('Apfel: 0–4 fatores = 10/21/39/61/79 % (Apfel 1999)', () => {
  const none = { female: false, smoker: true, history: false, opioid: false };
  assert.deepEqual([S.apfel(none).points, S.apfel(none).risk], [0, 10]);
  assert.equal(S.apfel(none).advice, 'Sem profilaxia de rotina');
  assert.equal(S.apfel({ ...none, smoker: false }).risk, 21, 'não fumante pontua');
  assert.equal(S.apfel({ ...none, female: true, smoker: false }).risk, 39);
  assert.equal(S.apfel({ female: true, smoker: false, history: true, opioid: false }).risk, 61);
  const all = S.apfel({ female: true, smoker: false, history: true, opioid: true });
  assert.deepEqual([all.points, all.risk], [4, 79]);
  assert.match(all.advice, /TIVA/);
});

test('STOP-Bang: 0–2 baixo, 3–4 intermediário, 5–8 alto', () => {
  const sb = (n) => S.stopBang(Array.from({ length: 8 }, (_, i) => i < n));
  assert.equal(sb(2).level, 'low');
  assert.equal(sb(3).level, 'intermediate');
  assert.equal(sb(4).level, 'intermediate');
  assert.equal(sb(5).level, 'high');
  assert.equal(sb(8).points, 8);
});

test('RCRI: 0/1/2/≥3 = 3,9/6,0/10,1/15 % (Duceppe 2017)', () => {
  const r = (n) => S.rcri(Array.from({ length: 6 }, (_, i) => i < n));
  assert.deepEqual([0, 1, 2, 3, 4, 6].map((n) => r(n).risk), [3.9, 6.0, 10.1, 15, 15, 15]);
  assert.equal(r(5).points, 5);
});

test('Aldrete modificado', () => {
  const all2 = Object.fromEntries(S.ALDRETE_PARAMS.map((p) => [p.key, 2]));
  assert.deepEqual(S.aldrete(all2), { points: 10, answered: 5, total: 5, complete: true });
  const partial = S.aldrete({ activity: 1, respiration: 2, spo2: 5 });
  assert.equal(partial.points, 3);
  assert.equal(partial.complete, false);
});

test('ROX = (SpO2/FiO2)/FR; aceita FiO2 em % ou fração', () => {
  near(assert, S.rox(95, 50, 25), 7.6);
  near(assert, S.rox(95, 0.5, 25), 7.6);
  near(assert, S.rox(88, 60, 30), 88 / 0.6 / 30);
  assert.ok(Number.isNaN(S.rox(95, 15, 25)), 'FiO2 < 21%');
  assert.ok(Number.isNaN(S.rox(40, 50, 25)), 'SpO2 < 50');
  assert.ok(Number.isNaN(S.rox(95, 50, 0)));
});

test('ROX: interpretação pelos cortes de Roca 2019', () => {
  assert.equal(S.roxInterpret(4.88, 2).level, 'success');
  assert.equal(S.roxInterpret(2.84, 2).level, 'failure');
  assert.equal(S.roxInterpret(2.85, 2).level, 'indeterminate');
  assert.equal(S.roxInterpret(3.46, 6).level, 'failure');
  assert.equal(S.roxInterpret(3.84, 12).level, 'failure');
  assert.equal(S.roxInterpret(3.9, 12).level, 'indeterminate');
  assert.equal(S.roxInterpret(2, null).level, 'indeterminate', 'sem corte fora de 2/6/12 h');
});

test('Caprini: faixas ACCP e itens só femininos', () => {
  const base = { female: false, age: null, surgery: '', mobility: '', flags: {} };
  assert.equal(S.caprini(base).level, 'verylow');
  assert.equal(S.caprini({ ...base, surgery: 'minor', age: 'a1' }).level, 'low');
  assert.equal(S.caprini({ ...base, surgery: 'open', age: 'a2' }).level, 'moderate');
  assert.equal(S.caprini({ ...base, surgery: 'arthroplasty' }).level, 'high');
  assert.equal(S.caprini({ ...base, flags: { ocp: true } }).points, 0, 'homem não pontua item feminino');
  assert.equal(S.caprini({ ...base, female: true, flags: { ocp: true } }).points, 1);
  assert.deepEqual([30, 41, 60, 61, 74, 75, 0].map(S.capriniAgeGroup), ['a0', 'a1', 'a1', 'a2', 'a2', 'a3', null]);
});

test('EGRI: ≥ 4 = laringoscopia difícil (autoteste)', () => {
  assert.equal(S.egri({ mouth: 1, tmd: 2, mall: 1, neck: 0, prog: 0, weight: 0, hist: 0 }).difficult, true);
  const three = S.egri({ mouth: 1, tmd: 1, mall: 1 });
  assert.equal(three.difficult, false);
  assert.equal(three.complete, false);
  assert.deepEqual([89, 90, 110, 111].map(S.egriWeightPts), [0, 1, 1, 2]);
});

test('LEMON tem 10 itens', () => {
  assert.equal(S.LEMON_ITEMS.length, 10);
});
