import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { recalcClientMonthlyValue } from '@/lib/client-value'
import { isContractType } from '@/lib/services-catalog'
import { seedServicePayments, repricePendingFrom, dropPendingPaymentsFrom } from '@/lib/receivables'
import { serviceCents } from '@/lib/billing-core'

/**
 * Serviços contratados por um cliente — sempre a partir do catálogo.
 *
 * Valores em CENTAVOS (priceCents); monthlyValue (float legado) é espelhado
 * para as telas antigas. Recorrente entra no ticket/MRR; avulso só na
 * competência escolhida. Alteração de valor tem vigência e nunca reescreve
 * parcelas pagas.
 */

const SERVICE_INCLUDE = {
  catalog: { select: { id: true, name: true, category: true, minCents: true, maxCents: true, billingType: true } },
  payments: { select: { id: true, status: true, amount: true, dueDate: true, year: true, month: true }, orderBy: { dueDate: 'asc' as const } },
  valueHistory: { orderBy: { effectiveFrom: 'desc' as const }, take: 10 },
  statusHistory: { orderBy: { createdAt: 'desc' as const }, take: 10 },
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUser()
  if (gate instanceof NextResponse) return gate

  const { id } = await params
  const services = await prisma.clientService.findMany({
    where: { clientId: id },
    orderBy: { createdAt: 'asc' },
    include: SERVICE_INCLUDE,
  })

  // Colaborador vê os serviços sem valores, parcelas nem histórico de valor
  if (gate.role !== 'ADMIN') {
    return NextResponse.json(
      services.map((s) => ({
        ...s, monthlyValue: null, totalContractValue: null, priceCents: null, discountCents: 0,
        payments: [], valueHistory: [], catalog: s.catalog ? { ...s.catalog, minCents: null, maxCents: null } : null,
      })),
    )
  }
  return NextResponse.json(services)
}

function parseCents(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}

