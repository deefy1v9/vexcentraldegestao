import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

/** Atualiza nome, cor, descrição, situação e membros da equipe (admin). */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const team = await prisma.team.findUnique({ where: { id } })
  if (!team) return NextResponse.json({ error: 'Equipe não encontrada.' }, { status: 404 })
  const memberIds: string[] | null = Array.isArray(body.memberIds) ? [...new Set(body.memberIds.map(String))] as string[] : null

  await prisma.$transaction(async (tx) => {
    await tx.team.update({
      where: { id },
      data: {
        name: body.name !== undefined ? (String(body.name).trim().slice(0, 60) || team.name) : team.name,
        color: body.color !== undefined ? String(body.color) : team.color,
        description: body.description !== undefined ? (String(body.description).trim().slice(0, 300) || null) : team.description,
        active: body.active !== undefined ? !!body.active : team.active,
      },
    })
    if (memberIds) {
      await tx.teamMember.deleteMany({ where: { teamId: id, userId: { notIn: memberIds } } })
      const atuais = new Set((await tx.teamMember.findMany({ where: { teamId: id }, select: { userId: true } })).map((m) => m.userId))
      const novos = memberIds.filter((u) => !atuais.has(u))
      if (novos.length) await tx.teamMember.createMany({ data: novos.map((userId) => ({ teamId: id, userId })) })
    }
  })
  return NextResponse.json({ ok: true })
}

/** Apaga a equipe sem uso; em uso por alguma etapa, só desativa (admin). */
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const { id } = await params
  const emUso = await prisma.processStage.count({ where: { teamId: id } })
  if (emUso > 0) {
    await prisma.team.update({ where: { id }, data: { active: false } })
    return NextResponse.json({ ok: true, deactivated: true })
  }
  await prisma.team.delete({ where: { id } })
  return NextResponse.json({ ok: true, deleted: true })
}
