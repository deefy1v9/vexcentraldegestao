'use client'

import { Search } from 'lucide-react'
import SearchSelect from '@/components/ui/SearchSelect'
import { Badge } from '@/components/vex/badge'
import { prazoAtual } from '@/lib/processos'
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

function iniciais(nome?: string | null) {
  if (!nome) return '?'
  const p = nome.trim().split(/\s+/)
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase()
}

export function Avatar({ nome, size = 'sm' }: { nome?: string | null; size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'w-9 h-9 text-xs' : 'w-6 h-6 text-[10px]'
  return (
    <span title={nome ?? 'Sem responsável'} className={`${cls} shrink-0 rounded-full inline-flex items-center justify-center font-semibold bg-secondary text-foreground`}>
      {iniciais(nome)}
    </span>
  )
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

export function CartaoTarefa({ t, ativo, onClick }: { t: Task; ativo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={ativo}
      className={`w-full text-left rounded-[12px] border bg-card p-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
        ativo ? 'border-marca bg-marca-suave' : 'border-border hover:border-subtle/60'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="t-rotulo text-muted-foreground truncate flex items-center gap-1.5 min-w-0">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: t.process?.color ?? 'var(--subtle)' }} />
          <span className="truncate">{t.process?.name ?? 'Sem processo'}</span>
        </p>
        <SeloPrazo t={t} />
      </div>
      <p className="mt-1.5 text-[13.5px] leading-snug font-semibold text-foreground line-clamp-2">
        {t.title} <span className="font-normal text-muted-foreground">#{t.number}</span>
      </p>
      <div className="mt-2 flex items-center gap-2">
        <Badge variant="default" className="shrink-0">{t.status === 'CONCLUIDO' ? 'Concluída' : (t.stage?.name ?? '—')}</Badge>
        <span className="t-rotulo text-muted-foreground truncate flex-1">{t.client?.name ?? 'Sem cliente'}</span>
        {!t.assignee && t.team
          ? <Badge variant="warning" className="shrink-0">Fila · {t.team.name}</Badge>
          : <Avatar nome={t.assignee?.name} />}
      </div>
    </button>
  )
}

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
  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="p-3 space-y-2.5 border-b border-border shrink-0">
        <div className="flex items-center justify-between gap-2">
          <h2 className="t-secao text-foreground">
            {escopo === 'minhas' ? 'Minhas tarefas' : 'Tarefas da equipe'}
            <span className="ml-1.5 font-medium text-muted-foreground">{total}</span>
          </h2>
          {isAdmin && (
            <div className="inline-flex rounded-lg bg-secondary p-0.5" role="group" aria-label="De quem">
              {([['minhas', 'Minhas'], ['equipe', 'Equipe']] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => onEscopo(k)}
                  aria-pressed={escopo === k}
                  className={`h-7 px-3 rounded-md t-rotulo transition-colors ${escopo === k ? 'bg-card text-foreground shadow-[0_0_0_1px_var(--border)]' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="relative block">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => onBusca(e.target.value)}
            placeholder="Buscar por título, cliente ou número"
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-card t-corpo text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </label>

        <div className="flex gap-1.5 overflow-x-auto pb-0.5" role="tablist" aria-label="Recorte">
          {RECORTES.map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={recorte === k}
              onClick={() => onRecorte(k)}
              className={`shrink-0 h-7 px-2.5 rounded-md t-rotulo border transition-colors ${
                recorte === k ? 'bg-marca-suave text-marca-texto border-marca/30' : 'bg-card text-muted-foreground border-border hover:text-foreground'
              }`}
            >
              {label}
              <span className={`ml-1 ${k === 'atrasadas' && contagem.atrasadas > 0 ? 'text-destructive-texto font-semibold' : 'opacity-70'}`}>{contagem[k]}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <SearchSelect value={processo} onChange={onProcesso} options={processos.map((p) => ({ id: p.id, name: p.name }))} placeholder="Processo" allLabel="Todos os processos" searchPlaceholder="Buscar processo" />
          <SearchSelect value={cliente} onChange={onCliente} options={clientes} placeholder="Cliente" allLabel="Todos os clientes" searchPlaceholder="Buscar cliente" />
          {isAdmin && escopo === 'equipe' && (
            <SearchSelect value={pessoa} onChange={onPessoa} options={pessoas} placeholder="Pessoa" allLabel="Toda a equipe" searchPlaceholder="Buscar pessoa" />
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2 bg-background">
        {tarefas.length === 0 ? (
          <div className="py-16 text-center">
            <p className="t-secao text-foreground">Nada por aqui</p>
            <p className="t-rotulo text-muted-foreground mt-1">
              {recorte === 'abertas' && escopo === 'minhas' ? 'Você está sem tarefas abertas.' : 'Nenhuma tarefa neste filtro.'}
            </p>
          </div>
        ) : (
          tarefas.map((t) => <CartaoTarefa key={t.id} t={t} ativo={t.id === selecionada} onClick={() => onSelecionar(t.id)} />)
        )}
      </div>
    </div>
  )
}
