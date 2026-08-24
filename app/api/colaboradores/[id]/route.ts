import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { Prisma, UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'

const ROLES: string[] = ['ADMIN', 'COLABORADOR']

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const { id } = await params
  const target = await prisma.user.findUnique({
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

  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Salário e trilha de auditoria são dados sensíveis: visíveis apenas para
  // administradores ou para o próprio usuário. Mesma regra de /api/logs.
  if (user.role !== 'ADMIN' && user.id !== id) {
    return NextResponse.json({ ...target, salary: null, activityLogs: [] })
  }
  return NextResponse.json(target)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const { id } = await params
  const isAdmin = user.role === 'ADMIN'
  const isSelf = user.id === id

  // Um colaborador só pode editar o próprio cadastro.
  if (!isAdmin && !isSelf) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))

  // Whitelist explícita. NUNCA fazer spread do body: `role`, `isActive` e
  // `salary` vindos de um colaborador permitiriam escalonamento de privilégio
  // (auto-promoção a ADMIN) e adulteração da folha salarial.
  const data: Prisma.UserUpdateInput = {}

  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
  if (body.phone !== undefined) data.phone = body.phone ? String(body.phone) : null
  if (typeof body.password === 'string' && body.password) {
    data.password = await bcrypt.hash(body.password, 10)
  }

  // Campos privilegiados: exclusivos de administradores.
  if (isAdmin) {
    if (typeof body.email === 'string' && body.email.trim()) data.email = body.email.trim()
    if (body.position !== undefined) data.position = body.position ? String(body.position) : null
    if (body.salary !== undefined) {
      data.salary = body.salary === null || body.salary === '' ? null : Number(body.salary)
    }
    if (typeof body.role === 'string' && ROLES.includes(body.role)) {
      // Evita que o último admin se rebaixe e o sistema fique sem administrador.
      if (isSelf && body.role !== 'ADMIN') {
        return NextResponse.json(
          { error: 'Você não pode remover o próprio acesso de administrador' },
          { status: 400 },
        )
      }
      data.role = body.role as UserRole
    }
    if (typeof body.isActive === 'boolean') {
      if (isSelf && !body.isActive) {
        return NextResponse.json(
          { error: 'Você não pode desativar a própria conta' },
          { status: 400 },
        )
      }
      data.isActive = body.isActive
    }
  }

  const updated = await prisma.user.update({ where: { id }, data })
  await logActivity(user.id, 'atualizou colaborador', 'Colaboradores', updated.name)

  const { password: _password, ...safe } = updated
  return NextResponse.json(safe)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user
  if (user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  if (user.id === id) {
    return NextResponse.json(
      { error: 'Você não pode desativar a própria conta' },
      { status: 400 },
    )
  }

  const target = await prisma.user.update({
    where: { id },
    data: { isActive: false },
  })
  await logActivity(user.id, 'desativou colaborador', 'Colaboradores', target.name)
  return NextResponse.json({ ok: true })
}
