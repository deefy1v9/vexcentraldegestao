-- Migração de dados: transfere o valor mensal manual do contrato do cliente
-- para os serviços contratados, que passam a ser a fonte da verdade.
--
-- Idempotente: pode rodar mais de uma vez sem duplicar nada.
-- Executar com: psql -U vex -d vex_gestao -f <este arquivo>

BEGIN;

-- 1) Cliente com exatamente 1 serviço e serviços somando 0:
--    o valor do contrato vira o valor desse serviço.
UPDATE "ClientService" s
SET "monthlyValue" = c."monthlyValue"
FROM "Client" c
WHERE s."clientId" = c.id
  AND c."monthlyValue" IS NOT NULL AND c."monthlyValue" > 0
  AND (SELECT count(*) FROM "ClientService" x WHERE x."clientId" = c.id) = 1
  AND COALESCE((SELECT sum(COALESCE(x."monthlyValue",0)) FROM "ClientService" x WHERE x."clientId" = c.id), 0) = 0;

-- 2) Cliente com 0 ou 2+ serviços, todos sem valor:
--    cria um serviço "Contrato mensal" com o valor do contrato.
--    (id determinístico 'migr_<clientId>' garante idempotência)
INSERT INTO "ClientService" (id, "clientId", "serviceName", description, "monthlyValue", status, "createdAt")
SELECT
  'migr_' || c.id,
  c.id,
  'Contrato mensal',
  'Valor mensal migrado do contrato — distribua entre os serviços reais se desejar.',
  c."monthlyValue",
  'ATIVO',
  now()
FROM "Client" c
WHERE c."monthlyValue" IS NOT NULL AND c."monthlyValue" > 0
  AND (SELECT count(*) FROM "ClientService" x WHERE x."clientId" = c.id) <> 1
  AND COALESCE((SELECT sum(COALESCE(x."monthlyValue",0)) FROM "ClientService" x WHERE x."clientId" = c.id), 0) = 0
ON CONFLICT (id) DO NOTHING;

-- 3) Ressincroniza Client.monthlyValue = soma dos serviços ativos
UPDATE "Client" c
SET "monthlyValue" = COALESCE(sub.total, 0)
FROM (
  SELECT "clientId", sum(COALESCE("monthlyValue",0)) AS total
  FROM "ClientService"
  WHERE status = 'ATIVO'
  GROUP BY "clientId"
) sub
WHERE sub."clientId" = c.id;

COMMIT;

-- Conferência: os dois totais devem bater
SELECT
  (SELECT sum(COALESCE("monthlyValue",0)) FROM "Client" WHERE status='ATIVO') AS total_clientes,
  (SELECT sum(COALESCE(s."monthlyValue",0)) FROM "ClientService" s JOIN "Client" c ON c.id=s."clientId"
    WHERE s.status='ATIVO' AND c.status='ATIVO') AS total_servicos;
