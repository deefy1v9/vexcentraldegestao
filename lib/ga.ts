import { prisma } from './prisma'
import { authorizedClient, describeGoogleError, GscError } from './gsc'
import {
  GA_SCOPE, cacheKey, isFresh, normalizePropertyId, trafficDimensionFilter,
  type GaRange, type TrafficFilter,
} from './ga-core'

/**
 * Google Analytics 4.
 *
 * Reaproveita a mesma conexão OAuth do Search Console: é a mesma conta
 * Google, com escopo adicional de leitura do Analytics. Admin API lista
 * contas e propriedades; Data API roda os relatórios. Ambas por REST, com o
 * cliente autorizado da lib oficial.
 */

const ADMIN_API = 'https://analyticsadmin.googleapis.com/v1beta'
const DATA_API = 'https://analyticsdata.googleapis.com/v1beta'

/* ------------------------------ propriedades ------------------------------ */

export interface PropertySummary {
  propertyId: string
  displayName: string
  accountName: string
  accountId: string
  propertyType: string | null
}

interface AccountSummary {
  account?: string
  displayName?: string
  propertySummaries?: Array<{ property?: string; displayName?: string; propertyType?: string }>
}

/**
 * Contas e propriedades que a conta autorizada enxerga, com paginação —
 * quem tem muitas contas não cabe numa página só.
 */
