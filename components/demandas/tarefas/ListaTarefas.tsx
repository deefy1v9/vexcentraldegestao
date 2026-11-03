'use client'

import { Search } from 'lucide-react'
import SearchSelect from '@/components/ui/SearchSelect'
import { Badge } from '@/components/vex/badge'
import { GrupoDaLista, Pilulas, type Tom } from '@/components/vex/vireo'
import { prazoAtual } from '@/lib/processos'
import { cn } from '@/lib/utils'
import { AvatarPessoa, BandeiraPrioridade, PilulaEtapa, aguardandoAprovacao } from '../visual'
import type { Option, ProcessOption, Task } from '../types'

export type Recorte = 'abertas' | 'atrasadas' | 'hoje' | 'semana' | 'concluidas'

const RECORTES: Array<[Recorte, string]> = [
  ['abertas', 'Abertas'],
  ['atrasadas', 'Atrasadas'],
  ['hoje', 'Hoje'],
  ['semana', 'Semana'],
  ['concluidas', 'Concluídas'],
]

const DAY = 24 * 60 * 60 * 1000

/** Prazo que importa agora: o da etapa atual; sem ele, a data final. */
export function prazoDaTarefa(t: Task): Date | null {
  return prazoAtual(t.stage ? { ...t.stage, fields: [], checklist: [], checklistRequired: false, status: t.status } : null, t)
}

function inicioDoDia(d = new Date()) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function situacaoDoPrazo(t: Task): 'atrasada' | 'hoje' | 'semana' | 'depois' | 'sem' {
  if (t.status === 'CONCLUIDO') return 'depois'
  const p = prazoDaTarefa(t)
  if (!p) return 'sem'
  const hoje = inicioDoDia().getTime()
  const dia = inicioDoDia(p).getTime()
  if (dia < hoje) return 'atrasada'
  if (dia === hoje) return 'hoje'
  if (dia - hoje <= 6 * DAY) return 'semana'
  return 'depois'
}

export function filtrarPorRecorte(tasks: Task[], r: Recorte): Task[] {
  if (r === 'concluidas') return tasks.filter((t) => t.status === 'CONCLUIDO')
  const abertas = tasks.filter((t) => t.status !== 'CONCLUIDO')
  if (r === 'abertas') return abertas
  if (r === 'atrasadas') return abertas.filter((t) => situacaoDoPrazo(t) === 'atrasada')
  if (r === 'hoje') return abertas.filter((t) => ['atrasada', 'hoje'].includes(situacaoDoPrazo(t)))
  return abertas.filter((t) => ['atrasada', 'hoje', 'semana'].includes(situacaoDoPrazo(t)))
}

/** Atrasadas primeiro, depois pelo prazo mais próximo; sem prazo no fim. */
export function ordenarPorPrazo(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const pa = prazoDaTarefa(a)?.getTime() ?? Infinity
    const pb = prazoDaTarefa(b)?.getTime() ?? Infinity
    return pa - pb || a.number - b.number
  })
}

export function fmtPrazo(d: Date | null) {
  if (!d) return 'Sem prazo'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')
}

/** Avatar com iniciais (o resumo da tarefa também usa). */
export function Avatar({ nome, size = 'sm' }: { nome?: string | null; size?: 'sm' | 'md' }) {
  return <AvatarPessoa nome={nome} tamanho={size} />
}

/** Selo do prazo: a cor só reforça o rótulo. */
export function SeloPrazo({ t }: { t: Task }) {
  const sit = situacaoDoPrazo(t)
  const prazo = fmtPrazo(prazoDaTarefa(t))
  if (t.status === 'CONCLUIDO') return <Badge variant="success">Concluída</Badge>
  if (sit === 'atrasada') return <Badge variant="danger">Atrasada · {prazo}</Badge>
  if (sit === 'hoje') return <Badge variant="warning">Hoje</Badge>
  return <Badge variant="outline">{prazo}</Badge>
}

/** Prazo na coluna da direita: vermelho se atrasou, verde se é hoje. */
function PrazoDaLinha({ t }: { t: Task }) {
  if (t.status === 'CONCLUIDO') return <span className="text-[12.5px] font-semibold text-success">Concluída</span>
  const sit = situacaoDoPrazo(t)
  const p = prazoDaTarefa(t)
  if (!p) return <span className="text-[12.5px] text-subtle">—</span>
  if (sit === 'hoje') return <span className="text-[12.5px] font-semibold text-success">Hoje</span>
  return (
    <span className={cn('text-[12.5px] tabular whitespace-nowrap', sit === 'atrasada' ? 'font-semibold text-destructive-texto' : 'text-muted-foreground')}>
      {fmtPrazo(p)}
    </span>
  )
}

