# DrugCalc — Anestesia & UTI

Clinical drug dose calculator for anaesthesia, critical care, and emergency medicine — offline PWA installable on iPhone, iPad, and Android.

**Live:** https://gpmachado.github.io/anest-tools/

---

## Features

### Patient Panel
- Weight (kg), height (cm), sex, age
- Automatic BMI calculation with classification
- Four weight types used per drug (never above actual weight):
  - **TBW** — Total Body Weight (actual)
  - **IBW** — Ideal Body Weight (Devine formula)
  - **ABW** — Adjusted Body Weight (Bauer: IBW + 0.4 × (TBW − IBW))
  - **LBW** — Lean Body Weight (Janmahasatian formula)

### Tabs

| Tab | Content |
|-----|---------|
| **IOT** | Induction drugs: Fentanil, Etomidato, Cetamina, Midazolam, Propofol, Rocurônio, Succinilcolina |
| **Sedação** | Continuous sedation/analgesia: Dexmedetomidina, Propofol, Midazolam, Fentanil, Cetamina |
| **Adjuv.** | Reversal agents, opioids, non-opioids, antiemetics, corticosteroids |
| **An. Local** | Local anaesthetics (Lidocaína, Bupivacaína, Levobupivacaína, Ropivacaína) with max dose and volume per concentration; LAST / Intralipid protocol |
| **Vasoat.** | Vasoactives: Noradrenalina, Dopamina, Dobutamina, Adrenalina, Tridil, Nipride — infusion tables (ml/h) |
| **Hidrat.** | Perioperative hydration: Holliday-Segar 4-2-1 maintenance, fasting deficit replacement (50/25/25), intraoperative losses |
| **Crises** | Cardiac arrest with timers (total, 2-min cycle, adrenaline 3–5 min), metronome, shock/drug counters and event log; malignant hyperthermia (dantrolene), anaphylaxis, hyperkalemia, massive hemorrhage; cardiac arrest drugs (`js/crises.js`) |
| **Volátil** | Volatile anaesthetic consumption (biphasic): Sevorane, Isoflurano, Desflurano, Halotano — real gas-law formula, consumption chart |

### Volatile Calculator
- Two-phase model: **Saturação** (high FGF induction) + **Manutenção** (reduced FGF)
- Maintenance start time auto-syncs to saturation end
- Physics-based formula: `(d × 22400 × (273+T)) / (PM × 273)`
- Real-time consumption chart (Chart.js) with cumulative curve
- Warning for consumption > 50 mL

---

## PWA — Install on iPhone / iPad
1. Open https://gpmachado.github.io/anest-tools/ in Safari
2. Tap **Share → Add to Home Screen**
3. App works fully offline after first load

---

## Drug Weight Types

| Drug | Weight |
|------|--------|
| Fentanil, Propofol, Morfina | LBW |
| Midazolam, Rocurônio (IOT eletiva), Dexmedetomidina, Neostigmina | IBW |
| Rocurônio (RSI), Sugamadex (bula: peso real) | TBW |
| Etomidato, Cetamina, Succinilcolina, Tramadol, Atropina, MgSO₄ | TBW |

---

## Files

```
index.html   — app shell: CSS, panel, tab rendering and the ?teste self-test
sw.js        — service worker (offline cache)
manifest.json — PWA manifest
icon-192.png  — PWA icon
icon-512.png  — PWA icon
js/          — calculation modules (drugs, infusion, bolus, mix, scales, peds, crises)
               js/drugs.js = fonte única dos números das drogas (doses, apresentações,
               diluições, tabelas de infusão); textos de protocolo ficam em cada aba
test/        — automated tests (node --test)
```

---

## Como editar uma dose

1. Altere o número em `js/drugs.js` (nunca na aba) e atualize `source` e `reviewed` da droga. Os campos aceitos estão documentados no início do arquivo; o teste recusa campo desconhecido.
2. Rode `node --test` e abra `index.html?teste` (resultado no console).
3. Suba `CACHE` em `sw.js` para os aparelhos instalados baixarem a versão nova.

---

## Testes

As camadas de cálculo (`InfusionCalc`, `BolusCalc`, `MixCalc`, `ScalesCalc`, `PedsCalc`) têm testes automatizados em `test/*.test.js`, com o executor nativo do Node (`node:test`), sem dependências. Requer Node 20 ou mais recente:

```bash
node --test
```

O GitHub Actions (`.github/workflows/test.yml`) roda, a cada push e pull request, os testes do Node e o autoteste no navegador (`index.html?teste` no Chrome headless). O autoteste cobre o que depende da página: pesos, cards renderizados (nota de obeso do rocurônio, modo pediátrico da aba Crises, sugamadex em criança), tabelas de infusão e mistura de anestésicos locais.

---

## Disclaimer

For use by licensed medical professionals only. All doses are reference values and must be adapted to individual patient conditions and institutional protocols.
