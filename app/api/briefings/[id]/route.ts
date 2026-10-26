import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { parsePerguntas } from '@/lib/briefing-core'
import { novoToken } from '@/lib/briefing'

/**
 * Salva o briefing (admin): nome, texto de abertura, ligado/desligado e as
 * perguntas. As respostas já recebidas guardam as perguntas da época, então
 * editar aqui não estraga o que o cliente respondeu.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const { id } = await params
  const atual = await prisma.briefingTemplate.findUnique({ where: { id } })
  if (!atual) return NextResponse.json({ error: 'Briefing não encontrado.' }, { status: 404 })
  const body = await req.json().catch(() => ({}))

  const parsed = parsePerguntas(body.perguntas)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const name = String(body.name ?? atual.name).trim().slice(0, 120) || atual.name

  await prisma.briefingTemplate.update({
    where: { id },
    data: {
      name,
      description: body.description === undefined ? atual.description : (String(body.description).trim().slice(0, 1000) || null),
      active: body.active === undefined ? atual.active : !!body.active,
      questions: parsed.perguntas as object[],
    },
  })
  await logActivity(admin.id, 'editou briefing', 'Briefings', name)
  return NextResponse.json({ ok: true })
}

/** Troca o link geral (o antigo para de abrir). Os links por cliente continuam. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  if (body.acao !== 'trocar-link') return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
  const t = await prisma.briefingTemplate.update({ where: { id }, data: { publicToken: novoToken() } }).catch(() => null)
  if (!t) return NextResponse.json({ error: 'Briefing não encontrado.' }, { status: 404 })
  await logActivity(admin.id, 'trocou o link do briefing', 'Briefings', t.name)
  return NextResponse.json({ publicToken: t.publicToken })
}

/** Remove o briefing sem respostas; com respostas, só desliga (o link para de abrir). */
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const { id } = await params
  const t = await prisma.briefingTemplate.findUnique({ where: { id }, include: { _count: { select: { responses: true } } } })
  if (!t) return NextResponse.json({ error: 'Briefing não encontrado.' }, { status: 404 })
  if (t._count.responses > 0) {
    await prisma.briefingTemplate.update({ where: { id }, data: { active: false } })
    await logActivity(admin.id, 'desligou briefing', 'Briefings', t.name)
    return NextResponse.json({ ok: true, deactivated: true })
  }
  await prisma.briefingTemplate.delete({ where: { id } })
  await logActivity(admin.id, 'removeu briefing', 'Briefings', t.name)
  return NextResponse.json({ ok: true, deleted: true })
}
