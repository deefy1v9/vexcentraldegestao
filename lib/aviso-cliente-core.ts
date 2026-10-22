/**
 * Aviso no grupo de WhatsApp do cliente quando uma etapa marcada termina.
 *
 * Regras puras e os dois executores (enfileirar e processar a fila) com
 * dependências injetadas: aqui não há banco nem WhatsApp, por isso os testes
 * exercitam o comportamento de verdade. A ligação com Prisma e UAZAPI fica em
 * lib/aviso-cliente.ts.
 *
 * Regras:
 * - avisa quando a demanda AVANÇA de uma etapa marcada com "avisar o cliente";
 *   o que o cliente lê é a frase da etapa, com as variáveis preenchidas:
 *   {entrega} nome da entrega, {data} data agendada, {proxima} próxima etapa,
 *   {prazo} prazo dela e {prazo_final} data final da demanda. Trecho entre
 *   [colchetes] só aparece se todas as variáveis dele tiverem valor;
 * - desligado no geral ou no cliente, ou sem grupo válido, nada entra na fila;
 * - o título interno NUNCA vai ao cliente: a mensagem só conhece a frase;
 * - ao cliente, só de segunda a sexta, das 8h às 20h (Brasília); fora disso o
 *   aviso espera o próximo horário válido. O responsável é avisado na hora;
 * - o que avançar para o mesmo cliente em até 10 minutos sai numa mensagem
 *   só, em lista do que avançou;
 * - uma linha de fila por demanda e etapa (único no banco): devolver e
 *   concluir a mesma etapa de novo não repete o aviso;
 * - os executores nunca lançam: falha vira registro, e a demanda segue.
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
const ENTREGA_PADRAO = 'mais uma entrega'

/** Texto do cliente limpo: uma linha, sem ponto final, até 300 caracteres. */
export function limparTextoCliente(t: string | null | undefined): string | null {
  const s = (t ?? '').replace(/\s+/g, ' ').trim().replace(/[\s.!…;,]+$/, '').slice(0, 300).trim()
  return s || null
}

/** "12/10" no horário de Brasília. */
export function dataCurta(d: Date): string {
  const t = emSP(d)
  return `${String(t.getUTCDate()).padStart(2, '0')}/${String(t.getUTCMonth() + 1).padStart(2, '0')}`
}

/** "12/10 às 9h" ou "12/10 às 9h30" no horário de Brasília. */
export function dataHora(d: Date): string {
  const t = emSP(d)
  const min = t.getUTCMinutes()
  return `${dataCurta(d)} às ${t.getUTCHours()}h${min ? String(min).padStart(2, '0') : ''}`
}

/** O que preenche as variáveis da frase da etapa. */
export interface DadosFrase {
  entrega?: string | null
  /** Data agendada (publicação) */
  data?: Date | null
  /** Próxima etapa da demanda */
  proxima?: string | null
  /** Prazo da próxima etapa */
  prazo?: Date | null
  /** Data final da demanda */
  prazoFinal?: Date | null
}

const VARIAVEL = /\{(entrega|data|proxima|prazo_final|prazo)(?:\|([^}]*))?\}/g

/**
 * Linha que o cliente lê para uma etapa: a frase com as variáveis preenchidas.
 * {entrega} usa o nome da entrega ou o reserva depois da barra ("mais uma
 * publicação"). Um trecho entre [colchetes] some se alguma variável dele
 * ficar sem valor — assim "Agendamos o post[ para {data}]" sem data não sai
 * quebrado. Sem frase, não há aviso.
 */
export function linhaDaEtapa(frase: string | null | undefined, dados: DadosFrase = {}): string | null {
  const valor = (nome: string, reserva?: string): string => {
    const r = reserva?.trim() ?? ''
    if (nome === 'entrega') return limparTextoCliente(dados.entrega) ?? (r || ENTREGA_PADRAO)
    if (nome === 'data') return dados.data ? dataHora(dados.data) : r
    if (nome === 'proxima') return limparTextoCliente(dados.proxima) ?? r
    if (nome === 'prazo') return dados.prazo ? dataCurta(dados.prazo) : r
    if (nome === 'prazo_final') return dados.prazoFinal ? dataCurta(dados.prazoFinal) : r
    return ''
  }
  const comTrechos = (frase ?? '').replace(/\[([^\]]*)\]/g, (_m: string, trecho: string) => {
    let faltou = false
    const montado = trecho.replace(VARIAVEL, (_v: string, nome: string, reserva?: string) => {
      const x = valor(nome, reserva)
      if (!x) faltou = true
      return x
    })
    return faltou ? '' : montado
  })
  const montada = comTrechos.replace(VARIAVEL, (_v: string, nome: string, reserva?: string) => valor(nome, reserva))
  const limpa = limparTextoCliente(montada)
  return limpa ? limpa.charAt(0).toUpperCase() + limpa.slice(1) : null
}

