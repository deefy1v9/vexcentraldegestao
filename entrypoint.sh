#!/bin/sh
set -e

# O swarm ignora depends_on — o banco pode ainda não estar pronto.
# Tenta o db push com retry até o banco aceitar conexões.
echo "Running Prisma db push..."
# --accept-data-loss: necessário para o Prisma aplicar mudanças que ele
# classifica como potencialmente destrutivas (ex.: adicionar @unique a uma
# coluna existente, dropar colunas). Cada nova schema potencialmente
# destrutiva deve ser revisada manualmente antes do deploy.
i=1
until node node_modules/prisma/build/index.js db push --schema=./prisma/schema.prisma --accept-data-loss; do
  if [ "$i" -ge 10 ]; then
    echo "Database unreachable after $i attempts, giving up."
    exit 1
  fi
  echo "Database not ready (attempt $i/10), retrying in 3s..."
  i=$((i + 1))
  sleep 3
done

echo "Starting server..."
exec node server.js
