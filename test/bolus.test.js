'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers');
const { bolus } = load('bolus.js', 'BolusCalc');

test('100 mg/2 mL diluído para 10 mL, dose 50 mg = aspirar 5 mL (autoteste)', () => {
  const b = bolus(100, 2, 10, 50);
  assert.equal(b.ok, true);
  assert.equal(b.conc, 10);
  assert.equal(b.diluent, 8);
  assert.equal(b.draw, 5);
});

test('dose maior que o preparado dá erro (autoteste)', () => {
  const b = bolus(100, 2, 10, 150);
  assert.equal(b.ok, false);
  assert.match(b.error, /maior que o total/);
});

test('dose igual ao total preparado é aceita', () => {
  const b = bolus(100, 2, 10, 100);
  assert.equal(b.ok, true);
  assert.equal(b.draw, 10);
});

test('sem diluição (volume final = ampola)', () => {
  const b = bolus(50, 10, 10, 25); // fentanil 50 mcg/mL
  assert.equal(b.conc, 5);
  assert.equal(b.diluent, 0);
  assert.equal(b.draw, 5);
});

test('sem dose: só concentração e diluente', () => {
  const b = bolus(100, 2, 20);
  assert.equal(b.ok, true);
  assert.equal(b.conc, 5);
  assert.equal(b.diluent, 18);
  assert.equal(b.draw, undefined);
});

test('entradas inválidas', () => {
  assert.equal(bolus(0, 2, 10, 5).ok, false);
  assert.equal(bolus(100, NaN, 10, 5).ok, false);
  assert.equal(bolus(100, 2, 1, 5).ok, false, 'volume final menor que a ampola');
});
