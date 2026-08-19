import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getAsaasConfig } from '@/lib/asaas'
import { getFocusConfig } from '@/lib/focus-nfe'
import { smtpConfigured } from '@/lib/mailer'

/**
 * Status leve das integrações (sem chamadas externas) — alimenta o card
 * "Integrações" do Financeiro. Nunca devolve tokens.
 */
export async function GET() {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  const [asaasCfg, focusCfg, smtp, syncedClients, lastAsaasEvent] = await Promise.all([
    getAsaasConfig(),
    getFocusConfig(),
    smtpConfigured(),
    prisma.client.count({ where: { asaasSyncStatus: 'OK' } }),
    prisma.webhookEvent.findFirst({ where: { provider: 'ASAAS' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
  ])

  return NextResponse.json({
    asaas: {
      env: asaasCfg.env,
      configured: !!asaasCfg.apiKey,
      connected: !!asaasCfg.apiKey && (syncedClients > 0 || !!lastAsaasEvent),
      lastEventAt: lastAsaasEvent?.createdAt ?? null,
    },
    focus: {
      env: focusCfg.env,
      mode: focusCfg.mode,
      configured: !!focusCfg.token,
      certStatus: focusCfg.certStatus, // PENDING | OK
    },
    email: { configured: smtp },
  })
}