export async function listProperties(connectionId: string): Promise<PropertySummary[]> {
  const client = await authorizedClient(connectionId)
  const saida: PropertySummary[] = []
  let pageToken: string | undefined

  do {
    const url = new URL(`${ADMIN_API}/accountSummaries`)
    url.searchParams.set('pageSize', '200')
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const res = await client.request<{ accountSummaries?: AccountSummary[]; nextPageToken?: string }>({
      url: url.toString(),
    })
    for (const conta of res.data.accountSummaries ?? []) {
      for (const p of conta.propertySummaries ?? []) {
        const id = normalizePropertyId(p.property ?? '')
        if (!id) continue
        saida.push({
          propertyId: id,
          displayName: p.displayName ?? id,
          accountName: conta.displayName ?? 'Conta sem nome',
          accountId: (conta.account ?? '').replace(/^accounts\//, ''),
          propertyType: p.propertyType ?? null,
        })
      }
    }
    pageToken = res.data.nextPageToken
  } while (pageToken)

  return saida.sort((a, b) => a.accountName.localeCompare(b.accountName) || a.displayName.localeCompare(b.displayName))
}

/** Metadados da propriedade: fuso e moeda saem daqui, não de suposição. */
export async function getPropertyMetadata(connectionId: string, propertyId: string) {
  const client = await authorizedClient(connectionId)
  const res = await client.request<{ displayName?: string; timeZone?: string; currencyCode?: string }>({
    url: `${ADMIN_API}/properties/${propertyId}`,
  })
  return {
    displayName: res.data.displayName ?? propertyId,
    timeZone: res.data.timeZone ?? null,
    currencyCode: res.data.currencyCode ?? null,
  }
}

/** Propriedade só é consultada quando existe vínculo salvo no banco. */
export async function getLinkedProperty(id: string) {
  const prop = await prisma.gaProperty.findUnique({
    where: { id },
    include: { connection: true, client: { select: { id: true, name: true } }, mapping: true },
  })
  if (!prop) throw new GscError('Propriedade do Analytics não vinculada.')
  return prop
}

/* -------------------------------- relatórios -------------------------------- */

interface RunReportBody {
  dateRanges: Array<{ startDate: string; endDate: string }>
  metrics?: Array<{ name: string }>
  dimensions?: Array<{ name: string }>
  dimensionFilter?: Record<string, unknown>
  orderBys?: Array<Record<string, unknown>>
  limit?: number
  offset?: number
  keepEmptyRows?: boolean
}

export interface ReportRow {
  dimensionValues?: Array<{ value?: string }>
  metricValues?: Array<{ value?: string }>
}

async function runReport(
  connectionId: string,
  propertyId: string,
  body: RunReportBody,
): Promise<{ rows: ReportRow[]; rowCount: number }> {
  const client = await authorizedClient(connectionId)
  try {
    const res = await client.request<{ rows?: ReportRow[]; rowCount?: number }>({
      url: `${DATA_API}/properties/${propertyId}:runReport`,
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })
    return { rows: res.data.rows ?? [], rowCount: res.data.rowCount ?? 0 }
  } catch (err) {
    throw new GscError(describeGoogleError(err))
  }
}

export interface GaReport {
  totals: ReportRow | null
  previousTotals: ReportRow | null
  byDate: ReportRow[]
  landingPages: ReportRow[]
  channels: ReportRow[]
  contatos: {
    leadEvent: string | null
    leadCount: number
    leadEverSeen: boolean
    whatsappMode: 'evento' | 'click' | 'indefinido'
    whatsappCount: number
    whatsappEverSeen: boolean
    topEvents: Array<{ name: string; count: number }>
  }
}

/**
 * Relatório do período com cache por propriedade, período e canal.
 * Cada bloco é uma consulta separada: totais sem dimensão, série por dia,
 * páginas de entrada e canais. Nada é derivado somando tabela.
 */
export async function getGaReport(
  linkedId: string,
  range: GaRange,
  previous: { startDate: string; endDate: string },
  filtro: TrafficFilter,
  opts: { force?: boolean; ttlMinutes?: number } = {},
): Promise<{ report: GaReport; cached: boolean; fetchedAt: Date; timeZone: string | null }> {
  const prop = await getLinkedProperty(linkedId)
  const key = cacheKey(linkedId, range, filtro, 'relatorio')

  if (!opts.force) {
    const cache = await prisma.gaCache.findUnique({ where: { key } })
    if (cache && isFresh(cache.expiresAt)) {
      return { report: cache.payload as unknown as GaReport, cached: true, fetchedAt: cache.fetchedAt, timeZone: prop.timeZone }
    }
  }

  const dateRanges = [{ startDate: range.startDate, endDate: range.endDate }]
  const canal = trafficDimensionFilter(filtro)
  const metrics = [
    { name: 'totalUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }, { name: 'engagementRate' },
  ]

  const [totais, anteriores, porDia, paginas, canais] = await Promise.all([
    runReport(prop.connectionId, prop.propertyId, { dateRanges, metrics, ...(canal ? { dimensionFilter: canal } : {}) }),
    runReport(prop.connectionId, prop.propertyId, { dateRanges: [previous], metrics, ...(canal ? { dimensionFilter: canal } : {}) }),
    runReport(prop.connectionId, prop.propertyId, {
      dateRanges, metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
      dimensions: [{ name: 'date' }], orderBys: [{ dimension: { dimensionName: 'date' } }],
      limit: 400, ...(canal ? { dimensionFilter: canal } : {}),
    }),
    runReport(prop.connectionId, prop.propertyId, {
      dateRanges, metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
      dimensions: [{ name: 'landingPage' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 25, ...(canal ? { dimensionFilter: canal } : {}),
    }),
    runReport(prop.connectionId, prop.propertyId, {
      dateRanges, metrics: [{ name: 'sessions' }],
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 15,
    }),
  ])

  const contatos = await medirContatos(prop, dateRanges, canal)

  const report: GaReport = {
    totals: totais.rows[0] ?? null,
    previousTotals: anteriores.rows[0] ?? null,
    byDate: porDia.rows,
    landingPages: paginas.rows,
    channels: canais.rows,
    contatos,
  }

  const fetchedAt = new Date()
  const expiresAt = new Date(fetchedAt.getTime() + (opts.ttlMinutes ?? 30) * 60_000)
  await prisma.gaCache.upsert({
    where: { key },
    create: { key, propertyId: linkedId, payload: report as unknown as object, fetchedAt, expiresAt },
    update: { payload: report as unknown as object, fetchedAt, expiresAt },
  })
  return { report, cached: false, fetchedAt, timeZone: prop.timeZone }
}

/* --------------------------- contatos e orçamentos --------------------------- */

type PropComMapping = Awaited<ReturnType<typeof getLinkedProperty>>

/**
 * Conta formulários e cliques de WhatsApp conforme o mapeamento da
 * propriedade. Sem mapeamento, não inventa: devolve zero e o estado fica
 * "não verificado" na tela.
 */
async function medirContatos(
  prop: PropComMapping,
  dateRanges: Array<{ startDate: string; endDate: string }>,
  canal: Record<string, unknown> | null,
): Promise<GaReport['contatos']> {
  const mapping = prop.mapping
  const eventos = await runReport(prop.connectionId, prop.propertyId, {
    dateRanges, metrics: [{ name: 'eventCount' }], dimensions: [{ name: 'eventName' }],
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }], limit: 40,
    ...(canal ? { dimensionFilter: canal } : {}),
  })
  const topEvents = eventos.rows.map((r) => ({
    name: r.dimensionValues?.[0]?.value ?? '',
    count: Number(r.metricValues?.[0]?.value ?? 0) || 0,
  }))
  const contagem = (nome: string) => topEvents.find((e) => e.name === nome)?.count ?? 0

  const leadEvent = mapping?.leadEvent ?? null
  const leadCount = leadEvent ? contagem(leadEvent) : 0

  // Janela ampla só para separar "não aconteceu agora" de "não existe"
  const janelaLarga = [{ startDate: '365daysAgo', endDate: 'today' }]
  let leadEverSeen = leadCount > 0
  if (leadEvent && !leadEverSeen) {
    const r = await runReport(prop.connectionId, prop.propertyId, {
      dateRanges: janelaLarga, metrics: [{ name: 'eventCount' }], dimensions: [{ name: 'eventName' }],
      dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: leadEvent } } },
      limit: 1,
    })
    leadEverSeen = (Number(r.rows[0]?.metricValues?.[0]?.value ?? 0) || 0) > 0
  }

  let whatsappMode: 'evento' | 'click' | 'indefinido' = 'indefinido'
  let whatsappCount = 0
  let whatsappEverSeen = false

  if (mapping?.whatsappEvent && mapping.whatsappEvent !== 'click') {
    whatsappMode = 'evento'
    whatsappCount = contagem(mapping.whatsappEvent)
    whatsappEverSeen = whatsappCount > 0
    if (!whatsappEverSeen) {
      const r = await runReport(prop.connectionId, prop.propertyId, {
        dateRanges: janelaLarga, metrics: [{ name: 'eventCount' }], dimensions: [{ name: 'eventName' }],
        dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: mapping.whatsappEvent } } },
        limit: 1,
      })
      whatsappEverSeen = (Number(r.rows[0]?.metricValues?.[0]?.value ?? 0) || 0) > 0
    }
  } else if (mapping?.whatsappUrlContains) {
    // Clique genérico filtrado pelo destino: só conta o que vai para o WhatsApp
    whatsappMode = 'click'
    const filtroClique = {
      andGroup: {
        expressions: [
          { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: 'click' } } },
          { filter: { fieldName: 'linkUrl', stringFilter: { matchType: 'CONTAINS', value: mapping.whatsappUrlContains } } },
          ...(canal ? [canal] : []),
        ],
      },
    }
    try {
      const r = await runReport(prop.connectionId, prop.propertyId, {
        dateRanges, metrics: [{ name: 'eventCount' }], dimensionFilter: filtroClique, limit: 1,
      })
      whatsappCount = Number(r.rows[0]?.metricValues?.[0]?.value ?? 0) || 0
      whatsappEverSeen = whatsappCount > 0
      if (!whatsappEverSeen) {
        const amplo = await runReport(prop.connectionId, prop.propertyId, {
          dateRanges: janelaLarga, metrics: [{ name: 'eventCount' }], dimensionFilter: filtroClique, limit: 1,
        })
        whatsappEverSeen = (Number(amplo.rows[0]?.metricValues?.[0]?.value ?? 0) || 0) > 0
      }
    } catch {
      // linkUrl pode não existir na propriedade: fica indefinido, não zero falso
      whatsappMode = 'indefinido'
    }
  }

  return {
    leadEvent, leadCount, leadEverSeen,
    whatsappMode, whatsappCount, whatsappEverSeen,
    topEvents,
  }
}

/** Nomes de evento vistos na propriedade, para o administrador mapear. */
export async function listEventNames(linkedId: string, dias = 90): Promise<Array<{ name: string; count: number }>> {
  const prop = await getLinkedProperty(linkedId)
  const r = await runReport(prop.connectionId, prop.propertyId, {
    dateRanges: [{ startDate: `${dias}daysAgo`, endDate: 'today' }],
    metrics: [{ name: 'eventCount' }],
    dimensions: [{ name: 'eventName' }],
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 100,
  })
  return r.rows.map((row) => ({
    name: row.dimensionValues?.[0]?.value ?? '',
    count: Number(row.metricValues?.[0]?.value ?? 0) || 0,
  }))
}

export { GA_SCOPE }
