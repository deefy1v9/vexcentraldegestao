/**
 * Regras puras das propostas comerciais — sem Prisma, sem I/O, testáveis.
 *
 * Dinheiro SEMPRE em centavos inteiros: nenhum cálculo passa por float.
 * Datas tratadas como dia civil (YYYY-MM-DD) em America/Sao_Paulo.
 */

export const TZ = 'America/Sao_Paulo'

/* ------------------------------- documentos ------------------------------- */

export function onlyDigits(v: string | null | undefined): string {
  return (v ?? '').replace(/\D/g, '')
}

/** Valida CPF pelos dígitos verificadores (rejeita sequências repetidas). */
export function isValidCPF(value: string): boolean {
  const cpf = onlyDigits(value)
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false
  for (const [len, factor] of [[9, 10], [10, 11]] as const) {
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (factor - i)
    const check = (sum * 10) % 11 % 10
    if (check !== Number(cpf[len])) return false
  }
  return true
}

/** Valida CNPJ pelos dígitos verificadores. */
export function isValidCNPJ(value: string): boolean {
  const cnpj = onlyDigits(value)
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false
  const calc = (len: number): number => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(cnpj[i]) * weights[i]
    const rest = sum % 11
    return rest < 2 ? 0 : 11 - rest
  }
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13])
}

export type PersonType = 'PF' | 'PJ'

export function isValidDocument(value: string, personType?: PersonType): boolean {
  const digits = onlyDigits(value)
  if (personType === 'PF') return isValidCPF(digits)
  if (personType === 'PJ') return isValidCNPJ(digits)
  return digits.length === 11 ? isValidCPF(digits) : isValidCNPJ(digits)
}

export function personTypeOf(document: string): PersonType {
  return onlyDigits(document).length === 11 ? 'PF' : 'PJ'
}

/** 12345678909 → 123.456.789-09 · 68652648000186 → 68.652.648/0001-86 */
export function formatDocument(value: string | null | undefined): string {
  const d = onlyDigits(value)
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return value ?? ''
}

/**
 * Documento mascarado para listas e logs — mostra só o suficiente para
 * conferência humana, nunca o número inteiro.
 */
export function maskDocument(value: string | null | undefined): string {
  const d = onlyDigits(value)
  if (d.length === 11) return `***.${d.slice(3, 6)}.***-**`
  if (d.length === 14) return `**.${d.slice(2, 5)}.***/****-**`
  return '***'
}

export function formatPhone(value: string | null | undefined): string {
  const d = onlyDigits(value).replace(/^55(?=\d{10,11}$)/, '')
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  return value ?? ''
}

export function formatZip(value: string | null | undefined): string {
  const d = onlyDigits(value)
  return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, '$1-$2') : (value ?? '')
}

/* --------------------------------- dinheiro --------------------------------- */

