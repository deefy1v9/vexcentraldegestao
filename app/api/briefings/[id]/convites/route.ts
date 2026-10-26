import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { novoToken } from '@/lib/briefing'

/**
 * Link do briefing para um cliente (admin). A resposta já chega ligada a ele
 * e a Central sabe quem ainda não respondeu. Se o cliente já tem um link
 * desse briefing ainda sem resposta, devolve o mesmo.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const clientId = String(body.clientId ?? '')
  const [t, cliente] = await Promise.all([
    prisma.briefingTemplate.findUnique({ where: { id }, select: { id: true, name: true } }),
    prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } }),
  ])
  if (!t) return NextResponse.json({ error: 'Briefing não encontrado.' }, { status: 404 })
  if (!cliente) return NextResponse.json({ error: 'Escolha o cliente.' }, { status: 400 })

  const aberto = await prisma.briefingInvite.findFirst({
    where: { templateId: id, clientId, responses: { none: {} } },
    orderBy: { createdAt: 'desc' },
  })
  if (aberto) return NextResponse.json({ token: aberto.token, reaproveitado: true })

  const c = await prisma.briefingInvite.create({ data: { templateId: id, clientId, token: novoToken(), createdById: admin.id } })
  await logActivity(admin.id, 'gerou link de briefing', 'Briefings', `${t.name} · ${cliente.name}`)
  return NextResponse.json({ token: c.token })
}

/** Apaga um link de cliente que ainda não foi respondido. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const { id } = await params
  const conviteId = req.nextUrl.searchParams.get('convite') ?? ''
  const c = await prisma.briefingInvite.findFirst({ where: { id: conviteId, templateId: id }, include: { _count: { select: { responses: true } } } })
  if (!c) return NextResponse.json({ error: 'Link não encontrado.' }, { status: 404 })
  if (c._count.responses > 0) return NextResponse.json({ error: 'Esse link já foi respondido.' }, { status: 409 })
  await prisma.briefingInvite.delete({ where: { id: c.id } })
  return NextResponse.json({ ok: true })
}
