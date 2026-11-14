'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, near } = require('./helpers');
const { mix, fmt } = load('mix.js', 'MixCalc');

test('NaCl 20% + SF 0,9% para 500 mL a 3%', () => {
  const r = mix(20, 0.9, 3, 500);
  assert.equal(r.ok, true);
  near(assert, r.v1, 500 * 2.1 / 19.1, 1e-9);
  near(assert, r.v1 + r.v2, 500);
  near(assert, r.check, 3, 1e-12);
});

test('glicose 50% + água destilada para 100 mL a 10% = 20 + 80', () => {
  const r = mix(50, 0, 10, 100);
  near(assert, r.v1, 20);
  near(assert, r.v2, 80);
});

test('alvo igual a uma das soluções usa só ela', () => {
  const r = mix(10, 5, 10, 200);
  near(assert, r.v1, 200);
  near(assert, r.v2, 0);
});

test('erros: alvo fora da faixa, concentrações iguais, negativo, volume zero, campo vazio', () => {
  assert.match(mix(20, 0.9, 25, 500).error, /Alvo impossível/);
  assert.equal(mix(5, 5, 5, 100).ok, false);
  assert.equal(mix(-1, 5, 2, 100).ok, false);
  assert.equal(mix(20, 0, 5, 0).ok, false);
  assert.equal(mix(20, NaN, 5, 100).ok, false);
});

test('fmt', () => {
  assert.equal(fmt(0), '0');
  assert.equal(fmt(54.973822), '54.97');
  assert.equal(fmt(NaN), '—');
});