/** Prazo de uma etapa para quem acabou de entrar nela (mesma regra do processo). */
export function prazoDaEtapa(
  etapa: { dueMode: string; dueDays: number; kind: string },
  task: { dueDate: Date | null; stageEnteredAt: Date | null },
): Date | null {
  if (etapa.kind === 'FINAL') return null
  const dia = 24 * 60 * MINUTO
  if (etapa.dueMode === 'ANTES_DA_ENTREGA') return task.dueDate ? new Date(task.dueDate.getTime() - etapa.dueDays * dia) : null
  return task.stageEnteredAt ? new Date(task.stageEnteredAt.getTime() + etapa.dueDays * dia) : null
}

/**
 * Mensagem ao cliente para um ou mais avisos do mesmo lote. Recebe só as
 * linhas já montadas a partir das frases das etapas — o título interno da
 * demanda não chega aqui, de propósito. Linhas iguais viram uma com a contagem.
 */
export function mensagemCliente(linhas: Array<string | null | undefined>): string {
  const limpas = linhas.map(limparTextoCliente).filter((l): l is string => !!l)
  if (limpas.length === 0) return MENSAGEM_GENERICA
  const contagem = new Map<string, number>()
  for (const l of limpas) contagem.set(l, (contagem.get(l) ?? 0) + 1)
  const itens = [...contagem].map(([l, n]) => (n > 1 ? `${l} (${n}x)` : l))
  if (limpas.length === 1) return `✅ ${itens[0]}. ${FECHO}`
  return `✅ Atualização do seu projeto:\n${itens.map((l) => `• ${l}`).join('\n')}\n\n${FECHO}`
}

/** Para o responsável (interno), com o título, o número e o que o cliente vai ler. */
export function mensagemResponsavelNaFila(titulo: string, numero: number, etapa: string, quando: string, linha: string): string {
  return `✅ ${titulo} (#${numero}): etapa "${etapa}" concluída. O cliente será avisado no grupo ${quando}: "${linha}".`
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
  | 'sem-etapa'
  | 'nao-avancou'
  | 'etapa-sem-aviso'
  | 'desligado-geral'
  | 'sem-cliente'
  | 'cliente-desligado'
  | 'sem-grupo'
  | 'grupo-invalido'
  | 'ja-enviado'

export interface EtapaParaAviso {
  id: string; name: string; position: number; notifyClient: boolean; clientPhrase: string | null
  kind?: string; dueMode?: string; dueDays?: number
}

export interface EntradaDecisao {
  /** Etapa em que a demanda estava (a que terminou). */
  de: EtapaParaAviso | null
  /** Etapa em que ficou. */
  para: { position: number } | null
  geralLigado: boolean
  cliente: { avisoConclusaoAtivo: boolean; whatsappGroupId: string | null } | null
}

export type Decisao = { entra: true } | { entra: false; motivo: MotivoSemAviso }

/** Decide se o fim desta etapa entra na fila. A primeira trava que bater responde. */
export function decidirAviso(e: EntradaDecisao): Decisao {
  if (!e.de) return { entra: false, motivo: 'sem-etapa' }
  if (!e.para || e.para.position <= e.de.position) return { entra: false, motivo: 'nao-avancou' }
  if (!e.de.notifyClient || !(e.de.clientPhrase ?? '').trim()) return { entra: false, motivo: 'etapa-sem-aviso' }
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
  stageId: string | null
  clientText: string | null
  /** Data agendada da publicação */
  scheduledFor?: Date | null
  /** Data final da demanda */
  dueDate?: Date | null
  /** Quando entrou na etapa atual (para o prazo da próxima) */
  stageEnteredAt?: Date | null
  stages: EtapaParaAviso[]
  client: { id: string; name: string; avisoConclusaoAtivo: boolean; whatsappGroupId: string | null } | null
}

export interface DepsEnfileirar {
  agora(): Date
  carregar(taskId: string): Promise<DemandaParaAviso | null>
  geralLigado(): Promise<boolean>
  pendentesDoCliente(clientId: string): Promise<Date[]>
  /** Cria a linha da fila; 'ja-existe' quando esta etapa da demanda já teve aviso (único no banco). */
  criarAviso(a: { taskId: string; stageId: string; clientId: string; line: string; concludedAt: Date; sendAfter: Date }): Promise<'criado' | 'ja-existe'>
  registrarEvento(taskId: string, texto: string): Promise<void>
  avisarResponsavel(userId: string, texto: string): Promise<void>
}

export type ResultadoEnfileirar =
  | { situacao: 'na-fila'; sendAfter: Date; linha: string }
  | { situacao: 'ignorado'; motivo: MotivoSemAviso }
  | { situacao: 'falhou'; erro: string }

const msgErro = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300)

