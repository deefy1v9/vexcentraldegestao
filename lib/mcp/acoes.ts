import { z } from 'zod'
import { prisma } from '../prisma'
import { uazFindMessages } from '../uazapi'
import { logTaskEvent, notifyWhatsApp, taskShortId } from '../task-flow'
import { moveTaskStage, StageError } from '../processos-server'
import { nextStage, ordered, prazoAtual } from '../processos'
import { conversaEmTexto, normalizarMensagens, novidadesDoGrupo } from './grupo'
import { avisoDeEntrega, motivoParaNaoEntregar, naFilaDoAgente, TAG_AGENTE } from './regras-agente'
import { diaSP, FerramentaErro, inicioDoDiaSP, type Ferramenta } from './ferramentas'

/**
 * Ferramentas do agente (escopo central.acoes): ler o grupo do cliente, ver a
 * fila, ler, criar, comentar e entregar demandas. As travas de
 * ./regras-agente.ts valem aqui, a cada chamada. Nada aqui manda mensagem ao
 * cliente: o aviso no grupo é da Central, depois que uma pessoa aprova.
 */

const dataBr = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
const texto = (d: string) => z.string().optional().describe(d)
const numeroDaDemanda = z.number().int().positive().describe('Número da demanda (o #, sem o símbolo).')

async function demandaPorNumero(numero: unknown) {
  const n = Number(numero)
  if (!Number.isInteger(n) || n <= 0) throw new FerramentaErro('Informe o número da demanda (ex.: 254).')
  const t = await prisma.task.findUnique({
    where: { number: n },
    include: { process: { include: { stages: true } }, client: { select: { id: true, name: true } }, assignee: { select: { id: true, name: true } } },
  })
  if (!t) throw new FerramentaErro(`Demanda #${n} não encontrada.`)
  return t
}

const lerGrupoDoCliente: Ferramenta = {
  nome: 'ler_grupo_do_cliente',
  titulo: 'Ler o grupo do cliente',
  descricao: 'Mensagens do grupo de WhatsApp do cliente (ajustes pedidos, aprovações, dúvidas), em ordem. Use para entender o que o cliente pediu antes de abrir ou trabalhar uma demanda.',
  escopo: 'acoes',
  entrada: {
    clienteId: z.string().describe('id do cliente (de buscar_clientes).'),
    desde: texto('Data inicial AAAA-MM-DD. Vazio = últimos 7 dias.'),
    limite: z.number().int().min(1).max(200).optional().describe('Máximo de mensagens (padrão 60).'),
  },
  async executar(ctx, args) {
    const c = await prisma.client.findUnique({ where: { id: String(args.clienteId ?? '') }, select: { name: true, whatsappGroupId: true } })
    if (!c) throw new FerramentaErro('Cliente não encontrado.')
    if (!c.whatsappGroupId) throw new FerramentaErro(`${c.name} não tem grupo de WhatsApp vinculado na Central.`)
    const desdeTxt = typeof args.desde === 'string' ? args.desde.trim() : ''
    if (desdeTxt && !/^\d{4}-\d{2}-\d{2}$/.test(desdeTxt)) throw new FerramentaErro('desde inválido: use AAAA-MM-DD.')
    const desde = desdeTxt ? inicioDoDiaSP(desdeTxt) : new Date(ctx.agora.getTime() - 7 * 864e5)
    const limite = typeof args.limite === 'number' ? args.limite : 60
    const msgs = normalizarMensagens(await uazFindMessages(c.whatsappGroupId, Math.min(200, limite * 2)))
    return `Grupo de ${c.name} desde ${dataBr(desde)}:\n${conversaEmTexto(msgs, { desde, max: limite })}`
  },
}

/** Horas sem resposta da VEX a partir das quais o agente avisa o Antonio. */
export const ESPERANDO_RESPOSTA_HORAS = 2

