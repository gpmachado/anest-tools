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
          assert.ok(v.rate || (v.rateMin && v.rateMax) || v.steps || (v.table && v.table.length), `${at}: infusão sem taxa`);
          if (v.table) v.table.forEach((r, i) => assert.ok(r.rate > 0 && r.effect, `${at}.table[${i}]`));
          if (v.seed) {
            const toRateUnit = v.rateUnit.startsWith(v.seed.amountUnit) ? 1 : v.seed.amountUnit === 'mg' && v.rateUnit.startsWith('mcg') ? 1000 : NaN;
            assert.strictEqual(v.seed.amount * toRateUnit / v.seed.volumeMl, v.prepConc, `${at}.seed: diluição ≠ prepConc`);
          }
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
    if (d.conc && d.concText) assert.match(d.concText, new RegExp(`(^|\\s)${String(d.conc).replace('.', ',')} `), `${k}: ${d.conc} vs "${d.concText}"`);
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

test('toda droga de drugs.js é usada por alguma aba (sem entrada morta)', () => {
  const src = ['index.html', 'js/peds.js', 'js/crises.js', 'js/infusion.js'].map(read).join('\n');
  for (const [k] of drugs) {
    const used = src.includes(`D.${k}`) || src.includes(`D[k]`) && new RegExp(`['"]${k}['"]`).test(src);
    assert.ok(used, `${k} não é usada em nenhuma aba`);
  }
});

test('Infusão: presets de fábrica vêm de drugs.js', () => {
  require('../js/drugs.js');
  const I = load('infusion.js', 'InfusionCalc');
  assert.ok(I.SEED_PRESETS.length >= 12);
  for (const p of I.SEED_PRESETS) assert.ok(p.amount > 0 && p.volumeMl > 0, p.seedId);
  const nora = I.SEED_PRESETS.find((p) => p.seedId === 'noradrenalina');
  assert.strictEqual(nora.maxDose, D.nora.doses.adult.infusion.max);
});

test('drugs.js só usa campos documentados', () => {
  const TOP = new Set(['name', 'unit', 'conc', 'concText', 'pres', 'doses', 'source', 'reviewed', 'amp', 'powder', 'vialMg', 'vialWaterMl', 'diluted', 'concs']);
  const SPEC = new Set(['amount', 'amountUnit', 'bradyMin', 'conc', 'concMcg', 'dose', 'doseMax', 'doseMin', 'duration', 'effect', 'first',
    'fixedAbove70', 'id', 'kind', 'label', 'max', 'maxDay', 'maxDoses', 'maxPerKg', 'mcg', 'mcgPerKg', 'min', 'minMonths', 'name',
    'neonateConc', 'neonateMonths', 'order', 'perDay', 'perKg', 'perKgList', 'perKgMax', 'perKgMin', 'prep', 'prepConc', 'rate',
    'rateMax', 'rateMin', 'rateUnit', 'second', 'seed', 'start', 'steps', 'table', 'vaso', 'volumeMl', 'weight']);
  const walk = (o, at) => {
    if (Array.isArray(o)) return o.forEach((x, i) => walk(x, `${at}[${i}]`));
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) { assert.ok(SPEC.has(k), `campo desconhecido ${at}.${k}`); walk(v, `${at}.${k}`); }
  };
  for (const [k, d] of drugs) {
    for (const f of Object.keys(d)) assert.ok(TOP.has(f), `campo desconhecido ${k}.${f}`);
    for (const [ctx, inds] of Object.entries(d.doses)) for (const [ind, spec] of Object.entries(inds)) walk(spec, `${k}.doses.${ctx}.${ind}`);
  }
});

test('max é sempre número', () => {
  const walk = (o, at) => {
    if (Array.isArray(o)) return o.forEach((x, i) => walk(x, `${at}[${i}]`));
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) { if (k === 'max') assert.strictEqual(typeof v, 'number', `${at}.max`); walk(v, `${at}.${k}`); }
  };
  for (const [k, d] of drugs) walk(d.doses, k);
});

test('Infusão: todo seed de drugs.js vira preset, em ordem única', () => {
  const I = load('infusion.js', 'InfusionCalc');
  const seeds = [];
  for (const [, d] of drugs) for (const inds of Object.values(d.doses)) for (const v of Object.values(inds)) if (v.seed) seeds.push(v.seed);
  assert.deepStrictEqual(I.SEED_PRESETS.map((p) => p.seedId).sort(), seeds.map((s) => s.id).sort());
  assert.strictEqual(new Set(seeds.map((s) => s.order)).size, seeds.length, 'seed.order repetido');
});

test('Crises: modo pediátrico abaixo de 40 kg', () => {
  const C = load('crises.js', 'CrisesCalc');
  assert.strictEqual(C.adrenalineArrest(70).mg, D.adre.doses.crisis.arrest.dose);
  assert.strictEqual(C.adrenalineArrest(10).mg, 0.1);
  assert.strictEqual(C.adrenalineArrest(10).ml, 1);
  assert.strictEqual(C.maxAmiodarone(10), 3);
  assert.strictEqual(C.maxAmiodarone(70), 2);
  assert.strictEqual(C.nextAmiodarone(0, 10), '50 mg');
  assert.strictEqual(C.nextAmiodarone(1, 70), `${D.amio.doses.crisis.arrest.second} mg`);
  assert.strictEqual(C.hemorrhage(10).bloodVolume, 800);
});

test('Sugamadex pediátrico: só ≥ 2 anos e sem 16 mg/kg', () => {
  assert.ok(!D.sug.doses.peds.immediate);
  for (const v of Object.values(D.sug.doses.peds)) assert.strictEqual(v.minMonths, 24);
});
