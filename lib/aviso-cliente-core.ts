/**
 * Aviso no grupo de WhatsApp do cliente quando a demanda fica pronta.
 *
 * Regras puras e os dois executores (enfileirar e processar a fila) com
 * dependências injetadas: aqui não há banco nem WhatsApp, por isso os testes
 * exercitam o comportamento de verdade. A ligação com Prisma e UAZAPI fica em
 * lib/aviso-cliente.ts.
 *
 * Regras:
 * - só a passagem para CONCLUIDO avisa (aprovado internamente não é pronto);
 * - desligado no geral ou no cliente, ou sem grupo válido, nada entra na fila;
 * - o título interno NUNCA vai ao cliente: usa o "Texto para o cliente" da
 *   demanda ou a frase genérica;
 * - ao cliente, só de segunda a sexta, das 8h às 20h (Brasília); fora disso o
 *   aviso espera o próximo horário válido. O responsável é avisado na hora;
 * - o que for concluído para o mesmo cliente em até 10 minutos sai numa
 *   mensagem só, em lista;
 * - uma linha de fila por demanda (único no banco): nunca avisa duas vezes;
 * - os executores nunca lançam: falha vira registro, e a demanda segue
 *   concluída.
 */

/* ------------------------------ horário ------------------------------ */

/** Brasília sem horário de verão desde 2019: UTC−3 fixo. */
const OFFSET_SP_MS = -3 * 60 * 60 * 1000
const MINUTO = 60 * 1000
export const ABRE_MIN = 8 * 60 // 08:00
export const FECHA_MIN = 20 * 60 // 20:00 (exclusivo)
export const AGRUPAR_MS = 10 * MINUTO
export const RETENTAR_MS = 5 * MINUTO
export const MAX_TENTATIVAS = 3

/** Relógio de Brasília lido nos campos UTC de um Date deslocado. */
const emSP = (d: Date) => new Date(d.getTime() + OFFSET_SP_MS)
const deSP = (relogioSP: Date) => new Date(relogioSP.getTime() - OFFSET_SP_MS)

/** Está dentro da janela de envio ao cliente (seg a sex, 8h ≤ hora < 20h)? */
export function dentroDaJanela(d: Date): boolean {
  const t = emSP(d)
  const dia = t.getUTCDay()
  const min = t.getUTCHours() * 60 + t.getUTCMinutes()
  return dia >= 1 && dia <= 5 && min >= ABRE_MIN && min < FECHA_MIN
}

/** O próprio instante, se estiver na janela; senão, a próxima abertura (8h de um dia útil). */
export function proximoHorarioValido(d: Date): Date {
  if (dentroDaJanela(d)) return d
  const t = emSP(d)
  const min = t.getUTCHours() * 60 + t.getUTCMinutes()
  // Dia útil antes das 8h: abre hoje. Senão, a partir de amanhã.
  let dia = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()))
  const util = (x: Date) => x.getUTCDay() >= 1 && x.getUTCDay() <= 5
  if (!(util(dia) && min < ABRE_MIN)) {
    do dia = new Date(dia.getTime() + 24 * 60 * MINUTO)
    while (!util(dia))
  }
  return deSP(new Date(dia.getTime() + ABRE_MIN * MINUTO))
}

/**
 * Quando o aviso sai. Abre um lote de 10 minutos a partir da conclusão; quem
 * for concluído dentro desse lote (pendentes do mesmo cliente nos últimos 10
 * minutos) sai junto. Fora do horário, vai para a próxima abertura.
 */
export function planejarEnvio(agora: Date, pendentesDoCliente: Date[]): Date {
  const recentes = pendentesDoCliente.filter((c) => c.getTime() <= agora.getTime() && agora.getTime() - c.getTime() <= AGRUPAR_MS)
  const ancora = recentes.length ? Math.min(...recentes.map((c) => c.getTime())) : agora.getTime()
  return proximoHorarioValido(new Date(ancora + AGRUPAR_MS))
}

const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

/** "hoje às 14:10", "amanhã às 08:00", "segunda às 08:00" — para o responsável. */
export function quandoSai(envio: Date, agora: Date): string {
  const a = emSP(agora), e = emSP(envio)
  const hora = `${String(e.getUTCHours()).padStart(2, '0')}:${String(e.getUTCMinutes()).padStart(2, '0')}`
  const diaA = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate())
  const diaE = Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate())
  const dif = Math.round((diaE - diaA) / (24 * 60 * MINUTO))
  if (dif <= 0) return `hoje às ${hora}`
  if (dif === 1) return `amanhã às ${hora}`
  return `${SEMANA[e.getUTCDay()]} às ${hora}`
}

