/**
 * @file Infusion calculator for the DrugCalc app.
 *
 * Converts between pump rate (mL/h) and drug dose, using a dilution
 * (amount of drug in a volume), optional patient weight, and editable presets.
 *
 * The file has two layers:
 *  - a pure calculation layer (no DOM access), exposed as `InfusionCalc`;
 *  - a UI layer that builds the "Infusão" tab and stores presets in localStorage.
 *
 * Global entry point used by the app: `renderInfusion()` (called from `update()`).
 */
(function (root) {
  'use strict';

  /* ════════════════════════════════════════
     Calculation layer
  ════════════════════════════════════════ */

  /**
   * Supported amount units. Mass units convert to each other (base: mcg).
   * "UI" (international units) is its own family and never converts to mass.
   * @type {Object<string, {factor: number, family: 'mass'|'unit'}>}
   */
  const AMOUNT_UNITS = {
    g:   { factor: 1e6, family: 'mass' },
    mg:  { factor: 1e3, family: 'mass' },
    mcg: { factor: 1,   family: 'mass' },
    UI:  { factor: 1,   family: 'unit' },
  };

  /**
   * Supported time bases for a dose. `hours` is the length of the period.
   * @type {Object<string, {hours: number, label: string}>}
   */
  const TIME_UNITS = {
    min:   { hours: 1 / 60, label: 'min' },
    h:     { hours: 1,      label: 'h' },
    '12h': { hours: 12,     label: '12 h' },
    '24h': { hours: 24,     label: '24 h' },
  };

  /** Weight types the app can provide (see the patient panel). */
  const WEIGHT_TYPES = ['TBW', 'IBW', 'ABW', 'LBW'];

  /**
   * @typedef {Object} DoseUnit
   * @property {string} amount Amount unit key (g, mg, mcg, UI).
   * @property {boolean} perKg Whether the dose is divided by body weight.
   * @property {string} time Time unit key (min, h, 12h, 24h).
   */

  /**
   * @typedef {Object} Dilution
   * @property {number} amount Amount of drug.
   * @property {string} amountUnit Unit of the amount (g, mg, mcg, UI).
   * @property {number} volumeMl Total volume in mL.
   */

  /**
   * @typedef {Object} CalcResult
   * @property {boolean} ok False when the inputs are invalid.
   * @property {string} [error] Message (pt-BR) describing the problem.
   * @property {number} [concentration] Concentration in base units per mL (mcg/mL or UI/mL).
   * @property {number} [mlPerHour] Pump rate in mL/h.
   * @property {number} [dose] Dose expressed in the requested dose unit.
   * @property {number} [basePerHour] Absolute amount per hour in base units (mcg/h or UI/h).
   */

  /**
   * Returns the unit family of an amount unit, or null if unknown.
   * @param {string} unit Amount unit key.
   * @returns {'mass'|'unit'|null}
   */
  function familyOf(unit) {
    return AMOUNT_UNITS[unit] ? AMOUNT_UNITS[unit].family : null;
  }

  /**
   * Checks that a value is a finite number greater than zero.
   * @param {*} n Value to test.
   * @returns {boolean}
   */
  function isPositive(n) {
    return typeof n === 'number' && isFinite(n) && n > 0;
  }

  /**
   * Computes the concentration of a dilution in base units per mL.
   * @param {Dilution} dil Dilution data.
   * @returns {number} mcg/mL for mass units, UI/mL for UI; NaN if invalid.
   */
  function concentration(dil) {
    if (!dil || !AMOUNT_UNITS[dil.amountUnit]) return NaN;
    if (!isPositive(dil.amount) || !isPositive(dil.volumeMl)) return NaN;
    return (dil.amount * AMOUNT_UNITS[dil.amountUnit].factor) / dil.volumeMl;
  }

  /**
   * Validates a dilution together with a dose unit and (if needed) a weight.
   * @param {Dilution} dil Dilution data.
   * @param {DoseUnit} unit Dose unit.
   * @param {number} weightKg Weight in kg (only required when `unit.perKg`).
   * @returns {string|null} An error message (pt-BR), or null when valid.
   */
  function validate(dil, unit, weightKg) {
    if (!dil || !AMOUNT_UNITS[dil.amountUnit]) return 'Unidade da diluição inválida.';
    if (!isPositive(dil.amount)) return 'Informe a quantidade de fármaco da diluição.';
    if (!isPositive(dil.volumeMl)) return 'Informe o volume da diluição (mL).';
    if (!unit || !AMOUNT_UNITS[unit.amount] || !TIME_UNITS[unit.time]) return 'Unidade de dose inválida.';
    if (familyOf(unit.amount) !== familyOf(dil.amountUnit)) {
      return 'Unidade de dose incompatível com a diluição (UI não converte para massa).';
    }
    if (unit.perKg && !isPositive(weightKg)) return 'Informe o peso (kg) para dose por kg.';
    return null;
  }

  /**
   * Converts a dose to the pump rate that delivers it.
   * @param {Dilution} dil Dilution data.
   * @param {number} dose Dose in `unit`.
   * @param {DoseUnit} unit Dose unit.
   * @param {number} weightKg Weight in kg (used only when `unit.perKg`).
   * @returns {CalcResult}
   */
  function doseToRate(dil, dose, unit, weightKg) {
    const err = validate(dil, unit, weightKg);
    if (err) return { ok: false, error: err };
    if (!isPositive(dose)) return { ok: false, error: 'Informe a dose.' };
    const conc = concentration(dil);
    const w = unit.perKg ? weightKg : 1;
    const basePerHour = (dose * AMOUNT_UNITS[unit.amount].factor * w) / TIME_UNITS[unit.time].hours;
    return { ok: true, concentration: conc, basePerHour, mlPerHour: basePerHour / conc, dose };
  }

  /**
   * Converts a pump rate to the dose being delivered.
   * @param {Dilution} dil Dilution data.
   * @param {number} mlPerHour Pump rate in mL/h.
   * @param {DoseUnit} unit Dose unit for the result.
   * @param {number} weightKg Weight in kg (used only when `unit.perKg`).
   * @returns {CalcResult}
   */
  function rateToDose(dil, mlPerHour, unit, weightKg) {
    const err = validate(dil, unit, weightKg);
    if (err) return { ok: false, error: err };
    if (!isPositive(mlPerHour)) return { ok: false, error: 'Informe a velocidade (mL/h).' };
    const conc = concentration(dil);
    const basePerHour = mlPerHour * conc;
    const dose = dosePerUnit(basePerHour, unit, weightKg);
    return { ok: true, concentration: conc, basePerHour, mlPerHour, dose };
  }

  /**
   * Expresses an absolute amount per hour in a given dose unit.
   * @param {number} basePerHour Base units (mcg or UI) per hour.
   * @param {DoseUnit} unit Target dose unit.
   * @param {number} weightKg Weight in kg (used only when `unit.perKg`).
   * @returns {number} Dose in `unit`.
   */
  function dosePerUnit(basePerHour, unit, weightKg) {
    const w = unit.perKg ? weightKg : 1;
    return (basePerHour * TIME_UNITS[unit.time].hours) / (AMOUNT_UNITS[unit.amount].factor * w);
  }

  /**
   * Converts a dose value between two dose units (used to carry limits across unit changes).
   * @param {number} value Dose in `from`.
   * @param {DoseUnit} from Source unit.
   * @param {DoseUnit} to Target unit.
   * @param {number} weightKg Weight in kg (needed when only one side is per kg).
   * @returns {number|null} Converted value, or null when impossible.
   */
  function convertDose(value, from, to, weightKg) {
    if (!isPositive(value)) return null;
    if (familyOf(from.amount) !== familyOf(to.amount)) return null;
    if ((from.perKg || to.perKg) && from.perKg !== to.perKg && !isPositive(weightKg)) return null;
    const wFrom = from.perKg ? weightKg : 1;
    const basePerHour =
      (value * AMOUNT_UNITS[from.amount].factor * wFrom) / TIME_UNITS[from.time].hours;
    return dosePerUnit(basePerHour, to, weightKg);
  }

  /**
   * Rounds a pump rate to the pump's resolution (never returns a negative value).
   * @param {number} value Rate in mL/h.
   * @param {number} step Pump resolution in mL/h (e.g. 0.1).
   * @returns {number}
   */
  function roundToStep(value, step) {
    if (!isPositive(step)) return value;
    const decimals = Math.max(0, Math.ceil(-Math.log10(step) - 1e-9));
    return +(Math.round(value / step) * step).toFixed(decimals);
  }

  /**
   * Formats a duration in hours as "XhYYmin" or "YYmin".
   * @param {number} hours Duration in hours.
   * @returns {string}
   */
  function formatDuration(hours) {
    if (!isFinite(hours) || hours < 0) return '—';
    const totalMin = Math.round(hours * 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h > 0 ? `${h}h${String(m).padStart(2, '0')}min` : `${m}min`;
  }

  /**
   * Builds a readable dose unit label such as "mcg/kg/min" or "UI/24h".
   * @param {DoseUnit} unit Dose unit.
   * @returns {string}
   */
  function unitLabel(unit) {
    return `${unit.amount}${unit.perKg ? '/kg' : ''}/${unit.time}`;
  }

  /**
   * Formats a number compactly (4 significant digits, no trailing zeros).
   * @param {number} n Number to format.
   * @returns {string} "—" for invalid values.
   */
  function fmt(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '—';
    if (n === 0) return '0';
    const abs = Math.abs(n);
    if (abs >= 1e6 || abs < 1e-4) return n.toExponential(2);
    return String(+n.toPrecision(4));
  }

  /**
   * Describes a concentration in the most readable unit(s).
   * @param {number} conc Concentration in base units per mL.
   * @param {string} amountUnit Unit family reference ('UI' or any mass unit).
   * @returns {string} e.g. "20 mcg/mL" or "1 mg/mL (1000 mcg/mL)".
   */
  function formatConcentration(conc, amountUnit) {
    if (!isFinite(conc)) return '—';
    if (familyOf(amountUnit) === 'unit') return `${fmt(conc)} UI/mL`;
    if (conc >= 1000) return `${fmt(conc / 1000)} mg/mL (${fmt(conc)} mcg/mL)`;
    return `${fmt(conc)} mcg/mL`;
  }

  /**
   * Factory defaults, derived from the dilutions and dose limits that already
   * exist in the Vasoativos and Sedação tabs. A `maxDose` of null means the app
   * had no stated maximum for that drug.
   * @type {Array<Object>}
   */
  const SEED_PRESETS = [
    { seedId: 'noradrenalina',   name: 'Noradrenalina',   amount: 4,   amountUnit: 'mg',  volumeMl: 200, doseUnit: 'mcg', perKg: true,  timeUnit: 'min', weightType: 'TBW', maxDose: 0.5, maxRate: null },
    { seedId: 'dopamina',        name: 'Dopamina',        amount: 250, amountUnit: 'mg',  volumeMl: 250, doseUnit: 'mcg', perKg: true,  timeUnit: 'min', weightType: 'TBW', maxDose: 20,  maxRate: null },
    { seedId: 'dobutamina',      name: 'Dobutamina',      amount: 250, amountUnit: 'mg',  volumeMl: 250, doseUnit: 'mcg', perKg: true,  timeUnit: 'min', weightType: 'TBW', maxDose: 50,  maxRate: null },
    { seedId: 'adrenalina',      name: 'Adrenalina',      amount: 12,  amountUnit: 'mg',  volumeMl: 200, doseUnit: 'mcg', perKg: true,  timeUnit: 'min', weightType: 'TBW', maxDose: null, maxRate: null },
    { seedId: 'tridil',          name: 'Tridil (nitroglicerina)', amount: 50, amountUnit: 'mg', volumeMl: 250, doseUnit: 'mcg', perKg: false, timeUnit: 'min', weightType: 'TBW', maxDose: 200, maxRate: null },
    { seedId: 'nipride',         name: 'Nipride (nitroprussiato)', amount: 50, amountUnit: 'mg', volumeMl: 250, doseUnit: 'mcg', perKg: true, timeUnit: 'min', weightType: 'TBW', maxDose: 10, maxRate: null },
    { seedId: 'dexmedetomidina', name: 'Dexmedetomidina', amount: 200, amountUnit: 'mcg', volumeMl: 50,  doseUnit: 'mcg', perKg: true,  timeUnit: 'h',   weightType: 'IBW', maxDose: 1.4, maxRate: null },
    { seedId: 'propofol',        name: 'Propofol 10 mg/mL', amount: 500, amountUnit: 'mg', volumeMl: 50, doseUnit: 'mg', perKg: true, timeUnit: 'h', weightType: 'LBW', maxDose: 4, maxRate: null },
    { seedId: 'midazolam',       name: 'Midazolam',       amount: 15,  amountUnit: 'mg',  volumeMl: 15,  doseUnit: 'mg',  perKg: true,  timeUnit: 'h',   weightType: 'IBW', maxDose: 0.1, maxRate: null },
    { seedId: 'fentanil',        name: 'Fentanil',        amount: 500, amountUnit: 'mcg', volumeMl: 100, doseUnit: 'mcg', perKg: false, timeUnit: 'h',   weightType: 'LBW', maxDose: 200, maxRate: null },
    { seedId: 'remifentanil',    name: 'Remifentanil',    amount: 2,   amountUnit: 'mg',  volumeMl: 40,  doseUnit: 'mcg', perKg: true,  timeUnit: 'min', weightType: 'LBW', maxDose: null, maxRate: null },
    { seedId: 'cetamina',        name: 'Cetamina',        amount: 100, amountUnit: 'mg',  volumeMl: 10,  doseUnit: 'mg',  perKg: true,  timeUnit: 'h',   weightType: 'TBW', maxDose: null, maxRate: null },
  ];

  /**
   * Validates and normalizes a preset coming from storage or from an imported file.
   * @param {*} raw Untrusted object.
   * @returns {Object|null} A clean preset, or null if the data is not acceptable.
   */
  function normalizePreset(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 60) : '';
    if (!name) return null;
    if (!AMOUNT_UNITS[raw.amountUnit] || !AMOUNT_UNITS[raw.doseUnit]) return null;
    if (familyOf(raw.amountUnit) !== familyOf(raw.doseUnit)) return null;
    if (!TIME_UNITS[raw.timeUnit]) return null;
    if (!isPositive(raw.amount) || !isPositive(raw.volumeMl)) return null;
    const opt = (v) => (isPositive(v) ? v : null);
    const seedKnown = SEED_PRESETS.some((s) => s.seedId === raw.seedId);
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 64) : newId(),
      seedId: seedKnown ? raw.seedId : undefined,
      name,
      amount: raw.amount,
      amountUnit: raw.amountUnit,
      volumeMl: raw.volumeMl,
      doseUnit: raw.doseUnit,
      perKg: raw.perKg === true,
      timeUnit: raw.timeUnit,
      weightType: WEIGHT_TYPES.indexOf(raw.weightType) >= 0 ? raw.weightType : 'TBW',
      maxDose: opt(raw.maxDose),
      maxRate: opt(raw.maxRate),
    };
  }

  /**
   * Generates a unique id for a user-created preset.
   * @returns {string}
   */
  function newId() {
    return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /**
   * Builds a preset from a factory seed.
   * @param {Object} seed Entry of SEED_PRESETS.
   * @returns {Object} Normalized preset with id "seed:<seedId>".
   */
  function presetFromSeed(seed) {
    return normalizePreset(Object.assign({}, seed, { id: 'seed:' + seed.seedId }));
  }

  root.InfusionCalc = {
    AMOUNT_UNITS, TIME_UNITS, WEIGHT_TYPES, SEED_PRESETS,
    concentration, validate, doseToRate, rateToDose, dosePerUnit, convertDose,
    roundToStep, formatDuration, unitLabel, fmt, formatConcentration,
    normalizePreset, presetFromSeed,
  };

  if (typeof document === 'undefined') return; // Node (tests): calculation layer only

  /* ════════════════════════════════════════
     Presets storage
  ════════════════════════════════════════ */

  const STORAGE_KEY = 'anest-tools.infusion.presets.v1';

  /**
   * @typedef {Object} PresetState
   * @property {Array<Object>} presets All presets (factory-derived and user-created).
   * @property {Array<string>} deletedSeeds Seed ids the user deleted on purpose.
   */

  /** @type {PresetState} */
  let store = loadStore();

  /**
   * Reads presets from localStorage. Falls back to factory presets when storage is
   * empty or unavailable, and adds factory presets introduced by later app versions.
   * @returns {PresetState}
   */
  function loadStore() {
    let parsed = null;
    try {
      parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch (e) {
      parsed = null;
    }
    const presets = [];
    const deletedSeeds = [];
    if (parsed && Array.isArray(parsed.presets)) {
      parsed.presets.forEach((p) => {
        const n = normalizePreset(p);
        if (n) presets.push(n);
      });
      if (Array.isArray(parsed.deletedSeeds)) {
        parsed.deletedSeeds.forEach((s) => typeof s === 'string' && deletedSeeds.push(s));
      }
    }
    SEED_PRESETS.forEach((seed) => {
      const has = presets.some((p) => p.seedId === seed.seedId);
      if (!has && deletedSeeds.indexOf(seed.seedId) < 0) presets.push(presetFromSeed(seed));
    });
    return { presets, deletedSeeds };
  }

  /**
   * Persists the preset store. Storage may be unavailable (private mode, cleared
   * data), so failures are reported to the caller instead of thrown.
   * @returns {boolean} True when saved.
   */
  function saveStore() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Finds a preset by id.
   * @param {string} id Preset id.
   * @returns {Object|undefined}
   */
  function findPreset(id) {
    return store.presets.find((p) => p.id === id);
  }

  /* ════════════════════════════════════════
     UI layer
  ════════════════════════════════════════ */

  const $ = (id) => document.getElementById('inf-' + id);

  /**
   * UI state that is not stored in form controls.
   * @type {{built: boolean, mode: 'rate'|'dose', perKg: boolean, weightDirty: boolean,
   *   selectedId: string, lastUnit: DoseUnit}}
   */
  const ui = {
    built: false,
    mode: 'rate',
    perKg: false,
    weightDirty: false,
    selectedId: '',
    lastUnit: { amount: 'mg', perKg: false, time: 'h' },
  };

  /**
   * Reads the weights computed by the patient panel (global `weights` in index.html).
   * @returns {{tbw: number, ibw: number, abw: number, lbw: number}}
   */
  function panelWeights() {
    try {
      // eslint-disable-next-line no-undef
      if (typeof weights !== 'undefined' && weights) return weights;
    } catch (e) {
      /* the global is not initialized yet */
    }
    return { tbw: 0, ibw: 0, abw: 0, lbw: 0 };
  }

  /**
   * Weight from the patient panel for a weight type, never above actual weight
   * (same rule the other tabs use).
   * @param {string} type One of TBW, IBW, ABW, LBW.
   * @returns {number} Weight in kg, or 0 when unknown.
   */
  function panelWeightFor(type) {
    return panelWeightInfo(type).kg;
  }

  /**
   * Like panelWeightFor, but also reports when the requested weight type is not
   * available in the panel (e.g. IBW without height) and actual weight was used.
   * @param {string} type One of TBW, IBW, ABW, LBW.
   * @returns {{kg: number, fellBack: boolean}} `fellBack` is true when TBW replaced `type`.
   */
  function panelWeightInfo(type) {
    const w = panelWeights();
    const tbw = w.tbw || 0;
    if (!tbw) return { kg: 0, fellBack: false };
    const pick = { TBW: tbw, IBW: w.ibw, ABW: w.abw, LBW: w.lbw }[type] || 0;
    if (!pick) return { kg: tbw, fellBack: type !== 'TBW' };
    return { kg: Math.min(pick, tbw), fellBack: false };
  }

  /**
   * Reads a numeric form field.
   * @param {string} id Control id suffix (without the "inf-" prefix).
   * @returns {number} The number, or NaN when empty/invalid.
   */
  function num(id) {
    const el = $(id);
    if (!el || el.value === '') return NaN;
    return parseFloat(String(el.value).replace(',', '.'));
  }

  /**
   * Reads the dose unit selected in the form.
   * @returns {DoseUnit}
   */
  function currentUnit() {
    return { amount: $('dose-amt').value, perKg: ui.perKg, time: $('time').value };
  }

  /**
   * Reads the dilution typed in the form.
   * @returns {Dilution}
   */
  function currentDilution() {
    return { amount: num('amount'), amountUnit: $('amount-unit').value, volumeMl: num('volume') };
  }

  /**
   * Escapes text for safe insertion in HTML.
   * @param {string} s Raw text.
   * @returns {string}
   */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /**
   * Builds the static markup of the tab once.
   * @returns {void}
   */
  function build() {
    const pane = document.getElementById('inf-root');
    if (!pane || ui.built) return;
    pane.innerHTML = `
      <div class="sec-hdr">Infusão (bomba)</div>
      <div class="drug-card"><div class="inf-pad">
        <div class="inf-label">Preset</div>
        <select id="inf-preset" class="inf-sel inf-wide"></select>
        <details class="inf-manage">
          <summary>Gerenciar presets</summary>
          <div class="inf-btnrow">
            <button type="button" id="inf-btn-saveas">Salvar como novo</button>
            <button type="button" id="inf-btn-update">Atualizar selecionado</button>
            <button type="button" id="inf-btn-delete">Apagar</button>
            <button type="button" id="inf-btn-restore">Restaurar original</button>
            <button type="button" id="inf-btn-export">Exportar JSON</button>
            <button type="button" id="inf-btn-import">Importar JSON</button>
            <button type="button" id="inf-btn-factory">Restaurar de fábrica</button>
          </div>
          <input type="file" id="inf-file" accept="application/json,.json" hidden>
          <div class="inf-hint" id="inf-store-msg"></div>
        </details>
      </div></div>

      <div class="drug-card"><div class="inf-pad">
        <div class="inf-label">Diluição</div>
        <div class="inf-row">
          <input id="inf-amount" class="inf-in" type="number" inputmode="decimal" placeholder="quantidade" min="0" step="any">
          <select id="inf-amount-unit" class="inf-sel">
            <option>g</option><option selected>mg</option><option>mcg</option><option>UI</option>
          </select>
          <span class="inf-sep">em</span>
          <input id="inf-volume" class="inf-in" type="number" inputmode="decimal" placeholder="volume" min="0" step="any">
          <span class="inf-sep">mL</span>
        </div>
        <div class="inf-conc" id="inf-conc">—</div>
      </div></div>

      <div class="drug-card"><div class="inf-pad">
        <div class="inf-seg" role="group" aria-label="Sentido do cálculo">
          <button type="button" class="mode-btn active" id="inf-mode-rate">mL/h → Dose</button>
          <button type="button" class="mode-btn" id="inf-mode-dose">Dose → mL/h</button>
        </div>

        <div class="inf-label">Unidade da dose</div>
        <div class="inf-row">
          <select id="inf-dose-amt" class="inf-sel"></select>
          <button type="button" id="inf-perkg" class="inf-chip" aria-pressed="false">/kg</button>
          <span class="inf-sep">/</span>
          <select id="inf-time" class="inf-sel">
            <option value="min">min</option><option value="h" selected>h</option>
            <option value="12h">12 h</option><option value="24h">24 h</option>
          </select>
        </div>

        <div id="inf-weight-wrap" hidden>
          <div class="inf-label">Peso</div>
          <div class="inf-row">
            <select id="inf-wtype" class="inf-sel">
              <option value="TBW">TBW (real)</option><option value="IBW">IBW (ideal)</option>
              <option value="ABW">ABW (corrigido)</option><option value="LBW">LBW (magro)</option>
            </select>
            <input id="inf-weight" class="inf-in" type="number" inputmode="decimal" placeholder="kg" min="0" step="any">
            <span class="inf-sep">kg</span>
          </div>
          <div class="inf-hint" id="inf-weight-hint"></div>
        </div>

        <div class="inf-label" id="inf-main-label">Velocidade programada na bomba (mL/h)</div>
        <input id="inf-main" class="inf-in inf-wide inf-big" type="number" inputmode="decimal" placeholder="0" min="0" step="any">

        <div id="inf-step-wrap" hidden>
          <div class="inf-label">Resolução da bomba</div>
          <select id="inf-step" class="inf-sel inf-wide">
            <option value="0.01">0,01 mL/h</option><option value="0.1" selected>0,1 mL/h</option><option value="1">1 mL/h</option>
          </select>
        </div>

        <div class="inf-label">Volume restante (opcional)</div>
        <div class="inf-row">
          <input id="inf-remaining" class="inf-in" type="number" inputmode="decimal" placeholder="mL" min="0" step="any">
          <span class="inf-sep">mL</span>
        </div>

        <details class="inf-manage">
          <summary>Limites (opcional, só geram alerta)</summary>
          <div class="inf-label" id="inf-maxdose-label">Dose máxima</div>
          <input id="inf-max-dose" class="inf-in inf-wide" type="number" inputmode="decimal" placeholder="vazio = sem limite" min="0" step="any">
          <div class="inf-label">Velocidade máxima (mL/h)</div>
          <input id="inf-max-rate" class="inf-in inf-wide" type="number" inputmode="decimal" placeholder="vazio = sem limite" min="0" step="any">
        </details>
      </div></div>

      <div id="inf-out"></div>
      <div class="inf-foot">Valores calculados a partir do que você digitou. Confira diluição, unidade e peso antes de programar a bomba.</div>
    `;
    ui.built = true;
    fillDoseAmountOptions(false);
    refreshPresetSelect('');
    bind();
  }

  /**
   * Fills the dose-amount select according to the dilution's unit family.
   * @param {boolean} keep Keep the current selection when it is still valid.
   * @returns {void}
   */
  function fillDoseAmountOptions(keep) {
    const sel = $('dose-amt');
    const prev = sel.value;
    const family = familyOf($('amount-unit').value);
    const opts = family === 'unit' ? ['UI'] : ['g', 'mg', 'mcg'];
    sel.innerHTML = opts.map((o) => `<option value="${o}">${o}</option>`).join('');
    if (keep && opts.indexOf(prev) >= 0) sel.value = prev;
    else sel.value = family === 'unit' ? 'UI' : 'mg';
  }

  /**
   * Rebuilds the preset dropdown.
   * @param {string} selectedId Id to keep selected ('' for none).
   * @returns {void}
   */
  function refreshPresetSelect(selectedId) {
    const sel = $('preset');
    sel.innerHTML = '';
    const none = document.createElement('option');
    none.value = '';
    none.textContent = '— livre (sem preset) —';
    sel.appendChild(none);
    store.presets
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .forEach((p) => {
        const o = document.createElement('option');
        o.value = p.id;
        o.textContent = p.name;
        sel.appendChild(o);
      });
    sel.value = findPreset(selectedId) ? selectedId : '';
    ui.selectedId = sel.value;
    updateManageButtons();
  }

  /**
   * Enables/disables the preset action buttons according to the selection.
   * @returns {void}
   */
  function updateManageButtons() {
    const p = findPreset(ui.selectedId);
    $('btn-update').disabled = !p;
    $('btn-delete').disabled = !p;
    $('btn-restore').disabled = !(p && p.seedId);
  }

  /**
   * Shows a short message inside the preset manager.
   * @param {string} msg Text to show.
   * @returns {void}
   */
  function storeMsg(msg) {
    $('store-msg').textContent = msg;
  }

  /**
   * Copies a preset into the form controls.
   * @param {Object} p Preset.
   * @returns {void}
   */
  function applyPreset(p) {
    $('amount').value = p.amount;
    $('amount-unit').value = p.amountUnit;
    $('volume').value = p.volumeMl;
    fillDoseAmountOptions(false);
    $('dose-amt').value = p.doseUnit;
    $('time').value = p.timeUnit;
    setPerKg(p.perKg);
    $('wtype').value = p.weightType;
    ui.weightDirty = false;
    $('max-dose').value = p.maxDose != null ? p.maxDose : '';
    $('max-rate').value = p.maxRate != null ? p.maxRate : '';
    ui.lastUnit = currentUnit();
    syncWeightField();
  }

  /**
   * Builds a preset object from the current form values.
   * @param {string} name Preset name.
   * @param {string} id Preset id to use.
   * @param {string} [seedId] Factory id to preserve.
   * @returns {Object|null} Normalized preset, or null if the form is incomplete.
   */
  function presetFromForm(name, id, seedId) {
    const d = currentDilution();
    const u = currentUnit();
    const maxDose = num('max-dose');
    const maxRate = num('max-rate');
    return normalizePreset({
      id, seedId, name,
      amount: d.amount, amountUnit: d.amountUnit, volumeMl: d.volumeMl,
      doseUnit: u.amount, perKg: u.perKg, timeUnit: u.time,
      weightType: $('wtype').value,
      maxDose: isFinite(maxDose) ? maxDose : null,
      maxRate: isFinite(maxRate) ? maxRate : null,
    });
  }

  /**
   * Sets the "/kg" toggle and shows or hides the weight block.
   * @param {boolean} on Whether the dose is per kg.
   * @returns {void}
   */
  function setPerKg(on) {
    ui.perKg = !!on;
    const b = $('perkg');
    b.classList.toggle('active', ui.perKg);
    b.setAttribute('aria-pressed', String(ui.perKg));
    $('weight-wrap').hidden = !ui.perKg;
  }

  /**
   * Fills the weight field from the patient panel unless the user typed a weight.
   * Also refreshes the hint that compares the typed weight with the panel.
   * @returns {void}
   */
  function syncWeightField() {
    if (!ui.built) return;
    const type = $('wtype').value;
    const info = panelWeightInfo(type);
    const panel = info.kg;
    const field = $('weight');
    if (!ui.weightDirty) field.value = panel ? +panel.toFixed(1) : '';
    const hint = $('weight-hint');
    if (ui.weightDirty && panel && !(Math.abs(num('weight') - panel) <= 0.05)) {
      hint.innerHTML = `Peso digitado diferente do painel (${type} ${InfusionCalc.fmt(panel)} kg). <a href="#" id="inf-usepanel">Usar o do painel</a>`;
    } else if (!panel) {
      hint.textContent = 'Sem peso no painel — digite o peso ou preencha o painel do paciente.';
    } else if (info.fellBack) {
      hint.textContent = `⚠️ ${type} indisponível no painel (informe a altura) — usando o peso real (TBW).`;
    } else {
      hint.textContent = `Do painel do paciente (${type}).`;
    }
  }

  /**
   * Updates the limit label and, when the dose unit changed, converts the typed
   * dose limit to the new unit (or clears it when conversion is impossible).
   * @returns {void}
   */
  function onDoseUnitChanged() {
    const prev = ui.lastUnit;
    const next = currentUnit();
    const limit = num('max-dose');
    if (isFinite(limit)) {
      const conv = InfusionCalc.convertDose(limit, prev, next, num('weight'));
      $('max-dose').value = conv == null ? '' : +conv.toPrecision(4);
    }
    ui.lastUnit = next;
  }

  /**
   * Switches between "mL/h → Dose" and "Dose → mL/h".
   * @param {'rate'|'dose'} mode New mode.
   * @returns {void}
   */
  function setMode(mode) {
    ui.mode = mode;
    $('mode-rate').classList.toggle('active', mode === 'rate');
    $('mode-dose').classList.toggle('active', mode === 'dose');
    $('main-label').textContent =
      mode === 'rate' ? 'Velocidade programada na bomba (mL/h)' : 'Dose desejada';
    $('step-wrap').hidden = mode !== 'dose';
    $('main').value = '';
    compute();
  }

  /**
   * Computes and renders the result for the current form values.
   * @returns {void}
   */
  function compute() {
    if (!ui.built) return;
    const out = $('out');
    const dil = currentDilution();
    const unit = currentUnit();
    const weight = num('weight');
    const main = num('main');

    $('conc').textContent = `Concentração: ${InfusionCalc.formatConcentration(concentration(dil), dil.amountUnit)}`;
    $('maxdose-label').textContent = `Dose máxima (${unitLabel(unit)})`;
    syncWeightField();

    if (!isFinite(main)) {
      out.innerHTML = '';
      return;
    }

    const res = ui.mode === 'rate'
      ? rateToDose(dil, main, unit, weight)
      : doseToRate(dil, main, unit, weight);

    if (!res.ok) {
      out.innerHTML = `<div class="inf-msg">${esc(res.error)}</div>`;
      return;
    }

    let rate = res.mlPerHour;
    let dose = res.dose;
    let rounded = null;
    if (ui.mode === 'dose') {
      const step = parseFloat($('step').value);
      rate = InfusionCalc.roundToStep(res.mlPerHour, step);
      rounded = rate;
      if (rate <= 0) {
        out.innerHTML = `<div class="inf-msg">Dose muito baixa para a resolução da bomba (${esc(fmt(step))} mL/h).</div>`;
        return;
      }
      dose = rateToDose(dil, rate, unit, weight).dose;
    }
    const basePerHour = rate * res.concentration;

    let html = '<div class="drug-card"><div class="inf-pad">';
    if (ui.mode === 'rate') {
      html += `<div class="inf-label">Dose infundida</div>
        <div class="inf-result">${esc(fmt(dose))} <span>${esc(unitLabel(unit))}</span></div>`;
    } else {
      html += `<div class="inf-label">Programar na bomba</div>
        <div class="inf-result">${esc(fmt(rate))} <span>mL/h</span></div>`;
      if (Math.abs(dose - main) / main > 0.005) {
        html += `<div class="inf-hint">Dose real nesse valor: ${esc(fmt(dose))} ${esc(unitLabel(unit))} (pedido: ${esc(fmt(main))}).</div>`;
      }
    }
    html += equivalents(basePerHour, unit, weight);

    const remaining = num('remaining');
    if (isFinite(remaining) && remaining > 0) {
      html += `<div class="inf-eq"><b>Autonomia:</b> ${esc(InfusionCalc.formatDuration(remaining / rate))} com ${esc(fmt(remaining))} mL restantes</div>`;
    }

    const warnings = [];
    const maxDose = num('max-dose');
    const maxRate = num('max-rate');
    if (isFinite(maxDose) && dose > maxDose * 1.0000001) {
      warnings.push(`Dose acima do limite definido (${fmt(maxDose)} ${unitLabel(unit)}).`);
    }
    if (isFinite(maxRate) && rate > maxRate * 1.0000001) {
      warnings.push(`Velocidade acima do limite definido (${fmt(maxRate)} mL/h).`);
    }
    warnings.forEach((w) => { html += `<div class="inf-warn">⚠️ ${esc(w)}</div>`; });
    html += '</div></div>';
    out.innerHTML = html;
  }

  /**
   * Lists the same delivery expressed in other time bases (and with/without weight).
   * @param {number} basePerHour Absolute amount per hour (mcg or UI).
   * @param {DoseUnit} unit The primary unit (excluded from the list).
   * @param {number} weight Weight in kg (0/NaN when unknown).
   * @returns {string} HTML fragment.
   */
  function equivalents(basePerHour, unit, weight) {
    const items = [];
    ['min', 'h'].forEach((t) => {
      [false, true].forEach((k) => {
        if (k && !(weight > 0)) return;
        const u = { amount: unit.amount, perKg: k, time: t };
        if (u.perKg === unit.perKg && u.time === unit.time) return;
        items.push(`${fmt(InfusionCalc.dosePerUnit(basePerHour, u, weight))} ${unitLabel(u)}`);
      });
    });
    return items.length ? `<div class="inf-eq"><b>Equivale a:</b> ${items.map(esc).join(' · ')}</div>` : '';
  }

  /* ── preset actions ── */

  /**
   * Handles the preset dropdown change.
   * @returns {void}
   */
  function onPresetChange() {
    ui.selectedId = $('preset').value;
    const p = findPreset(ui.selectedId);
    if (p) applyPreset(p);
    updateManageButtons();
    storeMsg('');
    compute();
  }

  /**
   * Saves the form as a new preset (asks for a name).
   * @returns {void}
   */
  function saveAsNew() {
    const current = findPreset(ui.selectedId);
    const name = window.prompt('Nome do novo preset:', current ? current.name : '');
    if (name == null) return;
    const p = presetFromForm(name, newId());
    if (!p) { storeMsg('Preencha nome, diluição e unidade antes de salvar.'); return; }
    store.presets.push(p);
    persist(p.id, `Preset "${p.name}" salvo.`);
  }

  /**
   * Overwrites the selected preset with the form values (keeps its name).
   * @returns {void}
   */
  function updateSelected() {
    const cur = findPreset(ui.selectedId);
    if (!cur) return;
    if (!window.confirm(`Atualizar "${cur.name}" com os valores atuais?`)) return;
    const p = presetFromForm(cur.name, cur.id, cur.seedId);
    if (!p) { storeMsg('Preencha diluição e unidade antes de atualizar.'); return; }
    store.presets[store.presets.indexOf(cur)] = p;
    persist(p.id, `Preset "${p.name}" atualizado.`);
  }

  /**
   * Deletes the selected preset (factory presets are remembered as deleted).
   * @returns {void}
   */
  function deleteSelected() {
    const cur = findPreset(ui.selectedId);
    if (!cur) return;
    if (!window.confirm(`Apagar o preset "${cur.name}"?`)) return;
    store.presets.splice(store.presets.indexOf(cur), 1);
    if (cur.seedId && store.deletedSeeds.indexOf(cur.seedId) < 0) store.deletedSeeds.push(cur.seedId);
    persist('', `Preset "${cur.name}" apagado.`);
  }

  /**
   * Resets the selected factory-derived preset to its original values.
   * @returns {void}
   */
  function restoreSelected() {
    const cur = findPreset(ui.selectedId);
    const seed = cur && SEED_PRESETS.find((s) => s.seedId === cur.seedId);
    if (!seed) return;
    if (!window.confirm(`Restaurar "${seed.name}" para os valores originais?`)) return;
    store.presets[store.presets.indexOf(cur)] = presetFromSeed(seed);
    persist(cur.id, `Preset "${seed.name}" restaurado.`);
    applyPreset(findPreset(cur.id));
    compute();
  }

  /**
   * Restores every factory preset (re-adds deleted ones, resets edited ones).
   * User-created presets are kept.
   * @returns {void}
   */
  function restoreFactory() {
    if (!window.confirm('Restaurar todos os presets de fábrica? Presets criados por você são mantidos.')) return;
    store.presets = store.presets.filter((p) => !p.seedId);
    store.deletedSeeds = [];
    SEED_PRESETS.forEach((s) => store.presets.push(presetFromSeed(s)));
    persist(ui.selectedId, 'Presets de fábrica restaurados.');
  }

  /**
   * Saves the store, refreshes the dropdown and shows a message.
   * @param {string} selectId Id to select afterwards.
   * @param {string} okMsg Message shown on success.
   * @returns {void}
   */
  function persist(selectId, okMsg) {
    const ok = saveStore();
    refreshPresetSelect(selectId);
    storeMsg(ok ? okMsg : 'Não foi possível gravar no aparelho (armazenamento bloqueado). Use Exportar JSON para guardar.');
  }

  /**
   * Downloads all presets as a JSON file (backup / transfer between devices).
   * @returns {void}
   */
  function exportPresets() {
    const payload = {
      app: 'anest-tools',
      type: 'infusion-presets',
      version: 1,
      presets: store.presets,
      deletedSeeds: store.deletedSeeds,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'anest-tools-infusao-presets.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    storeMsg('Arquivo exportado.');
  }

  /**
   * Imports presets from a JSON file. Presets with the same id are replaced,
   * new ones are added, invalid entries are skipped.
   * @param {File} file File chosen by the user.
   * @returns {void}
   */
  function importPresets(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let data = null;
      try {
        data = JSON.parse(String(reader.result));
      } catch (e) {
        storeMsg('Arquivo inválido (não é JSON).');
        return;
      }
      if (!data || data.type !== 'infusion-presets' || !Array.isArray(data.presets)) {
        storeMsg('Arquivo não é uma exportação de presets de infusão.');
        return;
      }
      let added = 0;
      let replaced = 0;
      let skipped = 0;
      data.presets.forEach((raw) => {
        const p = normalizePreset(raw);
        if (!p) { skipped++; return; }
        const i = store.presets.findIndex((x) => x.id === p.id);
        if (i >= 0) { store.presets[i] = p; replaced++; } else { store.presets.push(p); added++; }
        if (p.seedId) store.deletedSeeds = store.deletedSeeds.filter((s) => s !== p.seedId);
      });
      persist(ui.selectedId, `Importação: ${added} novo(s), ${replaced} substituído(s), ${skipped} ignorado(s).`);
    };
    reader.readAsText(file);
  }

  /**
   * Attaches all event listeners (called once).
   * @returns {void}
   */
  function bind() {
    const pane = document.getElementById('inf-root');

    pane.addEventListener('input', (e) => {
      const id = e.target.id;
      if (id === 'inf-weight') ui.weightDirty = true;
      if (['inf-main', 'inf-amount', 'inf-volume', 'inf-weight', 'inf-remaining', 'inf-max-dose', 'inf-max-rate'].indexOf(id) >= 0) compute();
    });

    $('amount-unit').addEventListener('change', () => {
      const before = ui.lastUnit;
      fillDoseAmountOptions(true);
      if (familyOf(before.amount) !== familyOf($('dose-amt').value)) $('max-dose').value = '';
      ui.lastUnit = currentUnit();
      compute();
    });
    $('dose-amt').addEventListener('change', () => { onDoseUnitChanged(); compute(); });
    $('time').addEventListener('change', () => { onDoseUnitChanged(); compute(); });
    $('perkg').addEventListener('click', () => {
      setPerKg(!ui.perKg);
      onDoseUnitChanged();
      compute();
    });
    $('wtype').addEventListener('change', () => { ui.weightDirty = false; compute(); });
    $('step').addEventListener('change', compute);
    $('mode-rate').addEventListener('click', () => setMode('rate'));
    $('mode-dose').addEventListener('click', () => setMode('dose'));
    $('preset').addEventListener('change', onPresetChange);

    $('btn-saveas').addEventListener('click', saveAsNew);
    $('btn-update').addEventListener('click', updateSelected);
    $('btn-delete').addEventListener('click', deleteSelected);
    $('btn-restore').addEventListener('click', restoreSelected);
    $('btn-factory').addEventListener('click', restoreFactory);
    $('btn-export').addEventListener('click', exportPresets);
    $('btn-import').addEventListener('click', () => $('file').click());
    $('file').addEventListener('change', (e) => {
      importPresets(e.target.files && e.target.files[0]);
      e.target.value = '';
    });

    pane.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'inf-usepanel') {
        e.preventDefault();
        ui.weightDirty = false;
        compute();
      }
    });
  }

  /**
   * Public entry point called by the app whenever the patient panel changes.
   * Builds the tab on first use, then refreshes the weight and the result.
   * @returns {void}
   */
  root.renderInfusion = function renderInfusion() {
    build();
    if (!ui.built) return;
    syncWeightField();
    compute();
  };
})(typeof window !== 'undefined' ? window : globalThis);