/**
 * Chamado depois que a demanda mudou de etapa: se saiu de uma etapa marcada
 * para uma etapa adiante, põe o aviso na fila e avisa o responsável na hora.
 * Nunca lança.
 */
export async function enfileirarAviso(
  entrada: { taskId: string; deStageId: string | null | undefined },
  deps: DepsEnfileirar,
): Promise<ResultadoEnfileirar> {
  try {
    if (!entrada.deStageId) return { situacao: 'ignorado', motivo: 'sem-etapa' }
    const task = await deps.carregar(entrada.taskId)
    if (!task) return { situacao: 'ignorado', motivo: 'sem-etapa' }
    const de = task.stages.find((x) => x.id === entrada.deStageId) ?? null
    const para = task.stages.find((x) => x.id === task.stageId) ?? null
    const decisao = decidirAviso({
      de, para, geralLigado: await deps.geralLigado(),
      cliente: task.client ? { avisoConclusaoAtivo: task.client.avisoConclusaoAtivo, whatsappGroupId: task.client.whatsappGroupId } : null,
    })
    if (!decisao.entra) return { situacao: 'ignorado', motivo: decisao.motivo }

    const linha = linhaDaEtapa(de!.clientPhrase, {
      entrega: task.clientText,
      data: task.scheduledFor ?? null,
      proxima: para!.kind === 'FINAL' ? null : para!.name,
      prazo: para!.kind === 'FINAL' ? null : prazoDaEtapa({ dueMode: para!.dueMode ?? 'DIAS_APOS_ENTRADA', dueDays: para!.dueDays ?? 0, kind: para!.kind ?? 'EXECUCAO' }, { dueDate: task.dueDate ?? null, stageEnteredAt: task.stageEnteredAt ?? null }),
      prazoFinal: task.dueDate ?? null,
    })
    if (!linha) return { situacao: 'ignorado', motivo: 'etapa-sem-aviso' }
    const agora = deps.agora()
    const sendAfter = planejarEnvio(agora, await deps.pendentesDoCliente(task.client!.id))
    const criado = await deps.criarAviso({ taskId: task.id, stageId: de!.id, clientId: task.client!.id, line: linha, concludedAt: agora, sendAfter })
    if (criado === 'ja-existe') return { situacao: 'ignorado', motivo: 'ja-enviado' }

    const quando = quandoSai(sendAfter, agora)
    await deps.registrarEvento(task.id, `Aviso ao cliente na fila (etapa "${de!.name}"): sai no grupo ${quando}.`).catch(() => {})
    if (task.assigneeId) await deps.avisarResponsavel(task.assigneeId, mensagemResponsavelNaFila(task.title, task.number, de!.name, quando, linha)).catch(() => {})
    return { situacao: 'na-fila', sendAfter, linha }
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
  line: string
  task: { number: number; title: string; assigneeId: string | null }
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

        const texto = mensagemCliente(itens.map((v) => v.line))
        let envio: { ok: boolean; erro?: string }
        try { envio = await deps.enviarGrupo(c.whatsappGroupId!.trim(), texto) } catch (e) { envio = { ok: false, erro: msgErro(e) } }
        const ids = itens.map((v) => v.id)
        const taskIds = itens.map((v) => v.taskId)

        if (envio.ok) {
          const batchId = `${clientId}:${agora.getTime()}`
          await deps.marcarEnviados(ids, batchId)
          rel.enviados += itens.length
          rel.mensagens += 1
          await deps.registrarEnvio({ clientId, ok: true, taskIds, detalhe: `Aviso no grupo de ${c.name}: ${itens.length} item(ns)` }).catch(() => {})
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
