'use client'

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
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-auto bg-white border border-gray-200 rounded-2xl">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="text-[11px] text-gray-500 sticky top-0 bg-white z-10">
            <tr className="border-b border-gray-100">
              <th className="text-left font-semibold px-4 py-3">{kind === 'salario' ? 'Colaborador' : 'Custo'}</th>
              <th className="text-left font-semibold px-3 py-3">{kind === 'salario' ? 'Função' : 'Categoria'}</th>
              <th className="text-left font-semibold px-3 py-3">Vencimento</th>
              <th className="text-right font-semibold px-3 py-3">Valor</th>
              <th className="text-left font-semibold px-3 py-3">Situação</th>
              <th className="text-left font-semibold px-3 py-3 w-[170px]">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {entries.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-xs text-gray-400">Nada lançado aqui neste mês.</td></tr>
            )}
            {entries.map((e) => {
              const sit = situationOf(e)
              const left = daysUntil(e.dueDate)
              const pagoLinha = e.status === 'PAGO'
              return (
                <>
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {kind === 'salario' && (
                          <span className="w-7 h-7 rounded-full bg-[#030A8C]/10 text-[#030A8C] text-[11px] font-bold inline-flex items-center justify-center shrink-0">
                            {(e.user?.name ?? '?').charAt(0)}
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 text-[13px] line-clamp-1">
                            {kind === 'salario' ? (e.user?.name ?? e.name ?? 'Colaborador') : (e.name || e.description)}
                          </p>
                          {e.recurring && (
                            <p className="text-[11px] text-[#030A8C] font-medium inline-flex items-center gap-1"><Repeat className="w-2.5 h-2.5" /> recorrente</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-600">{kind === 'salario' ? (e.user?.position ?? 'Colaborador') : e.category}</td>
                    <td className="px-3 py-3">
                      <p className="text-xs font-semibold text-gray-800">{e.dueDate ? shortDate(e.dueDate) : '—'}</p>
                      {!pagoLinha && left != null && left < 0 && <p className="text-[11px] text-red-600 font-medium">{Math.abs(left)} dia{Math.abs(left) === 1 ? '' : 's'} de atraso</p>}
                      {pagoLinha && e.paidAt && <p className="text-[11px] text-gray-400">pago em {formatDate(e.paidAt)}</p>}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-gray-900 text-[13px]">- {formatCurrency(e.amount)}</td>
                    <td className="px-3 py-3"><SituationBadge situation={sit} /></td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onTogglePaid(e)}
                          className={`h-8 px-3 rounded-lg border text-xs font-semibold transition-colors inline-flex items-center gap-1.5 ${
                            pagoLinha ? 'border-gray-200 bg-white text-gray-600 hover:border-gray-300' : 'border-[#030A8C]/30 bg-white text-[#030A8C] hover:bg-[#030A8C] hover:text-white'
                          }`}
                        >
                          {pagoLinha ? 'Reabrir' : <><Check className="w-3.5 h-3.5" /> Dar baixa</>}
                        </button>
                        <PortalMenu
                          ariaLabel="Mais ações"
                          width={210}
                          trigger={({ toggle, ref }) => (
                            <button ref={ref} type="button" onClick={toggle} aria-label="Mais ações" className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          )}
                        >
                          {(close) => (
                            <div className="py-1 text-xs">
                              <button type="button" onClick={() => { close(); onEdit(e) }} className="w-full text-left px-3 py-2 text-gray-700 hover:bg-gray-50 inline-flex items-center gap-2">
                                <Pencil className="w-3.5 h-3.5 text-gray-400" /> {kind === 'salario' ? 'Alterar valor' : 'Editar custo'}
                              </button>
                              <button type="button" onClick={() => { close(); onDelete(e) }} className="w-full text-left px-3 py-2 text-red-600 hover:bg-red-50 inline-flex items-center gap-2 border-t border-gray-100 mt-1">
                                <Trash2 className="w-3.5 h-3.5" /> {deleteLabel}
                              </button>
                            </div>
                          )}
                        </PortalMenu>
                      </div>
                    </td>
                  </tr>
                  {editingId === e.id && editor && (
                    <tr key={`${e.id}-edit`} className="bg-gray-50/60"><td colSpan={6} className="px-4 py-3">{editor}</td></tr>
                  )}
                </>
              )
            })}
          </tbody>
          {entries.length > 0 && (
            <tfoot className="sticky bottom-0 bg-white border-t border-gray-200">
              <tr className="text-[11px]">
                <td colSpan={3} className="px-4 py-2.5 font-semibold text-gray-500">Total visível</td>
                <td className="px-3 py-2.5 text-right font-bold text-red-700">- {formatCurrency(total)}</td>
                <td colSpan={2} className="px-3 py-2.5 text-gray-500">
                  <span className="text-green-700 font-semibold">{formatCurrency(pago)} pago</span>
                  {' · '}<span className="text-orange-700 font-semibold">{formatCurrency(total - pago)} pendente</span>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
