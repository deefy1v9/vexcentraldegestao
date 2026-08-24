#!/bin/sh
set -e

# Migrations versionadas (prisma/migrations). Substitui o antigo
# `db push --accept-data-loss`, que reaplicava o schema a cada boot com
# autorização para dropar colunas — qualquer mudança destrutiva no schema
# apagava dados de produção sem revisão.
PRISMA="node node_modules/prisma/build/index.js"
SCHEMA="./prisma/schema.prisma"
BASELINE="0_init"
LOG=/tmp/prisma-migrate.log
baselined=0

echo "Applying database migrations..."
i=1
while true; do
  if $PRISMA migrate deploy --schema="$SCHEMA" > "$LOG" 2>&1; then
    cat "$LOG"
    break
  fi
  cat "$LOG"

  # P3005: o banco já tem as tabelas mas nunca foi versionado (foi criado
  # com `db push`). Registra a migration inicial como já aplicada
  # — baselining — sem executar nenhum DDL e sem tocar nos dados.
  if [ "$baselined" = "0" ] && grep -q "P3005" "$LOG"; then
    echo "Banco pré-existente detectado: registrando baseline $BASELINE..."
    $PRISMA migrate resolve --applied "$BASELINE" --schema="$SCHEMA"
    baselined=1
    continue
  fi

  # O swarm ignora depends_on: o banco pode ainda não aceitar conexões (P1001).
  if [ "$i" -ge 10 ]; then
    echo "Migrations falharam após $i tentativas, abortando."
    exit 1
  fi
  echo "Banco indisponível ou migration falhou (tentativa $i/10), nova tentativa em 3s..."
  i=$((i + 1))
  sleep 3
done

echo "Starting server..."
exec node server.js
