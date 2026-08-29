import { prisma } from './prisma'
import { getSettings } from './settings'
import { defaultAssignments, logTaskEvent, notifyWhatsApp } from './task-flow'
import { tierPriority, tierWeight } from './client-tier'
import { toDeliverySpecs, serviceKeyOf, type ContractExtraction } from './contract-ai'
import {
  DEFAULT_PLANNER_CONFIG, type PlannerConfig, type PlanItemDraft, type PlanConflict,
  spTodayISO, addDaysISO, isValidISO, competenceOf, holidaySet, planDeliveryDates,
  chooseGroup, internalDeadlines, planItemRef, detectConflicts, normalizePlanTitle,
  allowedWeekdays, weekdayISO,
} from './planner-core'

/**
 * Planejamento operacional — camada que fala com o banco.
 *
 * A proposta NUNCA cria demanda: monta itens sugeridos, detecta conflitos com
 * os dados reais (demandas existentes, carga da equipe, vigência do contrato)
 * e guarda tudo em PlanProposal/PlanItem. A criação acontece só na
 * confirmação explícita do administrador, pelo mesmo fluxo do módulo de
 * Demandas (Task + TaskEvent + lembretes + notificação agrupada).
 */

/* ------------------------------ configuração ------------------------------ */

export const PLANNER_SETTING_KEYS = [
  'PLAN_GROUP_A_DAYS', 'PLAN_GROUP_B_DAYS', 'PLAN_ALLOW_SATURDAY', 'PLAN_ALLOW_SUNDAY',
  'PLAN_HOLIDAY_MODE', 'PLAN_EXTRA_HOLIDAYS', 'PLAN_CAPACITY_PER_DAY', 'PLAN_CAPACITY_PER_USER',
  'PLAN_LEAD_PRODUCTION', 'PLAN_LEAD_REVIEW', 'PLAN_LEAD_APPROVAL', 'PLAN_LEAD_SCHEDULE',
  'PLAN_DURATION_BY_TYPE',
] as const

function parseDays(raw: string | undefined, fallback: number[]): number[] {
  if (!raw) return fallback
  const days = raw.split(',').map((d) => Number(d.trim())).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
  return days.length > 0 ? [...new Set(days)].sort((a, b) => a - b) : fallback
}

function parseNum(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

/** Configuração do planejamento (SystemSettings + padrões seguros). */
export async function getPlannerConfig(): Promise<PlannerConfig> {
  const s = await getSettings([...PLANNER_SETTING_KEYS])
  const d = DEFAULT_PLANNER_CONFIG

  let durationByType = d.durationByType
  if (s.PLAN_DURATION_BY_TYPE) {
    try {
      const parsed = JSON.parse(s.PLAN_DURATION_BY_TYPE)
      if (parsed && typeof parsed === 'object') {
        durationByType = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>)
            .map(([k, v]) => [k, Number(v)])
            .filter(([, v]) => Number.isFinite(v as number) && (v as number) > 0),
        ) as Record<string, number>
      }
    } catch { /* configuração inválida: mantém o padrão */ }
  }

  return {
    groupADays: parseDays(s.PLAN_GROUP_A_DAYS, d.groupADays),
    groupBDays: parseDays(s.PLAN_GROUP_B_DAYS, d.groupBDays),
    allowSaturday: s.PLAN_ALLOW_SATURDAY === 'true',
    allowSunday: s.PLAN_ALLOW_SUNDAY === 'true',
    holidayMode: s.PLAN_HOLIDAY_MODE === 'allow' ? 'allow' : 'skip',
    extraHolidays: (s.PLAN_EXTRA_HOLIDAYS ?? '').split(',').map((x) => x.trim()).filter(isValidISO),
    capacityPerDay: parseNum(s.PLAN_CAPACITY_PER_DAY, d.capacityPerDay, 1, 100),
    capacityPerUser: parseNum(s.PLAN_CAPACITY_PER_USER, d.capacityPerUser, 1, 50),
    leadProduction: parseNum(s.PLAN_LEAD_PRODUCTION, d.leadProduction, 0, 30),
    leadReview: parseNum(s.PLAN_LEAD_REVIEW, d.leadReview, 0, 30),
    leadApproval: parseNum(s.PLAN_LEAD_APPROVAL, d.leadApproval, 0, 30),
    leadSchedule: parseNum(s.PLAN_LEAD_SCHEDULE, d.leadSchedule, 0, 30),
    durationByType,
  }
}

