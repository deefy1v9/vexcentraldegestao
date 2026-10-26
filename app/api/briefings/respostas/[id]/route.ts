import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { ehSensivel } from '@/lib/briefing-core'
import { perguntasDe, revelar } from '@/lib/briefing'
import { resumirBriefing } from '@/lib/briefing-resumo'

/**
 * Uma resposta de briefing (admin).
 * GET ?revelar=<pergunta>  mostra um campo sensível (fica no log quem viu)
 * PATCH { clientId | lida }  liga ao cliente / marca como lida ou não lida
 * POST  { acao: 'resumo' }  gera (ou refaz) o resumo com IA
 * DELETE                    apaga a resposta
 */
async function carregar(id: string) {
  return prisma.briefingResponse.findUnique({ where: { id }, include: { template: { select: { name: true } }, client: { select: { name: true } } } })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const { id } = await params
  const r = await carregar(id)
  if (!r) return NextResponse.json({ error: 'Resposta não encontrada.' }, { status: 404 })
  const pid = req.nextUrl.searchParams.get('revelar') ?? ''
  const p = perguntasDe(r.questions).find((x) => x.id === pid)
  const valor = (r.answers as Record<string, unknown>)[pid]
  if (!p || !ehSensivel(p) || typeof valor !== 'string') return NextResponse.json({ error: 'Campo não encontrado.' }, { status: 404 })
  await logActivity(admin.id, 'viu campo sensível de briefing', 'Briefings', `${r.template.name} · ${r.client?.name ?? r.companyName ?? 'sem cliente'} · ${p.titulo}`)
  return NextResponse.json({ valor: revelar(valor) })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const data: { clientId?: string | null; readAt?: Date | null } = {}
  if (body.clientId !== undefined) {
    const cid = body.clientId ? String(body.clientId) : null
    if (cid && !(await prisma.client.findUnique({ where: { id: cid }, select: { id: true } }))) {
      return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 400 })
    }
    data.clientId = cid
  }
  if (body.lida !== undefined) data.readAt = body.lida ? new Date() : null
  const r = await prisma.briefingResponse.update({ where: { id }, data }).catch(() => null)
  if (!r) return NextResponse.json({ error: 'Resposta não encontrada.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  if (body.acao !== 'resumo') return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
  const r = await carregar(id)
  if (!r) return NextResponse.json({ error: 'Resposta não encontrada.' }, { status: 404 })
  try {
    const summary = await resumirBriefing({
      nome: r.template.name, perguntas: perguntasDe(r.questions), respostas: r.answers as Record<string, unknown>, alertas: r.alerts,
    })
    await prisma.briefingResponse.update({ where: { id }, data: { summary, summaryAt: new Date() } })
    return NextResponse.json({ summary })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Não foi possível gerar o resumo.' }, { status: 502 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const { id } = await params
  const r = await carregar(id)
  if (!r) return NextResponse.json({ error: 'Resposta não encontrada.' }, { status: 404 })
  await prisma.briefingResponse.delete({ where: { id } })
  await logActivity(admin.id, 'apagou resposta de briefing', 'Briefings', `${r.template.name} · ${r.client?.name ?? r.companyName ?? 'sem cliente'}`)
  return NextResponse.json({ ok: true })
}
