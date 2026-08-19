import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import * as asaas from '@/lib/asaas'
import * as focus from '@/lib/focus-nfe'
import { fiscalReadiness } from '@/lib/nfse'
import { missingBillingFields, publicOrigin } from '@/lib/billing-core'
import { getBillingSetting } from '@/lib/billing-whatsapp'

/**
 * Diagnóstico das integrações (admin). Testes rodam no backend e NUNCA
 * devolvem tokens — apenas ambiente, status e contadores.
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  const origin = publicOrigin(req)
  const asaasWebhookUrl = `${origin}/api/webhooks/asaas`
  const focusWebhookUrl = `${origin}/api/webhooks/focus-nfe`

  const [asaasCfg, focusCfg, fiscal] = await Promise.all([
    asaas.getAsaasConfig(),
    focus.getFocusConfig(),
    fiscalReadiness(),
  ])

  const [asaasConn, focusConn] = await Promise.all([
    asaasCfg.apiKey ? asaas.testConnection() : Promise.resolve({ ok: false, error: 'ASAAS_API_KEY não configurada.' }),
    focusCfg.token ? focus.testConnection() : Promise.resolve({ ok: false, error: 'Token Focus não configurado.' }),
  ])

  const [asaasHooks, focusHooks] = await Promise.all([
    asaasConn.ok ? asaas.listWebhooks().catch(() => []) : Promise.resolve([]),
    focusConn.ok ? focus.listHooks().catch(() => []) : Promise.resolve([]),
  ])

  const [lastEvent, lastRun, clients, chargesError, nfseError] = await Promise.all([
    prisma.webhookEvent.findFirst({ orderBy: { createdAt: 'desc' }, select: { provider: true, type: true, createdAt: true } }),
    getBillingSetting('BILLING_REMINDER_LAST_RUN'),
    prisma.client.findMany({
      where: { status: 'ATIVO' },
      select: { id: true, name: true, cnpj: true, email: true, billingEmail: true, paymentDay: true, billingEnabled: true },
    }),
    prisma.asaasCharge.count({ where: { status: 'ERROR' } }),
    prisma.nfseInvoice.count({ where: { status: { in: ['ERRO_AUTORIZACAO', 'ERRO_CANCELAMENTO'] } } }),
  ])

  const incomplete = clients
    .map((c) => ({ id: c.id, name: c.name, missing: missingBillingFields(c) }))
    .filter((c) => c.missing.length > 0)
  const ready = clients.filter((c) => missingBillingFields(c).length === 0)

  return NextResponse.json({
    asaas: {
      env: asaasCfg.env,
      keyConfigured: !!asaasCfg.apiKey,
      webhookTokenConfigured: !!asaasCfg.webhookToken,
      connection: asaasConn,
      webhookUrl: asaasWebhookUrl,
      webhookRegistered: asaasHooks.some((w) => w.url === asaasWebhookUrl && w.enabled !== false),
    },
    focus: {
      env: focusCfg.env,
      mode: focusCfg.mode,
      tokenConfigured: !!focusCfg.token,
      webhookTokenConfigured: !!focusCfg.webhookToken,
      connection: focusConn,
      webhookUrl: focusWebhookUrl,
      webhookRegistered: focusHooks.some((h) => h.url === focusWebhookUrl),
    },
    fiscal: { ready: fiscal.ready, missing: fiscal.missing },
    cron: { lastRun: lastRun || null, active: !!lastRun },
    lastWebhookEvent: lastEvent,
    clients: {
      billingEnabled: clients.filter((c) => c.billingEnabled).length,
      readyForBilling: ready.length,
      incomplete,
    },
    errors: { charges: chargesError, nfse: nfseError },
  })
}
