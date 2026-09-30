/**
 * Caixa da empresa: todo dinheiro que entra e sai das contas da VEX, incluindo
 * as retiradas dos sócios. Aqui ficam só as regras puras — saldo, validação e
 * rótulos. Testado em scripts/tests/caixa-core.test.ts.
 *
 * Valores sempre em CENTAVOS inteiros: o saldo é dinheiro de verdade e não
 * pode acumular erro de ponto flutuante.
 */

export const CASH_KINDS = [
  { key: 'ENTRADA', label: 'Entrada', hint: 'Dinheiro que entrou (recebimento de cliente, reembolso, venda).', sinal: 1 },
  { key: 'SAIDA', label: 'Saída', hint: 'Pagamento feito pela empresa (fornecedor, ferramenta, imposto).', sinal: -1 },
  { key: 'RETIRADA', label: 'Retirada de sócio', hint: 'Dinheiro que um sócio tirou do caixa.', sinal: -1 },
  { key: 'APORTE', label: 'Aporte de sócio', hint: 'Dinheiro que um sócio colocou no caixa.', sinal: 1 },
] as const

export type CashKind = (typeof CASH_KINDS)[number]['key']
export const CASH_KIND_KEYS: CashKind[] = CASH_KINDS.map((k) => k.key)

export function isCashKind(v: string): v is CashKind {
  return (CASH_KIND_KEYS as string[]).includes(v)
}

export function cashSign(kind: string): number {
  return CASH_KINDS.find((k) => k.key === kind)?.sinal ?? 0
}

export function cashLabel(kind: string): string {
  return CASH_KINDS.find((k) => k.key === kind)?.label ?? kind
}

export interface MovementLike {
  kind: string
  amountCents: number
}

/** Saldo em centavos: entradas e aportes somam, saídas e retiradas subtraem. */
export function cashBalance(movs: MovementLike[]): number {
  return movs.reduce((acc, m) => acc + cashSign(m.kind) * Math.abs(Math.round(m.amountCents)), 0)
}

export interface CashTotals {
  entradasCents: number
  saidasCents: number
  retiradasCents: number
  aportesCents: number
  saldoCents: number
}

/** Totais por tipo, para o topo da tela e para o aviso do agente. */
export function cashTotals(movs: MovementLike[]): CashTotals {
  const soma = (k: CashKind) => movs.filter((m) => m.kind === k).reduce((s, m) => s + Math.abs(Math.round(m.amountCents)), 0)
  const entradasCents = soma('ENTRADA')
  const saidasCents = soma('SAIDA')
  const retiradasCents = soma('RETIRADA')
  const aportesCents = soma('APORTE')
  return {
    entradasCents, saidasCents, retiradasCents, aportesCents,
    saldoCents: entradasCents + aportesCents - saidasCents - retiradasCents,
  }
}

/** Retiradas por sócio no período — a pergunta que o Davi e o Antonio fazem. */
export function withdrawalsByPartner(
  movs: Array<MovementLike & { partnerName?: string | null }>,
): Array<{ nome: string; cents: number }> {
  const mapa = new Map<string, number>()
  for (const m of movs) {
    if (m.kind !== 'RETIRADA') continue
    const nome = m.partnerName?.trim() || 'sem sócio informado'
    mapa.set(nome, (mapa.get(nome) ?? 0) + Math.abs(Math.round(m.amountCents)))
  }
  return [...mapa].map(([nome, cents]) => ({ nome, cents })).sort((a, b) => b.cents - a.cents)
}

/**
 * Valor em centavos a partir do que a pessoa escreveu: "1.500,00", "1500.50",
 * "R$ 300" ou um número. Devolve null quando não dá para ler com segurança.
 */
export function parseAmountCents(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null
  }
  const bruto = String(value ?? '').replace(/r\$/i, '').trim()
  if (!bruto) return null
  const limpo = bruto.replace(/\s/g, '')
  // "1.234,56" (pt-BR) vira "1234.56"; "1,234.56" e "1234.56" já são válidos
  const normalizado = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : (limpo.match(/\./g) ?? []).length > 1 ? limpo.replace(/\./g, '') : limpo
  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) return null
  const n = Number(normalizado)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null
}

/** Problemas do lançamento. Lista vazia quer dizer que pode gravar. */
export function validateMovement(input: {
  kind?: string | null
  amountCents?: number | null
  description?: string | null
  date?: string | null
  partnerId?: string | null
}): string[] {
  const erros: string[] = []
  if (!input.kind || !isCashKind(input.kind)) erros.push('Escolha o tipo do lançamento.')
  if (!input.amountCents || input.amountCents <= 0) erros.push('Informe um valor maior que zero.')
  if (!(input.description ?? '').trim()) erros.push('Escreva do que se trata.')
  if (input.date && !/^\d{4}-\d{2}-\d{2}/.test(input.date)) erros.push('Data inválida: use AAAA-MM-DD.')
  if (input.kind === 'RETIRADA' && !input.partnerId) erros.push('Diga qual sócio fez a retirada.')
  return erros
}

export function brlFromCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
