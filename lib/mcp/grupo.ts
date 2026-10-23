/**
 * Mensagens do grupo de WhatsApp do cliente, como o agente lê: em ordem, do
 * mais antigo para o mais novo, com quem falou e o texto. Regras puras (a
 * UAZAPI entrega o bruto em lib/uazapi.ts). Testado em
 * scripts/tests/mcp-agente.test.ts.
 */

export interface MensagemDoGrupo {
  id: string
  quando: Date
  autor: string
  deMim: boolean
  tipo: string
  texto: string
}

const TIPOS: Array<[RegExp, string]> = [
  [/image/i, 'imagem'], [/audio|ptt/i, 'áudio'], [/video/i, 'vídeo'], [/document/i, 'documento'], [/sticker/i, 'figurinha'],
]

/** Do formato da UAZAPI (`/message/find`) para o nosso; descarta o que não dá para ler. */
export function normalizarMensagens(raw: unknown): MensagemDoGrupo[] {
  if (!Array.isArray(raw)) return []
  const saida: MensagemDoGrupo[] = []
  for (const r of raw as Array<Record<string, unknown>>) {
    const ts = Number(r.messageTimestamp)
    if (!Number.isFinite(ts) || ts <= 0) continue
    const quando = new Date(ts < 1e12 ? ts * 1000 : ts)
    const texto = typeof r.text === 'string' ? r.text.trim() : ''
    const tipoBruto = typeof r.messageType === 'string' ? r.messageType : ''
    const tipo = TIPOS.find(([re]) => re.test(tipoBruto))?.[1] ?? 'texto'
    if (!texto && tipo === 'texto') continue
    saida.push({
      id: String(r.messageid ?? r.id ?? ''),
      quando,
      autor: r.fromMe ? 'VEX' : (typeof r.senderName === 'string' && r.senderName.trim()) || 'cliente',
      deMim: !!r.fromMe,
      tipo,
      texto,
    })
  }
  return saida.sort((a, b) => a.quando.getTime() - b.quando.getTime())
}

const quando = (d: Date) => d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/** A conversa em texto, uma linha por mensagem, a partir de `desde`, no máximo `max` mensagens (as mais novas). */
export function conversaEmTexto(msgs: MensagemDoGrupo[], opcoes: { desde?: Date | null; max?: number } = {}): string {
  const max = Math.max(1, Math.min(200, opcoes.max ?? 100))
  const filtradas = msgs.filter((m) => !opcoes.desde || m.quando >= opcoes.desde).slice(-max)
  if (filtradas.length === 0) return 'Nenhuma mensagem no grupo nesse período.'
  return filtradas.map((m) => {
    const anexo = m.tipo === 'texto' ? '' : `[${m.tipo}] `
    const texto = m.texto.length > 800 ? `${m.texto.slice(0, 800)}…` : m.texto
    return `${quando(m.quando)} · ${m.autor}: ${anexo}${texto}`.trimEnd()
  }).join('\n')
}

export interface NovidadesDoGrupo {
  /** Mensagens depois da última leitura (do cliente e da VEX, para o contexto). */
  novas: MensagemDoGrupo[]
  /** Quantas dessas são do cliente. */
  doCliente: number
  /** Até onde marcar como lido depois de tratar (a mais nova); null = nada novo. */
  ate: Date | null
  /** Horas desde a última mensagem do cliente sem resposta da VEX depois dela; null = respondido. */
  esperandoHoras: number | null
}

/**
 * O que chegou no grupo desde a última leitura do agente. Na primeira vez
 * (sem leitura anterior), olha só as últimas `primeiraLeituraHoras`.
 */
export function novidadesDoGrupo(msgs: MensagemDoGrupo[], lidoAte: Date | null, agora: Date, primeiraLeituraHoras = 24): NovidadesDoGrupo {
  const base = lidoAte ?? new Date(agora.getTime() - primeiraLeituraHoras * 3600_000)
  const novas = msgs.filter((m) => m.quando > base)
  const ultima = msgs[msgs.length - 1]
  return {
    novas,
    doCliente: novas.filter((m) => !m.deMim).length,
    ate: novas.length ? novas[novas.length - 1].quando : null,
    esperandoHoras: ultima && !ultima.deMim ? Math.floor((agora.getTime() - ultima.quando.getTime()) / 3600_000) : null,
  }
}
