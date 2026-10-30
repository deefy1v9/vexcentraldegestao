/**
 * BPO financeiro da Central: as contas que o painel BPO mostra, como regras
 * puras (sem banco e sem rede). A rota /api/financeiro/bpo colhe os dados e
 * passa para cá. Testado em scripts/tests/bpo-core.test.ts.
 *
 * Valores em CENTAVOS e datas como dia civil de São Paulo (AAAA-MM-DD): a
 * comparação de vencimento é por dia, nunca por hora.
 */

export const HORIZONTES = [7, 30, 60, 90] as const

/** Soma `dias` a um dia civil AAAA-MM-DD. */
export function addDays(dia: string, dias: number): string {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Dias entre dois dias civis. Positivo = `ate` depois de `de`. */
export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000)
}

export interface Previsto {
  /** Vencimento AAAA-MM-DD */
  vence: string
  cents: number
  nome: string
}

export interface Projecao {
  dias: number
  ate: string
  /** Recebimentos que vencem de hoje até o fim do horizonte. */
  entradasCents: number
  /** Contas a pagar até o fim do horizonte, inclusive as já vencidas (continuam devidas). */
  saidasCents: number
  /** Saldo confirmado + entradas no prazo − saídas. */
  saldoCents: number
  /** O mesmo saldo se os recebimentos atrasados entrarem: é cenário, não fato. */
  saldoComAtrasadosCents: number
}

/**
 * Fluxo de caixa projetado. Recebimento atrasado fica fora do saldo principal
 * (é incerto) e entra só no cenário otimista; conta a pagar atrasada entra
 * sempre, porque continua devida.
 */
export function projetarCaixa(params: {
  saldoCents: number
  hoje: string
  receber: Previsto[]
  pagar: Previsto[]
  horizontes?: readonly number[]
}): { projecoes: Projecao[]; atrasadosReceberCents: number } {
  const { saldoCents, hoje, receber, pagar } = params
  const atrasadosReceberCents = receber.filter((r) => r.vence < hoje).reduce((s, r) => s + r.cents, 0)
  const projecoes = (params.horizontes ?? HORIZONTES).map((dias) => {
    const ate = addDays(hoje, dias)
    const entradasCents = receber.filter((r) => r.vence >= hoje && r.vence <= ate).reduce((s, r) => s + r.cents, 0)
    const saidasCents = pagar.filter((p) => p.vence <= ate).reduce((s, p) => s + p.cents, 0)
    const saldo = saldoCents + entradasCents - saidasCents
    return { dias, ate, entradasCents, saidasCents, saldoCents: saldo, saldoComAtrasadosCents: saldo + atrasadosReceberCents }
  })
  return { projecoes, atrasadosReceberCents }
}

export type Risco = 'falta' | 'apertado' | 'ok'

/**
 * Risco de faltar dinheiro olhando 30 dias: "falta" se o saldo projetado fica
 * negativo; "apertado" se sobra menos de 10% do que sai no período.
 */
export function riscoDeCaixa(p: Pick<Projecao, 'saldoCents' | 'saidasCents'>): Risco {
  if (p.saldoCents < 0) return 'falta'
  if (p.saidasCents > 0 && p.saldoCents < p.saidasCents * 0.1) return 'apertado'
  return 'ok'
}

export interface FaixaAtraso {
  faixa: string
  cents: number
  qtd: number
}

/** Inadimplência por faixa de atraso (só o que já venceu). */
export function faixasDeAtraso(itens: Previsto[], hoje: string): FaixaAtraso[] {
  const faixas = [
    { faixa: '1 a 15 dias', min: 1, max: 15 },
    { faixa: '16 a 30 dias', min: 16, max: 30 },
    { faixa: '31 a 60 dias', min: 31, max: 60 },
    { faixa: 'mais de 60 dias', min: 61, max: Infinity },
  ]
  return faixas.map((f) => {
    const dentro = itens.filter((i) => {
      const d = diasEntre(i.vence, hoje)
      return d >= f.min && d <= f.max
    })
    return { faixa: f.faixa, cents: dentro.reduce((s, i) => s + i.cents, 0), qtd: dentro.length }
  })
}

export interface ReceitaCliente {
  nome: string
  cents: number
  /** Participação na receita do mês, em % com uma casa. */
  share: number
}

/**
 * Receita do mês por cliente, da maior para a menor, e o alerta de
 * concentração: um cliente com 25% ou mais, ou os três maiores com 50% ou mais.
 */
export function concentracao(linhas: Array<{ nome: string; cents: number }>): {
  clientes: ReceitaCliente[]
  totalCents: number
  top1: number
  top3: number
  alerta: string | null
} {
  const mapa = new Map<string, number>()
  for (const l of linhas) mapa.set(l.nome, (mapa.get(l.nome) ?? 0) + l.cents)
  const totalCents = [...mapa.values()].reduce((s, v) => s + v, 0)
  const pct = (v: number) => (totalCents > 0 ? Math.round((v / totalCents) * 1000) / 10 : 0)
  const clientes = [...mapa]
    .map(([nome, cents]) => ({ nome, cents, share: pct(cents) }))
    .sort((a, b) => b.cents - a.cents)
  const top1 = clientes[0]?.share ?? 0
  const top3 = pct(clientes.slice(0, 3).reduce((s, c) => s + c.cents, 0))
  const alerta = top1 >= 25
    ? `${clientes[0].nome} sozinho é ${top1}% da receita do mês.`
    : top3 >= 50
      ? `Os três maiores clientes somam ${top3}% da receita do mês.`
      : null
  return { clientes, totalCents, top1, top3, alerta }
}

