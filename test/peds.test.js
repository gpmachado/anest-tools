'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers');
const P = load('peds.js', 'PedsCalc');

test('peso estimado APLS: 6 m 7 kg · 3 a 14 kg · 8 a 31 kg · 13 a pesar (autoteste)', () => {
  assert.equal(P.estWeight(6).kg, 7);
  assert.equal(P.estWeight(36).kg, 14);
  assert.equal(P.estWeight(96).kg, 31);
  assert.equal(P.estWeight(13 * 12), null);
});

test('peso estimado APLS: limites das fórmulas', () => {
  assert.equal(P.estWeight(0).kg, 4, 'recém-nascido');
  assert.equal(P.estWeight(11).kg, 9.5);
  assert.equal(P.estWeight(12).kg, 10, '1 ano: (2 × 1) + 8');
  assert.equal(P.estWeight(5 * 12).kg, 18, '5 anos: (2 × 5) + 8');
  assert.equal(P.estWeight(6 * 12).kg, 25, '6 anos: (3 × 6) + 7');
  assert.equal(P.estWeight(12 * 12 + 11).kg, 43, '12 anos: (3 × 12) + 7');
  assert.equal(P.estWeight(-1), null);
});

test('tubo 4 anos: com cuff 4,5 · sem cuff 5,0 (autoteste)', () => {
  const t = P.tube(48, 16);
  assert.equal(t.cuffed, '4,5');
  assert.equal(t.uncuffed, '5,0');
  assert.match(t.depth, /^13,5 \(DI × 3\) · 14,0 \(idade\/2 \+ 12\)$/);
});

test('tubo: idade/4 + 3,5 (cuff) e idade/4 + 4 (sem cuff), arredondado a 0,5', () => {
  assert.deepEqual([P.tube(24, 12).cuffed, P.tube(24, 12).uncuffed], ['4,0', '4,5']);
  assert.deepEqual([P.tube(96, 31).cuffed, P.tube(96, 31).uncuffed], ['5,5', '6,0']);
  assert.equal(P.tube(6, 7).cuffed, '3,0–3,5');
  assert.equal(P.tube(18, 11).uncuffed, '4,0–4,5');
});

test('tubo neonatal pelo peso', () => {
  assert.equal(P.tube(0, 0.8).uncuffed, '2,5');
  assert.equal(P.tube(0, 0.8).cuffed, '—');
  assert.equal(P.tube(0, 1.5).uncuffed, '3,0');
  assert.equal(P.tube(0, 3.5).uncuffed, '3,5');
  assert.equal(P.tube(0, 3.5).cuffed, '3,0');
  assert.match(P.tube(0, 3).depth, /^9,0 \(peso \+ 6\)/);
});

test('teto de dose: adrenalina 20 kg 0,2 mg · amiodarona 70 kg limitada a 300 mg (autoteste)', () => {
  assert.equal(P.dose(0.01, 20, 1), 0.2);
  assert.equal(P.dose(5, 70, 300), 300);
});

test('teto de dose: no limite, acima e sem teto', () => {
  assert.equal(P.dose(0.01, 100, 1), 1, 'adrenalina 100 kg = 1 mg (teto adulto)');
  assert.equal(P.dose(0.01, 150, 1), 1);
  assert.equal(P.dose(5, 60, 300), 300, 'exatamente no teto');
  assert.equal(P.dose(0.1, 40, 6), 4, 'adenosina abaixo do teto');
  assert.equal(P.dose(0.1, 80, 6), 6, 'adenosina limitada a 6 mg');
  assert.equal(P.dose(0.02, 10, 0.5), 0.2, 'atropina 10 kg');
  assert.equal(P.dose(60, 100), 6000, 'sem teto');
});

test('hipotensão: 5 anos < 80 · neonato < 60 (autoteste)', () => {
  assert.equal(P.vitals(60).sbpMin, 80);
  assert.equal(P.vitals(0.5).sbpMin, 60);
});

test('hipotensão PALS: lactente 70 · 1–10 anos 70 + 2 × idade · > 10 anos 90', () => {
  assert.equal(P.vitals(6).sbpMin, 70);
  assert.equal(P.vitals(12).sbpMin, 72);
  assert.equal(P.vitals(120).sbpMin, 90);
  assert.equal(P.vitals(150).sbpMin, 90);
  assert.equal(P.vitals(150).group, 'Adolescente');
});

test('manutenção 4-2-1 e ML (autoteste)', () => {
  assert.equal(P.maintenance(15), 50);
  assert.equal(P.lma(12), '2');
  assert.equal(P.maintenance(8), 32);
  assert.equal(P.maintenance(10), 40);
  assert.equal(P.maintenance(20), 60);
  assert.equal(P.maintenance(35), 75);
});

test('ML, lâmina e volemia', () => {
  assert.deepEqual([4, 5, 9, 10, 25, 40, 60, 80].map(P.lma), ['1', '1,5', '1,5', '2', '2,5', '3', '4', '5']);
  assert.match(P.blade(0), /Miller 0/);
  assert.equal(P.blade(120), 'Mac 3');
  assert.deepEqual([0, 6, 24].map(P.bloodVolumePerKg), [85, 80, 75]);
});
