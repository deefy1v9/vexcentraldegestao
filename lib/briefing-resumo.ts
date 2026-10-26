import Anthropic from '@anthropic-ai/sdk'
import { getAiConfig } from './ai/config'
import { respostasEmTexto, type Pergunta } from './briefing-core'

/**
 * Resumo do briefing para a equipe, feito pela IA (modelo dos rascunhos, o
 * mais barato). Os campos sensíveis vão mascarados: senha e CPF nunca saem
 * da Central.
 */
const SISTEMA = `Você resume briefings de clientes para a equipe de uma agência de marketing brasileira, a VEX Growth.

Leia as respostas do cliente e escreva, em português do Brasil, um resumo prático para quem vai executar o trabalho:
- Comece com 1 frase sobre a empresa e o que ela quer.
- Depois tópicos curtos com o essencial: público, objetivo, o que precisa ser feito, referências e preferências, prazos ou datas.
- Termine com "Faltou ou ficou vago:" listando o que o cliente não respondeu ou respondeu de forma vaga e vale perguntar. Se nada faltou, escreva "Faltou ou ficou vago: nada".

Use só o que está nas respostas; não invente. Sem markdown pesado: tópicos com "- " bastam. No máximo 220 palavras.`

export async function resumirBriefing(params: { nome: string; perguntas: Pergunta[]; respostas: Record<string, unknown>; alertas: string[] }): Promise<string> {
  const cfg = await getAiConfig()
  if (!cfg.apiKey) throw new Error('A chave da Anthropic não está configurada (Agentes › Configurações).')
  const texto = respostasEmTexto(params.perguntas, params.respostas)
  const client = new Anthropic({ apiKey: cfg.apiKey })
  const r = await client.messages.create({
    model: cfg.draftModel,
    max_tokens: 1200,
    system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: `Briefing: ${params.nome}\n${params.alertas.length ? `Avisos: ${params.alertas.join(' | ')}\n` : ''}\n--- respostas ---\n${texto}\n--- fim ---`,
    }],
  })
  const saida = r.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('\n').trim()
  if (!saida) throw new Error('A IA não devolveu resumo.')
  return saida
}