const novidadesDosGrupos: Ferramenta = {
  nome: 'novidades_dos_grupos',
  titulo: 'Novidades dos grupos acompanhados',
  descricao: 'O que chegou nos grupos dos clientes que o agente acompanha desde a última leitura (marcada com marcar_grupo_lido), e quem está esperando resposta da VEX. Use no início de cada rodada de acompanhamento.',
  escopo: 'acoes',
  entrada: {},
  async executar(ctx) {
    const clientes = await prisma.client.findMany({
      where: { agenteAcompanha: true, whatsappGroupId: { not: null }, status: 'ATIVO' },
      select: { id: true, name: true, whatsappGroupId: true, agenteLidoAte: true },
      orderBy: { name: 'asc' },
    })
    if (clientes.length === 0) return 'Nenhum cliente com "Agente de IA acompanha o grupo" ligado na Central.'
    const blocos: string[] = []
    const quietos: string[] = []
    for (const c of clientes) {
      try {
        const msgs = normalizarMensagens(await uazFindMessages(c.whatsappGroupId!, 100))
        const n = novidadesDoGrupo(msgs, c.agenteLidoAte, ctx.agora)
        const esperando = n.esperandoHoras !== null && n.esperandoHoras >= ESPERANDO_RESPOSTA_HORAS ? ` · ⚠ cliente esperando resposta há ${n.esperandoHoras} h` : ''
        if (!n.ate) { quietos.push(`${c.name}${esperando}`); continue }
        blocos.push([
          `== ${c.name} (clienteId ${c.id}) · ${n.novas.length} mensagem(ns) nova(s), ${n.doCliente} do cliente${esperando}`,
          `   depois de tratar: marcar_grupo_lido clienteId=${c.id} ate=${n.ate.toISOString()}`,
          conversaEmTexto(n.novas, { max: 100 }),
        ].join('\n'))
      } catch (e) {
        blocos.push(`== ${c.name}: não consegui ler o grupo agora (${e instanceof Error ? e.message : 'erro'}). Tente na próxima rodada.`)
      }
    }
    return [...blocos, quietos.length ? `Sem novidades: ${quietos.join('; ')}` : null].filter(Boolean).join('\n\n')
  },
}

const marcarGrupoLido: Ferramenta = {
  nome: 'marcar_grupo_lido',
  titulo: 'Marcar o grupo como lido',
  descricao: 'Depois de tratar as novidades de um cliente, avança a leitura até a mensagem indicada em novidades_dos_grupos (ate). Só avança, nunca volta.',
  escopo: 'acoes',
  somenteLeitura: false,
  entrada: {
    clienteId: z.string().describe('id do cliente.'),
    ate: z.string().describe('O "ate" que veio em novidades_dos_grupos (data e hora ISO).'),
  },
  async executar(ctx, args) {
    const ate = new Date(String(args.ate ?? ''))
    if (Number.isNaN(ate.getTime())) throw new FerramentaErro('ate inválido: use o valor que veio em novidades_dos_grupos.')
    if (ate.getTime() > ctx.agora.getTime() + 60_000) throw new FerramentaErro('ate está no futuro.')
    const c = await prisma.client.findUnique({ where: { id: String(args.clienteId ?? '') }, select: { id: true, name: true, agenteAcompanha: true, agenteLidoAte: true } })
    if (!c) throw new FerramentaErro('Cliente não encontrado.')
    if (!c.agenteAcompanha) throw new FerramentaErro(`${c.name} não está com "Agente de IA acompanha o grupo" ligado.`)
    if (c.agenteLidoAte && c.agenteLidoAte >= ate) return `${c.name}: já estava lido até ${c.agenteLidoAte.toISOString()}.`
    await prisma.client.update({ where: { id: c.id }, data: { agenteLidoAte: ate } })
    return `${c.name}: lido até ${ate.toISOString()}.`
  },
}

const filaDoAgente: Ferramenta = {
  nome: 'fila_do_agente',
  titulo: 'Fila do agente',
  descricao: 'Demandas marcadas "Fila do agente de IA" que estão abertas: as que estão com o agente (etapa de execução) e as que esperam validação de uma pessoa.',
  escopo: 'acoes',
  entrada: {},
  async executar(ctx) {
    const ts = await prisma.task.findMany({
      where: { status: { not: 'CONCLUIDO' }, tags: { has: TAG_AGENTE } },
      include: { client: { select: { name: true } }, assignee: { select: { name: true } }, stage: true },
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { number: 'asc' }],
      take: 50,
    })
    if (ts.length === 0) return 'A fila do agente está vazia.'
    const hoje0 = inicioDoDiaSP(diaSP(ctx.agora))
    return ts.map((t) => {
      const comAgente = t.stage?.kind === 'EXECUCAO' && !t.stage.notifyClient
      const prazo = prazoAtual(t.stage, t, ctx.agora, hoje0)
      return `- ${taskShortId(t.number)} | ${comAgente ? 'PARA O AGENTE' : `esperando ${t.assignee?.name ?? 'uma pessoa'}`} | ${t.stage?.name ?? t.status} | prazo ${prazo ? dataBr(prazo) : '—'} | ${t.title} | ${t.client?.name ?? 'sem cliente'}`
    }).join('\n')
  },
}

