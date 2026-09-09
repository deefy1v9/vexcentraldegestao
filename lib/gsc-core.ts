/**
 * Regras puras da integração com o Google Search Console — sem Prisma, sem
 * rede. Datas em `AAAA-MM-DD` no calendário do próprio Search Console, que
 * trabalha no fuso America/Los_Angeles para fechar o dia. O relatório costuma
 * ficar 2 a 3 dias atrás do dia corrente; por isso a janela padrão termina
 * antes de hoje em vez de mostrar zero para dias que ainda não existem.
 */

export const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly'

/** Atraso típico do relatório: o Google só fecha o dia depois desse prazo. */
export const GSC_LAG_DAYS = 3

export type RangeKind = '28d' | 'mes' | 'ano' | 'custom'

export interface DateRange {
  startDate: string
  endDate: string
  kind: RangeKind
  label: string
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const parse = (s: string) => new Date(`${s}T12:00:00Z`)

export function isISODate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && iso(d) === v
}

export function addDays(dateISO: string, days: number): string {
  return iso(new Date(parse(dateISO).getTime() + days * 86_400_000))
}

/** Último dia com dado provável, dado o dia de hoje no fuso do relatório. */
export function lastAvailableDate(todayISO: string, lag = GSC_LAG_DAYS): string {
  return addDays(todayISO, -lag)
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

/**
 * Monta o período consultado. Nunca pede data futura: o fim é limitado ao
 * último dia com dado disponível, e o começo nunca passa do fim.
 */
export function buildRange(
  kind: RangeKind,
  todayISO: string,
  opts: { month?: string; year?: number; startDate?: string; endDate?: string; lag?: number } = {},
): DateRange {
  const limite = lastAvailableDate(todayISO, opts.lag ?? GSC_LAG_DAYS)

  if (kind === 'mes') {
    const comp = opts.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(opts.month) ? opts.month : todayISO.slice(0, 7)
    const [y, m] = comp.split('-').map(Number)
    const inicio = `${comp}-01`
    const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const fimBruto = `${comp}-${String(ultimoDia).padStart(2, '0')}`
    const endDate = fimBruto > limite ? limite : fimBruto
    return {
      startDate: inicio > endDate ? endDate : inicio,
      endDate,
      kind,
      label: `${MESES[m - 1]} de ${y}`,
    }
  }

  if (kind === 'ano') {
    const y = opts.year && opts.year >= 2000 && opts.year <= 2100 ? opts.year : Number(todayISO.slice(0, 4))
    const inicio = `${y}-01-01`
    const fimBruto = `${y}-12-31`
    const endDate = fimBruto > limite ? limite : fimBruto
    return {
      startDate: inicio > endDate ? endDate : inicio,
      endDate,
      kind,
      label: `Ano de ${y}`,
    }
  }

  if (kind === 'custom' && isISODate(opts.startDate) && isISODate(opts.endDate)) {
    const endDate = opts.endDate > limite ? limite : opts.endDate
    const startDate = opts.startDate > endDate ? endDate : opts.startDate
    return { startDate, endDate, kind, label: `${br(startDate)} a ${br(endDate)}` }
  }

  // Padrão: 28 dias encerrando no último dia disponível
  return { startDate: addDays(limite, -27), endDate: limite, kind: '28d', label: 'Últimos 28 dias' }
}

export function br(dateISO: string): string {
  return dateISO.split('-').reverse().join('/')
}

/* ------------------------------ propriedades ------------------------------ */

/**
 * Propriedade de domínio (`sc-domain:vexgrowth.com.br`) não vira URL. O
 * identificador vai para a API exatamente como o Google devolveu.
 */
export function isDomainProperty(siteUrl: string): boolean {
  return siteUrl.startsWith('sc-domain:')
}

/** Texto amigável só para exibir — nunca substitui o identificador real. */
export function propertyLabel(siteUrl: string): string {
  return isDomainProperty(siteUrl) ? siteUrl.slice('sc-domain:'.length) : siteUrl.replace(/\/$/, '')
}

export const PERMISSION_LABEL: Record<string, string> = {
  siteOwner: 'Proprietário',
  siteFullUser: 'Acesso total',
  siteRestrictedUser: 'Acesso restrito',
  siteUnverifiedUser: 'Não verificado',
}

/** Sem permissão de leitura útil, a propriedade não responde relatório. */
export function canRead(permissionLevel: string | null | undefined): boolean {
  return permissionLevel !== 'siteUnverifiedUser'
}

/* --------------------------------- métricas --------------------------------- */

export interface GscTotals {
  clicks: number
  impressions: number
  ctr: number
  position: number
}

/**
 * Totais do período. Vêm da consulta SEM dimensão — somar as primeiras linhas
 * de uma tabela daria número menor, porque a API devolve só uma fatia.
 */
export function totalsFromRow(row: { clicks?: number; impressions?: number; ctr?: number; position?: number } | undefined): GscTotals {
  return {
    clicks: Math.round(row?.clicks ?? 0),
    impressions: Math.round(row?.impressions ?? 0),
    ctr: row?.ctr ?? 0,
    position: row?.position ?? 0,
  }
}

export function formatCtr(ctr: number): string {
  return `${(ctr * 100).toFixed(2).replace('.', ',')}%`
}

export function formatPosition(position: number): string {
  return position > 0 ? position.toFixed(1).replace('.', ',') : '—'
}

export function formatCount(value: number): string {
  return value.toLocaleString('pt-BR')
}

/** Variação percentual; sem base comparável devolve null. */
export function variation(current: number, previous: number): number | null {
  if (!previous) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

/** Período imediatamente anterior, do mesmo tamanho, para comparação. */
export function previousRange(range: { startDate: string; endDate: string }): { startDate: string; endDate: string } {
  const dias = Math.round((parse(range.endDate).getTime() - parse(range.startDate).getTime()) / 86_400_000) + 1
  return { startDate: addDays(range.startDate, -dias), endDate: addDays(range.startDate, -1) }
}

/* ---------------------------------- cache ---------------------------------- */

/** Chave estável do cache: propriedade + período + tipo de consulta. */
export function cacheKey(propertyId: string, range: { startDate: string; endDate: string }, kind: string): string {
  return `${propertyId}:${range.startDate}:${range.endDate}:${kind}`
}

export function isFresh(expiresAt: Date | string, now: Date = new Date()): boolean {
  return new Date(expiresAt).getTime() > now.getTime()
}

/* --------------------------------- OAuth --------------------------------- */

/** State de uso único: aleatório, curto e sempre validado na volta. */
export function stateExpiry(now: Date = new Date(), minutes = 10): Date {
  return new Date(now.getTime() + minutes * 60_000)
}

export function isStateUsable(
  state: { usedAt: Date | null; expiresAt: Date } | null,
  now: Date = new Date(),
): { ok: boolean; reason?: string } {
  if (!state) return { ok: false, reason: 'Tentativa de conexão não encontrada. Comece de novo.' }
  if (state.usedAt) return { ok: false, reason: 'Este retorno já foi usado. Comece a conexão de novo.' }
  if (state.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'A tentativa de conexão expirou. Comece de novo.' }
  return { ok: true }
}

/**
 * Renovação do access token nunca pode apagar um refresh token válido: o
 * Google só reenvia o refresh na primeira autorização.
 */
export function mergeTokens(
  atual: { refreshToken: string | null; accessToken: string | null; expiryDate: Date | null },
  novo: { refresh_token?: string | null; access_token?: string | null; expiry_date?: number | null },
): { refreshToken: string | null; accessToken: string | null; expiryDate: Date | null } {
  return {
    refreshToken: novo.refresh_token && novo.refresh_token.trim() ? novo.refresh_token : atual.refreshToken,
    accessToken: novo.access_token ?? atual.accessToken,
    expiryDate: novo.expiry_date ? new Date(novo.expiry_date) : atual.expiryDate,
  }
}

/** Access token vencido (ou quase) precisa de renovação antes da chamada. */
export function needsRefresh(expiryDate: Date | null, now: Date = new Date(), margemSegundos = 60): boolean {
  if (!expiryDate) return true
  return expiryDate.getTime() - now.getTime() <= margemSegundos * 1000
}
