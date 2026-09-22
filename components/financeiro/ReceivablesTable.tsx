'use client'

import { useState } from 'react'
import { Ban, CalendarDays, Check, ChevronDown, MoreHorizontal, Send } from 'lucide-react'
import PortalMenu from '@/components/ui/PortalMenu'
import TierBadge from '@/components/ui/TierBadge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { daysUntil, shortDate, totalsBySituation, type ReceivableRow } from '@/lib/financeiro-core'
import { SituationBadge } from './FinanceToolbar'

const ASAAS_STATUS_PT: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Aguardando pagamento', cls: 'bg-orange-100 text-orange-700' },
  CONFIRMED: { label: 'Confirmado', cls: 'bg-blue-100 text-blue-700' },
  RECEIVED: { label: 'Recebido', cls: 'bg-green-100 text-green-700' },
  OVERDUE: { label: 'Vencido', cls: 'bg-red-100 text-red-700' },
  REFUNDED: { label: 'Estornado', cls: 'bg-purple-100 text-purple-700' },
  PARTIALLY_REFUNDED: { label: 'Estorno parcial', cls: 'bg-purple-100 text-purple-700' },
  CANCELLED: { label: 'Cancelado', cls: 'bg-gray-100 text-gray-600' },
  DELETED: { label: 'Cancelado', cls: 'bg-gray-100 text-gray-600' },
  ERROR: { label: 'Erro na cobrança', cls: 'bg-red-100 text-red-700' },
}

const NFSE_STATUS_PT: Record<string, { label: string; cls: string }> = {
  PROCESSANDO: { label: 'Processando NFS-e', cls: 'bg-blue-50 text-[#030A8C]' },
  AUTORIZADO: { label: 'NFS-e autorizada', cls: 'bg-green-100 text-green-700' },
  ERRO_AUTORIZACAO: { label: 'Erro na NFS-e', cls: 'bg-red-100 text-red-700' },
  CANCELADO: { label: 'NFS-e cancelada', cls: 'bg-gray-100 text-gray-600' },
  ERRO_CANCELAMENTO: { label: 'Erro no cancelamento', cls: 'bg-red-100 text-red-700' },
}

export interface ReceivableActions {
  onTogglePaid: (row: ReceivableRow) => void
  onChangeDue: (row: ReceivableRow) => void
  onCancel: (row: ReceivableRow) => void
  onResend: (row: ReceivableRow) => void
  onGenerateCharge: (clientId: string) => void
  onSyncCharge: (chargeId: string) => void
  onNfse: (chargeId: string, action: string) => void
  busyKey: string | null
  fiscalReady: boolean
  fiscalMissing: string[]
}

/**
 * Tabela de recebíveis: uma linha por parcela, com o botão da ação (dar
 * baixa / cobrar) e os detalhes de Asaas e NFS-e ao expandir.
 */
