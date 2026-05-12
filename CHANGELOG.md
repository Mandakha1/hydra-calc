# Changelog

## [0.1.0] — 2026-04-24

Шинэ бүтээгдэхүүн — олон хэрэглэгчтэй SaaS платформ.

### Faza 0 — Monorepo scaffold
- pnpm workspaces: `apps/backend`, `apps/frontend`, `packages/shared`
- TypeScript 5.6, Prettier, ESLint, Vitest тохиргоо бүрдсэн.
- `.env.example` бүх хувьсагчийг comment-той.

### Faza 1 — Database
- PostgreSQL 16, Drizzle ORM 0.33.
- 5 table: `users`, `projects`, `shares`, `sessions`, `audit_log`.
- `0000_initial.sql` migration + `pnpm db:push` + `pnpm seed:admin`.

### Faza 2 — Backend API
- Fastify 4 + @fastify/{jwt,cookie,cors,helmet,rate-limit,sensible}.
- Auth: bcrypt(12), JWT 15мин access, opaque refresh (ротаци), docker secrets support.
- Route: register/login/refresh/logout/me, projects CRUD, share tokens, read-only /shared/:token, admin stats, health.
- Rate limit per-route (register 3/m, login 5/m, global 100/m).
- Vitest + supertest integration suite (auth.test.ts, hydraulics.test.ts).

### Faza 3 — Frontend
- Vite 5 + React 18 + react-router 6 + zustand persist.
- Pages: Home (hero, features, workflow, formulas, testimonials, pricing, FAQ, CTA), Login, Register, ForgotPassword, Dashboard, HydraulicApp, SharedView, NotFound, About, Pricing, Docs.
- Layout: Navbar, Footer, ProtectedRoute.
- Dark theme (#0b1117 + #5ba4cf accent) reduced-motion respected.

### Faza 4 — Hydraulic calculator (эргонометрик инженерийн гол хэсэг)
- **calc/hydraulics.ts**: Darcy-Weisbach + Colebrook-White 50-итерaц 1e-8 tolerance (Swamee-Jain initial guess, Hagen-Poiseuille for laminar). Pipe flow, node pressure, pump duty sizing.
- **calc/heatLoad.ts**: БНбД 23-02-09 дагуу Q_transmission + Q_infiltration − Q_internal_gains. Orientation β, corner, ground-floor corrections.
- **calc/normCheck.ts**: СП 124.13330.2012 норм — v≤3.5 m/s, R≤80 Pa/m, Δp_consumer≥0.15 MPa, temp vs material limits.
- **export/excelExport.ts**: xlsx дэмжлэг — Тойм, Зангилаа, Хоолой, Норм, Сортамент, Лавлах sheet кириллээр.
- **export/dxfExport.ts**: DXF R14 — PIPES, NODES, TEXT 3 слой, AutoCAD 2000+ нийцтэй, Y-axis эргэсэн.
- **panels/**: SchemeEditor (SVG drag-drop, pan/zoom/keyboard), InspectorPanel (envelope builder), ResultsPanel, SettingsPanel.
- ErrorBoundary /app/* route хамгаалсан.
- storage.ts — `window.storage` compat layer → REST `/api/projects`.

### Faza 5 — Docker
- `apps/backend/Dockerfile` (pnpm deploy, node:20-alpine, ARM64).
- `apps/frontend/Dockerfile` (Vite build + nginx:alpine static).
- `apps/frontend/nginx.conf` SPA fallback, Vite asset cache policy, gzip.
- `deploy/docker-compose.yml` — 4 service (postgres, api, web, caddy), docker secrets, healthchecks.

### Faza 6 — Oracle cloud-init
- `deploy/cloud-init.yaml` — ARM64 Ubuntu 22.04 initial bootstrap.
- docker, ufw, fail2ban, unattended-upgrades, iptables punch-through (Oracle's default INPUT chain blocks 80/443).
- DEPLOY.md algorithm: provision → iptables → compose up → DNS → migrate.

### Faza 7 — Caddy edge
- `deploy/Caddyfile` — Let's Encrypt, zstd/gzip, HSTS preload, CSP tuned for OpenStreetMap + SheetJS, access log JSON roll.
- `www → @` permanent redirect.
- HTTP/3 оруулсан (UDP/443 хаагдсан бол per-host `protocols h1 h2` comment-тай).

### Faza 8 — Ops + docs
- `deploy/backup.sh` — pg_dump -Fc, 14-өдрийн retention, OCI Object Storage optional.
- `deploy/restore.sh` — interactive confirm, drop+recreate+pg_restore.
- `OPENAPI.yaml` — бүх endpoint тайлбарлагдсан.
- README.md, DEPLOY.md эцэслэсэн.

### Research (shared/*.ts тогтмолууд)
- БНбД 41-01-2019 / СП 124.13330.2012 — `hydraulicConstants.ts`: WATER_PROPS, PIPE_MATERIALS (6), NORM_THRESHOLDS, TEMP_SCHEDULES (5), LOCAL_RESISTANCE, NETWORK_TYPES, PIPE_DB (steel 17, PPR 9, PE-HD 12), PIPE_PRICES_MNT_PER_M, TYPICAL_PUMPS, WELL_EQUIPMENT.
- БНбД 23-02-09 / СП 50.13330 — `buildingConstants.ts`: CLIMATE (20 аймаг), WALL_TYPES (14), GLAZING (5), CORRECTION_FACTORS, ACH_BY_USE, INDOOR_TEMP_BY_USE, AIR_PROPS, INTERNAL_GAINS_W_PER_M2.

### Стандартын холбоос
- [СП 124.13330.2012 бүрэн эх (cntd.ru)](https://docs.cntd.ru/document/1200095545)
- [БНбД 23-02-09 (legalinfo.mn)](https://legalinfo.mn/mn/detail?lawId=211242)
- [ГОСТ 10704-91 сортамент (stroyinf.ru)](https://files.stroyinf.ru/Data2/1/4294852/4294852689.pdf)
- [Монгол барилгын норм, дүрмийн цахим сан (mcis.gov.mn)](https://mcis.gov.mn/mn/norm)
