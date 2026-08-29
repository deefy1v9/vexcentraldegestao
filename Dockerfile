FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Geracao de documentos (propostas): pdfkit e docx precisam da arvore de
# dependencias COMPLETA em runtime — o tracing do Next copia so o que enxerga
# estaticamente e deixa de fora arquivos exigidos em tempo de execucao
# (metricas .afm, @noble/hashes, restructure...). Instalados a parte para a
# imagem final continuar enxuta.
FROM base AS docdeps
WORKDIR /docdeps
RUN npm init -y > /dev/null && npm install --omit=dev --no-audit --no-fund pdfkit@0.20.1 docx@9.7.1

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends dumb-init openssl && rm -rf /var/lib/apt/lists/*
RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 --gid nodejs nextjs

# `public` precisa pertencer ao usuario nextjs: os anexos de demandas sao
# gravados em public/uploads/tasks/<id> em tempo de execucao. Sem o --chown
# o diretorio ficava root:root e todo upload falhava com EACCES.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
# Arvore completa do pdfkit/docx sobre o que o tracing ja copiou
COPY --from=docdeps --chown=nextjs:nodejs /docdeps/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --chown=nextjs:nodejs entrypoint.sh ./entrypoint.sh

# Ponto de montagem do volume de uploads. Criar aqui, ja com o dono correto,
# faz o Docker herdar essa permissao ao inicializar o volume nomeado.
RUN mkdir -p ./public/uploads && chown -R nextjs:nodejs ./public
RUN chmod +x ./entrypoint.sh
USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "./entrypoint.sh"]
