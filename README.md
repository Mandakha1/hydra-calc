# Hydra Calc

Монгол хэрэглэгчидэд зориулсан дулаан хангамжийн сүлжээний гидравлик тооцоолуур SaaS —
Oracle Always Free tier дээр бэлэн ажиллахуйц, олон хэрэглэгчтэй, HTTPS-тэй, домайнтай.

Стандарт: **МНС 4217**, **БНбД 41-01-2019**, **БНбД 23-02-09**, СП 124.13330.2012.

## Онцлог

- 🔗 SVG canvas дээр drag-and-drop схем үүсгэлт (pan/zoom/keyboard shortcut)
- 🏠 Дулаан ачаалал — Монголын 20 аймгийн уур амьсгал + 14 төрлийн хана + цонх
- 📐 Darcy–Weisbach + Colebrook–White 50-иттерaцтай гидравлик (1e-8 tolerance)
- ⚙️ Насос авто-сонголт (H, Q, чадал)
- 🧱 3 материалын бүрэн сортамент: Ган (ГОСТ 10704-91), PPR (ГОСТ 32415), PE-HD (ГОСТ 18599)
- 📊 Excel + DXF (AutoCAD R14) экспорт — 6 sheet, 3 слой
- ✅ Норм шалгалт: v ≤ 3.5 м/с, R ≤ 80 Pa/м, Δp_consumer ≥ 0.15 MPa
- 🔗 Share link — read-only, expire-тэй
- 🌓 Dark theme, `prefers-reduced-motion` дэмжсэн

## Monorepo

```
apps/backend     Fastify 4 + Drizzle ORM + PostgreSQL 16
apps/frontend    React 18 + Vite 5 + zustand + react-router 6
packages/shared  Domain types, constants, Zod schemas, i18n (Mongolian)
deploy/          Docker, Caddy, cloud-init, backup/restore
```

## Local development

Prerequisites: Node ≥ 20, pnpm ≥ 9, Docker (postgres only).

```bash
pnpm install
cp .env.example .env                              # DOMAIN, JWT_SECRET etc.
docker compose -f deploy/docker-compose.yml up -d postgres
pnpm db:push                                      # Drizzle schema → DB
pnpm seed:admin                                   # ADMIN_BOOTSTRAP_* → admin user
pnpm dev                                          # api on :3000 + web on :5173
```

> `JWT_SECRET`-ийг үүсгэх: `openssl rand -base64 48`

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev`       | Бүх workspace зэрэг (api + web) |
| `pnpm build`     | Бүх workspace бүтээх |
| `pnpm test`      | Vitest (backend integration + hydraulics parity) |
| `pnpm lint`      | ESLint бүх workspace-т |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm db:push`   | Drizzle schema → DB (dev) |
| `pnpm db:studio` | Drizzle Studio GUI |
| `pnpm db:migrate`| Production migration runner |

## Production deploy

Oracle Always Free (Ampere A1 / 4 OCPU / 24 GB RAM) дээр:

```bash
ssh ubuntu@<oracle-ip>
cd /opt/hydra-calc && git clone <your-repo> .
mkdir -p deploy/secrets
openssl rand -base64 32 > deploy/secrets/pg_password.txt
openssl rand -base64 48 > deploy/secrets/jwt_secret.txt
chmod 600 deploy/secrets/*.txt
cp .env.example .env           # DOMAIN + ADMIN_EMAIL + ADMIN_BOOTSTRAP_*
cd deploy && docker compose up -d
```

Дэлгэрэнгүй: [DEPLOY.md](./DEPLOY.md).

## Тестийн хяналт (Faza 8)

- [ ] `https://<domain>` — SSL padlock ногоон
- [ ] Register → new account → auto-login → `/app`
- [ ] `/app/new` — схем зур → Тооцоолох → хадгалсан
- [ ] Excel/DXF татах
- [ ] Share button → `/shared/<token>` read-only
- [ ] Mobile (iOS Safari, Android Chrome) touch/pinch
- [ ] `curl /api/health` → `{"ok":true,"db":"up"}`
- [ ] 6 дахь login оролдлого → 429
- [ ] pg_dump backup + restore тестлэсэн

## Стандартууд (source)

- [СП 124.13330.2012 "Тепловые сети"](https://docs.cntd.ru/document/1200095545)
- [БНбД 23-02-09 "Барилгын дулаан хамгаалалт"](https://legalinfo.mn/mn/detail?lawId=211242)
- [Монгол барилгын норм & дүрмийн сан](https://mcis.gov.mn/mn/norm)
- [ГОСТ 10704-91 (steel pipe sortament)](https://files.stroyinf.ru/Data2/1/4294852/4294852689.pdf)
- [ГОСТ 32415-2013 (PPR)](https://docs.cntd.ru/document/1200107330)
- [ГОСТ 18599-2001 (PE-HD)](https://docs.cntd.ru/document/1200025380)

## License

Proprietary — © 2026 Tsede.
