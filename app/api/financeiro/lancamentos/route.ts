import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { recalcClientMonthlyValue } from '@/lib/client-value'
import { seedServicePayments } from '@/lib/receivables'
import { serviceCents } from '@/lib/billing-core'

/**
 * "Adicionar lançamento" do Financeiro — um único ponto de entrada:
 * - RECEITA_AVULSA: serviço avulso do cliente (competência escolhida), com
 *   parcela única; opcionalmente gera a cobrança no Asaas e marca NFS-e.
 * - AJUSTE: lançamento manual (positivo = receita extra, negativo = custo)
 *   fora dos serviços — usado para acertos que não cabem no catálogo.
 * Custos e salários continuam nas rotas próprias (/custos e /salarios).
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const body = await req.json().catch(() => ({}))
  const kind = String(body.kind ?? '')
  const cents = Math.round(Number(body.cents))
  if (!Number.isFinite(cents)) return NextResponse.json({ error: 'Valor inválido.' }, { status: 400 })

  const competence = String(body.competence ?? '').slice(0, 7)
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competence)) {
    return NextResponse.json({ error: 'Informe a competência (AAAA-MM).' }, { status: 400 })
  }
  const [year, month] = competence.split('-').map(Number)

  if (kind === 'RECEITA_AVULSA') {
    const clientId = String(body.clientId ?? '')
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true, paymentDay: true } })
    if (!client) return NextResponse.json({ error: 'Selecione o cliente.' }, { status: 400 })
    if (cents <= 0) return NextResponse.json({ error: 'Valor precisa ser maior que zero.' }, { status: 400 })

    const catalogId = body.catalogId ? String(body.catalogId) : null
    const catalog = catalogId ? await prisma.serviceCatalog.findUnique({ where: { id: catalogId } }) : null
    const name = String(body.description ?? catalog?.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'Informe o serviço ou uma descrição.' }, { status: 400 })

    const dueDay = body.dueDay ? Math.min(31, Math.max(1, Math.round(Number(body.dueDay)))) : (client.paymentDay ?? null)
    if (!dueDay) return NextResponse.json({ error: 'Informe o vencimento.' }, { status: 400 })

    const service = await prisma.$transaction(async (tx) => {
      const created = await tx.clientService.create({
        data: {
          clientId,
          catalogId: catalog?.id ?? null,
          serviceName: name,
          description: catalog?.summary ?? null,
          contractType: 'AVULSO',
          priceCents: cents,
          monthlyValue: null,
          totalContractValue: cents / 100,
          competence,
          startDate: new Date(`${competence}-01T12:00:00Z`),
          dueDay,
          generateCharge: body.generateCharge !== false,
          emitNfse: !!body.emitNfse,
          billingDescription: body.billingDescription ? String(body.billingDescription).slice(0, 300) : null,
          observations: body.notes ? String(body.notes).slice(0, 2000) : null,
          paymentType: 'Único',
          status: 'ATIVO',
        },
      })
      await tx.clientServiceValueHistory.create({
        data: { serviceId: created.id, cents: serviceCents(created), effectiveFrom: created.startDate!, userId: admin.id, note: 'Receita avulsa' },
      })
      await tx.clientServiceStatusHistory.create({
        data: { serviceId: created.id, fromStatus: null, toStatus: 'ATIVO', userId: admin.id, reason: 'Receita avulsa' },
      })
      await seedServicePayments(tx, created.id)
      // Avulso não altera ticket nem grupo, mas mantém o derivado coerente
      await recalcClientMonthlyValue(tx, clientId)
      return created
    })

    // Cobrança no Asaas só quando pedido — e idempotente por competência
    let charge: { chargeId: string; created: boolean } | null = null
    let chargeError: string | null = null
    if (body.generateCharge === true && body.createChargeNow === true) {
      try {
        const { ensureCharge } = await import('@/lib/billing-asaas')
        charge = await ensureCharge(clientId, year, month)
      } catch (err) {
        chargeError = err instanceof Error ? err.message : 'Falha ao gerar cobrança.'
      }
    }

    await logActivity(admin.id, 'lançou receita avulsa', 'Financeiro', `${client.name} · ${name} · ${competence}`)
    return NextResponse.json({ ok: true, serviceId: service.id, charge, chargeError }, { status: 201 })
  }

  if (kind === 'AJUSTE') {
    const description = String(body.description ?? '').trim()
    if (!description) return NextResponse.json({ error: 'Descreva o ajuste.' }, { status: 400 })
    if (cents === 0) return NextResponse.json({ error: 'Valor precisa ser diferente de zero.' }, { status: 400 })
    const date = body.date ? new Date(`${String(body.date).slice(0, 10)}T12:00:00Z`) : new Date(`${competence}-01T12:00:00Z`)
    const entry = await prisma.financialEntry.create({
      data: {
        type: cents > 0 ? 'RECEITA' : 'CUSTO',
        category: 'Ajuste',
        name: description,
        description,
        amount: Math.abs(cents) / 100,
        date,
        dueDate: date,
        month, year,
        status: body.paid ? 'PAGO' : 'PENDENTE',
        paidAt: body.paid ? new Date() : null,
        isPaid: !!body.paid,
      },
    })
    await logActivity(admin.id, 'registrou ajuste financeiro', 'Financeiro', description)
    return NextResponse.json({ ok: true, entryId: entry.id }, { status: 201 })
  }

  return NextResponse.json({ error: 'Tipo de lançamento inválido.' }, { status: 400 })
}