export interface MovSocio {
  kind: string
  cents: number
  socio: string | null
  descricao: string
  dia: string
}

export interface ResumoSocio {
  socio: string
  /** Tudo o que o sócio tirou do caixa no mês (pró-labore, divisão, acerto). */
  retiradasCents: number
  /** Tudo o que o sócio pôs no caixa (aporte ou conta paga do bolso). */
  aportesCents: number
  /** Retiradas − aportes: o que de fato saiu da empresa para ele. */
  liquidoCents: number
  movimentos: MovSocio[]
}

/** Pró-labore e acertos por sócio no mês, do maior líquido para o menor. */
export function resumoPorSocio(movs: MovSocio[]): ResumoSocio[] {
  const mapa = new Map<string, ResumoSocio>()
  for (const m of movs) {
    if (m.kind !== 'RETIRADA' && m.kind !== 'APORTE') continue
    const socio = m.socio?.trim() || 'sem sócio informado'
    const r = mapa.get(socio) ?? { socio, retiradasCents: 0, aportesCents: 0, liquidoCents: 0, movimentos: [] }
    if (m.kind === 'RETIRADA') r.retiradasCents += Math.abs(m.cents)
    else r.aportesCents += Math.abs(m.cents)
    r.movimentos.push(m)
    mapa.set(socio, r)
  }
  return [...mapa.values()]
    .map((r) => ({ ...r, liquidoCents: r.retiradasCents - r.aportesCents, movimentos: [...r.movimentos].sort((a, b) => a.dia.localeCompare(b.dia)) }))
    .sort((a, b) => b.liquidoCents - a.liquidoCents)
}

export interface LinhaDre {
  rotulo: string
  atualCents: number
  anteriorCents: number | null
  /** Linha de total (resultado), mostrada em negrito. */
  total?: boolean
  /** Despesa: aumento é ruim. */
  despesa?: boolean
}

/**
 * Demonstrativo gerencial do mês por competência (não é DRE contábil). As
 * retiradas dos sócios entram depois do resultado operacional, separadas.
 */
export function dreGerencial(
  atual: { recebidaCents: number; previstaCents: number; custosPagosCents: number; salariosPagosCents: number; retiradasCents: number },
  anterior: { recebidaCents: number; previstaCents: number; custosPagosCents: number; salariosPagosCents: number; retiradasCents: number } | null,
): LinhaDre[] {
  const op = (x: typeof atual) => x.recebidaCents - x.custosPagosCents - x.salariosPagosCents
  const ant = <K extends keyof typeof atual>(k: K) => (anterior ? anterior[k] : null)
  return [
    { rotulo: 'Receita prevista (competência)', atualCents: atual.previstaCents, anteriorCents: ant('previstaCents') },
    { rotulo: 'Receita recebida', atualCents: atual.recebidaCents, anteriorCents: ant('recebidaCents') },
    { rotulo: '(−) Custos pagos', atualCents: atual.custosPagosCents, anteriorCents: ant('custosPagosCents'), despesa: true },
    { rotulo: '(−) Salários pagos', atualCents: atual.salariosPagosCents, anteriorCents: ant('salariosPagosCents'), despesa: true },
    { rotulo: '= Resultado operacional', atualCents: op(atual), anteriorCents: anterior ? op(anterior) : null, total: true },
    { rotulo: '(−) Retiradas dos sócios', atualCents: atual.retiradasCents, anteriorCents: ant('retiradasCents'), despesa: true },
    { rotulo: '= Resultado após retiradas', atualCents: op(atual) - atual.retiradasCents, anteriorCents: anterior ? op(anterior) - anterior.retiradasCents : null, total: true },
  ]
}

export interface ItemChecklist {
  rotulo: string
  ok: boolean
  detalhe: string
}

/** Checklist do fechamento do mês, a partir das pendências contadas. */
export function checklistFechamento(c: {
  receberAbertos: number
  pagarAbertos: number
  semCategoria: number
  semConta: number
  saldoCents: number
}): ItemChecklist[] {
  const n = (q: number, um: string, varios: string) => `${q} ${q === 1 ? um : varios}`
  return [
    { rotulo: 'Recebimentos do mês baixados', ok: c.receberAbertos === 0, detalhe: c.receberAbertos === 0 ? 'Tudo baixado.' : `${n(c.receberAbertos, 'parcela', 'parcelas')} em aberto.` },
    { rotulo: 'Contas do mês pagas', ok: c.pagarAbertos === 0, detalhe: c.pagarAbertos === 0 ? 'Tudo pago.' : `${n(c.pagarAbertos, 'conta', 'contas')} em aberto.` },
    { rotulo: 'Movimentos do caixa classificados', ok: c.semCategoria === 0, detalhe: c.semCategoria === 0 ? 'Todos com categoria.' : `${n(c.semCategoria, 'movimento', 'movimentos')} sem categoria (pendente de classificação).` },
    { rotulo: 'Recebimentos com conta de entrada', ok: c.semConta === 0, detalhe: c.semConta === 0 ? 'Todos com a conta informada.' : `${n(c.semConta, 'recebimento', 'recebimentos')} pagos sem a conta onde o dinheiro entrou.` },
    { rotulo: 'Saldo conferido com o extrato do banco', ok: false, detalhe: `Conferir à mão: a Central mostra ${(c.saldoCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.` },
  ]
}