/** "1.234,56" | "1234.56" | 1234.56 → 123456 centavos. */
export function toCents(input: string | number | null | undefined): number {
  if (input === null || input === undefined || input === '') return 0
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return 0
    return Math.round(input * 100)
  }
  const raw = input.trim()
  if (!raw) return 0
  // Formato brasileiro: ponto é milhar, vírgula é decimal
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw
  const n = Number(normalized.replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

export function centsToNumber(cents: number): number {
  return Math.round(cents) / 100
}

export function formatBRL(cents: number): string {
  const value = Math.round(cents) / 100
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

/** Percentual sobre centavos, arredondado para o centavo mais próximo. */
export function percentOf(cents: number, percent: number): number {
  if (!Number.isFinite(percent) || percent <= 0) return 0
  return Math.round((cents * percent) / 100)
}

/* --------------------------------- cálculos --------------------------------- */

export interface ProposalItemInput {
  name: string
  quantity: number
  monthlyCents: number
  setupCents: number
  discountCents: number
  discountPercent?: number | null
  months: number
  periodicity: 'MENSAL' | 'UNICO'
}

export interface ItemTotals {
  grossMonthlyCents: number // mensal × quantidade, antes do desconto
  grossSetupCents: number
  discountCents: number // desconto aplicado (fixo + percentual)
  monthlyCents: number // mensal já com desconto
  setupCents: number // único já com desconto
  totalCents: number // mensal × meses + único
}

/**
 * Totais de um item. O desconto percentual incide sobre o bruto do item
 * (mensal + único) e soma ao desconto fixo; o resultado nunca fica negativo.
 */
export function itemTotals(item: ProposalItemInput): ItemTotals {
  const qty = Math.max(1, Math.round(item.quantity || 1))
  const grossMonthly = item.periodicity === 'UNICO' ? 0 : Math.max(0, Math.round(item.monthlyCents)) * qty
  const grossSetup = Math.max(0, Math.round(item.setupCents)) * (item.periodicity === 'UNICO' ? qty : 1)
  const gross = grossMonthly + grossSetup

  const fixed = Math.max(0, Math.round(item.discountCents))
  const byPercent = percentOf(gross, item.discountPercent ?? 0)
  const discount = Math.min(gross, fixed + byPercent)

  // Desconto abate primeiro o valor único, depois a mensalidade
  const setupDiscount = Math.min(grossSetup, discount)
  const monthlyDiscount = discount - setupDiscount

  const monthly = Math.max(0, grossMonthly - monthlyDiscount)
  const setup = Math.max(0, grossSetup - setupDiscount)
  const months = item.periodicity === 'UNICO' ? 0 : Math.max(0, Math.round(item.months || 0))

  return {
    grossMonthlyCents: grossMonthly,
    grossSetupCents: grossSetup,
    discountCents: discount,
    monthlyCents: monthly,
    setupCents: setup,
    totalCents: monthly * months + setup,
  }
}

export interface ProposalTotals {
  monthlyCents: number // mensalidade recorrente final
  setupCents: number // pagamento inicial (único/setup)
  itemsDiscountCents: number
  generalDiscountCents: number
  totalCents: number // total durante a vigência
  months: number // maior duração entre os itens recorrentes
  items: ItemTotals[]
}

/**
 * Totais da proposta. `months` é a maior duração entre os itens recorrentes —
 * é o que define a vigência exibida no documento.
 */
export function proposalTotals(
  items: ProposalItemInput[],
  general: { discountCents?: number; discountPercent?: number | null } = {},
): ProposalTotals {
  const computed = items.map(itemTotals)
  const monthlyGross = computed.reduce((s, t) => s + t.monthlyCents, 0)
  const setupGross = computed.reduce((s, t) => s + t.setupCents, 0)
  const itemsDiscount = computed.reduce((s, t) => s + t.discountCents, 0)
  const months = items.reduce(
    (max, item) => (item.periodicity === 'UNICO' ? max : Math.max(max, Math.max(0, Math.round(item.months || 0)))),
    0,
  )

  const base = monthlyGross * months + setupGross
  const fixed = Math.max(0, Math.round(general.discountCents ?? 0))
  const byPercent = percentOf(base, general.discountPercent ?? 0)
  const generalDiscount = Math.min(base, fixed + byPercent)

  return {
    monthlyCents: monthlyGross,
    setupCents: setupGross,
    itemsDiscountCents: itemsDiscount,
    generalDiscountCents: generalDiscount,
    totalCents: Math.max(0, base - generalDiscount),
    months,
    items: computed,
  }
}

/* ------------------------------- numeração ------------------------------- */

export type ProposalKind = 'PROPOSTA' | 'ADITIVO'

export function proposalPrefix(kind: ProposalKind): string {
  return kind === 'ADITIVO' ? 'ADT' : 'PROP'
}

/** PROP-2026-0001 / ADT-2026-0007 */
export function formatProposalNumber(kind: ProposalKind, year: number, seq: number): string {
  return `${proposalPrefix(kind)}-${year}-${String(seq).padStart(4, '0')}`
}

/* --------------------------------- datas --------------------------------- */

export function spTodayISO(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: TZ })
}

