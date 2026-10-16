import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { ensureDefaultProcesses, listProcesses } from '@/lib/processos-server'
import { parseStages, slugify } from '@/lib/processos-input'

/** Processos com etapas. Colaborador vê só os ativos; admin vê todos. */
export async function GET() {
  const user = await requireUser()
  if (user instanceof NextResponse) return user
  await ensureDefaultProcesses()
  return NextResponse.json(await listProcesses({ onlyActive: user.role !== 'ADMIN' }))
}

/** Cria um processo (admin). */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const body = await req.json().catch(() => ({}))
  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Dê um nome ao processo.' }, { status: 400 })
  const parsed = parseStages(body.stages)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  let slug = slugify(name)
  if (await prisma.process.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36)}`
  const count = await prisma.process.count()
  const created = await prisma.process.create({
    data: {
      name, slug, color: String(body.color ?? '#030A8C'), description: body.description ? String(body.description) : null,
      position: count, stages: { create: parsed.stages.map(({ id: _id, ...s }) => s) },
    },
  })
  return NextResponse.json(created, { status: 201 })
}
