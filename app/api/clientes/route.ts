import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'

export async function GET(req: NextRequest) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

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
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const body = await req.json()
  const {
    name, cnpj, email, phone, niche,
    contractStart, contractMonths, monthlyValue, paymentDay, status, notes, services,
  } = body

  const contractEnd = contractStart && contractMonths
    ? new Date(new Date(contractStart).setMonth(new Date(contractStart).getMonth() + contractMonths))
    : null

  const client = await prisma.client.create({
    data: {
      name, cnpj: cnpj || null, email, phone, niche,
      contractStart: contractStart ? new Date(contractStart) : null,
      contractEnd,
      contractMonths: contractMonths ? Number(contractMonths) : null,
      monthlyValue: monthlyValue ? Number(monthlyValue) : null,
      paymentDay: paymentDay ? Number(paymentDay) : null,
      status: status || 'ATIVO',
      notes,
      services: {
        create: (services || []).map((s: { serviceName: string; description?: string }) => ({
          serviceName: s.serviceName,
          description: s.description,
        })),
      },
    },
  })

  await logActivity(user.id, 'cadastrou cliente', 'Clientes', client.name)
  return NextResponse.json(client, { status: 201 })
}
