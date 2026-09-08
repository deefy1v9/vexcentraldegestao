import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { applyAutoTier, clientTicketCents } from './client-tier'

type Db = Prisma.TransactionClient | typeof prisma

/**
 * Recalcula o ticket mensal recorrente do cliente a partir dos serviços.
 *
 * `Client.monthlyValue` é derivado (reais) e espelha o ticket recorrente em
 * centavos — só serviços ATIVOS de tipo recorrente, já iniciados e não
 * encerrados. Avulsos, pausados e início futuro não entram. Toda rota que
 * cria, edita, pausa, reativa, encerra ou remove serviço chama isto, e o
 * grupo automático é reavaliado junto (sem tocar em classificação manual).
 */
export async function recalcClientMonthlyValue(db: Db, clientId: string): Promise<number> {
  const ticketCents = await clientTicketCents(db, clientId)
  const total = ticketCents / 100
  await db.client.update({ where: { id: clientId }, data: { monthlyValue: total } })
  await applyAutoTier(db, clientId)
  return total
}
