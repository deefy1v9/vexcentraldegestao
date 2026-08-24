import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { deliverMessage } from '@/lib/crm-delivery'

/**
 * Aprova um rascunho da IA e envia para o cliente. Aceita `content` no corpo
 * para o caso de a pessoa ter editado o texto antes de aprovar — o que sai é
 * sempre o que ela viu na tela.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const draft = await prisma.aiDraft.findUnique({
    where: { id },
    include: { conversation: { include: { contact: true } } },
  })
  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (draft.status !== 'PENDENTE') {
    return NextResponse.json({ error: 'Este rascunho já foi resolvido' }, { status: 409 })
  }

  const content =
    typeof body.content === 'string' && body.content.trim() ? body.content.trim() : draft.content

  try {
    await deliverMessage(draft.conversation.contact.whatsappNumber, content, {
      senderName: user.name,
      senderId: user.id,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Falha ao enviar' },
      { status: 502 },
    )
  }

  await prisma.aiDraft.update({
    where: { id },
    data: { status: 'ENVIADO', content, resolvedAt: new Date() },
  })

  await logActivity(
    user.id,
    'enviou resposta sugerida pela IA',
    'CRM',
    draft.conversation.contact.name ?? draft.conversation.contact.whatsappNumber,
  )

  return NextResponse.json({ ok: true })
}

/** Descarta o rascunho sem enviar nada. */
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const { id } = await params
  const draft = await prisma.aiDraft.findUnique({ where: { id } })
  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.aiDraft.update({
    where: { id },
    data: { status: 'DESCARTADO', resolvedAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}
