import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { reclassifyAllClients } from '@/lib/client-tier'
import { encryptSecret, decryptSecret } from '@/lib/crypto'
import { SECRET_SETTING_KEYS } from '@/lib/settings'

const ALLOWED_KEYS = [
  'UAZAPI_URL',
  'UAZAPI_TOKEN',
  // Confirmação de cobrança via WhatsApp
  'BILLING_REMINDER_TIME',       // horário do envio diário (HH:mm, padrão 09:00)
  'DEFAULT_RECEIVING_ACCOUNT',   // conta padrão para recebimentos confirmados
  // Faixas da segmentação de clientes (Start ≤ X < Growth ≤ Y < Scale)
  'TIER_START_MAX',
  'TIER_GROWTH_MAX',
  // Importação com IA (a chave nunca é devolvida no GET)
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  // Responsáveis padrão da operação (IDs de usuário)
  'DEFAULT_REVIEWER_ID',
  'DEFAULT_SCHEDULER_ID',
  // SMTP — servidor compartilhado e um usuário/senha por remetente
  // (as senhas são write-only: nunca aparecem no GET)
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE',
  'SMTP_USER', 'SMTP_PASS',                 // remetente financeiro@
  'SMTP_CONTATO_USER', 'SMTP_CONTATO_PASS', // remetente contato@
  'MAIL_FROM_FINANCEIRO', 'MAIL_FROM_CONTATO',
  'FOCUS_CERT_STATUS',
  // Asaas e Focus NFe — tokens são write-only: aceitos no PUT e NUNCA
  // devolvidos no GET (o GET expõe apenas flags de presença)
  'ASAAS_ENV',
  'ASAAS_API_KEY',
  'ASAAS_WEBHOOK_TOKEN',
  'FOCUS_NFE_ENV',
  'FOCUS_NFE_TOKEN_HOMOLOGACAO',
  'FOCUS_NFE_TOKEN_PRODUCAO',
  'FOCUS_NFSE_MODE',
  'FOCUS_WEBHOOK_TOKEN',
  // Assistente de IA do CRM (ANTHROPIC_API_KEY é write-only, como as demais)
  'AI_ENABLED',
  'AI_DRAFTS_ENABLED',
  'AI_COMMAND_NUMBERS',
  'AI_AGENT_MODEL',
  'AI_DRAFT_MODEL',
  'ANTHROPIC_API_KEY',
]

const SECRET_KEYS = new Set([
  'ASAAS_API_KEY', 'ASAAS_WEBHOOK_TOKEN',
  'FOCUS_NFE_TOKEN_HOMOLOGACAO', 'FOCUS_NFE_TOKEN_PRODUCAO', 'FOCUS_WEBHOOK_TOKEN',
  'ANTHROPIC_API_KEY',
  'SMTP_PASS', 'SMTP_CONTATO_PASS',
])

export async function GET() {
  // Expõe o UAZAPI_TOKEN — restrito a administradores.
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  const rows = await prisma.$queryRaw<Array<{ key: string; value: string }>>`
    SELECT key, value FROM "SystemSettings"
    WHERE key IN ('UAZAPI_URL', 'UAZAPI_TOKEN', 'BILLING_REMINDER_TIME', 'DEFAULT_RECEIVING_ACCOUNT',
                  'TIER_START_MAX', 'TIER_GROWTH_MAX',
                  'ASAAS_ENV', 'ASAAS_API_KEY', 'ASAAS_WEBHOOK_TOKEN',
                  'FOCUS_NFE_ENV', 'FOCUS_NFE_TOKEN_HOMOLOGACAO', 'FOCUS_NFE_TOKEN_PRODUCAO',
                  'FOCUS_NFSE_MODE', 'FOCUS_WEBHOOK_TOKEN',
                  'AI_ENABLED', 'AI_DRAFTS_ENABLED', 'AI_COMMAND_NUMBERS',
                  'AI_AGENT_MODEL', 'AI_DRAFT_MODEL', 'ANTHROPIC_API_KEY',
                  'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS',
                  'SMTP_CONTATO_USER', 'SMTP_CONTATO_PASS',
                  'MAIL_FROM_FINANCEIRO', 'MAIL_FROM_CONTATO')
  `

  const result: Record<string, string> = {}
  for (const row of rows) {
    // Segredos das integrações nunca saem em resposta HTTP — só a presença
    if (SECRET_KEYS.has(row.key)) result[`${row.key}_SET`] = row.value ? 'true' : 'false'
    else if (SECRET_SETTING_KEYS.has(row.key)) result[row.key] = decryptSecret(row.value) ?? ''
    else result[row.key] = row.value
  }
  return NextResponse.json(result)
}

export async function PUT(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  const body = await req.json()

  for (const k of ALLOWED_KEYS.filter((key) => body[key] !== undefined)) {
    const raw = String(body[k])
    const isSecret = SECRET_SETTING_KEYS.has(k)

    // Campo de segredo em branco significa "não mexi nele" — o formulário de
    // integrações só exibe se o valor existe, nunca o valor. Gravar o vazio
    // apagaria a chave do Asaas ou da Focus sem ninguém perceber.
    if (isSecret && !raw) continue

    // Segredos de integração cifrados em repouso (AES-256-GCM): dão acesso a
    // dinheiro, emissão fiscal e à caixa de e-mail da agência.
    const stored = isSecret ? (encryptSecret(raw) ?? '') : raw

    await prisma.$executeRaw`
      INSERT INTO "SystemSettings" (key, value, "updatedAt")
      VALUES (${k}, ${stored}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = ${stored}, "updatedAt" = NOW()
    `
  }

  // Faixas alteradas: reclassifica na hora os clientes existentes sem marca
  // manual (os próximos já entram classificados na criação)
  let reclassified = 0
  if (body.TIER_START_MAX !== undefined || body.TIER_GROWTH_MAX !== undefined) {
    const result = await reclassifyAllClients()
    reclassified = result.updated
  }

  return NextResponse.json({ ok: true, reclassified })
}