const lerDemanda: Ferramenta = {
  nome: 'ler_demanda',
  titulo: 'Ler a demanda',
  descricao: 'Briefing, etapa atual, o que a etapa exige para entregar, texto para o cliente e os comentários de uma demanda.',
  escopo: 'acoes',
  entrada: { demanda: numeroDaDemanda },
  async executar(ctx, args) {
    const t = await demandaPorNumero(args.demanda)
    const etapa = t.process?.stages.find((s) => s.id === t.stageId) ?? null
    const comentarios = await prisma.taskComment.findMany({ where: { taskId: t.id }, orderBy: { createdAt: 'asc' }, take: 30, include: { user: { select: { name: true } } } })
    const dados = (t.processData ?? {}) as Record<string, { note?: string }>
    const notas = (t.process ? ordered(t.process.stages) : []).filter((s) => dados[s.id]?.note).map((s) => `  - ${s.name}: ${dados[s.id]!.note}`)
    return [
      `${taskShortId(t.number)} · ${t.title}`,
      `Cliente: ${t.client?.name ?? '—'} · Processo: ${t.process?.name ?? '—'} · Etapa: ${etapa?.name ?? t.status} (${etapa?.kind ?? '—'}) · com ${t.assignee?.name ?? 'ninguém'}`,
      `Fila do agente: ${naFilaDoAgente(t.tags) ? 'sim' : 'não'} · Data final: ${t.dueDate ? dataBr(t.dueDate) : '—'}`,
      etapa?.fields.length ? `A etapa exige para entregar: ${etapa.fields.join(', ')}` : null,
      `Texto para o cliente: ${t.clientText ?? '(vazio)'}`,
      `Briefing:\n${t.description ?? '(sem briefing)'}`,
      t.reviewNote ? `Último ajuste pedido: ${t.reviewNote}` : null,
      notas.length ? `Observações das etapas:\n${notas.join('\n')}` : null,
      comentarios.length ? `Comentários:\n${comentarios.map((c) => `  - ${c.user.name}: ${c.content}`).join('\n')}` : 'Sem comentários.',
      `${ctx.base}/demandas?t=${t.id}`,
    ].filter(Boolean).join('\n')
  },
}

const criarDemanda: Ferramenta = {
  nome: 'criar_demanda',
  titulo: 'Criar demanda na fila do agente',
  descricao: 'Abre uma demanda já na fila do agente de IA (ex.: os ajustes que o cliente pediu no grupo). Fica com a pessoa que conectou o assistente como responsável e revisora.',
  escopo: 'acoes',
  somenteLeitura: false,
  entrada: {
    clienteId: z.string().describe('id do cliente (de buscar_clientes).'),
    titulo: z.string().min(3).max(120).describe('Título curto. Ex.: "Unna · ajustes do site (botão do WhatsApp e fotos)".'),
    descricao: z.string().min(3).max(4000).describe('Briefing: o que foi pedido, item por item, e de onde veio (ex.: grupo do cliente em 23/10).'),
    prazo: z.string().describe('Data final AAAA-MM-DD.'),
    textoParaCliente: texto('Completa a frase do aviso ao cliente ("Finalizamos …") quando for aprovada. Ex.: "os ajustes do site: botão do WhatsApp e foto da home".'),
    processo: texto('slug do processo. Padrão: site-apresentacao (o agente faz os ajustes; quando a pessoa aprova, o grupo do cliente é avisado).'),
  },
  async executar(ctx, args) {
    const prazo = String(args.prazo ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(prazo)) throw new FerramentaErro('prazo inválido: use AAAA-MM-DD.')
    const cliente = await prisma.client.findUnique({ where: { id: String(args.clienteId ?? '') }, select: { id: true, name: true } })
    if (!cliente) throw new FerramentaErro('Cliente não encontrado.')
    const slug = (typeof args.processo === 'string' && args.processo.trim()) || 'site-apresentacao'
    const proc = await prisma.process.findUnique({ where: { slug }, include: { stages: true } })
    if (!proc || !proc.active) throw new FerramentaErro(`Processo "${slug}" não existe ou está desligado.`)
    const primeira = ordered(proc.stages)[0]
    const textoCliente = typeof args.textoParaCliente === 'string' ? args.textoParaCliente.trim().slice(0, 300) || null : null
    const t = await prisma.task.create({
      data: {
        title: String(args.titulo).trim(), description: String(args.descricao).trim(), status: 'TODO', priority: 'MEDIA',
        dueDate: new Date(`${prazo}T18:00:00-03:00`), clientId: cliente.id, clientText: textoCliente,
        assigneeId: ctx.userId, producerId: ctx.userId, reviewerId: ctx.userId, schedulerId: ctx.userId, creatorId: ctx.userId,
        tags: [TAG_AGENTE], processId: proc.id, stageId: primeira.id, stageEnteredAt: ctx.agora, teamId: null,
      },
    })
    await logTaskEvent(t.id, 'CRIACAO', `Demanda criada pelo ${ctx.appName} (agente de IA), na fila do agente.`, ctx.userId)
    return `Criada ${taskShortId(t.number)} · ${t.title} · ${cliente.name} · ${proc.name} › ${primeira.name} · prazo ${dataBr(t.dueDate!)}\n${ctx.base}/demandas?t=${t.id}`
  },
}

