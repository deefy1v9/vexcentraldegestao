import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { parsePerguntas, slugDe } from '@/lib/briefing-core'
import { novoToken, perguntasDe } from '@/lib/briefing'

/**
 * Cria um briefing novo (admin). Vazio, com uma pergunta para começar, ou
 * copiando as perguntas de outro (`copiarDe`).
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const body = await req.json().catch(() => ({}))
  const name = String(body.name ?? '').trim().slice(0, 120)
  if (!name) return NextResponse.json({ error: 'Dê um nome ao briefing.' }, { status: 400 })

  let perguntas: unknown = [{ id: 'p01', tipo: 'texto', titulo: 'Nome da empresa', obrigatoria: true, papel: 'empresa' }]
  if (typeof body.copiarDe === 'string' && body.copiarDe) {
    const base = await prisma.briefingTemplate.findUnique({ where: { id: body.copiarDe }, select: { questions: true } })
    if (base) perguntas = perguntasDe(base.questions)
  }
  const parsed = parsePerguntas(perguntas)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  let slug = slugDe(name)
  if (await prisma.briefingTemplate.findUnique({ where: { slug } })) slug = `${slug}-${novoToken().slice(0, 5).toLowerCase()}`
  const ultimo = await prisma.briefingTemplate.aggregate({ _max: { position: true } })
  const t = await prisma.briefingTemplate.create({
    data: {
      slug, name,
      description: String(body.description ?? '').trim().slice(0, 1000) || null,
      questions: parsed.perguntas as object[],
      publicToken: novoToken(),
      position: (ultimo._max.position ?? 0) + 1,
    },
  })
  await logActivity(admin.id, 'criou briefing', 'Briefings', name)
  return NextResponse.json({ id: t.id })
}
