import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { logActivity } from './activity'
import { recalcClientMonthlyValue } from './client-value'
import { applyAutoTier, clientTicketCents, getTierRanges } from './client-tier'
import { seedServicePayments } from './receivables'
import { onlyDigits } from './proposal-core'
import {
  isCompetence, isStage, itemCents, opportunityTotals, projectedTier, validateStageMove,
  type ItemLike,
} from './pipeline-core'

export class PipelineError extends Error {}

type Db = Prisma.TransactionClient | typeof prisma

export const OPPORTUNITY_INCLUDE = {
  items: { orderBy: { order: 'asc' as const }, include: { catalog: { select: { id: true, name: true, category: true, minCents: true, maxCents: true, billingType: true } } } },
  prospect: { select: { id: true, name: true, tradeName: true, document: true, email: true, phone: true, convertedClientId: true, crmContactId: true } },
  client: { select: { id: true, name: true, tier: true, cnpj: true } },
  owner: { select: { id: true, name: true } },
  proposal: { select: { id: true, number: true, status: true, monthlyCents: true, setupCents: true, totalCents: true, currentVersion: true } },
}

/** Registro do histórico comercial. Toda ação passa por aqui. */
export async function logOpportunityEvent(
  db: Db,
  opportunityId: string,
  type: string,
  message: string,
  userId?: string | null,
  payload?: Prisma.InputJsonValue,
) {
  await db.opportunityEvent.create({
    data: { opportunityId, type, message, userId: userId ?? null, payload: payload ?? undefined },
  })
}

/* ------------------------------- leads ------------------------------- */

/**
 * Cria (ou reaproveita) o lead. O cadastro rápido exige apenas nome; documento,
 * e-mail e endereço entram depois, na proposta ou na conversão.
 */
export async function ensureLead(
  db: Db,
  input: {
    name: string
    tradeName?: string | null
    document?: string | null
    email?: string | null
    phone?: string | null
    contactName?: string | null
    source?: string | null
    ownerId?: string | null
    crmContactId?: string | null
    interestServices?: string[]
    notes?: string | null
    personType?: string | null
  },
  createdById: string,
) {
  const doc = input.document ? onlyDigits(input.document) : null
  if (doc) {
    const existente = await db.prospect.findUnique({ where: { document: doc } })
    if (existente) return existente
  }
  return db.prospect.create({
    data: {
      name: input.name.trim(),
      tradeName: input.tradeName?.trim() || null,
      document: doc || null,
      personType: input.personType === 'PJ' || (doc && doc.length === 14) ? 'PJ' : 'PF',
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      contactName: input.contactName?.trim() || null,
      source: input.source?.trim() || null,
      ownerId: input.ownerId ?? createdById,
      crmContactId: input.crmContactId || null,
      interestServices: input.interestServices ?? [],
      notes: input.notes?.trim() || null,
      createdById,
    },
  })
}

/* ------------------------ possíveis clientes iguais ------------------------ */

export interface DuplicateMatch {
  id: string
  name: string
  cnpj: string | null
  email: string | null
  phone: string | null
  reason: 'documento' | 'nome' | 'telefone' | 'email'
}

/**
 * Procura cadastros que podem ser o mesmo cliente. Documento normalizado é
 * correspondência forte; nome, telefone e e-mail são apenas sugestões — nada
 * é fundido automaticamente.
 */
export async function findClientMatches(input: {
  document?: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
}): Promise<{ exact: DuplicateMatch | null; suggestions: DuplicateMatch[] }> {
  const doc = input.document ? onlyDigits(input.document) : ''
  const suggestions: DuplicateMatch[] = []
  let exact: DuplicateMatch | null = null

  const candidatos = await prisma.client.findMany({
    select: { id: true, name: true, cnpj: true, email: true, phone: true },
  })

  for (const c of candidatos) {
    const cDoc = onlyDigits(c.cnpj ?? '')
    if (doc && cDoc && cDoc === doc) {
      exact = { ...c, reason: 'documento' }
      continue
    }
    const nome = (input.name ?? '').trim().toLowerCase()
    if (nome.length >= 4 && c.name.toLowerCase().includes(nome)) {
      suggestions.push({ ...c, reason: 'nome' }); continue
    }
    const fone = onlyDigits(input.phone ?? '')
    if (fone.length >= 10 && onlyDigits(c.phone ?? '').endsWith(fone.slice(-8))) {
      suggestions.push({ ...c, reason: 'telefone' }); continue
    }
    const mail = (input.email ?? '').trim().toLowerCase()
    if (mail && (c.email ?? '').toLowerCase() === mail) {
      suggestions.push({ ...c, reason: 'email' })
    }
  }
  return { exact, suggestions: suggestions.slice(0, 5) }
}

