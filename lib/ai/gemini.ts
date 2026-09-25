import { GoogleGenAI, type Content, type Part } from '@google/genai'
import type Anthropic from '@anthropic-ai/sdk'
import { toGeminiFunctionDeclarations } from './media'

/**
 * Gemini como motor do assistente: mesmo conjunto de ferramentas do agente
 * Anthropic, mesmo executor. Só muda o transporte da conversa.
 */

export interface GeminiHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface GeminiLoopParams {
  apiKey: string
  model: string
  system: string
  history: GeminiHistoryMessage[]
  userText: string
  tools: Anthropic.Tool[]
  maxTurns: number
  execute: (name: string, input: Record<string, unknown>) => Promise<{ output: string; isError: boolean }>
}

/** Roda o ciclo pedido → ferramentas → resposta e devolve o texto final. */
export async function runGeminiLoop(p: GeminiLoopParams): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: p.apiKey })
  const contents: Content[] = [
    ...p.history.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })),
    { role: 'user', parts: [{ text: p.userText }] },
  ]
  const functionDeclarations = toGeminiFunctionDeclarations(p.tools)
  let reply = ''

  for (let turn = 0; turn < p.maxTurns; turn++) {
    const response = await ai.models.generateContent({
      model: p.model,
      contents,
      config: {
        systemInstruction: p.system,
        tools: [{ functionDeclarations }],
        temperature: 0.2,
      },
    })

    const text = (response.text ?? '').trim()
    if (text) reply = text

    const calls = response.functionCalls ?? []
    const modelContent = response.candidates?.[0]?.content
    if (calls.length === 0 || !modelContent) break

    // Devolve a fala do modelo como veio (inclui as chamadas) e responde cada uma
    contents.push(modelContent)
    const parts: Part[] = []
    for (const call of calls) {
      const name = call.name ?? ''
      const r = await p.execute(name, (call.args ?? {}) as Record<string, unknown>)
      parts.push({
        functionResponse: {
          id: call.id,
          name,
          response: r.isError ? { error: r.output } : { result: r.output },
        },
      })
    }
    contents.push({ role: 'user', parts })
  }

  return reply
}

/** Transcreve um áudio de WhatsApp em português. Devolve texto limpo ou vazio. */
export async function transcribeAudio(params: {
  apiKey: string
  model: string
  base64: string
  mimeType: string
}): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: params.apiKey })
  const response = await ai.models.generateContent({
    model: params.model,
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: params.mimeType, data: params.base64 } },
        { text: 'Transcreva este áudio em português do Brasil, palavra por palavra, sem comentários, sem título e sem aspas. Se não houver fala, responda apenas: [sem fala]' },
      ],
    }],
    config: { temperature: 0 },
  })
  const text = (response.text ?? '').trim()
  return /^\[sem fala\]$/i.test(text) ? '' : text
}
