import { prisma } from './prisma'
import { serviceCents, recurringTicketCents } from './billing-core'

/**
 * Catálogo de serviços da VEX (ServiceCatalog) — a origem única dos serviços
 * oferecidos. A contratação por cliente (ClientService) aponta para cá.
 */

export const CONTRACT_TYPES = ['RECORRENTE', 'AVULSO', 'PROJETO', 'QUANTIDADE', 'PERSONALIZADO'] as const
export type ContractType = (typeof CONTRACT_TYPES)[number]

export const CONTRACT_TYPE_LABEL: Record<ContractType, string> = {
  RECORRENTE: 'Mensal recorrente',
  AVULSO: 'Avulso',
  PROJETO: 'Projeto com prazo',
  QUANTIDADE: 'Por quantidade',
  PERSONALIZADO: 'Personalizado',
}

export function isContractType(v: unknown): v is ContractType {
  return typeof v === 'string' && (CONTRACT_TYPES as readonly string[]).includes(v)
}

function todayISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

/**
 * Migração suave: serviços já cadastrados nos clientes viram entradas do
 * catálogo (por nome) e passam a apontar para elas. Idempotente — só cria o
 * que falta e só vincula quem ainda não tem catálogo. Nada é apagado.
 */
export async function ensureCatalogFromExisting(): Promise<{ created: number; linked: number }> {
  const unlinked = await prisma.clientService.findMany({
    where: { catalogId: null },
    select: {
      id: true, serviceName: true, description: true, proposalDescription: true, defaultScope: true,
      defaultDeliverables: true, monthlyValue: true, priceCents: true, billingKind: true, contractType: true,
    },
  })
  if (unlinked.length === 0) return { created: 0, linked: 0 }

  const existing = await prisma.serviceCatalog.findMany({ select: { id: true, name: true } })
  const byKey = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c.id]))

  // Faixa observada por nome (mín/máx dos valores já praticados)
  const observed = new Map<string, { name: string; min: number; max: number; sample: (typeof unlinked)[number] }>()
  for (const s of unlinked) {
    const key = s.serviceName.trim().toLowerCase()
    const cents = serviceCents({ status: 'ATIVO', monthlyValue: s.monthlyValue, priceCents: s.priceCents })
    const cur = observed.get(key)
    if (!cur) observed.set(key, { name: s.serviceName.trim(), min: cents, max: cents, sample: s })
    else observed.set(key, { ...cur, min: cents > 0 ? Math.min(cur.min || cents, cents) : cur.min, max: Math.max(cur.max, cents) })
  }

  let created = 0
  for (const [key, o] of observed) {
    if (byKey.has(key)) continue
    const row = await prisma.serviceCatalog.create({
      data: {
        name: o.name,
        summary: o.sample.proposalDescription || o.sample.description || null,
        scope: o.sample.defaultScope || null,
        deliverables: o.sample.defaultDeliverables ?? [],
        billingType: o.sample.contractType || (o.sample.billingKind === 'UNICO' ? 'AVULSO' : 'RECORRENTE'),
        minCents: o.min > 0 ? o.min : null,
        maxCents: o.max > 0 ? o.max : null,
        defaultCents: o.max > 0 ? o.max : null,
        isActive: true,
      },
      select: { id: true },
    })
    byKey.set(key, row.id)
    created++
  }

  let linked = 0
  for (const s of unlinked) {
    const id = byKey.get(s.serviceName.trim().toLowerCase())
    if (!id) continue
    // Espelha o valor em centavos ao vincular (fonte de verdade daqui em diante)
    await prisma.clientService.update({
      where: { id: s.id },
      data: {
        catalogId: id,
        priceCents: s.priceCents ?? (s.monthlyValue != null ? Math.round(s.monthlyValue * 100) : null),
      },
    })
    linked++
  }
  return { created, linked }
}

/** Serviços do catálogo com contagem de clientes ativos e receita recorrente. */
export async function catalogWithStats() {
  const [catalog, services] = await Promise.all([
    prisma.serviceCatalog.findMany({ orderBy: { name: 'asc' } }),
    prisma.clientService.findMany({
      where: { catalogId: { not: null } },
      select: {
        catalogId: true, clientId: true, status: true, monthlyValue: true, startDate: true, endDate: true,
        contractType: true, priceCents: true, quantity: true, discountCents: true, competence: true,
        client: { select: { status: true } },
      },
    }),
  ])
  const today = todayISO()
  const stats = new Map<string, { clients: Set<string>; recurringCents: number }>()
  for (const s of services) {
    if (!s.catalogId || s.client.status !== 'ATIVO') continue
    const st = stats.get(s.catalogId) ?? { clients: new Set<string>(), recurringCents: 0 }
    if (s.status === 'ATIVO') st.clients.add(s.clientId)
    st.recurringCents += recurringTicketCents([s], today)
    stats.set(s.catalogId, st)
  }
  return catalog.map((c) => ({
    ...c,
    activeClients: stats.get(c.id)?.clients.size ?? 0,
    recurringCents: stats.get(c.id)?.recurringCents ?? 0,
  }))
}

/* ------------------------------ entrada da API ------------------------------ */

function parseCents(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n)
}

export function catalogDataFromBody(body: Record<string, unknown>) {
  const str = (k: string, max = 400) => (body[k] ? String(body[k]).trim().slice(0, max) : null)
  const list = (k: string) => (Array.isArray(body[k]) ? (body[k] as unknown[]).map((x) => String(x).trim()).filter(Boolean).slice(0, 30) : undefined)
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k)

  const data: Record<string, unknown> = {}
  if (has('name')) data.name = String(body.name ?? '').trim().slice(0, 120)
  if (has('category')) data.category = str('category', 80)
  if (has('summary')) data.summary = str('summary', 600)
  if (has('scope')) data.scope = str('scope', 6000)
  if (has('deliverables')) data.deliverables = list('deliverables') ?? []
  if (has('exclusions')) data.exclusions = list('exclusions') ?? []
  if (has('leadTimeDays')) data.leadTimeDays = body.leadTimeDays ? Math.max(0, Math.round(Number(body.leadTimeDays))) : null
  if (has('periodicity')) data.periodicity = str('periodicity', 40)
  if (has('billingType')) data.billingType = isContractType(body.billingType) ? body.billingType : 'RECORRENTE'
  if (has('minCents')) data.minCents = parseCents(body.minCents)
  if (has('maxCents')) data.maxCents = parseCents(body.maxCents)
  if (has('defaultCents')) data.defaultCents = parseCents(body.defaultCents)
  if (has('isActive')) data.isActive = !!body.isActive
  if (has('internalNotes')) data.internalNotes = str('internalNotes', 2000)
  return data
}

