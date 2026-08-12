import { NextRequest, NextResponse } from 'next/server'
import { requireUser, requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUser()
  if (gate instanceof NextResponse) return gate

  const { id } = await params
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      credentials: true,
      services: true,
      calendarEvents: { orderBy: { startDate: 'asc' } },
      payments: { orderBy: { dueDate: 'desc' } },
      crmContact: { include: { conversations: true } },
      tasks: { include: { assignee: true }, orderBy: { createdAt: 'desc' }, take: 5 },
    },
  })

  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(client)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user
  const session = { user }

  const { id } = await params
  const { services, ...body } = await req.json()

  const contractEnd = body.contractStart && body.contractMonths
    ? new Date(new Date(body.contractStart).setMonth(new Date(body.contractStart).getMonth() + Number(body.contractMonths)))
    : body.contractEnd ? new Date(body.contractEnd) : null

  type ServiceInput = {
    id?: string | null
    serviceName: string
    description?: string | null
    monthlyValue?: number | string | null
  }

  // Normaliza e valida os serviços recebidos antes de abrir a transação
  const serviceRows: { id: string | null; serviceName: string; description: string | null; monthlyValue: number | null }[] | null =
    Array.isArray(services)
      ? (services as ServiceInput[])
          .filter((s) => s.serviceName && String(s.serviceName).trim())
          .map((s) => ({
            id: s.id ? String(s.id) : null,
            serviceName: String(s.serviceName).trim(),
            description: s.description ? String(s.description) : null,
            monthlyValue: s.monthlyValue != null && s.monthlyValue !== '' ? Number(s.monthlyValue) : null,
          }))
      : null

  if (serviceRows?.some((s) => s.monthlyValue != null && (!Number.isFinite(s.monthlyValue) || s.monthlyValue < 0))) {
    return NextResponse.json({ error: 'Valor de serviço deve ser maior ou igual a zero' }, { status: 400 })
  }

  const client = await prisma.$transaction(async (tx) => {
    await tx.client.update({
      where: { id },
      data: {
        name: body.name,
        cnpj: body.cnpj || null,
        email: body.email || null,
        phone: body.phone || null,
        niche: body.niche || null,
        status: body.status,
        notes: body.notes || null,
        contractStart: body.contractStart ? new Date(body.contractStart) : null,
        contractEnd,
        contractMonths: body.contractMonths ? Number(body.contractMonths) : null,
        paymentDay: body.paymentDay ? Number(body.paymentDay) : null,
        // monthlyValue não é aceito do corpo: é derivado dos serviços (abaixo).
      },
    })

    if (serviceRows) {
      const current = await tx.clientService.findMany({ where: { clientId: id }, select: { id: true } })
      const keptIds = new Set(serviceRows.filter((s) => s.id).map((s) => s.id as string))

      // Remove serviços retirados da lista (e suas parcelas ainda pendentes;
      // pagamentos já quitados ficam como histórico, igual ao DELETE avulso)
      const removedIds = current.map((s) => s.id).filter((sid) => !keptIds.has(sid))
      if (removedIds.length > 0) {
        await tx.clientPayment.deleteMany({ where: { serviceId: { in: removedIds }, status: 'PENDENTE' } })
        await tx.clientService.deleteMany({ where: { id: { in: removedIds }, clientId: id } })
      }

      // Atualiza os existentes (só os campos editáveis pelo formulário,
      // preservando duração/parcelas/observações configuradas no perfil)
      for (const s of serviceRows) {
        if (s.id) {
          await tx.clientService.updateMany({
            where: { id: s.id, clientId: id },
            data: { serviceName: s.serviceName, description: s.description, monthlyValue: s.monthlyValue },
          })
        }
      }

      // Cria os novos
      const toCreate = serviceRows.filter((s) => !s.id)
      if (toCreate.length > 0) {
        await tx.clientService.createMany({
          data: toCreate.map((s) => ({
            clientId: id,
            serviceName: s.serviceName,
            description: s.description,
            monthlyValue: s.monthlyValue,
            status: 'ATIVO',
          })),
        })
      }
    }

    // Valor mensal do cliente = soma dos serviços ativos
    const agg = await tx.clientService.aggregate({
      _sum: { monthlyValue: true },
      where: { clientId: id, status: 'ATIVO' },
    })
    return tx.client.update({
      where: { id },
      data: { monthlyValue: agg._sum.monthlyValue ?? 0 },
    })
  })

  await logActivity((session.user as any).id, 'atualizou cliente', 'Clientes', client.name)
  return NextResponse.json(client)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user
  const session = { user }

  const { id } = await params

  const client = await prisma.$transaction(async (tx) => {
    // Desvincula tarefas e eventos do calendário (clientId nullable)
    await tx.task.updateMany({ where: { clientId: id }, data: { clientId: null } })
    await tx.calendarEvent.updateMany({ where: { clientId: id }, data: { clientId: null } })

    // Remove pagamentos
    await tx.clientPayment.deleteMany({ where: { clientId: id } })

    // Remove cadeia CRM: mensagens → conversas → contato
    const contact = await tx.crmContact.findUnique({ where: { clientId: id } })
    if (contact) {
      const convIds = (await tx.crmConversation.findMany({
        where: { contactId: contact.id },
        select: { id: true },
      })).map((c) => c.id)

      if (convIds.length > 0) {
        await tx.crmMessage.deleteMany({ where: { conversationId: { in: convIds } } })
        await tx.crmConversation.deleteMany({ where: { id: { in: convIds } } })
      }
      await tx.crmContact.delete({ where: { id: contact.id } })
    }

    // Remove o cliente (credentials e services têm cascade no schema)
    return tx.client.delete({ where: { id } })
  })

  await logActivity((session.user as any).id, 'removeu cliente', 'Clientes', client.name)
  return NextResponse.json({ ok: true })
}
