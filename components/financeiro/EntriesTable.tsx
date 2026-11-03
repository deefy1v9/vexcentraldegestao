'use client'

import { Fragment } from 'react'
import { Check, MoreHorizontal, Pencil, Repeat, Trash2 } from 'lucide-react'
import PortalMenu from '@/components/ui/PortalMenu'
import { formatCurrency, formatDate } from '@/lib/utils'
import { daysUntil, shortDate, situationOf, type EntryLike } from '@/lib/financeiro-core'
import { SituationBadge } from './FinanceToolbar'

/**
 * Tabela de custos e salários: mesma anatomia dos recebíveis, com o botão
 * de baixa na linha e editar/excluir no menu.
 */
export default function EntriesTable<T extends EntryLike>({
  entries, kind, onTogglePaid, onEdit, onDelete, deleteLabel, editingId, editor,
}: {
  entries: T[]
  kind: 'custo' | 'salario'
  onTogglePaid: (e: T) => void
  onEdit: (e: T) => void
  onDelete: (e: T) => void
  deleteLabel: string
  editingId?: string | null
  editor?: React.ReactNode
}) {
  const total = entries.reduce((s, e) => s + e.amount, 0)
  const pago = entries.filter((e) => e.status === 'PAGO').reduce((s, e) => s + e.amount, 0)

  return (
    <div className="flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground bg-secondary/60">
            <tr className="border-y border-border">
              <th className="text-left font-semibold px-6 py-3">{kind === 'salario' ? 'Colaborador' : 'Custo'}</th>
              <th className="text-left font-semibold px-3 py-3">{kind === 'salario' ? 'Função' : 'Categoria'}</th>
              <th className="text-left font-semibold px-3 py-3">Vencimento</th>
              <th className="text-right font-semibold px-3 py-3">Valor</th>
              <th className="text-left font-semibold px-3 py-3">Situação</th>
              <th className="text-left font-semibold px-3 py-3 w-[170px]">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entries.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-14 text-center t-legenda">Nada lançado aqui neste mês.</td></tr>
            )}
            {entries.map((e) => {
              const sit = situationOf(e)
              const left = daysUntil(e.dueDate)
              const pagoLinha = e.status === 'PAGO'
              return (
                <Fragment key={e.id}>
                  <tr className="hover:bg-secondary/40 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {kind === 'salario' && (
                          <span className="w-8 h-8 rounded-full bg-marca-suave text-marca-texto text-[12px] font-semibold inline-flex items-center justify-center shrink-0">
                            {(e.user?.name ?? '?').charAt(0)}
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground text-[13.5px] line-clamp-1">
                            {kind === 'salario' ? (e.user?.name ?? e.name ?? 'Colaborador') : (e.name || e.description)}
                          </p>
                          {e.recurring && (
                            <p className="text-[11.5px] text-marca-texto font-medium inline-flex items-center gap-1"><Repeat className="w-3 h-3" /> recorrente</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4 text-[13px] text-muted-foreground">{kind === 'salario' ? (e.user?.position ?? 'Colaborador') : e.category}</td>
                    <td className="px-3 py-4">
                      <p className="text-[13px] font-medium text-foreground tabular-nums">{e.dueDate ? shortDate(e.dueDate) : '—'}</p>
                      {!pagoLinha && left != null && left < 0 && <p className="text-[11.5px] text-destructive-texto font-medium">{Math.abs(left)} dia{Math.abs(left) === 1 ? '' : 's'} de atraso</p>}
                      {pagoLinha && e.paidAt && <p className="t-legenda">pago em {formatDate(e.paidAt)}</p>}
                    </td>
                    <td className="px-3 py-4 text-right font-display font-semibold text-foreground text-[14px] tabular-nums whitespace-nowrap">- {formatCurrency(e.amount)}</td>
                    <td className="px-3 py-4"><SituationBadge situation={sit} /></td>
                    <td className="px-3 py-4">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onTogglePaid(e)}
                          className={`h-8 px-3 rounded-lg border text-[12.5px] font-semibold transition-colors inline-flex items-center gap-1.5 ${
                            pagoLinha ? 'border-transparent bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground' : 'border-border bg-card text-foreground hover:border-success/40 hover:bg-success-suave hover:text-success'
                          }`}
                        >
                          {pagoLinha ? 'Reabrir' : <><Check className="w-3.5 h-3.5" /> Dar baixa</>}
                        </button>
                        <PortalMenu
                          ariaLabel="Mais ações"
                          width={210}
                          trigger={({ toggle, ref }) => (
                            <button ref={ref} type="button" onClick={toggle} aria-label="Mais ações" className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground">
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          )}
                        >
                          {(close) => (
                            <div className="py-1 text-xs">
                              <button type="button" onClick={() => { close(); onEdit(e) }} className="w-full text-left px-3 py-2 text-foreground hover:bg-secondary/70 inline-flex items-center gap-2">
                                <Pencil className="w-3.5 h-3.5 text-muted-foreground" /> {kind === 'salario' ? 'Alterar valor' : 'Editar custo'}
                              </button>
                              <button type="button" onClick={() => { close(); onDelete(e) }} className="w-full text-left px-3 py-2 text-destructive-texto hover:bg-destructive-suave inline-flex items-center gap-2 border-t border-border mt-1">
                                <Trash2 className="w-3.5 h-3.5" /> {deleteLabel}
                              </button>
                            </div>
                          )}
                        </PortalMenu>
                      </div>
                    </td>
                  </tr>
                  {editingId === e.id && editor && (
                    <tr className="bg-secondary/40"><td colSpan={6} className="px-6 py-3.5">{editor}</td></tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
          {entries.length > 0 && (
            <tfoot className="bg-secondary/40 border-t border-border">
              <tr className="text-[12px]">
                <td colSpan={3} className="px-6 py-3 font-semibold uppercase tracking-[0.08em] text-[11px] text-muted-foreground">Total visível</td>
                <td className="px-3 py-3 text-right font-display font-semibold text-destructive-texto text-[14px] tabular-nums">- {formatCurrency(total)}</td>
                <td colSpan={2} className="px-3 py-3 text-muted-foreground">
                  <span className="text-success font-semibold">{formatCurrency(pago)} pago</span>
                  {' · '}<span className="text-warning font-semibold">{formatCurrency(total - pago)} pendente</span>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
