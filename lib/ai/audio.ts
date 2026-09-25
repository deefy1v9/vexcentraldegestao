import { prisma } from '../prisma'
import { deliverMessage } from '../crm-delivery'
import { fetchAsBase64, uazDownloadMedia } from '../uazapi'
import { getAiConfig, type AiConfig } from './config'
import { transcribeAudio } from './gemini'
import { audioMime, mediaCandidates } from './media'
import { processAiJob } from './agent'
import { generateDraft } from './drafts'

/**
 * Áudio recebido no WhatsApp: baixa, transcreve com o Gemini, grava a
 * transcrição na mensagem do CRM e, se veio de um número de comando, entrega o
 * texto ao assistente. Roda em segundo plano: o webhook já respondeu à UAZAPI.
 */
export async function handleIncomingAudio(params: {
  messageId: string
  conversationId: string
  number: string
  uazapiMsgId?: string
  payload: Record<string, unknown>
  isCommand: boolean
  cfg: AiConfig
}): Promise<void> {
  const { cfg } = params
  if (!cfg.geminiApiKey) {
    if (params.isCommand) await avisar(params.number, 'Recebi um áudio, mas a transcrição não está configurada. Manda por texto?')
    return
  }

  let media: { base64: string; mimeType?: string } | null = null
  for (const c of mediaCandidates(params.payload)) {
    media = await fetchAsBase64(c, audioMime(params.payload)).catch(() => null)
    if (media) break
  }
  if (!media && params.uazapiMsgId) media = await uazDownloadMedia(params.uazapiMsgId).catch(() => null)
  if (!media) {
    console.error('[ai] áudio sem mídia para baixar', JSON.stringify(Object.keys(params.payload)))
    if (params.isCommand) await avisar(params.number, 'Não consegui baixar o áudio. Manda de novo ou por texto?')
    return
  }

  const texto = await transcribeAudio({
    apiKey: cfg.geminiApiKey,
    model: /^gemini/.test(cfg.agentModel) ? cfg.agentModel : 'gemini-3.5-flash',
    base64: media.base64,
    mimeType: media.mimeType && /^audio\//.test(media.mimeType) ? media.mimeType : audioMime(params.payload),
  }).catch((err) => {
    console.error('[ai] transcrição falhou', err instanceof Error ? err.message : String(err))
    return ''
  })

  if (!texto) {
    if (params.isCommand) await avisar(params.number, 'Não consegui entender o áudio. Pode repetir ou mandar por texto?')
    return
  }

  const content = `🎤 ${texto}`
  await prisma.crmMessage.update({ where: { id: params.messageId }, data: { content } })

  if (params.isCommand) {
    const job = await prisma.aiJob.create({
      data: { conversationId: params.conversationId, commandChat: params.number, incomingText: texto },
    })
    await processAiJob(job.id)
  } else if (cfg.draftsEnabled) {
    await generateDraft({ conversationId: params.conversationId, cfg }).catch(() => {})
  }
}

async function avisar(number: string, text: string) {
  await deliverMessage(number, text, { senderName: 'IA' }).catch(() => {})
}

/** Config atual, tolerante a falha: sem IA configurada, áudio fica só como [Áudio]. */
export async function aiConfigSafe(): Promise<AiConfig | null> {
  return getAiConfig().catch(() => null)
}
