import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { paymentId, status } = body

  const payment = await prisma.clientPayment.update({
    where: { id: paymentId },
    data: {
      status,
      paidAt: status === 'PAGO' ? new Date() : null,
    },
    include: { client: { select: { name: true } } },
  })

  await logActivity((session.user as any).id, `marcou pagamento como ${status}`, 'Financeiro', payment.client.name)
  return NextResponse.json(payment)
}
