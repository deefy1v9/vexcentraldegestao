'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react'
import PortalMenu from '@/components/ui/PortalMenu'
import {
  STAGES, isLate, stageDeadline, currentActor, daysLeft, actionFor, shortDate,
  type ActionKind, type TaskStatus,
} from '@/lib/demandas-core'
import { cn } from '@/lib/utils'
import { AvatarPessoa, PilulaEtapa, aguardandoAprovacao, pontoDoStatus } from './visual'
import type { Task } from './types'

const PAGE = 10

/**
 * Lista de demandas no padrão do modelo: uma linha por demanda com quem
 * age, prazo da etapa, situação e o botão da ação. Paginada.
 */
export default function ListView({
  tasks, userId, isAdmin, onOpen, onAction, onMove,
}: {
  tasks: Task[]
  userId: string
  isAdmin: boolean
  onOpen: (t: Task) => void
  onAction: (t: Task, kind: ActionKind) => void
  onMove: (t: Task, status: TaskStatus) => void
}) {
  const [pageState, setPage] = useState(1)
  const pages = Math.max(1, Math.ceil(tasks.length / PAGE))
  const page = Math.min(pageState, pages)
  const rows = tasks.slice((page - 1) * PAGE, page * PAGE)

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-auto bg-card border border-border rounded-[24px] shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="bg-secondary/60 border-b border-border text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              <th className="text-left font-semibold px-6 py-3">Demanda</th>
              <th className="text-left font-semibold px-3 py-3">Responsável pela ação</th>
              <th className="text-left font-semibold px-3 py-3">Prazo</th>
              <th className="text-left font-semibold px-3 py-3">Situação</th>
              <th className="text-left font-semibold px-3 pr-6 py-3 w-px">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-6 py-14 text-center text-[13px] text-muted-foreground">Nenhuma demanda aqui.</td></tr>
            )}
            {rows.map((t) => {
              const late = isLate(t)
              const prazo = stageDeadline(t)
              const left = daysLeft(prazo)
              const actor = currentActor(t)
              const acao = actionFor(t, userId)
              const titulo = t.title.replace(/^[^·]+· /, '')
              const sub = [t.client?.name?.split(' /')[0], t.contentType ?? t.platform].filter(Boolean).join(' · ')
              return (
                <tr key={t.id} className={cn('hover:bg-secondary/50 transition-colors', t.status === 'CONCLUIDO' && 'opacity-60')}>
                  <td className="px-6 py-3.5 cursor-pointer" onClick={() => onOpen(t)}>
                    <p className="font-medium text-foreground text-[13.5px] leading-snug line-clamp-1">{titulo}</p>
                    {sub && <p className="t-legenda mt-0.5 truncate">{sub}</p>}
                  </td>
                  <td className="px-3 py-3.5 cursor-pointer" onClick={() => onOpen(t)}>
                    {actor ? (
                      <span className="inline-flex items-center gap-2 text-[13px] text-foreground">
                        <AvatarPessoa nome={actor.name} tamanho="xs" />
                        {actor.name.split(' ')[0]}
                      </span>
                    ) : <span className="text-subtle">—</span>}
                  </td>
                  <td className="px-3 py-3.5 cursor-pointer tabular whitespace-nowrap" onClick={() => onOpen(t)}>
                    {t.status === 'CONCLUIDO' || !prazo ? (
                      <span className="text-[12.5px] text-muted-foreground">{t.dueDate ? shortDate(t.dueDate) : '—'}</span>
                    ) : left === 0 ? (
                      <>
                        <p className="text-[12.5px] font-semibold text-success">Hoje</p>
                        <p className="t-legenda">{shortDate(prazo)}</p>
                      </>
                    ) : (
                      <>
                        <p className={cn('text-[12.5px]', late || (left != null && left < 0) ? 'font-semibold text-destructive-texto' : 'text-foreground')}>{shortDate(prazo)}</p>
                        {left != null && left < 0 && <p className="text-[11.5px] text-destructive-texto">{Math.abs(left)} dia{Math.abs(left) === 1 ? '' : 's'} de atraso</p>}
                      </>
                    )}
                  </td>
                  <td className="px-3 py-3.5 cursor-pointer" onClick={() => onOpen(t)}>
                    <PilulaEtapa status={t.status} aguardando={aguardandoAprovacao(t)} />
                  </td>
                  <td className="px-3 pr-6 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onAction(t, acao.kind)}
                        className={`h-8 px-3 rounded-lg border text-xs font-semibold transition-colors ${
                          acao.kind === 'abrir' || acao.kind === 'ver'
                            ? 'border-border bg-card text-muted-foreground hover:text-foreground hover:border-subtle/60'
                            : 'border-primary/30 bg-card text-primary hover:bg-primary hover:text-primary-foreground'
                        }`}
                      >
                        {acao.label}
                      </button>
                      <PortalMenu
                        ariaLabel="Mais ações"
                        width={200}
                        trigger={({ toggle, ref }) => (
                          <button ref={ref} type="button" onClick={toggle} aria-label="Mais ações" className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground">
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        )}
                      >
                        {(close) => (
                          <div className="py-1 text-xs">
                            <button type="button" onClick={() => { close(); onOpen(t) }} className="w-full text-left px-3 py-2 text-foreground hover:bg-secondary">Abrir detalhe</button>
                            <button
                              type="button"
                              onClick={() => { close(); navigator.clipboard?.writeText(`${window.location.origin}/demandas/${t.id}`).catch(() => {}) }}
                              className="w-full text-left px-3 py-2 text-foreground hover:bg-secondary"
                            >
                              Copiar link
                            </button>
                            {isAdmin && (
                              <>
                                <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground border-t border-border mt-1">Mover para</p>
                                {STAGES.filter((s) => s.key !== t.status).map((s) => (
                                  <button key={s.key} type="button" onClick={() => { close(); onMove(t, s.key) }} className="w-full text-left px-3 py-1.5 text-foreground hover:bg-secondary inline-flex items-center gap-2">
                                    <span className={cn('w-1.5 h-1.5 rounded-full', pontoDoStatus(s.key))} />{s.label}
                                  </button>
                                ))}
                              </>
                            )}
                          </div>
                        )}
                      </PortalMenu>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between pt-3 text-[12.5px] text-muted-foreground shrink-0">
        <p>Exibindo {rows.length} de {tasks.length} demanda{tasks.length === 1 ? '' : 's'}</p>
        {pages > 1 && (
          <div className="inline-flex items-center gap-1">
            <button type="button" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} aria-label="Página anterior" className="w-7 h-7 inline-flex items-center justify-center rounded-lg border border-border bg-card disabled:opacity-40 hover:border-subtle/60"><ChevronLeft className="w-3.5 h-3.5" /></button>
            {Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 2).map((n, i, arr) => (
              <span key={n} className="inline-flex items-center">
                {i > 0 && arr[i - 1] !== n - 1 && <span className="px-1 text-subtle">…</span>}
                <button type="button" onClick={() => setPage(n)} aria-current={n === page ? 'page' : undefined} className={`w-7 h-7 rounded-lg text-xs font-semibold ${n === page ? 'bg-marca text-white' : 'text-muted-foreground hover:bg-secondary'}`}>{n}</button>
              </span>
            ))}
            <button type="button" onClick={() => setPage(Math.min(pages, page + 1))} disabled={page === pages} aria-label="Próxima página" className="w-7 h-7 inline-flex items-center justify-center rounded-lg border border-border bg-card disabled:opacity-40 hover:border-subtle/60"><ChevronRight className="w-3.5 h-3.5" /></button>
          </div>
        )}
      </div>
    </div>
  )
}
