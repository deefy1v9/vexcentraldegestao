/**
 * Regras puras do pipeline comercial — sem Prisma, sem rede, testáveis.
 *
 * Tudo em centavos inteiros. O valor de uma oportunidade é POTENCIAL: só vira
 * contratação quando a negociação é ganha e convertida. Recorrente, avulso e
 * projeto nunca são somados na mesma métrica.
 */

/* --------------------------------- etapas --------------------------------- */

export const STAGES = [
  'NOVO', 'EM_CONTATO', 'QUALIFICADO', 'PROPOSTA_ENVIADA', 'EM_NEGOCIACAO', 'GANHO', 'PERDIDO',
] as const
export type Stage = (typeof STAGES)[number]

export const STAGE_LABEL: Record<Stage, string> = {
  NOVO: 'Novo lead',
  EM_CONTATO: 'Em contato',
  QUALIFICADO: 'Qualificado',
  PROPOSTA_ENVIADA: 'Proposta enviada',
  EM_NEGOCIACAO: 'Em negociação',
  GANHO: 'Fechado — ganho',
  PERDIDO: 'Fechado — perdido',
}

export const OPEN_STAGES = STAGES.filter((s) => s !== 'GANHO' && s !== 'PERDIDO')

export function isStage(v: unknown): v is Stage {
  return typeof v === 'string' && (STAGES as readonly string[]).includes(v)
}
export function isOpenStage(stage: string): boolean {
  return (OPEN_STAGES as readonly string[]).includes(stage)
}
export function isClosedStage(stage: string): boolean {
  return stage === 'GANHO' || stage === 'PERDIDO'
}

/* --------------------------------- itens --------------------------------- */

export interface ItemLike {
  contractType?: string | null // RECORRENTE | AVULSO | PROJETO | QUANTIDADE | PERSONALIZADO
  quantity?: number | null
  unitCents?: number | null
  discountCents?: number | null
  months?: number | null
  competence?: string | null
  startDate?: Date | string | null
  name?: string
}

/** Valor negociado do item: unitário × quantidade − desconto, nunca negativo. */
export function itemCents(item: ItemLike): number {
  const unit = Math.max(0, Math.round(item.unitCents ?? 0))
  const qty = Math.max(1, Math.round(item.quantity ?? 1))
  const discount = Math.max(0, Math.round(item.discountCents ?? 0))
  return Math.max(0, unit * qty - discount)
}

/** Recorrente de verdade: entra no MRR quando a vigência começar. */
export function isRecurringItem(item: ItemLike): boolean {
  const t = item.contractType ?? 'RECORRENTE'
  return t === 'RECORRENTE' || t === 'QUANTIDADE' || t === 'PERSONALIZADO'
}
export function isAvulsoItem(item: ItemLike): boolean {
  return (item.contractType ?? 'RECORRENTE') === 'AVULSO'
}
export function isProjectItem(item: ItemLike): boolean {
  return (item.contractType ?? 'RECORRENTE') === 'PROJETO'
}

export interface OpportunityTotals {
  /** Mensalidade orçada (R$/mês) — nunca somada com o total do contrato. */
  recorrenteCents: number
  /** Serviços de cobrança única. */
  avulsoCents: number
  /** Projetos: mensal previsto durante o período contratado. */
  projetoMensalCents: number
  /** Valor total do contrato: recorrente × meses + avulso + projeto × meses. */
  totalContratoCents: number
  /** Maior prazo em meses informado nos itens (0 = sem prazo definido). */
  months: number
  /** true quando não há itens e o valor exibido vem da estimativa. */
  usandoEstimativa: boolean
  itemCount: number
}

/**
 * Totais da oportunidade. Sem itens detalhados, usa a estimativa informada —
 * marcada como tal, porque não dá para separar recorrente de avulso nela.
 */
