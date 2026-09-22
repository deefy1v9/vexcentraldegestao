/**
 * Regras puras da tela Financeiro: linhas de recebíveis a partir das
 * parcelas + cobranças Asaas, situação por linha, filtros, ordenação e
 * contadores das abas. Sem React e sem Prisma.
 */

export interface PaymentLike {
  id: string
  month: number
  year: number
  amount: number
  dueDate: string
  paidAt?: string | null
  status: string // PENDENTE | PAGO | CANCELADO
  kind?: string | null // RECORRENTE | AVULSO
  service?: { id: string; serviceName: string; contractType: string; billingDescription?: string | null } | null
  client: { id: string; name: string; tier?: string | null }
}

export interface ChargeLike {
  id: string
  clientId: string
  status: string
  value: string
  dueDate: string
  invoiceUrl?: string | null
  bankSlipUrl?: string | null
  identificationField?: string | null
  lastError?: string | null
  nfse?: { id: string; status: string; pdfUrl?: string | null; xmlUrl?: string | null; lastError?: string | null; municipalMessage?: string | null } | null
  client: { id: string; name: string }
}

export interface EntryLike {
  id: string
  type: string // CUSTO | SALARIO | RECEITA
  category: string
  name?: string | null
  description: string
  amount: number
  dueDate?: string | null
  paidAt?: string | null
  status: string // PENDENTE | PAGO
  recurring: boolean
  user?: { id: string; name: string; position?: string | null } | null
}

const DAY = 24 * 60 * 60 * 1000

function startOfDay(d: Date): number {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime()
}

/** "AAAA-MM-DD" é dia civil (local); com hora, é instante. */
export function parseDue(value: string | Date): Date {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number)
    return new Date(y, m - 1, d, 12)
  }
  return new Date(value)
}

/** Dias até o vencimento (negativo = atrasado). */
export function daysUntil(due: string | null | undefined, now: Date = new Date()): number | null {
  if (!due) return null
  return Math.round((startOfDay(parseDue(due)) - startOfDay(now)) / DAY)
}

export function isOverdue(e: { status: string; dueDate?: string | null }, now: Date = new Date()): boolean {
  if (e.status !== 'PENDENTE' || !e.dueDate) return false
  const d = daysUntil(e.dueDate, now)
  return d != null && d < 0
}

export type RowSituation = 'pago' | 'atrasado' | 'pendente' | 'cancelado'

export const SITUATION_LABEL: Record<RowSituation, string> = {
  pago: 'Pago', atrasado: 'Atrasado', pendente: 'Pendente', cancelado: 'Cancelado',
}

export function situationOf(e: { status: string; dueDate?: string | null }, now: Date = new Date()): RowSituation {
  if (e.status === 'PAGO') return 'pago'
  if (e.status === 'CANCELADO') return 'cancelado'
  return isOverdue(e, now) ? 'atrasado' : 'pendente'
}

/* ------------------------------- recebíveis ------------------------------- */

export interface ReceivableRow {
  id: string
  /** Parcela local; null quando a linha só existe pela cobrança Asaas. */
  payment: PaymentLike | null
  charge: ChargeLike | null
  client: { id: string; name: string; tier?: string | null }
  label: string
  kind: 'RECORRENTE' | 'AVULSO' | 'ASAAS'
  amount: number
  dueDate: string
  paidAt: string | null
  situation: RowSituation
}

/**
 * Uma linha por parcela do mês; a cobrança Asaas do cliente (uma por
 * competência) vai junto em cada linha dele. Cliente com cobrança mas sem
 * parcela local vira uma linha própria.
 */
export function buildReceivableRows(payments: PaymentLike[], charges: ChargeLike[], now: Date = new Date()): ReceivableRow[] {
  const chargeByClient = new Map<string, ChargeLike>()
  for (const c of charges) chargeByClient.set(c.clientId, c)
  const rows: ReceivableRow[] = payments.map((p) => ({
    id: p.id,
    payment: p,
    charge: chargeByClient.get(p.client.id) ?? null,
    client: p.client,
    label: p.service?.billingDescription || p.service?.serviceName || `Competência ${String(p.month).padStart(2, '0')}/${p.year}`,
    kind: p.kind === 'AVULSO' ? 'AVULSO' : 'RECORRENTE',
    amount: p.amount,
    dueDate: p.dueDate,
    paidAt: p.paidAt ?? null,
    situation: situationOf(p, now),
  }))
  const comParcela = new Set(payments.map((p) => p.client.id))
  for (const c of charges) {
    if (comParcela.has(c.clientId)) continue
    const st = ['RECEIVED', 'CONFIRMED'].includes(c.status) ? 'PAGO' : ['CANCELLED', 'DELETED'].includes(c.status) ? 'CANCELADO' : 'PENDENTE'
    rows.push({
      id: `charge-${c.id}`,
      payment: null,
      charge: c,
      client: { id: c.clientId, name: c.client.name },
      label: 'Cobrança Asaas',
      kind: 'ASAAS',
      amount: Number(c.value) || 0,
      dueDate: c.dueDate,
      paidAt: null,
      situation: situationOf({ status: st, dueDate: c.dueDate }, now),
    })
  }
  return rows
}

