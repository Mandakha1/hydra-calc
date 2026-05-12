# Hydra Calc — TASKS

Дараагийн Claude Code session-ууд эндэхэх tasks-уудыг үргэлжлүүлж болно.
Tasks нь priority-аар эрэмблэгдсэн.

---

## 🔴 P0 — Production-ready хэрэгсэл

### [ ] Authentication / accounts
- Register flow тестлэх (email verification)
- Password reset email
- Admin panel (existing user list, role assignment)
- Demo mode → "Бүртгүүлэх → cloud sync" upgrade prompt

### [ ] Project persistence
- Backend `/projects` CRUD endpoints (already exists?)
- Auto-save every 30s when authenticated
- Versioning / history (last 10 snapshots per project)

### [ ] Share links
- `/shared/<token>` read-only view
- Token expiry (7d default, customizable)
- View-only embed для презентаций

---

## 🟡 P1 — Engineering completeness

### [ ] Pressure regime improvements
- **P_min check** — Darkhan demo шows P_мин = 0.000 MPa. Source pressure
  тогтоох UI (Inspector-д `t_supply_c`, `t_return_c`, `requiredPressure_mpa`)
- Static pressure injection (надхырlin pump насос)
- Piezometric chart along longest path (already exists, improve UI)

### [ ] Network topology
- Loop detection + Hardy-Cross convergence visualizer
- "Find shortest path source → consumer" highlighter
- Auto layout: hierarchical / radial / force-directed

### [ ] DXF export
- AutoCAD 2018 DXF export (we already have DXF import via ezdxf)
- Layer per circuit (T1, T2, T3, T4)
- Block library for ИТП elements (elevator, plate HX, mixing pump)

### [ ] ИТП schemes integration
- Politerm 49 schemes — apply to consumer node
- Auto-compute mixing coefficient, elevator throat
- ИТП Excel template export (per Mongol/Russian standard form)

---

## 🟢 P2 — Map / UI polish

### [ ] Map overlay UX
- **Map drag bug**: empty-canvas drag still bumpy at high zoom levels
- **Vertical synchronization**: pipes can drift slightly during fast pans
- Building search bar (geocode address → fly map to location)
- Wind / weather overlay (heat-loss compensation)
- Outline / building shadows from OSM `building:levels`

### [ ] Drawing tools (Zulu parity remaining)
- Multi-select (Ctrl+click hover)
- Layers visibility toggle (per-circuit on/off)
- Snap to existing nodes / pipe centerlines
- Mirror / rotate selected objects
- Undo/Redo (full history stack)

### [ ] Animations
- Pipe flow direction → arrow heads moving along stroke
- Pressure wave propagation simulation (for transient analysis)
- Heat color gradient along pipe (supply vs return)

---

## 🔵 P3 — Documentation + outreach

### [ ] Documentation
- User guide (Mongolian + English) — `docs/user-guide/`
- Engineering tutorial: "Бэрхшээлтэй сүлжээ загварлах"
  - Бодит CAD зургаас сvлжээ үүсгэх
  - DXF/DWG импорт + тооцоо
- API documentation (OpenAPI 3.1 spec already exists, generate site)
- BIM integration tutorial (Revit / Tekla)

### [ ] Marketing site
- Landing page redesign (Atelier blueprint theme)
- "Why Hydra Calc vs Zulu Thermo" comparison page
- Pricing tier (Free / Pro / Enterprise) — TBD
- Case studies (Darkhan TPP simulation, etc)

### [ ] Educational content
- 5-min YouTube intro
- Step-by-step tutorial videos (10-15 ширхэг)
- Telegram канал: монгол engineering tips
- LinkedIn pages

---

## 🟣 P4 — Эл боломжтой fancy

### [ ] AI features
- "Suggest optimal DN" (constructive mode auto-recommend)
- "Diagnose violations" — natural-language explanation in Mongolian
- Voice commands (Web Speech API mn-MN) — "Тооцоолох", "Эх үүсвэр нэмэх"
- Generated documentation (export → Word/PDF technical report)

### [ ] Mobile / offline
- PWA install
- Read-only mobile viewer (site visit-д хэрэглэх)
- IndexedDB sync (offline edit, sync when online)

### [ ] Integrations
- Telegram bot (notification on share, calc finished)
- WhatsApp share button (engineering team chat)
- Outlook email Quote из BoM
- Microsoft Teams webhook

---

## ⚪ Backlog ideas (date entered)

- 2026-04-25: 3D pipe visualization (Three.js, pseudo-DEM)
- 2026-04-26: Climate data integration (NOAA / Mongol Meteorological Office)
- 2026-04-28: Дархан хотын full schematic (slideshare 92.2km network)
- 2026-04-29: Real-time SCADA integration (МНОЭСХ Modbus)
- 2026-04-30: Carbon footprint calculator (kg CO₂ per kWh of heat)
- 2026-05-12: Engineering paper publication (compare vs Zulu output)

---

## 🐛 Known bugs

| # | Description | Component | Severity |
|---|-------------|-----------|----------|
| 1 | Bayangol DXF + auto-fit → screenshot timeout (247 nodes anim heavy) | SchemeEditor render | low |
| 2 | OSM Overpass occasionally times out (rate limit) | pickBuildingFromOsm | medium — добавить retry |
| 3 | Pipe label "DN50 · 16м" overlaps node when nodes are very close | pipe rendering | low |
| 4 | Building polygon vertex with `lat/lon === undefined` falls back to rigid translate (already handled but should be explicit) | footprint render | low |

---

## 📌 Сүүлийн session шинэчлэгдсэн

**2026-05-12 (this session)**:
- ✅ Map overlay drawing fix (mapAnchored toggle removed from displayPos)
- ✅ Grid hide on map (better readability)
- ✅ Map opacity 0.85 → 1.0
- ✅ Building scales to map mPerPx via 1km delta
- ✅ OSM Overpass API integration (auto-fetch 150m radius)
- ✅ Per-vertex lat/lon on building polygons
- ✅ React infinite loop fixed (stable useCallback)
- ✅ GitHub repo created: https://github.com/Mandakha1/hydra-calc

Дараагийн session-д үргэлжилэх ёстой:
- Pressure regime (P_мин = 0 fix)
- Auto-save для authenticated projects
- Excel export improvements
