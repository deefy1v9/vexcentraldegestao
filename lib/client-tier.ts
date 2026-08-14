import { Prisma } from '@prisma/client'
import { prisma } from './prisma'

type Db = Prisma.TransactionClient | typeof prisma

export type Tier = 'START' | 'GROWTH' | 'SCALE'

export const TIER_LABEL: Record<Tier, string> = {
  START: 'Start',
  GROWTH: 'Growth',
  SCALE: 'Scale',
}

/**
 * Faixas de ticket configuráveis pelos administradores (SystemSettings):
 *   Start  → ticket ≤ TIER_START_MAX
 *   Growth → TIER_START_MAX < ticket ≤ TIER_GROWTH_MAX
 *   Scale  → ticket > TIER_GROWTH_MAX
 * Sem faixas configuradas o sistema não recomenda grupo (nada de valores
 * arbitrários) — a classificação manual continua disponível.
 */
export async function getTierRanges(db: Db = prisma): Promise<{ startMax: number; growthMax: number } | null> {
  const rows = await db.$queryRaw<Array<{ key: string; value: string }>>`
    SELECT key, value FROM "SystemSettings" WHERE key IN ('TIER_START_MAX', 'TIER_GROWTH_MAX')
  `
  const map = Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]))
  const startMax = map['TIER_START_MAX']
  const growthMax = map['TIER_GROWTH_MAX']
  if (!Number.isFinite(startMax) || !Number.isFinite(growthMax) || startMax <= 0 || growthMax <= startMax) {
    return null
  }
  return { startMax, growthMax }
}

export function recommendTier(ticket: number, ranges: { startMax: number; growthMax: number }): Tier {
  if (ticket <= ranges.startMax) return 'START'
  if (ticket <= ranges.growthMax) return 'GROWTH'
  return 'SCALE'
}

/**
 * Reclassifica o cliente pela faixa de ticket após mudança nos serviços.
 * Classificação manual nunca é sobrescrita. Toda mudança vai pro histórico.
 */
export async function applyAutoTier(db: Db, clientId: string, ticket: number) {
  const client = await db.client.findUnique({
    where: { id: clientId },
    select: { tier: true, tierManual: true },
  })
  if (!client || client.tierManual) return

  const ranges = await getTierRanges(db)
  if (!ranges) return

  const next = recommendTier(ticket, ranges)
  if (client.tier === next) return

  await db.client.update({
    where: { id: clientId },
    data: { tier: next, tierChangedAt: new Date() },
  })
  await db.clientTierHistory.create({
    data: { clientId, fromTier: client.tier, toTier: next, ticket, manual: false },
  })
}

/**
 * Classificação manual por admin (ou remoção dela — volta ao automático).
 * `tier === null` limpa a marca manual e reclassifica pela faixa.
 */
export async function setManualTier(clientId: string, tier: Tier | null, userId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { tier: true, tierManual: true, monthlyValue: true },
  })
  if (!client) return

  const ticket = client.monthlyValue ?? 0

  if (tier === null) {
    // Remove a classificação manual e volta ao automático
    if (!client.tierManual) return
    await prisma.client.update({ where: { id: clientId }, data: { tierManual: false } })
    await prisma.clientTierHistory.create({
      data: { clientId, fromTier: client.tier, toTier: client.tier, ticket, manual: true, userId },
    })
    await applyAutoTier(prisma, clientId, ticket)
    return
  }

  if (client.tier === tier && client.tierManual) return
  await prisma.client.update({
    where: { id: clientId },
    data: { tier, tierManual: true, tierChangedAt: new Date() },
  })
  await prisma.clientTierHistory.create({
    data: { clientId, fromTier: client.tier, toTier: tier, ticket, manual: true, userId },
  })
}

/**
 * Reclassifica TODOS os clientes sem marca manual pelas faixas atuais.
 * Usada ao salvar as faixas: os clientes existentes entram nos grupos na
 * hora; os próximos são classificados na criação e a cada mudança de
 * serviços. Toda mudança vai para o histórico.
 */
export async function reclassifyAllClients(): Promise<{ updated: number }> {
  const ranges = await getTierRanges(prisma)
  if (!ranges) return { updated: 0 }

  const clients = await prisma.client.findMany({
    where: { tierManual: false },
    select: { id: true, tier: true, monthlyValue: true },
  })

  let updated = 0
  for (const c of clients) {
    const ticket = c.monthlyValue ?? 0
    const next = recommendTier(ticket, ranges)
    if (c.tier === next) continue
    await prisma.client.update({
      where: { id: c.id },
      data: { tier: next, tierChangedAt: new Date() },
    })
    await prisma.clientTierHistory.create({
      data: { clientId: c.id, fromTier: c.tier, toTier: next, ticket, manual: false },
    })
    updated++
  }
  return { updated }
}

/** Prioridade de demanda herdada do grupo: Scale alta, Growth média, Start padrão. */
export function tierPriority(tier: string | null | undefined): 'ALTA' | 'MEDIA' {
  return tier === 'SCALE' ? 'ALTA' : 'MEDIA'
}

/** Peso para ordenação (maior = mais prioridade operacional). */
export function tierWeight(tier: string | null | undefined): number {
  return tier === 'SCALE' ? 3 : tier === 'GROWTH' ? 2 : tier === 'START' ? 1 : 0
}
