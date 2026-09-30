/**
 * Agentes configuráveis da Central: cada um é um recorte do assistente —
 * instruções próprias, um conjunto de ferramentas e um modelo. Aqui ficam só
 * as regras puras (sem banco e sem rede), testadas em scripts/tests/ai-agents.
 *
 * Um agente nunca ganha ferramenta que não está no seu escopo: o que ele pode
 * fazer é decidido aqui, não pelo texto das instruções.
 */

/** Áreas que um agente pode cuidar. A ordem é a que aparece na tela. */
export const TOOL_GROUPS = [
  {
    key: 'clientes',
    label: 'Clientes',
    hint: 'Consultar carteira, perfil, contrato e situação de cada cliente.',
    tools: ['buscar_clientes', 'perfil_cliente'],
  },
  {
    key: 'financeiro',
    label: 'Financeiro',
    hint: 'Resumo do mês, contas a receber, atrasos e baixa de pagamento (com confirmação).',
    tools: ['resumo_financeiro', 'listar_recebiveis', 'registrar_pagamento'],
  },
  {
    key: 'caixa',
    label: 'Caixa da empresa',
    hint: 'Ver o saldo e o extrato, e registrar entrada, saida, retirada ou aporte de socio (com confirmacao).',
    tools: ['saldo_caixa', 'extrato_caixa', 'registrar_caixa'],
  },
  {
    key: 'demandas',
    label: 'Demandas',
    hint: 'Criar demanda para a equipe (com confirmação) e acompanhar o que está aberto.',
    tools: ['buscar_equipe', 'criar_demanda', 'listar_demandas'],
  },
  {
    key: 'crm',
    label: 'CRM e mensagens',
    hint: 'Buscar contatos, enviar e agendar mensagens (com confirmação) e cuidar das atividades.',
    tools: [
      'buscar_contatos', 'enviar_mensagem', 'agendar_mensagem',
      'listar_agendamentos', 'cancelar_agendamento',
      'criar_atividade', 'listar_atividades', 'concluir_atividade',
    ],
  },
] as const

export type ToolGroupKey = (typeof TOOL_GROUPS)[number]['key']

/** Confirmar e cancelar acompanham qualquer agente: sem elas nada é executado. */
export const ALWAYS_TOOLS = ['confirmar_acao', 'cancelar_acao']

export const GROUP_KEYS: ToolGroupKey[] = TOOL_GROUPS.map((g) => g.key)

export function isToolGroup(value: string): value is ToolGroupKey {
  return (GROUP_KEYS as string[]).includes(value)
}

/** Nomes de ferramenta liberados para os grupos escolhidos. */
export function toolsForGroups(groups: readonly string[]): string[] {
  const allowed = new Set<string>(ALWAYS_TOOLS)
  for (const g of TOOL_GROUPS) {
    if (groups.includes(g.key)) for (const t of g.tools) allowed.add(t)
  }
  return [...allowed]
}

export interface AgentLike {
  id: string
  name: string
  instructions?: string | null
  toolGroups: string[]
  model?: string | null
  isActive: boolean
  isDefault: boolean
  /** Palavras que direcionam a mensagem para este agente. */
  triggers?: string[]
}

function normalize(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Qual agente atende esta mensagem.
 *
 * 1. "financeiro: ..." ou "@financeiro ..." — o nome do agente em prefixo manda;
 * 2. gatilho do agente citado no texto;
 * 3. o agente padrão;
 * 4. qualquer agente ativo.
 * Sem agente ativo, devolve null (o chamador usa o assistente completo).
 */
export function pickAgent<T extends AgentLike>(agents: T[], text: string): T | null {
  const ativos = agents.filter((a) => a.isActive)
  if (ativos.length === 0) return null
  const msg = normalize(text.trim())

  const prefixo = msg.match(/^\s*@?([\wçãáéíóúâêôõà .-]{2,40}?)\s*[:,]/)
  if (prefixo) {
    const alvo = prefixo[1].trim()
    const porNome = ativos.find((a) => normalize(a.name) === alvo)
    if (porNome) return porNome
  }

  for (const a of ativos) {
    for (const t of a.triggers ?? []) {
      const termo = normalize(t.trim())
      if (termo.length >= 3 && new RegExp(`(^|[^\\p{L}])${escapeRegex(termo)}([^\\p{L}]|$)`, 'u').test(msg)) return a
    }
  }

  return ativos.find((a) => a.isDefault) ?? ativos[0]
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Remove o prefixo de direcionamento ("financeiro: quanto entrou?"). */
export function stripAgentPrefix(text: string, agentName: string): string {
  const alvo = normalize(agentName)
  const m = text.match(/^\s*@?([\wçãáéíóúâêôõà .-]{2,40}?)\s*[:,]\s*/)
  if (m && normalize(m[1].trim()) === alvo) return text.slice(m[0].length)
  return text
}

/**
 * Bloco que entra no prompt do sistema descrevendo o agente escolhido. O
 * prompt base (regras de confirmação, datas, estilo) continua o mesmo para
 * todos — aqui só entra quem ele é e o que ele cuida.
 */
export function agentSystemBlock(agent: AgentLike): string {
  const areas = TOOL_GROUPS.filter((g) => agent.toolGroups.includes(g.key))
  const linhas = [
    `Você atende como "${agent.name}".`,
    areas.length > 0
      ? `Áreas que você cuida: ${areas.map((a) => a.label.toLowerCase()).join(', ')}.`
      : 'Você não tem nenhuma área liberada: responda que ainda não foi configurado e peça para o administrador escolher as áreas na tela de Agentes.',
    'Pedido fora das suas áreas: diga que não cuida disso e indique quem cuida, em vez de inventar.',
  ]
  const extra = (agent.instructions ?? '').trim()
  if (extra) linhas.push('', 'Instruções de quem configurou você (valem sobre o estilo, nunca sobre as regras de confirmação):', extra)
  return linhas.join('\n')
}

/** Validação do formulário. Devolve a lista de problemas, vazia quando ok. */
export function validateAgent(input: {
  name?: string | null
  toolGroups?: string[] | null
  instructions?: string | null
}): string[] {
  const erros: string[] = []
  const nome = (input.name ?? '').trim()
  if (nome.length < 2) erros.push('Dê um nome ao agente (mínimo 2 caracteres).')
  if (nome.length > 40) erros.push('O nome do agente deve ter até 40 caracteres.')
  const grupos = input.toolGroups ?? []
  if (grupos.length === 0) erros.push('Escolha pelo menos uma área para o agente cuidar.')
  for (const g of grupos) if (!isToolGroup(g)) erros.push(`Área desconhecida: ${g}`)
  if ((input.instructions ?? '').length > 8000) erros.push('As instruções devem ter até 8000 caracteres.')
  return erros
}