/* --------------------------- contexto do sistema --------------------------- */

/** Carga real: demandas abertas por dia e por colaborador/dia. */
async function loadContext(fromISO: string, toISO: string) {
  const tasks = await prisma.task.findMany({
    where: {
      status: { not: 'CONCLUIDO' },
      dueDate: { gte: new Date(`${fromISO}T00:00:00Z`), lte: new Date(`${toISO}T23:59:59Z`) },
    },
    select: { id: true, title: true, clientId: true, dueDate: true, assigneeId: true },
  })

  const loadByDate: Record<string, number> = {}
  const loadByUserDate: Record<string, number> = {}
  const existingTitles: Record<string, string[]> = {}

  for (const t of tasks) {
    if (!t.dueDate) continue
    const iso = t.dueDate.toISOString().slice(0, 10)
    loadByDate[iso] = (loadByDate[iso] ?? 0) + 1
    if (t.assigneeId) {
      const key = `${t.assigneeId}:${iso}`
      loadByUserDate[key] = (loadByUserDate[key] ?? 0) + 1
    }
    if (t.clientId) {
      const key = `${t.clientId}:${iso}`
      ;(existingTitles[key] ??= []).push(normalizePlanTitle(t.title))
    }
  }
  return { loadByDate, loadByUserDate, existingTitles }
}

/** Quantos clientes de mídias já estão em cada grupo operacional. */
async function groupCounts(excludeClientId: string) {
  const rows = await prisma.client.groupBy({
    by: ['operationalGroup'],
    where: { status: 'ATIVO', id: { not: excludeClientId }, operationalGroup: { not: null } },
    _count: { _all: true },
  })
  const get = (g: string) => rows.find((r) => r.operationalGroup === g)?._count._all ?? 0
  return { clientsInA: get('A'), clientsInB: get('B') }
}

/* ---------------------------- montar a proposta ---------------------------- */

export interface BuildResult {
  planId: string
  items: number
  conflicts: number
  weekGroup: 'A' | 'B' | null
  notes: string[]
}

/**
 * Monta (ou remonta) a proposta a partir de uma análise. Itens já criados
 * como demanda são preservados intactos; itens descartados pelo admin não
 * voltam. Reexecutar não duplica: a chave é o `ref` determinístico.
 */
