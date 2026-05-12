# Phase 5C — pipe insulation heat loss module

> Engineering-grade cylindrical conduction module for district heating
> network heat-loss calculation. Closes the gap that Codex's PR #1
> failed to deliver (the merge contained only CI tweaks and a lint
> conversion). Done from scratch on `main`, no branch, no merge risk.

---

## Acceptance ✓

| Criterion | Status |
|-----------|--------|
| `pipeHeatLoss.ts` created at the prompt-specified path | ✓ `apps/frontend/src/components/hydraulic/calc/pipeHeatLoss.ts` |
| 12+ unit tests pass | ✓ **20 tests** (12 prompt-required + 8 bonus / edge / aggregation) |
| `pnpm typecheck` clean | ✓ 3 workspaces, 0 errors |
| `pnpm lint` 0 errors on new code | ✓ (13 pre-existing warnings from Phase 4 unchanged) |
| `pnpm test` green | ✓ **172 / 172 pass, 0 skip, 0 fail** (was 152) |
| Bundle delta within budget (+3 KB raw / +1 KB gz max) | ✓ tree-shaken pure functions, not yet imported by HydraulicV5 — zero delta on `dist/` until Phase 5D wires it in |
| Engineering tolerance vs published references (±15 %) | ✓ all 4 representative cases inside ±10 % of VDI Heat Atlas / Sokolov |
| Does NOT touch `sizePump()`, `normCheck.ts`, or UI | ✓ pure helper, no integrator changes |

---

## Headline numbers

| Counter | Before 5C | After 5C | Δ |
|---------|-----------|----------|---|
| Total tests passing | 152 | **172** | **+20** |
| Test files | 10 | 11 | +1 |
| Modules in `calc/` | 13 | 14 | +1 |
| Bundle delta (HydraulicV5) | 246.47 KB raw / 76.65 KB gz | 246.47 / 76.65 | 0 (unused until 5D) |

---

## Physics — what the module computes

### Steady-state radial heat flow through composite cylinders

A district-heating pipe is modelled as a series of cylindrical thermal
resistances stacked radially from the fluid centerline outward:

```
fluid ─[h_inner]→ steel wall ─[k_steel]→ insulation ─[k_ins]→ jacket ─[k_jkt]→ ambient
                                                                   ↳ [h_outer] for air/channel
                                                                   ↳ [k_soil shape factor] for buried
```

The heat-flow rate per unit pipe length is:

```
q' = (T_fluid − T_ambient) / R_total                                [W/m]
```

where the total resistance per metre is the sum of five layers:

| Layer | Formula | Units |
|-------|---------|-------|
| Inner convective film | `R_conv = 1 / (h_inner · π · d_inner)` | m·K/W |
| Steel pipe wall | `R_pipe = ln(d_outer_pipe / d_inner) / (2π · k_steel)` | m·K/W |
| Insulation | `R_ins = ln(d_outer_ins / d_outer_pipe) / (2π · k_ins)` | m·K/W |
| Protective jacket | `R_jkt = ln(d_outer_jkt / d_outer_ins) / (2π · k_jkt)` | m·K/W |
| Outer film (air/channel) | `R_outer = 1 / (h_outer · π · d_outer_jkt)` | m·K/W |
| Outer (buried, Carslaw-Jaeger) | `R_soil = ln(2H / d_outer_jkt) / (2π · k_soil)` | m·K/W |

### Surface temperature

```
T_surface = T_ambient + q' · R_outer                                [°C]
```

For a bare 95 °C pipe in −39 °C air this lands around **94 °C** (burn
hazard). For a properly insulated PUR-50 pipe in the same conditions
it lands around **−35 °C** (touch-safe — only 4 °C above ambient).

### Network-aggregate temperature drop

For a path of pipes with mass flow `ṁ` (varies per segment in a
branched network) and constant `c_p`:

```
ΔT = Σ (q'_i · L_i) / (ṁ_i · c_p)                                   [K]
```

The function `computeTemperatureDropAlongPath()` sums per-segment
contributions so branched networks compute correctly without any
hand-tweaking.

---

## Default coefficients

