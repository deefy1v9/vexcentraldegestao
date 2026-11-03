import { Flag, Hourglass } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STAGE_BY_KEY, type TaskPriority, type TaskStatus } from '@/lib/demandas-core'
import { TOM, type Tom } from '@/components/vex/vireo'

/**
 * Peças visuais das Demandas no padrão Vireo: pílula de etapa, bandeira de
 * prioridade e avatar com iniciais. Cor de status sempre vem com texto.
 */

/** Tom de cada status do fluxo (tokens de status, nunca a cor da marca). */
const TOM_DO_STATUS: Record<TaskStatus, Tom> = {
  BACKLOG: 'neutro',
  TODO: 'neutro',
  EM_ANDAMENTO: 'info',
  EM_REVISAO: 'atencao',
  APROVADO: 'sucesso',
  CONCLUIDO: 'sucesso',
}

const PONTO: Record<Tom, string> = {
  marca: 'bg-marca',
  sucesso: 'bg-success',
  info: 'bg-info',
  perigo: 'bg-destructive',
  atencao: 'bg-warning',
  neutro: 'bg-subtle',
  ia: 'bg-ia',
}

/** Etapa que espera o aval de alguém (revisão ou aprovação do cliente). */
export function aguardandoAprovacao(t: { status: TaskStatus; stage?: { kind: string } | null }) {
  if (t.status === 'CONCLUIDO') return false
  return t.status === 'EM_REVISAO' || t.stage?.kind === 'APROVACAO'
}

/** Pílula da etapa: ponto + rótulo; em aprovação ganha o ícone de espera. */
export function PilulaEtapa({ status, rotulo, aguardando, className }: {
  status: TaskStatus; rotulo?: string; aguardando?: boolean; className?: string
}) {
  const tom: Tom = aguardando ? 'atencao' : TOM_DO_STATUS[status]
  const texto = rotulo ?? STAGE_BY_KEY[status]?.label ?? status
  return (
    <span className={cn('inline-flex max-w-full items-center gap-1.5 h-[22px] rounded-full px-2 text-[11.5px] font-semibold leading-none whitespace-nowrap', TOM[tom], className)} title={texto}>
      {aguardando
        ? <Hourglass className="w-3 h-3 shrink-0" aria-hidden />
        : <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', PONTO[tom])} aria-hidden />}
      <span className="truncate">{texto}</span>
    </span>
  )
}

export function pontoDoStatus(status: TaskStatus) {
  return PONTO[TOM_DO_STATUS[status]]
}

const PRIORIDADE: Record<TaskPriority, { rotulo: string; cor: string }> = {
  URGENTE: { rotulo: 'Urgente', cor: 'text-destructive-texto' },
  ALTA: { rotulo: 'Alta', cor: 'text-warning' },
  MEDIA: { rotulo: 'Média', cor: 'text-muted-foreground' },
  BAIXA: { rotulo: 'Baixa', cor: 'text-muted-foreground' },
}

/** Bandeira de prioridade, como a coluna "Priority" do modelo. */
export function BandeiraPrioridade({ prioridade, className }: { prioridade: TaskPriority; className?: string }) {
  const p = PRIORIDADE[prioridade] ?? PRIORIDADE.MEDIA
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[12.5px] font-medium', p.cor, className)}>
      <Flag className="w-3.5 h-3.5 shrink-0" aria-hidden /> {p.rotulo}
    </span>
  )
}

export function iniciais(nome?: string | null) {
  if (!nome) return '?'
  const p = nome.trim().split(/\s+/)
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase()
}

// Tons suaves para distinguir as pessoas (tokens de realce, valem no escuro)
const CORES_AVATAR = [
  'bg-realce-azul text-info',
  'bg-realce-verde text-success',
  'bg-realce-lilas text-ia',
  'bg-realce-amarelo text-warning',
  'bg-realce-salmao text-destructive-texto',
]

function corDoNome(nome: string) {
  let h = 0
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0
  return CORES_AVATAR[h % CORES_AVATAR.length]
}

/** Avatar com iniciais; sem pessoa, um círculo tracejado. */
export function AvatarPessoa({ nome, tamanho = 'sm', className }: { nome?: string | null; tamanho?: 'xs' | 'sm' | 'md'; className?: string }) {
  const cls = tamanho === 'md' ? 'w-9 h-9 text-xs' : tamanho === 'xs' ? 'w-[22px] h-[22px] text-[9.5px]' : 'w-6 h-6 text-[10px]'
  if (!nome) {
    return <span title="Sem responsável" className={cn(cls, 'shrink-0 rounded-full border border-dashed border-subtle', className)} />
  }
  return (
    <span title={nome} className={cn(cls, 'shrink-0 rounded-full inline-flex items-center justify-center font-semibold', corDoNome(nome), className)}>
      {iniciais(nome)}
    </span>
  )
}

const TEXTO: Record<Tom, string> = {
  marca: 'text-marca-texto',
  sucesso: 'text-success',
  info: 'text-info',
  perigo: 'text-destructive-texto',
  atencao: 'text-warning',
  neutro: 'text-muted-foreground',
  ia: 'text-ia',
}

/** Fundo suave + texto do status (chips pequenos, como no calendário). */
export function classeDoStatus(status: TaskStatus) {
  return TOM[TOM_DO_STATUS[status]]
}

/** Só a cor do texto do status. */
export function textoDoStatus(status: TaskStatus) {
  return TEXTO[TOM_DO_STATUS[status]]
}