export async function buildProposal(analysisId: string): Promise<BuildResult> {
  const analysis = await prisma.contractAnalysis.findUniqueOrThrow({
    where: { id: analysisId },
    include: { client: { include: { services: { where: { status: 'ATIVO' } } } } },
  })
  const extraction = analysis.extraction as unknown as ContractExtraction | null
  if (!extraction) throw new Error('Análise sem extração — rode a análise novamente.')

  const cfg = await getPlannerConfig()
  const client = analysis.client
  const today = spTodayISO()

  // Vigência: contrato do arquivo → cadastro do cliente → hoje
  const contractStart =
    (isValidISO(extraction.contract_start) ? extraction.contract_start : null) ??
    (client.contractStart ? client.contractStart.toISOString().slice(0, 10) : null)
  let contractEnd =
    (isValidISO(extraction.contract_end) ? extraction.contract_end : null) ??
    (client.contractEnd ? client.contractEnd.toISOString().slice(0, 10) : null)
  if (!contractEnd && extraction.duration_months && contractStart) {
    contractEnd = addDaysISO(contractStart, extraction.duration_months * 30)
  }

  const notes: string[] = []
  // Nunca planeja no passado: começa hoje ou no início do contrato
  const periodStart = contractStart && contractStart > today ? contractStart : today
  // Sem fim definido, planeja 3 meses à frente e avisa
  let periodEnd = contractEnd
  if (!periodEnd) {
    periodEnd = addDaysISO(periodStart, 90)
    notes.push('Contrato sem data de término: planejadas 12 semanas a partir de hoje.')
  }
  if (periodEnd < today) {
    return finishEmpty(analysis.id, client.id, 'Contrato encerrado — nada a planejar.')
  }
  if (contractStart && contractStart > today) {
    notes.push(`Planejamento começa no início do contrato (${contractStart}).`)
  }

  const holidays = holidaySet(periodStart, periodEnd, cfg.extraHolidays)
  const specs = toDeliverySpecs(extraction)
  if (specs.length === 0) {
    return finishEmpty(analysis.id, client.id, 'Nenhuma entrega identificada no contrato.')
  }

  // Grupo operacional: contrato manda; senão, o mais equilibrado
  const ctx = await loadContext(periodStart, periodEnd)
  const { clientsInA, clientsInB } = await groupCounts(client.id)
  const contractDefinesDays = specs.some((s) => s.weekdays.length > 0 || s.specificDates.length > 0)

  let weekGroup: 'A' | 'B' | null = null
  let groupReason = 'Dias definidos no contrato — grupo operacional não se aplica.'
  if (!contractDefinesDays) {
    const perMonth = specs.reduce((sum, s) => sum + (s.quantity ?? 1), 0)
    // Grupo já definido para o cliente é mantido (estabilidade da operação)
    if (client.operationalGroup === 'A' || client.operationalGroup === 'B') {
      weekGroup = client.operationalGroup
      groupReason = `Cliente já pertence ao Grupo ${weekGroup} — mantido.`
    } else {
      const choice = chooseGroup({
        cfg, loadByDate: ctx.loadByDate, clientsInA, clientsInB,
        periodStart, periodEnd, holidays, deliveriesPerMonth: perMonth,
      })
      weekGroup = choice.group
      groupReason = choice.reason
    }
  }
  const groupDays = weekGroup === 'B' ? cfg.groupBDays : cfg.groupADays

  // Responsáveis: configuração da operação + especialidade do colaborador
  const defaults = await defaultAssignments()
  const priority = tierPriority(client.tier)

  // Serviços cadastrados: liga o item da IA ao serviço real quando bate o nome
  const serviceByKey = new Map(client.services.map((s) => [serviceKeyOf(s.serviceName), s.id]))

  const drafts: PlanItemDraft[] = []
  for (const spec of specs) {
    const dist = planDeliveryDates({
      spec, periodStart, periodEnd, weekdays: allowedWeekdays(cfg, groupDays), cfg, holidays,
    })
    notes.push(...dist.notes.map((n) => `${spec.label}: ${n}`))

    const perCompetence = new Map<string, number>()
    for (const publishAt of dist.dates) {
      const competence = competenceOf(publishAt)
      const seq = (perCompetence.get(competence) ?? 0) + 1
      perCompetence.set(competence, seq)

      const deadlines = internalDeadlines(publishAt, cfg, holidays)
      const ref = planItemRef({ clientId: client.id, serviceKey: spec.serviceKey, competence, sequence: seq })

      drafts.push({
        ref,
        clientId: client.id,
        serviceKey: spec.serviceKey,
        title: `${spec.label} — ${new Date(`${publishAt}T12:00:00Z`).toLocaleDateString('pt-BR')}`,
        competence,
        publishAt,
        production: deadlines.production,
        review: deadlines.review,
        approval: deadlines.approval,
        schedule: deadlines.schedule,
        assigneeId: defaults.producerId,
        reviewerId: defaults.reviewerId,
        schedulerId: defaults.schedulerId,
        contentType: spec.contentType ?? null,
        platform: spec.platform ?? null,
        priority,
        weekGroup: dist.fromContract ? null : weekGroup,
        origin: dist.fromContract ? 'CONTRATO' : 'IA',
        sourceRef: spec.sourceRef ?? null,
        confidence: extraction.overall_confidence,
        notes: dist.fromContract ? [] : ['Dias sugeridos pela IA — o contrato não define os dias.'],
      })
    }
  }

  const conflicts = detectConflicts(drafts, {
    cfg, holidays, contractStart, contractEnd,
    loadByDate: ctx.loadByDate, loadByUserDate: ctx.loadByUserDate, existingTitles: ctx.existingTitles,
  })

  // Persiste a proposta preservando itens já criados/descartados
  const plan = await prisma.planProposal.upsert({
    where: { analysisId: analysis.id },
    update: { status: 'REVISAO', weekGroup, groupReason, clientId: client.id },
    create: { analysisId: analysis.id, clientId: client.id, status: 'REVISAO', weekGroup, groupReason },
  })

  const existingItems = await prisma.planItem.findMany({ where: { planId: plan.id } })
  const byRef = new Map(existingItems.map((i) => [i.ref, i]))
  const keptRefs = new Set<string>()

  for (const draft of drafts) {
    keptRefs.add(draft.ref)
    const prev = byRef.get(draft.ref)
    // Item já virou demanda ou foi descartado: não mexe
    if (prev && (prev.status === 'CRIADO' || prev.status === 'DESCARTADO')) continue

    const data = {
      clientId: draft.clientId,
      serviceId: serviceByKey.get(draft.serviceKey) ?? null,
      serviceKey: draft.serviceKey,
      title: draft.title,
      contentType: draft.contentType ?? null,
      platform: draft.platform ?? null,
      competence: draft.competence,
      sequence: Number(draft.ref.slice(-2)),
      publishAt: new Date(`${draft.publishAt}T12:00:00Z`),
      productionAt: new Date(`${draft.production}T12:00:00Z`),
      reviewAt: new Date(`${draft.review}T12:00:00Z`),
      approvalAt: draft.approval ? new Date(`${draft.approval}T12:00:00Z`) : null,
      scheduleAt: draft.schedule ? new Date(`${draft.schedule}T12:00:00Z`) : null,
      assigneeId: draft.assigneeId,
      reviewerId: draft.reviewerId,
      schedulerId: draft.schedulerId,
      priority: draft.priority,
      weekGroup: draft.weekGroup,
      origin: draft.origin,
      sourceRef: draft.sourceRef ?? null,
      confidence: draft.confidence,
      conflicts: (conflicts[draft.ref] ?? []) as unknown as object,
      notes: draft.notes,
      suggested: draft as unknown as object,
    }

    if (prev) {
      // Item editado pelo admin: mantém as escolhas dele, só atualiza conflitos
      if (prev.editedFields.length > 0) {
        await prisma.planItem.update({
          where: { id: prev.id },
          data: { conflicts: data.conflicts, notes: data.notes },
        })
      } else {
        await prisma.planItem.update({ where: { id: prev.id }, data })
      }
    } else {
      await prisma.planItem.create({ data: { ...data, planId: plan.id, ref: draft.ref } })
    }
  }

  // Sugestões que sumiram na nova análise e ainda não viraram demanda
  const stale = existingItems.filter((i) => !keptRefs.has(i.ref) && i.status === 'PENDENTE')
  if (stale.length > 0) {
    await prisma.planItem.deleteMany({ where: { id: { in: stale.map((i) => i.id) } } })
    notes.push(`${stale.length} sugestão(ões) anterior(es) deixaram de fazer sentido e foram removidas da prévia.`)
  }

  const conflictCount = Object.values(conflicts).reduce((sum, list) => sum + list.length, 0)
  await prisma.planProposal.update({
    where: { id: plan.id },
    data: {
      summary: {
        notes,
        contractStart,
        contractEnd,
        periodStart,
        periodEnd,
        groupReason,
        deliveries: specs.map((s) => ({ label: s.label, quantity: s.quantity, frequency: s.frequency })),
        missing: extraction.missing_information,
        ambiguous: extraction.ambiguous_information,
      } as unknown as object,
    },
  })
  await prisma.contractAnalysis.update({ where: { id: analysis.id }, data: { status: 'REVISAO' } })

  return { planId: plan.id, items: drafts.length, conflicts: conflictCount, weekGroup, notes }
}