/* ------------------------------- conversão ------------------------------- */

export interface ConversionOverrides {
  clientId?: string | null // cliente já escolhido pelo usuário
  clientData?: {
    name?: string
    legalName?: string | null
    document?: string | null
    email?: string | null
    phone?: string | null
    paymentDay?: number | null
    contractStart?: string | null
    contractMonths?: number | null
    billingEmail?: string | null
  }
  items?: Array<{
    id: string
    unitCents?: number
    quantity?: number
    discountCents?: number
    contractType?: string
    startDate?: string | null
    competence?: string | null
    months?: number | null
    scope?: string | null
    dueDay?: number | null
    generateCharge?: boolean
  }>
}

export interface ConversionResult {
  clientId: string
  clientName: string
  created: boolean
  serviceIds: string[]
  alreadyConverted: boolean
}

/**
 * Fecha a negociação como ganha e transforma os itens orçados em serviços
 * contratados. É a MESMA rotina usada pelo Kanban, pelo seletor de etapa e
 * pela confirmação da proposta.
 *
 * Idempotente: a trava é o próprio `convertedAt`, reservado por um update
 * atômico dentro da transação. Duplo clique ou duas requisições simultâneas
 * devolvem a primeira conversão em vez de criar outra.
 */
export async function convertOpportunity(
  opportunityId: string,
  user: { id: string; name: string },
  overrides: ConversionOverrides = {},
): Promise<ConversionResult> {
  const opp = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    include: { items: { orderBy: { order: 'asc' } }, prospect: true, client: true },
  })
  if (!opp) throw new PipelineError('Oportunidade não encontrada.')

  // Já convertida: devolve o cliente e os serviços vinculados
  if (opp.convertedClientId) {
    const cliente = await prisma.client.findUnique({ where: { id: opp.convertedClientId }, select: { id: true, name: true } })
    return {
      clientId: opp.convertedClientId,
      clientName: cliente?.name ?? '',
      created: false,
      serviceIds: opp.items.map((i) => i.clientServiceId).filter((v): v is string => !!v),
      alreadyConverted: true,
    }
  }

  // Itens finais: a conferência de fechamento pode ajustar valores e datas
  const ajustes = new Map((overrides.items ?? []).map((i) => [i.id, i]))
  const itensFinais = opp.items.map((item) => {
    const a = ajustes.get(item.id)
    return {
      ...item,
      unitCents: a?.unitCents ?? item.unitCents,
      quantity: a?.quantity ?? item.quantity,
      discountCents: a?.discountCents ?? item.discountCents,
      contractType: a?.contractType ?? item.contractType,
      months: a?.months ?? item.months,
      scope: a?.scope ?? item.scope,
      startDate: a?.startDate ? new Date(`${a.startDate.slice(0, 10)}T12:00:00Z`) : item.startDate,
      competence: a?.competence ?? item.competence,
      dueDay: a?.dueDay ?? null,
      generateCharge: a?.generateCharge ?? true,
    }
  })

  const erros = validateStageMove({
    from: opp.stage, to: 'GANHO', items: itensFinais as ItemLike[], converted: false,
  })
  if (erros.length > 0) throw new PipelineError(erros.join(' '))

  // Cliente de destino: vínculo explícito, depois documento, depois criação
  const documento = overrides.clientData?.document ?? opp.prospect?.document ?? null
  let clientId = overrides.clientId ?? opp.clientId ?? null
  if (!clientId && documento) {
    const doc = onlyDigits(documento)
    const achado = await prisma.client.findFirst({ where: { cnpj: { in: [doc, documento] } }, select: { id: true } })
    if (achado) clientId = achado.id
  }

  const result = await prisma.$transaction(async (tx) => {
    // Trava de idempotência: só um caminho consegue reservar a conversão
    const reservou = await tx.opportunity.updateMany({
      where: { id: opportunityId, convertedAt: null },
      data: { convertedAt: new Date() },
    })
    if (reservou.count === 0) {
      const atual = await tx.opportunity.findUniqueOrThrow({
        where: { id: opportunityId },
        include: { items: { select: { clientServiceId: true } } },
      })
      const cliente = atual.convertedClientId
        ? await tx.client.findUnique({ where: { id: atual.convertedClientId }, select: { id: true, name: true } })
        : null
      return {
        clientId: atual.convertedClientId ?? '',
        clientName: cliente?.name ?? '',
        created: false,
        serviceIds: atual.items.map((i) => i.clientServiceId).filter((v): v is string => !!v),
        alreadyConverted: true,
      }
    }

    let criouCliente = false
    let cliente = clientId ? await tx.client.findUnique({ where: { id: clientId } }) : null

    if (!cliente) {
      const p = opp.prospect
      const nome = overrides.clientData?.name || p?.tradeName || p?.name || opp.title
      const doc = documento ? onlyDigits(documento) : null
      cliente = await tx.client.create({
        data: {
          name: nome,
          legalName: overrides.clientData?.legalName ?? p?.name ?? null,
          cnpj: doc || null,
          email: overrides.clientData?.email ?? p?.email ?? null,
          phone: overrides.clientData?.phone ?? p?.phone ?? null,
          billingEmail: overrides.clientData?.billingEmail ?? null,
          status: 'ATIVO',
          paymentDay: overrides.clientData?.paymentDay ?? null,
          contractStart: overrides.clientData?.contractStart
            ? new Date(`${overrides.clientData.contractStart.slice(0, 10)}T12:00:00Z`)
            : new Date(),
          contractMonths: overrides.clientData?.contractMonths ?? null,
          zipCode: p?.zipCode ?? null,
          street: p?.street ?? null,
          addressNumber: p?.addressNumber ?? null,
          complement: p?.complement ?? null,
          district: p?.district ?? null,
          city: p?.city ?? null,
          state: p?.state ?? null,
          notes: p?.notes ?? null,
        },
      })
      criouCliente = true
      if (p) {
        await tx.prospect.update({
          where: { id: p.id },
          data: { convertedClientId: cliente.id, convertedAt: new Date() },
        })
      }
    }

    // Serviços contratados: só os itens desta oportunidade, sem mexer no que
    // o cliente já tinha contratado antes.
    const serviceIds: string[] = []
    for (const item of itensFinais) {
      const cents = itemCents(item as ItemLike)
      const recorrente = (item.contractType ?? 'RECORRENTE') !== 'AVULSO'
      const inicio = item.startDate
        ?? (item.competence ? new Date(`${item.competence}-01T12:00:00Z`) : new Date())
      const servico = await tx.clientService.create({
        data: {
          clientId: cliente.id,
          catalogId: item.catalogId,
          serviceName: item.name,
          description: item.scope,
          contractType: item.contractType ?? 'RECORRENTE',
          priceCents: Math.max(0, Math.round(item.unitCents ?? 0)),
          quantity: Math.max(1, Math.round(item.quantity ?? 1)),
          discountCents: Math.max(0, Math.round(item.discountCents ?? 0)),
          monthlyValue: recorrente ? cents / 100 : null,
          totalContractValue: recorrente ? null : cents / 100,
          competence: recorrente ? null : item.competence,
          startDate: inicio,
          contractDuration: item.months && item.months > 0 ? item.months : null,
          dueDay: item.dueDay ?? null,
          generateCharge: item.generateCharge !== false,
          paymentType: recorrente ? 'Mensal' : 'Único',
          billingDescription: item.name,
          status: 'ATIVO',
          observations: `Contratado pela oportunidade "${opp.title}".`,
        },
      })
      serviceIds.push(servico.id)
      await tx.clientServiceValueHistory.create({
        data: { serviceId: servico.id, cents, effectiveFrom: inicio, userId: user.id, note: 'Fechamento da negociação' },
      })
      await tx.clientServiceStatusHistory.create({
        data: { serviceId: servico.id, fromStatus: null, toStatus: 'ATIVO', userId: user.id, reason: 'Fechamento da negociação' },
      })
      await tx.opportunityItem.update({ where: { id: item.id }, data: { clientServiceId: servico.id } })
      // Parcelas previstas seguem a regra financeira existente
      await seedServicePayments(tx, servico.id)
    }

    // Regras financeiras e classificação já existentes
    await recalcClientMonthlyValue(tx, cliente.id)
    await applyAutoTier(tx, cliente.id)

    const agora = new Date()
    await tx.opportunity.update({
      where: { id: opportunityId },
      data: {
        stage: 'GANHO',
        clientId: cliente.id,
        convertedClientId: cliente.id,
        closedAt: opp.closedAt ?? agora,
        stageChangedAt: agora,
        lossReason: null,
      },
    })
    await logOpportunityEvent(tx, opportunityId, 'GANHO', `Negociação ganha por ${user.name}`, user.id)
    await logOpportunityEvent(
      tx, opportunityId, 'CONVERSAO',
      `${criouCliente ? 'Cliente criado' : 'Cliente vinculado'}: ${cliente.name} · ${serviceIds.length} serviço(s) contratado(s)`,
      user.id, { clientId: cliente.id, serviceIds },
    )

    return { clientId: cliente.id, clientName: cliente.name, created: criouCliente, serviceIds, alreadyConverted: false }
  })

  if (!result.alreadyConverted) {
    await logActivity(user.id, 'fechou negociação e converteu em cliente', 'Pipeline', `${opp.title} · ${result.clientName}`)
  }
  return result
}

