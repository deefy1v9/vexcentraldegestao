/**
 * Processos — regras puras (sem Prisma, sem I/O), usadas no servidor e na tela.
 *
 * Um processo é a rota de etapas de um tipo de entrega. Cada etapa diz quem
 * assume, o prazo, o que precisa estar preenchido para concluir e qual status
 * antigo a demanda espelha (quadro, calendário e lembretes leem o status).
 *
 * Tipos de etapa:
 * - EXECUCAO: alguém faz e conclui (avança);
 * - APROVACAO: o responsável aprova (avança) ou devolve (volta uma etapa);
 * - FINAL: a demanda terminou.
 */

export type StageKind = 'EXECUCAO' | 'APROVACAO' | 'FINAL'
export type StageField = 'LINK_DRIVE' | 'LINK' | 'LINK_PUBLICACAO' | 'DATA_PUBLICACAO' | 'NOTA'
export type StageRole = 'PRODUTOR' | 'REVISOR' | 'AGENDADOR'
export type DueMode = 'DIAS_APOS_ENTRADA' | 'ANTES_DA_ENTREGA'
export type StatusEspelho = 'BACKLOG' | 'TODO' | 'EM_ANDAMENTO' | 'EM_REVISAO' | 'APROVADO' | 'CONCLUIDO'

export interface StageLike {
  id: string
  position: number
  name: string
  instructions?: string | null
  kind: StageKind | string
  status: StatusEspelho | string
  role?: StageRole | string | null
  defaultUserId?: string | null
  teamId?: string | null
  dueMode: DueMode | string
  dueDays: number
  fields: string[]
  checklist: string[]
  checklistRequired: boolean
  /** Avisa o cliente (grupo do WhatsApp) quando a demanda sai desta etapa para adiante */
  notifyClient?: boolean
  /** Frase que o cliente lê; aceita {entrega} e {entrega|reserva} */
  clientPhrase?: string | null
}

export interface ProcessLike {
  id: string
  name: string
  slug: string
  color: string
  stages: StageLike[]
}

/** O que a regra precisa da demanda. */
export interface TaskForStage {
  stageId?: string | null
  stageEnteredAt?: Date | string | null
  dueDate?: Date | string | null
  assigneeId?: string | null
  producerId?: string | null
  reviewerId?: string | null
  schedulerId?: string | null
  driveLink?: string | null
  publicationLink?: string | null
  scheduledFor?: Date | string | null
  checklistDone?: string[]
  processData?: unknown
  /** Prazo por etapa definido pelo admin: { [stageId]: ISO } */
  stageDeadlines?: unknown
}

/** O que a pessoa preencheu no painel ao concluir a etapa. */
export interface StageInput {
  driveLink?: string
  link?: string
  publicationLink?: string
  publicationDate?: string
  note?: string
}

export const KIND_LABEL: Record<StageKind, string> = {
  EXECUCAO: 'Execução',
  APROVACAO: 'Aprovação',
  FINAL: 'Final',
}

export const FIELD_LABEL: Record<StageField, string> = {
  LINK_DRIVE: 'Link do Google Drive',
  LINK: 'Link da entrega',
  LINK_PUBLICACAO: 'Link publicado',
  DATA_PUBLICACAO: 'Data de publicação',
  NOTA: 'Observação',
}

export const ROLE_LABEL: Record<StageRole, string> = {
  PRODUTOR: 'Produtor da demanda',
  REVISOR: 'Revisor da demanda',
  AGENDADOR: 'Responsável pelo agendamento',
}

export const STATUS_LABEL: Record<StatusEspelho, string> = {
  BACKLOG: 'Backlog',
  TODO: 'A fazer',
  EM_ANDAMENTO: 'Em andamento',
  EM_REVISAO: 'Em revisão',
  APROVADO: 'Aprovado',
  CONCLUIDO: 'Concluído',
}

const DAY = 24 * 60 * 60 * 1000

export function ordered<T extends { position: number }>(stages: T[]): T[] {
  return [...stages].sort((a, b) => a.position - b.position)
}

export function stageIndex(stages: StageLike[], stageId: string | null | undefined): number {
  return ordered(stages).findIndex((s) => s.id === stageId)
}