/* ------------------------------ textos ------------------------------ */

export const MENSAGEM_GENERICA = '✅ Concluímos mais uma entrega para vocês. Qualquer dúvida, é só chamar.'
const FECHO = 'Qualquer dúvida, é só chamar.'

/** Texto do cliente limpo: uma linha, sem ponto final, até 300 caracteres. */
export function limparTextoCliente(t: string | null | undefined): string | null {
  const s = (t ?? '').replace(/\s+/g, ' ').trim().replace(/[\s.!…;,]+$/, '').slice(0, 300).trim()
  return s || null
}

/**
 * Mensagem ao cliente para um ou mais avisos do mesmo lote. Recebe só os
 * "Textos para o cliente" — o título interno não chega aqui, de propósito.
 */
export function mensagemCliente(textos: Array<string | null | undefined>): string {
  const limpos = textos.map(limparTextoCliente)
  const comTexto = limpos.filter((t): t is string => !!t)
  const total = limpos.length
  if (total <= 1) return comTexto.length ? `✅ Entrega concluída: ${comTexto[0]}.\n\n${FECHO}` : MENSAGEM_GENERICA
  if (comTexto.length === 0) return `✅ Concluímos ${total} entregas para vocês. ${FECHO}`
  const resto = total - comTexto.length
  const linhas = comTexto.map((t) => `• ${t}`)
  if (resto > 0) linhas.push(`• mais ${resto} ${resto === 1 ? 'entrega' : 'entregas'}`)
  return `✅ Concluímos ${total} entregas para vocês:\n${linhas.join('\n')}\n\n${FECHO}`
}

/** Para o responsável (interno), com o título e o número da demanda. */
export function mensagemResponsavelNaFila(titulo: string, numero: number, quando: string): string {
  return `✅ ${titulo} (#${numero}) concluída. O cliente será avisado no grupo ${quando}.`
}
export function mensagemResponsavelFalha(titulo: string, numero: number, erro: string): string {
  return `⚠️ O aviso de ${titulo} (#${numero}) no grupo do cliente não saiu (${erro}). Avise por lá manualmente.`
}

/* ------------------------------ grupo e resposta ------------------------------ */

/** Id de grupo da UAZAPI/WhatsApp: dígitos (ou o formato antigo dono-criação) + @g.us. */
export function ehGrupoWhatsapp(id: string | null | undefined): boolean {
  return /^\d+(-\d+)?@g\.us$/.test((id ?? '').trim())
}

/**
 * Lê a resposta do envio no WhatsApp. Só 2xx sem erro no corpo conta como
 * enviado — a UAZAPI responde 401 "Invalid token." quando o acesso cai, e isso
 * não pode passar como aviso entregue.
 */
export function resultadoEnvio(status: number, body: unknown): { ok: boolean; erro?: string } {
  const b = (body && typeof body === 'object' ? body : {}) as { error?: unknown; message?: unknown }
  const motivo = [b.message, b.error].find((x) => typeof x === 'string' && x.trim()) as string | undefined
  if (status >= 200 && status < 300 && !b.error) return { ok: true }
  return { ok: false, erro: `HTTP ${status}${motivo ? `: ${motivo}` : ''}` }
}

/* ------------------------------ entrada na fila ------------------------------ */

export type MotivoSemAviso =
  | 'nao-concluiu'
  | 'desligado-geral'
  | 'sem-cliente'
  | 'cliente-desligado'
  | 'sem-grupo'
  | 'grupo-invalido'
  | 'ja-enviado'

export interface EntradaDecisao {
  antes: string | null | undefined
  depois: string
  geralLigado: boolean
  cliente: { avisoConclusaoAtivo: boolean; whatsappGroupId: string | null } | null
}

export type Decisao = { entra: true } | { entra: false; motivo: MotivoSemAviso }

