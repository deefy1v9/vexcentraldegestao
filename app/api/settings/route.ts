import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { reclassifyAllClients } from '@/lib/client-tier'

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
]

export async function GET() {
  // Expõe o UAZAPI_TOKEN — restrito a administradores.
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  const rows = await prisma.$queryRaw<Array<{ key: string; value: string }>>`
    SELECT key, value FROM "SystemSettings"
    WHERE key IN ('UAZAPI_URL', 'UAZAPI_TOKEN', 'BILLING_REMINDER_TIME', 'DEFAULT_RECEIVING_ACCOUNT',
                  'TIER_START_MAX', 'TIER_GROWTH_MAX')
  `

  const result: Record<string, string> = {}
  for (const row of rows) result[row.key] = row.value
  return NextResponse.json(result)
}

export async function PUT(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  const body = await req.json()

  for (const k of ALLOWED_KEYS.filter((key) => body[key] !== undefined)) {
    await prisma.$executeRaw`
      INSERT INTO "SystemSettings" (key, value, "updatedAt")
      VALUES (${k}, ${String(body[k])}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = ${String(body[k])}, "updatedAt" = NOW()
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