/* ------------------------------ etapas ------------------------------ */

/**
 * Move a oportunidade de etapa. Arrastar, escolher no seletor ou confirmar a
 * proposta caem todos aqui, com as mesmas validações do servidor.
 */
export async function moveStage(
  opportunityId: string,
  to: string,
  user: { id: string; name: string; role: string },
  extras: { lossReason?: string | null; conversion?: ConversionOverrides } = {},
) {
  if (!isStage(to)) throw new PipelineError('Etapa inválida.')
  const opp = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    include: { items: true },
  })
  if (!opp) throw new PipelineError('Oportunidade não encontrada.')
  if (user.role !== 'ADMIN' && opp.ownerId !== user.id) {
    throw new PipelineError('Só o responsável pela negociação ou um administrador pode movê-la.')
  }

  const erros = validateStageMove({
    from: opp.stage, to,
    items: opp.items as ItemLike[],
    estimateCents: opp.estimateCents,
    lossReason: extras.lossReason,
    converted: !!opp.convertedClientId,
  })
  if (erros.length > 0) throw new PipelineError(erros.join(' '))

  if (to === 'GANHO') {
    if (user.role !== 'ADMIN') throw new PipelineError('Somente administradores concluem a conversão em cliente.')
    return { stage: 'GANHO' as const, conversion: await convertOpportunity(opportunityId, user, extras.conversion) }
  }

  const agora = new Date()
  await prisma.$transaction(async (tx) => {
    await tx.opportunity.update({
      where: { id: opportunityId },
      data: {
        stage: to,
        stageChangedAt: agora,
        closedAt: to === 'PERDIDO' ? agora : null,
        lossReason: to === 'PERDIDO' ? String(extras.lossReason ?? '').slice(0, 300) : null,
      },
    })
    await logOpportunityEvent(
      tx, opportunityId, to === 'PERDIDO' ? 'PERDA' : 'ETAPA',
      to === 'PERDIDO'
        ? `Negociação perdida por ${user.name} — ${String(extras.lossReason ?? '').slice(0, 300)}`
        : `Etapa alterada de ${opp.stage} para ${to} por ${user.name}`,
      user.id,
    )
  })
  return { stage: to, conversion: null }
}

