/**
 * Regras puras da tela de Demandas: etapas, prazos por etapa, ordenação,
 * filtros, fila pessoal e contadores. Sem React e sem Prisma, para os
 * componentes só desenharem e os testes cobrirem a lógica.
 */

export type TaskStatus = 'BACKLOG' | 'TODO' | 'EM_ANDAMENTO' | 'EM_REVISAO' | 'APROVADO' | 'CONCLUIDO'
export type TaskPriority = 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE'

export interface UserRef { id: string; name: string }

/** Campos da demanda que as regras daqui precisam (o componente tem mais). */
export interface TaskLike {
  id: string
  number: number
  title: string
  status: TaskStatus
  priority: TaskPriority
  dueDate?: Date | string | null
  createdAt?: Date | string
  updatedAt?: Date | string
  position?: number
  client?: { id: string; name: string; tier?: string | null } | null
  assignee?: UserRef | null
  producer?: UserRef | null
  reviewer?: UserRef | null
  scheduler?: UserRef | null
}

export const DAY = 24 * 60 * 60 * 1000

/** Etapas do processo, na ordem do fluxo. Backlog só aparece quando usado. */
export const STAGES: Array<{
  key: TaskStatus
  label: string
  short: string
  /** Quem age nessa etapa (aparece no cabeçalho da coluna e no passo a passo). */
  actor: 'produtor' | 'revisor' | 'agendador' | null
  hint: string
  color: string
  bg: string
  dot: string
}> = [
  { key: 'BACKLOG',      label: 'Backlog',      short: 'Backlog',   actor: null,        hint: 'Ainda não priorizada',      color: 'text-gray-500',   bg: 'bg-gray-100',  dot: 'bg-gray-400' },
  { key: 'TODO',         label: 'A fazer',      short: 'A fazer',   actor: 'produtor',  hint: 'Produtor começa',           color: 'text-gray-600',   bg: 'bg-gray-100',  dot: 'bg-gray-400' },
  { key: 'EM_ANDAMENTO', label: 'Em andamento', short: 'Fazendo',   actor: 'produtor',  hint: 'Produtor entrega o Drive',  color: 'text-amber-600',  bg: 'bg-amber-50',  dot: 'bg-amber-400' },
  { key: 'EM_REVISAO',   label: 'Em revisão',   short: 'Revisão',   actor: 'revisor',   hint: 'Revisor aprova ou devolve', color: 'text-purple-600', bg: 'bg-purple-50', dot: 'bg-purple-500' },
  { key: 'APROVADO',     label: 'Aprovado',     short: 'Aprovado',  actor: 'agendador', hint: 'Agendador publica',         color: 'text-teal-600',   bg: 'bg-teal-50',   dot: 'bg-teal-500' },
  { key: 'CONCLUIDO',    label: 'Concluído',    short: 'Concluído', actor: null,        hint: 'Publicada',                 color: 'text-green-600',  bg: 'bg-green-50',  dot: 'bg-green-500' },
]

export const STAGE_BY_KEY = Object.fromEntries(STAGES.map((s) => [s.key, s])) as Record<TaskStatus, (typeof STAGES)[number]>

export const PRODUCTION_STATUSES: TaskStatus[] = ['BACKLOG', 'TODO', 'EM_ANDAMENTO']

export const PRIORITY_CONFIG: Record<TaskPriority, { dot: string; bg: string; text: string; label: string }> = {
  BAIXA:   { dot: 'bg-green-500',  bg: 'bg-green-50',  text: 'text-green-700',  label: 'Baixa' },
  MEDIA:   { dot: 'bg-yellow-500', bg: 'bg-yellow-50', text: 'text-yellow-700', label: 'Média' },
  ALTA:    { dot: 'bg-orange-500', bg: 'bg-orange-50', text: 'text-orange-700', label: 'Alta' },
  URGENTE: { dot: 'bg-red-500',    bg: 'bg-red-50',    text: 'text-red-700',    label: 'Urgente' },
}

export const PLATFORMS = ['Instagram', 'LinkedIn', 'Facebook', 'Site', 'Outra']

/* --------------------------------- prazos --------------------------------- */

/** Prazos derivados da data final: produção D-2, revisão D-1. */
export function deadlines(dueDate?: Date | string | null) {
  if (!dueDate) return null
  const due = new Date(dueDate as string)
  return {
    production: new Date(due.getTime() - 2 * DAY),
    review: new Date(due.getTime() - 1 * DAY),
    final: due,
  }
}