/** Decide se a conclusão entra na fila. A primeira trava que bater responde. */
export function decidirAviso(e: EntradaDecisao): Decisao {
  if (e.depois !== 'CONCLUIDO' || e.antes === 'CONCLUIDO') return { entra: false, motivo: 'nao-concluiu' }
  if (!e.geralLigado) return { entra: false, motivo: 'desligado-geral' }
  if (!e.cliente) return { entra: false, motivo: 'sem-cliente' }
  if (!e.cliente.avisoConclusaoAtivo) return { entra: false, motivo: 'cliente-desligado' }
  if (!e.cliente.whatsappGroupId) return { entra: false, motivo: 'sem-grupo' }
  if (!ehGrupoWhatsapp(e.cliente.whatsappGroupId)) return { entra: false, motivo: 'grupo-invalido' }
  return { entra: true }
}

export interface DemandaParaAviso {
  id: string
  number: number
  title: string
  assigneeId: string | null
  client: { id: string; name: string; avisoConclusaoAtivo: boolean; whatsappGroupId: string | null } | null
}

export interface DepsEnfileirar {
  agora(): Date
  carregar(taskId: string): Promise<DemandaParaAviso | null>
  geralLigado(): Promise<boolean>
  pendentesDoCliente(clientId: string): Promise<Date[]>
  /** Cria a linha da fila; 'ja-existe' quando a demanda já teve aviso (único no banco). */
  criarAviso(a: { taskId: string; clientId: string; concludedAt: Date; sendAfter: Date }): Promise<'criado' | 'ja-existe'>
  registrarEvento(taskId: string, texto: string): Promise<void>
  avisarResponsavel(userId: string, texto: string): Promise<void>
}

export type ResultadoEnfileirar =
  | { situacao: 'na-fila'; sendAfter: Date }
  | { situacao: 'ignorado'; motivo: MotivoSemAviso }
  | { situacao: 'falhou'; erro: string }

const msgErro = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300)

/** Põe a conclusão na fila e avisa o responsável na hora. Nunca lança. */
export async function enfileirarAviso(
  entrada: { taskId: string; antes: string | null | undefined; depois: string },
  deps: DepsEnfileirar,
): Promise<ResultadoEnfileirar> {
  try {
    if (entrada.depois !== 'CONCLUIDO' || entrada.antes === 'CONCLUIDO') return { situacao: 'ignorado', motivo: 'nao-concluiu' }
    const task = await deps.carregar(entrada.taskId)
    if (!task) return { situacao: 'ignorado', motivo: 'sem-cliente' }
    const decisao = decidirAviso({
      antes: entrada.antes, depois: entrada.depois, geralLigado: await deps.geralLigado(),
      cliente: task.client ? { avisoConclusaoAtivo: task.client.avisoConclusaoAtivo, whatsappGroupId: task.client.whatsappGroupId } : null,
    })
    if (!decisao.entra) return { situacao: 'ignorado', motivo: decisao.motivo }

    const agora = deps.agora()
    const sendAfter = planejarEnvio(agora, await deps.pendentesDoCliente(task.client!.id))
    const criado = await deps.criarAviso({ taskId: task.id, clientId: task.client!.id, concludedAt: agora, sendAfter })
    if (criado === 'ja-existe') return { situacao: 'ignorado', motivo: 'ja-enviado' }

    const quando = quandoSai(sendAfter, agora)
    await deps.registrarEvento(task.id, `Aviso ao cliente na fila: sai no grupo ${quando}.`).catch(() => {})
    if (task.assigneeId) await deps.avisarResponsavel(task.assigneeId, mensagemResponsavelNaFila(task.title, task.number, quando)).catch(() => {})
    return { situacao: 'na-fila', sendAfter }
  } catch (e) {
    return { situacao: 'falhou', erro: msgErro(e) }
  }
}

/* ------------------------------ processar a fila ------------------------------ */

export interface AvisoVencido {
  id: string
  taskId: string
  clientId: string
  attempts: number
  task: { number: number; title: string; clientText: string | null; assigneeId: string | null }
  client: { name: string; avisoConclusaoAtivo: boolean; whatsappGroupId: string | null }
}

export interface DepsProcessar {
  agora(): Date
  vencidos(agora: Date): Promise<AvisoVencido[]>
  geralLigado(): Promise<boolean>
  whatsappConfigurado(): Promise<boolean>
  /** Marca como ENVIANDO só os que ainda estão PENDENTE; devolve os que conseguiu. */
  reservar(ids: string[]): Promise<string[]>
  enviarGrupo(grupoId: string, texto: string): Promise<{ ok: boolean; erro?: string }>
  marcarEnviados(ids: string[], batchId: string): Promise<void>
  reagendar(ids: string[], sendAfter: Date, attempts: number, erro: string): Promise<void>
  marcarFalha(ids: string[], attempts: number, erro: string): Promise<void>
  cancelar(ids: string[], motivo: string): Promise<void>
  registrarEnvio(r: { clientId: string; ok: boolean; detalhe: string; taskIds: string[] }): Promise<void>
  registrarEvento(taskId: string, texto: string): Promise<void>
  avisarResponsavel(userId: string, texto: string): Promise<void>
}

