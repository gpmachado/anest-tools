/**
 * @file Free bolus dilution calculator for the "Infusão" tab.
 *
 * Given an ampoule (amount of drug in a volume), the final volume after diluting it,
 * and the wanted dose, computes the final concentration, how much diluent to add
 * and how many mL to draw.
 *
 * Two layers: a pure calculation layer (exposed as `BolusCalc`) and a small UI
 * layer that renders into `#bolus-root` when the DOM is available.
 */
(function (root) {
  'use strict';

  /**
   * @typedef {Object} BolusResult
   * @property {boolean} ok False when the inputs cannot give a valid answer.
   * @property {string} [error] Message (pt-BR) describing the problem.
   * @property {number} [conc] Final concentration (unit per mL).
   * @property {number} [diluent] Diluent to add to the ampoule volume, in mL.
   * @property {number} [draw] Volume to draw for the dose, in mL.
   */

  /**
   * Computes a bolus dilution.
   * @param {number} amount Drug amount in the ampoule(s).
   * @param {number} ampMl Volume of the ampoule(s), in mL.
   * @param {number} finalMl Final volume after dilution, in mL (same as ampMl = no dilution).
   * @param {number} dose Wanted dose, in the same unit as `amount`.
   * @returns {BolusResult}
   */
  function bolus(amount, ampMl, finalMl, dose) {
    if (!(amount > 0) || !(ampMl > 0)) return { ok: false, error: 'Informe a quantidade e o volume da ampola.' };
    if (!(finalMl >= ampMl)) return { ok: false, error: 'O volume final não pode ser menor que o volume da ampola.' };
    const conc = amount / finalMl;
    if (!(dose > 0)) return { ok: true, conc, diluent: finalMl - ampMl };
    const draw = dose / conc;
    if (draw > finalMl + 1e-9) return { ok: false, error: `A dose pedida é maior que o total preparado (${amount}).`, conc, diluent: finalMl - ampMl };
    return { ok: true, conc, diluent: finalMl - ampMl, draw };
  }

  root.BolusCalc = { bolus };

  if (typeof document === 'undefined') return; // Node (tests): calculation layer only

  const fmt = (n) => (+n.toFixed(n < 1 ? 3 : 2)).toString().replace('.', ',');
  const num = (id) => parseFloat(String(document.getElementById(id).value).replace(',', '.'));

  /**
   * Reads the inputs and writes the result.
   * @returns {void}
   */
  function compute() {
    const unit = document.getElementById('bol-unit').value;
    const amount = num('bol-amount');
    const ampMl = num('bol-ampml');
    const finalRaw = num('bol-final');
    const finalMl = isNaN(finalRaw) ? ampMl : finalRaw;
    let dose = num('bol-dose');
    const perKg = document.getElementById('bol-perkg').checked;
    const out = document.getElementById('bol-out');
    let kgNote = '';
    if (perKg && dose > 0) {
      // eslint-disable-next-line no-undef
      const kg = typeof W === 'function' ? W() : 0;
      if (!kg) { out.innerHTML = '<div class="dilution-note">Dose por kg: informe o peso no painel.</div>'; return; }
      kgNote = ` (${fmt(dose)} ${unit}/kg × ${fmt(kg)} kg)`;
      dose *= kg;
    }
    if (isNaN(amount) && isNaN(ampMl)) { out.innerHTML = ''; return; }
    const r = bolus(amount, ampMl, finalMl, dose);
    const line = (l, v) => `<div class="dose-row"><span class="dose-label">${l}</span><span class="dose-val">${v}</span></div>`;
    let html = '<div class="dose-table">';
    if (r.conc !== undefined) {
      html += line('Concentração final', `${fmt(r.conc)}<span class="dose-unit"> ${unit}/mL</span>`);
      if (r.diluent > 0) html += line('Diluente a adicionar', `${fmt(r.diluent)}<span class="dose-unit"> mL</span>`);
    }
    if (r.ok && r.draw !== undefined) html += line(`Aspirar para ${fmt(dose)} ${unit}${kgNote}`, `<span style="color:var(--accent)">${fmt(r.draw)}</span><span class="dose-unit"> mL</span>`);
    html += '</div>';
    if (!r.ok) html += `<div class="dilution-note" style="color:var(--red)">${r.error}</div>`;
    out.innerHTML = html;
  }

  /**
   * Builds the card inside `#bolus-root` (once) and wires the inputs.
   * @returns {void}
   */
  function build() {
    const host = document.getElementById('bolus-root');
    if (!host || host.firstChild) return;
    const row = (label, input) => `<div class="dose-row"><span class="dose-label">${label}</span><span class="dose-val">${input}</span></div>`;
    const inp = (id, ph, unit) => `<input type="number" id="${id}" class="hid-input" inputmode="decimal" placeholder="${ph}" min="0" step="any"><span class="dose-unit"> ${unit}</span>`;
    host.innerHTML = `
      <div class="sec-hdr">Diluição de bolus</div>
      <div class="drug-card">
        <div class="drug-header"><div>
          <div class="drug-name" style="color:var(--accent)">Diluição livre</div>
          <div class="drug-subtitle">Qualquer ampola · quanto diluir e quanto aspirar</div>
        </div></div>
        <div class="dose-table">
          ${row('Unidade', '<select id="bol-unit" class="hid-input" style="width:auto"><option>mg</option><option>mcg</option><option>UI</option></select>')}
          ${row('Quantidade na ampola', inp('bol-amount', '100', ''))}
          ${row('Volume da ampola', inp('bol-ampml', '2', 'mL'))}
          ${row('Volume final (diluída)', inp('bol-final', '10', 'mL'))}
          ${row('Dose desejada', inp('bol-dose', '50', ''))}
          ${row('Dose por kg (peso real do painel)', '<input type="checkbox" id="bol-perkg" style="width:20px;height:20px;accent-color:var(--accent)">')}
        </div>
        <div id="bol-out"></div>
        <div class="dilution-note">Volume final vazio = sem diluição. Confira sempre o rótulo e a concentração real da ampola.</div>
      </div>`;
    host.addEventListener('input', compute);
    host.addEventListener('change', compute);
  }

  build();
  root.renderBolus = compute;
})(typeof window !== 'undefined' ? window : globalThis);
