# VEX Central de Gestão

Sistema interno de gestão da VEX Growth — clientes, colaboradores, demandas,
calendário, CRM de WhatsApp, financeiro e auditoria.

Produção: **https://central.vexgrowth.com.br**

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16 (App Router, `output: standalone`), React 19 |
| Estilo | Tailwind CSS 4, lucide-react, Plus Jakarta Sans |
| Banco | PostgreSQL 16 via Prisma 5 (migrations versionadas) |
| Autenticação | NextAuth v5 — Credentials + bcrypt, sessão JWT |
| WhatsApp | UAZAPI (CRM e notificações de demandas) |
| Infra | Docker Swarm + Traefik + GHCR + GitHub Actions |

## Módulos

| Rota | Descrição | Acesso |
|---|---|---|
| `/dashboard` | Indicadores gerais | Todos |
| `/clientes` | Contratos, serviços, cofre de credenciais, pagamentos | Todos (exclusão: ADMIN) |
| `/colaboradores` | Equipe, cargos, salários | Todos (salário e edição: ADMIN) |
| `/demandas` | Kanban de tarefas, comentários e anexos | Todos (exclusão: ADMIN ou autor) |
| `/calendario` | Entregas e eventos | Todos |
| `/crm` | Inbox de WhatsApp | Todos (configuração: ADMIN) |
| `/financeiro` | Receita, custos, folha, lucro | **ADMIN** |
| `/logs` | Trilha de auditoria | **ADMIN** |

## Desenvolvimento local

```bash
npm install
cp .env.example .env        # preencha DATABASE_URL e AUTH_SECRET
docker compose up -d db     # sobe só o Postgres
npm run db:migrate          # aplica as migrations
npm run db:seed             # admin@vex.com / admin123
npm run dev
```

Ou tudo em containers: `docker compose up --build`.

### Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento (turbopack) |
| `npm run build` | Build de produção |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Cria/aplica migrations em desenvolvimento |
| `npm run db:deploy` | Aplica migrations pendentes (usado em produção) |
| `npm run db:seed` | Popula dados de exemplo |
| `npm run db:studio` | Prisma Studio |

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | sim | String de conexão do PostgreSQL |
| `AUTH_SECRET` | sim | Segredo de sessão do NextAuth |
| `NEXTAUTH_URL` | produção | URL pública, usada no registro do webhook |
| `CREDENTIALS_SECRET` | não | Chave AES das credenciais de clientes. **Fallback: `AUTH_SECRET`.** Se mudar, as senhas já cifradas ficam ilegíveis |
| `CRM_WEBHOOK_SECRET` | não | Token do webhook do CRM. Sem ele, é derivado do `AUTH_SECRET` |
| `UAZAPI_URL` / `UAZAPI_TOKEN` | não | Fallback da UAZAPI; o normal é configurar pela tela do CRM |

## Migrations

O schema é versionado em `prisma/migrations/`. Para alterar o banco:

```bash
# edite prisma/schema.prisma, depois:
npm run db:migrate -- --name descricao_da_mudanca
git add prisma/migrations
```

Em produção o `entrypoint.sh` roda `prisma migrate deploy` no boot do container.
Se o banco tiver tabelas mas nenhum histórico de migrations (caso do banco
original, criado com `db push`), o entrypoint faz o *baselining* automático
registrando `0_init` como já aplicada — sem executar DDL e sem tocar nos dados.

> Nunca use `prisma db push` em produção. Era o que rodava antes, com
> `--accept-data-loss`, e qualquer mudança destrutiva no schema apagava dados
> sem revisão.

## Deploy

Push em `main` dispara `.github/workflows/deploy.yml`:

```
push main
  │
  ├─ job "quality"  → npm ci → prisma generate → typecheck → lint
  │
  └─ job "deploy"   (só roda se quality passar)
       ├─ build da imagem Docker (multi-stage)
       ├─ push para ghcr.io/deefy1v9/vexcentraldegestao:latest e :<sha>
       ├─ scp docker-compose.app.yml → /opt/vex/ no servidor
       └─ ssh → docker stack deploy vex
```

No boot, o container aplica as migrations e só então sobe o Next.js.
O healthcheck (`/api/health`, em Node puro — a imagem slim não tem curl)
garante que o Traefik só roteie tráfego depois que o servidor estiver de pé.

### Secrets do GitHub

| Secret | Uso |
|---|---|
| `SERVER_HOST` | IP/host do servidor |
| `SERVER_SSH_KEY` | Chave privada de deploy |
| `GHCR_PAT` | Login do servidor no GHCR |
| `DB_PASSWORD` | Senha do Postgres |
| `AUTH_SECRET` | Segredo do NextAuth |
| `CREDENTIALS_SECRET` | Opcional; sem ele usa o `AUTH_SECRET` |

### Serviços da stack `vex`

| Serviço | Função |
|---|---|
| `app` | Next.js, atrás do Traefik |
| `db` | PostgreSQL 16 (volume `vex-postgres-data`) |
| `db-backup` | `pg_dump` diário em `vex-db-backups`, retenção de 7 dias |

Anexos de demandas ficam no volume `vex-uploads`, montado em
`/app/public/uploads`.

Restaurar um backup:

```bash
docker exec -it $(docker ps -qf name=vex_db-backup) ls /backups
docker exec -it $(docker ps -qf name=vex_db) \
  pg_restore -U vex -d vex_gestao -c /backups/vex_gestao-AAAAMMDD-HHMMSS.dump
```

### ⚠️ O servidor é compartilhado

O host de produção roda outros projetos que **não são deste repositório**.
O Traefik ativo é o container `n8n-traefik-1` (da stack do n8n), com cert
resolver `mytlschallenge` e rede `traefik-public`.

Nunca aplique `docker-compose.infra.yml` — ele é referência histórica e subiria
um segundo Traefik, derrubando os outros projetos. Ajustes de roteamento vão
nas labels do serviço `app` em `docker-compose.app.yml`.