export interface RelatorioFila { enviados: number; mensagens: number; falhas: number; cancelados: number; adiados: number }

/**
 * Esvazia a fila: junta por cliente o que já pode sair e manda uma mensagem
 * só. Fora da janela não envia nada. Nunca lança.
 */
export async function processarFila(deps: DepsProcessar): Promise<RelatorioFila> {
  const rel: RelatorioFila = { enviados: 0, mensagens: 0, falhas: 0, cancelados: 0, adiados: 0 }
  try {
    const agora = deps.agora()
    if (!dentroDaJanela(agora)) return rel
    const vencidos = await deps.vencidos(agora)
    if (vencidos.length === 0) return rel

    if (!(await deps.geralLigado())) {
      await deps.cancelar(vencidos.map((v) => v.id), 'aviso desligado no geral').catch(() => {})
      rel.cancelados += vencidos.length
      return rel
    }
    // WhatsApp fora do ar: não perde nada, tenta de novo no próximo minuto
    if (!(await deps.whatsappConfigurado())) { rel.adiados += vencidos.length; return rel }

    const porCliente = new Map<string, AvisoVencido[]>()
    for (const v of vencidos) porCliente.set(v.clientId, [...(porCliente.get(v.clientId) ?? []), v])

    for (const [clientId, lote] of porCliente) {
      try {
        const c = lote[0].client
        if (!c.avisoConclusaoAtivo || !ehGrupoWhatsapp(c.whatsappGroupId)) {
          await deps.cancelar(lote.map((v) => v.id), 'aviso desligado ou sem grupo no cliente')
          rel.cancelados += lote.length
          continue
        }
        const reservados = new Set(await deps.reservar(lote.map((v) => v.id)))
        const itens = lote.filter((v) => reservados.has(v.id))
        if (itens.length === 0) continue

        const texto = mensagemCliente(itens.map((v) => v.task.clientText))
        let envio: { ok: boolean; erro?: string }
        try { envio = await deps.enviarGrupo(c.whatsappGroupId!.trim(), texto) } catch (e) { envio = { ok: false, erro: msgErro(e) } }
        const ids = itens.map((v) => v.id)
        const taskIds = itens.map((v) => v.taskId)

        if (envio.ok) {
          const batchId = `${clientId}:${agora.getTime()}`
          await deps.marcarEnviados(ids, batchId)
          rel.enviados += itens.length
          rel.mensagens += 1
          await deps.registrarEnvio({ clientId, ok: true, taskIds, detalhe: `Aviso no grupo de ${c.name}: ${itens.length} entrega(s)` }).catch(() => {})
          for (const v of itens) await deps.registrarEvento(v.taskId, 'Cliente avisado no grupo do WhatsApp.').catch(() => {})
          continue
        }

        const erro = envio.erro ?? 'erro desconhecido'
        const tentativas = Math.max(...itens.map((v) => v.attempts)) + 1
        await deps.registrarEnvio({ clientId, ok: false, taskIds, detalhe: `Falhou no grupo de ${c.name} (tentativa ${tentativas}): ${erro}` }).catch(() => {})
        if (tentativas < MAX_TENTATIVAS) {
          await deps.reagendar(ids, proximoHorarioValido(new Date(agora.getTime() + RETENTAR_MS)), tentativas, erro)
          rel.adiados += itens.length
        } else {
          await deps.marcarFalha(ids, tentativas, erro)
          rel.falhas += itens.length
          for (const v of itens) {
            await deps.registrarEvento(v.taskId, `Aviso no grupo do cliente não saiu: ${erro}`).catch(() => {})
            if (v.task.assigneeId) await deps.avisarResponsavel(v.task.assigneeId, mensagemResponsavelFalha(v.task.title, v.task.number, erro)).catch(() => {})
          }
        }
      } catch {
        // Um cliente com problema não trava os outros
        rel.falhas += lote.length
      }
    }
  } catch {
    // Fila inacessível: a próxima rodada tenta de novo
  }
  return rel
}
