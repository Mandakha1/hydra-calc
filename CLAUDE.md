# Hydra Calc — Claude Code project memory

Энэ файл нь дараагийн Claude Code session-уудад заавал уншигдах багаж юм. Та
эндэхэх агуулгыг өөрчилбөл бүх Claude session-д нөлөөлнө — болгоомжтой.

---

## Юу хийдэг систем

**Hydra Calc** — Монгол хэрэглэгчдэд зориулсан дулаан хангамжийн сүлжээний
гидравлик тооцооны SaaS. Стандарт: МНС 4217 / БНбД 41-01-2019 / СП 124.13330.2012.

Engineering ажил:
- Darcy-Weisbach + Colebrook-White solver (50 итерац, 1e-8 tolerance)
- Hardy-Cross loop balancing
- 3 mode: Constructive (DN sizing) / Commissioning (auto-balance) / Verification (as-built)
- DWG/DXF AutoCAD импорт (ODA File Converter)
- Zulu Thermo .sqlite roundtrip (10-table compat)
- N-1 failure simulation (Zulu Надёжность clone)
- Pieometric chart, BoM (2026 МНТ Mongolian retail prices)
- OSM map overlay drawing (Overpass API — real building footprints автомат)

**Verified**: Darkhan TPP 2013 hydraulic test data — 0.0% deviation at all 4
measured sections (K14-K18 1347 m³/h, K27-K31 537 m³/h, K27-K45 662 m³/h).

---

## Архитектур

```
hydra-calc/
├── apps/
│   ├── backend/        Fastify 4 + Drizzle ORM + PostgreSQL 16
│   │   ├── src/
│   │   │   ├── server.ts           # Fastify entrypoint
│   │   │   ├── routes/             # auth, projects, share, admin
│   │   │   ├── db/                 # Drizzle schema + migrations
│   │   │   └── lib/                # bcrypt, JWT, rate-limit, mail
│   │   └── drizzle/                # SQL migrations
│   └── frontend/       React 18 + Vite 5 + zustand + react-router 6
│       └── src/
│           ├── components/hydraulic/  # ★ CORE ENGINE
│           │   ├── HydraulicV5.tsx           # Main editor shell
│           │   ├── hydraulicStore.ts         # zustand store
│           │   ├── hydraulicTypes.ts         # SchemeNode/SchemePipe/etc
│           │   ├── nodeCatalog.ts            # 30+ node kinds + categories
│           │   ├── colorBands.ts             # Zulu voda.ini bands
│           │   ├── geometry.ts               # polygon area, centroid, etc
│           │   ├── calc/
│           │   │   ├── hydraulics.ts         # Darcy-Weisbach solver
│           │   │   ├── threeModeEngine.ts    # Constructive/Commissioning/Verif
│           │   │   ├── failureSim.ts         # N-1 contingency
│           │   │   ├── bom.ts                # 2026 МНТ Bill of Materials
│           │   │   ├── itpDevices.ts         # Throttle washer / elevator
│           │   │   ├── heatLoad.ts           # Envelope-based load calc
│           │   │   └── writeBack.ts          # Mutate nodes with results
│           │   └── panels/
│           │       ├── SchemeEditor.tsx      # ★ MAIN SVG canvas
│           │       ├── MapBackground.tsx     # Leaflet integration
│           │       ├── BuildingDialog.tsx    # Polygon → consumer node
│           │       ├── InspectorPanel.tsx    # Right-side editor
│           │       ├── BalancingPanel.tsx    # Tenцвэржүүлэлт tab
│           │       ├── BomPanel.tsx          # Смет tab
│           │       ├── FailurePanel.tsx      # Эвдрэлийн загвар tab
│           │       ├── PiezometricChart.tsx  # Пьезометр tab
│           │       └── ItpSchemePicker.tsx   # 49 Politerm схем
│           ├── lib/
│           │   ├── zuluImport.ts           # sql.js + cp1251 decoder
│           │   ├── zuluExport.ts           # SchemeNode → Zulu .sqlite
│           │   ├── dxfImport.ts            # DXF → SchemeNode
│           │   ├── api.ts                  # Backend fetch helpers
│           │   ├── authStore.ts            # JWT + demoMode
│           │   └── storage.ts              # Demo localStorage shim
│           └── pages/                      # Login, Dashboard, ImportZulu, etc
├── packages/shared/    Domain types + БНбД/ГОСТ constants
│   └── src/
│       ├── hydraulicConstants.ts  # WATER_PROPS, PIPE_DB_STEEL/PPR/PEHD, NORM_THRESHOLDS
│       ├── politermSchemeIndex.ts # 49 ITP schemes
│       ├── itpSchemes.ts          # Detailed scheme catalog
│       ├── i18n.ts                # Mongolian translations
│       └── zodSchemas.ts          # Runtime validation
└── deploy/             Docker compose + Caddy + cloud-init
```

