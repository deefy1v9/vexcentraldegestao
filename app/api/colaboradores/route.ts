import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import bcrypt from 'bcryptjs'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const users = await prisma.user.findMany({
    select: {
      id: true, name: true, email: true, role: true,
      phone: true, position: true, salary: true, isActive: true, createdAt: true,
      _count: { select: { assignedTasks: true, activityLogs: true } },
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(users)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if ((session.user as any).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { name, email, password, role, phone, position, salary } = body

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return NextResponse.json({ error: 'Email já cadastrado' }, { status: 400 })

  const hashed = await bcrypt.hash(password || 'mudar@123', 10)

  const user = await prisma.user.create({
    data: {
      name, email, password: hashed,
      role: role || 'COLABORADOR',
      phone, position,
      salary: salary ? Number(salary) : null,
    },
  })

  await logActivity((session.user as any).id, 'cadastrou colaborador', 'Colaboradores', user.name)

  const { password: _, ...safe } = user
  return NextResponse.json(safe, { status: 201 })
}
