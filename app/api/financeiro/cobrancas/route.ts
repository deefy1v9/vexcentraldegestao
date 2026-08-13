import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { runBillingReminders } from '@/lib/billing-whatsapp'

/** Histórico e auditoria das confirmações de cobrança via WhatsApp. */
export async function GET() {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  const confirmations = await prisma.paymentConfirmation.findMany({
    include: {
      client: { select: { id: true, name: true } },
      events: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { sentAt: 'desc' },
    take: 30,
  })
  return NextResponse.json(confirmations)
}

/**
 * Dispara a varredura de cobranças manualmente (mesma rotina do agendador).
 * Idempotente: cobranças já notificadas não recebem nova mensagem.
 */
export async function POST() {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  const result = await runBillingReminders()
  return NextResponse.json(result)
}