export function isoToDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`)
}

export function addDaysISO(iso: string, days: number): string {
  return new Date(isoToDate(iso).getTime() + days * 86_400_000).toISOString().slice(0, 10)
}

export function formatDateBR(value: string | Date | null | undefined): string {
  if (!value) return ''
  const iso = typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10)
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : ''
}

/** Proposta vencida: validade estritamente anterior ao dia civil de hoje. */
export function isExpired(validUntil: string | Date, today: string = spTodayISO()): boolean {
  const iso = typeof validUntil === 'string' ? validUntil.slice(0, 10) : validUntil.toISOString().slice(0, 10)
  return iso < today
}

/* ------------------------------- placeholders ------------------------------- */

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g

/** Nomes de placeholder usados no texto (sem duplicar). */
export function extractPlaceholders(text: string): string[] {
  const found = new Set<string>()
  for (const match of text.matchAll(PLACEHOLDER_RE)) found.add(match[1])
  return [...found]
}

export interface RenderResult {
  text: string
  missing: string[]
}

/**
 * Substituição determinística (sem IA). Placeholder sem valor é reportado em
 * `missing` — o chamador decide bloquear a geração. Nada de `undefined`,
 * `null` ou `{{campo}}` sobrando no documento final.
 */
export function renderTemplate(text: string, values: Record<string, string | number | null | undefined>): RenderResult {
  const missing = new Set<string>()
  const out = text.replace(PLACEHOLDER_RE, (_full, key: string) => {
    const value = values[key]
    if (value === null || value === undefined || String(value).trim() === '') {
      missing.add(key)
      return ''
    }
    return String(value)
  })
  return { text: out, missing: [...missing] }
}

/* ------------------------------ obrigatórios ------------------------------ */

export interface ProposalDraft {
  recipientName?: string | null
  document?: string | null
  email?: string | null
  issueDate?: string | null
  validUntil?: string | null
  items?: Array<{ name?: string | null; monthlyCents?: number; setupCents?: number; periodicity?: string }>
}

/** Campos que impedem a geração do documento quando ausentes/invalidos. */
export function missingProposalFields(draft: ProposalDraft): string[] {
  const missing: string[] = []
  if (!draft.recipientName?.trim()) missing.push('Nome ou razão social')
  const doc = onlyDigits(draft.document)
  if (!doc) missing.push('CPF/CNPJ')
  else if (!isValidDocument(doc)) missing.push('CPF/CNPJ válido')
  if (!draft.issueDate) missing.push('Data da proposta')
  if (!draft.validUntil) missing.push('Validade')
  if (draft.issueDate && draft.validUntil && draft.validUntil < draft.issueDate) {
    missing.push('Validade posterior à data da proposta')
  }
  const items = draft.items ?? []
  if (items.length === 0) missing.push('Ao menos um serviço')
  if (items.some((i) => !i.name?.trim())) missing.push('Nome de todos os serviços')
  if (items.length > 0 && items.every((i) => (i.monthlyCents ?? 0) === 0 && (i.setupCents ?? 0) === 0)) {
    missing.push('Valor em ao menos um serviço')
  }
  return missing
}

/* --------------------------------- aditivo --------------------------------- */

export type ChangeType = 'ADICIONA' | 'REMOVE' | 'ALTERA' | 'MANTEM'

export interface AddendumLine {
  name: string
  changeType: ChangeType
  previousMonthlyCents: number
  newMonthlyCents: number
  previousMonths: number
  newMonths: number
}

export interface AddendumComparison {
  lines: Array<AddendumLine & { deltaMonthlyCents: number }>
  previousMonthlyCents: number
  newMonthlyCents: number
  deltaMonthlyCents: number
  deltaTotalCents: number
}

/**
 * Comparação antes/depois do aditivo. O contrato original não é tocado: isto
 * é só a diferença apresentada no documento.
 */
export function compareAddendum(lines: AddendumLine[], months: number): AddendumComparison {
  const detailed = lines.map((l) => ({ ...l, deltaMonthlyCents: l.newMonthlyCents - l.previousMonthlyCents }))
  const previousMonthly = lines.reduce((s, l) => s + l.previousMonthlyCents, 0)
  const newMonthly = lines.reduce((s, l) => s + l.newMonthlyCents, 0)
  const delta = newMonthly - previousMonthly
  return {
    lines: detailed,
    previousMonthlyCents: previousMonthly,
    newMonthlyCents: newMonthly,
    deltaMonthlyCents: delta,
    deltaTotalCents: delta * Math.max(0, Math.round(months)),
  }
}

/* --------------------------------- e-mail --------------------------------- */

/**
 * Referência de idempotência do envio: a mesma proposta na mesma versão só
 * sai uma vez, mesmo com clique duplo ou requisição repetida.
 */
export function proposalMailRef(proposalId: string, version: number): string {
  return `proposal:${proposalId}:v${version}`
}

/* ------------------------------ nome de arquivo ------------------------------ */

/** Nome seguro para download — sem caminho, sem caractere especial. */
export function safeFileName(base: string, ext: string): string {
  const clean = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    // Sequências de ponto viram um só: nada de "..", nome oculto ou travessia
    .replace(/\.{2,}/g, '.')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 80) || 'documento'
  return `${clean}.${ext.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin'}`
}