function startOfDay(d: Date): number {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime()
}

/** Dias até a data (negativo = passou). `now` só existe para os testes. */
export function daysLeft(date?: Date | string | null, now: Date = new Date()): number | null {
  if (!date) return null
  return Math.round((startOfDay(new Date(date as string)) - startOfDay(now)) / DAY)
}

/** Prazo da etapa atual: produção D-2, revisão D-1, agendamento D. */
export function stageDeadline(task: TaskLike): Date | null {
  const dl = deadlines(task.dueDate)
  if (!dl) return null
  if (PRODUCTION_STATUSES.includes(task.status)) return dl.production
  if (task.status === 'EM_REVISAO') return dl.review
  return dl.final
}

export function isLate(task: TaskLike, now: Date = new Date()): boolean {
  const left = daysLeft(task.dueDate, now)
  return left != null && left < 0 && task.status !== 'CONCLUIDO'
}

/** Peso do grupo do cliente na ordenação (Scale > Growth > Start). */
function tierWeight(tier?: string | null): number {
  return tier === 'SCALE' ? 3 : tier === 'GROWTH' ? 2 : tier === 'START' ? 1 : 0
}

/**
 * Ordenação determinística: atrasadas · prazo hoje · 48h · urgente · alta ·
 * Scale · Growth · Start; depois prazo da etapa, posição manual e criação.
 */
export function compareTasks(a: TaskLike, b: TaskLike, now: Date = new Date()): number {
  const bucket = (t: TaskLike): number => {
    const left = daysLeft(stageDeadline(t), now)
    if (isLate(t, now) || (left != null && left < 0)) return 0
    if (left === 0) return 1
    if (left != null && left <= 2) return 2
    if (t.priority === 'URGENTE') return 3
    if (t.priority === 'ALTA') return 4
    const tw = tierWeight(t.client?.tier)
    if (tw === 3) return 5
    if (tw === 2) return 6
    if (tw === 1) return 7
    return 8
  }
  const ba = bucket(a), bb = bucket(b)
  if (ba !== bb) return ba - bb
  const dueA = stageDeadline(a)?.getTime() ?? Infinity
  const dueB = stageDeadline(b)?.getTime() ?? Infinity
  if (dueA !== dueB) return dueA - dueB
  const pa = a.position ?? Number.MAX_SAFE_INTEGER, pb = b.position ?? Number.MAX_SAFE_INTEGER
  if (pa !== pb) return pa - pb
  const ca = a.createdAt ? new Date(a.createdAt as string).getTime() : 0
  const cb = b.createdAt ? new Date(b.createdAt as string).getTime() : 0
  return ca - cb
}

/* ------------------------------ papel do usuário ------------------------------ */

export type MyRole = 'Produzir' | 'Revisar' | 'Agendar'

/**
 * Papel do usuário na etapa ATUAL da demanda e o prazo que vale para ele.
 * Null quando não é a vez dele — ser o responsável geral não conta se a
 * etapa tem outro dono (ex.: revisão com o revisor). Sem dono definido na
 * etapa, o responsável assume.
 */
export function roleFor(task: TaskLike, userId: string): { role: MyRole; deadline: Date | null; cta: string } | null {
  if (task.status === 'CONCLUIDO') return null
  const dl = deadlines(task.dueDate)
  let actor: UserRef | null | undefined
  let out: { role: MyRole; deadline: Date | null; cta: string }
  if (PRODUCTION_STATUSES.includes(task.status)) { actor = task.producer; out = { role: 'Produzir', deadline: dl?.production ?? null, cta: 'Entregar' } }
  else if (task.status === 'EM_REVISAO') { actor = task.reviewer; out = { role: 'Revisar', deadline: dl?.review ?? null, cta: 'Revisar' } }
  else { actor = task.scheduler; out = { role: 'Agendar', deadline: dl?.final ?? null, cta: 'Agendar' } }
  const dono = actor ?? task.assignee
  return dono?.id === userId ? out : null
}

/** Quem tem que agir agora nesta demanda (para o "aguardando fulano"). */
export function currentActor(task: TaskLike): UserRef | null {
  if (task.status === 'CONCLUIDO') return null
  if (PRODUCTION_STATUSES.includes(task.status)) return task.producer ?? task.assignee ?? null
  if (task.status === 'EM_REVISAO') return task.reviewer ?? null
  return task.scheduler ?? task.assignee ?? null
}

