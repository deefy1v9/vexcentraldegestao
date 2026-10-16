import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { TEAM_INCLUDE } from '@/lib/equipes'

/** Equipes com quem participa de cada uma. */
export async function GET() {
  const user = await requireUser()
  if (user instanceof NextResponse) return user
  const teams = await prisma.team.findMany({ include: TEAM_INCLUDE, orderBy: { name: 'asc' } })
  return NextResponse.json(teams)
}

/** Cria uma equipe (admin). */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const body = await req.json().catch(() => ({}))
  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Dê um nome à equipe.' }, { status: 400 })
  const memberIds: string[] = Array.isArray(body.memberIds) ? [...new Set(body.memberIds.map(String))] as string[] : []
  const team = await prisma.team.create({
    data: {
      name: name.slice(0, 60),
      color: String(body.color ?? '#030A8C'),
      description: body.description ? String(body.description).slice(0, 300) : null,
      members: { create: memberIds.map((userId) => ({ userId })) },
    },
    include: TEAM_INCLUDE,
  })
  return NextResponse.json(team, { status: 201 })
}