export function nextStage<T extends StageLike>(stages: T[], stageId: string | null | undefined): T | null {
  const list = ordered(stages)
  const i = list.findIndex((s) => s.id === stageId)
  return i >= 0 && i < list.length - 1 ? list[i + 1] : null
}

/**
 * Para onde vai um pedido de ajuste: a última etapa de execução antes desta.
 * Aprovações no caminho (ex.: revisão interna antes da aprovação do cliente)
 * são puladas, porque o ajuste é de quem faz, não de quem aprova.
 */
export function prevStage<T extends StageLike>(stages: T[], stageId: string | null | undefined): T | null {
  const list = ordered(stages)
  const i = list.findIndex((s) => s.id === stageId)
  if (i <= 0) return null
  for (let j = i - 1; j >= 0; j--) if (list[j].kind === 'EXECUCAO') return list[j]
  return list[i - 1]
}

/**
 * Etapa equivalente a um status antigo — usada quando a demanda muda de
 * status por fora do processo (arrasto no quadro, ações antigas, assistente).
 * Pega a primeira etapa com aquele status; BACKLOG/TODO caem na primeira etapa.
 */
export function stageForStatus<T extends StageLike>(stages: T[], status: string): T | null {
  const list = ordered(stages)
  if (status === 'BACKLOG' || status === 'TODO') return list[0] ?? null
  return list.find((s) => s.status === status) ?? null
}

/** Prazo da etapa atual. */
export function stageDue(stage: StageLike, task: TaskForStage): Date | null {
  if (stage.kind === 'FINAL') return null
  if (stage.dueMode === 'ANTES_DA_ENTREGA') {
    if (!task.dueDate) return null
    return new Date(new Date(task.dueDate).getTime() - stage.dueDays * DAY)
  }
  if (!task.stageEnteredAt) return null
  return new Date(new Date(task.stageEnteredAt).getTime() + stage.dueDays * DAY)
}

/**
 * Prazo que vale agora: o da etapa. Se ele já passou mas a data final ainda
 * não, o prazo é hoje: a demanda foi replanejada e não está atrasada (a
 * produção D-2 de um post que sai hoje não vira "atrasada"). E nunca passa
 * da data final: etapa de 7 dias numa demanda para hoje vence hoje.
 * Data que o admin marcou para a etapa vale acima de tudo isso.
 */
export function prazoAtual(stage: StageLike | null | undefined, task: TaskForStage, agora: Date = new Date(), inicioDeHoje?: Date): Date | null {
  if (stage && stage.kind !== 'FINAL') {
    const definido = prazoDefinido(task, stage.id)
    if (definido) return definido
  }
  const final = task.dueDate ? new Date(task.dueDate) : null
  const etapa = stage ? stageDue(stage, task) : null
  if (!etapa) return final
  // No servidor (UTC) quem chama passa o início do dia de Brasília
  const hoje = inicioDeHoje ? new Date(inicioDeHoje) : new Date(agora)
  if (!inicioDeHoje) hoje.setHours(0, 0, 0, 0)
  if (etapa < hoje && final && final >= hoje) return hoje
  if (final && final < etapa) return final
  return etapa
}

