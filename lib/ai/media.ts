import type Anthropic from '@anthropic-ai/sdk'

/**
 * Regras puras da camada de IA que não tocam rede nem banco: detectar áudio no
 * payload da UAZAPI, achar de onde baixar a mídia, converter as ferramentas
 * para o formato do Gemini e interpretar datas de prazo. Testadas em
 * scripts/tests/ai-core.test.ts.
 */

type Payload = Record<string, unknown>

const AUDIO_HINT = /audio|ptt|voice/i

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** A mensagem é um áudio (gravado ou arquivo)? A UAZAPI varia o campo conforme a versão. */
export function isAudioMessage(data: Payload): boolean {
  const fields = [data.type, data.messageType, data.mediaType, data.mimetype, data.mimeType]
  if (fields.some((f) => AUDIO_HINT.test(str(f)))) return true
  const inner = data.message as Payload | undefined
  if (inner && (inner.audioMessage || AUDIO_HINT.test(str(inner.type)))) return true
  const content = data.content as Payload | undefined
  return !!content && (AUDIO_HINT.test(str(content.mimetype)) || !!content.audioMessage)
}

/**
 * Links ou base64 de mídia presentes no próprio payload. Vazio significa que é
 * preciso pedir o arquivo à UAZAPI pelo id da mensagem.
 */
export function mediaCandidates(data: Payload): string[] {
  const content = data.content as Payload | undefined
  const raw = [data.mediaUrl, data.mediaURL, data.fileURL, data.fileUrl, data.url, data.file, data.base64,
    content?.url, content?.mediaUrl, content?.base64, content?.file]
  return raw.map(str).filter((s) => s.length > 20 && (/^https?:\/\//.test(s) || /^data:/.test(s) || /^[A-Za-z0-9+/=]+$/.test(s)))
}

/** MIME do áudio; o WhatsApp manda voz como OGG/Opus. */
export function audioMime(data: Payload): string {
  const content = data.content as Payload | undefined
  const m = str(data.mimetype) || str(data.mimeType) || str(content?.mimetype) || ''
  const base = m.split(';')[0].trim()
  return /^audio\//.test(base) ? base : 'audio/ogg'
}

/** Converte as ferramentas (JSON Schema do Anthropic) para o Gemini sem perder nada. */
export function toGeminiFunctionDeclarations(tools: Anthropic.Tool[]) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description ?? '',
    parametersJsonSchema: t.input_schema,
  }))
}

/**
 * Prazo de demanda vindo da IA: "YYYY-MM-DD" (ou ISO com hora). Devolve a
 * data ao meio-dia UTC, o padrão do sistema para dia civil no Brasil.
 */
export function parseDueDay(value: unknown): Date | null {
  const s = str(value).trim()
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}
