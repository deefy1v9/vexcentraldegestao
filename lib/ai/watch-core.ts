/**
 * Vigia dos agentes: regras puras de quando rodar e do que é alerta.
 *
 * O agente vigia nunca fala com cliente e nunca decide número: os dados são
 * colhidos por consulta e classificados aqui; a IA só redige o aviso para os
 * donos. Testado em scripts/tests/ai-watch.test.ts.
 */

export type WatchFrequency = 'DESLIGADA' | 'DIARIA' | 'SEMANAL'
export const WATCH_FREQUENCIES: WatchFrequency[] = ['DESLIGADA', 'DIARIA', 'SEMANAL']

export function isWatchFrequency(v: string): v is WatchFrequency {
  return (WATCH_FREQUENCIES as string[]).includes(v)
}

export const WEEKDAYS = [
  { value: 1, label: 'Segunda' }, { value: 2, label: 'Terça' }, { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' }, { value: 5, label: 'Sexta' }, { value: 6, label: 'Sábado' }, { value: 0, label: 'Domingo' },
]

export interface WatchConfig {
  watchFrequency: string
  watchWeekday?: number | null
  lastWatchOn?: string | null // AAAA-MM-DD do último aviso
}

/**
 * Roda hoje? `today` é o dia civil em São Paulo (AAAA-MM-DD) e `weekday` o dia
 * da semana desse mesmo dia (0 = domingo). Nunca repete no mesmo dia.
 */
export function shouldWatchToday(cfg: WatchConfig, today: string, weekday: number): boolean {
  if (cfg.watchFrequency === 'DESLIGADA') return false
  if (cfg.lastWatchOn === today) return false
  if (cfg.watchFrequency === 'DIARIA') return true
  if (cfg.watchFrequency === 'SEMANAL') return (cfg.watchWeekday ?? 1) === weekday
  return false
}

export type Severity = 'critico' | 'atencao' | 'informativo'

export interface Alert {
  severity: Severity
  title: string
  detail?: string
}

const ORDER: Record<Severity, number> = { critico: 0, atencao: 1, informativo: 2 }

/** Ordena por gravidade e limita: o aviso precisa caber numa tela de WhatsApp. */
export function rankAlerts(alerts: Alert[], limit = 12): Alert[] {
  return [...alerts].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]).slice(0, limit)
}

export function hasCritical(alerts: Alert[]): boolean {
  return alerts.some((a) => a.severity === 'critico')
}

/** Dias entre dois dias civis (AAAA-MM-DD). Positivo = `to` no futuro. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/**
 * Saúde do caixa do mês. "Vermelho" é despesa acima da receita prevista;
 * "apertado" é sobra menor que 15% da receita — dá tempo de reagir.
 */
export function cashHealth(params: { previstaCents: number; custosPrevistosCents: number; salariosPrevistosCents: number }): {
  status: 'vermelho' | 'apertado' | 'saudavel'
  saldoCents: number
  margem: number
} {
  const despesas = params.custosPrevistosCents + params.salariosPrevistosCents
  const saldoCents = params.previstaCents - despesas
  const margem = params.previstaCents > 0 ? saldoCents / params.previstaCents : saldoCents < 0 ? -1 : 0
  const status = saldoCents < 0 ? 'vermelho' : margem < 0.15 ? 'apertado' : 'saudavel'
  return { status, saldoCents, margem }
}

/** Contrato a vencer vira alerta a 30 dias; abaixo de 10, é crítico. */
export function contractAlert(clientName: string, endsOn: string, today: string): Alert | null {
  const dias = daysBetween(today, endsOn)
  if (dias < 0) return { severity: 'critico', title: `${clientName}: contrato venceu em ${brDate(endsOn)}`, detail: 'Renovar ou encerrar formalmente.' }
  if (dias > 30) return null
  return {
    severity: dias <= 10 ? 'critico' : 'atencao',
    title: `${clientName}: contrato vence em ${dias} dia${dias === 1 ? '' : 's'} (${brDate(endsOn)})`,
    detail: 'Falar de renovação antes do vencimento.',
  }
}

export function brDate(iso: string): string {
  return iso.slice(0, 10).split('-').reverse().join('/')
}

export function brl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Uma linha por alerta, com marcador por gravidade. */
export function formatAlerts(alerts: Alert[]): string {
  const marca: Record<Severity, string> = { critico: '🔴', atencao: '🟡', informativo: '•' }
  return alerts.map((a) => `${marca[a.severity]} ${a.title}${a.detail ? ` — ${a.detail}` : ''}`).join('\n')
}
