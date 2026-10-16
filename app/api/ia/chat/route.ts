import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { runCommandAgent, type HistoryMessage } from '@/lib/ai/agent'

/** Quantas mensagens da conversa da tela entram como histórico. */
const HISTORY_LIMIT = 20

/**
 * Chat da Central com o assistente (admin). Mesmo agente do WhatsApp, com as
 * mesmas ferramentas e a mesma regra: criar demanda e enviar mensagem só com
 * confirmação. O histórico vem da própria tela.
 * POST { messages: [{ role: 'user' | 'assistant', content }] }
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const body = await req.json().catch(() => ({}))
  const raw: unknown[] = Array.isArray(body.messages) ? body.messages : []
  const messages: HistoryMessage[] = raw
    .map((m) => m as { role?: string; content?: unknown })
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: String(m.content).slice(0, 4000) }))

  const last = messages[messages.length - 1]
  if (!last || last.role !== 'user') return NextResponse.json({ error: 'Escreva uma mensagem.' }, { status: 400 })

  try {
    const reply = await runCommandAgent({
      channel: 'web',
      commandChat: `web:${admin.id}`,
      ownerId: admin.id,
      incomingText: last.content,
      history: messages.slice(0, -1).slice(-HISTORY_LIMIT),
      since: new Date(),
    })
    return NextResponse.json({ reply })
  } catch (err) {
    console.error('[ia/chat]', err)
    const msg = err instanceof Error && /API_KEY/.test(err.message) ? 'A IA não está configurada (chave da API).' : 'A IA não respondeu agora. Tente de novo.'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
