'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, near } = require('./helpers');
const I = load('infusion.js', 'InfusionCalc');

const seed = (id) => I.presetFromSeed(I.SEED_PRESETS.find((s) => s.seedId === id));
const dilOf = (p) => ({ amount: p.amount, amountUnit: p.amountUnit, volumeMl: p.volumeMl });
const unitOf = (p) => ({ amount: p.doseUnit, perKg: p.perKg, time: p.timeUnit });

test('concentração em unidade base por mL', () => {
  near(assert, I.concentration({ amount: 4, amountUnit: 'mg', volumeMl: 200 }), 20); // mcg/mL
  near(assert, I.concentration({ amount: 1, amountUnit: 'g', volumeMl: 100 }), 10000);
  near(assert, I.concentration({ amount: 20, amountUnit: 'UI', volumeMl: 100 }), 0.2);
  assert.ok(Number.isNaN(I.concentration({ amount: 0, amountUnit: 'mg', volumeMl: 10 })));
});

test('noradrenalina 4 mg/200 mL, 0,1 mcg/kg/min, 70 kg = 21 mL/h', () => {
  const p = seed('noradrenalina');
  const r = I.doseToRate(dilOf(p), 0.1, unitOf(p), 70);
  assert.equal(r.ok, true);
  near(assert, r.mlPerHour, 21);
  near(assert, r.basePerHour, 420);
});

test('cetamina 1 mg/kg/h, 70 kg = 7 mL/h (autoteste: aba Sedação)', () => {
  const p = seed('cetamina'); // 100 mg / 10 mL
  near(assert, I.doseToRate(dilOf(p), 1, unitOf(p), 70).mlPerHour, 7);
});

test('dexmedetomidina 200 mcg/50 mL, 0,5 mcg/kg/h, 60 kg = 7,5 mL/h', () => {
  const p = seed('dexmedetomidina');
  near(assert, I.doseToRate(dilOf(p), 0.5, unitOf(p), 60).mlPerHour, 7.5);
});

test('ida e volta: rateToDose desfaz doseToRate', () => {
  for (const p of I.SEED_PRESETS.map((s) => I.presetFromSeed(s))) {
    const r = I.doseToRate(dilOf(p), 0.37, unitOf(p), 73);
    const back = I.rateToDose(dilOf(p), r.mlPerHour, unitOf(p), 73);
    near(assert, back.dose, 0.37, 1e-9, `${p.name}: ${back.dose}`);
  }
});

test('dose sem peso (mcg/min) ignora o peso', () => {
  const p = seed('tridil'); // 50 mg/250 mL = 200 mcg/mL
  near(assert, I.doseToRate(dilOf(p), 10, unitOf(p), 0).mlPerHour, 3);
});

test('validação: UI não converte para massa; peso exigido só em /kg', () => {
  const r = I.doseToRate({ amount: 20, amountUnit: 'UI', volumeMl: 100 }, 1, { amount: 'mcg', perKg: false, time: 'min' }, 70);
  assert.equal(r.ok, false);
  assert.match(r.error, /UI não converte/);
  assert.match(I.doseToRate(dilOf(seed('noradrenalina')), 0.1, unitOf(seed('noradrenalina')), 0).error, /peso/);
  assert.equal(I.rateToDose(dilOf(seed('noradrenalina')), 0, unitOf(seed('noradrenalina')), 70).ok, false);
});

test('vasopressina UI/min', () => {
  const r = I.doseToRate({ amount: 20, amountUnit: 'UI', volumeMl: 100 }, 0.03, { amount: 'UI', perKg: false, time: 'min' }, 0);
  near(assert, r.mlPerHour, 9);
});

test('convertDose entre unidades', () => {
  near(assert, I.convertDose(0.1, { amount: 'mcg', perKg: true, time: 'min' }, { amount: 'mg', perKg: false, time: 'h' }, 70), 0.42);
  near(assert, I.convertDose(1, { amount: 'mg', perKg: false, time: '24h' }, { amount: 'mcg', perKg: false, time: 'h' }, 0), 1000 / 24);
  assert.equal(I.convertDose(1, { amount: 'mg', perKg: true, time: 'h' }, { amount: 'mg', perKg: false, time: 'h' }, 0), null);
  assert.equal(I.convertDose(1, { amount: 'UI', perKg: false, time: 'h' }, { amount: 'mg', perKg: false, time: 'h' }, 70), null);
});

test('roundToStep e formatação', () => {
  assert.equal(I.roundToStep(21.04, 0.1), 21);
  assert.equal(I.roundToStep(7.26, 0.1), 7.3);
  assert.equal(I.roundToStep(7.26, 1), 7);
  assert.equal(I.roundToStep(7.26, 0), 7.26);
  assert.equal(I.formatDuration(1.5), '1h30min');
  assert.equal(I.formatDuration(0.25), '15min');
  assert.equal(I.formatDuration(-1), '—');
  assert.equal(I.unitLabel({ amount: 'mcg', perKg: true, time: 'min' }), 'mcg/kg/min');
  assert.equal(I.fmt(1234.567), '1235');
  assert.equal(I.formatConcentration(20, 'mg'), '20 mcg/mL');
  assert.equal(I.formatConcentration(10000, 'mg'), '10 mg/mL (10000 mcg/mL)');
  assert.equal(I.formatConcentration(0.2, 'UI'), '0.2 UI/mL');
});

test('normalizePreset rejeita dados inválidos e limpa os aceitos', () => {
  assert.equal(I.normalizePreset(null), null);
  assert.equal(I.normalizePreset({ name: 'x', amount: 1, amountUnit: 'UI', volumeMl: 10, doseUnit: 'mg', timeUnit: 'h' }), null);
  assert.equal(I.normalizePreset({ name: '', amount: 1, amountUnit: 'mg', volumeMl: 10, doseUnit: 'mg', timeUnit: 'h' }), null);
  const p = I.normalizePreset({ name: '  Teste ', amount: 1, amountUnit: 'mg', volumeMl: 10, doseUnit: 'mg', timeUnit: 'h', weightType: 'XYZ', maxDose: -3, seedId: 'inexistente' });
  assert.equal(p.name, 'Teste');
  assert.equal(p.weightType, 'TBW');
  assert.equal(p.maxDose, null);
  assert.equal(p.seedId, undefined);
  assert.equal(p.perKg, false);
});

test('todos os presets de fábrica são válidos', () => {
  for (const s of I.SEED_PRESETS) {
    const p = I.presetFromSeed(s);
    assert.ok(p, s.seedId);
    assert.equal(p.id, 'seed:' + s.seedId);
    assert.equal(I.validate(dilOf(p), unitOf(p), 70), null, s.seedId);
  }
});
