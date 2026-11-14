/**
 * @file Single source of drug data shared by several tabs (IOT, Adjuvantes,
 * Ped, Crises). Presentations, concentrations, per-kg doses, ceilings, the
 * weight each dose uses and the source.
 *
 * Change a dose or a presentation HERE and every tab that shows it follows.
 * Texts and notes stay in each tab; only the numbers come from this file.
 *
 * Shape: ONE entry per drug (presentation and concentration are a single fact),
 * with the doses grouped by circumstance:
 *   doses.adult  — adult anesthesia tabs (IOT, Adjuvantes)
 *   doses.peds   — Ped tab (always the child's weight)
 *   doses.crisis — Crises tab (cardiac arrest, anaphylaxis, MH, hyperkalemia…)
 * Inside each circumstance, one key per indication (iot, rsi, arrest…).
 *
 * Each indication is a BOLUS (default) or an INFUSION:
 *   bolus:    { perKg | dose | perKgMin/perKgMax, weight?, max? }      (dose de ataque)
 *   infusion: { kind: 'infusion', rate | rateMin/rateMax, rateUnit,    (manutenção)
 *               weight?, duration?, prep? }
 *     rateUnit: 'mcg/kg/min' | 'mg/kg/h' | 'mg/min' | 'mg/h' | 'mg/24h'…
 *     prep: standard dilution text; `prepConc` its concentration (unit/mL).
 *   A drug with loading + maintenance has two keys, e.g. `loading` and `infusion`;
 *   a phased infusion uses an array of steps (see amiodarona pós-RCE).
 *
 * Conventions:
 *  - `conc` is in `unit` per mL (mg/mL, mEq/mL, mcg/mL).
 *  - `weight` is the panel weight type: 'TBW' (actual), 'IBW' (ideal),
 *    'LBW' (lean), 'ABW' (adjusted). Pediatric doses always use the child's weight.
 *  - `max` is an absolute ceiling in `unit`.
 *  - Every drug has `source` and `reviewed` (YYYY-MM): update both when you change it.
 *
 * Exposed as `Drugs` (browser global) and as module.exports (Node tests).
 */
