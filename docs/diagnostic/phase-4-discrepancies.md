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

## DISCREPANCY-002 — Pump head sizing is supply-leg only

**Test**:
`apps/frontend/src/components/hydraulic/calc/__tests__/real_project_v2.test.ts`
→ `Pump sizing > H ≥ minimum required 18.3 m`

**Status**: `.skip` with TODO, parallel "current contract" assertion kept passing.

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

### Resolution proposed (do NOT apply unilaterally)

Two options, increasing scope:

1. **Quick fix (preferred)**: in `sizePump()`, multiply the supply-leg
   `maxDp_pa` by 2 before adding the reserve. This is the assumption
   the fixture and most balanced 2-pipe systems already encode (return
   friction ≈ supply friction). Single-line change, low risk.

2. **Proper fix**: walk both supply and return trees, sum ΔP on the
   actual round-trip path to each consumer, take the max. Requires
   teaching the solver about return-circuit direction (currently it
   only sees the supply tree). Larger refactor, deferred until the
   Hardy-Cross loop solver is wired through (Phase 5+ candidate).

Until resolved, the test asserts the **current** solver contract
(supply-only H ≈ 17.39 m ±5 %) to set the regression bar. The
fixture-expectation assertion (`H ≥ 18.3`) is `.skip` with a TODO
pointing at this document.

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

*Filed 2026-05-12 from `pnpm --filter frontend test`. One open
discrepancy (DISCREPANCY-002). Phase 5 candidate fix.*