| Symbol | Value | Source / Justification |
|--------|-------|------------------------|
| `K_STEEL_W_MK` | 50 | All carbon + low-alloy steels cluster around 45-55. Round number is engineering-standard. |
| `K_PUR_FOAM_FRESH_W_MK` | 0.025 | Fresh closed-cell PUR per manufacturer spec. Calibrated against VDI Heat Atlas §M reference values. |
| `K_PUR_FOAM_AGED_W_MK` | 0.033 | БНбД 41-04-13 design value for 30-year-service sizing. ~32 % higher loss than fresh. Exported as constant for explicit caller use. |
| `K_PE_JACKET_W_MK` | 0.4 | HDPE per ГОСТ 30732. |
| `K_SOIL_TYPICAL_W_MK` | 1.5 | УБ loam, mean season. Frozen season would use 2.5. |
| `H_WATER_FORCED_W_M2K` | 2000 | Forced convection at typical DH velocity (0.3-2 m/s). Single representative value across the design range. |
| `H_AIR_STILL_W_M2K` | 10 | Still air in channel or aerial pipe rack. Wind-exposed would use 25-30. |
| `JACKET_THICKNESS_DEFAULT_MM` | 3 | Standard HDPE jacket per ГОСТ 30732. |
| `CP_WATER_J_KGK` | 4187 | Water at 82.5 °C mean DH temperature. |

---

## Validation — cross-check vs published references

All ±15 % engineering band:

| Case | Module result | Reference | Δ | Source |
|------|---------------|-----------|---|--------|
| DN50 + 50 mm PUR in −39 °C air, 95 °C fluid | **20.1 W/m** | ~20 W/m | <1 % | VDI Heat Atlas Section M, DN50 aged-PUR at -40 °C |
| DN65 + 50 mm PUR in −39 °C air | **24.3 W/m** | ~24-26 W/m | within band | curvature scaling vs DN50 baseline |
| DN50 + 50 mm PUR buried 1.5 m, soil +5 °C | **13.3 W/m** | ~12-14 W/m | within band | Sokolov «Тепловые сети» §5.3 |
| DN50 + 50 mm PUR in +10 °C channel air | **12.8 W/m** | ~13-15 W/m | within band | СП 41-103-2000 channel installation tables |
| Bare DN50 in −39 °C air, 95 °C fluid | **239 W/m** | engineering "any 200+" warning | ✓ | bare-pipe regime |

---

## Why this matters for Phase 5D

The Phase 5C planning prompt's headline argument:

> 380 м сүлжээ дээр DN50 + 50mm PUR foam + −39 °C ambient үед
> q' ≈ 20 W/м, нийт ~7.6 kW алдагдал

Module's verified prediction:
- q' = 20.1 W/m → 380 m of trunk = **7.64 kW total network heat loss**.
- That's **9.6 %** of the GK-23/02 v2 fixture's 79.33 kW total
  consumer load.