function Responsavel({ t, compacto }: { t: Task; compacto?: boolean }) {
  if (!t.assignee && t.team) return <Badge variant="warning" className="shrink-0 max-w-full truncate">Fila · {t.team.name}</Badge>
  if (!t.assignee) {
    return (
      <span className="inline-flex items-center gap-2 text-[12.5px] text-subtle">
        <AvatarPessoa nome={null} tamanho="xs" />{!compacto && 'Sem responsável'}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <AvatarPessoa nome={t.assignee.name} tamanho="xs" />
      {!compacto && <span className="text-[13px] text-foreground truncate">{t.assignee.name.split(' ').slice(0, 2).join(' ')}</span>}
    </span>
  )
}

// Colunas da tabela larga: o cabeçalho e as linhas usam a mesma grade
const GRADE = '@2xl:grid @2xl:grid-cols-[minmax(0,1fr)_170px_150px_84px] @4xl:grid-cols-[minmax(0,1fr)_190px_110px_170px_88px] @2xl:items-center @2xl:gap-4'

function rotuloDaEtapa(t: Task) {
  return t.status === 'CONCLUIDO' ? 'Concluída' : (t.stage?.name ?? '—')
}

/**
 * Linha da lista no padrão Vireo: título com cliente/processo embaixo, etapa
 * em pílula, prioridade, responsável e prazo. Em painel estreito (com o
 * resumo aberto ao lado) vira um bloco compacto com as mesmas informações.
 */
export function CartaoTarefa({ t, ativo, onClick }: { t: Task; ativo: boolean; onClick: () => void }) {
  const aguardando = aguardandoAprovacao(t)
  const sub = [t.client?.name?.split(' /')[0] ?? 'Sem cliente', t.process?.name].filter(Boolean).join(' · ')
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={ativo}
      className={cn(
        'relative w-full text-left px-5 @2xl:px-6 py-3.5 border-b border-border last:border-b-0 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
        GRADE,
        ativo ? 'bg-marca-suave' : 'hover:bg-secondary/50',
      )}
    >
      {ativo && <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px] bg-marca" />}
      <span className="block min-w-0">
        <span className="flex items-start justify-between gap-3">
          <span className={cn('text-[13.5px] leading-snug font-medium @max-2xl:line-clamp-2 @2xl:line-clamp-1', ativo ? 'text-marca-texto' : 'text-foreground')}>
            {t.title} <span className="font-normal text-muted-foreground">#{t.number}</span>
          </span>
          <span className="@2xl:hidden shrink-0 pt-px"><PrazoDaLinha t={t} /></span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 t-legenda min-w-0">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: t.process?.color ?? 'var(--subtle)' }} aria-hidden />
          <span className="truncate">{sub}</span>
        </span>
        {/* Compacto: etapa e responsável embaixo do título */}
        <span className="@2xl:hidden mt-2 flex items-center gap-2 min-w-0">
          <PilulaEtapa status={t.status} rotulo={rotuloDaEtapa(t)} aguardando={aguardando} className="min-w-0" />
          {(t.priority === 'URGENTE' || t.priority === 'ALTA') && <BandeiraPrioridade prioridade={t.priority} className="text-[11.5px]" />}
          <span className="ml-auto shrink-0"><Responsavel t={t} compacto /></span>
        </span>
      </span>
      <span className="hidden @2xl:flex min-w-0"><PilulaEtapa status={t.status} rotulo={rotuloDaEtapa(t)} aguardando={aguardando} /></span>
      <span className="hidden @4xl:flex"><BandeiraPrioridade prioridade={t.priority} /></span>
      <span className="hidden @2xl:flex min-w-0"><Responsavel t={t} /></span>
      <span className="hidden @2xl:flex justify-end"><PrazoDaLinha t={t} /></span>
    </button>
  )
}

const GRUPOS: Array<{ chave: ReturnType<typeof situacaoDoPrazo>; titulo: string; tom: Tom }> = [
  { chave: 'atrasada', titulo: 'Atrasadas', tom: 'perigo' },
  { chave: 'hoje', titulo: 'Vence hoje', tom: 'atencao' },
  { chave: 'semana', titulo: 'Esta semana', tom: 'neutro' },
  { chave: 'depois', titulo: 'Depois', tom: 'neutro' },
  { chave: 'sem', titulo: 'Sem prazo', tom: 'neutro' },
]

