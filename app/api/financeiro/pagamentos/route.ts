import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'

export async function PUT(req: NextRequest) {
  // Alterar status de pagamento é uma ação financeira — só administradores.
  const { user, response } = await requireAdmin()
  if (response) return response

  const body = await req.json().catch(() => ({}))
  const { paymentId, status } = body

  if (!paymentId || typeof paymentId !== 'string') {
    return NextResponse.json({ error: 'paymentId inválido' }, { status: 400 })
  }
  if (!status || typeof status !== 'string') {
    return NextResponse.json({ error: 'status inválido' }, { status: 400 })
  }

  const payment = await prisma.clientPayment.update({
    where: { id: paymentId },
    data: {
      status,
      paidAt: status === 'PAGO' ? new Date() : null,
    },
    include: { client: { select: { name: true } } },
  })

  await logActivity(user.id, `marcou pagamento como ${status}`, 'Financeiro', payment.client.name)
  return NextResponse.json(payment)
}