---

## Stack

- **Frontend**: React 18 + Vite 5 + zustand persist + react-router 6 +
  Leaflet (vanilla, no react-leaflet) + sql.js (WASM SQLite for Zulu)
- **Backend**: Fastify 4 + Drizzle ORM + PostgreSQL 16 + bcrypt + JWT
  rotation + rate-limit + nodemailer
- **DB**: PostgreSQL (prod) or PGlite WASM (demo mode, no Docker required)
- **Build**: pnpm workspaces + TypeScript 5 strict
- **Deploy**: Oracle Always Free (A1 4-OCPU 24GB) + Caddy 2 (auto-HTTPS) +
  Docker Compose

---

## Соглашения

### Татгалзах
- ❌ **AdminBootstrap файлд hardcoded password** — ENV-аас уншин
- ❌ **Russian terms** — бүх UI текст монгол байна (Zulu Thermo → Hydro, Дроссельная
  шайба → Регуляторын шайба, etc)
- ❌ **`any` type** — strict TypeScript, generic / unknown ашиглах
- ❌ **PIPE_PRICES_MNT-аас бусад хатуу-кодлогдсон үнэ** — 2026 МНТ retail
- ❌ **`npm`/`yarn`** — зөвхөн `pnpm` (workspace setup)

### Хүлээж авдаг
- ✅ **БНбД/СП standard references in comments** (e.g. "СП 124.13330.2012 §7.4")
- ✅ **Engineering tolerances ±15%** (Mongolian field practice)
- ✅ **Cyrillic in code comments + UI** (Монгол engineering vocabulary)
- ✅ **Cross-references in code**: `// per БНбД 41-01 Table 5.3`

### File header пр
Шинэ файлын дээд талд (TypeScript):
```ts
/**
 * <Brief Mongolian description>
 *
 * Standard: <БНбД xxx / СП xxx>
 * Дамждаг өгөгдөл: <input>
 * Гаргадаг өгөгдөл: <output>
 */
```

---

## Critical files — мэдрэхүйцтэй өөрчилнө

### `packages/shared/src/hydraulicConstants.ts`
- БНбД-ийн норм value-уудтай. Шинэчилбэл реgression test шалгуурын дагуу.
- DN 600+ нэмсэн (Darkhan TPP DN700 magistral fit-аар).

### `apps/frontend/src/components/hydraulic/calc/hydraulics.ts`
- Darcy-Weisbach solver. Mongolian engineers print result-уудтай тулгана.
- Зөв ажиллажa: tested vs Darkhan TPP 2013 data (0.0% deviation).

### `apps/frontend/src/components/hydraulic/panels/SchemeEditor.tsx`
- 1800+ мөртэй гэх (canvas + tool + map + animation logic). Аливаа
  өөрчлөлт хийхэд `displayPos` функцийг бүү зөрчинө — пap pan/zoom-ыг
  бүх node/pipe-д дамжуулагч ангилал юм.

### `apps/frontend/src/components/hydraulic/panels/MapBackground.tsx`
- `onMapView` callback нь **stable useCallback** байх ёстой (parent-аас
  дамжих үед) — биш бол React infinite loop үүсдэг.

---

## Recent session achievements (2026-04 - 2026-05)

