import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import bcrypt from 'bcryptjs'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, email: true, role: true,
      phone: true, position: true, salary: true, isActive: true, createdAt: true,
      activityLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
      assignedTasks: {
        include: { client: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  })

  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(user)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { password, salary, ...rest } = body

  const data: Record<string, unknown> = {
    ...rest,
    salary: salary ? Number(salary) : null,
  }

  if (password) {
    data.password = await bcrypt.hash(password, 10)
  }

  const user = await prisma.user.update({ where: { id }, data })
  await logActivity((session.user as any).id, 'atualizou colaborador', 'Colaboradores', user.name)

  const { password: _, ...safe } = user
  return NextResponse.json(safe)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if ((session.user as any).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const user = await prisma.user.update({
    where: { id },
    data: { isActive: false },
  })
  await logActivity((session.user as any).id, 'desativou colaborador', 'Colaboradores', user.name)
  return NextResponse.json({ ok: true })
}