async function finishEmpty(analysisId: string, clientId: string, reason: string): Promise<BuildResult> {
  const plan = await prisma.planProposal.upsert({
    where: { analysisId },
    update: { status: 'REVISAO', summary: { notes: [reason] } as unknown as object },
    create: { analysisId, clientId, status: 'REVISAO', summary: { notes: [reason] } as unknown as object },
  })
  await prisma.contractAnalysis.update({ where: { id: analysisId }, data: { status: 'REVISAO' } })
  return { planId: plan.id, items: 0, conflicts: 0, weekGroup: null, notes: [reason] }
}

/* ------------------------------ recalcular ------------------------------ */

/** Recalcula conflitos de uma proposta com os dados atuais do sistema. */
export async function refreshConflicts(planId: string): Promise<number> {
  const plan = await prisma.planProposal.findUniqueOrThrow({
    where: { id: planId },
    include: { items: true, analysis: true },
  })
  const pending = plan.items.filter((i) => i.status !== 'CRIADO' && i.status !== 'DESCARTADO')
  if (pending.length === 0) return 0

  const cfg = await getPlannerConfig()
  const summary = (plan.summary ?? {}) as { contractStart?: string | null; contractEnd?: string | null }
  const dates = pending.map((i) => i.publishAt.toISOString().slice(0, 10)).sort()
  const ctx = await loadContext(dates[0], dates[dates.length - 1])
  const holidays = holidaySet(dates[0], dates[dates.length - 1], cfg.extraHolidays)

  const drafts: PlanItemDraft[] = pending.map((i) => ({
    ref: i.ref,
    clientId: i.clientId,
    serviceKey: i.serviceKey,
    title: i.title,
    competence: i.competence,
    publishAt: i.publishAt.toISOString().slice(0, 10),
    production: (i.productionAt ?? i.publishAt).toISOString().slice(0, 10),
    review: (i.reviewAt ?? i.publishAt).toISOString().slice(0, 10),
    approval: i.approvalAt?.toISOString().slice(0, 10) ?? null,
    schedule: i.scheduleAt?.toISOString().slice(0, 10) ?? null,
    assigneeId: i.assigneeId,
    reviewerId: i.reviewerId,
    schedulerId: i.schedulerId,
    contentType: i.contentType,
    platform: i.platform,
    priority: i.priority,
    weekGroup: (i.weekGroup as 'A' | 'B' | null) ?? null,
    origin: i.origin === 'CONTRATO' ? 'CONTRATO' : 'IA',
    sourceRef: i.sourceRef,
    confidence: i.confidence ?? 0.5,
    notes: i.notes,
  }))

  const conflicts = detectConflicts(drafts, {
    cfg, holidays,
    contractStart: summary.contractStart ?? null,
    contractEnd: summary.contractEnd ?? null,
    loadByDate: ctx.loadByDate, loadByUserDate: ctx.loadByUserDate, existingTitles: ctx.existingTitles,
  })

  for (const item of pending) {
    await prisma.planItem.update({
      where: { id: item.id },
      data: { conflicts: (conflicts[item.ref] ?? []) as unknown as object },
    })
  }
  return Object.values(conflicts).reduce((sum, l) => sum + l.length, 0)
}