/**
 * O que o colaborador enxerga: só as demandas em que ele tem papel
 * (responsável, produção, revisão ou agendamento) — a operação dos outros,
 * inclusive a dos diretores, não aparece. E demanda em revisão some para
 * quem produziu: a bola está com o revisor. Admin vê tudo.
 *
 * Isto é conveniência de tela; o servidor filtra pelas mesmas regras.
 */
export function canSee(task: TaskLike, userId: string, isAdmin: boolean): boolean {
  if (isAdmin) return true
  const meu = [task.assignee?.id, task.producer?.id, task.reviewer?.id, task.scheduler?.id].includes(userId)
  if (!meu) return false
  if (task.status !== 'EM_REVISAO') return true
  const dono = task.reviewer ?? task.assignee
  return dono?.id === userId
}

/** Mesmo recorte do `canSee`, em formato de `where` do Prisma. */
export function visibilityWhere(userId: string, isAdmin: boolean) {
  if (isAdmin) return {}
  return {
    OR: [
      { assigneeId: userId },
      { producerId: userId },
      { reviewerId: userId },
      { schedulerId: userId },
    ],
  }
}

/* ---------------------------------- filtros ---------------------------------- */

export type Period = '' | 'hoje' | 'semana' | 'mes'

export interface DemandasFilters {
  q: string
  assignee: string   // id, ou 'none' para sem responsável
  client: string
  period: Period
  tier: string
  status: string
  late: boolean
  /** Só demandas em que o usuário atual tem papel (responsável ou etapa). */
  mine: boolean
  /** Só demandas em que é a vez do usuário atual agir. */
  action: boolean
}

export const EMPTY_DEMANDAS_FILTERS: DemandasFilters = {
  q: '', assignee: '', client: '', period: '', tier: '', status: '', late: false, mine: false, action: false,
}

/** Filtros do painel (busca, responsável e cliente ficam fora da contagem). */
export function extraDemandasFilterCount(f: DemandasFilters): number {
  return [f.period, f.tier, f.status].filter(Boolean).length + [f.late].filter(Boolean).length
}

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Período olha o prazo da etapa atual; atrasada nunca some; concluída não entra. */
export function inPeriod(task: TaskLike, period: Period, now: Date = new Date()): boolean {
  if (!period) return true
  if (task.status === 'CONCLUIDO') return false
  const left = daysLeft(stageDeadline(task), now)
  if (left == null) return false
  if (left < 0) return true
  if (period === 'hoje') return left === 0
  if (period === 'semana') return left <= 7
  return left <= 31
}

export function filterTasks<T extends TaskLike>(tasks: T[], f: DemandasFilters, userId: string, now: Date = new Date()): T[] {
  const q = normalize(f.q.trim())
  return tasks.filter((t) => {
    if (q) {
      const alvo = normalize(`${t.title} ${t.client?.name ?? ''} #${t.number}`)
      if (!alvo.includes(q)) return false
    }
    if (f.assignee === 'none' && t.assignee) return false
    if (f.assignee && f.assignee !== 'none' && t.assignee?.id !== f.assignee) return false
    if (f.client && t.client?.id !== f.client) return false
    if (f.tier && t.client?.tier !== f.tier) return false
    if (f.status && t.status !== f.status) return false
    if (f.late && !isLate(t, now)) return false
    if (!inPeriod(t, f.period, now)) return false
    if (f.mine && !(t.assignee?.id === userId || roleFor(t, userId))) return false
    if (f.action && !roleFor(t, userId)) return false
    return true
  })
}

/* ---------------------------------- fila ---------------------------------- */

export type QueueGroupKey = 'atrasadas' | 'hoje' | 'amanha' | 'semana' | 'depois' | 'semData'

export const QUEUE_GROUP_LABEL: Record<QueueGroupKey, string> = {
  atrasadas: 'Atrasadas',
  hoje: 'Hoje',
  amanha: 'Amanhã',
  semana: 'Esta semana',
  depois: 'Depois',
  semData: 'Sem data',
}

export interface QueueItem<T extends TaskLike = TaskLike> {
  task: T
  role: MyRole
  cta: string
  deadline: Date | null
  daysLeft: number | null
}

/**
 * Fila pessoal: demandas em que é a vez do usuário, ordenadas por urgência
 * e agrupadas por quando o prazo dele vence.
 */
