'use strict';
/**
 * js/drugs.js is the single source for drugs shared by several tabs.
 * These tests check its shape and that the other modules really read from it
 * (no hard-coded copy of a dose or concentration that could drift).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./helpers');

const D = require('../js/drugs.js');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const WEIGHTS = ['TBW', 'IBW', 'LBW', 'ABW'];
const CONTEXTS = ['adult', 'peds', 'crisis'];

const drugs = Object.entries(D).filter(([, v]) => typeof v === 'object');

test('toda droga tem nome, fonte e data de revisão', () => {
  for (const [k, d] of drugs) {
    assert.ok(d.name, `${k}: name`);
    assert.ok(d.source, `${k}: source`);
    assert.match(d.reviewed, /^\d{4}-\d{2}$/, `${k}: reviewed AAAA-MM`);
  }
});

test('doses agrupadas só por adult / peds / crisis', () => {
  for (const [k, d] of drugs) {
    assert.ok(d.doses, `${k}: doses`);
    for (const ctx of Object.keys(d.doses)) assert.ok(CONTEXTS.includes(ctx), `${k}: contexto ${ctx}`);
  }
});

test('pesos válidos, números positivos e infusões completas', () => {
  const walk = (k, node, where) => {
    for (const [key, v] of Object.entries(node)) {
      const at = `${k}.${where}.${key}`;
      if (key === 'weight') assert.ok(WEIGHTS.includes(v), `${at} = ${v}`);
      else if (typeof v === 'number') assert.ok(v > 0, `${at} > 0`);
      else if (Array.isArray(v)) v.forEach((x, i) => walk(k, x, `${where}.${key}[${i}]`));
      else if (v && typeof v === 'object') {
        if (v.kind === 'infusion') {
          assert.ok(v.rateUnit, `${at}: infusão sem rateUnit`);
          assert.ok(v.rate || (v.rateMin && v.rateMax) || v.steps, `${at}: infusão sem taxa`);
          if (v.rateMin) assert.ok(v.rateMin <= v.rateMax, `${at}: rateMin ≤ rateMax`);
          if (v.prep) assert.ok(v.prepConc > 0, `${at}: prep sem prepConc`);
        }
        walk(k, v, `${where}.${key}`);
      }
    }
  };
  for (const [k, d] of drugs) walk(k, d.doses, 'doses');
});

test('concentrações declaradas batem com o texto', () => {
  for (const [k, d] of drugs) {
    if (d.conc && d.concText) assert.ok(d.concText.startsWith(String(d.conc).replace('.', ',')), `${k}: ${d.conc} vs "${d.concText}"`);
  }
  assert.strictEqual(D.hcort.powder.conc / D.hcort.amp.conc, 5, 'hidrocortisona: pó 250 = 5× ampola 50');
});

test('Crises calcula a partir de drugs.js', () => {
  const C = load('crises.js', 'CrisesCalc');
  const mh = D.dant.doses.crisis.mh;
  const d = C.dantrolene(80);
  assert.strictEqual(d.dose, 80 * mh.perKg);
  assert.strictEqual(d.max, 80 * mh.maxPerKg);
  assert.strictEqual(d.vials, Math.ceil(80 * mh.perKg / D.dant.vialMg));
  assert.strictEqual(C.anaphylaxis(100).imMg, D.adre.doses.crisis.anaphylaxisIM.max);
  assert.strictEqual(C.nextAmiodarone(0), `${D.amio.doses.crisis.arrest.first} mg`);
});

test('abas usam drugs.js em vez de números próprios', () => {
  const peds = read('js/peds.js');
  for (const k of ['atro', 'roc', 'sux', 'sug', 'adre', 'amio', 'bicarb', 'calGluc']) {
    assert.ok(peds.includes(`D.${k}`), `peds.js deve ler D.${k}`);
  }
  const html = read('index.html');
  for (const k of ['roc', 'sux', 'sug', 'atro', 'hcort']) assert.ok(html.includes(`D.${k}`), `index.html deve ler D.${k}`);
  assert.ok(html.indexOf('js/drugs.js') < html.indexOf('js/peds.js'), 'drugs.js carrega antes dos módulos');
  assert.ok(read('sw.js').includes("'js/drugs.js'"), 'drugs.js no cache offline');
});

test('README: tabela de pesos coerente com drugs.js', () => {
  const md = read('README.md');
  const row = (w) => (md.match(new RegExp(`^\\|(.*)\\|\\s*${w}\\s*\\|$`, 'gm')) || []).join(' ');
  assert.match(row('IBW'), /Rocurônio \(IOT eletiva\)/);
  assert.strictEqual(D.roc.doses.adult.iot.weight, 'IBW');
  assert.match(row('TBW'), /Rocurônio \(RSI\)/);
  assert.strictEqual(D.roc.doses.adult.rsi.weight, 'TBW');
  assert.match(row('TBW'), /Sugamadex/);
  assert.ok(Object.values(D.sug.doses.adult).every((x) => x.weight === 'TBW'));
});
