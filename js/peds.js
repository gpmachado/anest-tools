/**
 * @file Pediatric tab ("Ped"): estimated weight, vital signs, airway sizes,
 * induction/arrest/emergency drug doses and maintenance fluids, by age and weight.
 *
 * Sources: AHA PALS 2020, APLS (weight formulas), Harriet Lane Handbook.
 * Doses are capped at the usual adult maximum.
 *
 * Two layers: a pure calculation layer (exposed as `PedsCalc`) and a UI layer
 * that renders into `#tab-ped`. Inputs are static; only `#ped-out` is redrawn.
 */
(function (root) {
  'use strict';

  /* ════════════════════════════════════════
     Calculation layer
  ════════════════════════════════════════ */

  /**
   * Estimated weight from age (APLS 2011).
   * @param {number} months Age in months.
   * @returns {{kg: number, formula: string}|null} Null above 12 years (weigh the patient).
   */
  function estWeight(months) {
    if (!(months >= 0)) return null;
    if (months < 12) return { kg: 0.5 * months + 4, formula: '(0,5 × meses) + 4' };
    const y = Math.floor(months / 12);
    if (y <= 5) return { kg: 2 * y + 8, formula: '(2 × anos) + 8' };
    if (y <= 12) return { kg: 3 * y + 7, formula: '(3 × anos) + 7' };
    return null;
  }

  /**
   * Normal vital signs by age (PALS 2020, awake).
   * `sbpMin` is the hypotension threshold.
   * @param {number} months Age in months.
   * @returns {{group: string, hr: string, rr: string, sbp: string, sbpMin: number}}
   */
  function vitals(months) {
    const y = months / 12;
    const hypo = months < 1 ? 60 : months < 12 ? 70 : y <= 10 ? 70 + 2 * Math.floor(y) : 90;
    if (months < 1) return { group: 'Neonato', hr: '100–205', rr: '30–53', sbp: '67–84', sbpMin: hypo };
    if (months < 12) return { group: 'Lactente', hr: '100–180', rr: '30–53', sbp: '72–104', sbpMin: hypo };
    if (y < 3) return { group: 'Toddler (1–2 anos)', hr: '98–140', rr: '22–37', sbp: '86–106', sbpMin: hypo };
    if (y < 6) return { group: 'Pré-escolar (3–5 anos)', hr: '80–120', rr: '20–28', sbp: '89–112', sbpMin: hypo };
    if (y < 12) return { group: 'Escolar (6–11 anos)', hr: '75–118', rr: '18–25', sbp: '97–115', sbpMin: hypo };
    return { group: 'Adolescente', hr: '60–100', rr: '12–20', sbp: '110–131', sbpMin: hypo };
  }

  /** Rounds to the nearest 0.5 (tube sizes). */
  const half = (n) => Math.round(n * 2) / 2;

  /**
   * Endotracheal tube size (internal diameter, mm) and depth at the lip (cm).
   * Neonates by weight; infants and 1–2 y by fixed sizes; ≥ 2 y by age formulas (AHA PALS 2020).
   * @param {number} months Age in months.
   * @param {number} kg Weight.
   * @returns {{cuffed: string, uncuffed: string, depth: string}}
   */
  function tube(months, kg) {
    if (months < 1) {
      const u = kg < 1 ? 2.5 : kg < 2 ? 3.0 : kg < 3 ? 3.0 : 3.5;
      return { cuffed: kg >= 3 ? '3,0' : '—', uncuffed: u.toFixed(1).replace('.', ','), depth: `${(kg + 6).toFixed(1).replace('.', ',')} (peso + 6)` };
    }
    if (months < 12) return { cuffed: '3,0–3,5', uncuffed: '3,5–4,0', depth: '10–11 (DI × 3)' };
    if (months < 24) return { cuffed: '3,5–4,0', uncuffed: '4,0–4,5', depth: '11–12 (DI × 3)' };
    const y = Math.floor(months / 12);
    const c = half(y / 4 + 3.5);
    const u = half(y / 4 + 4);
    return { cuffed: c.toFixed(1).replace('.', ','), uncuffed: u.toFixed(1).replace('.', ','), depth: `${(c * 3).toFixed(1).replace('.', ',')} (DI × 3) · ${(y / 2 + 12).toFixed(1).replace('.', ',')} (idade/2 + 12)` };
  }

  /**
   * Laryngeal mask size by weight.
   * @param {number} kg Weight.
   * @returns {string}
   */
  function lma(kg) {
    if (kg < 5) return '1';
    if (kg < 10) return '1,5';
    if (kg < 20) return '2';
    if (kg < 30) return '2,5';
    if (kg < 50) return '3';
    if (kg < 70) return '4';
    return '5';
  }

  /**
   * Laryngoscope blade by age.
   * @param {number} months Age in months.
   * @returns {string}
   */
  function blade(months) {
    if (months < 1) return 'Miller 0 (prematuro) · Miller 1 (termo)';
    if (months < 24) return 'Miller 1 · Mac 1';
    if (months < 96) return 'Mac 2 · Miller 2';
    return 'Mac 3';
  }

  /**
   * Holliday-Segar maintenance (4-2-1), mL/h.
   * @param {number} kg Weight.
   * @returns {number}
   */
  function maintenance(kg) {
    if (kg <= 10) return 4 * kg;
    if (kg <= 20) return 40 + 2 * (kg - 10);
    return 60 + (kg - 20);
  }

  /**
   * Estimated blood volume, mL/kg by age.
   * @param {number} months Age in months.
   * @returns {number}
   */
  function bloodVolumePerKg(months) {
    if (months < 1) return 85;
    if (months < 12) return 80;
    return 75;
  }

  /**
   * Weight-based dose capped at a maximum.
   * @param {number} perKg Dose per kg.
   * @param {number} kg Weight.
   * @param {number} [max] Maximum dose (same unit), optional.
   * @returns {number}
   */
  function dose(perKg, kg, max) {
    const d = perKg * kg;
    return max ? Math.min(d, max) : d;
  }

  root.PedsCalc = { estWeight, vitals, tube, lma, blade, maintenance, bloodVolumePerKg, dose };

  if (typeof document === 'undefined') return; // Node (tests): calculation layer only

  /* ════════════════════════════════════════
     UI layer
  ════════════════════════════════════════ */

  const fmt = (n, d) => {
    if (!isFinite(n)) return '—';
    const digits = d !== undefined ? d : n < 1 ? 2 : n < 10 ? 1 : 0;
    return (+n.toFixed(digits)).toString().replace('.', ',');
  };

  /**
   * One drug row. `perKg` may be a number or [min, max]; `conc` (unit/mL) gives the volume.
   * @param {Object} o Row options.
   * @param {string} o.name Drug and indication.
   * @param {number|number[]} o.perKg Dose per kg.
   * @param {string} o.unit Dose unit (mg, mcg, mEq, J, mL, g).
   * @param {number} [o.max] Maximum single dose.
   * @param {number} [o.conc] Concentration in unit/mL.
   * @param {string} [o.concText] Label for the concentration.
   * @param {string} [o.note] Extra text.
   * @param {number} kg Weight.
   * @returns {string} HTML.
   */
  function row(o, kg) {
    const range = Array.isArray(o.perKg) ? o.perKg : [o.perKg];
    const doses = range.map((p) => dose(p, kg, o.max));
    const capped = o.max && range.some((p) => p * kg > o.max);
    const dTxt = doses.map((d) => fmt(d)).join('–');
    const vTxt = o.conc ? ` = <span style="color:var(--accent)">${doses.map((d) => fmt(d / o.conc)).join('–')} mL</span>` : '';
    const perTxt = range.map((p) => fmt(p, 3)).join('–');
    return `<div class="dose-row" style="align-items:flex-start;gap:10px">
      <span class="dose-label">${o.name}<br><small>${perTxt} ${o.unit}/kg${o.max ? ` · máx ${fmt(o.max)} ${o.unit}` : ''}${o.concText ? ` · ${o.concText}` : ''}${o.note ? `<br>${o.note}` : ''}</small></span>
      <span class="dose-val" style="text-align:right;white-space:nowrap">${dTxt}<span class="dose-unit"> ${o.unit}</span>${vTxt}${capped ? '<br><span class="dose-unit" style="color:var(--orange)">teto adulto</span>' : ''}</span>
    </div>`;
  }

  const card = (title, color, sub, body, note) => `<div class="drug-card">
      <div class="drug-header"><div><div class="drug-name" style="color:${color}">${title}</div>${sub ? `<div class="drug-subtitle">${sub}</div>` : ''}</div></div>
      <div class="dose-table">${body}</div>${note ? `<div class="dilution-note">${note}</div>` : ''}</div>`;

  const kv = (l, v) => `<div class="dose-row"><span class="dose-label">${l}</span><span class="dose-val" style="text-align:right">${v}</span></div>`;

  /**
   * Redraws the results from the inputs.
   * @returns {void}
   */
  function compute() {
    const out = document.getElementById('ped-out');
    const ageVal = parseFloat(document.getElementById('ped-age').value);
    const months = isNaN(ageVal) ? NaN : ageVal * parseFloat(document.getElementById('ped-age-u').value);
    const typed = parseFloat(document.getElementById('ped-weight').value);
    const est = estWeight(months);
    const kg = typed > 0 ? typed : est ? est.kg : 0;
    const info = document.getElementById('ped-wused');
    if (!(months >= 0)) { info.textContent = ''; out.innerHTML = '<div class="no-weight"><div class="icon">👶</div>Informe a idade (e o peso, se souber).</div>'; return; }
    if (!kg) { info.textContent = 'Acima de 12 anos: informe o peso real.'; out.innerHTML = ''; return; }
    info.innerHTML = typed > 0 ? `Peso usado: <b>${fmt(kg)} kg</b> (informado)` : `Peso usado: <b>${fmt(kg)} kg</b> (estimado: ${est.formula})`;

    const v = vitals(months);
    const t = tube(months, kg);
    let html = '';
    if (months < 1) html += '<div class="disclaimer">Neonato: siga o protocolo de reanimação neonatal (SBP/NRP). Prematuro: confira tudo pelo peso.</div>';

    html += card('Sinais vitais', 'var(--green)', v.group,
      kv('FC (acordado)', `${v.hr}<span class="dose-unit"> bpm</span>`) +
      kv('FR', `${v.rr}<span class="dose-unit"> irpm</span>`) +
      kv('PA sistólica', `${v.sbp}<span class="dose-unit"> mmHg</span>`) +
      kv('Hipotensão se PAS <', `<span style="color:var(--red)">${v.sbpMin}</span><span class="dose-unit"> mmHg</span>`),
      'PALS 2020. Hipotensão: &lt;60 (neonato), &lt;70 (lactente), &lt;70 + 2 × idade (1–10 anos), &lt;90 (&gt;10 anos).');

    html += card('Via aérea e material', 'var(--accent)', '',
      kv('Tubo com cuff (DI)', `${t.cuffed}<span class="dose-unit"> mm</span>`) +
      kv('Tubo sem cuff (DI)', `${t.uncuffed}<span class="dose-unit"> mm</span>`) +
      kv('Profundidade (rima labial)', `${t.depth}<span class="dose-unit"> cm</span>`) +
      kv('Máscara laríngea', `nº ${lma(kg)}`) +
      kv('Lâmina', blade(months)),
      'Separe também o tubo 0,5 mm menor e o 0,5 mm maior. Confirme com capnografia.');

    html += card('Indução / IOT', 'var(--purple)', '',
      row({ name: 'Atropina', perKg: 0.02, unit: 'mg', max: 0.5, conc: 0.5, concText: '0,5 mg/mL', note: 'Lactente ou bradicardia. Sem dose mínima (PALS 2020).' }, kg) +
      row({ name: 'Fentanil', perKg: [1, 2], unit: 'mcg', max: 100, conc: 50, concText: '50 mcg/mL' }, kg) +
      row({ name: 'Cetamina', perKg: [1, 2], unit: 'mg', conc: 50, concText: '50 mg/mL' }, kg) +
      row({ name: 'Propofol', perKg: [2, 3], unit: 'mg', conc: 10, concText: '10 mg/mL', note: 'Criança precisa de mais que adulto; reduzir se instável.' }, kg) +
      row({ name: 'Midazolam', perKg: [0.1, 0.2], unit: 'mg', max: 5, conc: 5, concText: '5 mg/mL' }, kg) +
      row({ name: 'Rocurônio (sequência rápida)', perKg: 1.2, unit: 'mg', conc: 10, concText: '10 mg/mL' }, kg) +
      row({ name: 'Succinilcolina', perKg: months < 12 ? 2 : 1.5, unit: 'mg', max: 150, conc: 10, concText: '10 mg/mL', note: months < 12 ? 'Lactente: 2 mg/kg.' : 'Criança: 1–1,5 mg/kg.' }, kg) +
      row({ name: 'Sugamadex (reversão imediata)', perKg: 16, unit: 'mg', conc: 100, concText: '100 mg/mL', note: 'Rotina 2 mg/kg (TOF ≥ 2), profundo 4 mg/kg.' }, kg));

    html += card('PCR e arritmias', 'var(--red)', 'PALS 2020',
      row({ name: 'Adrenalina EV/IO', perKg: 0.01, unit: 'mg', max: 1, conc: 0.1, concText: '0,1 mg/mL (1 mL + 9 mL SF)', note: 'A cada 3–5 min.' }, kg) +
      row({ name: 'Amiodarona (FV/TV sem pulso)', perKg: 5, unit: 'mg', max: 300, conc: 50, concText: '50 mg/mL', note: 'Repetir até 3 doses (15 mg/kg).' }, kg) +
      row({ name: 'Lidocaína (alternativa)', perKg: 1, unit: 'mg', max: 100, conc: 20, concText: '2% = 20 mg/mL' }, kg) +
      row({ name: 'Adenosina 1ª dose', perKg: 0.1, unit: 'mg', max: 6, conc: 3, concText: '3 mg/mL', note: 'Bolus rápido + flush.' }, kg) +
      row({ name: 'Adenosina 2ª dose', perKg: 0.2, unit: 'mg', max: 12, conc: 3, concText: '3 mg/mL' }, kg) +
      row({ name: 'Desfibrilação', perKg: [2, 4], unit: 'J', max: 200, note: '1º choque 2 J/kg, depois 4 J/kg (até 10 J/kg).' }, kg) +
      row({ name: 'Cardioversão sincronizada', perKg: [0.5, 1], unit: 'J', note: 'Se falhar: 2 J/kg.' }, kg) +
      row({ name: 'Bicarbonato 8,4%', perKg: 1, unit: 'mEq', max: 50, conc: 1, concText: '1 mEq/mL', note: months < 3 ? '<b>&lt; 3 meses: diluir 1:1 (4,2%).</b>' : '' }, kg) +
      row({ name: 'Gluconato de cálcio 10%', perKg: 60, unit: 'mg', max: 3000, conc: 100, concText: '100 mg/mL' }, kg) +
      row({ name: 'Glicose 10% (hipoglicemia)', perKg: months < 1 ? 2 : 5, unit: 'mL', note: months < 1 ? 'Neonato: 2 mL/kg.' : '5 mL/kg = 0,5 g/kg.' }, kg));

    html += card('Emergências', 'var(--orange)', '',
      row({ name: 'Cristaloide (bolus)', perKg: [10, 20], unit: 'mL', note: 'Reavaliar após cada bolus.' }, kg) +
      row({ name: 'Adrenalina IM (anafilaxia)', perKg: 0.01, unit: 'mg', max: 0.5, conc: 1, concText: '1 mg/mL, sem diluir' }, kg) +
      row({ name: 'Midazolam IM/intranasal (convulsão)', perKg: 0.2, unit: 'mg', max: 10, conc: 5, concText: '5 mg/mL' }, kg) +
      row({ name: 'Diazepam EV (convulsão)', perKg: 0.3, unit: 'mg', max: 10, conc: 5, concText: '5 mg/mL' }, kg) +
      row({ name: 'Levetiracetam (estado de mal)', perKg: 60, unit: 'mg', max: 4500, note: 'Infundir em 10–15 min.' }, kg) +
      row({ name: 'Fenitoína (estado de mal)', perKg: 20, unit: 'mg', max: 1500, conc: 50, concText: '50 mg/mL', note: 'Máx 1 mg/kg/min (50 mg/min).' }, kg) +
      row({ name: 'Sulfato de magnésio (broncoespasmo)', perKg: [25, 50], unit: 'mg', max: 2000, conc: 100, concText: '10% = 100 mg/mL', note: 'Em 20 min.' }, kg) +
      row({ name: 'Metilprednisolona', perKg: [1, 2], unit: 'mg', max: 60 }, kg) +
      row({ name: 'Naloxona (reversão completa)', perKg: 0.1, unit: 'mg', max: 2, conc: 0.4, concText: '0,4 mg/mL', note: 'Depressão respiratória por opioide: começar com 0,001–0,005 mg/kg.' }, kg) +
      row({ name: 'Flumazenil', perKg: 0.01, unit: 'mg', max: 0.2, conc: 0.1, concText: '0,1 mg/mL' }, kg) +
      row({ name: 'Ondansetrona', perKg: 0.1, unit: 'mg', max: 4, conc: 2, concText: '2 mg/mL' }, kg) +
      row({ name: 'Dexametasona (NVPO)', perKg: 0.15, unit: 'mg', max: 8, conc: 4, concText: '4 mg/mL' }, kg) +
      row({ name: 'Dipirona', perKg: [15, 20], unit: 'mg', max: 1000, conc: 500, concText: '500 mg/mL' }, kg));

    const m = maintenance(kg);
    html += card('Fluidos e volemia', 'var(--teal)', '',
      kv('Manutenção (4-2-1)', `${fmt(m, 0)}<span class="dose-unit"> mL/h</span>`) +
      kv(`Volemia estimada (${bloodVolumePerKg(months)} mL/kg)`, `${fmt(kg * bloodVolumePerKg(months), 0)}<span class="dose-unit"> mL</span>`) +
      kv('Concentrado de hemácias 10–15 mL/kg', `${fmt(kg * 10, 0)}–${fmt(kg * 15, 0)}<span class="dose-unit"> mL</span>`),
      'Prematuro: volemia ~90–100 mL/kg.');

    html += '<div class="sc-foot">PALS 2020, APLS, Harriet Lane. Valores de referência: confira com o protocolo do serviço. Nenhum dado é salvo.</div>';
    out.innerHTML = html;
  }

  /**
   * Builds the static inputs once and wires them.
   * @returns {void}
   */
  function build() {
    const pane = document.getElementById('tab-ped');
    if (!pane || pane.firstChild) return;
    pane.innerHTML = `
      <div class="disclaimer">⚠️ Pediatria: use esta aba, não as abas de adulto. Uso exclusivo por médico.</div>
      <div class="sec-hdr">Paciente pediátrico</div>
      <div class="drug-card"><div class="dose-table">
        <div class="dose-row"><span class="dose-label">Idade</span><span class="dose-val">
          <input type="number" id="ped-age" class="hid-input" inputmode="decimal" placeholder="3" min="0" step="any">
          <select id="ped-age-u" class="hid-input" style="width:auto"><option value="12">anos</option><option value="1">meses</option><option value="0.0329">dias</option></select></span></div>
        <div class="dose-row"><span class="dose-label">Peso (vazio = estimado)</span><span class="dose-val">
          <input type="number" id="ped-weight" class="hid-input" inputmode="decimal" placeholder="—" min="0" step="any"><span class="dose-unit"> kg</span></span></div>
        <div class="dose-row"><span class="dose-label" id="ped-wused"></span></div>
      </div></div>
      <div id="ped-out"></div>`;
    pane.addEventListener('input', compute);
    pane.addEventListener('change', compute);
    compute();
  }

  build();
})(typeof window !== 'undefined' ? window : globalThis);
