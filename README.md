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

## Próximos passos

- Configurar Prisma e migrations
- Implementar autenticação (JWT/sessões) e RBAC por empresa
- Ajustar CI/CD (GitHub Actions)