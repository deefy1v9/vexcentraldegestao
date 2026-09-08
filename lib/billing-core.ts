/**
 * Regras puras do faturamento — sem Prisma, sem rede — para serem testáveis
 * isoladamente (scripts/tests). Timezone de referência: America/Sao_Paulo.
 */
import { brazilHolidays } from './planner-core'

/**
 * Regra de vencimento da parcela:
 * - DIA_FIXO: dia do mês (o padrão; 31 vira o último dia de fevereiro).
 * - DIA_UTIL: enésimo dia útil do mês, pulando fim de semana e feriado
 *   nacional. Contrato que diz "5º dia útil" nunca vira "dia 5".
 */
export const DUE_RULES = ['DIA_FIXO', 'DIA_UTIL'] as const
export type DueRule = (typeof DUE_RULES)[number]

export function isDueRule(v: unknown): v is DueRule {
  return typeof v === 'string' && (DUE_RULES as readonly string[]).includes(v)
}

/**
 * Enésimo dia útil do mês (1 = primeiro). Se o mês não tiver dias úteis
 * suficientes, devolve o último dia útil disponível.
 */
export function nthBusinessDayISO(year: number, month: number, nth: number): string {
  const feriados = new Set(brazilHolidays(year))
  const ultimo = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const alvo = Math.max(1, Math.round(nth || 1))
  let uteis = 0
  let ultimoUtil = 1
  for (let dia = 1; dia <= ultimo; dia++) {
    const d = new Date(Date.UTC(year, month - 1, dia))
    const semana = d.getUTCDay() // 0 = domingo, 6 = sábado
    if (semana === 0 || semana === 6) continue
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
    if (feriados.has(iso)) continue
    uteis++
    ultimoUtil = dia
    if (uteis === alvo) return iso
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(ultimoUtil).padStart(2, '0')}`
}

/** Vencimento da competência conforme a regra contratada. */
export function dueDateForRule(year: number, month: number, day: number, rule?: string | null): string {
  if (rule === 'DIA_UTIL') return nthBusinessDayISO(year, month, day)
  return dueDateFor(year, month, day)
}

export interface ServiceLike {
  monthlyValue?: number | null
  status: string
  startDate?: Date | string | null
  endDate?: Date | string | null
  // ---- contratação pelo catálogo (opcionais para manter compatibilidade) ----
  contractType?: string | null // RECORRENTE | AVULSO | PROJETO | QUANTIDADE | PERSONALIZADO
  priceCents?: number | null
  quantity?: number | null
  discountCents?: number | null
  competence?: string | null // YYYY-MM (AVULSO)
  id?: string
  serviceName?: string
  billingDescription?: string | null
}

export interface ClientLike {
  status: string
  contractEnd?: Date | string | null
}

/** Início e fim (exclusivo) da competência no calendário civil. */
export function competenceRange(year: number, month: number) {
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  }
}

export function competenceKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

/** Serviço ativo para cálculo: só ATIVO conta (pausado/encerrado/legado não). */
export function isServiceActive(s: { status: string }): boolean {
  return s.status === 'ATIVO'
}

/** Avulso é o único tipo que não se repete mês a mês. */
export function isRecurringType(contractType: string | null | undefined): boolean {
  return (contractType ?? 'RECORRENTE') !== 'AVULSO'
}

/** Tipos que compõem o ticket mensal (MRR): recorrência sem prazo fixo. */
export function countsForMrr(contractType: string | null | undefined): boolean {
  const t = contractType ?? 'RECORRENTE'
  return t === 'RECORRENTE' || t === 'QUANTIDADE' || t === 'PERSONALIZADO'
}

/**
 * Valor líquido do serviço em centavos: negociado × quantidade − desconto.
 * `priceCents` é a fonte de verdade; `monthlyValue` (float legado) só entra
 * quando o serviço ainda não foi migrado para centavos.
 */
export function serviceCents(s: ServiceLike): number {
  const base = s.priceCents != null
    ? Math.max(0, Math.round(s.priceCents))
    : s.monthlyValue != null ? Math.max(0, Math.round(s.monthlyValue * 100)) : 0
  const qty = Math.max(1, Math.round(s.quantity ?? 1))
  const discount = Math.max(0, Math.round(s.discountCents ?? 0))
  return Math.max(0, base * qty - discount)
}

/**
 * O serviço entra na competência?
 * - AVULSO: só na competência escolhida.
 * - Demais: ativo, iniciado até o fim do mês e não encerrado antes do início.
 */
export function serviceInCompetence(s: ServiceLike, year: number, month: number): boolean {
  if (!isServiceActive(s)) return false
  if (serviceCents(s) <= 0) return false
  if (!isRecurringType(s.contractType)) {
    return (s.competence ?? '') === competenceKey(year, month)
  }
  const { start, end } = competenceRange(year, month)
  if (s.startDate && new Date(s.startDate) >= end) return false // começa depois
  if (s.endDate && new Date(s.endDate) < start) return false // terminou antes
  return true
}

export interface CompetenceItem {
  serviceId?: string
  description: string
  cents: number
  kind: 'RECORRENTE' | 'AVULSO'
}

export interface CompetenceBreakdown {
  recurringCents: number
  avulsoCents: number
  totalCents: number
  items: CompetenceItem[]
}

/**
 * Composição da competência: recorrentes ativos + avulsos do mês. Base única
 * para cobrança, receita prevista, itens da NFS-e e relatórios.
 */
export function competenceBreakdown(
  client: ClientLike,
  services: ServiceLike[],
  year: number,
  month: number,
): CompetenceBreakdown {
  const empty: CompetenceBreakdown = { recurringCents: 0, avulsoCents: 0, totalCents: 0, items: [] }
  if (client.status !== 'ATIVO') return empty
  const { start } = competenceRange(year, month)
  if (client.contractEnd && new Date(client.contractEnd) < start) return empty

  const items: CompetenceItem[] = []
  let recurring = 0
  let avulso = 0
  for (const s of services) {
    if (!serviceInCompetence(s, year, month)) continue
    const cents = serviceCents(s)
    const kind: 'RECORRENTE' | 'AVULSO' = isRecurringType(s.contractType) ? 'RECORRENTE' : 'AVULSO'
    if (kind === 'AVULSO') avulso += cents
    else recurring += cents
    items.push({
      serviceId: s.id,
      description: s.billingDescription?.trim() || s.serviceName || 'Serviço',
      cents,
      kind,
    })
  }
  return { recurringCents: recurring, avulsoCents: avulso, totalCents: recurring + avulso, items }
}

/**
 * Valor da cobrança de uma competência (centavos): recorrentes válidos no
 * período + avulsos daquele mês. Mantido por compatibilidade — a composição
 * detalhada está em competenceBreakdown.
 */
export function computeCompetenceCents(
  client: ClientLike,
  services: ServiceLike[],
  year: number,
  month: number,
): number {
  return competenceBreakdown(client, services, year, month).totalCents
}

/**
 * Ticket mensal recorrente (centavos) de hoje: só serviços ATIVOS de tipo
 * recorrente, já iniciados e não encerrados. Avulsos, pausados, encerrados e
 * início futuro ficam de fora — é o número que classifica o cliente.
 */
export function recurringTicketCents(services: ServiceLike[], todayISO: string): number {
  const today = new Date(`${todayISO.slice(0, 10)}T00:00:00Z`)
  let cents = 0
  for (const s of services) {
    if (!isServiceActive(s)) continue
    if (!countsForMrr(s.contractType)) continue
    if (s.startDate && new Date(s.startDate) > today) continue
    if (s.endDate && new Date(s.endDate) < today) continue
    cents += serviceCents(s)
  }
  return cents
}

/* ------------------------------ classificação ------------------------------ */

export type TierName = 'START' | 'GROWTH' | 'SCALE'

/** Faixas padrão (centavos): Start ≤ 1.500,00 · Growth ≤ 3.000,00 · Scale acima. */
export const DEFAULT_TIER_RANGES = { startMaxCents: 150_000, growthMaxCents: 300_000 }

/**
 * Grupo pelo ticket recorrente. Limites inclusivos: R$ 1.500,00 é Start,
 * R$ 1.500,01 já é Growth; R$ 3.000,00 é Growth, R$ 3.000,01 é Scale.
 * Sem serviço recorrente ativo (ticket 0) não há classificação.
 */
export function recommendTierCents(
  ticketCents: number,
  ranges: { startMaxCents: number; growthMaxCents: number } = DEFAULT_TIER_RANGES,
): TierName | null {
  if (!Number.isFinite(ticketCents) || ticketCents <= 0) return null
  if (ticketCents <= ranges.startMaxCents) return 'START'
  if (ticketCents <= ranges.growthMaxCents) return 'GROWTH'
  return 'SCALE'
}

/**
 * Vencimento da competência: dia configurado, limitado ao último dia válido
 * do mês (dia 31 em abril vira 30; 30 em fevereiro vira 28/29).
 * Devolve string YYYY-MM-DD (formato aceito pelo Asaas).
 */
export function dueDateFor(year: number, month: number, day: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const d = Math.min(Math.max(day || 1, 1), lastDay)
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Referência determinística da cobrança: billing:{clientId}:{YYYY-MM}. */
export function chargeExternalRef(clientId: string, year: number, month: number): string {
  return `billing:${clientId}:${year}-${String(month).padStart(2, '0')}`
}

/** Referência determinística da NFS-e: nfse:{internalChargeId}. */
export function nfseRef(chargeId: string): string {
  return `nfse:${chargeId}`
}

/** Header Basic da Focus: token como usuário, senha vazia. */
export function focusBasicAuth(token: string): string {
  return `Basic ${Buffer.from(`${token}:`).toString('base64')}`
}

/**
 * A geração da cobrança deve acontecer quando faltam até `leadDays` para o
 * vencimento — nunca retroativa (vencimento no passado é ignorado pelo job).
 */
export function shouldGenerateNow(todayISO: string, dueDateISO: string, leadDays: number): boolean {
  const today = new Date(`${todayISO}T00:00:00Z`).getTime()
  const due = new Date(`${dueDateISO}T00:00:00Z`).getTime()
  if (due < today) return false
  return due - today <= leadDays * 86_400_000
}

/** Chave idempotente para eventos de webhook sem id próprio. */
export function webhookEventKey(provider: string, parts: Array<string | number | null | undefined>): string {
  const norm = parts.map((p) => String(p ?? '')).join('|')
  let hash = 0
  for (let i = 0; i < norm.length; i++) {
    hash = (hash * 31 + norm.charCodeAt(i)) | 0
  }
  return `${provider}:${Math.abs(hash).toString(36)}:${norm.slice(0, 120)}`
}

/** Centavos → string decimal "1234.56" (payloads de API). */
export function centsToDecimalString(cents: number): string {
  return (cents / 100).toFixed(2)
}

/**
 * Origem pública do sistema atrás do proxy: prioriza os headers do Traefik
 * (x-forwarded-*), depois NEXTAUTH_URL e por último a URL da requisição —
 * evita expor 0.0.0.0:3000 nas URLs de webhook.
 */
export function publicOrigin(req: { headers: { get(name: string): string | null }; url: string }): string {
  const host = req.headers.get('x-forwarded-host')
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  if (host) return `${proto}://${host}`
  const env = process.env.NEXTAUTH_URL
  if (env) return env.replace(/\/$/, '')
  return new URL(req.url).origin
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Valida lista de e-mails (máx. 10) para reenvio de NFS-e. */
export function validateEmails(raw: string[]): { ok: string[]; invalid: string[] } {
  const ok: string[] = []
  const invalid: string[] = []
  for (const e of raw.map((x) => x.trim()).filter(Boolean)) {
    if (EMAIL_RE.test(e) && ok.length < 10) ok.push(e)
    else invalid.push(e)
  }
  return { ok, invalid }
}

/** Campos obrigatórios do cliente para cobrança e para NFS-e. */
export function missingBillingFields(c: {
  name?: string | null
  legalName?: string | null
  cnpj?: string | null
  billingEmail?: string | null
  email?: string | null
  paymentDay?: number | null
}): string[] {
  const missing: string[] = []
  if (!c.cnpj?.trim()) missing.push('CPF/CNPJ')
  if (!(c.billingEmail || c.email)?.trim()) missing.push('E-mail financeiro')
  if (!c.paymentDay) missing.push('Dia de vencimento')
  return missing
}

export function missingNfseFields(c: {
  legalName?: string | null
  name?: string | null
  cnpj?: string | null
  billingEmail?: string | null
  email?: string | null
  zipCode?: string | null
  street?: string | null
  addressNumber?: string | null
  district?: string | null
  city?: string | null
  state?: string | null
  ibgeCode?: string | null
}): string[] {
  const missing: string[] = []
  if (!(c.legalName || c.name)?.trim()) missing.push('Razão social/nome')
  if (!c.cnpj?.trim()) missing.push('CPF/CNPJ')
  if (!(c.billingEmail || c.email)?.trim()) missing.push('E-mail financeiro')
  if (!c.zipCode?.trim()) missing.push('CEP')
  if (!c.street?.trim()) missing.push('Logradouro')
  if (!c.addressNumber?.trim()) missing.push('Número')
  if (!c.district?.trim()) missing.push('Bairro')
  if (!c.city?.trim()) missing.push('Cidade')
  if (!c.state?.trim()) missing.push('UF')
  if (!c.ibgeCode?.trim()) missing.push('Código IBGE do município')
  return missing
}

/**
 * Municípios (código IBGE) que não utilizam o código municipal do serviço na
 * NFS-e — informação confirmada com a Focus por município. Nesses casos o
 * campo deixa de ser obrigatório e não vai no payload.
 */
export const MUNICIPIOS_SEM_CODIGO_SERVICO = new Set([
  '3534401', // Osasco/SP
])

export function requiresCodigoServicoMunicipal(codigoMunicipio?: string | null): boolean {
  const ibge = (codigoMunicipio ?? '').replace(/\D/g, '')
  return !MUNICIPIOS_SEM_CODIGO_SERVICO.has(ibge)
}

/**
 * Alíquota efetiva do ISS: no Simples Nacional varia por competência conforme
 * o faturamento (2% a 5%). Nunca é presumida — o contador confirma cada uma.
 */
export const ALIQUOTA_ISS_MIN = 2
export const ALIQUOTA_ISS_MAX = 5

export function isAliquotaIssValid(v: unknown): boolean {
  const n = Number(v)
  return Number.isFinite(n) && n >= ALIQUOTA_ISS_MIN && n <= ALIQUOTA_ISS_MAX
}

export function missingFiscalConfigFields(f: {
  cnpj?: string | null
  razaoSocial?: string | null
  inscricaoMunicipal?: string | null
  codigoMunicipio?: string | null
  naturezaOperacao?: string | null
  itemListaServico?: string | null
  codigoServicoMunicipal?: string | null
  descricaoPadrao?: string | null
  wsKeyConfigured?: boolean | null
}): string[] {
  const missing: string[] = []
  if (!f.cnpj?.trim()) missing.push('CNPJ do prestador')
  if (!f.razaoSocial?.trim()) missing.push('Razão social')
  if (!f.inscricaoMunicipal?.trim()) missing.push('Inscrição Municipal')
  if (!f.codigoMunicipio?.trim()) missing.push('Código IBGE do município')
  if (!f.naturezaOperacao?.trim()) missing.push('Natureza da operação')
  if (!f.itemListaServico?.trim()) missing.push('Item da lista de serviço')
  // Só onde o município exige (Osasco, por exemplo, não utiliza)
  if (requiresCodigoServicoMunicipal(f.codigoMunicipio) && !f.codigoServicoMunicipal?.trim()) {
    missing.push('Código municipal do serviço')
  }
  if (!f.descricaoPadrao?.trim()) missing.push('Descrição padrão do serviço')
  if (!f.wsKeyConfigured) missing.push('Chave de autenticação do Web Service da prefeitura')
  return missing
}

/** Substitui o marcador [MM/AAAA] da descrição padrão pela competência. */
export function applyCompetenceToDescription(desc: string, competencia: string): string {
  if (/\[\s*MM\s*\/\s*AAAA\s*\]/i.test(desc)) {
    return desc.replace(/\[\s*MM\s*\/\s*AAAA\s*\]/gi, competencia)
  }
  return `${desc} — competência ${competencia}`
}
