# Tech Hub

Plataforma modular para gestão técnica multi-empresa, com frontend Next.js e backend NestJS, ambos containerizados via Docker Compose e banco PostgreSQL.

## Estrutura

- `apps/web`: Frontend Next.js (TypeScript, Tailwind)
- `apps/api`: Backend NestJS (TypeScript)
- `docker-compose.yml`: Orquestra `db` (Postgres), `api` e `web`

## Pré-requisitos

- Docker Desktop (com Docker Compose) instalado

## Primeiros passos

1. Crie seu `.env` baseado em `.env.example` (opcional para dev):

```bash
cp .env.example .env
```

2. Suba apenas o frontend para testar a estrutura (não depende da API):

```bash
docker compose up -d --build web
```

Abrir: http://localhost:3000

3. Subir toda a stack (db, api e web):

```bash
docker compose up -d --build
```

API: http://localhost:4000  |  Web: http://localhost:3000

## Scripts úteis (via npm workspaces)

- `npm run dev:web` — roda o Next em dev local (fora dos contêineres)
- `npm run dev:api` — roda a API Nest em dev local (fora dos contêineres)

> Observação: como o ambiente local não tem `npm` disponível no momento, recomenda-se utilizar os contêineres para desenvolvimento e testes.

## Fluxo de versionamento

- Branches principais:
  - `main`: estável; releases saem daqui.
  - `develop`: integração contínua das features antes de irem para `main`.
- Branches de feature: `feature/<nome-da-feature>` criadas a partir de `develop`.
- Pull Requests:
  - Abra PRs de `feature/*` → `develop`.
  - Quando `develop` estiver estável, abra PR de `develop` → `main`.
- Versionamento semântico e tags:
  - `vMAJOR.MINOR.PATCH` (ex.: `v1.0.0`).
  - Criar tag: `git tag v1.0.0 && git push origin v1.0.0`.
- Convenção de commits (recomendado):
  - `feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`, `refactor: ...`.

## Proteções de branch

- Em contas gratuitas, proteções avançadas em repositórios privados podem exigir GitHub Pro.
- Alternativas:
  - Manter privado e seguir as regras acima por convenção (PRs e revisões).
  - Tornar o repositório público ou atualizar para GitHub Pro para habilitar proteções via GitHub.

## Próximos passos

- Configurar Prisma e migrations
- Implementar autenticação (JWT/sessões) e RBAC por empresa
- Ajustar CI/CD (GitHub Actions)