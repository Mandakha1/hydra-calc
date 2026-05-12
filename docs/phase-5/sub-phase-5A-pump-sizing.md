# Phase 5A — pump-head sizing fix (DISCREPANCY-002)

> Closes the one remaining open discrepancy from Phase 4. Safety-critical:
> the prior supply-only solver under-sized pumps by ~4–5 % on a balanced
> 2-pipe loop — enough to stall the return leg at the worst-served
> consumer during −39 °C peak winter, leaving cold radiators.

---

## Acceptance ✓

| Criterion | Status |
|-----------|--------|
| Unit test exposes the bug (5A.1) | ✓ commit `d34d3de`, 2 of 4 assertions RED |
| `sizePump()` walks supply + return circuits (5A.2) | ✓ commit `2c9feb3`, 4 of 4 RED → GREEN |
| Previously-skipped fixture assertion un-skipped (5A.2) | ✓ `H ≥ 18.3 m` now passes |
| Stale supply-only contract assertion removed (5A.2) | ✓ replaced by recommended-H + breakdown-shape locks |
| Breakdown surfaced in UI (5A.3) | ✓ commit `ac50ecb`, ResultsPanel + Excel export |
| Diagnostic doc marked RESOLVED (5A.4) | ✓ this commit |
| `pnpm typecheck` clean | ✓ 3 workspaces, 0 errors |
| `pnpm test` green | ✓ **131 / 131 pass, 0 skip, 0 fail** |
| `pnpm build` clean | ✓ HydraulicV5 chunk 241 → 242 KB (+1.4 KB raw / +~0.5 KB gz) |

---

## Headline numbers

| Counter | Before 5A | After 5A | Δ |
|---------|-----------|----------|---|
| Total tests passing | 124 | **131** | **+7** |
| Total tests | 125 | 131 | +6 |
| Skipped (documented) | 1 | 0 | −1 |
| Failing | 0 | 0 | 0 |
| Test files | 7 | 8 | +1 (new `pumpSizing.test.ts`) |
| Open discrepancies | 1 (DISCREPANCY-002) | 0 | −1 |

---

## What changed

### `apps/frontend/src/components/hydraulic/calc/hydraulics.ts`
- `sizePump()` rewritten end-to-end (lines 277–407 in the post-fix file).
- Partitions pipes by `circuit`: `heating_supply` vs `heating_return`.
- DFS the supply tree from source → cumulative ΔP per consumer.
- DFS the return adjacency from each consumer → cumulative ΔP back to
  source. Mirror-fallback (`ΔP_return = ΔP_supply`) when no return
  pipes are supplied — keeps synthetic unit-test networks honest
  without forcing test authors to mirror every pipe.
- Picks the consumer with the worst `(supply + return)` loop — that's
  the worst-served end driving pump duty.
- Returns `breakdown: { supplyFriction_m, returnFriction_m,
  consumerReserve_m, safetyMargin_m }`. H_m is the **minimum required**
  head (= supply + return + reserve). The 2 m design buffer is in
  `breakdown.safetyMargin_m` so the UI can render both "minimum" and
  "recommended" side-by-side without burying the breakdown.

### `apps/frontend/src/components/hydraulic/hydraulicTypes.ts`
- `CalculationResults.pump.breakdown?` added (4 fields, all numeric m).

### `apps/frontend/src/components/hydraulic/calc/__tests__/pumpSizing.test.ts` *(new)*
- 4 assertions on a 2-node minimal network (source — 100 m DN50 — 50 kW
  consumer) so the failure mode is unambiguous. Catches a regression
  the moment anyone reverts to supply-only sizing.

### `apps/frontend/src/components/hydraulic/calc/__tests__/real_project_v2.test.ts`
- Removed `.skip` on the round-trip fixture assertion.
- Removed the stale "supply-only current contract" lock (17.39 m ± 5 %).
- Added: `H_m + safetyMargin_m matches recommended 20.3 m ± 5 %`
  (cross-checks the engineer-recommended pick against the fixture).
- Added: `breakdown surfaces all 4 components` (locks the new shape so
  refactors can't silently drop fields).

### `apps/frontend/src/components/hydraulic/panels/ResultsPanel.tsx`
- Насосын тооцоо section: two stat cards (Минимум / Зөвлөсөн H +нөөц).
- New labelled breakdown table beneath them — Магистрал шугам, Эргэх
  шугам, Хэрэглэгчийн нөөц, Хамгийн бага H шаардлага (bold), Дизайн
  нөөц (muted), Зөвлөсөн H (accent). All values in metres of water.

### `apps/frontend/src/components/hydraulic/export/excelExport.ts`
- Same breakdown appended to the "Тойм" sheet so procurement review
  sees the rationale.

### `docs/diagnostic/phase-4-discrepancies.md`
- DISCREPANCY-002 marked **RESOLVED** with the verification table and
  cross-references to the implementation + UI commits.

### `docs/phase-4/completion-report.md`
- Header amended with a 2026-05-12 update noting the new numbers.

---

## Engineering-correctness notes

- **No tolerance relaxation**. The fixture's `H_m_minimum_required =
  18.3 m` and `H_m = 20.3 m` are unchanged. The solver was taught to
  match them, not the other way around.
- **No silent test edit**. The previously-skipped fixture assertion
  was un-skipped, not deleted. The supply-only "current contract"
  assertion was *removed* because it actively encoded the bug; its
  replacement asserts the corrected behaviour.
- **Per-component breakdown is a permanent surface**, not a debug
  print. Engineers signing off pump procurement need the rationale,
  not just the number — both the in-app Results panel and the Excel
  export carry it now.
- **Picked the proper fix (Option 2 from the discrepancy doc)** over
  the quick `×2` multiplier. The multiplier would have worked on a
  balanced 2-pipe loop but failed silently the moment the supply and
  return paths diverge (e.g. ring mains, three-pipe DHW networks).
  Walking both circuits explicitly costs ~30 lines and zero perf.

---

## Commit list (chronological, Phase 5A)

| Commit | Sub-phase | Description |
|--------|-----------|-------------|
| `d34d3de` | 5A.1 | `test(pump): expose missing return-leg friction in sizing` |
| `2c9feb3` | 5A.2 | `fix(pump): include return-leg friction in head sizing (resolves DISCREPANCY-002)` |
| `ac50ecb` | 5A.3 | `feat(ui): surface pump-head breakdown in Results panel + Excel export` |
| *this commit* | 5A.4 | `docs(phase-5): mark DISCREPANCY-002 RESOLVED + sub-phase 5A summary` |

---

*Generated 2026-05-12 after `pnpm test` (131/131 pass) + `pnpm build`
(clean). Phase 5A STOP. Ready for Phase 5B (OSM/DXF polish) review.*