export default function ListaTarefas({
  tarefas, total, selecionada, onSelecionar,
  busca, onBusca, recorte, onRecorte, contagem,
  processos, processo, onProcesso, clientes, cliente, onCliente,
  isAdmin, escopo, onEscopo, pessoas, pessoa, onPessoa,
}: {
  tarefas: Task[]
  total: number
  selecionada: string | null
  onSelecionar: (id: string) => void
  busca: string
  onBusca: (v: string) => void
  recorte: Recorte
  onRecorte: (r: Recorte) => void
  contagem: Record<Recorte, number>
  processos: ProcessOption[]
  processo: string
  onProcesso: (id: string) => void
  clientes: Option[]
  cliente: string
  onCliente: (id: string) => void
  isAdmin: boolean
  escopo: 'minhas' | 'equipe'
  onEscopo: (e: 'minhas' | 'equipe') => void
  pessoas: Option[]
  pessoa: string
  onPessoa: (id: string) => void
}) {
  // Grupos pelo prazo, na ordem da lista; concluídas ficam num grupo só
  const grupos = recorte === 'concluidas'
    ? [{ chave: 'concluidas', titulo: 'Concluídas', tom: 'neutro' as Tom, itens: tarefas }]
    : GRUPOS.map((g) => ({ ...g, itens: tarefas.filter((t) => situacaoDoPrazo(t) === g.chave) })).filter((g) => g.itens.length > 0)

  return (
    <div className="@container flex flex-col min-h-0 h-full">
      <div className="px-5 @2xl:px-6 pt-5 pb-4 space-y-3 shrink-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="font-display text-[19px] font-semibold tracking-[-0.01em] text-foreground truncate">
              {escopo === 'minhas' ? 'Minhas tarefas' : 'Tarefas da equipe'}
            </h2>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11.5px] font-semibold text-muted-foreground tabular">{total}</span>
          </div>
          {isAdmin && (
            <Pilulas
              rotulo="De quem"
              valor={escopo}
              aoMudar={onEscopo}
              opcoes={[{ valor: 'minhas', rotulo: 'Minhas' }, { valor: 'equipe', rotulo: 'Equipe' }]}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative block w-full @2xl:w-auto @2xl:flex-1 @2xl:max-w-sm">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => onBusca(e.target.value)}
              placeholder="Buscar por título, cliente ou número"
              className="w-full h-9 pl-10 pr-3 rounded-lg border border-border bg-card t-corpo text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
          </label>
          <div className="flex flex-wrap gap-2 @2xl:ml-auto">
            <SearchSelect value={processo} onChange={onProcesso} options={processos.map((p) => ({ id: p.id, name: p.name }))} placeholder="Processo" allLabel="Todos os processos" searchPlaceholder="Buscar processo" />
            <SearchSelect value={cliente} onChange={onCliente} options={clientes} placeholder="Cliente" allLabel="Todos os clientes" searchPlaceholder="Buscar cliente" />
            {isAdmin && escopo === 'equipe' && (
              <SearchSelect value={pessoa} onChange={onPessoa} options={pessoas} placeholder="Pessoa" allLabel="Toda a equipe" searchPlaceholder="Buscar pessoa" />
            )}
          </div>
        </div>

        <div className="overflow-x-auto -mx-1 px-1 pb-0.5">
          <Pilulas
            rotulo="Recorte"
            valor={recorte}
            aoMudar={onRecorte}
            opcoes={RECORTES.map(([k, label]) => ({
              valor: k,
              rotulo: (
                <>
                  {label}
                  <span className={cn('tabular', k === 'atrasadas' && contagem.atrasadas > 0 ? 'text-destructive-texto' : 'opacity-60')}>{contagem[k]}</span>
                </>
              ),
            }))}
          />
        </div>
      </div>

      {/* Cabeçalho das colunas (só na largura de tabela) */}
      <div className={cn('hidden px-6 py-2.5 bg-secondary/60 border-t border-border shrink-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground', GRADE)}>
        <span>Tarefa</span>
        <span>Etapa</span>
        <span className="hidden @4xl:block">Prioridade</span>
        <span>Responsável</span>
        <span className="text-right">Prazo</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {tarefas.length === 0 ? (
          <div className="py-16 text-center border-t border-border">
            <p className="t-secao text-foreground">Nada por aqui</p>
            <p className="t-rotulo text-muted-foreground mt-1">
              {recorte === 'abertas' && escopo === 'minhas' ? 'Você está sem tarefas abertas.' : 'Nenhuma tarefa neste filtro.'}
            </p>
          </div>
        ) : (
          grupos.map((g) => (
            <div key={g.chave}>
              <GrupoDaLista titulo={g.titulo} quantidade={g.itens.length} tom={g.tom} />
              {g.itens.map((t) => <CartaoTarefa key={t.id} t={t} ativo={t.id === selecionada} onClick={() => onSelecionar(t.id)} />)}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