export function opportunityTotals(items: ItemLike[], estimateCents = 0): OpportunityTotals {
  if (items.length === 0) {
    const estimate = Math.max(0, Math.round(estimateCents ?? 0))
    return {
      recorrenteCents: 0, avulsoCents: 0, projetoMensalCents: 0,
      totalContratoCents: estimate, months: 0,
      usandoEstimativa: estimate > 0, itemCount: 0,
    }
  }

  let recorrente = 0
  let avulso = 0
  let projeto = 0
  let months = 0
  let totalContrato = 0

  for (const item of items) {
    const cents = itemCents(item)
    const meses = Math.max(0, Math.round(item.months ?? 0))
    if (meses > months) months = meses
    if (isAvulsoItem(item)) {
      avulso += cents
      totalContrato += cents
      continue
    }
    if (isProjectItem(item)) {
      projeto += cents
      // Projeto parcelado não vira receita recorrente: o total é o período
      totalContrato += cents * (meses > 0 ? meses : 1)
      continue
    }
    recorrente += cents
    totalContrato += cents * (meses > 0 ? meses : 1)
  }

  return {
    recorrenteCents: recorrente,
    avulsoCents: avulso,
    projetoMensalCents: projeto,
    totalContratoCents: totalContrato,
    months,
    usandoEstimativa: false,
    itemCount: items.length,
  }
}

/** Texto da base de cálculo do total do contrato, para exibir na tela. */
export function contractBasis(totals: OpportunityTotals): string | null {
  if (totals.usandoEstimativa || totals.months <= 0) return null
  const partes: string[] = []
  if (totals.recorrenteCents > 0) partes.push(`recorrente × ${totals.months} meses`)
  if (totals.projetoMensalCents > 0) partes.push(`projeto × ${totals.months} meses`)
  if (totals.avulsoCents > 0) partes.push('avulso uma vez')
  return partes.length > 0 ? partes.join(' + ') : null
}

/* ------------------------------- validações ------------------------------- */

export interface MoveInput {
  from: string
  to: string
  items: ItemLike[]
  estimateCents?: number
  lossReason?: string | null
  converted?: boolean
}

/**
 * O que impede a mudança de etapa. Vale igual no arrastar, no seletor e na
 * confirmação da proposta — o servidor roda estas mesmas regras.
 */
export function validateStageMove(input: MoveInput): string[] {
  const errors: string[] = []
  if (!isStage(input.to)) return ['Etapa inválida.']
  if (input.from === input.to) return []

  // Conversão concluída não volta por movimentação comum
  if (input.converted && input.from === 'GANHO') {
    errors.push('Esta oportunidade já foi convertida em cliente. Use a ação administrativa de reabertura.')
    return errors
  }

  if (input.to === 'PERDIDO' && !String(input.lossReason ?? '').trim()) {
    errors.push('Informe o motivo da perda.')
  }

  if (input.to === 'GANHO') {
    if (input.items.length === 0) {
      errors.push('Antes de fechar como ganho, detalhe os serviços e valores contratados.')
    }
    const semValor = input.items.filter((i) => itemCents(i) <= 0)
    if (input.items.length > 0 && semValor.length > 0) {
      errors.push(`${semValor.length} serviço(s) sem valor negociado.`)
    }
    for (const item of input.items) {
      if (isAvulsoItem(item) && !isCompetence(item.competence)) {
        errors.push(`Serviço avulso "${item.name ?? 'sem nome'}" precisa da competência (AAAA-MM).`)
      }
    }
  }
  return errors
}

export function isCompetence(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)
}

/** Avisos de faixa do catálogo: nunca bloqueiam, só informam. */
export function priceWarnings(
  items: Array<ItemLike & { catalogMinCents?: number | null; catalogMaxCents?: number | null; name?: string }>,
): string[] {
  const out: string[] = []
  for (const item of items) {
    const unit = Math.max(0, Math.round(item.unitCents ?? 0))
    if (item.catalogMinCents != null && unit < item.catalogMinCents) {
      out.push(`${item.name ?? 'Serviço'}: valor abaixo da faixa do catálogo.`)
    }
    if (item.catalogMaxCents != null && unit > item.catalogMaxCents) {
      out.push(`${item.name ?? 'Serviço'}: valor acima da faixa do catálogo.`)
    }
  }
  return out
}

