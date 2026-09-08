import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import {
  DEFAULT_TIER_RANGES, recommendTierCents, recurringTicketCents, type TierName,
} from './billing-core'

type Db = Prisma.TransactionClient | typeof prisma

export type Tier = TierName

export const TIER_LABEL: Record<Tier, string> = {
  START: 'Start',
  GROWTH: 'Growth',
  SCALE: 'Scale',
}

function todayISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

/**
 * Faixas de ticket (centavos). Configuráveis em SystemSettings
 * (TIER_START_MAX / TIER_GROWTH_MAX, em reais); sem configuração válida
 * valem os padrões da operação: Start ≤ 1.500,00 · Growth ≤ 3.000,00.
 * Nunca devolve null — cliente com serviço recorrente ativo sempre recebe
 * grupo (era isto que deixava clientes "Não classificados").
 */
export async function getTierRanges(db: Db = prisma): Promise<{ startMax: number; growthMax: number; startMaxCents: number; growthMaxCents: number }> {
  const rows = await db.$queryRaw<Array<{ key: string; value: string }>>`
    SELECT key, value FROM "SystemSettings" WHERE key IN ('TIER_START_MAX', 'TIER_GROWTH_MAX')
  `
  const map = Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]))
  let startMaxCents = Math.round((map['TIER_START_MAX'] ?? 0) * 100)
  let growthMaxCents = Math.round((map['TIER_GROWTH_MAX'] ?? 0) * 100)
  if (!Number.isFinite(startMaxCents) || !Number.isFinite(growthMaxCents) || startMaxCents <= 0 || growthMaxCents <= startMaxCents) {
    startMaxCents = DEFAULT_TIER_RANGES.startMaxCents
    growthMaxCents = DEFAULT_TIER_RANGES.growthMaxCents
  }
  return { startMax: startMaxCents / 100, growthMax: growthMaxCents / 100, startMaxCents, growthMaxCents }
}

/** Compatibilidade: grupo a partir do ticket em reais. */
export function recommendTier(ticket: number, ranges: { startMax: number; growthMax: number }): Tier | null {
  return recommendTierCents(Math.round(ticket * 100), {
    startMaxCents: Math.round(ranges.startMax * 100),
    growthMaxCents: Math.round(ranges.growthMax * 100),
  })
}

/**
 * Ticket recorrente atual do cliente, em centavos, direto dos serviços —
 * nunca do campo derivado Client.monthlyValue.
 */
export async function clientTicketCents(db: Db, clientId: string): Promise<number> {
  const services = await db.clientService.findMany({
    where: { clientId },
    select: {
      status: true, monthlyValue: true, startDate: true, endDate: true,
      contractType: true, priceCents: true, quantity: true, discountCents: true, competence: true,
    },
  })
  return recurringTicketCents(services, todayISO())
}

/**
 * Reclassifica o cliente pela faixa. Classificação manual nunca é
 * sobrescrita; toda mudança vai para o histórico com ticket, origem e a
 * recomendação da regra. Ticket zero → sem grupo ("Não classificado").
 */
export async function applyAutoTier(db: Db, clientId: string, ticketOverride?: number) {
  const client = await db.client.findUnique({
    where: { id: clientId },
    select: { tier: true, tierManual: true },
  })
  if (!client) return
  const ticketCents = ticketOverride != null ? Math.round(ticketOverride * 100) : await clientTicketCents(db, clientId)
  const ranges = await getTierRanges(db)
  const next = recommendTierCents(ticketCents, ranges)

  if (client.tierManual) return // manual manda; a recomendação é só informativa
  if ((client.tier ?? null) === next) return

  await db.client.update({
    where: { id: clientId },
    data: { tier: next, tierChangedAt: new Date() },
  })
  await db.clientTierHistory.create({
    data: {
      clientId, fromTier: client.tier, toTier: next, ticket: ticketCents / 100,
      manual: false, source: 'AUTO', recommended: next,
    },
  })
}

/**
 * Classificação manual por admin (ou remoção dela — volta ao automático).
 * `tier === null` limpa a marca manual e reclassifica pela faixa.
 */
export async function setManualTier(clientId: string, tier: Tier | null, userId: string, reason?: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { tier: true, tierManual: true },
  })
  if (!client) return

  const ticketCents = await clientTicketCents(prisma, clientId)
  const recommended = recommendTierCents(ticketCents, await getTierRanges(prisma))
  const ticket = ticketCents / 100

  if (tier === null) {
    if (!client.tierManual) return
    await prisma.client.update({ where: { id: clientId }, data: { tierManual: false } })
    await prisma.clientTierHistory.create({
      data: {
        clientId, fromTier: client.tier, toTier: client.tier, ticket, manual: true, userId,
        source: 'MANUAL_REMOVIDA', recommended, reason: reason?.slice(0, 300) ?? null,
      },
    })
    await applyAutoTier(prisma, clientId)
    return
  }

  if (client.tier === tier && client.tierManual) return
  await prisma.client.update({
    where: { id: clientId },
    data: { tier, tierManual: true, tierChangedAt: new Date() },
  })
  await prisma.clientTierHistory.create({
    data: {
      clientId, fromTier: client.tier, toTier: tier, ticket, manual: true, userId,
      source: 'MANUAL', recommended, reason: reason?.slice(0, 300) ?? null,
    },
  })
}

/**
 * Reclassifica TODOS os clientes sem marca manual pelas faixas atuais
 * (usada ao salvar faixas e na correção de clientes "Não classificados").
 */
export async function reclassifyAllClients(): Promise<{ updated: number }> {
  const ranges = await getTierRanges(prisma)
  const clients = await prisma.client.findMany({
    where: { tierManual: false },
    select: { id: true, tier: true },
  })

  let updated = 0
  for (const c of clients) {
    const ticketCents = await clientTicketCents(prisma, c.id)
    const next = recommendTierCents(ticketCents, ranges)
    if ((c.tier ?? null) === next) continue
    await prisma.client.update({
      where: { id: c.id },
      data: { tier: next, tierChangedAt: new Date() },
    })
    await prisma.clientTierHistory.create({
      data: {
        clientId: c.id, fromTier: c.tier, toTier: next, ticket: ticketCents / 100,
        manual: false, source: 'AUTO', recommended: next,
      },
    })
    updated++
  }
  return { updated }
}

/** Recomendação automática atual (para exibir ao lado da manual). */
export async function tierRecommendation(clientId: string): Promise<{ ticketCents: number; recommended: Tier | null }> {
  const ticketCents = await clientTicketCents(prisma, clientId)
  return { ticketCents, recommended: recommendTierCents(ticketCents, await getTierRanges(prisma)) }
}

/** Prioridade de demanda herdada do grupo: Scale alta, Growth média, Start padrão. */
export function tierPriority(tier: string | null | undefined): 'ALTA' | 'MEDIA' {
  return tier === 'SCALE' ? 'ALTA' : 'MEDIA'
}

/** Peso para ordenação (maior = mais prioridade operacional). */
export function tierWeight(tier: string | null | undefined): number {
  return tier === 'SCALE' ? 3 : tier === 'GROWTH' ? 2 : tier === 'START' ? 1 : 0
}