function parseDate(v: unknown): Date | null {
  if (!v) return null
  const d = new Date(`${String(v).slice(0, 10)}T12:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function competenceOf(v: unknown): string | null {
  const s = String(v ?? '').slice(0, 7)
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s) ? s : null
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user

  const { id } = await params
  const client = await prisma.client.findUnique({ where: { id }, select: { id: true, name: true, paymentDay: true } })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })

  const body = await req.json().catch(() => ({}))

  // Catálogo (obrigatório para novas contratações) — inativo não pode ser contratado
  const catalogId = body.catalogId ? String(body.catalogId) : null
  const catalog = catalogId ? await prisma.serviceCatalog.findUnique({ where: { id: catalogId } }) : null
  if (catalogId && !catalog) return NextResponse.json({ error: 'Serviço do catálogo não encontrado.' }, { status: 404 })
  if (catalog && !catalog.isActive) return NextResponse.json({ error: 'Este serviço está inativo no catálogo.' }, { status: 400 })

  const serviceName = String(body.serviceName ?? catalog?.name ?? '').trim()
  if (!serviceName) return NextResponse.json({ error: 'Informe o serviço.' }, { status: 400 })

  const contractType = isContractType(body.contractType) ? body.contractType : (catalog?.billingType && isContractType(catalog.billingType) ? catalog.billingType : 'RECORRENTE')
  const priceCents = parseCents(body.priceCents) ?? catalog?.defaultCents ?? null
  if (priceCents == null) return NextResponse.json({ error: 'Informe o valor negociado.' }, { status: 400 })

  const competence = contractType === 'AVULSO' ? competenceOf(body.competence) : null
  if (contractType === 'AVULSO' && !competence) {
    return NextResponse.json({ error: 'Serviço avulso exige o mês de competência.' }, { status: 400 })
  }
  const startDate = parseDate(body.startDate) ?? (competence ? new Date(`${competence}-01T12:00:00Z`) : new Date())
  const endDate = parseDate(body.endDate)
  if (endDate && endDate < startDate) {
    return NextResponse.json({ error: 'A data de término não pode ser anterior ao início.' }, { status: 400 })
  }
  const dueDay = body.dueDay ? Math.min(31, Math.max(1, Math.round(Number(body.dueDay)))) : null
  if (contractType === 'AVULSO' && !dueDay && !client.paymentDay) {
    return NextResponse.json({ error: 'Informe o dia de vencimento do serviço avulso.' }, { status: 400 })
  }
  const quantity = Math.max(1, Math.round(Number(body.quantity) || 1))
  const discountCents = parseCents(body.discountCents) ?? 0

  // Fora da faixa do catálogo: aviso, nunca bloqueio; o catálogo não muda
  const warnings: string[] = []
  if (catalog?.minCents != null && priceCents < catalog.minCents) warnings.push('Valor abaixo da faixa sugerida do catálogo.')
  if (catalog?.maxCents != null && priceCents > catalog.maxCents) warnings.push('Valor acima da faixa sugerida do catálogo.')

  const service = await prisma.$transaction(async (tx) => {
    const created = await tx.clientService.create({
      data: {
        clientId: id,
        catalogId: catalog?.id ?? null,
        serviceName,
        customName: body.customName ? String(body.customName).slice(0, 120) : null,
        description: body.description ? String(body.description).slice(0, 2000) : (catalog?.summary ?? null),
        contractType,
        priceCents,
        monthlyValue: contractType === 'AVULSO' ? null : priceCents / 100,
        quantity,
        discountCents,
        competence,
        startDate,
        endDate,
        dueDay,
        generateCharge: body.generateCharge !== false,
        emitNfse: !!body.emitNfse,
        billingDescription: body.billingDescription ? String(body.billingDescription).slice(0, 300) : null,
        observations: body.observations ? String(body.observations).slice(0, 2000) : null,
        contractDuration: body.contractDuration ? Math.max(1, Math.round(Number(body.contractDuration))) : null,
        paymentType: contractType === 'AVULSO' ? 'Único' : 'Mensal',
        totalContractValue: contractType === 'AVULSO' ? priceCents / 100 : null,
        status: 'ATIVO',
      },
    })
    await tx.clientServiceValueHistory.create({
      data: { serviceId: created.id, cents: serviceCents(created), effectiveFrom: startDate, userId: user.id, note: 'Contratação' },
    })
    await tx.clientServiceStatusHistory.create({
      data: { serviceId: created.id, fromStatus: null, toStatus: 'ATIVO', userId: user.id, reason: 'Contratação' },
    })
    // Parcelas previstas: avulso = 1 na competência; recorrente = do início em diante
    await seedServicePayments(tx, created.id)
    await recalcClientMonthlyValue(tx, id)
    return created
  })

  await logActivity(user.id, contractType === 'AVULSO' ? 'contratou serviço avulso' : 'contratou serviço', 'Clientes', `${client.name} · ${serviceName}`)
  const full = await prisma.clientService.findUnique({ where: { id: service.id }, include: SERVICE_INCLUDE })
  return NextResponse.json({ ...full, warnings }, { status: 201 })
}

/** Edita a contratação. Valor novo tem vigência; parcelas pagas não mudam. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const serviceId = body.serviceId ? String(body.serviceId) : null
  if (!serviceId) return NextResponse.json({ error: 'serviceId obrigatório' }, { status: 400 })

  const existing = await prisma.clientService.findUnique({ where: { id: serviceId }, include: { catalog: true } })
  if (!existing || existing.clientId !== id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status === 'ENCERRADO') return NextResponse.json({ error: 'Serviço encerrado não pode ser editado.' }, { status: 400 })

  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k)
  const data: Record<string, unknown> = {}
  const warnings: string[] = []

  if (has('serviceName')) {
    if (!String(body.serviceName).trim()) return NextResponse.json({ error: 'Informe o serviço.' }, { status: 400 })
    data.serviceName = String(body.serviceName).trim().slice(0, 120)
  }
  if (has('customName')) data.customName = body.customName ? String(body.customName).slice(0, 120) : null
  if (has('description')) data.description = body.description ? String(body.description).slice(0, 2000) : null
  if (has('observations')) data.observations = body.observations ? String(body.observations).slice(0, 2000) : null
  if (has('billingDescription')) data.billingDescription = body.billingDescription ? String(body.billingDescription).slice(0, 300) : null
  if (has('generateCharge')) data.generateCharge = !!body.generateCharge
  if (has('emitNfse')) data.emitNfse = !!body.emitNfse
  if (has('dueDay')) data.dueDay = body.dueDay ? Math.min(31, Math.max(1, Math.round(Number(body.dueDay)))) : null
  if (has('quantity')) data.quantity = Math.max(1, Math.round(Number(body.quantity) || 1))
  if (has('discountCents')) data.discountCents = parseCents(body.discountCents) ?? 0
  if (has('endDate')) data.endDate = parseDate(body.endDate)
  if (has('startDate') && parseDate(body.startDate)) data.startDate = parseDate(body.startDate)
  if (has('competence') && existing.contractType === 'AVULSO') {
    const c = competenceOf(body.competence)
    if (!c) return NextResponse.json({ error: 'Competência inválida.' }, { status: 400 })
    data.competence = c
  }

  // Valor com vigência (padrão: competência atual)
  let repriced = 0
  const newPrice = has('priceCents') ? parseCents(body.priceCents) : (has('monthlyValue') ? parseCents(Number(body.monthlyValue) * 100) : null)
  const priceChanged = newPrice != null && newPrice !== (existing.priceCents ?? Math.round((existing.monthlyValue ?? 0) * 100))
  const effectiveFrom = parseDate(body.effectiveFrom) ?? new Date()
  if (priceChanged) {
    data.priceCents = newPrice
    if (existing.contractType !== 'AVULSO') data.monthlyValue = newPrice! / 100
    else data.totalContractValue = newPrice! / 100
    if (existing.catalog?.minCents != null && newPrice! < existing.catalog.minCents) warnings.push('Valor abaixo da faixa sugerida do catálogo.')
    if (existing.catalog?.maxCents != null && newPrice! > existing.catalog.maxCents) warnings.push('Valor acima da faixa sugerida do catálogo.')
  }

  const service = await prisma.$transaction(async (tx) => {
    const updated = await tx.clientService.update({ where: { id: serviceId }, data })
    if (priceChanged) {
      await tx.clientServiceValueHistory.create({
        data: { serviceId, cents: serviceCents(updated), effectiveFrom, userId: user.id, note: body.valueNote ? String(body.valueNote).slice(0, 300) : null },
      })
      repriced = await repricePendingFrom(tx, serviceId, effectiveFrom.toISOString(), serviceCents(updated))
    }
    if (has('endDate') && updated.endDate) {
      // Encerramento futuro: parcelas pendentes depois do fim saem
      const after = new Date(Date.UTC(updated.endDate.getUTCFullYear(), updated.endDate.getUTCMonth() + 1, 1))
      await dropPendingPaymentsFrom(tx, serviceId, after.toISOString())
    }
    await seedServicePayments(tx, serviceId)
    await recalcClientMonthlyValue(tx, id)
    return updated
  })

  await logActivity(user.id, 'atualizou serviço', 'Clientes', service.serviceName)
  const full = await prisma.clientService.findUnique({ where: { id: service.id }, include: SERVICE_INCLUDE })
  return NextResponse.json({ ...full, warnings, repriced })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user

  const { id } = await params
  const { searchParams } = new URL(req.url)
  const serviceId = searchParams.get('serviceId')
  if (!serviceId) return NextResponse.json({ error: 'serviceId obrigatório' }, { status: 400 })

  const service = await prisma.clientService.findUnique({ where: { id: serviceId }, include: { _count: { select: { payments: { where: { status: 'PAGO' } } } } } })
  if (!service || service.clientId !== id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Com pagamento registrado, o histórico não pode sumir: encerre em vez de excluir
  if (service._count.payments > 0) {
    return NextResponse.json(
      { error: 'Este serviço já tem pagamento registrado. Encerre o serviço em vez de excluir — o histórico é preservado.' },
      { status: 400 },
    )
  }

  await prisma.$transaction(async (tx) => {
    await tx.clientPayment.deleteMany({ where: { serviceId, status: 'PENDENTE' } })
    await tx.clientService.delete({ where: { id: serviceId } })
    await recalcClientMonthlyValue(tx, id)
  })
  await logActivity(user.id, 'removeu serviço', 'Clientes', service.serviceName)
  return NextResponse.json({ ok: true })
}
