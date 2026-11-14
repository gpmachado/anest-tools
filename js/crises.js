/**
 * @file Crisis tab ("Crises"): cardiac arrest with timers and metronome,
 * malignant hyperthermia, anaphylaxis, hyperkalemia and massive hemorrhage.
 *
 * Sources: AHA ACLS 2020/2023 update, MHAUS (dantrolene), Resuscitation Council UK
 * 2021 / NAP6 (perioperative anaphylaxis), UK Kidney Association 2023 (hyperkalemia),
 * European guideline on bleeding after trauma 2023 / ESAIC 2022, CRASH-2 (TXA).
 *
 * Two layers: a pure calculation layer (exposed as `CrisesCalc`) and a UI layer
 * that renders into `#crises-root` once. Only the `.cr-doses` blocks are redrawn
 * when the panel weight changes, so running timers are never reset by a redraw.
 * Nothing is saved: closing the page clears the timers and the event log.
 */
(function (root) {
  'use strict';

  /* ════════════════════════════════════════
     Calculation layer
  ════════════════════════════════════════ */

  /** Shared drug data (js/drugs.js). In Node tests it is required directly. */
  const D = root.Drugs || (typeof require === 'function' ? require('./drugs.js') : null);
  const DANT = D.dant, DANT_MH = DANT.doses.crisis.mh;
  const nf = (n) => String(n).replace('.', ',');
  const fmtN = (n) => String(+n.toFixed(n < 1 ? 2 : 1)).replace('.', ',');

  /**
   * Dantrolene for malignant hyperthermia (MHAUS): 2.5 mg/kg, repeat until
   * signs resolve; usual ceiling 10 mg/kg (may exceed it under specialist guidance).
   * @param {number} kg Actual body weight.
   * @param {number} [givenMg=0] Cumulative dose already given.
   * @returns {{dose: number, vials: number, water: number, max: number, remaining: number}|null}
   */
  function dantrolene(kg, givenMg) {
    if (!(kg > 0)) return null;
    const dose = DANT_MH.perKg * kg;
    const max = DANT_MH.maxPerKg * kg;
    const vials = Math.ceil(dose / DANT.vialMg);
    return { dose, vials, water: vials * DANT.vialWaterMl, max, remaining: Math.max(0, max - (givenMg || 0)) };
  }

  /** Below this weight the tab switches to pediatric doses. */
  const PEDS_KG = 40;
  /**
   * Pediatric mode?
   * @param {number} kg Panel weight.
   * @returns {boolean}
   */
  function isPeds(kg) { return kg > 0 && kg < PEDS_KG; }

  /**
   * Adrenaline dose in cardiac arrest: 1 mg (adult) or 0.01 mg/kg up to 1 mg of 0.1 mg/mL (child).
   * @param {number} kg Panel weight.
   * @returns {{mg: number, ml: number, concText: string}}
   */
  function adrenalineArrest(kg) {
    if (isPeds(kg)) {
      const p = D.adre.doses.peds.arrest, mg = Math.min(p.perKg * kg, p.max);
      return { mg, ml: mg / p.conc, concText: `${nf(p.conc)} mg/mL (${p.prep})` };
    }
    const mg = D.adre.doses.crisis.arrest.dose;
    return { mg, ml: mg / D.adre.conc, concText: D.adre.concText };
  }

  /**
   * Anaphylaxis doses (RCUK 2021 / NAP6).
   * @param {number} kg Weight (0 = unknown, adult values only).
   * @returns {{imMg: number, fluidMin: number, fluidMax: number}}
   */
  function anaphylaxis(kg) {
    return {
      imMg: kg > 0 ? Math.min(D.adre.doses.crisis.anaphylaxisIM.perKg * kg, D.adre.doses.crisis.anaphylaxisIM.max) : D.adre.doses.crisis.anaphylaxisIM.max,
      fluidMin: kg > 0 ? D.crystalloid.doses.crisis.bolus.perKg[0] * kg : 0,
      fluidMax: kg > 0 ? D.crystalloid.doses.crisis.bolus.perKg[1] * kg : 0,
    };
  }

  /**
   * Massive hemorrhage weight-based values.
   * @param {number} kg Weight.
   * @returns {{bloodVolume: number, cryoUnits: number, fibMin: number, fibMax: number}|null}
   */
  function hemorrhage(kg) {
    if (!(kg > 0)) return null;
    return {
      bloodVolume: (isPeds(kg) ? 80 : 70) * kg, // mL/kg: criança ~80, adulto ~70
      cryoUnits: Math.ceil(kg / 10),
      fibMin: 25 * kg,
      fibMax: 50 * kg,
    };
  }

  /**
   * Adrenaline interval state during cardiac arrest (every 3–5 min).
   * @param {number} ms Time since the last dose, in ms.
   * @returns {'wait'|'due'|'late'}
   */
  function adrenalineState(ms) {
    if (ms < 3 * 60000) return 'wait';
    if (ms < 5 * 60000) return 'due';
    return 'late';
  }

  /**
   * Next amiodarone dose in cardiac arrest: 300 then 150 mg (adult), 5 mg/kg up to 3× (child).
   * @param {number} given Doses already given.
   * @param {number} [kg] Panel weight (pediatric below 40 kg).
   * @returns {string}
   */
  function nextAmiodarone(given, kg) {
    if (given >= maxAmiodarone(kg)) return 'dose máxima atingida';
    if (isPeds(kg)) {
      const p = D.amio.doses.peds.arrest;
      return `${fmtN(Math.min(p.perKg * kg, p.max))} mg`;
    }
    const a = D.amio.doses.crisis.arrest;
    return given === 0 ? `${a.first} mg` : `${a.second} mg`;
  }

  /**
   * How many amiodarone boluses in cardiac arrest: 2 (adult) or 3 (child, PALS).
   * @param {number} kg Panel weight.
   * @returns {number}
   */
  function maxAmiodarone(kg) { return isPeds(kg) ? D.amio.doses.peds.arrest.maxDoses : 2; }

  /**
   * Clock text.
   * @param {number} ms Milliseconds.
   * @returns {string} "mm:ss" (or "h:mm:ss" past one hour).
   */
  function clock(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const p = (n) => String(n).padStart(2, '0');
    return h ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
  }

  root.CrisesCalc = { PEDS_KG, isPeds, adrenalineArrest, dantrolene, anaphylaxis, hemorrhage, adrenalineState, nextAmiodarone, maxAmiodarone, clock };

  if (typeof document === 'undefined') return; // Node (tests): calculation layer only

  /* ════════════════════════════════════════
     UI layer
  ════════════════════════════════════════ */

  const fmt = (n, d = 1) => (+n.toFixed(d)).toString().replace('.', ',');
  const $ = (id) => document.getElementById(id);
  const panelKg = () => {
    const el = $('weight');
    const n = el ? parseFloat(String(el.value).replace(',', '.')) : NaN;
    return n > 0 ? n : 0;
  };

  /* ── audio (created on first tap; iOS needs a user gesture) ── */
  let ctx = null;
  function audio() {
    if (!ctx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(at, freq, dur, vol) {
    const a = audio();
    if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(a.destination);
    o.start(at);
    o.stop(at + dur + 0.02);
  }
  /** Alert beeps: `n` short beeps. */
  function beep(n, freq) {
    const a = audio();
    if (!a) return;
    for (let i = 0; i < n; i++) tone(a.currentTime + i * 0.28, freq || 880, 0.18, 0.4);
    if (navigator.vibrate) navigator.vibrate(Array(n).fill([180, 100]).flat());
  }

  /* ── metronome (look-ahead scheduler on the audio clock, no drift) ── */
  const metro = { on: false, bpm: 110, next: 0, id: 0 };
  function metroTick() {
    const a = audio();
    while (metro.next < a.currentTime + 0.12) {
      tone(metro.next, 1200, 0.04, 0.5);
      metro.next += 60 / metro.bpm;
    }
  }
  function metroToggle() {
    const a = audio();
    if (!a) { alert('Áudio indisponível neste navegador.'); return; }
    metro.on = !metro.on;
    clearInterval(metro.id);
    if (metro.on) { metro.next = a.currentTime + 0.05; metroTick(); metro.id = setInterval(metroTick, 25); }
    renderPcrState();
  }

  /* ── keep the screen on while an arrest is running ── */
  let wakeLock = null;
  async function keepAwake(on) {
    try {
      if (on && !wakeLock && navigator.wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (e) { /* not supported or denied: ignore */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && pcr.start && !pcr.stop) keepAwake(true);
  });

  /* ── cardiac arrest state ── */
  const CYCLE_MS = 2 * 60000;
  const pcr = { start: 0, stop: 0, cycleStart: 0, cycleAlerted: false, lastAdre: 0, adreAlert: '', adre: 0, shocks: 0, amio: 0, log: [] };

  function pcrElapsed(now) { return pcr.start ? (pcr.stop || now) - pcr.start : 0; }
  function logEvent(text) {
    pcr.log.unshift({ t: pcrElapsed(Date.now()), wall: new Date(), text });
  }

  const actions = {
    start() {
      audio();
      const now = Date.now();
      Object.assign(pcr, { start: now, stop: 0, cycleStart: now, cycleAlerted: false, lastAdre: 0, adreAlert: '', adre: 0, shocks: 0, amio: 0, log: [] });
      logEvent('Início da PCR / RCP');
      keepAwake(true);
    },
    rhythm() {
      if (!pcr.start || pcr.stop) return;
      pcr.cycleStart = Date.now();
      pcr.cycleAlerted = false;
      logEvent('Ritmo checado — novo ciclo de 2 min');
    },
    adre() {
      if (!pcr.start || pcr.stop) return;
      pcr.lastAdre = Date.now();
      pcr.adreAlert = '';
      pcr.adre++;
      logEvent(`Adrenalina ${fmtN(adrenalineArrest(panelKg()).mg)} mg (${pcr.adre}ª)`);
    },
    shock() {
      if (!pcr.start || pcr.stop) return;
      pcr.shocks++;
      logEvent(`Choque ${pcr.shocks}`);
    },
    amio() {
      if (!pcr.start || pcr.stop || pcr.amio >= maxAmiodarone(panelKg())) return;
      logEvent(`Amiodarona ${nextAmiodarone(pcr.amio, panelKg())}`);
      pcr.amio++;
    },
    rosc() {
      if (!pcr.start || pcr.stop) return;
      logEvent('RCE / fim da RCP');
      pcr.stop = Date.now();
      keepAwake(false);
      if (metro.on) metroToggle();
    },
    reset() {
      if (pcr.start && !confirm('Zerar timers e registro da PCR?')) return;
      Object.assign(pcr, { start: 0, stop: 0, cycleStart: 0, lastAdre: 0, adre: 0, shocks: 0, amio: 0, log: [] });
      keepAwake(false);
      if (metro.on) metroToggle();
    },
    metro: metroToggle,
  };

  /* ── generic stopwatch for the other crises ── */
  const watches = {}; // id -> start ms
  const dant = { given: 0, doses: 0, last: 0 };
  const anaph = { last: 0, doses: 0 };

  function ensureTicker() {
    if (ensureTicker.id) return;
    ensureTicker.id = setInterval(tick, 250);
  }

  function tick() {
    const now = Date.now();
    if (pcr.start && !pcr.stop) {
      const left = CYCLE_MS - (now - pcr.cycleStart);
      if (left <= 0 && !pcr.cycleAlerted) { pcr.cycleAlerted = true; beep(3, 660); }
      if (pcr.lastAdre) {
        const st = CrisesCalc.adrenalineState(now - pcr.lastAdre);
        if (st !== 'wait' && pcr.adreAlert !== st) { pcr.adreAlert = st; beep(st === 'due' ? 1 : 2, 990); }
      }
    }
    renderPcrState();
    for (const id in watches) {
      const el = $(`cr-w-${id}`);
      if (el) el.textContent = watches[id] ? CrisesCalc.clock(now - watches[id]) : '00:00';
    }
    const da = $('cr-dant-last');
    if (da) da.textContent = dant.last ? `última dose há ${CrisesCalc.clock(now - dant.last)}` : '';
    const an = $('cr-anaph-last');
    if (an) {
      const ms = anaph.last ? now - anaph.last : 0;
      an.textContent = anaph.last ? `${anaph.doses} dose(s) · última há ${CrisesCalc.clock(ms)}${ms >= 5 * 60000 ? ' — pode repetir' : ''}` : '';
      an.style.color = ms >= 5 * 60000 ? 'var(--orange)' : '';
    }
  }

  function renderPcrState() {
    const box = $('cr-pcr-state');
    if (!box) return;
    const now = Date.now();
    const running = pcr.start && !pcr.stop;
    $('cr-pcr-total').textContent = CrisesCalc.clock(pcrElapsed(now));

    const cyc = $('cr-pcr-cycle');
    if (running) {
      const left = CYCLE_MS - (now - pcr.cycleStart);
      cyc.textContent = left > 0 ? CrisesCalc.clock(left) : 'CHECAR RITMO';
      cyc.className = 'cr-big' + (left <= 0 ? ' cr-alarm' : left <= 15000 ? ' cr-warn' : '');
    } else { cyc.textContent = '02:00'; cyc.className = 'cr-big cr-dim'; }

    const ad = $('cr-pcr-adre');
    if (running && pcr.lastAdre) {
      const ms = now - pcr.lastAdre, st = CrisesCalc.adrenalineState(ms);
      ad.textContent = CrisesCalc.clock(ms);
      ad.className = 'cr-big' + (st === 'late' ? ' cr-alarm' : st === 'due' ? ' cr-warn' : '');
    } else { ad.textContent = '—'; ad.className = 'cr-big cr-dim'; }
    $('cr-pcr-adre-sub').textContent = running && pcr.lastAdre
      ? ({ wait: 'aguardar (3–5 min)', due: 'pode repetir', late: 'atrasada (> 5 min)' })[CrisesCalc.adrenalineState(now - pcr.lastAdre)]
      : 'desde a última dose';

    $('cr-n-adre').textContent = pcr.adre;
    $('cr-n-shock').textContent = pcr.shocks;
    const kgNow = panelKg(), am = maxAmiodarone(kgNow);
    $('cr-n-amio').textContent = pcr.amio < am ? nextAmiodarone(pcr.amio, kgNow) : 'máx';
    $('cr-adre-dose').textContent = `${fmtN(adrenalineArrest(kgNow).mg)} mg`;
    $('cr-btn-start').textContent = pcr.start ? (pcr.stop ? 'Nova PCR' : 'PCR em curso') : '▶ Iniciar PCR';
    $('cr-btn-start').disabled = !!running;
    ['rhythm', 'adre', 'shock', 'amio', 'rosc'].forEach((k) => { $(`cr-btn-${k}`).disabled = !running || (k === 'amio' && pcr.amio >= am); });
    $('cr-btn-metro').textContent = metro.on ? `■ Metrônomo ${metro.bpm}/min` : `♪ Metrônomo ${metro.bpm}/min`;
    $('cr-btn-metro').classList.toggle('cr-on', metro.on);

    const sig = pcr.log.length + ':' + (pcr.stop ? 1 : 0);
    if (box.dataset.sig !== sig) {
      box.dataset.sig = sig;
      $('cr-pcr-log').innerHTML = pcr.log.length
        ? pcr.log.map((e) => `<div class="dose-row"><span class="dose-label">${e.text}</span><span class="dose-val cr-mono">${CrisesCalc.clock(e.t)} <span class="dose-unit">(${e.wall.toTimeString().slice(0, 5)})</span></span></div>`).join('')
        : '<div class="dilution-note">O registro aparece aqui (tempo de PCR e hora). Não é salvo.</div>';
    }
  }

  /* ── static markup ── */
  const btn = (id, label, cls) => `<button type="button" class="cr-btn ${cls || ''}" id="cr-btn-${id}" data-act="${id}">${label}</button>`;
  const watch = (id, label) => `<div class="cr-watch"><span class="dose-label">${label}</span>
      <span class="cr-big cr-mono" id="cr-w-${id}">00:00</span>
      <button type="button" class="cr-btn cr-sm" data-watch="${id}">▶ Iniciar</button></div>`;
  const card = (title, color, sub, body, note, id) => `<div class="drug-card"${id ? ` id="${id}"` : ''}>
      <div class="drug-header"><div><div class="drug-name" style="color:${color}">${title}</div>${sub ? `<div class="drug-subtitle">${sub}</div>` : ''}</div></div>
      ${body}${note ? `<div class="dilution-note">${note}</div>` : ''}</div>`;
  const kv = (l, v) => `<div class="dose-row"><span class="dose-label">${l}</span><span class="dose-val" style="text-align:right">${v}</span></div>`;
  const list = (items) => `<ol class="cr-list">${items.map((i) => `<li>${i}</li>`).join('')}</ol>`;

  const CRISES = [
    { id: 'pcr', label: 'PCR' },
    { id: 'hm', label: 'Hipertermia maligna' },
    { id: 'ana', label: 'Anafilaxia' },
    { id: 'k', label: 'Hipercalemia' },
    { id: 'hem', label: 'Hemorragia maciça' },
  ];

  function pcrMarkup() {
    return `
      <div class="drug-card" id="cr-pcr-state">
        <div class="cr-grid">
          <div class="cr-cell"><div class="dose-label">Tempo de PCR</div><div class="cr-big cr-mono" id="cr-pcr-total">00:00</div></div>
          <div class="cr-cell"><div class="dose-label">Ciclo de 2 min</div><div class="cr-big cr-mono" id="cr-pcr-cycle">02:00</div></div>
          <div class="cr-cell"><div class="dose-label">Adrenalina</div><div class="cr-big cr-mono" id="cr-pcr-adre">—</div><div class="dose-unit" id="cr-pcr-adre-sub"></div></div>
        </div>
        <div class="cr-btns">
          ${btn('start', '▶ Iniciar PCR', 'cr-primary')}
          ${btn('rhythm', 'Ritmo checado')}
          ${btn('adre', 'Adrenalina <span id="cr-adre-dose"></span> <b id="cr-n-adre">0</b>', 'cr-red')}
          ${btn('shock', 'Choque <b id="cr-n-shock">0</b>', 'cr-orange')}
          ${btn('amio', 'Amiodarona <b id="cr-n-amio"></b>')}
          ${btn('rosc', 'RCE / parar', 'cr-green')}
        </div>
        <div class="cr-btns">
          ${btn('metro', '♪ Metrônomo 110/min')}
          <select id="cr-bpm" class="hid-input" style="width:auto" aria-label="Frequência do metrônomo"><option>100</option><option selected>110</option><option>120</option></select>
          ${btn('reset', 'Zerar', 'cr-ghost')}
        </div>
        <div class="dose-table" id="cr-pcr-doses"></div>
        <div class="dilution-note">Bipes: 3 no fim do ciclo, 1 quando a adrenalina pode ser repetida (3 min), 2 se passar de 5 min. A tela fica acesa enquanto a PCR estiver em curso, se o aparelho permitir.</div>
      </div>
      <div class="sec-hdr">Registro</div>
      <div class="drug-card"><div class="dose-table" id="cr-pcr-log"></div></div>
      ${card('Causas reversíveis (5H e 5T)', 'var(--yellow)', '',
        `<div class="dose-table">${kv('Hipovolemia · Hipóxia · H⁺ (acidose)', '')}${kv('Hipo/hipercalemia · Hipotermia', '')}${kv('Tensão (pneumotórax) · Tamponamento', '')}${kv('Toxinas (incl. anestésico local → aba An.Local) · Trombose coronária/pulmonar', '')}</div>`,
        'FV/TV sem pulso: choque → 2 min RCP; adrenalina após o 2º choque; amiodarona após o 3º e o 5º choque (doses no quadro da PCR, pelo peso do painel). AESP/assistolia: adrenalina assim que possível (AHA 2020 / PALS).')}`;
  }

  function hmMarkup() {
    return `
      <div class="drug-card">${watch('hm', 'Tempo desde o diagnóstico')}</div>
      <div class="cr-doses" data-crisis="hm"></div>
      ${card('Condutas', 'var(--red)', 'MHAUS', list([
        'Pedir ajuda e o <b>kit de HM</b>; avisar o cirurgião (encerrar ou abreviar a cirurgia).',
        '<b>Desligar os voláteis</b> e suspender a succinilcolina. Não precisa trocar o aparelho: filtros de carvão ativado ou O₂ a 10 L/min.',
        'Hiperventilar com O₂ 100% a ≥ 10 L/min; manter anestesia com propofol EV.',
        `<b>Dantroleno</b> ${nf(DANT_MH.perKg)} mg/kg EV rápido; repetir até controlar a hipercapnia, a taquicardia e a rigidez.`,
        'Resfriar se T &gt; 39 °C: soro gelado EV, gelo em axilas e virilhas; parar em 38 °C.',
        'Hipercalemia: tratar (card Hipercalemia). Arritmias: amiodarona ou β-bloqueador. <b>Evitar bloqueador de canal de cálcio</b> com dantroleno.',
        'Gasometria, K⁺, CK, mioglobina urinária, coagulação. Diurese &gt; 1 mL/kg/h.',
        `UTI por ≥ 24 h (recrudescência). Manutenção: dantroleno 1 mg/kg a cada 4–6 h ou ${nf(DANT.doses.crisis.mhMaintenance.rate)} ${DANT.doses.crisis.mhMaintenance.rateUnit}.`,
      ]))}`;
  }

  function anaMarkup() {
    return `
      <div class="drug-card">${watch('ana', 'Tempo desde o início')}
        <div class="cr-btns">${btn('anadose', 'Adrenalina dada', 'cr-red')}</div>
        <div class="dilution-note" id="cr-anaph-last"></div></div>
      <div class="cr-doses" data-crisis="ana"></div>
      ${card('Condutas', 'var(--red)', 'RCUK 2021 · NAP6', list([
        'Suspender o agente suspeito (bloqueador neuromuscular, antibiótico, clorexidina, látex, contraste). Pedir ajuda.',
        'Via aérea: O₂ 100%; aprofundar a anestesia só se não houver hipotensão.',
        'Elevar os membros inferiores; acesso calibroso.',
        '<b>Adrenalina</b> é a droga principal; repetir a cada 5 min ou iniciar infusão (aba Vasoat.) se forem necessárias ≥ 2 doses.',
        'Sem pulso: protocolo de PCR (botão PCR acima).',
        'Refratária: vasopressina, noradrenalina; <b>glucagon</b> se em uso de β-bloqueador (dose no quadro Doses).',
        'Após estabilizar: hidrocortisona e anti-H1 (não substituem a adrenalina).',
        'Colher <b>triptase</b> logo após a ressuscitação, em 1–2 h e após 24 h. Encaminhar para investigação alérgica.',
      ]))}`;
  }

  function kMarkup() {
    return `<div class="cr-doses" data-crisis="k"></div>`;
  }

  function hemMarkup() {
    return `
      <div class="drug-card">${watch('hem', 'Tempo desde a ativação do protocolo')}</div>
      <div class="cr-doses" data-crisis="hem"></div>
      ${card('Condutas', 'var(--red)', 'Diretriz europeia de trauma 2023 · ESAIC 2022', list([
        'Ativar o <b>protocolo de transfusão maciça</b>; controle cirúrgico/endovascular do sangramento.',
        '<b>Ácido tranexâmico</b> o mais cedo possível (até 3 h do início).',
        'Hemácias : plasma : plaquetas ≈ <b>1 : 1 : 1</b> até ter exames viscoelásticos/laboratoriais.',
        'Hipotensão permissiva (PAS 80–90 mmHg) sem TCE; PAM ≥ 80 mmHg com TCE grave.',
        'Prevenir a tríade letal: T &gt; 36 °C (aquecer fluidos), pH &gt; 7,2, Ca²⁺ iônico &gt; 1,1 mmol/L.',
        'Metas: Hb 7–9 g/dL, fibrinogênio &gt; 1,5–2 g/L, plaquetas &gt; 50 mil (&gt; 100 mil com TCE), RNI &lt; 1,5.',
        'Cristaloide no mínimo necessário.',
      ]))}`;
  }

  /* ── weight-dependent blocks ── */
  function doses(crisis, kg) {
    const noKg = '<div class="dilution-note">Informe o peso no painel para as doses por kg.</div>';
    if (crisis === 'hm') {
      const d = CrisesCalc.dantrolene(kg, dant.given);
      if (!d) return card('Dantroleno', 'var(--red)', '', noKg);
      return card(DANT.name, 'var(--red)', `Frasco ${DANT.vialMg} mg + ${DANT.vialWaterMl} mL de água estéril (sem SF/SG)`,
        `<div class="dose-table">
          ${kv(`Dose ${nf(DANT_MH.perKg)} mg/kg`, `<b>${fmt(d.dose, 0)} mg</b> = ${d.vials} frascos<br><span class="dose-unit">${d.water} mL de água estéril</span>`)}
          ${kv(`Teto usual ${DANT_MH.maxPerKg} mg/kg`, `${fmt(d.max, 0)} mg`)}
          ${kv('Já administrado', `<b>${fmt(dant.given, 0)} mg</b> (${dant.doses} dose${dant.doses === 1 ? '' : 's'})<br><span class="dose-unit">restam ${fmt(d.remaining, 0)} mg até ${DANT_MH.maxPerKg} mg/kg</span>`)}
        </div>
        <div class="cr-btns">${btn('dantdose', `+ Dose de ${fmt(d.dose, 0)} mg dada`, 'cr-red')}${btn('dantreset', 'Zerar', 'cr-ghost')}</div>
        <div class="dilution-note" id="cr-dant-last"></div>`,
        `Pode ultrapassar ${DANT_MH.maxPerKg} mg/kg com orientação especializada. Diluição demorada: separar uma pessoa só para preparar.`);
    }
    if (crisis === 'ana') {
      const a = CrisesCalc.anaphylaxis(kg);
      return card('Doses', 'var(--red)', kg ? `Peso ${fmt(kg)} kg${isPeds(kg) ? ' · criança' : ''}` : 'Doses de adulto (sem peso)',
        `<div class="dose-table">
          ${kv('Adrenalina IM (sem acesso)', `<b>${fmt(a.imMg, 2)} mg</b> = ${fmt(a.imMg, 2)} mL de 1 mg/mL<br><span class="dose-unit">0,01 mg/kg, máx 0,5 mg; repetir em 5 min</span>`)}
          ${(() => { const iv = D.adre.doses.crisis.anaphylaxisIV;
            if (isPeds(kg)) { const pv = D.adre.doses.peds.anaphylaxisIV, mcg = pv.mcgPerKg * kg; return kv('Adrenalina EV — hipotensão grave', `<b>${fmt(mcg, 0)} mcg</b> = ${fmt(mcg / iv.concMcg, 1)} mL de ${iv.concMcg} mcg/mL<br><span class="dose-unit">${pv.mcgPerKg} mcg/kg, titulado; só por quem tem experiência</span>`); }
            return kv('Adrenalina EV — hipotensão grave', `<b>${iv.mcg} mcg</b> = ${nf(iv.mcg / iv.concMcg)} mL de ${iv.concMcg} mcg/mL<br><span class="dose-unit">${iv.prep}; titular 50–100 mcg a cada 1–2 min</span>`); })()}
          ${(() => { const ar = adrenalineArrest(kg); return kv('Adrenalina EV — PCR', `${fmtN(ar.mg)} mg${isPeds(kg) ? ` = ${fmtN(ar.ml)} mL de ${ar.concText}` : ''} a cada 3–5 min`); })()}
          ${kv('Cristaloide em bolus', kg ? `<b>${fmt(a.fluidMin, 0)}–${fmt(a.fluidMax, 0)} mL</b><br><span class="dose-unit">${D.crystalloid.doses.crisis.bolus.perKg.join('–')} mL/kg, repetir conforme resposta</span>` : '500–1000 mL, repetir')}
          ${isPeds(kg) ? kv('Glucagon · hidrocortisona', 'dose pediátrica conforme protocolo do serviço') :
            kv('Glucagon (se β-bloqueador)', `${D.glucagon.doses.crisis.anaphylaxis.doseMin}–${D.glucagon.doses.crisis.anaphylaxis.doseMax} mg EV`) +
            kv('Hidrocortisona (após estabilizar)', `${D.hcort.doses.crisis.anaphylaxis.dose} mg EV`)}
        </div>`,
        (() => { const i = D.adre.doses.crisis.infusion; return `Infusão de adrenalina ${nf(i.rateMin)}–${nf(i.rateMax)} ${i.rateUnit} (${i.prep} = ${i.prepConc} mcg/mL): tabela na aba Vasoat.`; })());
    }
    if (crisis === 'k') {
      const noteK = 'No intraoperatório: hiperventilar, suspender succinilcolina e fontes de K⁺ (soluções com K⁺, hemácias antigas). PCR por hipercalemia: cálcio + bicarbonato + insulina/glicose durante a RCP.';
      const G = D.glucose, g50 = G.concs[0].conc, g10 = G.concs[1].conc;
      if (isPeds(kg)) {
        const c = D.calGluc.doses.peds.hyperK, ins = D.insulin.doses.peds.hyperK, gl = G.doses.peds.hyperK, b = D.bicarb.doses.peds.hyperK;
        const caMg = Math.min(c.perKg * kg, c.max), u = Math.min(ins.perKg * kg, ins.max), gg = Math.min(gl.perKg * kg, gl.max), mEq = Math.min(b.perKg * kg, b.max);
        return card('Hipercalemia — criança', 'var(--orange)', `Peso ${fmt(kg)} kg · PALS`, `<div class="dose-table">
          ${kv(`1. Gluconato de cálcio 10% ${nf(c.perKg / D.calGluc.conc)} mL/kg`, `<b>${fmt(caMg / D.calGluc.conc, 1)} mL</b> = ${fmt(caMg, 0)} mg em 5–10 min`)}
          ${kv(`2. Insulina ${nf(ins.perKg)} U/kg + glicose ${nf(gl.perKg)} g/kg`, `<b>${fmt(u, 1)} U</b> + ${fmt(gg, 1)} g<br><span class="dose-unit">= glicose 10% ${fmt(gg / g10, 0)} mL. Glicemia a cada hora.</span>`)}
          ${kv(`3. Bicarbonato 8,4% ${nf(b.perKg)} mEq/kg (se acidose)`, `<b>${fmt(mEq / D.bicarb.conc, 0)} mL</b> = ${fmt(mEq, 0)} mEq<br><span class="dose-unit">lactente: diluir 1:1 (4,2%)</span>`)}
          ${kv('4. β₂-agonista e remoção de K⁺', 'Salbutamol inalatório e diálise conforme protocolo pediátrico')}
        </div>`, noteK);
      }
      const ca = D.calGluc.doses.crisis.hyperK.dose, cl = D.caCl.doses.crisis.hyperK.dose, ins = D.insulin.doses.crisis.hyperK.dose,
        gl = G.doses.crisis.hyperK.dose, sb = D.salbutamol.doses.crisis.hyperK, bc = D.bicarb.doses.crisis.hyperK.dose;
      return card('Hipercalemia', 'var(--orange)', 'Adulto · UK Kidney Association 2023', `<div class="dose-table">
        ${kv('1. Estabilizar a membrana', `<b>Gluconato de cálcio 10% ${ca / D.calGluc.conc} mL</b> EV em 5–10 min<br><span class="dose-unit">ou cloreto de cálcio 10% ${cl / D.caCl.conc} mL (acesso central). Repetir se ECG não melhorar.</span>`)}
        ${kv('2. Insulina + glicose', `<b>Insulina regular ${ins} U</b> + ${gl} g de glicose<br><span class="dose-unit">= glicose 50% ${gl / g50} mL ou glicose 10% ${gl / g10} mL em 15–30 min. Glicemia a cada hora por 6 h.</span>`)}
        ${kv('3. β₂-agonista', `Salbutamol ${sb.doseMin}–${sb.doseMax} mg inalatório<br><span class="dose-unit">(adjuvante; não usar isolado)</span>`)}
        ${kv('4. Acidose metabólica', `Bicarbonato de sódio 8,4% ${bc / D.bicarb.conc} mL<br><span class="dose-unit">só com acidose; não misturar com cálcio na mesma via</span>`)}
        ${kv('5. Remover K⁺', 'Diurético de alça, resina; <b>diálise</b> se refratária ou insuficiência renal')}
      </div>`, noteK);
    }
    if (crisis === 'hem') {
      const h = CrisesCalc.hemorrhage(kg);
      return card('Doses', 'var(--red)', h ? `Peso ${fmt(kg)} kg${isPeds(kg) ? ' · criança' : ''}` : 'Adulto (sem peso)',
        `<div class="dose-table">
          ${(() => {
            const T = D.txa.doses;
            if (isPeds(kg)) {
              const l = T.peds.loading, mg = Math.min(l.perKg * kg, l.max), c = D.calGluc.doses.peds.hemorrhage, ca = Math.min(c.perKg * kg, c.max);
              return kv(`Ácido tranexâmico ${l.perKg} mg/kg`, `<b>${fmt(mg, 0)} mg</b> EV em 10 min (máx ${l.max / 1000} g)<br><span class="dose-unit">+ ${T.peds.infusion.rate} ${T.peds.infusion.rateUnit} = ${fmt(T.peds.infusion.rate * kg, 0)} mg/h</span>`) +
                kv(`Gluconato de cálcio 10% ${nf(c.perKg / D.calGluc.conc)} mL/kg`, `<b>${fmt(ca / D.calGluc.conc, 1)} mL</b><br><span class="dose-unit">se Ca²⁺i &lt; 1,1 ou a cada ~40 mL/kg de hemoderivado</span>`);
            }
            const g = n => nf(n / 1000);
            return kv('Ácido tranexâmico', `<b>${g(T.crisis.loading.dose)} g</b> EV em 10 min + ${g(T.crisis.infusion.rate)} g em 8 h<br><span class="dose-unit">(ou 2º bolus de ${g(T.crisis.infusion.rate)} g)</span>`) +
              kv('Cálcio', `Gluconato 10% ${D.calGluc.doses.crisis.hemorrhage.dose / D.calGluc.conc} mL ou cloreto 10% ${D.caCl.doses.crisis.hemorrhage.dose / D.caCl.conc} mL<br><span class="dose-unit">a cada ~4 unidades de hemoderivado ou se Ca²⁺i &lt; 1,1</span>`);
          })()}
          ${h ? kv('Crioprecipitado 1 U/10 kg', `<b>${h.cryoUnits} unidades</b>`) : ''}
          ${h ? kv('Concentrado de fibrinogênio 25–50 mg/kg', `<b>${fmt(h.fibMin / 1000, 1)}–${fmt(h.fibMax / 1000, 1)} g</b>`) : ''}
          ${h ? kv(`Volemia estimada (${isPeds(kg) ? 80 : 70} mL/kg)`, `${fmt(h.bloodVolume, 0)} mL<br><span class="dose-unit">maciça: perder 1 volemia em 24 h ou 50% em 3 h</span>`) : ''}
        </div>`, h ? '' : 'Informe o peso no painel para fibrinogênio e volemia.');
    }
    return '';
  }

  function pcrDoses(kg) {
    const ar = adrenalineArrest(kg), am = maxAmiodarone(kg);
    if (isPeds(kg)) {
      const p = D.amio.doses.peds.arrest;
      return kv(`Adrenalina ${nf(D.adre.doses.peds.arrest.perKg)} mg/kg`, `<b>${fmtN(ar.mg)} mg</b> = ${fmtN(ar.ml)} mL de ${ar.concText}`) +
        kv(`Amiodarona ${p.perKg} mg/kg (até ${am}×)`, `<b>${nextAmiodarone(0, kg)}</b>`) +
        kv('Desfibrilação', `${fmt(2 * kg, 0)} J → ${fmt(4 * kg, 0)} J (máx 10 J/kg)`);
    }
    const a = D.amio.doses.crisis;
    return kv('Adrenalina', `<b>${fmtN(ar.mg)} mg</b> EV/IO a cada 3–5 min`) +
      kv('Amiodarona', `${a.arrest.first} mg → ${a.arrest.second} mg<br><span class="dose-unit">pós-RCE: ${a.postRosc.steps.map((x) => `${nf(x.rate)} ${a.postRosc.rateUnit} por ${x.duration}`).join(' → ')}</span>`) +
      kv('Desfibrilação', 'bifásico 120–200 J');
  }

  function refresh() {
    const kg = panelKg();
    document.querySelectorAll('#crises-root .cr-doses').forEach((el) => { el.innerHTML = doses(el.dataset.crisis, kg); });
    const pd = $('cr-pcr-doses');
    if (pd) pd.innerHTML = pcrDoses(kg);
    const ban = $('cr-peds-banner');
    if (ban) { ban.hidden = !isPeds(kg); ban.innerHTML = `👶 <b>Peso ${fmt(kg)} kg (&lt; ${PEDS_KG} kg): doses pediátricas.</b> Confira também a aba Ped.`; }
    tick();
  }

  function show(id) {
    document.querySelectorAll('#crises-root .cr-sec').forEach((s) => { s.hidden = s.dataset.sec !== id; });
    document.querySelectorAll('#crises-root .cr-chip').forEach((c) => c.classList.toggle('active', c.dataset.show === id));
    const drugs = $('pcr-drugs');
    if (drugs) drugs.hidden = id !== 'pcr';
  }

  function build() {
    const rootEl = $('crises-root');
    if (!rootEl || rootEl.firstChild) return;
    rootEl.innerHTML = `
      <div class="disclaimer">⚠️ Guia de apoio em crise. Não substitui o protocolo do serviço nem o líder da equipe.</div>
      <div class="disclaimer" id="cr-peds-banner" hidden></div>
      <div class="cr-chips">${CRISES.map((c) => `<button type="button" class="cr-chip" data-show="${c.id}">${c.label}</button>`).join('')}</div>
      <div class="cr-sec" data-sec="pcr">${pcrMarkup()}</div>
      <div class="cr-sec" data-sec="hm">${hmMarkup()}</div>
      <div class="cr-sec" data-sec="ana">${anaMarkup()}</div>
      <div class="cr-sec" data-sec="k">${kMarkup()}</div>
      <div class="cr-sec" data-sec="hem">${hemMarkup()}</div>
      <div class="sc-foot">AHA 2020, MHAUS, RCUK 2021/NAP6, UK Kidney Association 2023, diretriz europeia de trauma 2023. Nada é salvo.</div>`;

    rootEl.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      audio(); // unlock audio on any tap
      if (b.dataset.show) { show(b.dataset.show); return; }
      if (b.dataset.watch) {
        const id = b.dataset.watch;
        if (watches[id] && !confirm('Reiniciar o cronômetro?')) return;
        watches[id] = Date.now();
        b.textContent = '↺ Reiniciar';
        tick();
        return;
      }
      const act = b.dataset.act;
      if (actions[act]) { actions[act](); renderPcrState(); return; }
      if (act === 'dantdose') {
        const d = CrisesCalc.dantrolene(panelKg());
        if (d) { dant.given += d.dose; dant.doses++; dant.last = Date.now(); refresh(); }
      } else if (act === 'dantreset') {
        if (dant.given && !confirm('Zerar o total de dantroleno?')) return;
        Object.assign(dant, { given: 0, doses: 0, last: 0 });
        refresh();
      } else if (act === 'anadose') {
        anaph.last = Date.now(); anaph.doses++; tick();
      }
    });
    $('cr-bpm').addEventListener('change', (e) => { metro.bpm = +e.target.value; renderPcrState(); });

    show('pcr');
    refresh();
    ensureTicker();
  }

  root.CrisesUI = { refresh, show };
  build();
})(typeof window !== 'undefined' ? window : globalThis);
