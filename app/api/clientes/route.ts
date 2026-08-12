import { NextRequest, NextResponse } from 'next/server'
import { requireUser, requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'

export async function GET(req: NextRequest) {
  const gate = await requireUser()
  if (gate instanceof NextResponse) return gate

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''

  const clients = await prisma.client.findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { cnpj: { contains: search } },
            { niche: { contains: search, mode: 'insensitive' } },
          ],
        }
      : undefined,
    include: { services: true, _count: { select: { tasks: true } } },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(clients)
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const session = { user: admin }

  const body = await req.json()
  const {
    name, cnpj, email, phone, niche,
    contractStart, contractMonths, paymentDay, status, notes, services,
  } = body

  if (!name || !String(name).trim()) {
    return NextResponse.json({ error: 'Nome do cliente é obrigatório' }, { status: 400 })
  }

  type ServiceInput = { serviceName: string; description?: string; monthlyValue?: number | string | null }
  const serviceRows = ((services || []) as ServiceInput[])
    .filter((s) => s.serviceName && String(s.serviceName).trim())
    .map((s) => {
      const v = s.monthlyValue != null && s.monthlyValue !== '' ? Number(s.monthlyValue) : null
      return {
        serviceName: String(s.serviceName).trim(),
        description: s.description ? String(s.description) : null,
        monthlyValue: v,
        status: 'ATIVO',
      }
    })

  if (serviceRows.some((s) => s.monthlyValue != null && (!Number.isFinite(s.monthlyValue) || s.monthlyValue < 0))) {
    return NextResponse.json({ error: 'Valor de serviço deve ser maior ou igual a zero' }, { status: 400 })
  }

  const contractEnd = contractStart && contractMonths
    ? new Date(new Date(contractStart).setMonth(new Date(contractStart).getMonth() + contractMonths))
    : null

  const client = await prisma.client.create({
    data: {
      name: String(name).trim(), cnpj: cnpj || null, email, phone, niche,
      contractStart: contractStart ? new Date(contractStart) : null,
      contractEnd,
      contractMonths: contractMonths ? Number(contractMonths) : null,
      // Valor mensal é derivado: soma dos serviços contratados, nunca manual.
      monthlyValue: serviceRows.reduce((sum, s) => sum + (s.monthlyValue ?? 0), 0),
      paymentDay: paymentDay ? Number(paymentDay) : null,
      status: status || 'ATIVO',
      notes,
      services: { create: serviceRows },
    },
  })

  await logActivity((session.user as any).id, 'cadastrou cliente', 'Clientes', client.name)
  return NextResponse.json(client, { status: 201 })
}