export type FinTab = 'visao' | 'recebiveis' | 'atrasados' | 'custos' | 'salarios'

export const FIN_TAB_LABEL: Record<FinTab, string> = {
  visao: 'Visão geral', recebiveis: 'Recebíveis', atrasados: 'Atrasados', custos: 'Custos', salarios: 'Salários',
}

export function finTabCounts(rows: ReceivableRow[], costs: EntryLike[], salaries: EntryLike[], now: Date = new Date()): Record<FinTab, number> {
  const abertas = rows.filter((r) => r.situation === 'pendente' || r.situation === 'atrasado')
  const atrasados = rows.filter((r) => r.situation === 'atrasado').length
    + costs.filter((e) => isOverdue(e, now)).length
    + salaries.filter((e) => isOverdue(e, now)).length
  return {
    visao: 0,
    recebiveis: abertas.length,
    atrasados,
    custos: costs.filter((e) => e.status !== 'PAGO').length,
    salarios: salaries.filter((e) => e.status !== 'PAGO').length,
  }
}

export interface FinFilters {
  q: string
  situation: '' | RowSituation
  kind: '' | 'RECORRENTE' | 'AVULSO' | 'ASAAS'
  category: string
}

export const EMPTY_FIN_FILTERS: FinFilters = { q: '', situation: '', kind: '', category: '' }

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function filterReceivables(rows: ReceivableRow[], f: FinFilters): ReceivableRow[] {
  const q = normalize(f.q.trim())
  return rows.filter((r) => {
    if (q && !normalize(`${r.client.name} ${r.label}`).includes(q)) return false
    if (f.situation && r.situation !== f.situation) return false
    if (f.kind && r.kind !== f.kind) return false
    return true
  })
}

export function filterEntries<T extends EntryLike>(entries: T[], f: FinFilters, now: Date = new Date()): T[] {
  const q = normalize(f.q.trim())
  return entries.filter((e) => {
    if (q && !normalize(`${e.name ?? ''} ${e.description} ${e.category} ${e.user?.name ?? ''}`).includes(q)) return false
    if (f.situation && situationOf(e, now) !== f.situation) return false
    if (f.kind === 'RECORRENTE' && !e.recurring) return false
    if (f.kind === 'AVULSO' && e.recurring) return false
    if (f.category && e.category !== f.category) return false
    return true
  })
}

export type FinSort = 'vencimento' | 'valor' | 'nome'

export const FIN_SORT_LABEL: Record<FinSort, string> = {
  vencimento: 'Vencimento mais próximo', valor: 'Maior valor', nome: 'Nome (A–Z)',
}

const SIT_ORDER: Record<RowSituation, number> = { atrasado: 0, pendente: 1, pago: 2, cancelado: 3 }

/** Atrasados primeiro, depois pendentes, pagos e cancelados; dentro, o critério escolhido. */
export function sortReceivables(rows: ReceivableRow[], sort: FinSort): ReceivableRow[] {
  return [...rows].sort((a, b) => {
    const s = SIT_ORDER[a.situation] - SIT_ORDER[b.situation]
    if (s !== 0) return s
    if (sort === 'valor') return b.amount - a.amount
    if (sort === 'nome') return a.client.name.localeCompare(b.client.name, 'pt-BR')
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
  })
}

export function sortEntries<T extends EntryLike>(entries: T[], sort: FinSort, now: Date = new Date()): T[] {
  return [...entries].sort((a, b) => {
    const s = SIT_ORDER[situationOf(a, now)] - SIT_ORDER[situationOf(b, now)]
    if (s !== 0) return s
    if (sort === 'valor') return b.amount - a.amount
    if (sort === 'nome') return (a.user?.name ?? a.name ?? a.description).localeCompare(b.user?.name ?? b.name ?? b.description, 'pt-BR')
    return (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) - (b.dueDate ? new Date(b.dueDate).getTime() : Infinity)
  })
}

/** Total das linhas visíveis por situação (rodapé da tabela). */
export function totalsBySituation(rows: Array<{ amount: number; situation: RowSituation }>): Record<RowSituation, number> {
  const t: Record<RowSituation, number> = { pago: 0, atrasado: 0, pendente: 0, cancelado: 0 }
  for (const r of rows) t[r.situation] += r.amount
  return t
}

/** "18 set", para colunas de data. */
export function shortDate(value: string | Date): string {
  return parseDue(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')
}