export default function ReceivablesTable({ rows, actions }: { rows: ReceivableRow[]; actions: ReceivableActions }) {
  const [open, setOpen] = useState<string | null>(null)
  const totals = totalsBySituation(rows)

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-auto bg-white border border-gray-200 rounded-2xl">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="text-[11px] text-gray-500 sticky top-0 bg-white z-10">
            <tr className="border-b border-gray-100">
              <th className="text-left font-semibold px-4 py-3">Cliente</th>
              <th className="text-left font-semibold px-3 py-3">Serviço</th>
              <th className="text-left font-semibold px-3 py-3">Vencimento</th>
              <th className="text-right font-semibold px-3 py-3">Valor</th>
              <th className="text-left font-semibold px-3 py-3">Situação</th>
              <th className="text-left font-semibold px-3 py-3 w-[170px]">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-xs text-gray-400">Nenhum recebível aqui.</td></tr>
            )}
            {rows.map((r) => {
              const left = daysUntil(r.dueDate)
              const charge = r.charge
              const st = charge ? (ASAAS_STATUS_PT[charge.status] ?? { label: charge.status, cls: 'bg-gray-100 text-gray-600' }) : null
              const nf = charge?.nfse ? (NFSE_STATUS_PT[charge.nfse.status] ?? { label: charge.nfse.status, cls: 'bg-gray-100 text-gray-600' }) : null
              const aberto = open === r.id
              const busy = actions.busyKey != null && (actions.busyKey.endsWith(charge?.id ?? '') || actions.busyKey.endsWith(r.client.id))
              const pago = r.situation === 'pago'
              return (
                <>
                  <tr key={r.id} className={`hover:bg-gray-50 ${r.situation === 'cancelado' ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 cursor-pointer" onClick={() => setOpen(aberto ? null : r.id)}>
                      <p className="font-semibold text-gray-900 text-[13px] inline-flex items-center gap-2">
                        {r.client.name.split(' /')[0]}
                        <TierBadge tier={r.client.tier} />
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5 inline-flex items-center gap-1">
                        <ChevronDown className={`w-3 h-3 transition-transform ${aberto ? 'rotate-180' : ''}`} />
                        {charge ? 'cobrança Asaas' : 'sem cobrança'}
                        {r.paidAt ? ` · pago em ${formatDate(r.paidAt)}` : ''}
                      </p>
                    </td>
                    <td className="px-3 py-3 cursor-pointer" onClick={() => setOpen(aberto ? null : r.id)}>
                      <p className="text-[13px] text-gray-800 line-clamp-1">{r.label}</p>
                      <p className={`text-[11px] font-semibold ${r.kind === 'AVULSO' ? 'text-purple-600' : r.kind === 'ASAAS' ? 'text-gray-400' : 'text-[#030A8C]'}`}>
                        {r.kind === 'AVULSO' ? 'Avulso' : r.kind === 'ASAAS' ? 'Só Asaas' : 'Recorrente'}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-xs font-semibold text-gray-800">{shortDate(r.dueDate)}</p>
                      {!pago && left != null && left < 0 && <p className="text-[11px] text-red-600 font-medium">{Math.abs(left)} dia{Math.abs(left) === 1 ? '' : 's'} de atraso</p>}
                      {!pago && left === 0 && <p className="text-[11px] text-[#030A8C] font-medium">vence hoje</p>}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-gray-900 text-[13px]">{formatCurrency(r.amount)}</td>
                    <td className="px-3 py-3"><SituationBadge situation={r.situation} /></td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        {r.payment ? (
                          <button
                            type="button"
                            onClick={() => actions.onTogglePaid(r)}
                            title={charge ? 'Cobrança Asaas: o status muda pelo webhook; use só para ajuste manual' : undefined}
                            className={`h-8 px-3 rounded-lg border text-xs font-semibold transition-colors inline-flex items-center gap-1.5 ${
                              pago ? 'border-gray-200 bg-white text-gray-600 hover:border-gray-300' : 'border-[#030A8C]/30 bg-white text-[#030A8C] hover:bg-[#030A8C] hover:text-white'
                            }`}
                          >
                            {pago ? 'Reabrir' : <><Check className="w-3.5 h-3.5" /> Dar baixa</>}
                          </button>
                        ) : (
                          <span className="text-[11px] text-gray-400">via Asaas</span>
                        )}
                        <PortalMenu
                          ariaLabel="Mais ações"
                          width={230}
                          trigger={({ toggle, ref }) => (
                            <button ref={ref} type="button" onClick={toggle} aria-label="Mais ações" className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          )}
                        >
                          {(close) => (
                            <div className="py-1 text-xs">
                              <button type="button" onClick={() => { close(); setOpen(r.id) }} className="w-full text-left px-3 py-2 text-gray-700 hover:bg-gray-50">Ver cobrança e NFS-e</button>
                              {r.payment && !pago && (
                                <>
                                  <button type="button" onClick={() => { close(); actions.onChangeDue(r) }} className="w-full text-left px-3 py-2 text-gray-700 hover:bg-gray-50 inline-flex items-center gap-2">
                                    <CalendarDays className="w-3.5 h-3.5 text-gray-400" /> Alterar vencimento
                                  </button>
                                  <button type="button" onClick={() => { close(); actions.onResend(r) }} className="w-full text-left px-3 py-2 text-gray-700 hover:bg-gray-50 inline-flex items-center gap-2">
                                    <Send className="w-3.5 h-3.5 text-gray-400" /> Reenviar fatura por e-mail
                                  </button>
                                  <button type="button" onClick={() => { close(); actions.onCancel(r) }} className="w-full text-left px-3 py-2 text-red-600 hover:bg-red-50 inline-flex items-center gap-2 border-t border-gray-100 mt-1">
                                    <Ban className="w-3.5 h-3.5" /> Cancelar parcela
                                  </button>
                                </>
                              )}
                              {!charge && (
                                <button type="button" onClick={() => { close(); actions.onGenerateCharge(r.client.id) }} className="w-full text-left px-3 py-2 text-[#030A8C] font-semibold hover:bg-gray-50 border-t border-gray-100 mt-1">
                                  Gerar cobrança no Asaas
                                </button>
                              )}
                            </div>
                          )}
                        </PortalMenu>
                      </div>
                    </td>
                  </tr>

                  {aberto && (
                    <tr key={`${r.id}-det`} className="bg-gray-50/60">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {!charge ? (
                            <button
                              type="button"
                              onClick={() => actions.onGenerateCharge(r.client.id)}
                              disabled={busy}
                              className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-[#030A8C] text-white hover:bg-[#02077a] disabled:opacity-50"
                            >
                              {busy ? 'Gerando…' : 'Gerar cobrança Asaas'}
                            </button>
                          ) : (
                            <>
                              {st && <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>}
                              {nf && <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${nf.cls}`}>{nf.label}</span>}
                              {charge.invoiceUrl && <a href={charge.invoiceUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#030A8C] hover:underline font-medium">Fatura</a>}
                              {charge.bankSlipUrl && <a href={charge.bankSlipUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#030A8C] hover:underline font-medium">Boleto</a>}
                              {charge.identificationField && (
                                <button type="button" onClick={() => navigator.clipboard?.writeText(charge.identificationField!)} className="text-[11px] text-gray-500 hover:text-[#030A8C] font-medium">
                                  Copiar linha digitável
                                </button>
                              )}
                              <button type="button" onClick={() => actions.onSyncCharge(charge.id)} disabled={busy} className="text-[11px] text-gray-500 hover:text-[#030A8C] font-medium disabled:opacity-50">Sincronizar</button>
                              {!charge.nfse && ['CONFIRMED', 'RECEIVED'].includes(charge.status) && (
                                <button
                                  type="button"
                                  onClick={() => actions.onNfse(charge.id, 'emit')}
                                  disabled={busy || !actions.fiscalReady}
                                  title={!actions.fiscalReady ? `Configuração fiscal incompleta: ${actions.fiscalMissing.join(', ')}` : undefined}
                                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Emitir NFS-e
                                </button>
                              )}
                              {charge.nfse && (
                                <>
                                  <button type="button" onClick={() => actions.onNfse(charge.id, 'consult')} disabled={busy} className="text-[11px] text-gray-500 hover:text-[#030A8C] font-medium disabled:opacity-50">Consultar NFS-e</button>
                                  {charge.nfse.pdfUrl && <a href={charge.nfse.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#030A8C] hover:underline font-medium">PDF</a>}
                                  {charge.nfse.xmlUrl && <a href={charge.nfse.xmlUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#030A8C] hover:underline font-medium">XML</a>}
                                  {charge.nfse.status === 'AUTORIZADO' && (
                                    <button type="button" onClick={() => actions.onNfse(charge.id, 'email')} disabled={busy} className="text-[11px] text-gray-500 hover:text-[#030A8C] font-medium disabled:opacity-50">Reenviar por e-mail</button>
                                  )}
                                  {charge.nfse.status === 'ERRO_AUTORIZACAO' && (
                                    <button type="button" onClick={() => actions.onNfse(charge.id, 'emit')} disabled={busy || !actions.fiscalReady} className="text-[11px] font-semibold text-red-600 hover:underline disabled:opacity-50">Tentar novamente</button>
                                  )}
                                </>
                              )}
                              {(charge.lastError || charge.nfse?.lastError || charge.nfse?.municipalMessage) && (
                                <button type="button" onClick={() => alert(charge.lastError || charge.nfse?.lastError || charge.nfse?.municipalMessage || '')} className="text-[11px] text-red-600 hover:underline font-medium">Ver erro</button>
                              )}
                              {charge.status === 'ERROR' && (
                                <button type="button" onClick={() => actions.onGenerateCharge(r.client.id)} disabled={busy} className="text-[11px] font-semibold text-red-600 hover:underline disabled:opacity-50">Gerar de novo</button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="sticky bottom-0 bg-white border-t border-gray-200">
              <tr className="text-[11px]">
                <td colSpan={3} className="px-4 py-2.5 font-semibold text-gray-500">Total visível</td>
                <td className="px-3 py-2.5 text-right font-bold text-gray-900">{formatCurrency(rows.reduce((s, r) => s + r.amount, 0))}</td>
                <td colSpan={2} className="px-3 py-2.5 text-gray-500">
                  <span className="text-green-700 font-semibold">{formatCurrency(totals.pago)} pago</span>
                  {' · '}<span className="text-orange-700 font-semibold">{formatCurrency(totals.pendente)} pendente</span>
                  {totals.atrasado > 0 && <> · <span className="text-red-700 font-semibold">{formatCurrency(totals.atrasado)} atrasado</span></>}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
