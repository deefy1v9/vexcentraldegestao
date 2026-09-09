/**
 * Regras puras do Google Analytics 4 — sem Prisma, sem rede.
 *
 * As definições do GA4 e do Search Console são diferentes de propósito:
 * sessão não é clique de pesquisa, e usuário único não se soma entre dias.
 * Nada aqui converte uma métrica na outra.
 */

export const GA_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly'

/** GA4 leva até ~48h para fechar alguns dados; o dia de hoje é parcial. */
export const GA_PROCESSING_HOURS = 48

/* ------------------------------ propriedade ------------------------------ */

/**
 * Relatório usa o ID NUMÉRICO da propriedade. O ID de medição (G-XXXXXXX) é
 * outra coisa: identifica o fluxo de dados no site, não a propriedade.
 */
export function isNumericPropertyId(v: unknown): v is string {
  return typeof v === 'string' && /^\d{6,20}$/.test(v.trim())
}

export function isMeasurementId(v: unknown): boolean {
  return typeof v === 'string' && /^G-[A-Z0-9]{4,}$/i.test(v.trim())
}

/** Aceita "properties/123456789" ou "123456789" e devolve só o número. */
export function normalizePropertyId(value: string): string | null {
  const limpo = value.trim().replace(/^properties\//, '')
  return isNumericPropertyId(limpo) ? limpo : null
}

/* -------------------------------- canais -------------------------------- */

export const TRAFFIC_FILTERS = ['organico', 'google_organico', 'todos'] as const
export type TrafficFilter = (typeof TRAFFIC_FILTERS)[number]

export const TRAFFIC_LABEL: Record<TrafficFilter, string> = {
  organico: 'Busca orgânica',
  google_organico: 'Google orgânico',
  todos: 'Todos os canais',
}

export function isTrafficFilter(v: unknown): v is TrafficFilter {
  return typeof v === 'string' && (TRAFFIC_FILTERS as readonly string[]).includes(v)
}

/**
 * Filtro de dimensão do Data API para cada opção de tráfego.
 * `todos` não restringe canal — devolve null de propósito.
 */
export function trafficDimensionFilter(filtro: TrafficFilter): Record<string, unknown> | null {
  if (filtro === 'organico') {
    return {
      filter: {
        fieldName: 'sessionDefaultChannelGroup',
        stringFilter: { matchType: 'EXACT', value: 'Organic Search' },
      },
    }
  }
  if (filtro === 'google_organico') {
    return {
      andGroup: {
        expressions: [
          { filter: { fieldName: 'sessionSource', stringFilter: { matchType: 'EXACT', value: 'google' } } },
          { filter: { fieldName: 'sessionMedium', stringFilter: { matchType: 'EXACT', value: 'organic' } } },
        ],
      },
    }
  }
  return null
}

/* ------------------------------- métricas ------------------------------- */

export const MAIN_METRICS = ['totalUsers', 'sessions', 'screenPageViews', 'engagementRate'] as const

export interface GaTotals {
  totalUsers: number
  sessions: number
  screenPageViews: number
  engagementRate: number
}

/**
 * Totais vêm da consulta do intervalo inteiro. Somar os dias daria número
 * errado em usuários únicos: a mesma pessoa em dois dias conta uma vez só.
 */
export function totalsFromRow(values: Array<{ value?: string }> | undefined): GaTotals {
  const n = (i: number) => Number(values?.[i]?.value ?? 0) || 0
  return {
    totalUsers: Math.round(n(0)),
    sessions: Math.round(n(1)),
    screenPageViews: Math.round(n(2)),
    engagementRate: n(3),
  }
}

export function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1).replace('.', ',')}%`
}

export function formatCount(value: number): string {
  return value.toLocaleString('pt-BR')
}

/** Variação percentual; sem base comparável devolve null. */
export function variation(current: number, previous: number): number | null {
  if (!previous) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

/* ------------------------------ eventos ------------------------------ */

export const LEAD_EVENT_DEFAULT = 'generate_lead'

export const EVENT_STATUS = ['NAO_VERIFICADO', 'VALIDADO', 'SEM_OCORRENCIA', 'CONFIGURACAO_NECESSARIA'] as const
export type EventStatus = (typeof EVENT_STATUS)[number]

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  NAO_VERIFICADO: 'Rastreamento ainda não verificado',
  VALIDADO: 'Rastreamento validado',
  SEM_OCORRENCIA: 'Sem ocorrências no período',
  CONFIGURACAO_NECESSARIA: 'Configuração necessária',
}

/**
 * Traduz o que a consulta encontrou em um estado honesto.
 *
 * Ausência de evento no período NÃO prova falta de configuração: o evento
 * pode existir e simplesmente não ter acontecido. Só quando o evento nunca
 * apareceu em nenhuma janela examinada é que vira "configuração necessária".
 */
export function eventStatus(input: {
  mapeado: boolean
  ocorrenciasNoPeriodo: number
  existeEmAlgumaJanela: boolean
}): EventStatus {
  if (!input.mapeado) return 'NAO_VERIFICADO'
  if (input.ocorrenciasNoPeriodo > 0) return 'VALIDADO'
  if (input.existeEmAlgumaJanela) return 'SEM_OCORRENCIA'
  return 'CONFIGURACAO_NECESSARIA'
}

/**
 * Nomes de evento que costumam indicar clique de WhatsApp. Serve para
 * sugerir na tela; a escolha final é sempre do administrador.
 */
export function suggestWhatsappEvents(nomes: string[]): string[] {
  const alvo = /whats|wa_|zap/i
  return nomes.filter((n) => alvo.test(n))
}

/**
 * Evento específico e `click` genérico da mesma ação não se somam: quando
 * existe evento próprio de WhatsApp, ele manda e o click é ignorado.
 */
export function whatsappSource(mapping: { whatsappEvent?: string | null; whatsappUrlContains?: string | null }):
  { modo: 'evento'; evento: string } | { modo: 'click'; contem: string } | { modo: 'indefinido' } {
  if (mapping.whatsappEvent && mapping.whatsappEvent.trim() && mapping.whatsappEvent !== 'click') {
    return { modo: 'evento', evento: mapping.whatsappEvent.trim() }
  }
  if (mapping.whatsappUrlContains && mapping.whatsappUrlContains.trim()) {
    return { modo: 'click', contem: mapping.whatsappUrlContains.trim() }
  }
  return { modo: 'indefinido' }
}

/* -------------------------------- períodos -------------------------------- */

const iso = (d: Date) => d.toISOString().slice(0, 10)
const parse = (s: string) => new Date(`${s}T12:00:00Z`)

export function addDays(dateISO: string, days: number): string {
  return iso(new Date(parse(dateISO).getTime() + days * 86_400_000))
}

export function isISODate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && iso(d) === v
}

export type RangeKind = '28d' | 'mes' | 'ano' | 'custom'

export interface GaRange {
  startDate: string
  endDate: string
  kind: RangeKind
  label: string
  /** true quando o intervalo inclui hoje: número ainda em formação. */
  emAndamento: boolean
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

/**
 * Períodos do GA4. Diferente do Search Console, aqui o dia de hoje já
 * aparece — só vem marcado como parcial, porque ainda está sendo processado.
 */
export function buildRange(
  kind: RangeKind,
  todayISO: string,
  opts: { month?: string; year?: number; startDate?: string; endDate?: string } = {},
): GaRange {
  const marcar = (r: Omit<GaRange, 'emAndamento'>): GaRange => ({
    ...r,
    emAndamento: r.endDate >= todayISO,
  })

  if (kind === 'mes') {
    const comp = opts.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(opts.month) ? opts.month : todayISO.slice(0, 7)
    const [y, m] = comp.split('-').map(Number)
    const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const fimBruto = `${comp}-${String(ultimoDia).padStart(2, '0')}`
    return marcar({
      startDate: `${comp}-01`,
      endDate: fimBruto > todayISO ? todayISO : fimBruto,
      kind,
      label: `${MESES[m - 1]} de ${y}`,
    })
  }

  if (kind === 'ano') {
    const y = opts.year && opts.year >= 2000 && opts.year <= 2100 ? opts.year : Number(todayISO.slice(0, 4))
    const fimBruto = `${y}-12-31`
    return marcar({
      startDate: `${y}-01-01`,
      endDate: fimBruto > todayISO ? todayISO : fimBruto,
      kind,
      label: `Ano de ${y}`,
    })
  }

  if (kind === 'custom' && isISODate(opts.startDate) && isISODate(opts.endDate)) {
    const endDate = opts.endDate > todayISO ? todayISO : opts.endDate
    const startDate = opts.startDate > endDate ? endDate : opts.startDate
    return marcar({ startDate, endDate, kind, label: `${br(startDate)} a ${br(endDate)}` })
  }

  // Padrão: 28 dias terminando ontem, para não misturar o dia incompleto
  const fim = addDays(todayISO, -1)
  return marcar({ startDate: addDays(fim, -27), endDate: fim, kind: '28d', label: 'Últimos 28 dias' })
}

export function br(dateISO: string): string {
  return dateISO.split('-').reverse().join('/')
}

/** Intervalo anterior do mesmo tamanho, para comparar coisas equivalentes. */
export function previousRange(range: { startDate: string; endDate: string }): { startDate: string; endDate: string } {
  const dias = Math.round((parse(range.endDate).getTime() - parse(range.startDate).getTime()) / 86_400_000) + 1
  return { startDate: addDays(range.startDate, -dias), endDate: addDays(range.startDate, -1) }
}

/* ---------------------------------- cache ---------------------------------- */

export function cacheKey(
  propertyId: string,
  range: { startDate: string; endDate: string },
  filtro: TrafficFilter,
  tipo: string,
): string {
  return `${propertyId}:${range.startDate}:${range.endDate}:${filtro}:${tipo}`
}

export function isFresh(expiresAt: Date | string, now: Date = new Date()): boolean {
  return new Date(expiresAt).getTime() > now.getTime()
}

/* --------------------------------- escopos --------------------------------- */

/** O que a conta realmente concedeu — autorização pode vir parcial. */
export function grantedScopes(scope: string | null | undefined): string[] {
  return (scope ?? '').split(/\s+/).filter(Boolean)
}

export function hasScope(scope: string | null | undefined, needed: string): boolean {
  return grantedScopes(scope).includes(needed)
}
