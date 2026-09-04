# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Tech Hub — plataforma modular de gestão técnica multi-empresa (MSP): inventário, IPAM/redes, backup (Veeam), licenciamento (Firewall/Microsoft), integrações (GLPI, Zabbix, AD FS), maturidade de segurança.

Monorepo com npm workspaces:
- `apps/web` — Next.js 14 (App Router), TypeScript, Tailwind
- `apps/api` — NestJS 10, TypeScript, Prisma + PostgreSQL

## Commands

Development (local, outside containers):
```
npm run dev:web     # Next.js dev server on :3000
npm run dev:api     # Nest API via ts-node on :3000 (mapped to :4000 in Docker)
```

Build:
```
npm run build:web
npm run build:api
```

Prisma (run from `apps/api`, or via root scripts if added):
```
npm run prisma:generate --prefix apps/api
npm run prisma:push --prefix apps/api      # db push (no migration files in use)
npm run prisma:seed --prefix apps/api
```

Docker (primary dev workflow — see `README.md`):
```
docker compose up -d --build web           # frontend only
docker compose up -d --build               # full stack: db, api, web
```
Web: http://localhost:3000 · API: http://localhost:4000

Production uses `docker-compose.prod.yml` (separate from the dev `docker-compose.yml`); deploy to the production server is manual (SSH + `docker compose`), not automated via CI.

There are no test or lint scripts configured in either workspace currently.

## Architecture

### Backend (`apps/api`)
NestJS app (`src/main.ts` → `AppModule`), one feature module per domain, each typically with `*.module.ts` / `*.controller.ts` / `*.service.ts`. Domains registered in `src/app.module.ts`:
- `auth`, `users`, `companies` — auth (JWT via `@nestjs/jwt`, bcrypt password check in `auth/auth.service.ts`) and multi-company/user model
- `device-types`, `brands`, `devices`, `settings` — device catalog and per-company settings
- `ipam`, `sites`, `vlans` — IP address management (subnets/addresses), sites, VLANs
- `licensing/firewall`, `licensing/microsoft` — license tracking (Microsoft has its own distributor/agreement/sync sub-domain)
- `backup` — Veeam-oriented backup jobs/runs/repositories/timeline (`backup/veeam-*.ts`)
- `inventory` — asset/software inventory, license entitlements/allocations, reconciliation, AI suggestions
- `adfs` — Active Directory Federation Services project/OU/group/GPO planning
- `integrations/glpi`, `integrations/zabbix` — external system integrations
- `maturity` — security maturity assessments, with an AI-assisted service (`maturity.ai.service.ts`, uses `openai`)
- `uploads` — file uploads, served statically via `ServeStaticModule` at `/uploads`

Data access is via a single `PrismaService` (`src/prisma.service.ts`) injected into services — no repository layer. `prisma/schema.prisma` is the source of truth for the data model (60+ models grouped by the domains above).

### Frontend (`apps/web`)
Next.js App Router under `src/app/(app)/...`, routes organized by domain to mirror the API (`configuracoes/`, `seguranca/`, `ipam/`, `licenciamento/`, `gestao/backup/`, etc.), all in Portuguese.

API calls do **not** hit the NestJS API directly from the browser. `src/app/api/[...path]/route.ts` is a catch-all Next.js route that proxies any `/api/*` request server-side to `INTERNAL_API_URL` (defaults to `http://api:3000`, i.e. the Docker service name) — this is what lets the browser only ever talk to the Next.js origin. Client code calls this proxy via the helpers in `src/lib/api.ts` (`apiGet`/`apiPost`/`apiPut`/`apiDelete`/`apiUpload`), which prefix `/api` and attach `Authorization: Bearer <token>`.

Auth state is a JWT + user object kept in `localStorage` (`src/lib/auth.ts`: `setAuth`/`getToken`/`getUser`/`clearAuth`) — there is no server session/cookie.

### Env vars
No `.env.example` currently exists (README references one that isn't in the repo). Known vars from `.env` / `docker-compose.prod.yml`: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_GLOBAL_ADMINS`, `GLOBAL_ADMINS`, `CONFIG_MASTER_KEY`, `JWT_SECRET`, `OPENAI_TIMEOUT_MS`, `OPENAI_MAX_TOKENS`, `GLPI_OAUTH_CALLBACK_URL`, `TECH_HUB_FRONTEND_URL`.

## Git workflow

From `README.md`:
- `main` — stable, releases come from here; `develop` — integration branch for features.
- Feature branches: `feature/<nome>` off `develop`; PR `feature/*` → `develop`, then `develop` → `main` when stable.
- Semver tags `vMAJOR.MINOR.PATCH` (`git tag vX.Y.Z && git push origin vX.Y.Z`).
- Commit convention: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`.
- Pushing a `v*` tag triggers `.github/workflows/release.yml`, which extracts the matching `## [X.Y.Z]` section from `CHANGELOG.md` and publishes it as the GitHub Release body — keep `CHANGELOG.md` entries in that format ahead of tagging.
