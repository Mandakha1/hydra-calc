# Phase 4 — full-network discrepancies

> Tracks gaps between the production solver and the GK-23/02 v2 fixture
> (`tests/fixtures/real_project_001_v2.json`). The fixture is the source
> of truth: when the solver disagrees by more than the per-assertion
> tolerance, the discrepancy is documented here and the assertion is
> either left red (driving a follow-up fix) or marked `.skip` with an
> explicit TODO. **Do not adjust the fixture to mask a solver gap.**

---

## DISCREPANCY-001 — *(resolved in Phase 1B, see engine-real-world-discrepancies.md)*

---

## DISCREPANCY-002 — Pump head sizing is supply-leg only — *RESOLVED in Phase 5A.2 (commit 2c9feb3)*

**Test**:
`apps/frontend/src/components/hydraulic/calc/__tests__/real_project_v2.test.ts`
→ `Pump sizing > H_m ≥ minimum required 18.3 m (round-trip)`
plus the dedicated regression bar
`apps/frontend/src/components/hydraulic/calc/__tests__/pumpSizing.test.ts`

**Status**: ✅ **RESOLVED** — both the fixture assertion and the
minimal-network regression test pass. Removed the `.skip` and the
stale "supply-only current contract" parallel assertion. UI breakdown
shipped in Phase 5A.3 (commit ac50ecb).

### What the fixture expects

The fixture's `expected_results_full_network.pump`:
- `Q_m3_h`: 2.811
- `H_m`: 20.3
- `H_m_minimum_required`: 18.3 (= H_m − 2 m design buffer)
- `tolerance_pct`: 5

Derivation (per fixture comments + arithmetic):
- Supply-leg friction along the magistral UDDT-8 → AOS-4: 1.648 m H₂O
- Return-leg friction (same DN, same flow, mirrored path): 1.648 m H₂O
- **Round-trip friction: 3.297 m H₂O**
- Consumer Δp reserve (БНбД 41-01 §6.3): 15 m H₂O ≈ 0.15 MPa
- Design buffer: 2 m H₂O
- **Total H = 3.297 + 15 + 2 ≈ 20.3 m** ✓

### What the solver computes

`hydraulics.ts` → `sizePump()`:
```ts
const maxDp_pa = Math.max(0, ...Array.from(totalByConsumer.values()));
const reserveDp_pa = NORM_THRESHOLDS.dp_consumer_min_mpa * 1e6;
const required_dp_pa = maxDp_pa + reserveDp_pa;
H_m = required_dp_pa / (rho * GRAVITY);
```
`maxDp_pa` walks the directed supply tree only — it never visits the
return circuit. So the solver's H is:
- Supply-leg ΔP only: 1.648 m × ρg = 15,696 Pa
- Plus 0.15 MPa reserve: 150,000 Pa
- Total ÷ (ρ · g) = 17.43 m ❌ (under-sizes by 14.4 %)

### Why this matters

A pump sized to 17.4 m head can push water along the supply line and
reach the worst consumer with the 0.15 MPa Δp the standard requires —
but the **return line then can't drain back to the source against its
own friction**, the consumer's heat exchanger stalls, and the whole
loop loses circulation. Engineering practice (and the fixture's
arithmetic) accounts for the full loop.

### Resolution shipped (Phase 5A.2, commit 2c9feb3)

Took **Option 2 — the proper fix** instead of the quick ×2 multiplier:

- `sizePump()` now partitions pipes by `circuit` (heating_supply vs
  heating_return) and DFS-walks each tree independently. For every
  consumer reached on the supply side, the matching path on the
  return side is summed back to the source.
- Returns a per-component breakdown:
  `{ supplyFriction_m, returnFriction_m, consumerReserve_m,
  safetyMargin_m }`. H_m is the *minimum required* head (supply +
  return + reserve, matching the fixture's `H_m_minimum_required`).
  The 2 m design buffer is exposed separately so the UI can render
  both "minimum" and "recommended" head with the engineer's
  rationale.
- Balanced-2-pipe fallback (return ΔP = supply ΔP) is retained for
  synthetic supply-only test networks where the return circuit
  isn't supplied — keeps the unit tests honest without forcing
  test authors to mirror every pipe.

### Verification

| Test | Before fix | After fix |
|------|-----------|-----------|
| `pumpSizing.test.ts > H_m includes return leg` (round-trip identity) | ❌ FAIL | ✅ PASS |
| `pumpSizing.test.ts > GK-23/02 fixture H ≥ 18.3` | ❌ FAIL | ✅ PASS |
| `pumpSizing.test.ts > breakdown shape` | ❌ FAIL | ✅ PASS |
| `real_project_v2.test.ts > H ≥ minimum required 18.3 m` | ⏭ SKIP | ✅ PASS (un-skipped) |
| `real_project_v2.test.ts > recommended H matches fixture 20.3 ±5 %` | (new) | ✅ PASS |
| `real_project_v2.test.ts > breakdown surfaces all 4 components` | (new) | ✅ PASS |
| Full suite | 124 pass + 1 skip | **131 pass + 0 skip** |

### UI follow-up (Phase 5A.3, commit ac50ecb)

`ResultsPanel.tsx` renders the breakdown as a labelled table; the
Excel "Тойм" sheet exports the same lines so the rationale travels
with the workbook into procurement review.

### Sanity verification — the rest of Phase 4 passes

DISCREPANCY-002 affects ONE pump-sizing assertion. Per-pipe (G, v, R,
Re), totals, longest-path length, longest-path supply ΔP, norm
violations, return-pipe parity, HW analytical checks — all green.
The solver's math is right; the only systemic gap is the missing
return-leg sum in pump sizing.

---

## RESOLVED — PIPE_DB_STEEL_V_GROUP added

Initial Phase 4 run had 46 / 72 failures because the fixture uses ГОСТ
10704-91 *V-group* sizes (DN = OD, uniform 2.5-mm wall) while the
solver's PIPE_DB_STEEL ships the standard GOST table (DN65 → OD 76 /
ID 68). That's a real engineering gap, not a solver bug.

Fix shipped in this phase:
- Added `PIPE_DB_STEEL_V_GROUP` table to
  `packages/shared/src/hydraulicConstants.ts`
- Extended `ProjectSettings.primaryMaterialCategory` to include
  `"steel_v_group"`
- Adapter (`_helpers/loadGKFixture.ts`) sets the new category for the
  GK-23/02 fixture

Result: all per-pipe (G, v, R) tests pass within the fixture's 0.5 %
tolerance. The V-group table is now available for any future Mongolian
residential project import.

---

*Filed 2026-05-12 from `pnpm --filter frontend test`. DISCREPANCY-002
RESOLVED in Phase 5A.2 (2026-05-12, commit 2c9feb3). Zero open
discrepancies on the GK-23/02 v2 fixture.*
