import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'

/** Cancela um agendamento que ainda não saiu. */
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const { id } = await params
  const scheduled = await prisma.scheduledMessage.findUnique({ where: { id } })
  if (!scheduled) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // ENVIANDO significa que o despachante já está no meio do envio — cancelar
  // aqui daria a impressão de que a mensagem não saiu quando ela já saiu.
  if (scheduled.status !== 'PENDENTE') {
    return NextResponse.json(
      { error: `Este agendamento está como ${scheduled.status} e não pode ser cancelado` },
      { status: 409 },
    )
  }

  const updated = await prisma.scheduledMessage.update({
    where: { id },
    data: { status: 'CANCELADA' },
  })

  await logActivity(user.id, 'cancelou mensagem agendada', 'CRM', scheduled.whatsappNumber)
  return NextResponse.json(updated)
}
