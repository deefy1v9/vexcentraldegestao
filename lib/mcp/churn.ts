/**
 * Risco de churn de um cliente: regras simples e explicáveis, cada ponto com
 * o motivo escrito (o agente repete o motivo, não um número solto).
 * Testado em scripts/tests/mcp-churn.test.ts.
 *
 *   pagamento atrasado ........ +30 (+20 se passou de 15 dias, +10 se 2 ou mais)
 *   sem nenhum serviço ativo .. +25
 *   contrato termina em 30 dias +25 · contrato já venceu sem renovação +15
 *   serviço encerrado em 60 dias +20
 *   demandas atrasadas ........ +10 (1 ou 2) · +20 (3 ou mais)
 *   mudou para um grupo menor . +15
 *   nenhuma entrega em 30 dias  +10 (com serviço ativo)
 *
 * Nível: 50 ou mais = alto · 25 a 49 = médio · abaixo de 25 = baixo.
 */

export interface DadosDoCliente {
  id: string
  nome: string
  contractEnd: Date | null
  servicosAtivos: number
  servicosEncerradosRecentes: Array<{ nome: string; endedAt: Date }>
  parcelasAtrasadas: Array<{ valor: number; vencimento: Date }>
  demandasAtrasadas: number
  ultimaEntrega: Date | null
  rebaixado: boolean
}

export type NivelDeRisco = 'alto' | 'medio' | 'baixo'
export interface RiscoDeChurn { id: string; nome: string; pontos: number; nivel: NivelDeRisco; motivos: string[] }

const DIA = 24 * 60 * 60 * 1000
const diasEntre = (de: Date, ate: Date) => Math.floor((ate.getTime() - de.getTime()) / DIA)
const dataCurta = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })
const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function nivelDoRisco(pontos: number): NivelDeRisco {
  return pontos >= 50 ? 'alto' : pontos >= 25 ? 'medio' : 'baixo'
}

export function riscoDeChurn(d: DadosDoCliente, agora: Date = new Date()): RiscoDeChurn {
  let pontos = 0
  const motivos: string[] = []

  if (d.parcelasAtrasadas.length > 0) {
    const maisAntiga = d.parcelasAtrasadas.reduce((a, b) => (a.vencimento < b.vencimento ? a : b))
    const dias = Math.max(1, diasEntre(maisAntiga.vencimento, agora))
    const total = d.parcelasAtrasadas.reduce((s, p) => s + p.valor, 0)
    pontos += 30
    if (dias > 15) pontos += 20
    if (d.parcelasAtrasadas.length >= 2) pontos += 10
    motivos.push(`${d.parcelasAtrasadas.length} pagamento(s) atrasado(s), ${reais(total)}, o mais antigo há ${dias} dia(s)`)
  }

  if (d.servicosAtivos === 0) {
    pontos += 25
    motivos.push('nenhum serviço ativo')
  }

  if (d.contractEnd) {
    const faltam = diasEntre(agora, d.contractEnd)
    if (faltam >= 0 && faltam <= 30) {
      pontos += 25
      motivos.push(`contrato termina em ${dataCurta(d.contractEnd)}`)
    } else if (faltam < 0) {
      pontos += 15
      motivos.push(`contrato venceu em ${dataCurta(d.contractEnd)} sem renovação registrada`)
    }
  }

  const encerrados = d.servicosEncerradosRecentes.filter((s) => diasEntre(s.endedAt, agora) <= 60)
  if (encerrados.length > 0) {
    pontos += 20
    motivos.push(`encerrou ${encerrados.map((s) => `${s.nome} (${dataCurta(s.endedAt)})`).join(', ')}`)
  }

  if (d.demandasAtrasadas > 0) {
    pontos += d.demandasAtrasadas >= 3 ? 20 : 10
    motivos.push(`${d.demandasAtrasadas} demanda(s) atrasada(s)`)
  }

  if (d.rebaixado) {
    pontos += 15
    motivos.push('mudou para um grupo menor nos últimos 90 dias')
  }

  if (d.servicosAtivos > 0) {
    const semEntrega = d.ultimaEntrega ? diasEntre(d.ultimaEntrega, agora) : null
    if (semEntrega === null || semEntrega > 30) {
      pontos += 10
      motivos.push(semEntrega === null ? 'nenhuma entrega registrada' : `nenhuma entrega há ${semEntrega} dias`)
    }
  }

  return { id: d.id, nome: d.nome, pontos, nivel: nivelDoRisco(pontos), motivos }
}

/** Do maior risco para o menor; empate pelo nome. */
export function ordenarPorRisco(lista: RiscoDeChurn[]): RiscoDeChurn[] {
  return [...lista].sort((a, b) => b.pontos - a.pontos || a.nome.localeCompare(b.nome, 'pt-BR'))
}