(function (root) {
  'use strict';

  const Drugs = {
    roc: {
      name: 'Rocurônio', unit: 'mg', conc: 10, concText: '10 mg/mL', pres: 'amp 50 mg/5 mL',
      doses: {
        adult: {
          iot: { perKg: 1, weight: 'IBW' },   // eletiva: IBW (SmPC Esmeron, obesos)
          rsi: { perKg: 1.2, weight: 'TBW' }, // sequência rápida: peso real (início rápido)
        },
        peds: { rsi: { perKg: 1.2 } },
      },
      source: 'SmPC Esmeron; Meyhoff 2009; SOBA', reviewed: '2026-11',
    },
    sux: {
      name: 'Succinilcolina', unit: 'mg', conc: 10, concText: '10 mg/mL', pres: 'frasco 100 mg (reconstituir p/ 10 mg/mL)',
      doses: {
        adult: { iot: { perKg: 1.5, weight: 'TBW' } },
        peds: { infant: { perKg: 2, max: 150 }, child: { perKg: 1.5, max: 150 } }, // lactente < 12 meses
      },
      source: 'Bula; PALS', reviewed: '2026-11',
    },
    sug: {
      name: 'Sugamadex', unit: 'mg', conc: 100, concText: '100 mg/mL', pres: 'amp 200 mg/2 mL',
      doses: {
        adult: {
          routine: { perKg: 2, weight: 'TBW' },    // TOF ≥ 2
          deep: { perKg: 4, weight: 'TBW' },       // TOF 0–1, PTC ≥ 1–2
          immediate: { perKg: 16, weight: 'TBW' }, // 3 min após Roc 1,2 mg/kg
        },
        peds: { routine: { perKg: 2 }, deep: { perKg: 4 }, immediate: { perKg: 16 } },
      },
      source: 'Bula Bridion (FDA/EMA): peso corporal real', reviewed: '2026-11',
    },
    atro: {
      name: 'Atropina', unit: 'mg', conc: 0.5, concText: '0,5 mg/mL', pres: 'amp 0,5 mg/1 mL',
      doses: {
        adult: {
          brady: { perKgMin: 0.01, perKgMax: 0.02, weight: 'TBW', min: 0.5, max: 3 },
          withNeostigmine: { perKg: 0.015, weight: 'IBW' },
        },
        peds: { iot: { perKg: 0.02, max: 0.5, bradyMin: 0.1 } }, // pré-IOT sem mínimo; bradicardia mín 0,1 mg
      },
      source: 'AHA 2020; PALS', reviewed: '2026-11',
    },
    adre: {
      name: 'Adrenalina', unit: 'mg', conc: 1, concText: '1 mg/mL', pres: 'amp 1 mg/1 mL',
      doses: {
        crisis: {
          arrest: { dose: 1 },                                         // 1 mg a cada 3–5 min
          anaphylaxisIM: { perKg: 0.01, max: 0.5 },                    // vale para adulto e criança
          anaphylaxisIV: { mcg: 50, concMcg: 10, prep: '1 mg + 99 mL SF' },
          infusion: { kind: 'infusion', rateMin: 0.05, rateMax: 0.1, rateUnit: 'mcg/kg/min', weight: 'TBW',
            prep: '12 mg + 188 mL SF', prepConc: 60 },                 // mcg/mL; tabela na aba Vasoat.
        },
        peds: {
          arrest: { perKg: 0.01, max: 1, conc: 0.1, prep: '1 mL + 9 mL SF' },
          anaphylaxisIM: { perKg: 0.01, max: 0.5 },
        },
      },
      source: 'AHA 2020; RCUK 2021', reviewed: '2026-11',
    },
    amio: {
      name: 'Amiodarona', unit: 'mg', conc: 50, concText: '50 mg/mL', pres: 'amp 150 mg/3 mL',
      doses: {
        crisis: {
          arrest: { first: 300, second: 150 },
          postRosc: { kind: 'infusion', rateUnit: 'mg/min', steps: [
            { rate: 1, duration: '6 h' }, { rate: 0.5, duration: '18 h' },
          ] },
        },
        peds: { arrest: { perKg: 5, max: 300 } },
      },
      source: 'AHA 2020; PALS', reviewed: '2026-11',
    },
    bicarb: {
      name: 'Bicarbonato de sódio 8,4%', unit: 'mEq', conc: 1, concText: '1 mEq/mL', pres: '8,4%',
      doses: {
        crisis: { arrest: { perKg: 1, weight: 'TBW' }, hyperK: { dose: 50 } },
        peds: { arrest: { perKg: 1, max: 50, neonateConc: 0.5, neonateMonths: 3 } }, // < 3 meses: 4,2%
      },
      source: 'AHA 2020; PALS', reviewed: '2026-11',
    },
    calGluc: {
      name: 'Gluconato de cálcio 10%', unit: 'mg', conc: 100, concText: '100 mg/mL', pres: '10%',
      doses: {
        crisis: { hyperK: { dose: 3000 } },        // 30 mL
        peds: { hyperK: { perKg: 60, max: 3000 } }, // 0,6 mL/kg
      },
      source: 'UK Kidney Association 2023; PALS', reviewed: '2026-11',
    },
    hcort: {
      name: 'Hidrocortisona', unit: 'mg',
      amp: { conc: 50, concText: '50 mg/mL', pres: 'amp 100 mg/2 mL' },
      powder: { conc: 250, concText: '250 mg/mL', pres: 'pó 500 mg em 2 mL' },
      doses: { adult: {
        anaphylaxis: { min: 200, max: 500 },
        sepsis: { kind: 'infusion', rate: 200, rateUnit: 'mg/24h', prep: '200 mg em 48 mL SF', prepConc: 4 },
      } },
      source: 'Bula; RCUK 2021', reviewed: '2026-11',
    },
    dant: {
      name: 'Dantroleno', unit: 'mg', vialMg: 20, vialWaterMl: 60, pres: 'frasco 20 mg + 60 mL água estéril',
      doses: { crisis: {                                       // adulto e criança
        mh: { perKg: 2.5, maxPerKg: 10 },                      // ataque, repetir até controlar
        mhMaintenance: { kind: 'infusion', rate: 0.25, rateUnit: 'mg/kg/h', duration: '≥ 24 h' }, // ou 1 mg/kg 4–6 h
      } },
      source: 'MHAUS', reviewed: '2026-11',
    },
  };

  /**
   * Volume in mL for an amount at a concentration.
   * @param {number} amount Amount in the drug's unit.
   * @param {number} conc Concentration (unit/mL).
   * @returns {number}
   */
  Drugs.ml = (amount, conc) => amount / conc;

  root.Drugs = Drugs;
  if (typeof module !== 'undefined' && module.exports) module.exports = Drugs;
})(typeof window !== 'undefined' ? window : globalThis);