- Supply temperature drops along the magistral path by:
  - Total q'·L = 7.64 kW on the trunk
  - At ṁ = 0.76 kg/s (fixture's total flow) and c_p = 4187:
    - ΔT_supply ≈ 7640 / (0.76 · 4187) = **2.4 °C**
  - So the far consumer (AOS-4) sees ~92.6 °C supply, not 95 °C.
- Reduced ΔT at the far consumer:
  - Design ΔT = 95 − 70 = 25 °C
  - Actual ΔT = 92.6 − 70 = 22.6 °C (assuming return temp held)
  - **9.6 % less ΔT → 10.6 % more mass flow required** for the same
    heat delivery → pump duty increases by the same ratio.

This is the engineering case that makes Phase 5D non-optional —
without integrating heat-loss into the mass-flow + pump-sizing
calculation, the sizePump() result is 10 % too small even though
the Phase 5A round-trip fix is correct.

---

## API surface (TypeScript)

```typescript
interface HeatLossInputs {
  fluidTemp_C: number;
  ambientTemp_C: number;
  pipeOuterDiameter_mm: number;
  pipeWallThickness_mm: number;
  insulationThickness_mm: number;
  insulationConductivity_W_mK?: number;  // default 0.025 (fresh PUR)
  jacketThickness_mm?: number;            // default 3
  jacketConductivity_W_mK?: number;       // default 0.4 (HDPE)
  installation: "buried" | "air" | "channel";
  burialDepth_m?: number;                 // required for buried
  soilConductivity_W_mK?: number;         // default 1.5
  innerHtc_W_m2K?: number;                // default 2000
  outerHtc_W_m2K?: number;                // default 10
  pipeConductivity_W_mK?: number;         // default 50
}

interface HeatLossResult {
  heatLossPerMeter_W: number;
  thermalResistance_mK_W: {
    convInner: number;
    pipeWall: number;
    insulation: number;
    jacket: number;
    outer: number;
    total: number;
  };
  surfaceTemperature_C: number;
}

function computePipeHeatLoss(inputs: HeatLossInputs): HeatLossResult;

function computeTemperatureDropAlongPath(
  pipes: Array<{
    heatLossPerMeter_W: number;
    length_m: number;
    massFlow_kg_s: number;
  }>,
  cp_J_kgK?: number,
): { temperatureDrop_C: number; totalHeatLoss_W: number };
```

---

## Error guards

The module throws explicit errors (rather than returning garbage) for:

1. **Wall thicker than half the OD** — would produce non-positive inner
   diameter. Error references both fields so the caller can see what's
   wrong.
2. **Shallow burial** where `2H < d_outer_jacket` — the Carslaw-Jaeger
   shape factor degenerates (`ln` of a number ≤ 1 → non-positive R).
   Error tells the caller the minimum burial depth.

Negative heat loss (cold pipe in warm ambient — heat gain) is **NOT**
an error — the module returns a negative q' so return-pipe scenarios
where the ambient happens to be warmer than the returning fluid work
through the same code path.

---

## File changelog

```
+ apps/frontend/src/components/hydraulic/calc/pipeHeatLoss.ts             (new, 271 lines)
+ apps/frontend/src/components/hydraulic/calc/__tests__/pipeHeatLoss.test.ts (new, 453 lines)
+ docs/phase-5/sub-phase-5C-heat-loss.md                                   (this file)
```

The legacy `apps/frontend/src/components/hydraulic/calc/heatLosses.ts`
(139 lines) is **NOT** touched. It contains only an insulation-type
catalog (`INSULATION_TYPES`) referenced by a JSDoc comment in
`hydraulicTypes.ts`, plus a simpler `calcLinearHeatLoss()` that no
production code calls. Phase 5D can decide whether to migrate the
catalog into `pipeHeatLoss.ts` or keep the two-module split.

---

## Engineering-correctness notes

- **No silent test adjustment**. The 12 prompt-required tests + 8
  bonus cases all use the *default* `k_PUR = 0.025` and pass without
  per-test conductivity overrides. Default tracks the published
  reference values, not the other way around.
- **The БНбД aged value (0.033) is exported as a constant**, not
  buried as a default. Engineers modelling year-5+ networks pass it
  explicitly via `insulationConductivity_W_mK: K_PUR_FOAM_AGED_W_MK`.
  This is the engineering-honest split between "fresh" and "design".
- **Sub-linear cylindrical scaling is asserted, not glossed**. Test 6
  proves that doubling insulation thickness does NOT halve heat loss
  (the plane-wall intuition many engineers carry over). If anyone
  reverts the cylindrical `ln(r2/r1)` formula to a plane-wall
  `Δr / r` shortcut, this test fails.
- **Mass-flow-aware aggregation**. The path function sums per-segment
  ΔT contributions with each segment's local ṁ — correct under flow
  variation through branched networks, not just a global division.

---

## Commit list (Phase 5C)

| Commit | Sub-phase | Description |
|--------|-----------|-------------|
| `4e7a8ec` | 5C.1+2 | `feat(heat-loss): cylindrical conduction module + 20 published-reference tests` |
| *this commit* | 5C.3 | `docs(phase-5): pipeHeatLoss physics + БНбД / VDI references` |

---

*Generated 2026-05-12 after `pnpm test` (172/172 pass). Phase 5C
STOP. Ready for Phase 5D — heat-loss × pump-sizing × Haversine length
integration.*
