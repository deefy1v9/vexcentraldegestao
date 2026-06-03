import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUser()
  if (gate instanceof NextResponse) return gate

  const { id } = await params
  const services = await prisma.clientService.findMany({
    where: { clientId: id },
    orderBy: { createdAt: 'asc' },
    include: {
      _count: { select: { payments: true } },
      payments: {
        select: { id: true, status: true, amount: true, dueDate: true },
        orderBy: { dueDate: 'asc' },
      },
    },
  })
  return NextResponse.json(services)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user

  const { id } = await params
  const body = await req.json().catch(() => ({}))

  if (!body.serviceName) {
    return NextResponse.json({ error: 'serviceName obrigatório' }, { status: 400 })
  }

  const monthlyValue = body.monthlyValue ? Number(body.monthlyValue) : null
  const contractDuration = body.contractDuration ? Number(body.contractDuration) : null
  const totalContractValue =
    monthlyValue != null && contractDuration != null
      ? monthlyValue * contractDuration
      : body.totalContractValue
        ? Number(body.totalContractValue)
        : null

  const paymentType = body.paymentType ? String(body.paymentType) : 'Mensal'

  const service = await prisma.clientService.create({
    data: {
      clientId: id,
      serviceName: String(body.serviceName),
      customName: body.customName ? String(body.customName) : null,
      description: body.description ? String(body.description) : null,
      monthlyValue,
      paymentType,
      contractDuration,
      startDate: body.startDate ? new Date(body.startDate) : null,
      firstPaymentDate: body.firstPaymentDate ? new Date(body.firstPaymentDate) : null,
      totalContractValue,
      observations: body.observations ? String(body.observations) : null,
      status: 'ATIVO',
    },
  })

  // Gera pagamentos automáticos baseados na duração e primeiro pagamento
  if (monthlyValue && contractDuration && body.firstPaymentDate) {
    const baseDate = new Date(body.firstPaymentDate)
    // Para pagamento único, gera apenas 1 parcela; caso contrário, uma por mês
    const count = paymentType === 'Único' ? 1 : contractDuration
    const paymentsData = []

    for (let i = 0; i < count; i++) {
      const dueDate = new Date(baseDate)
      dueDate.setMonth(dueDate.getMonth() + i)
      paymentsData.push({
        clientId: id,
        serviceId: service.id,
        month: dueDate.getMonth() + 1,
        year: dueDate.getFullYear(),
        amount: monthlyValue,
        dueDate,
        status: 'PENDENTE',
      })
    }

    await prisma.clientPayment.createMany({ data: paymentsData })
  }

  await logActivity(user.id, 'adicionou serviço', 'Clientes', service.serviceName)
  return NextResponse.json(service, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user

  const { id } = await params
  const { searchParams } = new URL(req.url)
  const serviceId = searchParams.get('serviceId')
  if (!serviceId) return NextResponse.json({ error: 'serviceId obrigatório' }, { status: 400 })

  const service = await prisma.clientService.findUnique({ where: { id: serviceId } })
  if (!service || service.clientId !== id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Remove pagamentos pendentes vinculados — mantém os pagos como histórico
  await prisma.clientPayment.deleteMany({
    where: { serviceId, status: 'PENDENTE' },
  })

  await prisma.clientService.delete({ where: { id: serviceId } })
  await logActivity(user.id, 'removeu serviço', 'Clientes', service.serviceName)
  return NextResponse.json({ ok: true })
}