/* ------------------------- resumo para o dashboard ------------------------- */

export interface OpportunityLike {
  id: string
  stage: string
  expectedCloseDate?: Date | string | null
  closedAt?: Date | string | null
  estimateCents?: number | null
  items: ItemLike[]
}

export interface PipelineSummary {
  abertas: number
  semPrevisao: number
  mrrPotencialCents: number
  avulsoPotencialCents: number
  projetoPotencialCents: number
  estimativaCents: number
  ganhas: number
  ganhasRecorrenteCents: number
  ganhasAvulsoCents: number
  perdidas: number
}

function inRange(value: Date | string | null | undefined, from: Date, to: Date): boolean {
  if (!value) return false
  const d = new Date(value)
  return d >= from && d <= to
}

/**
 * Números comerciais do período. Cada oportunidade entra uma única vez:
 * abertas pela data prevista de fechamento, ganhas e perdidas pela data real.
 */
export function pipelineSummary(opportunities: OpportunityLike[], from: Date, to: Date): PipelineSummary {
  const out: PipelineSummary = {
    abertas: 0, semPrevisao: 0, mrrPotencialCents: 0, avulsoPotencialCents: 0,
    projetoPotencialCents: 0, estimativaCents: 0, ganhas: 0, ganhasRecorrenteCents: 0,
    ganhasAvulsoCents: 0, perdidas: 0,
  }

  for (const opp of opportunities) {
    const totals = opportunityTotals(opp.items, opp.estimateCents ?? 0)

    if (isOpenStage(opp.stage)) {
      if (!opp.expectedCloseDate) { out.semPrevisao += 1; continue }
      if (!inRange(opp.expectedCloseDate, from, to)) continue
      out.abertas += 1
      out.mrrPotencialCents += totals.recorrenteCents
      out.avulsoPotencialCents += totals.avulsoCents
      out.projetoPotencialCents += totals.projetoMensalCents
      if (totals.usandoEstimativa) out.estimativaCents += totals.totalContratoCents
      continue
    }

    if (!inRange(opp.closedAt, from, to)) continue
    if (opp.stage === 'GANHO') {
      out.ganhas += 1
      out.ganhasRecorrenteCents += totals.recorrenteCents
      out.ganhasAvulsoCents += totals.avulsoCents
    } else if (opp.stage === 'PERDIDO') {
      out.perdidas += 1
    }
  }
  return out
}

/* --------------------------- grupo previsto --------------------------- */

/**
 * Grupo que o cliente teria após fechar: ticket recorrente atual + o que a
 * oportunidade acrescenta. É só indicação; não altera a classificação real.
 */
export function projectedTier(
  currentTicketCents: number,
  totals: OpportunityTotals,
  ranges: { startMaxCents: number; growthMaxCents: number },
): { ticketCents: number; tier: 'START' | 'GROWTH' | 'SCALE' | null } {
  const ticket = Math.max(0, currentTicketCents) + totals.recorrenteCents
  if (ticket <= 0) return { ticketCents: 0, tier: null }
  if (ticket <= ranges.startMaxCents) return { ticketCents: ticket, tier: 'START' }
  if (ticket <= ranges.growthMaxCents) return { ticketCents: ticket, tier: 'GROWTH' }
  return { ticketCents: ticket, tier: 'SCALE' }
}

/* ------------------------------ acompanhamento ------------------------------ */

/** Dias corridos entre duas datas (para "tempo na etapa"). */
export function daysBetween(from: Date | string, to: Date | string): number {
  const a = new Date(from).getTime()
  const b = new Date(to).getTime()
  return Math.max(0, Math.floor((b - a) / 86_400_000))
}

/** Contato atrasado: próxima ação com prazo vencido. */
export function isFollowUpLate(nextActionAt: Date | string | null | undefined, today: Date): boolean {
  if (!nextActionAt) return false
  return new Date(nextActionAt) < new Date(today.toISOString().slice(0, 10) + 'T00:00:00.000Z')
}
