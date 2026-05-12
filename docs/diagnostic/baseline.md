# Diagnostic baseline — 2026-05-12

> Engineering-rigor diagnostic check before any new feature work.
> Run from clean checkout, fresh `pnpm install`.

---

## Summary

| Check | Status | Detail |
|-------|--------|--------|
| **pnpm install** | ✅ PASS | 2.7s, prettier/rimraf/typescript devDeps installed |
| **pnpm typecheck** | ✅ PASS | all 3 workspaces (shared / backend / frontend) compile clean |
| **pnpm lint** | ❌ **FAIL** | 15 errors + 16 warnings on frontend |
| **pnpm build** | ✅ PASS | 146 modules, vite 3.19s, dist size: 13.7 MB total (sql-wasm 660 KB, HydraulicV5 chunk 607 KB) |
| **pnpm test** | ⚠️ **PARTIAL** | backend 3/3 pass, frontend `No test files found` → fail, shared = stub echo |

**Verdict**: System **builds and typechecks cleanly**, but has:
1. Cosmetic lint errors blocking CI (mostly `react/no-unescaped-entities` — quote marks in JSX text)
2. **Zero frontend tests** — critical gap for production confidence
3. A few real lint warnings worth investigating (missing useCallback deps, unused vars)

---

## Source code stats

| Metric | Value |
|--------|-------|
| TypeScript source files | **89** |
| Total lines of code | **15,618** |
| TODO / FIXME markers | **0** (clean codebase, no abandoned work) |
| Workspaces | 3 (apps/backend, apps/frontend, packages/shared) |

---

## ❌ Lint errors — full breakdown

Lint failed with **15 errors + 16 warnings**, all in `apps/frontend`.

### Cosmetic (12 errors): `react/no-unescaped-entities`

Pure JSX text quote-mark escaping. Files affected:
- `FailurePanel.tsx:18, 49`
- `PiezometricChart.tsx:26`
- `ResultsPanel.tsx:14`
- `ImportDxf.tsx:161`
- `SharedView.tsx:64`

Each line has 2 unescaped `"` chars that should be `&quot;` or `{'"'}`.

**Fix**: `pnpm lint --fix` or replace `"text"` → `\"text\"` in JSX bodies. Cosmetic — no runtime impact.

### Functional (3 errors): `react/jsx-no-comment-textnodes`

- `Home.tsx:203, 254` — JSX comments outside `{/* */}` braces

### Real warnings (3): missing useCallback / useEffect deps

- `SchemeEditor.tsx:494` — `useCallback` missing deps `pickBuildingFromOsm` + `svgToLatLon`
- `SchemeEditor.tsx:544` — `useCallback` missing dep `pipeLengthInput`
- `Dashboard.tsx:79` — `useEffect` missing dep `load`

**Risk**: stale closures — values seen by callback might be old. Worth fixing before adding more features.

### Unused vars (4 warnings)

- `InspectorPanel.tsx:263` — `nodeId` unused
- `PiezometricChart.tsx:289` — `resultByPipe` assigned but unused
- `SchemeEditor.tsx:27` — `bbox` imported but unused
- `zuluExport.ts:14, 128` — `SchemeNode`, `SchemePipe`, `nz` unused

---

## ⚠️ Test coverage — critical gap

| Workspace | Status | Test files | Coverage |
|-----------|--------|------------|----------|
| `apps/backend` | ✅ 3/3 pass | 1 (`hydraulics.test.ts`) | hydraulics solver only |
| `apps/frontend` | ❌ FAIL | **0** | nothing |
| `packages/shared` | ⚠️ stub | 0 (`echo "no tests yet"`) | nothing |

**Implications**:
- Solver math is validated (hydraulics parity tests vs Darkhan TPP 2013 data)
- **But UI behaviour, store mutations, DXF/Zulu I/O, BoM, ITP sizing — ALL unvalidated by automated tests**
- Any regression in these areas would slip through CI silently

**Frontend test priorities** (suggested first targets):
1. `hydraulicStore` — node/pipe add/remove/update invariants
2. `dxfImport` / `zuluImport` — parse a fixture file, assert node count + DN distribution
3. `BomPanel` — given a state, total MNT must match
4. `failureSim` — N-1 contingency invariants (cutOffConsumers monotonic with severity)
5. `geometry` — polygon area / centroid / containment math

---

## ✅ Build output

```
dist/index.html                        1.13 kB
dist/assets/sql-wasm-UFUCzYNW.wasm   659.73 kB    (sql.js for Zulu import)
dist/assets/index-BgVlJqW7.css         9.80 kB → gzip 2.87 kB
dist/assets/HydraulicV5-HupOsEJb.css  15.61 kB → gzip 6.46 kB
dist/assets/index-D0x9TaqC.js        405.10 kB → gzip 127.28 kB
dist/assets/HydraulicV5-dqCX8JOn.js  607.38 kB → gzip 194.16 kB   ⚠️ over 500 KB threshold
```

**Note**: `HydraulicV5` chunk is **607 KB** — exceeds typical 500 KB warning threshold.
Could be split via `React.lazy()` on the panel tabs (BoM, Failure, Piezometric all heavy).

---

## Backend test — passing detail

```
✓ src/__tests__/hydraulics.test.ts  (3 tests, 2ms)
```

Validates Darcy-Weisbach + Colebrook-White solver. Tests pass — solver core is trusted.

---

## What this means for next steps

Before any P0 feature work (auth, persistence, share links), we should:

| # | Action | Effort | Priority |
|---|--------|--------|----------|
| 1 | Fix 15 lint errors (mostly `&quot;` escapes) | 30 min | HIGH — blocks CI |
| 2 | Fix 3 useCallback dep warnings in `SchemeEditor.tsx` | 1 hr | HIGH — potential stale-closure bugs |
| 3 | Add `vitest run --passWithNoTests` to frontend OR write first test | 30 min | MEDIUM |
| 4 | Split `HydraulicV5` chunk (lazy-load panel tabs) | 2 hr | MEDIUM — perf |
| 5 | Write 5 priority frontend tests (store, import, BoM, sim, geometry) | 1 day | HIGH — confidence floor |
| 6 | Set up GitHub Actions CI (lint + typecheck + build + test) | 1 hr | HIGH — enforce regression bar |

**Total cleanup effort before adding features**: **~2 days of focused engineering work**.

---

## Engineering-rigor note

The previous `CLAUDE.md` + `TASKS.md` files (committed in `5c97796`) are **product-roadmap focused** (P0=auth, P1=ITP integration, etc). This baseline shows that's premature:

> Building auth on top of an untested frontend with no CI is "adding bricks to a wall whose foundation hasn't been load-tested."

The recommended sequence is:
1. **Stabilise** (this baseline + the 6 cleanup items above)
2. **Validate** (frontend tests + CI gate)
3. **Then build features** (auth, persistence, share)

---

*Generated 2026-05-12 from `pnpm install && pnpm typecheck && pnpm lint && pnpm build && pnpm test`.*
