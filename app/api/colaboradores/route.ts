import { NextRequest, NextResponse } from 'next/server'
import { requireUser, requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import bcrypt from 'bcryptjs'

export async function GET() {
  const { user, response } = await requireUser()
  if (response) return response

  const users = await prisma.user.findMany({
    select: {
      id: true, name: true, email: true, role: true,
      phone: true, position: true, salary: true, isActive: true, createdAt: true,
      _count: { select: { assignedTasks: true, activityLogs: true } },
    },
    orderBy: { name: 'asc' },
  })

  // Salário só é visível para administradores.
  if (user.role !== 'ADMIN') {
    return NextResponse.json(
      users.map((u) => ({
        id: u.id, name: u.name, email: u.email, role: u.role,
        phone: u.phone, position: u.position, isActive: u.isActive,
        createdAt: u.createdAt, _count: u._count,
      })),
    )
  }
  return NextResponse.json(users)
}

export async function POST(req: NextRequest) {
  const { user, response } = await requireAdmin()
  if (response) return response

  const body = await req.json()
  const { name, email, password, role, phone, position, salary } = body

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return NextResponse.json({ error: 'Email já cadastrado' }, { status: 400 })

  const hashed = await bcrypt.hash(password || 'mudar@123', 10)

  const created = await prisma.user.create({
    data: {
      name, email, password: hashed,
      role: role || 'COLABORADOR',
      phone, position,
      salary: salary ? Number(salary) : null,
    },
  })

  await logActivity(user.id, 'cadastrou colaborador', 'Colaboradores', created.name)

  const { password: _, ...safe } = created
  return NextResponse.json(safe, { status: 201 })
}