export function buildQueue<T extends TaskLike>(tasks: T[], userId: string, now: Date = new Date()): Array<{ key: QueueGroupKey; label: string; items: QueueItem<T>[] }> {
  const items: QueueItem<T>[] = []
  for (const task of tasks) {
    const r = roleFor(task, userId)
    if (!r) continue
    items.push({ task, role: r.role, cta: r.cta, deadline: r.deadline, daysLeft: daysLeft(r.deadline, now) })
  }
  items.sort((a, b) => compareTasks(a.task, b.task, now))
  const groups: Record<QueueGroupKey, QueueItem<T>[]> = { atrasadas: [], hoje: [], amanha: [], semana: [], depois: [], semData: [] }
  for (const it of items) {
    const d = it.daysLeft
    if (d == null) groups.semData.push(it)
    else if (d < 0) groups.atrasadas.push(it)
    else if (d === 0) groups.hoje.push(it)
    else if (d === 1) groups.amanha.push(it)
    else if (d <= 7) groups.semana.push(it)
    else groups.depois.push(it)
  }
  return (Object.keys(groups) as QueueGroupKey[])
    .filter((k) => groups[k].length > 0)
    .map((k) => ({ key: k, label: QUEUE_GROUP_LABEL[k], items: groups[k] }))
}

/* -------------------------------- contadores -------------------------------- */

export interface DemandasSummary {
  late: number
  today: number
  week: number
  /** Colaborador: demandas em que é a vez dele. Admin: demandas em revisão. */
  action: number
  open: number
}

export function summarize(tasks: TaskLike[], userId: string, isAdmin: boolean, now: Date = new Date()): DemandasSummary {
  const open = tasks.filter((t) => t.status !== 'CONCLUIDO')
  // Colaborador conta só o que é a vez dele — mesmo recorte da fila
  const scope = isAdmin ? open : open.filter((t) => roleFor(t, userId))
  const late = scope.filter((t) => isLate(t, now)).length
  const today = scope.filter((t) => daysLeft(stageDeadline(t), now) === 0).length
  const week = scope.filter((t) => { const d = daysLeft(stageDeadline(t), now); return d != null && d >= 0 && d <= 7 }).length
  const action = isAdmin
    ? open.filter((t) => t.status === 'EM_REVISAO').length
    : open.filter((t) => roleFor(t, userId)).length
  return { late, today, week, action, open: scope.length }
}

export interface TeamRow {
  id: string
  name: string
  open: number
  late: number
  today: number
}

/** Carga por colaborador, ordenada por atrasadas e depois por abertas. */
export function teamSummary(tasks: TaskLike[], users: UserRef[], now: Date = new Date()): { rows: TeamRow[]; unassigned: number } {
  const open = tasks.filter((t) => t.status !== 'CONCLUIDO')
  const rows: TeamRow[] = users.map((u) => {
    const mine = open.filter((t) => t.assignee?.id === u.id)
    return {
      id: u.id,
      name: u.name,
      open: mine.length,
      late: mine.filter((t) => isLate(t, now)).length,
      today: mine.filter((t) => daysLeft(stageDeadline(t), now) === 0).length,
    }
  })
  rows.sort((a, b) => b.late - a.late || b.open - a.open || a.name.localeCompare(b.name))
  return { rows, unassigned: open.filter((t) => !t.assignee).length }
}

/* ------------------------------- lista ------------------------------- */

export type SortKey = 'prazo' | 'prioridade' | 'cliente' | 'recentes'

export const SORT_LABEL: Record<SortKey, string> = {
  prazo: 'Prazo mais próximo',
  prioridade: 'Prioridade',
  cliente: 'Cliente',
  recentes: 'Mais recentes',
}

const PRIORITY_WEIGHT: Record<TaskPriority, number> = { URGENTE: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 }

export function sortTasks<T extends TaskLike>(tasks: T[], key: SortKey, now: Date = new Date()): T[] {
  const list = [...tasks]
  if (key === 'prioridade') {
    return list.sort((a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority] || compareTasks(a, b, now))
  }
  if (key === 'cliente') {
    return list.sort((a, b) => (a.client?.name ?? '~').localeCompare(b.client?.name ?? '~') || compareTasks(a, b, now))
  }
  if (key === 'recentes') {
    const t = (x: TaskLike) => (x.createdAt ? new Date(x.createdAt as string).getTime() : 0)
    return list.sort((a, b) => t(b) - t(a))
  }
  return list.sort((a, b) => compareTasks(a, b, now))
}

export type ListTab = 'todas' | 'atrasadas' | 'hoje' | 'revisao' | 'concluidas'

