/**
 * Regras puras do planejamento operacional — sem Prisma, sem I/O, testáveis.
 *
 * Todas as datas são strings `YYYY-MM-DD` no calendário civil de
 * America/Sao_Paulo. Nada aqui usa `Date` local do servidor para decidir dia:
 * a conversão para dia civil acontece nas bordas (spTodayISO), e o resto
 * trabalha com strings — assim o fuso do container nunca desloca uma entrega.
 */

export const TZ = 'America/Sao_Paulo'

/* --------------------------------- datas --------------------------------- */

/** Dia civil de hoje em São Paulo (YYYY-MM-DD). */
export function spTodayISO(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: TZ })
}

/** Meio-dia UTC do dia civil — âncora estável para aritmética de dias. */
export function isoToAnchor(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`)
}

export function anchorToISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDaysISO(iso: string, days: number): string {
  return anchorToISO(new Date(isoToAnchor(iso).getTime() + days * 86_400_000))
}

/** 1 = segunda ... 7 = domingo (ISO-8601). */
export function weekdayISO(iso: string): number {
  const d = isoToAnchor(iso).getUTCDay() // 0=domingo
  return d === 0 ? 7 : d
}

export function diffDaysISO(fromISO: string, toISO: string): number {
  return Math.round((isoToAnchor(toISO).getTime() - isoToAnchor(fromISO).getTime()) / 86_400_000)
}

export function isValidISO(iso: string | null | undefined): iso is string {
  return !!iso && /^\d{4}-\d{2}-\d{2}$/.test(iso.slice(0, 10)) && !Number.isNaN(isoToAnchor(iso).getTime())
}

/** Competência (YYYY-MM) do dia civil. */
export function competenceOf(iso: string): string {
  return iso.slice(0, 7)
}

/** Primeiro e último dia da competência. */
export function competenceRange(competence: string): { start: string; end: string } {
  const [y, m] = competence.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { start: `${competence}-01`, end: `${competence}-${String(last).padStart(2, '0')}` }
}

/** Lista de competências entre duas datas (inclusive). */
export function competencesBetween(startISO: string, endISO: string): string[] {
  const out: string[] = []
  let [y, m] = [Number(startISO.slice(0, 4)), Number(startISO.slice(5, 7))]
  const endY = Number(endISO.slice(0, 4))
  const endM = Number(endISO.slice(5, 7))
  // Guarda contra intervalos absurdos (contrato mal preenchido)
  for (let i = 0; i < 120 && (y < endY || (y === endY && m <= endM)); i++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return out
}

/** Segunda-feira da semana ISO do dia. */
export function weekStartISO(iso: string): string {
  return addDaysISO(iso, -(weekdayISO(iso) - 1))
}

/* -------------------------------- feriados -------------------------------- */

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function easterISO(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * Feriados nacionais do Brasil — fixos + móveis derivados da Páscoa.
 * Calculado, nunca uma lista chumbada por ano.
 */
export function brazilHolidays(year: number): string[] {
  const easter = easterISO(year)
  return [
    `${year}-01-01`, // Confraternização Universal
    addDaysISO(easter, -48), // Carnaval (segunda)
    addDaysISO(easter, -47), // Carnaval (terça)
    addDaysISO(easter, -2), // Sexta-feira Santa
    `${year}-04-21`, // Tiradentes
    `${year}-05-01`, // Dia do Trabalho
    addDaysISO(easter, 60), // Corpus Christi
    `${year}-09-07`, // Independência
    `${year}-10-12`, // Nossa Senhora Aparecida
    `${year}-11-02`, // Finados
    `${year}-11-15`, // Proclamação da República
    `${year}-11-20`, // Consciência Negra
    `${year}-12-25`, // Natal
  ].sort()
}

/** Conjunto de feriados cobrindo o intervalo + extras configurados. */
export function holidaySet(startISO: string, endISO: string, extra: string[] = []): Set<string> {
  const years = new Set<number>()
  for (let y = Number(startISO.slice(0, 4)); y <= Number(endISO.slice(0, 4)); y++) years.add(y)
  const all = [...years].flatMap((y) => brazilHolidays(y))
  return new Set([...all, ...extra.filter(isValidISO)])
}

/* ----------------------------- configuração ----------------------------- */

export interface PlannerConfig {
  groupADays: number[] // ISO weekdays (1=segunda)
  groupBDays: number[]
  allowSaturday: boolean
  allowSunday: boolean
  holidayMode: 'skip' | 'allow' // pular feriado ou permitir publicação
  extraHolidays: string[]
  capacityPerDay: number
  capacityPerUser: number
  leadProduction: number // dias antes da publicação
  leadReview: number
  leadApproval: number
  leadSchedule: number
  durationByType: Record<string, number> // minutos estimados por tipo
}

/** Padrões seguros — alinhados ao fluxo atual (produção D-2, revisão D-1). */
export const DEFAULT_PLANNER_CONFIG: PlannerConfig = {
  groupADays: [1, 3, 5],
  groupBDays: [2, 4, 6],
  allowSaturday: false,
  allowSunday: false,
  holidayMode: 'skip',
  extraHolidays: [],
  capacityPerDay: 8,
  capacityPerUser: 4,
  leadProduction: 2,
  leadReview: 1,
  leadApproval: 1,
  leadSchedule: 1,
  durationByType: { post: 60, carrossel: 90, reels: 120, story: 30, artigo: 120, video: 180, outro: 60 },
}

/** Dias permitidos para publicação, aplicando sábado/domingo da configuração. */
export function allowedWeekdays(cfg: PlannerConfig, days: number[]): number[] {
  return days
    .filter((d) => d >= 1 && d <= 7)
    .filter((d) => (d === 6 ? cfg.allowSaturday : true))
    .filter((d) => (d === 7 ? cfg.allowSunday : true))
    .sort((a, b) => a - b)
}

export function isPublishableDay(iso: string, cfg: PlannerConfig, holidays: Set<string>): boolean {
  const wd = weekdayISO(iso)
  if (wd === 6 && !cfg.allowSaturday) return false
  if (wd === 7 && !cfg.allowSunday) return false
  if (cfg.holidayMode === 'skip' && holidays.has(iso)) return false
  return true
}

/* ------------------------------ especificação ------------------------------ */

export type Frequency = 'UNICA' | 'SEMANAL' | 'QUINZENAL' | 'MENSAL' | 'INDEFINIDA'

export interface DeliverySpec {
  /** Chave estável do serviço/entrega — compõe a referência idempotente. */
  serviceKey: string
  label: string
  contentType?: string | null
  platform?: string | null
  /** Quantidade por período (MENSAL/SEMANAL) ou total (UNICA). */
  quantity: number | null
  frequency: Frequency
  /** Dias da semana definidos no contrato (1=segunda). Vazio = não definido. */
  weekdays: number[]
  /** Datas exatas definidas no contrato. */
  specificDates: string[]
  sourceRef?: string | null
}

export interface DistributionInput {
  spec: DeliverySpec
  periodStart: string // início efetivo (contrato ou hoje, o que for maior)
  periodEnd: string // fim do contrato
  weekdays: number[] // dias candidatos (grupo escolhido ou contrato)
  cfg: PlannerConfig
  holidays: Set<string>
}

export interface DistributionResult {
  dates: string[]
  notes: string[]
  /** true quando os dias vieram do contrato (têm prioridade sobre sugestão). */
  fromContract: boolean
}

/** Dias publicáveis do intervalo restritos aos dias da semana candidatos. */
function candidateDays(startISO: string, endISO: string, weekdays: number[], cfg: PlannerConfig, holidays: Set<string>): string[] {
  const out: string[] = []
  const total = diffDaysISO(startISO, endISO)
  if (total < 0) return out
  const wanted = new Set(weekdays)
  for (let i = 0; i <= Math.min(total, 800); i++) {
    const iso = addDaysISO(startISO, i)
    if (!wanted.has(weekdayISO(iso))) continue
    if (!isPublishableDay(iso, cfg, holidays)) continue
    out.push(iso)
  }
  return out
}

/** Escolhe `count` datas espalhadas uniformemente dentro da lista. */
export function spreadPick(days: string[], count: number): string[] {
  if (count <= 0 || days.length === 0) return []
  if (count >= days.length) return [...days]
  const out: string[] = []
  // Divide a lista em `count` faixas e pega o início de cada uma —
  // determinístico e sem concentrar entregas no começo do período.
  for (let i = 0; i < count; i++) {
    const idx = Math.floor((i * days.length) / count)
    out.push(days[idx])
  }
  return out
}

/**
 * Datas de publicação de uma entrega. A quantidade contratada é limite
 * rígido: 8 posts no mês nunca viram 12. Sem encaixe perfeito, distribui o
 * mais equilibrado possível e devolve a justificativa em `notes`.
 */
export function planDeliveryDates(input: DistributionInput): DistributionResult {
  const { spec, periodStart, periodEnd, weekdays, cfg, holidays } = input
  const notes: string[] = []

  // 1) Datas explícitas no contrato mandam
  const explicit = spec.specificDates.filter(isValidISO).sort()
  if (explicit.length > 0) {
    const inRange = explicit.filter((d) => d >= periodStart && d <= periodEnd)
    const dropped = explicit.length - inRange.length
    if (dropped > 0) notes.push(`${dropped} data(s) do contrato fora da vigência foram ignoradas.`)
    for (const d of inRange) {
      if (!isPublishableDay(d, cfg, holidays)) {
        notes.push(`${d} cai em feriado ou dia bloqueado, mas foi mantida por constar no contrato.`)
      }
    }
    return { dates: inRange, notes, fromContract: true }
  }

  const contractWeekdays = allowedWeekdays(cfg, spec.weekdays)
  const fromContract = contractWeekdays.length > 0
  const useDays = fromContract ? contractWeekdays : allowedWeekdays(cfg, weekdays)
  if (useDays.length === 0) {
    notes.push('Nenhum dia da semana disponível com a configuração atual.')
    return { dates: [], notes, fromContract }
  }

  // 2) Entrega única
  if (spec.frequency === 'UNICA') {
    const days = candidateDays(periodStart, periodEnd, useDays, cfg, holidays)
    if (days.length === 0) {
      notes.push('Sem dia disponível na vigência para a entrega única.')
      return { dates: [], notes, fromContract }
    }
    return { dates: [days[0]], notes, fromContract }
  }

  // 3) Frequência semanal/quinzenal: N por semana, semana a semana
  if (spec.frequency === 'SEMANAL' || spec.frequency === 'QUINZENAL') {
    const perWeek = Math.max(1, spec.quantity ?? 1)
    const step = spec.frequency === 'QUINZENAL' ? 2 : 1
    const dates: string[] = []
    let weekStart = weekStartISO(periodStart)
    let guard = 0
    while (weekStart <= periodEnd && guard++ < 200) {
      const from = weekStart < periodStart ? periodStart : weekStart
      const to = addDaysISO(weekStart, 6)
      const days = candidateDays(from, to > periodEnd ? periodEnd : to, useDays, cfg, holidays)
      const picked = spreadPick(days, perWeek)
      if (picked.length < perWeek && days.length > 0) {
        notes.push(`Semana de ${from}: só ${picked.length} de ${perWeek} entrega(s) couberam nos dias permitidos.`)
      }
      dates.push(...picked)
      weekStart = addDaysISO(weekStart, 7 * step)
    }
    return { dates, notes, fromContract }
  }

  // 4) Frequência mensal (padrão): N por competência
  const perMonth = Math.max(1, spec.quantity ?? 1)
  const dates: string[] = []
  for (const comp of competencesBetween(periodStart, periodEnd)) {
    const range = competenceRange(comp)
    const from = range.start < periodStart ? periodStart : range.start
    const to = range.end > periodEnd ? periodEnd : range.end
    if (from > to) continue
    const days = candidateDays(from, to, useDays, cfg, holidays)
    const picked = spreadPick(days, perMonth)
    if (picked.length < perMonth) {
      notes.push(`Competência ${comp}: ${picked.length} de ${perMonth} entrega(s) couberam nos dias permitidos.`)
    }
    dates.push(...picked)
  }
  if (spec.frequency === 'INDEFINIDA') {
    notes.push('Frequência não informada no contrato — distribuição mensal sugerida pela IA.')
  }
  return { dates, notes, fromContract }
}

/* ------------------------------ grupo A / B ------------------------------ */

export interface GroupChoiceInput {
  cfg: PlannerConfig
  /** Carga já existente por dia (demandas do dia), incluindo outros clientes. */
  loadByDate: Record<string, number>
  /** Quantos clientes de mídias já estão em cada grupo. */
  clientsInA: number
  clientsInB: number
  periodStart: string
  periodEnd: string
  holidays: Set<string>
  /** Quantidade média de entregas por competência (peso da simulação). */
  deliveriesPerMonth: number
}

export interface GroupChoice {
  group: 'A' | 'B'
  scoreA: number
  scoreB: number
  reason: string
}

/**
 * Escolhe o grupo que produz a distribuição mais equilibrada — nunca uma
 * alternância cega. Pontua carga existente nos dias do grupo, estouro de
 * capacidade e desequilíbrio de clientes entre os grupos. Menor = melhor.
 */
export function chooseGroup(input: GroupChoiceInput): GroupChoice {
  const { cfg, loadByDate, clientsInA, clientsInB, periodStart, periodEnd, holidays, deliveriesPerMonth } = input

  function score(days: number[], clientsInGroup: number): number {
    const candidates = candidateDays(periodStart, periodEnd, allowedWeekdays(cfg, days), cfg, holidays)
    if (candidates.length === 0) return Number.POSITIVE_INFINITY
    // Simula as entregas do cliente espalhadas nos dias do grupo
    const perMonth = Math.max(1, deliveriesPerMonth)
    const months = Math.max(1, competencesBetween(periodStart, periodEnd).length)
    const simulated = spreadPick(candidates, Math.min(candidates.length, perMonth * months))
    const sim = new Set(simulated)

    let load = 0
    let overflow = 0
    for (const day of candidates) {
      const existing = loadByDate[day] ?? 0
      const added = sim.has(day) ? 1 : 0
      load += existing + added
      const over = existing + added - cfg.capacityPerDay
      if (over > 0) overflow += over
    }
    const avgLoad = load / candidates.length
    // Estouro pesa muito mais que carga média; desequilíbrio de carteira desempata
    return avgLoad + overflow * 10 + clientsInGroup * 0.5
  }

  const scoreA = score(cfg.groupADays, clientsInA)
  const scoreB = score(cfg.groupBDays, clientsInB)
  // Empate: menos clientes; persistindo, grupo A (determinístico)
  const group: 'A' | 'B' =
    scoreA < scoreB ? 'A' : scoreB < scoreA ? 'B' : clientsInA <= clientsInB ? 'A' : 'B'

  const reason =
    scoreA === scoreB
      ? `Empate na simulação (${scoreA.toFixed(2)}); escolhido o grupo com menos clientes.`
      : `Grupo ${group} teve menor carga simulada (A ${scoreA.toFixed(2)} × B ${scoreB.toFixed(2)}).`

  return { group, scoreA, scoreB, reason }
}

/* --------------------------- prazos internos --------------------------- */

export interface InternalDeadlines {
  production: string
  review: string
  approval: string | null
  schedule: string | null
  publish: string
}

/**
 * Prazos internos calculados regressivamente a partir da publicação.
 * As antecedências vêm da configuração — nada chumbado. Quando a data cai
 * fora de dia útil, recua até o dia útil anterior (sem ultrapassar a
 * publicação, que é o limite lógico).
 */
export function internalDeadlines(
  publishISO: string,
  cfg: PlannerConfig,
  holidays: Set<string>,
  opts: { keepBusinessDays?: boolean } = {},
): InternalDeadlines {
  const keep = opts.keepBusinessDays !== false
  const back = (lead: number): string => {
    let iso = addDaysISO(publishISO, -Math.max(0, lead))
    if (keep) {
      let guard = 0
      while (guard++ < 10) {
        const wd = weekdayISO(iso)
        const blocked = wd === 7 || (wd === 6 && !cfg.allowSaturday) || holidays.has(iso)
        if (!blocked) break
        iso = addDaysISO(iso, -1)
      }
    }
    return iso
  }
  return {
    production: back(cfg.leadProduction),
    review: back(cfg.leadReview),
    approval: cfg.leadApproval > 0 ? back(cfg.leadApproval) : null,
    schedule: cfg.leadSchedule > 0 ? back(cfg.leadSchedule) : null,
    publish: publishISO,
  }
}

/* ------------------------------ idempotência ------------------------------ */

/** Chave estável de uma entrega planejada — reexecutar não duplica. */
export function planItemRef(parts: {
  clientId: string
  serviceKey: string
  competence: string
  sequence: number
}): string {
  const key = parts.serviceKey.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'servico'
  return `plan:${parts.clientId}:${key}:${parts.competence}:${String(parts.sequence).padStart(2, '0')}`
}

/** Normalização usada para detectar demanda equivalente já existente. */
export function normalizePlanTitle(t: string): string {
  return t.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')
}

/* -------------------------------- conflitos -------------------------------- */

export type ConflictKind =
  | 'DUPLICADA'
  | 'DUPLICADA_EXISTENTE'
  | 'FORA_CONTRATO'
  | 'SEM_RESPONSAVEL'
  | 'EXCESSO_DIA'
  | 'EXCESSO_COLABORADOR'
  | 'FERIADO'
  | 'FIM_DE_SEMANA'
  | 'PRAZO_INVALIDO'

export interface PlanConflict {
  kind: ConflictKind
  message: string
  /** true quando exige decisão do administrador antes de confirmar. */
  blocking: boolean
}

export interface PlanItemDraft {
  ref: string
  clientId: string
  title: string
  serviceKey: string
  competence: string
  publishAt: string
  production: string
  review: string
  approval: string | null
  schedule: string | null
  assigneeId: string | null
  reviewerId: string | null
  schedulerId: string | null
  contentType?: string | null
  platform?: string | null
  priority: string
  weekGroup: 'A' | 'B' | null
  origin: 'CONTRATO' | 'IA'
  sourceRef?: string | null
  confidence: number
  notes: string[]
}

export interface ConflictContext {
  cfg: PlannerConfig
  holidays: Set<string>
  contractStart: string | null
  contractEnd: string | null
  /** Carga existente por dia (todas as demandas abertas do sistema). */
  loadByDate: Record<string, number>
  /** Carga existente por colaborador e dia. */
  loadByUserDate: Record<string, number> // chave `${userId}:${iso}`
  /** Demandas já existentes: `${clientId}:${data}` → títulos normalizados. */
  existingTitles: Record<string, string[]>
}

/**
 * Conflitos de um conjunto de itens sugeridos. Nada é corrigido em silêncio:
 * a lista vai inteira para a prévia e o administrador decide.
 */
export function detectConflicts(items: PlanItemDraft[], ctx: ConflictContext): Record<string, PlanConflict[]> {
  const { cfg, holidays, contractStart, contractEnd } = ctx
  const result: Record<string, PlanConflict[]> = {}
  const seenRef = new Map<string, number>()
  const seenSameDay = new Map<string, number>()
  const dayCount: Record<string, number> = { ...ctx.loadByDate }
  const userDayCount: Record<string, number> = { ...ctx.loadByUserDate }

  for (const item of items) {
    const list: PlanConflict[] = []

    // Duplicidade dentro da própria proposta
    seenRef.set(item.ref, (seenRef.get(item.ref) ?? 0) + 1)
    if ((seenRef.get(item.ref) ?? 0) > 1) {
      list.push({ kind: 'DUPLICADA', message: 'Item repetido na mesma proposta.', blocking: true })
    }
    const sameKey = `${item.clientId}:${item.publishAt}:${normalizePlanTitle(item.title)}`
    seenSameDay.set(sameKey, (seenSameDay.get(sameKey) ?? 0) + 1)
    if ((seenSameDay.get(sameKey) ?? 0) > 1) {
      list.push({ kind: 'DUPLICADA', message: 'Mesma entrega para o mesmo cliente na mesma data.', blocking: true })
    }

    // Duplicidade contra demandas já existentes
    const existing = ctx.existingTitles[`${item.clientId}:${item.publishAt}`] ?? []
    if (existing.includes(normalizePlanTitle(item.title))) {
      list.push({ kind: 'DUPLICADA_EXISTENTE', message: 'Já existe demanda igual para este cliente nesta data.', blocking: true })
    }

    // Vigência do contrato
    if (contractStart && item.publishAt < contractStart) {
      list.push({ kind: 'FORA_CONTRATO', message: `Publicação antes do início do contrato (${contractStart}).`, blocking: true })
    }
    if (contractEnd && item.publishAt > contractEnd) {
      list.push({ kind: 'FORA_CONTRATO', message: `Publicação após o fim do contrato (${contractEnd}).`, blocking: true })
    }

    // Responsáveis
    if (!item.assigneeId) {
      list.push({ kind: 'SEM_RESPONSAVEL', message: 'Sem responsável pela produção.', blocking: false })
    }

    // Capacidade do dia
    dayCount[item.publishAt] = (dayCount[item.publishAt] ?? 0) + 1
    if (dayCount[item.publishAt] > cfg.capacityPerDay) {
      list.push({
        kind: 'EXCESSO_DIA',
        message: `Dia com ${dayCount[item.publishAt]} entregas (capacidade ${cfg.capacityPerDay}).`,
        blocking: false,
      })
    }

    // Capacidade do colaborador (na data de produção)
    if (item.assigneeId) {
      const key = `${item.assigneeId}:${item.production}`
      userDayCount[key] = (userDayCount[key] ?? 0) + 1
      if (userDayCount[key] > cfg.capacityPerUser) {
        list.push({
          kind: 'EXCESSO_COLABORADOR',
          message: `Responsável com ${userDayCount[key]} produções em ${item.production} (capacidade ${cfg.capacityPerUser}).`,
          blocking: false,
        })
      }
    }

    // Feriado e fim de semana
    if (holidays.has(item.publishAt)) {
      list.push({ kind: 'FERIADO', message: 'Publicação em feriado.', blocking: false })
    }
    const wd = weekdayISO(item.publishAt)
    if ((wd === 6 && !cfg.allowSaturday) || (wd === 7 && !cfg.allowSunday)) {
      list.push({ kind: 'FIM_DE_SEMANA', message: 'Publicação em dia bloqueado na configuração.', blocking: false })
    }

    // Coerência dos prazos internos
    if (item.production > item.publishAt || item.review > item.publishAt) {
      list.push({ kind: 'PRAZO_INVALIDO', message: 'Prazo interno depois da publicação.', blocking: true })
    }
    if (item.production > item.review) {
      list.push({ kind: 'PRAZO_INVALIDO', message: 'Produção depois da revisão.', blocking: true })
    }

    result[item.ref] = list
  }

  return result
}

/* ---------------------------- balanceamento ---------------------------- */

export interface BalanceInput {
  candidates: string[] // datas possíveis
  loadByDate: Record<string, number>
  cfg: PlannerConfig
  /** Peso do cliente (Scale pesa mais na disputa por dias vazios). */
  tierWeight: number
  deadline?: string | null
  durationMinutes?: number
}

/**
 * Melhor data entre as candidatas: determinística e testável. Prefere o dia
 * com menos carga; empate resolve pela data mais cedo (folga antes do prazo).
 * O peso do cliente só desempata a ordem de escolha — nunca move a entrega de
 * outro cliente nem altera prazo contratual alheio.
 */
export function suggestBestDate(input: BalanceInput): { date: string | null; score: number; reason: string } {
  const { candidates, loadByDate, cfg, deadline } = input
  const usable = candidates.filter((d) => !deadline || d <= deadline)
  if (usable.length === 0) return { date: null, score: Number.POSITIVE_INFINITY, reason: 'Sem data disponível dentro do prazo.' }

  let best: string | null = null
  let bestScore = Number.POSITIVE_INFINITY
  for (const date of usable) {
    const load = loadByDate[date] ?? 0
    const over = Math.max(0, load + 1 - cfg.capacityPerDay)
    const score = load + over * 10
    if (score < bestScore) {
      bestScore = score
      best = date
    }
  }
  return {
    date: best,
    score: bestScore,
    reason: best ? `Dia com menor carga entre as opções (${bestScore.toFixed(2)}).` : 'Sem data viável.',
  }
}

/** Peso do tier — espelha lib/client-tier, mantido puro para os testes. */
export function tierWeightOf(tier: string | null | undefined): number {
  return tier === 'SCALE' ? 3 : tier === 'GROWTH' ? 2 : tier === 'START' ? 1 : 0
}
