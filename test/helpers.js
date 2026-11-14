'use strict';
/**
 * Loads the calculation layer of a module from js/. Each module attaches its
 * calc object to globalThis and returns before touching the DOM when
 * `document` is undefined (Node).
 */
const path = require('node:path');

function load(file, name) {
  require(path.join(__dirname, '..', 'js', file));
  const calc = globalThis[name];
  if (!calc) throw new Error(`${file} did not expose ${name}`);
  return calc;
}

/** Asserts |actual - expected| <= eps. */
function near(assert, actual, expected, eps = 1e-9, msg) {
  assert.ok(Math.abs(actual - expected) <= eps, msg || `esperado ${expected}, obtido ${actual}`);
}

module.exports = { load, near };