const comentarDemanda: Ferramenta = {
  nome: 'comentar_demanda',
  titulo: 'Comentar na demanda',
  descricao: 'Deixa um comentário na demanda da fila do agente (andamento, dúvida, o que falta do cliente).',
  escopo: 'acoes',
  somenteLeitura: false,
  entrada: { demanda: numeroDaDemanda, texto: z.string().min(1).max(2000).describe('O comentário.') },
  async executar(ctx, args) {
    const t = await demandaPorNumero(args.demanda)
    if (!naFilaDoAgente(t.tags)) throw new FerramentaErro('Esta demanda não está na fila do agente de IA.')
    await prisma.taskComment.create({ data: { taskId: t.id, userId: ctx.userId, content: `🤖 ${ctx.appName}: ${String(args.texto).trim()}` } })
    return `Comentário deixado em ${taskShortId(t.number)}.`
  },
}

const entregarParaValidacao: Ferramenta = {
  nome: 'entregar_para_validacao',
  titulo: 'Entregar para validação',
  descricao: 'Conclui a etapa de execução em que o agente trabalhou e passa a demanda para a próxima etapa (validação de uma pessoa), com o resumo do que foi feito e o link. Avisa o responsável no WhatsApp. Nunca aprova, nunca conclui e nunca avisa o cliente.',
  escopo: 'acoes',
  somenteLeitura: false,
  entrada: {
    demanda: numeroDaDemanda,
    resumo: z.string().min(3).max(1500).describe('O que foi feito, item por item.'),
    link: texto('Onde conferir: link da prévia, do arquivo ou do commit.'),
    textoParaCliente: texto('Ajusta o texto do aviso ao cliente (vai só depois da aprovação).'),
  },
  async executar(ctx, args) {
    const t = await demandaPorNumero(args.demanda)
    const stages = t.process ? ordered(t.process.stages) : []
    const atual = stages.find((s) => s.id === t.stageId) ?? null
    const destino = atual ? nextStage(stages, atual.id) : null
    const motivo = motivoParaNaoEntregar(t.tags, atual, destino)
    if (motivo) throw new FerramentaErro(motivo)
    const usuario = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { id: true, role: true, name: true } })
    if (!usuario) throw new FerramentaErro('Quem conectou o assistente não existe mais.')
    const resumo = String(args.resumo).trim()
    const link = typeof args.link === 'string' && args.link.trim() ? args.link.trim() : undefined
    const textoCliente = typeof args.textoParaCliente === 'string' ? args.textoParaCliente.trim().slice(0, 300) : ''
    if (textoCliente) await prisma.task.update({ where: { id: t.id }, data: { clientText: textoCliente } })
    let movida
    try {
      movida = await moveTaskStage(t.id, { action: 'avancar', note: resumo, link, driveLink: link }, usuario)
    } catch (e) {
      if (e instanceof StageError) throw new FerramentaErro(e.message)
      throw e
    }
    await logTaskEvent(t.id, 'AGENTE', `${ctx.appName} (agente de IA) entregou "${atual!.name}": ${resumo}${link ? ` · ${link}` : ''}`, ctx.userId)
    if (movida.assigneeId === ctx.userId) {
      await notifyWhatsApp(ctx.userId, avisoDeEntrega({ numero: t.number, titulo: t.title, etapa: destino!.name, resumo, link, app: ctx.appName }))
    }
    return `${taskShortId(t.number)} entregue: agora em "${destino!.name}", esperando validação. O responsável foi avisado.`
  },
}

export const FERRAMENTAS_ACOES: Ferramenta[] = [novidadesDosGrupos, marcarGrupoLido, lerGrupoDoCliente, filaDoAgente, lerDemanda, criarDemanda, comentarDemanda, entregarParaValidacao]
