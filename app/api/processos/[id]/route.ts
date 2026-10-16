import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { parseStages } from '@/lib/processos-input'

/**
 * Atualiza o processo e suas etapas (admin). Etapas vêm na ordem da tela:
 * as que têm id são atualizadas, as novas criadas e as que sumiram, apagadas
 * — a menos que alguma demanda esteja nelas.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const proc = await prisma.process.findUnique({ where: { id }, include: { stages: true } })
  if (!proc) return NextResponse.json({ error: 'Processo não encontrado.' }, { status: 404 })

  const parsed = parseStages(body.stages)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const mantidas = new Set(parsed.stages.map((s) => s.id).filter(Boolean))
  const removidas = proc.stages.filter((s) => !mantidas.has(s.id))
  if (removidas.length) {
    const emUso = await prisma.task.groupBy({ by: ['stageId'], where: { stageId: { in: removidas.map((s) => s.id) } }, _count: true })
    if (emUso.length) {
      const nomes = removidas.filter((s) => emUso.some((u) => u.stageId === s.id)).map((s) => `"${s.name}"`).join(', ')
      return NextResponse.json({ error: `Não dá para remover ${nomes}: há demandas nessa etapa. Mova-as antes.` }, { status: 409 })
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.process.update({
      where: { id },
      data: {
        name: String(body.name ?? proc.name).trim() || proc.name,
        color: String(body.color ?? proc.color),
        description: body.description === undefined ? proc.description : (String(body.description).trim() || null),
        active: body.active === undefined ? proc.active : !!body.active,
      },
    })
    if (removidas.length) await tx.processStage.deleteMany({ where: { id: { in: removidas.map((s) => s.id) } } })
    for (const s of parsed.stages) {
      const { id: stageId, ...data } = s
      if (stageId && proc.stages.some((x) => x.id === stageId)) await tx.processStage.update({ where: { id: stageId }, data })
      else await tx.processStage.create({ data: { ...data, processId: id } })
    }
  })
  return NextResponse.json({ ok: true })
}

/** Remove o processo sem demandas; com demandas, só desativa (admin). */
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const { id } = await params
  const usadas = await prisma.task.count({ where: { processId: id } })
  if (usadas > 0) {
    await prisma.process.update({ where: { id }, data: { active: false } })
    return NextResponse.json({ ok: true, deactivated: true })
  }
  await prisma.process.delete({ where: { id } })
  return NextResponse.json({ ok: true, deleted: true })
}
