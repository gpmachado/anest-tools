# DrugCalc — Anestesia & UTI

Clinical drug dose calculator for anaesthesia, critical care, and emergency medicine — offline PWA installable on iPhone, iPad, and Android.

**Live:** https://gpmachado.github.io/anest-tools/

---

## Features

### Patient Panel
- Weight (kg), height (cm), sex, age
- Automatic BMI calculation with classification
- Four weight types used per drug:
  - **TBW** — Total Body Weight (actual)
  - **IBW** — Ideal Body Weight (Devine formula)
  - **ABW** — Adjusted Body Weight (Bauer: IBW + 0.4 × (TBW − IBW))
  - **LBW** — Lean Body Weight (James formula)

### Tabs

| Tab | Content |
|-----|---------|
| **IOT** | Induction drugs: Fentanil, Etomidato, Cetamina, Midazolam, Propofol, Rocurônio, Succinilcolina |
| **Sedação** | Continuous sedation/analgesia: Dexmedetomidina, Propofol, Midazolam, Fentanil, Cetamina |
| **Adjuv.** | Reversal agents, opioids, non-opioids, antiemetics, corticosteroids |
| **An. Local** | Local anaesthetics (Lidocaína, Bupivacaína, Levobupivacaína, Ropivacaína) with max dose and volume per concentration; LAST / Intralipid protocol |
| **Vasoat.** | Vasoactives: Noradrenalina, Dopamina, Dobutamina, Adrenalina, Tridil, Nipride — infusion tables (ml/h) |
| **Hidrat.** | Perioperative hydration: Holliday-Segar 4-2-1 maintenance, fasting deficit replacement (50/25/25), intraoperative losses |
| **PCR** | Cardiac arrest drugs: Adrenalina, Amiodarona, Atropina, Bicarbonato, MgSO₄, Desfibrilação |
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
| Midazolam, Rocurônio, Dexmedetomidina, Neostigmina, Sugamadex | IBW |
| Etomidato, Cetamina, Succinilcolina, Tramadol, Atropina, MgSO₄ | TBW |

---

## Files

```
index.html   — single-file app (all CSS and JS inline)
sw.js        — service worker (offline cache)
manifest.json — PWA manifest
icon-192.png  — PWA icon
icon-512.png  — PWA icon
```

---

## Disclaimer

For use by licensed medical professionals only. All doses are reference values and must be adapted to individual patient conditions and institutional protocols.
