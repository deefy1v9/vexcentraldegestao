import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { ensureCharge } from '@/lib/billing-asaas'
import * as asaas from '@/lib/asaas'
import { mapAsaasStatus } from '@/lib/billing-asaas'

/**
 * Geração manual de cobrança para um cliente/competência (admin).
 * Idempotente: competência já cobrada devolve a cobrança existente.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const body = await req.json().catch(() => ({}))
  // runJob: roda a varredura completa (mesma do agendador diário)
  if (body.runJob === true) {
    const { runAsaasBillingJob } = await import('@/lib/billing-asaas')
    const r = await runAsaasBillingJob()
    return NextResponse.json(r)
  }

  const clientId = String(body.clientId ?? '')
  const year = Number(body.year)
  const month = Number(body.month)
  if (!clientId || !Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: 'clientId, year e month são obrigatórios.' }, { status: 400 })
  }

  try {
    const r = await ensureCharge(clientId, year, month)
    const charge = await prisma.asaasCharge.findUniqueOrThrow({
      where: { id: r.chargeId },
      include: { nfse: true },
    })
    await logActivity(admin.id, r.created ? 'gerou cobrança Asaas' : 'consultou cobrança Asaas', 'Financeiro', charge.externalRef)
    return NextResponse.json({ ok: true, created: r.created, charge })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Falha ao gerar cobrança.' },
      { status: 400 },
    )
  }
}

/** Ressincroniza o status de uma cobrança direto no Asaas (admin). */
export async function PUT(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const body = await req.json().catch(() => ({}))
  const chargeId = String(body.chargeId ?? '')
  if (!chargeId) return NextResponse.json({ error: 'chargeId obrigatório.' }, { status: 400 })

  const charge = await prisma.asaasCharge.findUnique({ where: { id: chargeId } })
  if (!charge?.asaasId) return NextResponse.json({ error: 'Cobrança sem vínculo no Asaas.' }, { status: 404 })

  try {
    const p = await asaas.getPayment(charge.asaasId)
    const updated = await prisma.asaasCharge.update({
      where: { id: chargeId },
      data: {
        status: mapAsaasStatus(p.status),
        invoiceUrl: p.invoiceUrl ?? undefined,
        bankSlipUrl: p.bankSlipUrl ?? undefined,
        lastError: null,
      },
      include: { nfse: true },
    })
    return NextResponse.json({ ok: true, charge: updated })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Falha na consulta.' },
      { status: 400 },
    )
  }
}