| # | Feature | Detail |
|---|---------|--------|
| 1 | DWG → DXF import | ODA File Converter (winget) + 247-node Bayangol verified |
| 2 | Real-scale plan view | Buildings render at width_m × height_m × mapPxPerMeter |
| 3 | OSM building auto-fetch | Overpass API 150m radius + Building footprint + tags |
| 4 | Map overlay drawing | Per-vertex lat/lon; polygon follows pan/zoom |
| 5 | Pipe flow animations | Animated dashes (Zulu voda.ini bands: slow/normal/fast) |
| 6 | Violation pulse | Red pulse on nodes/pipes that fail norm checks |
| 7 | Failure simulation | N-1 contingency — pipe/node out → impact heatmap |
| 8 | 2026 МНТ BoM | Steel/PPR/PE-HD with VAT 10% + Labor 32% + Transport 7% |
| 9 | ITP scheme picker | 49 Politerm schemes (СП 41-101 catalog) |
| 10 | Measure tool | Polyline with per-segment + cumulative Σ labels |
| 11 | Hatch fills | 6 patterns: solid/diag45/diag135/cross/brick/dots/none |
| 12 | Pipe length input | Manual L (m) override in addPipe mode |
| 13 | Darkhan TPP verify | 0.0% deviation against 2013 hydraulic test data |
| 14 | DXF pipe-role detect (Phase 7.3) | Multi-signal voter: layer name + ACI + linetype |
| 15 | DXF review pane (Phase 7.4) | Engineer overrides + single Ctrl+Z undo restore |
| 16 | Bayangol regression (Phase 7.5) | 247-node baseline locked in test suite |
| 17 | Detail views (Phase 8) | Profile + Energy + Well + Compensator + P&ID — 6-page Drawing Set |
| 18 | Compliance engine (Phase 9) | 30 БНбД rules → 7th-page Compliance Report PDF |
| 19 | Email verify + reset (Phase 10.1) | Postmark/SendGrid + dev console fallback |
| 20 | Backend calc API (Phase 10.2) | /api/calc/compliance fully implemented, hydraulic stubbed |
| 21 | Share dialog (Phase 10.3) | 5 expiry options + revoke + active token list |
| 22 | Activity feed (Phase 10.4) | Per-project audit trail + 90-day retention |
| 23 | Team roles (Phase 10.5) | engineer/checker/approver + approval workflow |
| 24 | Mobile responsive (Phase 11.1) | Hamburger Navbar + 44px touch targets |
| 25 | PDF tile math (Phase 11.2) | Multi-page Plan math (renderer wire-up deferred) |
| 26 | Compliance 270× speedup (Phase 11.3) | 1000-node check 13.5s → 49ms (hot Map cache + Dijkstra-once) |
| 27 | Web Worker compliance (Phase 11.3) | Off-main-thread + fallback |
| 28 | Lazy route chunks (Phase 11.4) | Initial bundle -140 KB raw / -48 KB gz |
| 29 | Onboarding tour (Phase 11.5) | 5-step Mongolian first-time engineer carousel |

**Test counts**: 681 → **1026** (Phase 9-11). PRs merged: **48 total**.
**Initial bundle**: 418 → 285 KB raw / 133 → 85 KB gz (-36% gz post Phase 11.4).

---

## Известные ограничения (workarounds)

| Bug | Workaround |
|-----|------------|
| Leaflet `latLngToContainerPoint` rounds to integer → 1m delta = 0px | Use 1km delta then divide by 1000 |
| SVG `<rect fill="none">` not hittable | Add `pointerEvents="all"` on building rects |
| `pnpm dev` slow on Windows-OneDrive | Move repo outside OneDrive sync if possible |
| `gh auth` device-code timeout | Background process + poll TaskOutput |

---

## Daily workflow

```bash
# Эхлүүлэх
cd hydra-calc && pnpm dev        # api :3000 + web :5173

# Build шалгах
pnpm typecheck
pnpm lint
pnpm test

# Commit
git add . && git commit -m "feat/fix/docs: ..." && git push
```

---

## Repo

**GitHub**: https://github.com/Mandakha1/hydra-calc
**Status**: Public, MIT-compatible (no license file yet)
**Маин branch**: `main`

---

*Сүүлийн шинэчлэлт: 2026-05-12 — generated from CLAUDE.md task plan*