/* ------------------------------- confirmação ------------------------------- */

export interface ConfirmResult {
  created: number
  skipped: number
  blocked: Array<{ ref: string; reason: string }>
}

/**
 * Cria as demandas dos itens aprovados usando o MESMO fluxo do módulo de
 * Demandas: Task com produtor/revisor/agendador, prioridade herdada do grupo
 * do cliente, TaskEvent de criação e uma única notificação por responsável.
 *
 * Idempotência em duas camadas: trava por `updateMany` no status do item
 * (duplo clique não cria dois) e checagem de demanda equivalente já existente.
 */
export async function confirmProposal(planId: string, adminId: string, adminName: string, itemIds?: string[]): Promise<ConfirmResult> {
  const plan = await prisma.planProposal.findUniqueOrThrow({
    where: { id: planId },
    include: { client: { select: { id: true, name: true, tier: true } } },
  })
  if (plan.status === 'CANCELADO') throw new Error('Este planejamento foi cancelado.')

  const items = await prisma.planItem.findMany({
    where: {
      planId,
      status: { in: ['PENDENTE', 'APROVADO'] },
      ...(itemIds && itemIds.length > 0 ? { id: { in: itemIds } } : {}),
    },
    orderBy: { publishAt: 'asc' },
  })

  const created: string[] = []
  const blocked: ConfirmResult['blocked'] = []
  let skipped = 0

  for (const item of items) {
    // Bloqueadores continuam bloqueando na confirmação
    const conflicts = (item.conflicts ?? []) as unknown as PlanConflict[]
    const blocking = Array.isArray(conflicts) ? conflicts.filter((c) => c?.blocking) : []
    if (blocking.length > 0) {
      blocked.push({ ref: item.ref, reason: blocking.map((c) => c.message).join(' ') })
      continue
    }
    if (!item.assigneeId) {
      blocked.push({ ref: item.ref, reason: 'Sem responsável definido.' })
      continue
    }

    // Trava de idempotência: só o primeiro clique captura o item
    const lock = await prisma.planItem.updateMany({
      where: { id: item.id, status: { in: ['PENDENTE', 'APROVADO'] } },
      data: { status: 'CRIADO' },
    })
    if (lock.count === 0) { skipped++; continue }

    // Demanda equivalente já existe? Não duplica.
    const sameDay = await prisma.task.findMany({
      where: { clientId: item.clientId, dueDate: item.publishAt },
      select: { id: true, title: true },
    })
    const normalized = normalizePlanTitle(item.title)
    const dup = sameDay.find((t) => normalizePlanTitle(t.title) === normalized)
    if (dup) {
      await prisma.planItem.update({ where: { id: item.id }, data: { createdTaskId: dup.id } })
      skipped++
      continue
    }

    const task = await prisma.task.create({
      data: {
        title: item.title,
        description: item.description,
        status: 'TODO',
        priority: (item.priority ?? 'MEDIA') as never,
        dueDate: item.publishAt,
        clientId: item.clientId,
        assigneeId: item.assigneeId,
        producerId: item.assigneeId,
        reviewerId: item.reviewerId,
        schedulerId: item.schedulerId,
        platform: item.platform,
        contentType: item.contentType,
        creatorId: adminId,
        tags: [],
      },
    })
    await prisma.planItem.update({ where: { id: item.id }, data: { createdTaskId: task.id } })
    await logTaskEvent(
      task.id,
      'CRIACAO',
      `Criada pelo planejamento (IA — análise de contrato) por ${adminName}${item.sourceRef ? ` · origem: ${item.sourceRef.slice(0, 120)}` : ''}`,
      adminId,
    )
    created.push(task.id)
  }

  const remaining = await prisma.planItem.count({ where: { planId, status: { in: ['PENDENTE', 'APROVADO'] } } })
  await prisma.planProposal.update({
    where: { id: planId },
    data: {
      status: remaining === 0 ? 'CONFIRMADO' : 'REVISAO',
      confirmedAt: new Date(),
      confirmedById: adminId,
    },
  })
  if (remaining === 0) {
    await prisma.contractAnalysis.update({ where: { id: plan.analysisId }, data: { status: 'CONFIRMADO' } })
  }

  // Notificação agrupada: UMA mensagem por responsável, nunca uma por demanda
  if (created.length > 0) {
    const tasks = await prisma.task.findMany({
      where: { id: { in: created } },
      select: { assigneeId: true, dueDate: true },
      orderBy: { dueDate: 'asc' },
    })
    const byAssignee = new Map<string, Date[]>()
    for (const t of tasks) {
      if (!t.assigneeId) continue
      const list = byAssignee.get(t.assigneeId) ?? []
      if (t.dueDate) list.push(t.dueDate)
      byAssignee.set(t.assigneeId, list)
    }
    for (const [assigneeId, dates] of byAssignee) {
      const first = dates[0] ? dates[0].toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null
      await notifyWhatsApp(
        assigneeId,
        `📅 ${dates.length} nova(s) demanda(s) adicionada(s) ao calendário do cliente ${plan.client.name}.${first ? ` Primeira entrega em ${first}.` : ''} Confira os prazos no sistema.`,
      )
    }
  }

  return { created: created.length, skipped, blocked }
}

/* --------------------------- grupo do cliente --------------------------- */

/** Fixa o grupo operacional do cliente (usado ao confirmar o planejamento). */
export async function setClientGroup(clientId: string, group: 'A' | 'B' | null) {
  await prisma.client.update({ where: { id: clientId }, data: { operationalGroup: group } })
}

/* ------------------------------ visão do dia ------------------------------ */

/** Contagem de demandas por dia — alimenta o indicador de capacidade. */
export async function dailyLoad(fromISO: string, toISO: string): Promise<Record<string, number>> {
  const { loadByDate } = await loadContext(fromISO, toISO)
  return loadByDate
}

/** Peso do cliente para a ordenação operacional (Scale > Growth > Start). */
export function clientWeight(tier: string | null | undefined): number {
  return tierWeight(tier)
}

/** Dia é publicável na configuração atual? (usado pela UI do calendário) */
export function weekdayLabel(iso: string): number {
  return weekdayISO(iso)
}