/** Prazo que o admin marcou para a etapa nesta demanda (null se não marcou). */
export function prazoDefinido(task: TaskForStage, stageId: string): Date | null {
  const m = task.stageDeadlines
  if (!m || typeof m !== 'object') return null
  const v = (m as Record<string, unknown>)[stageId]
  if (typeof v !== 'string') return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export interface PrazoDeEtapa {
  id: string
  name: string
  prazo: Date | null
  /** true = data marcada pelo admin; false = calculada pela regra do processo */
  definido: boolean
  situacao: 'feita' | 'atual' | 'proxima'
}

/**
 * O plano de prazos da demanda, etapa por etapa (sem a final). A atual usa o
 * prazo que vale agora; as próximas usam a data marcada ou a previsão pela
 * regra (dias depois da anterior, ou antes da entrega), sem passar da data final.
 */
export function prazosDasEtapas(stages: StageLike[], task: TaskForStage, agora: Date = new Date()): PrazoDeEtapa[] {
  const todas = ordered(stages)
  const naFinal = todas.find((s) => s.id === task.stageId)?.kind === 'FINAL'
  const lista = todas.filter((s) => s.kind !== 'FINAL')
  const iAtual = naFinal ? lista.length : Math.max(0, lista.findIndex((s) => s.id === task.stageId))
  const final = task.dueDate ? new Date(task.dueDate) : null
  let anterior: Date | null = null
  return lista.map((s, i) => {
    const definido = prazoDefinido(task, s.id)
    if (i < iAtual) return { id: s.id, name: s.name, prazo: definido, definido: !!definido, situacao: 'feita' as const }
    let prazo: Date | null
    if (i === iAtual) prazo = prazoAtual(s, task.stageId === s.id ? task : { ...task, stageId: s.id, stageEnteredAt: agora }, agora)
    else if (definido) prazo = definido
    else {
      prazo = s.dueMode === 'ANTES_DA_ENTREGA'
        ? (final ? new Date(final.getTime() - s.dueDays * DAY) : null)
        : (anterior ? new Date(anterior.getTime() + s.dueDays * DAY) : null)
      if (prazo && final && prazo > final) prazo = final
    }
    anterior = prazo ?? anterior
    return { id: s.id, name: s.name, prazo, definido: !!definido, situacao: i === iAtual ? 'atual' as const : 'proxima' as const }
  })
}

/**
 * Valida os prazos por etapa que o admin mandou: só etapas do processo da
 * demanda e datas válidas; vazio tira a data (volta para a regra). Junta com
 * o que já estava gravado.
 */
export function normalizarPrazos(
  entrada: unknown, etapasValidas: string[], atual: unknown = null,
): { ok: Record<string, string> | null } | { erro: string } {
  if (entrada === null) return { ok: null }
  if (typeof entrada !== 'object' || Array.isArray(entrada)) return { erro: 'Prazos por etapa inválidos.' }
  const base: Record<string, string> = atual && typeof atual === 'object' && !Array.isArray(atual) ? { ...(atual as Record<string, string>) } : {}
  for (const [id, v] of Object.entries(entrada as Record<string, unknown>)) {
    if (!etapasValidas.includes(id)) return { erro: 'Essa etapa não é do processo desta demanda.' }
    if (v === null || v === '') { delete base[id]; continue }
    const d = typeof v === 'string' ? new Date(v) : null
    if (!d || Number.isNaN(d.getTime())) return { erro: 'Data inválida no prazo da etapa.' }
    base[id] = d.toISOString()
  }
  for (const k of Object.keys(base)) if (!etapasValidas.includes(k)) delete base[k]
  return { ok: Object.keys(base).length ? base : null }
}

/**
 * Quem assume a etapa, nesta ordem: o papel na demanda, a pessoa fixa da
 * etapa, a equipe (com uma pessoa só vai direto para ela; com mais, ninguém:
 * a tarefa entra na fila da equipe) e, sem nada disso, quem já estava.
 */
export function responsibleFor(stage: StageLike, task: TaskForStage, membrosDaEquipe: string[] = []): string | null {
  if (stage.role === 'PRODUTOR' && task.producerId) return task.producerId
  if (stage.role === 'REVISOR' && task.reviewerId) return task.reviewerId
  if (stage.role === 'AGENDADOR' && task.schedulerId) return task.schedulerId
  if (stage.defaultUserId) return stage.defaultUserId
  if (stage.teamId) return membrosDaEquipe.length === 1 ? membrosDaEquipe[0] : null
  return task.assigneeId ?? null
}

/**
 * Processo de uma demanda pelo TIPO dela (não pelo título: "Case de site" é
 * um post). Sem tipo conhecido, conteúdo para redes.
 */
export function inferProcessSlug(contentType?: string | null): string {
  const t = (contentType ?? '').toLowerCase()
  // A ordem importa: o primeiro que casar decide ("Consultoria de CRM" é
  // consultoria; "Pacote CRM + ... Manutenção" é CRM)
  if (/logo|identidade/.test(t)) return 'logo'
  if (/consultoria/.test(t)) return 'consultoria'
  if (/\bcrm\b|vex sales/.test(t)) return 'crm'
  if (/landing|\blp\b|link da bio/.test(t)) return 'landing-page'
  if (/nuvemshop|revitaliza/.test(t)) return 'site-apresentacao'
  if (/web ?design/.test(t)) return 'site'
  if (/manuten/.test(t)) return 'manutencao-site'
  if (/site/.test(t)) return 'site'
  if (/relat[oó]rio.*seo|seo.*relat[oó]rio/.test(t)) return 'seo-relatorio'
  if (/artigo|blog|^seo/.test(t)) return 'artigo-seo'
  if (/an[uú]ncio|campanha|tr[aá]fego|meta ads|google ads/.test(t)) return 'trafego-pago'
  if (/perfil.*google|google meu neg|\bgmb\b|\bgbp\b/.test(t)) return 'perfil-google'
  if (/e-?mail/.test(t)) return 'email-marketing'
  // "vídeo" sozinho é peça de redes (fica no conteúdo); captação e edição têm processo próprio
  if (/capta[cç][aã]o|edi[cç][aã]o de v[ií]deo/.test(t)) return 'video'
  if (/design|apresenta|e-?book|pptx|projeto adicional/.test(t)) return 'design'
  return DEFAULT_PROCESS_SLUG
}

export function checklistKey(stageId: string, i: number) {
  return `${stageId}:${i}`
}

/** Campo de link: obrigatório, mas aceita qualquer texto (link, caminho, "enviado no WhatsApp"…). */
function preenchido(...valores: Array<string | null | undefined>) {
  return valores.some((v) => !!v?.trim())
}

/**
 * O que falta para concluir/aprovar a etapa. Lista vazia = pode avançar.
 * Considera o que já está salvo na demanda e o que veio no painel.
 */
export function missingToAdvance(stage: StageLike, task: TaskForStage, input: StageInput = {}): string[] {
  const falta: string[] = []
  for (const f of stage.fields as StageField[]) {
    if (f === 'LINK_DRIVE' && !preenchido(input.driveLink, task.driveLink)) falta.push('link do Google Drive')
    if (f === 'LINK' && !preenchido(input.link, linkFromData(task, stage.id))) falta.push('link da entrega')
    if (f === 'LINK_PUBLICACAO' && !preenchido(input.publicationLink, task.publicationLink)) falta.push('link publicado')
    if (f === 'DATA_PUBLICACAO' && !(input.publicationDate || task.scheduledFor)) falta.push('data de publicação')
    if (f === 'NOTA' && !(input.note?.trim())) falta.push('observação')
  }
  if (stage.checklistRequired && stage.checklist.length > 0) {
    const feitos = new Set(task.checklistDone ?? [])
    const pendentes = stage.checklist.filter((_, i) => !feitos.has(checklistKey(stage.id, i)))
    if (pendentes.length) falta.push(`checklist (${pendentes.length} item(ns) pendente(s))`)
  }
  return falta
}

/** Dados salvos por etapa no campo `processData`. */
export type ProcessData = Record<string, { link?: string; note?: string; at?: string; by?: string }>

export function linkFromData(task: TaskForStage, stageId: string): string | undefined {
  const d = (task.processData ?? {}) as ProcessData
  return d[stageId]?.link
}

/** Rótulos dos botões da etapa, no vocabulário da equipe. */
export function stageActions(stage: StageLike): { advance: string; back?: string } | null {
  if (stage.kind === 'FINAL') return null
  if (stage.kind === 'APROVACAO') return { advance: 'Aprovar', back: 'Pedir ajuste' }
  return { advance: 'Concluir etapa' }
}

/* ------------------------------ processos padrão ------------------------------ */

export interface StageSeed {
  name: string
  kind: StageKind
  status: StatusEspelho
  role?: StageRole
  dueMode?: DueMode
  dueDays?: number
  fields?: StageField[]
  checklist?: string[]
  checklistRequired?: boolean
  instructions?: string
}
export interface ProcessSeed { slug: string; name: string; color: string; description: string; stages: StageSeed[] }

const exec = (name: string, dueDays: number, extra: Partial<StageSeed> = {}): StageSeed =>
  ({ name, kind: 'EXECUCAO', status: 'EM_ANDAMENTO', dueDays, ...extra })
const aprov = (name: string, dueDays: number, extra: Partial<StageSeed> = {}): StageSeed =>
  ({ name, kind: 'APROVACAO', status: 'EM_REVISAO', role: 'REVISOR', dueDays, ...extra })
const FIM: StageSeed = { name: 'Concluído', kind: 'FINAL', status: 'CONCLUIDO', dueDays: 0 }

/**
 * Processos que já nascem na Central. O primeiro reproduz o fluxo de conteúdo
 * que a equipe usa hoje (produção D-2, revisão D-1, agendamento no dia).
 */
export const DEFAULT_PROCESSES: ProcessSeed[] = [
  {
    slug: 'conteudo-redes', name: 'Conteúdo para redes sociais', color: '#7C3AED',
    description: 'Post, carrossel, reels e story: produção, revisão e agendamento.',
    stages: [
      exec('Produção', 2, { role: 'PRODUTOR', dueMode: 'ANTES_DA_ENTREGA', fields: ['LINK_DRIVE'], instructions: 'Produza a peça conforme o briefing e cole o link da pasta no Google Drive.' }),
      aprov('Revisão', 1, { dueMode: 'ANTES_DA_ENTREGA', instructions: 'Confira arte, texto e legenda. Aprove ou devolva com o que precisa mudar.' }),
      { name: 'Agendamento', kind: 'EXECUCAO', status: 'APROVADO', role: 'AGENDADOR', dueMode: 'ANTES_DA_ENTREGA', dueDays: 0, fields: ['DATA_PUBLICACAO'], instructions: 'Agende a publicação na plataforma e informe a data.' },
      FIM,
    ],
  },
  {
    slug: 'site', name: 'Criação de site', color: '#0EA5E9',
    description: 'Site institucional ou multipáginas, do briefing à publicação.',
    stages: [
      exec('Briefing e conteúdo', 3, { instructions: 'Reúna textos, fotos, logo, acessos e referências com o cliente.', checklist: ['Textos das páginas', 'Logo e identidade', 'Fotos', 'Acesso ao domínio e hospedagem'] }),
      exec('Layout', 5, { fields: ['LINK'], instructions: 'Monte o layout das páginas principais e cole o link (Figma ou prévia).' }),
      aprov('Aprovação do layout', 2),
      exec('Desenvolvimento', 10, { fields: ['LINK'], instructions: 'Desenvolva o site e cole o link da prévia.' }),
      aprov('Revisão interna', 2, { checklist: ['Responsivo no celular', 'Formulários enviando', 'Links e botões', 'Textos revisados'], checklistRequired: true }),
      aprov('Aprovação do cliente', 3, { instructions: 'Envie a prévia ao cliente e registre o aceite.' }),
      exec('Publicação', 2, { fields: ['LINK_PUBLICACAO'], checklist: ['SSL ativo', 'Google Search Console', 'Google Analytics', 'Sitemap enviado'], checklistRequired: true }),
      FIM,
    ],
  },
  {
    slug: 'landing-page', name: 'Criação de landing page', color: '#10B981',
    description: 'Página de captura ou venda, com copy, design e publicação.',
    stages: [
      exec('Briefing e copy', 3, { instructions: 'Defina oferta, público e escreva a copy.' }),
      exec('Design', 3, { fields: ['LINK'] }),
      aprov('Aprovação do design', 1),
      exec('Desenvolvimento', 4, { fields: ['LINK'] }),
      aprov('Revisão interna', 1),
      aprov('Aprovação do cliente', 2),
      exec('Publicação', 1, { fields: ['LINK_PUBLICACAO'], checklist: ['Pixel e Analytics', 'Formulário testado', 'Velocidade no celular'], checklistRequired: true }),
      FIM,
    ],
  },
  {
    slug: 'logo', name: 'Criação de logo e identidade', color: '#F59E0B',
    description: 'Logo e identidade visual, das referências aos arquivos finais.',
    stages: [
      exec('Briefing', 2, { instructions: 'Entenda a marca, o público e o que o cliente gosta e não gosta.' }),
      exec('Pesquisa e referências', 3),
      exec('Criação das propostas', 5, { fields: ['LINK_DRIVE'] }),
      aprov('Revisão interna', 1),
      aprov('Apresentação ao cliente', 3, { instructions: 'Apresente as propostas e registre a escolhida.' }),
      exec('Ajustes e arquivos finais', 3, { fields: ['LINK_DRIVE'], checklist: ['PNG', 'SVG', 'PDF', 'Versões colorida e monocromática', 'Manual de uso'], checklistRequired: true }),
      FIM,
    ],
  },
  {
    slug: 'trafego-pago', name: 'Campanha de tráfego pago', color: '#EF4444',
    description: 'Campanha nova no Meta ou Google: criativos, configuração e publicação.',
    stages: [
      exec('Briefing e objetivo', 2),
      exec('Criativos', 3, { fields: ['LINK_DRIVE'] }),
      aprov('Aprovação dos criativos', 1),
      exec('Configuração da campanha', 2, { checklist: ['Pixel e eventos', 'Públicos', 'UTMs', 'Orçamento'], checklistRequired: true }),
      aprov('Revisão', 1),
      exec('Publicação', 1, { instructions: 'Ative a campanha e confira se começou a veicular.' }),
      FIM,
    ],
  },
  {
    slug: 'design', name: 'Design e apresentações', color: '#EC4899',
    description: 'Peças avulsas: apresentação, e-book, material impresso, ajustes de arte.',
    stages: [
      exec('Criação', 3, { fields: ['LINK_DRIVE'], instructions: 'Crie a peça conforme o briefing e cole o link da pasta no Google Drive.' }),
      aprov('Revisão interna', 1),
      aprov('Aprovação do cliente', 2),
      exec('Arquivos finais', 1, { instructions: 'Exporte nos formatos combinados e entregue ao cliente.' }),
      FIM,
    ],
  },
  {
    slug: 'artigo-seo', name: 'Artigo de blog (SEO)', color: '#14B8A6',
    description: 'Pauta, redação, revisão e publicação otimizada.',
    stages: [
      exec('Pauta e palavra-chave', 2),
      exec('Redação', 3, { fields: ['LINK_DRIVE'] }),
      aprov('Revisão', 1),
      exec('Publicação', 1, { fields: ['LINK_PUBLICACAO'], checklist: ['Meta title', 'Meta description', 'Links internos', 'Imagem com alt'], checklistRequired: true }),
      FIM,
    ],
  },
  {
    slug: 'site-apresentacao', name: 'Site: desenvolvimento e apresentação', color: '#0284C7',
    description: 'Site ou loja já em andamento: ajustes e apresentação ao cliente.',
    stages: [
      exec('Desenvolvimento e ajustes', 3, { role: 'PRODUTOR', instructions: 'Faça os ajustes combinados e confira antes de apresentar.' }),
      aprov('Apresentação ao cliente', 2, { instructions: 'Apresente ao cliente e registre o aceite ou o que precisa mudar.' }),
      FIM,
    ],
  },
  {
    slug: 'video', name: 'Vídeo: captação e edição', color: '#8B5CF6',
    description: 'Vídeos captados e editados pela VEX, do roteiro ao agendamento.',
    stages: [
      exec('Roteiro', 2, { role: 'PRODUTOR', instructions: 'Escreva o roteiro e o texto de tela.' }),
      exec('Captação', 3),
      exec('Edição', 3, { fields: ['LINK_DRIVE'], instructions: 'Edite o vídeo e cole o link da pasta no Google Drive.' }),
      aprov('Revisão', 1),
      aprov('Aprovação do cliente', 2),
      { name: 'Agendamento', kind: 'EXECUCAO', status: 'APROVADO', role: 'AGENDADOR', dueMode: 'ANTES_DA_ENTREGA', dueDays: 0, fields: ['DATA_PUBLICACAO'], instructions: 'Agende a publicação na plataforma e informe a data.' },
      FIM,
    ],
  },
  {
    slug: 'manutencao-site', name: 'Manutenção de site', color: '#0891B2',
    description: 'Pedido de ajuste no site do cliente: execução, conferência e entrega.',
    stages: [
      exec('Pedido do cliente', 1, { role: 'PRODUTOR', instructions: 'Registre o que o cliente pediu e confirme o escopo.' }),
      exec('Execução', 2),
      aprov('Conferência', 1, { checklist: ['Funciona no celular', 'Nada quebrou em outras páginas'] }),
      exec('Entrega', 0, { instructions: 'Confirme com o cliente que o ajuste foi feito.' }),
      FIM,
    ],
  },
  {
    slug: 'seo-relatorio', name: 'SEO: relatório mensal', color: '#0D9488',
    description: 'Relatório mensal dos planos de SEO: dados, análise e envio.',
    stages: [
      exec('Coleta de dados', 2, { role: 'PRODUTOR', checklist: ['Search Console', 'Analytics', 'Posições das palavras-chave'] }),
      exec('Análise', 2),
      exec('Envio ao cliente', 1, { fields: ['LINK'], instructions: 'Envie o relatório ao cliente e cole o link dele.' }),
      FIM,
    ],
  },
  {
    slug: 'perfil-google', name: 'Perfil da Empresa no Google', color: '#F97316',
    description: 'Criação ou otimização do perfil no Google.',
    stages: [
      exec('Acessos', 2, { role: 'PRODUTOR', instructions: 'Consiga com o cliente o acesso ao perfil (ou os dados para criar).' }),
      exec('Configuração e fotos', 3, { checklist: ['Categorias', 'Horários', 'Descrição', 'Fotos', 'Link do site e WhatsApp'] }),
      aprov('Revisão', 1),
      exec('Publicação', 1, { fields: ['LINK_PUBLICACAO'], instructions: 'Publique e cole o link do perfil.' }),
      FIM,
    ],
  },
  {
    slug: 'crm', name: 'CRM / VEX Sales', color: '#FF6B00',
    description: 'Implantação de CRM e atendimento com IA (VEX Sales).',
    stages: [
      exec('Acessos e briefing', 2, { role: 'PRODUTOR', checklist: ['Número de WhatsApp', 'Instagram', 'Informações da empresa para a IA'] }),
      exec('Configuração', 5, { checklist: ['Canais conectados', 'IA treinada', 'Funil e etapas', 'Equipe cadastrada'] }),
      exec('Treinamento', 2, { instructions: 'Treine a equipe do cliente na plataforma.' }),
      exec('No ar', 1, { instructions: 'Confirme com o cliente que o atendimento está rodando.' }),
      FIM,
    ],
  },
  {
    slug: 'consultoria', name: 'Consultoria', color: '#6366F1',
    description: 'Consultoria comercial, estratégica ou de CRM.',
    stages: [
      exec('Diagnóstico', 5, { role: 'PRODUTOR' }),
      exec('Plano de ação', 3, { fields: ['LINK'], instructions: 'Monte o plano e cole o link do documento.' }),
      exec('Apresentação', 2, { instructions: 'Apresente o plano ao cliente.' }),
      exec('Acompanhamento', 30),
      FIM,
    ],
  },
  {
    slug: 'email-marketing', name: 'E-mail marketing', color: '#DB2777',
    description: 'Campanha de e-mail: copy, design, aprovação e disparo.',
    stages: [
      exec('Copy', 2, { role: 'PRODUTOR' }),
      exec('Design', 2, { fields: ['LINK'], instructions: 'Monte o e-mail e cole o link da prévia.' }),
      aprov('Revisão', 1),
      aprov('Aprovação do cliente', 2),
      { name: 'Disparo', kind: 'EXECUCAO', status: 'APROVADO', role: 'AGENDADOR', dueMode: 'ANTES_DA_ENTREGA', dueDays: 0, fields: ['DATA_PUBLICACAO'], instructions: 'Agende ou dispare e informe a data.' },
      FIM,
    ],
  },
]

export const DEFAULT_PROCESS_SLUG = 'conteudo-redes'

/**
 * Exigências de link tiradas dos processos que já existiam: só travavam a
 * etapa, sem entregável de fato (ex.: validar um site não gera link).
 */
export const EXIGENCIAS_REMOVIDAS: { slug: string; etapa: string; campos: StageField[] }[] = [
  { slug: 'site-apresentacao', etapa: 'Desenvolvimento e ajustes', campos: ['LINK', 'LINK_DRIVE'] },
  { slug: 'landing-page', etapa: 'Briefing e copy', campos: ['LINK'] },
  { slug: 'logo', etapa: 'Pesquisa e referências', campos: ['LINK'] },
  { slug: 'trafego-pago', etapa: 'Publicação', campos: ['LINK'] },
  { slug: 'design', etapa: 'Arquivos finais', campos: ['LINK_DRIVE'] },
]

/** Exigências da etapa sem as que o mapa removeu; o resto fica igual. */
export function semExigenciasRemovidas(slug: string, etapa: string, campos: string[]): string[] {
  const r = EXIGENCIAS_REMOVIDAS.find((x) => x.slug === slug && x.etapa === etapa)
  return r ? campos.filter((c) => !(r.campos as string[]).includes(c)) : campos
}

/**
 * Frases padrão do aviso ao cliente, por processo e etapa. Só as etapas que o
 * cliente acompanha; revisão interna e produção ficam sem aviso. Variáveis:
 * {entrega} (nome na demanda; depois da barra, o reserva), {data} (agendada),
 * {proxima} e {prazo} (próxima etapa e prazo dela), {prazo_final} (data final).
 * Trecho entre [colchetes] some se faltar algum dado dele.
 */
export const FRASES_CLIENTE_PADRAO: Record<string, Record<string, string>> = {
  'conteudo-redes': { Agendamento: 'Agendamos {entrega|mais uma publicação}[ para {data}]' },
  site: {
    'Briefing e conteúdo': 'Finalizamos o briefing do seu site[. Próxima etapa: {proxima}, até {prazo}]',
    'Aprovação do layout': 'O layout do seu site está aprovado[. Próxima etapa: {proxima}, até {prazo}]',
    Desenvolvimento: 'Finalizamos o desenvolvimento do seu site[. Previsão de publicação: {prazo_final}]',
    Publicação: 'Seu site está no ar',
  },
  'landing-page': {
    'Briefing e copy': 'Finalizamos o briefing da sua landing page[. Próxima etapa: {proxima}, até {prazo}]',
    'Aprovação do design': 'O design da sua landing page está aprovado[. Próxima etapa: {proxima}, até {prazo}]',
    Desenvolvimento: 'Finalizamos o desenvolvimento da sua landing page[. Previsão de publicação: {prazo_final}]',
    Publicação: 'Sua landing page está no ar',
  },
  logo: {
    Briefing: 'Finalizamos o briefing da sua marca[. Próxima etapa: {proxima}, até {prazo}]',
    'Ajustes e arquivos finais': 'Os arquivos finais da sua marca estão prontos',
  },
  'trafego-pago': { Publicação: 'Sua campanha está no ar[ desde {data}]' },
  design: { 'Arquivos finais': 'Finalizamos {entrega|mais uma peça}' },
  'artigo-seo': { Publicação: 'Publicamos {entrega|um novo artigo no seu site}' },
  'site-apresentacao': { 'Apresentação ao cliente': 'Finalizamos {entrega|o seu site}' },
  video: { Agendamento: 'Agendamos {entrega|o seu vídeo}[ para {data}]' },
  'manutencao-site': { Entrega: 'Fizemos {entrega|o ajuste no seu site}' },
  'seo-relatorio': { 'Envio ao cliente': 'Enviamos {entrega|o relatório de SEO do mês}' },
  'perfil-google': { Publicação: 'Seu perfil no Google está no ar' },
  crm: { 'No ar': 'Seu atendimento com IA está no ar' },
  consultoria: { Apresentação: 'Apresentamos {entrega|o plano de ação}' },
  'email-marketing': { Disparo: 'Agendamos {entrega|o seu e-mail}[ para {data}]' },
}
