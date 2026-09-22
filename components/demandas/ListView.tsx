'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react'
import PortalMenu from '@/components/ui/PortalMenu'
import {
  STAGES, STAGE_BY_KEY, isLate, stageDeadline, currentActor, daysLeft, actionFor, shortDate,
  type ActionKind, type TaskStatus,
} from '@/lib/demandas-core'
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
    <div className="flex-1 min-h-0 flex flex-col px-4 sm:px-6 pb-4">
      <div className="flex-1 min-h-0 overflow-auto bg-white border border-gray-200 rounded-2xl">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="text-[11px] text-gray-500 sticky top-0 bg-white z-10">
            <tr className="border-b border-gray-100">
              <th className="text-left font-semibold px-4 py-3">Demanda</th>
              <th className="text-left font-semibold px-3 py-3">Responsável pela ação</th>
              <th className="text-left font-semibold px-3 py-3">Prazo</th>
              <th className="text-left font-semibold px-3 py-3">Situação</th>
              <th className="text-left font-semibold px-3 py-3 w-[150px]">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-xs text-gray-400">Nenhuma demanda aqui.</td></tr>
            )}
            {rows.map((t) => {
              const late = isLate(t)
              const stage = STAGE_BY_KEY[t.status]
              const prazo = stageDeadline(t)
              const left = daysLeft(prazo)
              const actor = currentActor(t)
              const acao = actionFor(t, userId)
              const titulo = t.title.replace(/^[^·]+· /, '')
              const sub = [t.client?.name?.split(' /')[0], t.contentType ?? t.platform].filter(Boolean).join(' · ')
              return (
                <tr key={t.id} className={`hover:bg-gray-50 ${t.status === 'CONCLUIDO' ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3 cursor-pointer" onClick={() => onOpen(t)}>
                    <p className="font-semibold text-gray-900 text-[13px] leading-snug line-clamp-1">{titulo}</p>
                    {sub && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{sub}</p>}
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-700 cursor-pointer" onClick={() => onOpen(t)}>
                    {actor ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-[#030A8C]/10 text-[#030A8C] text-[10px] font-bold inline-flex items-center justify-center">{actor.name.charAt(0)}</span>
                        {actor.name.split(' ')[0]}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-3 cursor-pointer" onClick={() => onOpen(t)}>
                    {t.status === 'CONCLUIDO' || !prazo ? (
                      <span className="text-xs text-gray-400">{t.dueDate ? shortDate(t.dueDate) : '—'}</span>
                    ) : left === 0 ? (
                      <>
                        <p className="text-xs font-semibold text-[#030A8C]">Hoje</p>
                        <p className="text-[11px] text-gray-400">{shortDate(prazo)}</p>
                      </>
                    ) : (
                      <>
                        <p className={`text-xs font-semibold ${late || (left != null && left < 0) ? 'text-gray-900' : 'text-gray-700'}`}>{shortDate(prazo)}</p>
                        {left != null && left < 0 && <p className="text-[11px] text-red-600 font-medium">{Math.abs(left)} dia{Math.abs(left) === 1 ? '' : 's'} de atraso</p>}
                      </>
                    )}
                  </td>
                  <td className="px-3 py-3 cursor-pointer" onClick={() => onOpen(t)}>
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${stage.bg} ${stage.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${stage.dot}`} />{stage.label}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onAction(t, acao.kind)}
                        className={`h-8 px-3 rounded-lg border text-xs font-semibold transition-colors ${
                          acao.kind === 'abrir' || acao.kind === 'ver'
                            ? 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                            : 'border-[#030A8C]/30 bg-white text-[#030A8C] hover:bg-[#030A8C] hover:text-white'
                        }`}
                      >
                        {acao.label}
                      </button>
                      <PortalMenu
                        ariaLabel="Mais ações"
                        width={200}
                        trigger={({ toggle, ref }) => (
                          <button ref={ref} type="button" onClick={toggle} aria-label="Mais ações" className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        )}
                      >
                        {(close) => (
                          <div className="py-1 text-xs">
                            <button type="button" onClick={() => { close(); onOpen(t) }} className="w-full text-left px-3 py-2 text-gray-700 hover:bg-gray-50">Abrir detalhe</button>
                            <button
                              type="button"
                              onClick={() => { close(); navigator.clipboard?.writeText(`${window.location.origin}/demandas?task=${t.id}`).catch(() => {}) }}
                              className="w-full text-left px-3 py-2 text-gray-700 hover:bg-gray-50"
                            >
                              Copiar link
                            </button>
                            {isAdmin && (
                              <>
                                <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400 border-t border-gray-100 mt-1">Mover para</p>
                                {STAGES.filter((s) => s.key !== t.status).map((s) => (
                                  <button key={s.key} type="button" onClick={() => { close(); onMove(t, s.key) }} className="w-full text-left px-3 py-1.5 text-gray-700 hover:bg-gray-50 inline-flex items-center gap-2">
                                    <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />{s.label}
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

      <div className="flex items-center justify-between pt-3 text-xs text-gray-500 shrink-0">
        <p>Exibindo {rows.length} de {tasks.length} demanda{tasks.length === 1 ? '' : 's'}</p>
        {pages > 1 && (
          <div className="inline-flex items-center gap-1">
            <button type="button" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} aria-label="Página anterior" className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white disabled:opacity-40 hover:border-gray-300"><ChevronLeft className="w-3.5 h-3.5" /></button>
            {Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 2).map((n, i, arr) => (
              <span key={n} className="inline-flex items-center">
                {i > 0 && arr[i - 1] !== n - 1 && <span className="px-1 text-gray-300">…</span>}
                <button type="button" onClick={() => setPage(n)} aria-current={n === page ? 'page' : undefined} className={`w-7 h-7 rounded-md text-xs font-semibold ${n === page ? 'bg-[#030A8C] text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{n}</button>
              </span>
            ))}
            <button type="button" onClick={() => setPage(Math.min(pages, page + 1))} disabled={page === pages} aria-label="Próxima página" className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white disabled:opacity-40 hover:border-gray-300"><ChevronRight className="w-3.5 h-3.5" /></button>
          </div>
        )}
      </div>
    </div>
  )
}
