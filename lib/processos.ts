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

export function prevStage<T extends StageLike>(stages: T[], stageId: string | null | undefined): T | null {
  const list = ordered(stages)
  const i = list.findIndex((s) => s.id === stageId)
  return i > 0 ? list[i - 1] : null
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
  if (/logo|identidade/.test(t)) return 'logo'
  if (/landing|\blp\b/.test(t)) return 'landing-page'
  if (/site/.test(t)) return 'site'
  if (/artigo|blog/.test(t)) return 'artigo-seo'
  if (/an[uú]ncio|campanha|tr[aá]fego/.test(t)) return 'trafego-pago'
  if (/design|apresenta|e-?book|pptx/.test(t)) return 'design'
  return DEFAULT_PROCESS_SLUG
}

export function checklistKey(stageId: string, i: number) {
  return `${stageId}:${i}`
}

function isUrl(v?: string | null) {
  if (!v) return false
  try { return new URL(v.trim()).protocol === 'https:' } catch { return false }
}

export function isDriveLink(v?: string | null) {
  if (!isUrl(v)) return false
  return /(^|\.)(drive|docs)\.google\.com$/.test(new URL(v!.trim()).hostname)
}

/**
 * O que falta para concluir/aprovar a etapa. Lista vazia = pode avançar.
 * Considera o que já está salvo na demanda e o que veio no painel.
 */
export function missingToAdvance(stage: StageLike, task: TaskForStage, input: StageInput = {}): string[] {
  const falta: string[] = []
  for (const f of stage.fields as StageField[]) {
    if (f === 'LINK_DRIVE' && !isDriveLink(input.driveLink ?? task.driveLink)) falta.push('link do Google Drive (https://drive.google.com/…)')
    if (f === 'LINK' && !isUrl(input.link ?? linkFromData(task, stage.id))) falta.push('link da entrega (https://…)')
    if (f === 'LINK_PUBLICACAO' && !isUrl(input.publicationLink ?? task.publicationLink)) falta.push('link publicado (https://…)')
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
  if (stage.kind === 'APROVACAO') return { advance: 'Aprovar', back: 'Devolver' }
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
      exec('Briefing e copy', 3, { fields: ['LINK'], instructions: 'Defina oferta, público e escreva a copy. Cole o link do documento.' }),
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
      exec('Pesquisa e referências', 3, { fields: ['LINK'] }),
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
      exec('Publicação', 1, { fields: ['LINK'], instructions: 'Ative a campanha e cole o link do gerenciador.' }),
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
      exec('Arquivos finais', 1, { fields: ['LINK_DRIVE'], instructions: 'Exporte nos formatos combinados e entregue ao cliente.' }),
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
]

export const DEFAULT_PROCESS_SLUG = 'conteudo-redes'