/**
 * Reabertura administrativa de uma conversão. Não apaga cliente, serviços,
 * pagamentos nem documentos — apenas solta a oportunidade para nova análise.
 */
export async function reopenOpportunity(opportunityId: string, user: { id: string; name: string }, reason: string) {
  const opp = await prisma.opportunity.findUnique({ where: { id: opportunityId } })
  if (!opp) throw new PipelineError('Oportunidade não encontrada.')
  if (!opp.convertedClientId) throw new PipelineError('Esta oportunidade não foi convertida.')
  if (!reason.trim()) throw new PipelineError('Informe o motivo da reabertura.')

  await prisma.$transaction(async (tx) => {
    await tx.opportunity.update({
      where: { id: opportunityId },
      data: { stage: 'EM_NEGOCIACAO', closedAt: null, stageChangedAt: new Date() },
    })
    await logOpportunityEvent(
      tx, opportunityId, 'REABERTURA',
      `Reaberta por ${user.name} — ${reason.slice(0, 300)}. Cliente, serviços e pagamentos foram preservados.`,
      user.id, { clientId: opp.convertedClientId },
    )
  })
  await logActivity(user.id, 'reabriu negociação convertida', 'Pipeline', opp.title)
}

/* --------------------------- leitura do quadro --------------------------- */

