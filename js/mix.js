/**
 * @file Solution mixing calculator (alligation) for the "Hidrat." tab.
 *
 * Given two stock solutions with different concentrations, computes the volume
 * of each one needed to prepare a target volume at a target concentration.
 * Water for injection is simply a solution at 0 %.
 *
 * Two layers: a pure calculation layer (exposed as `MixCalc`) and a small UI
 * layer that renders into `#mix-root` when the DOM is available.
 */
(function (root) {
  'use strict';

  /**
   * @typedef {Object} MixResult
   * @property {boolean} ok False when the inputs cannot produce a valid mixture.
   * @property {string} [error] Message (pt-BR) describing the problem.
   * @property {number} [v1] Volume of solution 1, in mL.
   * @property {number} [v2] Volume of solution 2, in mL.
   * @property {number} [check] Concentration obtained from the computed volumes (%).
   */

  /**
   * Checks that a value is a finite number.
   * @param {*} n Value to test.
   * @returns {boolean}
   */
  function isNum(n) {
    return typeof n === 'number' && isFinite(n);
  }

  /**
   * Computes the volumes of two solutions that yield the target mixture.
   *
   * Uses `V1 = Vt × (Ct − C2) / (C1 − C2)` and `V2 = Vt − V1`, assuming that
   * volumes are additive (a good approximation for the dilute solutions used
   * in practice).
   *
   * @param {number} c1 Concentration of solution 1 (%), 0 or more.
   * @param {number} c2 Concentration of solution 2 (%), 0 or more.
   * @param {number} ct Target concentration (%), between c1 and c2 (inclusive).
   * @param {number} vt Target total volume in mL, greater than zero.
   * @returns {MixResult}
   */
  function mix(c1, c2, ct, vt) {
    if (![c1, c2, ct, vt].every(isNum)) return { ok: false, error: 'Preencha as duas soluções, a concentração alvo e o volume alvo.' };
    if (c1 < 0 || c2 < 0 || ct < 0) return { ok: false, error: 'As concentrações não podem ser negativas.' };
    if (vt <= 0) return { ok: false, error: 'O volume alvo deve ser maior que zero.' };
    if (c1 === c2) return { ok: false, error: 'As duas soluções têm a mesma concentração: não há como ajustar o alvo.' };
    const lo = Math.min(c1, c2);
    const hi = Math.max(c1, c2);
    if (ct < lo || ct > hi) {
      return { ok: false, error: `Alvo impossível: precisa estar entre ${fmt(lo)}% e ${fmt(hi)}% (a mistura nunca sai dessa faixa).` };
    }
    const v1 = (vt * (ct - c2)) / (c1 - c2);
    const v2 = vt - v1;
    return { ok: true, v1, v2, check: (v1 * c1 + v2 * c2) / vt };
  }

  /**
   * Formats a number compactly (up to 4 significant digits, no trailing zeros).
   * @param {number} n Number to format.
   * @returns {string} "—" for invalid values.
   */
  function fmt(n) {
    if (!isNum(n)) return '—';
    if (n === 0) return '0';
    return String(+n.toPrecision(4));
  }

  root.MixCalc = { mix, fmt };

  if (typeof document === 'undefined') return; // Node (tests): calculation layer only

  /* ════════════════════════════════════════
     UI layer
  ════════════════════════════════════════ */

  /**
   * Reads a numeric input of the mixing card.
   * @param {string} id Control id suffix (without the "mix-" prefix).
   * @returns {number} The number, or NaN when empty.
   */
  function num(id) {
    const el = document.getElementById('mix-' + id);
    if (!el || el.value === '') return NaN;
    return parseFloat(String(el.value).replace(',', '.'));
  }

  /**
   * Computes and renders the result for the current inputs.
   * @returns {void}
   */
  function compute() {
    const out = document.getElementById('mix-out');
    const c1 = num('c1');
    const c2 = num('c2');
    const ct = num('ct');
    const vt = num('vt');
    if ([c1, c2, ct, vt].some((n) => isNaN(n))) { out.innerHTML = ''; return; } // wait until all fields are filled
    const r = mix(c1, c2, ct, vt);
    if (!r.ok) {
      out.innerHTML = `<div class="mix-msg">${r.error}</div>`; // error texts are fixed strings built in mix()
      return;
    }
    out.innerHTML = `
      <div class="mix-res">
        <div class="mix-line"><span>Solução 1 (${fmt(c1)}%)</span><b>${fmt(r.v1)} <small>mL</small></b></div>
        <div class="mix-line"><span>Solução 2 (${fmt(c2)}%)</span><b>${fmt(r.v2)} <small>mL</small></b></div>
        <div class="mix-check">Conferência: ${fmt(r.v1)} + ${fmt(r.v2)} = ${fmt(r.v1 + r.v2)} mL a ${fmt(r.check)}%</div>
      </div>`;
  }

  /**
   * Builds the card inside `#mix-root` (once) and wires the inputs.
   * @returns {void}
   */
  function build() {
    const host = document.getElementById('mix-root');
    if (!host || host.firstChild) return;
    host.innerHTML = `
      <div class="sec-hdr">Mistura de soluções</div>
      <div class="drug-card">
        <div class="drug-header"><div>
          <div class="drug-name" style="color:var(--accent)">Concentração alvo</div>
          <div class="drug-subtitle">Quanto usar de cada solução · água destilada = 0 %</div>
        </div></div>
        <div class="dose-table">
          <div class="dose-row"><span class="dose-label">Solução 1</span><span class="dose-val"><input type="number" id="mix-c1" class="hid-input" inputmode="decimal" placeholder="20" min="0" step="any"><span class="dose-unit"> %</span></span></div>
          <div class="dose-row"><span class="dose-label">Solução 2</span><span class="dose-val"><input type="number" id="mix-c2" class="hid-input" inputmode="decimal" placeholder="0,9" min="0" step="any"><span class="dose-unit"> %</span></span></div>
          <div class="dose-row"><span class="dose-label">Concentração alvo</span><span class="dose-val"><input type="number" id="mix-ct" class="hid-input" inputmode="decimal" placeholder="3" min="0" step="any"><span class="dose-unit"> %</span></span></div>
          <div class="dose-row"><span class="dose-label">Volume alvo</span><span class="dose-val"><input type="number" id="mix-vt" class="hid-input" inputmode="decimal" placeholder="500" min="0" step="any"><span class="dose-unit"> mL</span></span></div>
        </div>
        <div id="mix-out"></div>
        <div class="dilution-note">Considera que os volumes se somam (boa aproximação para soluções diluídas). Confira sempre o rótulo e a concentração real das ampolas.</div>
      </div>`;
    host.addEventListener('input', compute);
  }

  build();
})(typeof window !== 'undefined' ? window : globalThis);
