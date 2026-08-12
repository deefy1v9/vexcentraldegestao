import { Prisma } from '@prisma/client'
import { prisma } from './prisma'

type Db = Prisma.TransactionClient | typeof prisma

/**
 * Recalcula o valor mensal total do cliente a partir dos serviços ativos.
 *
 * `Client.monthlyValue` é um campo derivado: nunca deve ser gravado
 * manualmente. Toda rota que cria, edita ou remove um serviço chama esta
 * função para manter a listagem de clientes e os agregados do dashboard
 * consistentes com a soma dos serviços.
 */
export async function recalcClientMonthlyValue(db: Db, clientId: string): Promise<number> {
  const agg = await db.clientService.aggregate({
    _sum: { monthlyValue: true },
    where: { clientId, status: 'ATIVO' },
  })
  const total = agg._sum.monthlyValue ?? 0
  await db.client.update({ where: { id: clientId }, data: { monthlyValue: total } })
  return total
}
