import { NextRequest, NextResponse } from 'next/server'
import { requireUser, requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { decryptSecret } from '@/lib/crypto'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

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

  // As senhas ficam cifradas no banco; descriptografa antes de devolver.
  const credentials = client.credentials.map((c) => ({ ...c, password: decryptSecret(c.password) }))
  if (client.credentials.length > 0) {
    await logActivity(user.id, 'acessou credenciais do cliente', 'Clientes', client.name)
  }

  return NextResponse.json({ ...client, credentials })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const { id } = await params
  const { services, ...body } = await req.json()

  const contractEnd = body.contractStart && body.contractMonths
    ? new Date(new Date(body.contractStart).setMonth(new Date(body.contractStart).getMonth() + Number(body.contractMonths)))
    : body.contractEnd ? new Date(body.contractEnd) : null

  const client = await prisma.$transaction(async (tx) => {
    const updated = await tx.client.update({
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
        monthlyValue: body.monthlyValue ? Number(body.monthlyValue) : null,
        paymentDay: body.paymentDay ? Number(body.paymentDay) : null,
      },
    })

    if (Array.isArray(services)) {
      await tx.clientService.deleteMany({ where: { clientId: id } })
      if (services.length > 0) {
        await tx.clientService.createMany({
          data: services.map((s: string) => ({ clientId: id, serviceName: s })),
        })
      }
    }

    return updated
  })

  await logActivity(user.id, 'atualizou cliente', 'Clientes', client.name)
  return NextResponse.json(client)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Apagar um cliente destrói contrato, pagamentos, credenciais e todo o
  // histórico de CRM — ação restrita a administradores.
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user

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

  await logActivity(user.id, 'removeu cliente', 'Clientes', client.name)
  return NextResponse.json({ ok: true })
}
