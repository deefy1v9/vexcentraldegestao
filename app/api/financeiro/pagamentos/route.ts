import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'

export async function PUT(req: NextRequest) {
  // Alterar status de pagamento é uma ação financeira — só administradores.
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user

  const body = await req.json().catch(() => ({}))
  const { paymentId, paymentIds, status } = body

  // Aceita um id único (fluxo antigo) ou uma lista — usada pela listagem
  // agrupada por cliente, que marca todas as parcelas do mês de uma vez.
  const ids: string[] = Array.isArray(paymentIds)
    ? paymentIds.filter((x: unknown) => typeof x === 'string')
    : typeof paymentId === 'string' ? [paymentId] : []

  if (ids.length === 0) {
    return NextResponse.json({ error: 'paymentId(s) inválido(s)' }, { status: 400 })
  }
  if (!status || typeof status !== 'string') {
    return NextResponse.json({ error: 'status inválido' }, { status: 400 })
  }

  await prisma.clientPayment.updateMany({
    where: { id: { in: ids } },
    data: {
      status,
      paidAt: status === 'PAGO' ? new Date() : null,
    },
  })

  const first = await prisma.clientPayment.findUnique({
    where: { id: ids[0] },
    include: { client: { select: { name: true } } },
  })

  await logActivity(
    user.id,
    `marcou ${ids.length > 1 ? `${ids.length} pagamentos` : 'pagamento'} como ${status}`,
    'Financeiro',
    first?.client.name ?? 'cliente',
  )
  return NextResponse.json({ ok: true, count: ids.length })
}
