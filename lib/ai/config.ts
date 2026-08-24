import { prisma } from '../prisma'
import { decryptSecret } from '../crypto'

/**
 * Configuração da IA, lida de SystemSettings com fallback para variáveis de
 * ambiente — mesmo padrão da UAZAPI. Deixar o modelo configurável permite
 * trocar custo por capacidade sem novo deploy.
 */

/** Agente de comando: interpreta pedidos e dispara acoes reais. */
export const DEFAULT_AGENT_MODEL = 'claude-sonnet-5'
/** Rascunhos revisados por humano: tarefa mais simples, modelo mais barato. */
export const DEFAULT_DRAFT_MODEL = 'claude-haiku-4-5'

export const AI_SETTING_KEYS = [
  'AI_ENABLED',
  'AI_DRAFTS_ENABLED',
  'AI_COMMAND_NUMBERS',
  'AI_AGENT_MODEL',
  'AI_DRAFT_MODEL',
  'ANTHROPIC_API_KEY',
] as const

/** Chaves guardadas cifradas em SystemSettings. */
export const AI_ENCRYPTED_KEYS = new Set<string>(['ANTHROPIC_API_KEY'])

export interface AiConfig {
  enabled: boolean
  draftsEnabled: boolean
  apiKey: string
  agentModel: string
  draftModel: string
  /** Números autorizados a comandar a IA, só dígitos. */
  commandNumbers: string[]
}

/** Remove tudo que não for dígito — o WhatsApp varia o formato do número. */
export function normalizeNumber(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '')
}

export async function getAiConfig(): Promise<AiConfig> {
  const rows = await prisma.systemSettings.findMany({
    where: { key: { in: [...AI_SETTING_KEYS] } },
  })
  const map = new Map(rows.map((r) => [r.key, r.value]))

  const read = (key: string): string => {
    const raw = map.get(key)
    if (raw === undefined || raw === '') return process.env[key] ?? ''
    return (AI_ENCRYPTED_KEYS.has(key) ? decryptSecret(raw) : raw) ?? ''
  }

  return {
    enabled: read('AI_ENABLED') === 'true',
    draftsEnabled: read('AI_DRAFTS_ENABLED') === 'true',
    apiKey: read('ANTHROPIC_API_KEY'),
    agentModel: read('AI_AGENT_MODEL') || DEFAULT_AGENT_MODEL,
    draftModel: read('AI_DRAFT_MODEL') || DEFAULT_DRAFT_MODEL,
    commandNumbers: read('AI_COMMAND_NUMBERS')
      .split(',')
      .map(normalizeNumber)
      .filter(Boolean),
  }
}

/**
 * Um número só comanda a IA se estiver na allowlist. Sem isso qualquer pessoa
 * que mandasse mensagem para a instância poderia instruir a IA a disparar
 * mensagens para os clientes da agência.
 */
export function isCommandNumber(cfg: AiConfig, number: string): boolean {
  const n = normalizeNumber(number)
  if (!n) return false
  return cfg.commandNumbers.some((allowed) => allowed === n || n.endsWith(allowed))
}

const TZ = 'America/Sao_Paulo'

/** "domingo, 24/08/2026 14:32" — contexto temporal para o modelo. */
export function nowInBrazil(): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())
}

/** Formata uma data para exibição ao usuário no WhatsApp. */
export function formatBr(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
