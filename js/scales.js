/**
 * @file Risk scales and scores for the "Escalas" tab.
 *
 * Pre-operative: Apfel (PONV), STOP-Bang (obstructive sleep apnea),
 * RCRI/Lee (cardiac risk), Caprini 2005 (VTE), El-Ganzouri and LEMON (airway).
 * Post-operative / ICU: modified Aldrete (PACU), ROX index (high-flow nasal cannula).
 *
 * Two layers:
 *  - a pure calculation layer (no DOM), exposed as `ScalesCalc` (checked by the ?teste self-test in index.html);
 *  - a UI layer that renders accordions into `#tab-esc`.
 *
 * Privacy: selections are kept in memory only. Nothing about the patient is
 * written to localStorage or sent anywhere.
 */
(function (root) {
  'use strict';

  /* ════════════════════════════════════════
     Calculation layer
  ════════════════════════════════════════ */

  /**
   * Apfel PONV risk by number of risk factors (0–4), in percent.
   * Apfel et al. 1999 (10/21/39/61/79 %).
   * @type {number[]}
   */
  const APFEL_RISK = [10, 21, 39, 61, 79];

  /**
   * Computes the Apfel score.
   * Risk factors: female sex, non-smoker, history of PONV or motion sickness,
   * post-operative opioids.
   * @param {{female: boolean, smoker: boolean, history: boolean, opioid: boolean}} f Factors.
   * @returns {{points: number, risk: number, advice: string}} Points (0–4), risk in %, advice text.
   */
  function apfel(f) {
    const points = (f.female ? 1 : 0) + (f.smoker ? 0 : 1) + (f.history ? 1 : 0) + (f.opioid ? 1 : 0);
    const advice = points === 0
      ? 'Sem profilaxia de rotina'
      : points <= 2
        ? '2 antieméticos (ex: dexametasona + ondansetrona)'
        : '3–4 antieméticos + considerar TIVA';
    return { points, risk: APFEL_RISK[points], advice };
  }

  /**
   * Computes the STOP-Bang score (8 yes/no items, 1 point each).
   * @param {boolean[]} items Eight answers: snoring, tired, observed apnea, pressure (hypertension),
   *   BMI > 35, age > 50, neck > 40 cm, male.
   * @returns {{points: number, level: 'low'|'intermediate'|'high', label: string}}
   */
  function stopBang(items) {
    const points = items.filter(Boolean).length;
    if (points <= 2) return { points, level: 'low', label: 'Baixo risco de AOS' };
    if (points <= 4) return { points, level: 'intermediate', label: 'Risco intermediário de AOS' };
    return { points, level: 'high', label: 'Alto risco de AOS' };
  }

  /**
   * Risk of major cardiac events (cardiac death, non-fatal MI or cardiac arrest) at 30 days,
   * by number of RCRI predictors. Updated estimates from Duceppe et al. 2017.
   * Index 3 means "3 or more".
   * @type {number[]}
   */
  const RCRI_RISK = [3.9, 6.0, 10.1, 15];

  /**
   * Computes the Revised Cardiac Risk Index (6 items, 1 point each).
   * @param {boolean[]} items Six answers: high-risk surgery, ischemic heart disease, heart failure,
   *   cerebrovascular disease, insulin-treated diabetes, creatinine > 2 mg/dL.
   * @returns {{points: number, risk: number}} Points (0–6) and 30-day risk in %.
   */
  function rcri(items) {
    const points = items.filter(Boolean).length;
    return { points, risk: RCRI_RISK[Math.min(points, 3)] };
  }

  /**
   * Modified Aldrete score parameters and their options (points are the option index order 2,1,0).
   * @type {Array<{key: string, label: string, options: Array<{pts: number, text: string}>}>}
   */
  const ALDRETE_PARAMS = [
    { key: 'activity', label: 'Atividade', options: [
      { pts: 2, text: 'Move os 4 membros' }, { pts: 1, text: 'Move 2 membros' }, { pts: 0, text: 'Não move os membros' } ] },
    { key: 'respiration', label: 'Respiração', options: [
      { pts: 2, text: 'Respira fundo e tosse livremente' }, { pts: 1, text: 'Dispneia ou respiração limitada' }, { pts: 0, text: 'Apneia' } ] },
    { key: 'circulation', label: 'Circulação (PA)', options: [
      { pts: 2, text: 'PA ± 20% do pré-anestésico' }, { pts: 1, text: 'PA 20–49% do pré-anestésico' }, { pts: 0, text: 'PA ≥ 50% do pré-anestésico' } ] },
    { key: 'consciousness', label: 'Consciência', options: [
      { pts: 2, text: 'Totalmente acordado' }, { pts: 1, text: 'Desperta ao ser chamado' }, { pts: 0, text: 'Não responde' } ] },
    { key: 'spo2', label: 'Saturação de O₂', options: [
      { pts: 2, text: 'SpO₂ > 92% em ar ambiente' }, { pts: 1, text: 'Precisa de O₂ para manter SpO₂ > 90%' }, { pts: 0, text: 'SpO₂ < 90% mesmo com O₂' } ] },
  ];

  /**
   * Computes the modified Aldrete score.
   * @param {Object<string, number|null>} values Points per parameter key (null/undefined = not answered).
   * @returns {{points: number, answered: number, total: number, complete: boolean}}
   */
  function aldrete(values) {
    let points = 0;
    let answered = 0;
    ALDRETE_PARAMS.forEach((p) => {
      const v = values[p.key];
      if (typeof v === 'number' && v >= 0 && v <= 2) { points += v; answered++; }
    });
    return { points, answered, total: ALDRETE_PARAMS.length, complete: answered === ALDRETE_PARAMS.length };
  }

  /**
   * Computes the ROX index: (SpO2 / FiO2) / respiratory rate.
   * @param {number} spo2 SpO2 in % (50–100).
   * @param {number} fio2 FiO2 as a percentage (21–100) or as a fraction (0.21–1).
   * @param {number} rr Respiratory rate in breaths/min (> 0).
   * @returns {number} The index, or NaN when an input is missing/invalid.
   */
  function rox(spo2, fio2, rr) {
    const fraction = fio2 > 1 ? fio2 / 100 : fio2;
    if (!(spo2 >= 50 && spo2 <= 100) || !(fraction >= 0.21 && fraction <= 1) || !(rr > 0)) return NaN;
    return spo2 / fraction / rr;
  }

  /**
   * Failure cutoffs of the ROX index by hours after starting high-flow nasal cannula
   * (Roca et al. 2019): below the value at that time predicts failure.
   * @type {Object<string, number>}
   */
  const ROX_FAIL = { 2: 2.85, 6: 3.47, 12: 3.85 };

  /** ROX value at or above which success is likely at 2, 6 or 12 hours. */
  const ROX_SUCCESS = 4.88;

  /**
   * Interprets a ROX value.
   * @param {number} value ROX index.
   * @param {number|null} hours 2, 6 or 12; null when measured at another time.
   * @returns {{level: 'success'|'failure'|'indeterminate', label: string}}
   */
  function roxInterpret(value, hours) {
    if (value >= ROX_SUCCESS) return { level: 'success', label: 'Favorece sucesso do CNAF (menor risco de intubação)' };
    if (hours && value < ROX_FAIL[hours]) return { level: 'failure', label: `Alto risco de falha do CNAF (< ${String(ROX_FAIL[hours]).replace('.', ',')} em ${hours} h)` };
    if (!hours) return { level: 'indeterminate', label: 'Abaixo de 4,88: sem corte de falha para este horário — reavaliar' };
    return { level: 'indeterminate', label: 'Zona indeterminada — reavaliar em seguida' };
  }

  /**
   * Caprini 2005 items by points. Items marked `femaleOnly` apply only to women.
   * Age, surgery type and mobility are chosen separately (single choice each).
   * @type {Array<{id: string, pts: number, label: string, femaleOnly?: boolean}>}
   */
  const CAPRINI_ITEMS = [
    { id: 'varicose', pts: 1, label: 'Veias varicosas' },
    { id: 'swollen', pts: 1, label: 'Pernas edemaciadas' },
    { id: 'bmi25', pts: 1, label: 'IMC > 25' },
    { id: 'ibd', pts: 1, label: 'Doença inflamatória intestinal (história)' },
    { id: 'mi', pts: 1, label: 'Infarto agudo do miocárdio (< 1 mês)' },
    { id: 'chf', pts: 1, label: 'Insuficiência cardíaca congestiva (< 1 mês)' },
    { id: 'sepsis', pts: 1, label: 'Sepse (< 1 mês)' },
    { id: 'lung', pts: 1, label: 'Doença pulmonar grave, incluindo pneumonia (< 1 mês)' },
    { id: 'copd', pts: 1, label: 'Função pulmonar anormal (DPOC)' },
    { id: 'preg', pts: 1, label: 'Gestação ou pós-parto (< 1 mês)', femaleOnly: true },
    { id: 'loss', pts: 1, label: 'Perda gestacional inexplicada, abortamento recorrente ou natimorto (história)', femaleOnly: true },
    { id: 'ocp', pts: 1, label: 'Anticoncepcional oral ou reposição hormonal', femaleOnly: true },
    { id: 'malig', pts: 2, label: 'Neoplasia atual ou prévia' },
    { id: 'cast', pts: 2, label: 'Gesso imobilizante (< 1 mês)' },
    { id: 'cvc', pts: 2, label: 'Acesso venoso central' },
    { id: 'vte', pts: 3, label: 'História pessoal de TEV' },
    { id: 'famvte', pts: 3, label: 'História familiar de TEV' },
    { id: 'fvl', pts: 3, label: 'Fator V de Leiden' },
    { id: 'prot', pts: 3, label: 'Mutação da protrombina 20210A' },
    { id: 'lupus', pts: 3, label: 'Anticoagulante lúpico' },
    { id: 'acl', pts: 3, label: 'Anticorpos anticardiolipina elevados' },
    { id: 'homo', pts: 3, label: 'Homocisteína sérica elevada' },
    { id: 'hit', pts: 3, label: 'Trombocitopenia induzida por heparina' },
    { id: 'thrombo', pts: 3, label: 'Outra trombofilia congênita ou adquirida' },
    { id: 'stroke', pts: 5, label: 'AVC (< 1 mês)' },
    { id: 'fracture', pts: 5, label: 'Fratura de quadril, pelve ou perna (< 1 mês)' },
    { id: 'sci', pts: 5, label: 'Lesão medular aguda com paralisia (< 1 mês)' },
    { id: 'trauma', pts: 5, label: 'Politrauma (< 1 mês)' },
  ];

  /**
   * Caprini surgery options (single choice).
   * @type {Array<{id: string, pts: number, label: string}>}
   */
  const CAPRINI_SURGERY = [
    { id: 'minor', pts: 1, label: 'Cirurgia menor (< 45 min)' },
    { id: 'arthroscopy', pts: 2, label: 'Artroscopia' },
    { id: 'lap', pts: 2, label: 'Laparoscópica > 45 min' },
    { id: 'open', pts: 2, label: 'Aberta maior > 45 min' },
    { id: 'arthroplasty', pts: 5, label: 'Artroplastia eletiva de membro inferior' },
  ];

  /**
   * Caprini mobility options (single choice).
   * @type {Array<{id: string, pts: number, label: string}>}
   */
  const CAPRINI_MOBILITY = [
    { id: 'rest', pts: 1, label: 'Repouso no leito (paciente clínico)' },
    { id: 'bed72', pts: 2, label: 'Acamado > 72 h' },
  ];

  /**
   * Caprini age groups (single choice). `id` is the group key used by the UI.
   * @type {Array<{id: string, pts: number, label: string}>}
   */
  const CAPRINI_AGE = [
    { id: 'a0', pts: 0, label: '≤ 40 anos' },
    { id: 'a1', pts: 1, label: '41–60 anos' },
    { id: 'a2', pts: 2, label: '61–74 anos' },
    { id: 'a3', pts: 3, label: '≥ 75 anos' },
  ];

  /**
   * Maps an age in years to a Caprini age group id.
   * @param {number} years Age in years.
   * @returns {string|null} 'a0'..'a3', or null when the age is unknown.
   */
  function capriniAgeGroup(years) {
    if (!(years > 0)) return null;
    if (years >= 75) return 'a3';
    if (years >= 61) return 'a2';
    if (years >= 41) return 'a1';
    return 'a0';
  }

  /**
   * Computes the Caprini 2005 score and maps it to the ACCP 2012 (Gould et al.) categories
   * for non-orthopedic surgery: 0 very low, 1–2 low, 3–4 moderate, ≥ 5 high.
   * @param {{female: boolean, age: string|null, surgery: string, mobility: string, flags: Object<string, boolean>}} sel
   *   Selection. `surgery`/`mobility` are option ids or '' for none; `flags` maps item id to checked.
   * @returns {{points: number, level: 'verylow'|'low'|'moderate'|'high', label: string, advice: string}}
   */
  function caprini(sel) {
    let points = 0;
    const byId = (list, id) => list.find((o) => o.id === id);
    const age = byId(CAPRINI_AGE, sel.age);
    if (age) points += age.pts;
    const surgery = byId(CAPRINI_SURGERY, sel.surgery);
    if (surgery) points += surgery.pts;
    const mobility = byId(CAPRINI_MOBILITY, sel.mobility);
    if (mobility) points += mobility.pts;
    CAPRINI_ITEMS.forEach((it) => {
      if (it.femaleOnly && !sel.female) return;
      if (sel.flags[it.id]) points += it.pts;
    });
    if (points === 0) return { points, level: 'verylow', label: 'Muito baixo', advice: 'Deambulação precoce' };
    if (points <= 2) return { points, level: 'low', label: 'Baixo', advice: 'Profilaxia mecânica (compressão pneumática intermitente)' };
    if (points <= 4) return { points, level: 'moderate', label: 'Moderado', advice: 'Heparina (HNF a cada 8 h ou HBPM), com ou sem compressão mecânica' };
    return { points, level: 'high', label: 'Alto', advice: 'Heparina (HNF ou HBPM), com ou sem compressão mecânica' };
  }

  /**
   * El-Ganzouri risk index (EGRI) items and options (El-Ganzouri et al., Anesth Analg 1996).
   * Body weight is item `weight` and is read from the patient panel when available.
   * @type {Array<{key: string, label: string, options: Array<{pts: number, text: string}>}>}
   */
  const EGRI_PARAMS = [
    { key: 'mouth', label: 'Abertura de boca', options: [{ pts: 0, text: '≥ 4 cm' }, { pts: 1, text: '< 4 cm' }] },
    { key: 'tmd', label: 'Distância tireomentoniana', options: [{ pts: 0, text: '> 6,5 cm' }, { pts: 1, text: '6,0–6,5 cm' }, { pts: 2, text: '< 6,0 cm' }] },
    { key: 'mall', label: 'Mallampati', options: [{ pts: 0, text: 'I' }, { pts: 1, text: 'II' }, { pts: 2, text: 'III ou IV' }] },
    { key: 'neck', label: 'Mobilidade cervical', options: [{ pts: 0, text: '> 90°' }, { pts: 1, text: '80–90°' }, { pts: 2, text: '< 80°' }] },
    { key: 'prog', label: 'Protrusão da mandíbula', options: [{ pts: 0, text: 'Consegue' }, { pts: 1, text: 'Não consegue' }] },
    { key: 'weight', label: 'Peso', options: [{ pts: 0, text: '< 90 kg' }, { pts: 1, text: '90–110 kg' }, { pts: 2, text: '> 110 kg' }] },
    { key: 'hist', label: 'História de intubação difícil', options: [{ pts: 0, text: 'Nenhuma' }, { pts: 1, text: 'Duvidosa' }, { pts: 2, text: 'Definida' }] },
  ];

  /**
   * Maps body weight (kg) to EGRI points.
   * @param {number} kg Weight.
   * @returns {number} 0, 1 or 2.
   */
  function egriWeightPts(kg) {
    return kg > 110 ? 2 : kg >= 90 ? 1 : 0;
  }

  /**
   * Computes the EGRI. Score ≥ 4 predicts difficult laryngoscopy (Cormack-Lehane III–IV).
   * @param {Object<string, number|null>} values Points chosen per item key (null/undefined = unanswered).
   * @returns {{points: number, answered: number, total: number, complete: boolean, difficult: boolean}}
   */
  function egri(values) {
    let points = 0;
    let answered = 0;
    EGRI_PARAMS.forEach((p) => {
      const v = values[p.key];
      if (typeof v === 'number') { points += v; answered++; }
    });
    return { points, answered, total: EGRI_PARAMS.length, complete: answered === EGRI_PARAMS.length, difficult: points >= 4 };
  }

  /**
   * LEMON items (Reed et al., Emerg Med J 2005), 1 point each, 0–10.
   * @type {Array<{key: string, group: string, label: string}>}
   */
  const LEMON_ITEMS = [
    { key: 'trauma', group: 'L — Olhar', label: 'Trauma facial' },
    { key: 'incisors', group: 'L — Olhar', label: 'Incisivos grandes' },
    { key: 'beard', group: 'L — Olhar', label: 'Barba ou bigode' },
    { key: 'tongue', group: 'L — Olhar', label: 'Língua grande' },
    { key: 'e1', group: 'E — Regra 3-3-2', label: 'Abertura entre incisivos < 3 dedos' },
    { key: 'e2', group: 'E — Regra 3-3-2', label: 'Hioide–mento < 3 dedos' },
    { key: 'e3', group: 'E — Regra 3-3-2', label: 'Tireoide–assoalho da boca < 2 dedos' },
    { key: 'mall', group: 'M — Mallampati', label: 'Mallampati ≥ III' },
    { key: 'obst', group: 'O — Obstrução', label: 'Obstrução da via aérea (epiglotite, abscesso, tumor, trauma)' },
    { key: 'neckmob', group: 'N — Pescoço', label: 'Mobilidade cervical reduzida' },
  ];

  root.ScalesCalc = {
    EGRI_PARAMS, LEMON_ITEMS, egri, egriWeightPts,
    APFEL_RISK, RCRI_RISK, ROX_FAIL, ROX_SUCCESS, ALDRETE_PARAMS,
    CAPRINI_ITEMS, CAPRINI_SURGERY, CAPRINI_MOBILITY, CAPRINI_AGE,
    apfel, stopBang, rcri, aldrete, rox, roxInterpret, caprini, capriniAgeGroup,
  };

  if (typeof document === 'undefined') return; // Node (tests): calculation layer only

  /* ════════════════════════════════════════
     UI layer
  ════════════════════════════════════════ */

  /**
   * In-memory selections. Never persisted.
   * @type {{apfel: Object, stop: Object, rcri: Object, caprini: Object, aldrete: Object}}
   */
  const state = {
    apfel: { nonSmoker: false, history: false, opioid: false },
    stop: { snore: false, tired: false, apnea: false, pressure: false, bmi: false, age: false, neck: false, male: false },
    rcri: { surgery: false, ihd: false, chf: false, cva: false, insulin: false, creat: false },
    caprini: { age: '', surgery: '', mobility: '', flags: {} },
    aldrete: {},
    egri: {},
    lemon: {},
  };

  /**
   * Reads what the patient panel knows (sex, age, BMI). Missing values are null.
   * @returns {{female: boolean, age: number|null, bmi: number|null}}
   */
  function panel() {
    let female = false;
    try {
      // eslint-disable-next-line no-undef
      female = typeof sex !== 'undefined' && sex === 'F';
    } catch (e) {
      female = false; // global not initialized yet
    }
    const read = (id) => {
      const el = document.getElementById(id);
      const n = el ? parseFloat(el.value) : NaN;
      return n > 0 ? n : null;
    };
    const w = read('weight');
    const h = read('height');
    return { female, age: read('age'), bmi: w && h ? w / ((h / 100) * (h / 100)) : null };
  }

  /**
   * Builds a checkbox row bound to a state key.
   * @param {string} sc Scale key in `state`.
   * @param {string} key Item key.
   * @param {string} label Visible text.
   * @param {boolean} checked Current value.
   * @returns {string} HTML.
   */
  function cb(sc, key, label, checked) {
    return `<label class="score-row"><input type="checkbox" data-sc="${sc}" data-k="${key}"${checked ? ' checked' : ''}> <span>${label}</span></label>`;
  }

  /**
   * Builds a read-only row for a value taken from the patient panel.
   * @param {boolean} value Whether the criterion is met.
   * @param {string} label Visible text.
   * @returns {string} HTML.
   */
  function auto(value, label) {
    return `<div class="score-row sc-auto"><span>${value ? '☑' : '☐'}</span> <span>${label} <span class="dose-unit">(do painel)</span></span></div>`;
  }

  /**
   * Builds a <select> bound to a state field.
   * @param {string} sc Scale key.
   * @param {string} key Field key.
   * @param {string} current Current value.
   * @param {Array<{value: string, text: string}>} options Options (first is usually the "none" one).
   * @returns {string} HTML.
   */
  function select(sc, key, current, options) {
    const opts = options.map((o) => `<option value="${o.value}"${o.value === current ? ' selected' : ''}>${o.text}</option>`).join('');
    return `<select class="sc-sel" data-sc="${sc}" data-k="${key}">${opts}</select>`;
  }

  /**
   * Builds a coloured badge (uses the app's existing badge classes).
   * @param {'bg'|'bw'|'br'|'bi'} cls Badge class.
   * @param {string} text Badge text.
   * @returns {string} HTML.
   */
  function badge(cls, text) {
    return `<span class="badge ${cls}">${text}</span>`;
  }

  /**
   * Formats a number with a decimal comma and the given digits.
   * @param {number} n Number.
   * @param {number} d Decimal places.
   * @returns {string}
   */
  function pt(n, d) {
    return n.toFixed(d).replace('.', ',');
  }

  /** Renderers: each returns the card body HTML and the summary badge HTML. */
  const renderers = {
    apfel() {
      const p = panel();
      const r = apfel({ female: p.female, smoker: !state.apfel.nonSmoker, history: state.apfel.history, opioid: state.apfel.opioid });
      const body = `
        ${auto(p.female, 'Sexo feminino')}
        ${cb('apfel', 'nonSmoker', 'Não fumante', state.apfel.nonSmoker)}
        ${cb('apfel', 'history', 'História de NVPO ou cinetose', state.apfel.history)}
        ${cb('apfel', 'opioid', 'Opioide no pós-operatório', state.apfel.opioid)}
        <div class="sc-res"><b>${r.points}/4 — risco de NVPO ${r.risk}%</b><div>${r.advice}</div>
        <div class="sc-src">Apfel 1999; consenso Gan 2020. Doses dos antieméticos: aba Adjuv.</div></div>`;
      return { body, badge: badge(r.points >= 3 ? 'br' : r.points >= 1 ? 'bw' : 'bg', `${r.points}/4 · ${r.risk}%`) };
    },

    stop() {
      const p = panel();
      const s = state.stop;
      const ageAuto = p.age !== null;
      const bmiAuto = p.bmi !== null;
      const items = [s.snore, s.tired, s.apnea, s.pressure, bmiAuto ? p.bmi > 35 : s.bmi, ageAuto ? p.age > 50 : s.age, s.neck, !p.female];
      const r = stopBang(items);
      const body = `
        ${cb('stop', 'snore', 'Ronco alto', s.snore)}
        ${cb('stop', 'tired', 'Cansaço ou sonolência diurna', s.tired)}
        ${cb('stop', 'apnea', 'Apneia observada durante o sono', s.apnea)}
        ${cb('stop', 'pressure', 'Hipertensão arterial', s.pressure)}
        ${bmiAuto ? auto(p.bmi > 35, 'IMC > 35') : cb('stop', 'bmi', 'IMC > 35 (sem altura/peso no painel)', s.bmi)}
        ${ageAuto ? auto(p.age > 50, 'Idade > 50 anos') : cb('stop', 'age', 'Idade > 50 anos (sem idade no painel)', s.age)}
        ${cb('stop', 'neck', 'Circunferência do pescoço > 40 cm', s.neck)}
        ${auto(!p.female, 'Sexo masculino')}
        <div class="sc-res"><b>${r.points}/8 — ${r.label}</b>
        <div class="sc-src">0–2 baixo · 3–4 intermediário · 5–8 alto. Chung et al.</div></div>`;
      const cls = r.level === 'high' ? 'br' : r.level === 'intermediate' ? 'bw' : 'bg';
      return { body, badge: badge(cls, `${r.points}/8`) };
    },

    rcri() {
      const s = state.rcri;
      const r = rcri([s.surgery, s.ihd, s.chf, s.cva, s.insulin, s.creat]);
      const body = `
        ${cb('rcri', 'surgery', 'Cirurgia de alto risco (intraperitoneal, intratorácica ou vascular suprainguinal)', s.surgery)}
        ${cb('rcri', 'ihd', 'Doença cardíaca isquêmica', s.ihd)}
        ${cb('rcri', 'chf', 'Insuficiência cardíaca congestiva', s.chf)}
        ${cb('rcri', 'cva', 'Doença cerebrovascular (AVC ou AIT)', s.cva)}
        ${cb('rcri', 'insulin', 'Diabetes em uso de insulina', s.insulin)}
        ${cb('rcri', 'creat', 'Creatinina > 2 mg/dL', s.creat)}
        <div class="sc-res"><b>${r.points}${r.points >= 3 ? '+' : ''} ponto(s) — ${pt(r.risk, r.risk % 1 === 0 ? 0 : 1)}% de evento cardíaco maior em 30 dias</b>
        <div>Morte cardíaca, IAM não fatal ou parada cardíaca. Estimativas atualizadas (Duceppe 2017): 3,9 / 6,0 / 10,1 / 15% para 0 / 1 / 2 / ≥ 3.</div>
        <div class="sc-src">Lee 1999 (RCRI).</div></div>`;
      return { body, badge: badge(r.points >= 3 ? 'br' : r.points >= 1 ? 'bw' : 'bg', `${r.points} pt · ${pt(r.risk, r.risk % 1 === 0 ? 0 : 1)}%`) };
    },

    caprini() {
      const p = panel();
      const c = state.caprini;
      const ageGroup = p.age !== null ? capriniAgeGroup(p.age) : (c.age || null);
      const flags = Object.assign({}, c.flags);
      if (p.bmi !== null) flags.bmi25 = p.bmi > 25;
      const r = caprini({ female: p.female, age: ageGroup, surgery: c.surgery, mobility: c.mobility, flags });

      const ageRow = p.age !== null
        ? `<div class="score-row sc-auto"><span>Idade</span> <span>${CAPRINI_AGE.find((a) => a.id === ageGroup).label} <span class="dose-unit">(do painel)</span></span></div>`
        : `<div class="sc-field"><span>Idade</span>${select('caprini', 'age', c.age, [{ value: '', text: 'Selecione…' }].concat(CAPRINI_AGE.map((a) => ({ value: a.id, text: a.label }))))}</div>`;
      const surgeryRow = `<div class="sc-field"><span>Cirurgia</span>${select('caprini', 'surgery', c.surgery, [{ value: '', text: 'Nenhuma / não se aplica' }].concat(CAPRINI_SURGERY.map((o) => ({ value: o.id, text: `${o.label} (${o.pts})` }))))}</div>`;
      const mobilityRow = `<div class="sc-field"><span>Mobilidade</span>${select('caprini', 'mobility', c.mobility, [{ value: '', text: 'Deambula normalmente' }].concat(CAPRINI_MOBILITY.map((o) => ({ value: o.id, text: `${o.label} (${o.pts})` }))))}</div>`;

      let groups = '';
      [1, 2, 3, 5].forEach((pts) => {
        const rows = CAPRINI_ITEMS.filter((it) => it.pts === pts && (!it.femaleOnly || p.female)).map((it) => {
          if (it.id === 'bmi25' && p.bmi !== null) return auto(p.bmi > 25, it.label);
          return cb('caprini', it.id, it.label, !!c.flags[it.id]);
        }).join('');
        groups += `<div class="sc-grp">${pts} ponto${pts > 1 ? 's' : ''}</div>${rows}`;
      });

      const warn = [];
      if (c.surgery === 'arthroplasty') warn.push('Artroplastia: a tabela de profilaxia abaixo é de cirurgia <b>não ortopédica</b>. Siga a recomendação específica para artroplastia.');
      warn.push('O Caprini mede risco trombótico, <b>não risco de sangramento</b>: avalie-o à parte antes de indicar anticoagulante.');
      const cls = { verylow: 'bg', low: 'bg', moderate: 'bw', high: 'br' }[r.level];
      const body = `
        ${ageRow}${surgeryRow}${mobilityRow}${groups}
        <div class="sc-res"><b>${r.points} ponto(s) — risco ${r.label.toLowerCase()}</b>
        <div>${r.advice}</div>
        ${warn.map((w) => `<div class="sc-warn">${w}</div>`).join('')}
        <div class="sc-src">Caprini 2005; categorias ACCP 2012 (Gould et al., Chest) para cirurgia não ortopédica: 0 / 1–2 / 3–4 / ≥ 5. Siga o protocolo do serviço.</div></div>`;
      return { body, badge: badge(cls, `${r.points} pt · ${r.label}`) };
    },

    egri() {
      const kg = (() => { const el = document.getElementById('weight'); const n = el ? parseFloat(el.value) : NaN; return n > 0 ? n : null; })();
      const values = Object.assign({}, state.egri);
      if (kg !== null) values.weight = egriWeightPts(kg);
      const r = egri(values);
      const rows = EGRI_PARAMS.map((p) => {
        if (p.key === 'weight' && kg !== null) {
          const o = p.options.find((x) => x.pts === values.weight);
          return `<div class="score-row sc-auto"><span>Peso</span> <span>${o.text} (${o.pts}) <span class="dose-unit">(do painel)</span></span></div>`;
        }
        const cur = state.egri[p.key];
        const opts = [{ value: '', text: 'Selecione…' }].concat(p.options.map((o) => ({ value: String(o.pts), text: `${o.text} (${o.pts})` })));
        return `<div class="sc-field sc-field-wide"><span>${p.label}</span>${select('egri', p.key, typeof cur === 'number' ? String(cur) : '', opts)}</div>`;
      }).join('');
      const status = r.complete ? `${r.points}/12` : `${r.points}/12 (faltam ${r.total - r.answered})`;
      const verdict = r.difficult
        ? 'EGRI ≥ 4: preditor de laringoscopia difícil (Cormack III–IV). Planeje via aérea difícil.'
        : r.complete ? 'EGRI < 4: baixo risco previsto de laringoscopia difícil.' : 'Preencha os 7 itens.';
      const body = `${rows}
        <div class="sc-res"><b>${status}</b><div>${verdict}</div>
        <div class="sc-src">El-Ganzouri 1996. Nenhum escore exclui via aérea difícil: tenha sempre o plano B.</div></div>`;
      return { body, badge: badge(r.difficult ? 'br' : r.complete ? 'bg' : 'bi', status) };
    },

    lemon() {
      let last = '';
      let points = 0;
      const rows = LEMON_ITEMS.map((it) => {
        if (state.lemon[it.key]) points++;
        const hdr = it.group !== last ? `<div class="sc-grp">${it.group}</div>` : '';
        last = it.group;
        return hdr + cb('lemon', it.key, it.label, !!state.lemon[it.key]);
      }).join('');
      const body = `${rows}
        <div class="sc-res"><b>${points}/10${points ? ' — preditor(es) de intubação difícil' : ''}</b>
        <div>Sem ponto de corte validado: cada item positivo aumenta o risco.</div>
        <div class="sc-src">LEMON (Reed 2005). Pensado para emergência; use junto com o EGRI no pré-anestésico.</div></div>`;
      return { body, badge: badge(points >= 2 ? 'br' : points === 1 ? 'bw' : 'bg', `${points}/10`) };
    },

    aldrete() {
      const a = aldrete(state.aldrete);
      const rows = ALDRETE_PARAMS.map((p) => {
        const cur = state.aldrete[p.key];
        const opts = [{ value: '', text: 'Selecione…' }].concat(p.options.map((o) => ({ value: String(o.pts), text: `${o.pts} — ${o.text}` })));
        return `<div class="sc-field sc-field-wide"><span>${p.label}</span>${select('aldrete', p.key, typeof cur === 'number' ? String(cur) : '', opts)}</div>`;
      }).join('');
      const status = a.complete ? `${a.points}/10` : `${a.points}/10 (faltam ${a.total - a.answered})`;
      const body = `${rows}
        <div class="sc-res"><b>${status}</b>
        <div>${a.complete ? 'Critério de alta da SRPA varia conforme o serviço (≥ 9 ou 10/10). Confira o protocolo local.' : 'Preencha os 5 parâmetros para o escore completo.'}</div>
        <div class="sc-src">Aldrete modificado (SpO₂ no lugar da cor da pele).</div></div>`;
      return { body, badge: badge(a.complete ? (a.points >= 9 ? 'bg' : 'bw') : 'bi', status) };
    },
  };

  /** Scales shown in the tab, in order, grouped under section headers. */
  const LAYOUT = [
    { header: 'Pré-operatório', scales: [
      { id: 'apfel', title: 'Apfel', subtitle: 'Risco de náusea e vômito (NVPO)' },
      { id: 'stop', title: 'STOP-Bang', subtitle: 'Apneia obstrutiva do sono' },
      { id: 'rcri', title: 'RCRI (Lee)', subtitle: 'Risco cardíaco perioperatório' },
      { id: 'caprini', title: 'Caprini', subtitle: 'Risco de TEV e profilaxia' },
    ] },
    { header: 'Via aérea', scales: [
      { id: 'egri', title: 'El-Ganzouri (EGRI)', subtitle: 'Previsão de laringoscopia difícil' },
      { id: 'lemon', title: 'LEMON', subtitle: 'Previsão de intubação difícil' },
    ] },
    { header: 'Pós-operatório e UTI', scales: [
      { id: 'aldrete', title: 'Aldrete modificado', subtitle: 'Recuperação na SRPA' },
      { id: 'rox', title: 'Índice ROX', subtitle: 'Falha do cateter nasal de alto fluxo' },
    ] },
  ];

  /**
   * Builds the static markup of the tab once (accordions with empty bodies).
   * @returns {void}
   */
  function build() {
    const pane = document.getElementById('tab-esc');
    if (!pane || pane.dataset.built) return;
    let html = '';
    LAYOUT.forEach((sec) => {
      html += `<div class="sec-hdr">${sec.header}</div>`;
      sec.scales.forEach((s) => {
        html += `<details class="sc" id="sc-${s.id}"><summary>
          <span class="sc-name"><b>${s.title}</b><small>${s.subtitle}</small></span>
          <span class="sc-badge" id="sc-${s.id}-badge"></span></summary>
          <div class="sc-body" id="sc-${s.id}-body"></div></details>`;
      });
    });
    html += '<div class="sc-foot">Escalas de apoio à decisão. Não substituem o julgamento clínico nem o protocolo da instituição. Nenhum dado do paciente é salvo.</div>';
    pane.innerHTML = html;
    pane.dataset.built = '1';
    document.getElementById('sc-rox-body').innerHTML = roxBody();
    bind(pane);
  }

  /**
   * Static markup of the ROX card (numeric inputs must not be re-rendered while typing).
   * @returns {string} HTML.
   */
  function roxBody() {
    return `
      <div class="dose-row"><span class="dose-label">SpO₂</span><span class="dose-val"><input type="number" id="sc-rox-spo2" class="hid-input" inputmode="decimal" placeholder="94" min="50" max="100"><span class="dose-unit"> %</span></span></div>
      <div class="dose-row"><span class="dose-label">FiO₂</span><span class="dose-val"><input type="number" id="sc-rox-fio2" class="hid-input" inputmode="decimal" placeholder="50" min="21" max="100"><span class="dose-unit"> %</span></span></div>
      <div class="dose-row"><span class="dose-label">Frequência respiratória</span><span class="dose-val"><input type="number" id="sc-rox-rr" class="hid-input" inputmode="decimal" placeholder="24" min="1"><span class="dose-unit"> irpm</span></span></div>
      <div class="dose-row"><span class="dose-label">Tempo desde o início do CNAF</span><span class="dose-val">
        <select id="sc-rox-t" class="sc-sel"><option value="2">2 h</option><option value="6">6 h</option><option value="12">12 h</option><option value="0">Outro horário</option></select></span></div>
      <div id="sc-rox-out"></div>
      <div class="sc-src">ROX = (SpO₂ ÷ FiO₂) ÷ FR. Cortes de Roca et al. 2019: ≥ 4,88 favorece sucesso; &lt; 2,85 (2 h), &lt; 3,47 (6 h) ou &lt; 3,85 (12 h) indica alto risco de falha. Validado em pneumonia com insuficiência respiratória aguda em CNAF.</div>`;
  }

  /**
   * Recomputes the ROX result from its inputs.
   * @returns {void}
   */
  function updateRox() {
    const num = (id) => {
      const el = document.getElementById(id);
      return el && el.value !== '' ? parseFloat(String(el.value).replace(',', '.')) : NaN;
    };
    const out = document.getElementById('sc-rox-out');
    const badgeEl = document.getElementById('sc-rox-badge');
    if (!out) return;
    const spo2 = num('sc-rox-spo2');
    const fio2 = num('sc-rox-fio2');
    const rr = num('sc-rox-rr');
    const hours = parseInt(document.getElementById('sc-rox-t').value, 10) || null;
    if ([spo2, fio2, rr].every((n) => isNaN(n))) { out.innerHTML = ''; badgeEl.innerHTML = ''; return; }
    const v = rox(spo2, fio2, rr);
    if (isNaN(v)) {
      out.innerHTML = '<div class="sc-res"><div>Informe SpO₂ (50–100%), FiO₂ (21–100%) e frequência respiratória.</div></div>';
      badgeEl.innerHTML = '';
      return;
    }
    const r = roxInterpret(v, hours);
    const cls = r.level === 'success' ? 'bg' : r.level === 'failure' ? 'br' : 'bw';
    out.innerHTML = `<div class="sc-res"><b>ROX ${pt(v, 2)}</b><div>${r.label}</div></div>`;
    badgeEl.innerHTML = badge(cls, `ROX ${pt(v, 2)}`);
  }

  /**
   * Re-renders every checklist-style scale (not ROX) from the current state and panel.
   * @returns {void}
   */
  function renderAll() {
    ['apfel', 'stop', 'rcri', 'caprini', 'egri', 'lemon', 'aldrete'].forEach((id) => {
      const r = renderers[id]();
      document.getElementById(`sc-${id}-body`).innerHTML = r.body;
      document.getElementById(`sc-${id}-badge`).innerHTML = r.badge;
    });
  }

  /**
   * Attaches delegated listeners for checkboxes, selects and ROX inputs.
   * @param {HTMLElement} pane The tab pane.
   * @returns {void}
   */
  function bind(pane) {
    pane.addEventListener('change', (e) => {
      const el = e.target;
      const sc = el.dataset && el.dataset.sc;
      if (sc) {
        const k = el.dataset.k;
        if (el.type === 'checkbox') {
          if (sc === 'caprini') state.caprini.flags[k] = el.checked;
          else state[sc][k] = el.checked;
        } else if (sc === 'aldrete' || sc === 'egri') {
          state[sc][k] = el.value === '' ? null : parseInt(el.value, 10);
        } else {
          state[sc][k] = el.value;
        }
        renderAll();
      } else if (el.id === 'sc-rox-t') {
        updateRox();
      }
    });
    pane.addEventListener('input', (e) => {
      if (e.target.id && e.target.id.indexOf('sc-rox-') === 0) updateRox();
    });
  }

  /**
   * Public entry point, called by the app whenever the patient panel changes.
   * Builds the tab on first use and refreshes the scales that read the panel.
   * @returns {void}
   */
  root.renderScales = function renderScales() {
    build();
    if (!document.getElementById('tab-esc')) return;
    renderAll();
  };
})(typeof window !== 'undefined' ? window : globalThis);