export async function boardData(viewer: { id: string; role: string }) {
  const where: Prisma.OpportunityWhereInput = viewer.role === 'ADMIN' ? {} : { ownerId: viewer.id }
  const [opportunities, owners, catalog] = await Promise.all([
    prisma.opportunity.findMany({ where, include: OPPORTUNITY_INCLUDE, orderBy: { stageChangedAt: 'desc' } }),
    prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.serviceCatalog.findMany({
      where: { isActive: true },
      select: { id: true, name: true, category: true, billingType: true, minCents: true, maxCents: true, defaultCents: true },
      orderBy: { name: 'asc' },
    }),
  ])
  return { opportunities, owners, catalog }
}

/** Grupo que o cliente teria se esta negociação fechar (apenas indicação). */
export async function projectedTierFor(opportunityId: string) {
  const opp = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    include: { items: true },
  })
  if (!opp) return null
  const ranges = await getTierRanges()
  const atual = opp.clientId ? await clientTicketCents(prisma, opp.clientId) : 0
  return projectedTier(atual, opportunityTotals(opp.items as ItemLike[], opp.estimateCents), ranges)
}

/** Normaliza um item vindo do formulário. */
export function itemFromBody(body: Record<string, unknown>, order: number) {
  const contractType = String(body.contractType ?? 'RECORRENTE')
  const competence = typeof body.competence === 'string' && isCompetence(body.competence) ? body.competence : null
  return {
    order,
    catalogId: body.catalogId ? String(body.catalogId) : null,
    name: String(body.name ?? '').trim().slice(0, 160),
    scope: body.scope ? String(body.scope).slice(0, 2000) : null,
    contractType,
    quantity: Math.max(1, Math.round(Number(body.quantity) || 1)),
    unitCents: Math.max(0, Math.round(Number(body.unitCents) || 0)),
    discountCents: Math.max(0, Math.round(Number(body.discountCents) || 0)),
    months: body.months ? Math.max(0, Math.round(Number(body.months))) : null,
    startDate: body.startDate ? new Date(`${String(body.startDate).slice(0, 10)}T12:00:00Z`) : null,
    competence: contractType === 'AVULSO' ? competence : null,
    notes: body.notes ? String(body.notes).slice(0, 500) : null,
  }
}

/**
 * Números comerciais do período para o Dashboard. Abertas entram pela data
 * prevista de fechamento; ganhas e perdidas pela data real. Cada negociação
 * conta uma única vez, inclusive na visão anual.
 */
export async function pipelinePeriodSummary(from: Date, to: Date) {
  const opportunities = await prisma.opportunity.findMany({
    select: {
      id: true, stage: true, expectedCloseDate: true, closedAt: true, estimateCents: true,
      items: { select: { contractType: true, quantity: true, unitCents: true, discountCents: true, months: true } },
    },
  })
  const { pipelineSummary } = await import('./pipeline-core')
  return pipelineSummary(opportunities, from, to)
}

/** Leads criados no período (Prospect é o cadastro de lead do pipeline). */
export async function newLeadsInPeriod(from: Date, to: Date): Promise<number> {
  return prisma.prospect.count({ where: { createdAt: { gte: from, lte: to } } })
}