export const LIST_TAB_LABEL: Record<ListTab, string> = {
  todas: 'Todas', atrasadas: 'Atrasadas', hoje: 'Hoje', revisao: 'Em revisão', concluidas: 'Concluídas',
}

/** Contadores das abas, sobre o recorte atual (minhas ou equipe). */
export function tabCounts(tasks: TaskLike[], now: Date = new Date()): Record<ListTab, number> {
  const open = tasks.filter((t) => t.status !== 'CONCLUIDO')
  return {
    todas: open.length,
    atrasadas: open.filter((t) => isLate(t, now)).length,
    hoje: open.filter((t) => daysLeft(stageDeadline(t), now) === 0).length,
    revisao: open.filter((t) => t.status === 'EM_REVISAO').length,
    concluidas: tasks.length - open.length,
  }
}

export function tabFromFilters(f: DemandasFilters): ListTab {
  if (f.late) return 'atrasadas'
  if (f.period === 'hoje') return 'hoje'
  if (f.status === 'EM_REVISAO') return 'revisao'
  if (f.status === 'CONCLUIDO') return 'concluidas'
  return 'todas'
}

export function filtersForTab(f: DemandasFilters, tab: ListTab): DemandasFilters {
  const base: DemandasFilters = { ...f, late: false, period: f.period === 'hoje' ? '' : f.period, status: ['EM_REVISAO', 'CONCLUIDO'].includes(f.status) ? '' : f.status }
  if (tab === 'atrasadas') return { ...base, late: true }
  if (tab === 'hoje') return { ...base, period: 'hoje' }
  if (tab === 'revisao') return { ...base, status: 'EM_REVISAO' }
  if (tab === 'concluidas') return { ...base, status: 'CONCLUIDO' }
  return base
}

export type ActionKind = 'iniciar' | 'entregar' | 'revisar' | 'agendar' | 'abrir' | 'ver'

/** Botão da linha: o que a pessoa faz agora nessa demanda. */
export function actionFor(task: TaskLike, userId: string): { label: string; kind: ActionKind } {
  if (task.status === 'CONCLUIDO') return { label: 'Ver', kind: 'ver' }
  const r = roleFor(task, userId)
  if (!r) return { label: 'Abrir', kind: 'abrir' }
  if (task.status === 'BACKLOG' || task.status === 'TODO') return { label: 'Iniciar', kind: 'iniciar' }
  if (task.status === 'EM_ANDAMENTO') return { label: 'Entregar', kind: 'entregar' }
  if (task.status === 'EM_REVISAO') return { label: 'Revisar', kind: 'revisar' }
  return { label: 'Agendar', kind: 'agendar' }
}

/** "18 set", para a coluna de prazo. */
export function shortDate(value: Date | string): string {
  return new Date(value as string).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')
}

/** Concluídas recentes (7 dias) para a coluna não virar arquivo morto. */
export function isRecentlyDone(task: TaskLike, now: Date = new Date()): boolean {
  if (task.status !== 'CONCLUIDO') return false
  const ref = task.updatedAt ?? task.dueDate
  if (!ref) return true
  const d = daysLeft(ref, now)
  return d != null && d >= -7
}

/** Dia civil (YYYY-MM-DD) em São Paulo, para agrupar no calendário. */
export function isoDay(value: Date | string, timeZone = 'America/Sao_Paulo'): string {
  return new Date(value as string).toLocaleDateString('en-CA', { timeZone })
}

/** Tom da demanda no calendário: cinza por padrão, amarelo a 2 dias do prazo,
 *  verde quando concluída, vermelho quando passou do prazo. */
export type CalendarTone = 'normal' | 'proximo' | 'feito' | 'atrasado'
export const CALENDAR_TONE_LABEL: Record<CalendarTone, string> = {
  normal: 'No prazo', proximo: 'Vence em 2 dias', feito: 'Feito', atrasado: 'Atrasado',
}
export function calendarTone(task: { status: string; dueDate?: Date | string | null }, now: Date = new Date()): CalendarTone {
  if (task.status === 'CONCLUIDO') return 'feito'
  if (!task.dueDate) return 'normal'
  const hoje = isoDay(now), dia = isoDay(task.dueDate)
  if (dia < hoje) return 'atrasado'
  const diff = Math.round((Date.parse(dia) - Date.parse(hoje)) / DAY)
  return diff <= 2 ? 'proximo' : 'normal'
}
