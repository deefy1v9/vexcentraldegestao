import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { recalcClientMonthlyValue } from '@/lib/client-value'
import { dropPendingPaymentsFrom, seedServicePayments } from '@/lib/receivables'

/**
 * Ciclo de vida de um serviço contratado (admin):
 * POST { action: 'pausar' | 'reativar' | 'encerrar', reason?, date? }
 * GET  — histórico de valores, status e parcelas.
 *
 * Pausar/encerrar tira o serviço do ticket e para de gerar parcelas a partir
 * da competência informada; o que já foi pago fica intacto.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; serviceId: string }> }) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  const { id, serviceId } = await params
  const service = await prisma.clientService.findUnique({
    where: { id: serviceId },
    include: {
      catalog: true,
      valueHistory: { orderBy: { effectiveFrom: 'desc' } },
      statusHistory: { orderBy: { createdAt: 'desc' } },
      payments: { orderBy: [{ year: 'desc' }, { month: 'desc' }] },
      chargeItems: { include: { charge: { select: { id: true, year: true, month: true, status: true, invoiceUrl: true } } } },
    },
  })
  if (!service || service.clientId !== id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ service })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; serviceId: string }> }) {
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user

  const { id, serviceId } = await params
  const body = await req.json().catch(() => ({}))
  const action = String(body.action ?? '')
  const reason = body.reason ? String(body.reason).slice(0, 300) : null
  const date = body.date ? new Date(`${String(body.date).slice(0, 10)}T12:00:00Z`) : new Date()
  if (Number.isNaN(date.getTime())) return NextResponse.json({ error: 'Data inválida.' }, { status: 400 })

  const service = await prisma.clientService.findUnique({ where: { id: serviceId } })
  if (!service || service.clientId !== id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const transitions: Record<string, { from: string[]; to: string }> = {
    pausar: { from: ['ATIVO'], to: 'PAUSADO' },
    reativar: { from: ['PAUSADO'], to: 'ATIVO' },
    encerrar: { from: ['ATIVO', 'PAUSADO'], to: 'ENCERRADO' },
  }
  const t = transitions[action]
  if (!t) return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
  if (!t.from.includes(service.status)) {
    return NextResponse.json({ error: `Não é possível ${action} um serviço ${service.status.toLowerCase()}.` }, { status: 400 })
  }

  await prisma.$transaction(async (tx) => {
    await tx.clientService.update({
      where: { id: serviceId },
      data: {
        status: t.to,
        pausedAt: t.to === 'PAUSADO' ? date : t.to === 'ATIVO' ? null : service.pausedAt,
        endedAt: t.to === 'ENCERRADO' ? date : null,
        endDate: t.to === 'ENCERRADO' ? date : (t.to === 'ATIVO' ? null : service.endDate),
      },
    })
    await tx.clientServiceStatusHistory.create({
      data: { serviceId, fromStatus: service.status, toStatus: t.to, userId: user.id, reason },
    })
    if (t.to !== 'ATIVO') {
      // Para de gerar a partir da competência da data (pagas ficam)
      await dropPendingPaymentsFrom(tx, serviceId, date.toISOString())
    } else {
      await seedServicePayments(tx, serviceId)
    }
    await recalcClientMonthlyValue(tx, id)
  })

  await logActivity(user.id, `${action === 'pausar' ? 'pausou' : action === 'reativar' ? 'reativou' : 'encerrou'} serviço`, 'Clientes', service.serviceName)
  const full = await prisma.clientService.findUnique({
    where: { id: serviceId },
    include: {
      catalog: { select: { id: true, name: true, category: true, minCents: true, maxCents: true, billingType: true } },
      payments: { select: { id: true, status: true, amount: true, dueDate: true, year: true, month: true }, orderBy: { dueDate: 'asc' } },
      valueHistory: { orderBy: { effectiveFrom: 'desc' }, take: 10 },
      statusHistory: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  })
  return NextResponse.json(full)
}
