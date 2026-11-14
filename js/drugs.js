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
 *   `table`: rows shown in the tab's mL/h table, [{ rate, effect }].
 *   `seed`: this infusion is a ready-made preset of the Infusão tab
 *     ({ id, name, amount, amountUnit, volumeMl } = the standard dilution).
 * Bolus extras: `label` (row text), `dec` / `decMl` (decimals shown), `max` (ceiling).
 * Local anesthetics: `doses.adult.max` = [{ label, perKg, max, vaso }], `concs` = [{ label, conc }].
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
        crisis: { brady: { dose: 1, max: 3 } },                    // AHA 2020: 1 mg a cada 3–5 min, até 3 mg
        peds: { iot: { perKg: 0.02, max: 0.5, bradyMin: 0.1 } }, // pré-IOT sem mínimo; bradicardia mín 0,1 mg
      },
      source: 'AHA 2020; PALS', reviewed: '2026-11',
    },
    adre: {
      name: 'Adrenalina', unit: 'mg', conc: 1, concText: '1 mg/mL', pres: 'amp 1 mg/1 mL',
      doses: {
        adult: {
          infusion: { kind: 'infusion', rateUnit: 'mcg/kg/min', weight: 'TBW',
            prep: '12 mg (12 mL) + 188 mL SF', prepConc: 60,
            table: [
              { rate: 0.05, effect: 'Baixa' }, { rate: 0.1, effect: 'Baixa' }, { rate: 0.3, effect: 'Moderada' },
              { rate: 0.5, effect: 'Moderada' }, { rate: 1.0, effect: 'Alta' }, { rate: 2.0, effect: 'Alta' },
            ],
            seed: { id: 'adrenalina', name: 'Adrenalina', amount: 12, amountUnit: 'mg', volumeMl: 200 } },
        },
        crisis: {
          arrest: { dose: 1 },
          postArrest: { kind: 'infusion', rateMin: 0.1, rateMax: 0.5, rateUnit: 'mcg/kg/min', weight: 'TBW' },                                         // 1 mg a cada 3–5 min
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
          arrest: { first: 300, second: 150, prep: 'em 20 mL SG5%' },
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

    /* ── IOT / Sedação ── */
    fen: {
      name: 'Fentanil', unit: 'mcg', conc: 50, concText: '50 mcg/mL', pres: 'amp 2 mL = 100 mcg',
      doses: {
        adult: {
          iot: { perKg: 1, weight: 'LBW', label: 'Pré-IOT' },
          iotMax: { perKg: 3, weight: 'LBW', label: 'Dose máx' },
          infusion: { kind: 'infusion', rateUnit: 'mcg/kg/h', weight: 'LBW',
            prep: '5 amp (500mcg) + 90ml SF', prepConc: 5,
            table: [{ rate: 0.5, effect: 'Analgesia leve' }, { rate: 1, effect: 'Analgesia mod.' }, { rate: 2, effect: 'Sedação profunda' }] },
          infusionFixed: { kind: 'infusion', rateMin: 25, rateMax: 200, rateUnit: 'mcg/h', max: 200, weight: 'LBW',
            prep: '5 amp (500mcg) + 90ml SF', prepConc: 5,
            table: [{ rate: 25, effect: 'Leve' }, { rate: 50, effect: 'Mod.' }, { rate: 100, effect: 'Analgesia' }, { rate: 150, effect: 'Intens.' }, { rate: 200, effect: 'Máx' }],
            seed: { id: 'fentanil', name: 'Fentanil', amount: 500, amountUnit: 'mcg', volumeMl: 100 } },
        },
        peds: { iot: { perKg: [1, 2], max: 100 } },
      },
      source: 'Bula; Miller', reviewed: '2026-11',
    },
    remi: {
      name: 'Remifentanil', unit: 'mcg', conc: 50, concText: '50 mcg/mL', pres: 'frasco liofilizado 1, 2 ou 5 mg',
      doses: {
        adult: {
          bolusLow: { perKg: 0.5, weight: 'LBW' },
          bolusHigh: { perKg: 1, weight: 'LBW' },
          infusion: { kind: 'infusion', rateMin: 0.05, rateMax: 0.3, rateUnit: 'mcg/kg/min', weight: 'LBW',
            prep: '2 mg + 38 ml SF', prepConc: 50,
            table: [{ rate: 0.05, effect: 'Sedação / TIVA leve' }, { rate: 0.1, effect: 'Analgesia intraop.' }, { rate: 0.2, effect: 'Estímulo intenso' }, { rate: 0.3, effect: 'Estímulo máx.' }],
            seed: { id: 'remifentanil', name: 'Remifentanil', amount: 2, amountUnit: 'mg', volumeMl: 40 } },
        },
      },
      source: 'Bula Ultiva', reviewed: '2026-11',
    },
    eto: {
      name: 'Etomidato', unit: 'mg', conc: 2, concText: '2 mg/mL', pres: 'amp 10 mL = 20 mg',
      doses: { adult: { iot: { perKg: 0.3, weight: 'TBW' } } },
      source: 'Bula', reviewed: '2026-11',
    },
    cet: {
      name: 'Cetamina', unit: 'mg', conc: 50, concText: '50 mg/mL', pres: 'amp 2 mL',
      diluted: { conc: 10, prep: '2ml + 8ml SF' },
      doses: {
        adult: {
          iot: { perKg: [1, 2], weight: 'TBW' },
          infusion: { kind: 'infusion', rateUnit: 'mg/kg/h', weight: 'TBW', prep: '2ml (100mg) + 8ml SF', prepConc: 10,
            table: [{ rate: 0.1, effect: 'Analgesia mín' }, { rate: 0.3, effect: 'Analgesia mod.' }, { rate: 0.5, effect: 'Analgesia máx' }, { rate: 1.0, effect: 'Sedação leve' }, { rate: 2.0, effect: 'Sedação profunda' }],
            seed: { id: 'cetamina', name: 'Cetamina', amount: 100, amountUnit: 'mg', volumeMl: 10 } },
        },
        peds: { iot: { perKg: [1, 2] } },
      },
      source: 'Bula', reviewed: '2026-11',
    },
    mid: {
      name: 'Midazolam', unit: 'mg', conc: 5, concText: '5 mg/mL', pres: 'amp 3 mL',
      diluted: { conc: 1.5, prep: '3ml + 7ml SF' },
      doses: {
        adult: {
          iot: { perKgList: [0.1, 0.2, 0.3], weight: 'IBW' },
          infusion: { kind: 'infusion', rateMin: 0.02, rateMax: 0.1, max: 0.1, rateUnit: 'mg/kg/h', weight: 'IBW',
            prep: '15mg (3ml de 5mg/ml) + 12ml SF', prepConc: 1,
            table: [{ rate: 0.02, effect: 'Sedação mín' }, { rate: 0.05, effect: 'Sedação mod.' }, { rate: 0.07, effect: 'Sedação prof.' }, { rate: 0.10, effect: 'Dose máx' }],
            seed: { id: 'midazolam', name: 'Midazolam', amount: 15, amountUnit: 'mg', volumeMl: 15 } },
        },
        peds: { iot: { perKg: [0.1, 0.2], max: 5 }, seizure: { perKg: 0.2, max: 10 } },
      },
      source: 'Bula; PALS', reviewed: '2026-11',
    },
    pro: {
      name: 'Propofol', unit: 'mg', conc: 10, concText: '10 mg/mL', pres: 'frasco',
      doses: {
        adult: {
          iot: { perKg: [1.5, 3], weight: 'LBW' },
          infusion: { kind: 'infusion', rateMin: 0.5, rateMax: 4, max: 4, rateUnit: 'mg/kg/h', weight: 'LBW',
            prep: 'sem diluição', prepConc: 10,
            table: [{ rate: 0.5, effect: 'Sedação leve' }, { rate: 1.0, effect: 'Sedação mod.' }, { rate: 2.0, effect: 'Sedação prof.' }, { rate: 3.0, effect: 'Anestesia' }, { rate: 4.0, effect: 'Dose máx' }],
            seed: { id: 'propofol', name: 'Propofol 10 mg/mL', amount: 500, amountUnit: 'mg', volumeMl: 50 } },
        },
        peds: { iot: { perKg: [2, 3] } },
      },
      source: 'Bula', reviewed: '2026-11',
    },
    dex: {
      name: 'Dexmedetomidina', unit: 'mcg', conc: 100, concText: '100 mcg/mL', pres: 'amp 200 mcg/2 mL',
      doses: {
        adult: {
          loading: { perKg: [0.5, 1], weight: 'IBW' },
          infusion: { kind: 'infusion', rateMin: 0.2, rateMax: 1.4, max: 1.4, rateUnit: 'mcg/kg/h', weight: 'IBW',
            prep: '2ml + 48ml SF', prepConc: 4,
            table: [{ rate: 0.2, effect: 'Mín sedação' }, { rate: 0.4, effect: 'Sedação leve' }, { rate: 0.7, effect: 'Sedação mod.' }, { rate: 1.0, effect: 'Sedação prof.' }, { rate: 1.4, effect: 'Dose máx' }],
            seed: { id: 'dexmedetomidina', name: 'Dexmedetomidina', amount: 200, amountUnit: 'mcg', volumeMl: 50 } },
        },
      },
      source: 'Bula Precedex', reviewed: '2026-11',
    },

    /* ── Adjuvantes ── */
    neo: {
      name: 'Neostigmina (Prostigmine)', unit: 'mg', conc: 0.5, concText: '0,5 mg/mL', pres: 'amp 1 mL',
      doses: { adult: { reversal: { perKg: [0.04, 0.07], max: 5, weight: 'IBW' } } },
      source: 'ASA 2023', reviewed: '2026-11',
    },
    mor: {
      name: 'Morfina', unit: 'mg', conc: 10, concText: '10 mg/mL', pres: 'amp 1 mL',
      diluted: { conc: 1, prep: '1ml + 9ml SF' },
      doses: {
        adult: {
          bolus: { perKg: [0.05, 0.1], weight: 'LBW' },
          infusion: { kind: 'infusion', rateUnit: 'mg/kg/h', weight: 'LBW', prep: '10mg (1ml) + 9ml SF', prepConc: 1,
            table: [{ rate: 0.01, effect: 'Analgesia leve' }, { rate: 0.02, effect: 'Analgesia mod.' }, { rate: 0.04, effect: 'Analgesia intensa' }] },
        },
      },
      source: 'Bula', reviewed: '2026-11',
    },
    tra: {
      name: 'Tramadol', unit: 'mg', conc: 50, concText: '50 mg/mL', pres: 'amp 2 mL = 100 mg',
      doses: { adult: { bolus: { perKg: [1, 2], max: 100, maxDay: 400, weight: 'TBW' } } },
      source: 'Bula', reviewed: '2026-11',
    },
    dip: {
      name: 'Dipirona (Metamizol)', unit: 'mg', conc: 500, concText: '500 mg/mL', pres: 'amp 2 mL = 1 g',
      doses: {
        adult: { bolus: { perKg: [15, 20], max: 1000, maxDay: 4000, weight: 'TBW' } },
        peds: { bolus: { perKg: [15, 20], max: 1000 } },
      },
      source: 'Bula', reviewed: '2026-11',
    },
    ceto: {
      name: 'Cetoprofeno', unit: 'mg', conc: 50, concText: '50 mg/mL', pres: 'amp 100 mg/2 mL',
      doses: { adult: { fixed: { dose: 100 }, bolus: { perKg: 1, max: 100, maxDay: 200, weight: 'TBW' } } },
      source: 'Bula', reviewed: '2026-11',
    },
    mgso4: {
      name: 'Sulfato de Magnésio', unit: 'mg', conc: 100, concText: '100 mg/mL', pres: '10%',
      doses: {
        adult: {
          loading: { perKgList: [30, 50], weight: 'TBW' },
          bronchospasm: { dose: 2000 },
          eclampsia: { doseMin: 4000, doseMax: 6000 },
          infusion: { kind: 'infusion', rateMin: 10, rateMax: 15, rateUnit: 'mg/kg/h', weight: 'TBW' },
          eclampsiaInfusion: { kind: 'infusion', rateMin: 1000, rateMax: 2000, rateUnit: 'mg/h' },
        },
        crisis: { torsades: { doseMin: 1000, doseMax: 2000 } },
        peds: { bronchospasm: { perKg: [25, 50], max: 2000 } },
      },
      source: 'Bula; AHA 2020', reviewed: '2026-11',
    },
    ond: {
      name: 'Ondansetrona', unit: 'mg', conc: 2, concText: '2 mg/mL', pres: 'amp 2 mL = 4 mg',
      doses: {
        adult: { ponv: { dose: 4 } },
        peds: { ponv: { perKg: 0.1, max: 4 } },
      },
      source: 'Bula; consenso NVPO 2020', reviewed: '2026-11',
    },
    dexa: {
      name: 'Dexametasona', unit: 'mg', conc: 4, concText: '4 mg/mL', pres: 'amp 2,5 mL = 10 mg',
      doses: {
        adult: {
          ponv: { doseMin: 4, doseMax: 8 },
          antiInflammatory: { perKg: [0.1, 0.5], max: 40, weight: 'TBW' },
          cerebralEdema: { perKg: [0.5, 1], max: 40, weight: 'TBW' },
        },
        peds: { ponv: { perKg: 0.15, max: 8 } },
      },
      source: 'Bula; consenso NVPO 2020', reviewed: '2026-11',
    },

    /* ── Anestésicos locais (tetos usados nos cards e na soma de misturas) ── */
    lido: {
      name: 'Lidocaína', unit: 'mg', conc: 20, concText: '2% = 20 mg/mL', pres: 'amp 2% 20 mL = 400 mg',
      concs: [{ label: '0,5%', conc: 5 }, { label: '1%', conc: 10 }, { label: '2%', conc: 20 }],
      doses: {
        adult: { max: [
          { label: 'Sem vasoconstritor', perKg: 4.5, max: 300, vaso: false },
          { label: 'Com vasoconstritor (epi 1:200.000)', perKg: 7, max: 500, vaso: true },
        ] },
        peds: { arrhythmia: { perKg: 1, max: 100 } },
      },
      source: 'Bula; ASRA', reviewed: '2026-11',
    },
    bupi: {
      name: 'Bupivacaína', unit: 'mg',
      concs: [{ label: '0,25%', conc: 2.5 }, { label: '0,5%', conc: 5 }, { label: '0,75%', conc: 7.5 }],
      doses: { adult: { max: [
        { label: 'Sem vasoconstritor', perKg: 2, max: 150, vaso: false },
        { label: 'Com vasoconstritor (epi 1:200.000)', perKg: 2.5, max: 200, vaso: true },
      ] } },
      source: 'Teto conservador (bula: 175/225 mg)', reviewed: '2026-11',
    },
    levo: {
      name: 'Levobupivacaína', unit: 'mg',
      concs: [{ label: '0,25%', conc: 2.5 }, { label: '0,5%', conc: 5 }, { label: '0,75%', conc: 7.5 }],
      doses: { adult: { max: [{ label: 'Dose máxima', perKg: 2, max: 150, vaso: false }] } },
      source: 'Bula', reviewed: '2026-11',
    },
    ropi: {
      name: 'Ropivacaína', unit: 'mg',
      concs: [{ label: '0,2%', conc: 2 }, { label: '0,5%', conc: 5 }, { label: '0,75%', conc: 7.5 }, { label: '1%', conc: 10 }],
      doses: { adult: { max: [{ label: 'Dose máxima', perKg: 3, max: 250, vaso: false }] } },
      source: 'Teto conservador (bula: 300 mg)', reviewed: '2026-11',
    },
    lipid: {
      name: 'Emulsão lipídica 20% (Intralipid)', unit: 'mL',
      doses: { crisis: {
        bolus: { perKg: 1.5, fixedAbove70: 100 },                              // 100 mL se > 70 kg
        infusion: { kind: 'infusion', rate: 0.25, rateUnit: 'mL/kg/min', weight: 'TBW', fixedAbove70: '200–250 ml em 15–20min' },
        max: { perKg: 12 },
      } },
      source: 'ASRA 2020 (LAST)', reviewed: '2026-11',
    },

    /* ── Vasoativos ── */
    nora: {
      name: 'Noradrenalina', unit: 'mcg', pres: 'amp 4 mg/4 mL',
      doses: { adult: { infusion: { kind: 'infusion', rateMin: 0.01, rateMax: 0.5, max: 0.5, rateUnit: 'mcg/kg/min', weight: 'TBW',
        start: '0,05–0,1', prep: '4ml + 196ml SF', prepConc: 20,
        table: [{ rate: 0.05, effect: 'Início' }, { rate: 0.1, effect: 'Início' }, { rate: 0.15, effect: 'Manutenção' }, { rate: 0.2, effect: 'Manutenção' }, { rate: 0.3, effect: 'Alta dose' }],
        seed: { id: 'noradrenalina', name: 'Noradrenalina', amount: 4, amountUnit: 'mg', volumeMl: 200 } } } },
      source: 'Surviving Sepsis 2021', reviewed: '2026-11',
    },
    dopa: {
      name: 'Dopamina', unit: 'mcg', pres: 'amp 50 mg/10 mL',
      doses: { adult: { infusion: { kind: 'infusion', rateMin: 2, rateMax: 20, max: 20, rateUnit: 'mcg/kg/min', weight: 'TBW',
        prep: '5 amp (50mg/10ml) + 200ml SF', prepConc: 1000,
        table: [{ rate: 2, effect: 'Dopaminérgico' }, { rate: 5, effect: 'β¹ inotrópico' }, { rate: 10, effect: 'β¹ inotrópico' }, { rate: 15, effect: 'α vasopressor' }, { rate: 20, effect: 'α vasopressor' }],
        seed: { id: 'dopamina', name: 'Dopamina', amount: 250, amountUnit: 'mg', volumeMl: 250 } } } },
      source: 'Bula', reviewed: '2026-11',
    },
    dobut: {
      name: 'Dobutamina', unit: 'mcg', pres: 'amp 250 mg/20 mL',
      doses: { adult: { infusion: { kind: 'infusion', rateMin: 2, rateMax: 20, max: 50, rateUnit: 'mcg/kg/min', weight: 'TBW',
        prep: '1 amp + 230ml SF', prepConc: 1000,
        table: [{ rate: 2, effect: 'Inotrópico' }, { rate: 5, effect: 'Inotrópico' }, { rate: 10, effect: '↑DC moderado' }, { rate: 15, effect: 'Alto débito' }, { rate: 20, effect: 'Alto débito' }],
        seed: { id: 'dobutamina', name: 'Dobutamina', amount: 250, amountUnit: 'mg', volumeMl: 250 } } } },
      source: 'Bula', reviewed: '2026-11',
    },
    tridil: {
      name: 'Tridil (Nitroglicerina)', unit: 'mcg', pres: 'amp 5 mg/mL (5 mL = 25 mg)',
      doses: { adult: { infusion: { kind: 'infusion', rateMin: 5, rateMax: 200, max: 200, rateUnit: 'mcg/min',
        prep: '50mg (10ml) + 240ml SG5%', prepConc: 200,
        table: [{ rate: 5, effect: 'Angioplast.' }, { rate: 10, effect: 'Angioplast.' }, { rate: 20, effect: 'Angioplast.' }, { rate: 40, effect: 'Angina/HAS' }, { rate: 60, effect: 'Angina/HAS' }, { rate: 100, effect: 'Emergência' }, { rate: 200, effect: 'Emergência' }],
        seed: { id: 'tridil', name: 'Tridil (nitroglicerina)', amount: 50, amountUnit: 'mg', volumeMl: 250 } } } },
      source: 'Bula', reviewed: '2026-11',
    },
    nipride: {
      name: 'Nipride (Nitroprussiato)', unit: 'mcg', pres: 'amp 50 mg/5 mL',
      doses: { adult: { infusion: { kind: 'infusion', rateMin: 0.3, rateMax: 10, max: 10, rateUnit: 'mcg/kg/min', weight: 'TBW',
        prep: '50mg + 245ml SG5%', prepConc: 200,
        table: [{ rate: 0.3, effect: 'Mín' }, { rate: 0.5, effect: 'Mín' }, { rate: 1.0, effect: 'Moderado' }, { rate: 2.0, effect: 'Moderado' }, { rate: 3.0, effect: 'Alto' }, { rate: 5.0, effect: 'Alto' }, { rate: 8.0, effect: 'Máx (cianeto!)' }, { rate: 10.0, effect: 'Máx (cianeto!)' }],
        seed: { id: 'nipride', name: 'Nipride (nitroprussiato)', amount: 50, amountUnit: 'mg', volumeMl: 250 } } } },
      source: 'Bula', reviewed: '2026-11',
    },

    /* ── Só na aba Ped ── */
    adenosine: {
      name: 'Adenosina', unit: 'mg', conc: 3, concText: '3 mg/mL',
      doses: { peds: { first: { perKg: 0.1, max: 6 }, second: { perKg: 0.2, max: 12 } } },
      source: 'PALS', reviewed: '2026-11',
    },
    diazepam: {
      name: 'Diazepam', unit: 'mg', conc: 5, concText: '5 mg/mL',
      doses: { peds: { seizure: { perKg: 0.3, max: 10 } } },
      source: 'PALS', reviewed: '2026-11',
    },
    levetiracetam: {
      name: 'Levetiracetam', unit: 'mg',
      doses: { peds: { status: { perKg: 60, max: 4500 } } },
      source: 'ESETT 2019', reviewed: '2026-11',
    },
    phenytoin: {
      name: 'Fenitoína', unit: 'mg', conc: 50, concText: '50 mg/mL',
      doses: { peds: { status: { perKg: 20, max: 1500 } } },
      source: 'PALS', reviewed: '2026-11',
    },
    mpred: {
      name: 'Metilprednisolona', unit: 'mg',
      doses: { peds: { bronchospasm: { perKg: [1, 2], max: 60 } } },
      source: 'GINA', reviewed: '2026-11',
    },
    naloxone: {
      name: 'Naloxona', unit: 'mg', conc: 0.4, concText: '0,4 mg/mL',
      doses: { peds: { full: { perKg: 0.1, max: 2 } } },
      source: 'PALS', reviewed: '2026-11',
    },
    flumazenil: {
      name: 'Flumazenil', unit: 'mg', conc: 0.1, concText: '0,1 mg/mL',
      doses: { peds: { reversal: { perKg: 0.01, max: 0.2 } } },
      source: 'Bula', reviewed: '2026-11',
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
