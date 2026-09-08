import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import {
  competenceKey, competenceRange, isRecurringType, serviceCents, serviceInCompetence,
} from './billing-core'

type Db = Prisma.TransactionClient | typeof prisma

/**
 * Parcelas previstas (ClientPayment) por serviço e competência.
 *
 * Uma parcela por (serviço, ano, mês) — o unique do banco é a chave de
 * idempotência: gerar duas vezes não duplica. Parcelas PAGAS nunca são
 * tocadas; pendentes acompanham o valor vigente do serviço.
 */

function dueDateFor(year: number, month: number, day: number): Date {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const d = Math.min(Math.max(day || 1, 1), last)
  return new Date(Date.UTC(year, month - 1, d))
}

type ServiceRow = {
  id: string
  clientId: string
  status: string
  monthlyValue: number | null
  startDate: Date | null
  endDate: Date | null
  contractType: string
  priceCents: number | null
  quantity: number
  discountCents: number
  competence: string | null
  dueDay: number | null
  generateCharge: boolean
  client: { status: string; contractEnd: Date | null; paymentDay: number | null }
}

/**
 * Garante a parcela do serviço na competência (se ele entra nela).
 * Devolve true quando criou.
 */
export async function ensureServicePayment(db: Db, s: ServiceRow, year: number, month: number): Promise<boolean> {
  if (!s.generateCharge) return false
  if (s.client.status !== 'ATIVO') return false
  const { start } = competenceRange(year, month)
  if (s.client.contractEnd && s.client.contractEnd < start) return false
  if (!serviceInCompetence(s, year, month)) return false

  const cents = serviceCents(s)
  const kind = isRecurringType(s.contractType) ? 'RECORRENTE' : 'AVULSO'
  const dueDay = s.dueDay ?? s.client.paymentDay ?? 10

  const existing = await db.clientPayment.findUnique({
    where: { serviceId_year_month: { serviceId: s.id, year, month } },
  })
  if (existing) {
    // Pendente acompanha o valor vigente; pago é histórico e não muda
    if (existing.status === 'PENDENTE' && Math.round(existing.amount * 100) !== cents) {
      await db.clientPayment.update({ where: { id: existing.id }, data: { amount: cents / 100 } })
    }
    return false
  }

  await db.clientPayment.create({
    data: {
      clientId: s.clientId,
      serviceId: s.id,
      year, month,
      amount: cents / 100,
      dueDate: dueDateFor(year, month, dueDay),
      status: 'PENDENTE',
      kind,
    },
  }).catch((err) => {
    // Corrida entre duas gerações: o unique segura, o outro lado venceu
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null
    throw err
  })
  return true
}

/**
 * Materializa as parcelas de todos os serviços que entram na competência.
 * Chamada ao abrir o mês no Financeiro/Dashboard e pelo cron — idempotente.
 */
export async function materializeReceivables(year: number, month: number, db: Db = prisma): Promise<number> {
  const services = await db.clientService.findMany({
    where: { status: 'ATIVO', client: { status: 'ATIVO' } },
    select: {
      id: true, clientId: true, status: true, monthlyValue: true, startDate: true, endDate: true,
      contractType: true, priceCents: true, quantity: true, discountCents: true, competence: true,
      dueDay: true, generateCharge: true,
      client: { select: { status: true, contractEnd: true, paymentDay: true } },
    },
  })
  let created = 0
  for (const s of services) {
    if (await ensureServicePayment(db, s, year, month)) created++
  }
  return created
}

/**
 * Parcelas de um serviço recém-contratado: avulso gera só a da competência;
 * recorrente gera do início até o fim (ou 12 meses à frente) — o resto é
 * materializado mês a mês ao abrir a competência.
 */
export async function seedServicePayments(db: Db, serviceId: string): Promise<number> {
  const s = await db.clientService.findUnique({
    where: { id: serviceId },
    select: {
      id: true, clientId: true, status: true, monthlyValue: true, startDate: true, endDate: true,
      contractType: true, priceCents: true, quantity: true, discountCents: true, competence: true,
      dueDay: true, generateCharge: true,
      client: { select: { status: true, contractEnd: true, paymentDay: true } },
    },
  })
  if (!s) return 0

  if (!isRecurringType(s.contractType)) {
    if (!s.competence) return 0
    const [y, m] = s.competence.split('-').map(Number)
    return (await ensureServicePayment(db, s, y, m)) ? 1 : 0
  }

  const start = s.startDate ?? new Date()
  let y = start.getUTCFullYear()
  let m = start.getUTCMonth() + 1
  const limit = s.endDate
    ? { y: s.endDate.getUTCFullYear(), m: s.endDate.getUTCMonth() + 1 }
    : null
  let created = 0
  for (let i = 0; i < 12; i++) {
    if (limit && (y > limit.y || (y === limit.y && m > limit.m))) break
    if (await ensureServicePayment(db, s, y, m)) created++
    m++
    if (m > 12) { m = 1; y++ }
  }
  return created
}

/**
 * Serviço pausado/encerrado: parcelas PENDENTES de competências a partir da
 * data informada saem; pagas ficam como histórico.
 */
export async function dropPendingPaymentsFrom(db: Db, serviceId: string, fromISO: string): Promise<number> {
  const [y, m] = fromISO.slice(0, 7).split('-').map(Number)
  const r = await db.clientPayment.deleteMany({
    where: {
      serviceId,
      status: 'PENDENTE',
      OR: [{ year: { gt: y } }, { year: y, month: { gte: m } }],
    },
  })
  return r.count
}

/**
 * Valor alterado com vigência: parcelas PENDENTES a partir da competência da
 * vigência recebem o novo valor; as anteriores e as pagas ficam como estavam.
 */
export async function repricePendingFrom(db: Db, serviceId: string, effectiveFromISO: string, cents: number): Promise<number> {
  const [y, m] = effectiveFromISO.slice(0, 7).split('-').map(Number)
  const r = await db.clientPayment.updateMany({
    where: {
      serviceId,
      status: 'PENDENTE',
      OR: [{ year: { gt: y } }, { year: y, month: { gte: m } }],
    },
    data: { amount: cents / 100 },
  })
  return r.count
}

export { competenceKey }
