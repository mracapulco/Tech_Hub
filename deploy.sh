#!/usr/bin/env bash
# Tech Hub — script de deploy em produção.
# Sempre atualiza para o último commit de origin/main antes de reconstruir os containers.
#
# Uso: ./deploy.sh   (rodar na raiz do projeto, no servidor de produção)
#
# O que ele faz, nesta ordem:
#   1. Confere pré-requisitos (docker, docker-compose.prod.yml, JWT_SECRET/CONFIG_MASTER_KEY no .env)
#   2. Recusa continuar se houver alterações locais não commitadas, ou se não estiver na branch main
#   3. git fetch + pull de origin/main — se o próprio script mudou, reinicia já com a versão nova
#   4. Backup do banco (pg_dump) antes de mexer em qualquer container
#   5. Reconstrói e sobe api + web
#   6. Espera a API sinalizar que subiu com sucesso (falha alto se não subir)
#   7. Aplica o schema do banco (prisma db push — aditivo, não apaga dados existentes)

set -euo pipefail
cd "$(dirname "$0")"

COMPOSE_FILE="docker-compose.prod.yml"
BACKUP_DIR="backups"
BACKUP_KEEP=10
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
LOG_FILE="deploy_${TIMESTAMP}.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

fail() {
  log "ERRO: $*"
  exit 1
}

log "==== Iniciando deploy Tech Hub ===="

# --- 1. Pré-requisitos ---
command -v docker >/dev/null 2>&1 || fail "docker não encontrado no PATH"
docker compose version >/dev/null 2>&1 || fail "plugin 'docker compose' não encontrado"
[ -f "$COMPOSE_FILE" ] || fail "$COMPOSE_FILE não encontrado — rode este script na raiz do projeto"
[ -f .env ] || fail "arquivo .env não encontrado — configure JWT_SECRET e CONFIG_MASTER_KEY antes de continuar"

check_env_var() {
  local name="$1"; shift
  local value
  value="$(grep -E "^${name}=" .env | tail -1 | cut -d'=' -f2- || true)"
  [ -n "${value:-}" ] || fail "$name não está definido no .env"
  for placeholder in "$@"; do
    [ "$value" != "$placeholder" ] || fail "$name ainda está com o valor de teste ('$placeholder') — defina um valor real (ex.: openssl rand -hex 32) antes de rodar o deploy"
  done
}
check_env_var "JWT_SECRET" "dev-secret" "dev_secret_change_me"
check_env_var "CONFIG_MASTER_KEY" "dev_master_key_change_me"

# --- 2. Estado do git tem que estar limpo, na main ---
[ -z "$(git status --porcelain --untracked-files=no)" ] || fail "há alterações locais não commitadas em arquivos rastreados pelo Git — resolva (git status) antes de rodar o deploy"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$CURRENT_BRANCH" = "main" ] || fail "branch atual é '$CURRENT_BRANCH', esperado 'main'"

# --- 3. Atualizar a partir do GitHub (com auto-restart se o próprio script mudar) ---
SCRIPT_PATH="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
SCRIPT_HASH_BEFORE="$(md5sum "$SCRIPT_PATH" | cut -d' ' -f1)"
BEFORE_COMMIT="$(git rev-parse --short HEAD)"

log "Buscando atualizações do GitHub..."
git fetch origin --tags || fail "falha no git fetch"
git pull origin main || fail "falha no git pull"

SCRIPT_HASH_AFTER="$(md5sum "$SCRIPT_PATH" | cut -d' ' -f1)"
if [ "$SCRIPT_HASH_BEFORE" != "$SCRIPT_HASH_AFTER" ]; then
  log "O próprio deploy.sh foi atualizado — reiniciando já com a versão nova."
  exec bash "$SCRIPT_PATH"
fi

AFTER_COMMIT="$(git rev-parse --short HEAD)"
if [ "$BEFORE_COMMIT" = "$AFTER_COMMIT" ]; then
  log "Já estava atualizado ($AFTER_COMMIT) — sem novos commits. Seguindo mesmo assim para garantir que os containers estejam no ar."
else
  log "Código atualizado: $BEFORE_COMMIT -> $AFTER_COMMIT"
fi

# --- 4. Backup do banco (antes de tocar nos containers) ---
mkdir -p "$BACKUP_DIR"
if docker ps --format '{{.Names}}' | grep -qx "techhub-db"; then
  BACKUP_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.sql"
  log "Fazendo backup do banco em $BACKUP_FILE..."
  docker exec techhub-db pg_dump -U techhub techhub > "$BACKUP_FILE" || fail "falha ao gerar backup do banco"
  [ -s "$BACKUP_FILE" ] || fail "backup gerado está vazio — abortando sem tocar nos containers"
  log "Backup ok ($(du -h "$BACKUP_FILE" | cut -f1))"
  # mantém só os últimos $BACKUP_KEEP backups
  ls -1t "${BACKUP_DIR}"/backup_*.sql 2>/dev/null | tail -n +$((BACKUP_KEEP + 1)) | xargs -r rm -f
else
  log "AVISO: container techhub-db não está rodando ainda — pulando backup (provável primeiro deploy)."
fi

# --- 5. Build e subida dos containers ---
log "Reconstruindo e subindo containers..."
docker compose -f "$COMPOSE_FILE" up -d --build api web || fail "falha ao subir os containers"

# --- 6. Esperar a API sinalizar que subiu corretamente ---
log "Aguardando a API inicializar..."
API_OK=false
for _ in $(seq 1 30); do
  RECENT_LOGS="$(docker compose -f "$COMPOSE_FILE" logs api --tail 50 2>&1)"
  if echo "$RECENT_LOGS" | grep -q "Nest application successfully started"; then
    API_OK=true
    break
  fi
  if echo "$RECENT_LOGS" | grep -q "JWT_SECRET não está definido"; then
    fail "a API não subiu: JWT_SECRET não está definido corretamente no container"
  fi
  sleep 2
done
[ "$API_OK" = true ] || fail "a API não sinalizou início bem-sucedido a tempo — veja: docker compose -f $COMPOSE_FILE logs api"
log "API no ar."

# --- 7. Aplicar schema do banco (aditivo — cria tabelas/colunas novas, não apaga nada existente) ---
log "Aplicando schema do banco (prisma db push)..."
docker exec techhub-api npx prisma db push --skip-generate || fail "falha ao aplicar o schema no banco"

log "==== Deploy concluído com sucesso: ${BEFORE_COMMIT} -> ${AFTER_COMMIT} ===="
