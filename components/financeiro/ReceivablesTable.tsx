'use client'

import { Fragment, useState } from 'react'
import { Ban, CalendarDays, Check, ChevronDown, MoreHorizontal, Send } from 'lucide-react'
import PortalMenu from '@/components/ui/PortalMenu'
import TierBadge from '@/components/ui/TierBadge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { daysUntil, shortDate, totalsBySituation, type ReceivableRow } from '@/lib/financeiro-core'
import { SituationBadge } from './FinanceToolbar'

const ASAAS_STATUS_PT: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Aguardando pagamento', cls: 'bg-warning-suave text-warning' },
  CONFIRMED: { label: 'Confirmado', cls: 'bg-info-suave text-info' },
  RECEIVED: { label: 'Recebido', cls: 'bg-success-suave text-success' },
  OVERDUE: { label: 'Vencido', cls: 'bg-destructive-suave text-destructive-texto' },
  REFUNDED: { label: 'Estornado', cls: 'bg-secondary text-foreground' },
  PARTIALLY_REFUNDED: { label: 'Estorno parcial', cls: 'bg-secondary text-foreground' },
  CANCELLED: { label: 'Cancelado', cls: 'bg-secondary text-muted-foreground' },
  DELETED: { label: 'Cancelado', cls: 'bg-secondary text-muted-foreground' },
  ERROR: { label: 'Erro na cobrança', cls: 'bg-destructive-suave text-destructive-texto' },
}

const NFSE_STATUS_PT: Record<string, { label: string; cls: string }> = {
  PROCESSANDO: { label: 'Processando NFS-e', cls: 'bg-info-suave text-info' },
  AUTORIZADO: { label: 'NFS-e autorizada', cls: 'bg-success-suave text-success' },
  ERRO_AUTORIZACAO: { label: 'Erro na NFS-e', cls: 'bg-destructive-suave text-destructive-texto' },
  CANCELADO: { label: 'NFS-e cancelada', cls: 'bg-secondary text-muted-foreground' },
  ERRO_CANCELAMENTO: { label: 'Erro no cancelamento', cls: 'bg-destructive-suave text-destructive-texto' },
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
    <div className="flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground bg-secondary/60">
            <tr className="border-y border-border">
              <th className="text-left font-semibold px-6 py-3">Cliente</th>
              <th className="text-left font-semibold px-3 py-3">Serviço</th>
              <th className="text-left font-semibold px-3 py-3">Vencimento</th>
              <th className="text-right font-semibold px-3 py-3">Valor</th>
              <th className="text-left font-semibold px-3 py-3">Situação</th>
              <th className="text-left font-semibold px-3 py-3 w-[170px]">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-14 text-center t-legenda">Nenhum recebível aqui.</td></tr>
            )}
            {rows.map((r) => {
              const left = daysUntil(r.dueDate)
              const charge = r.charge
              const st = charge ? (ASAAS_STATUS_PT[charge.status] ?? { label: charge.status, cls: 'bg-secondary text-muted-foreground' }) : null
              const nf = charge?.nfse ? (NFSE_STATUS_PT[charge.nfse.status] ?? { label: charge.nfse.status, cls: 'bg-secondary text-muted-foreground' }) : null
              const aberto = open === r.id
              const busy = actions.busyKey != null && (actions.busyKey.endsWith(charge?.id ?? '') || actions.busyKey.endsWith(r.client.id))
              const pago = r.situation === 'pago'
              return (
                <Fragment key={r.id}>
                  <tr className={`hover:bg-secondary/40 transition-colors ${r.situation === 'cancelado' ? 'opacity-60' : ''}`}>
                    <td className="px-6 py-4 cursor-pointer" onClick={() => setOpen(aberto ? null : r.id)}>
                      <p className="font-semibold text-foreground text-[13.5px] inline-flex items-center gap-2">
                        {r.client.name.split(' /')[0]}
                        <TierBadge tier={r.client.tier} />
                      </p>
                      <p className="t-legenda mt-0.5 inline-flex items-center gap-1">
                        <ChevronDown className={`w-3 h-3 transition-transform ${aberto ? 'rotate-180' : ''}`} />
                        {charge ? 'cobrança Asaas' : 'sem cobrança'}
                        {r.paidAt ? ` · pago em ${formatDate(r.paidAt)}` : ''}
                      </p>
                    </td>
                    <td className="px-3 py-4 cursor-pointer" onClick={() => setOpen(aberto ? null : r.id)}>
                      <p className="text-[13px] text-foreground line-clamp-1">{r.label}</p>
                      <p className={`text-[11px] font-semibold ${r.kind === 'AVULSO' ? 'text-foreground' : r.kind === 'ASAAS' ? 'text-muted-foreground' : 'text-marca-texto'}`}>
                        {r.kind === 'AVULSO' ? 'Avulso' : r.kind === 'ASAAS' ? 'Só Asaas' : 'Recorrente'}
                      </p>
                    </td>
                    <td className="px-3 py-4">
                      <p className="text-[13px] font-medium text-foreground tabular-nums">{shortDate(r.dueDate)}</p>
                      {!pago && left != null && left < 0 && <p className="text-[11.5px] text-destructive-texto font-medium">{Math.abs(left)} dia{Math.abs(left) === 1 ? '' : 's'} de atraso</p>}
                      {!pago && left === 0 && <p className="text-[11.5px] text-warning font-medium">vence hoje</p>}
                    </td>
                    <td className="px-3 py-4 text-right font-display font-semibold text-foreground text-[14px] tabular-nums whitespace-nowrap">{formatCurrency(r.amount)}</td>
                    <td className="px-3 py-4"><SituationBadge situation={r.situation} /></td>
                    <td className="px-3 py-4">
                      <div className="flex items-center gap-1.5">
                        {r.payment ? (
                          <button
                            type="button"
                            onClick={() => actions.onTogglePaid(r)}
                            title={charge ? 'Cobrança Asaas: o status muda pelo webhook; use só para ajuste manual' : undefined}
                            className={`h-8 px-3 rounded-lg border text-[12.5px] font-semibold transition-colors inline-flex items-center gap-1.5 ${
                              pago ? 'border-transparent bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground' : 'border-border bg-card text-foreground hover:border-success/40 hover:bg-success-suave hover:text-success'
                            }`}
                          >
                            {pago ? 'Reabrir' : <><Check className="w-3.5 h-3.5" /> Dar baixa</>}
                          </button>
                        ) : (
                          <span className="t-legenda px-1">via Asaas</span>
                        )}
                        <PortalMenu
                          ariaLabel="Mais ações"
                          width={230}
                          trigger={({ toggle, ref }) => (
                            <button ref={ref} type="button" onClick={toggle} aria-label="Mais ações" className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground">
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          )}
                        >
                          {(close) => (
                            <div className="py-1 text-xs">
                              <button type="button" onClick={() => { close(); setOpen(r.id) }} className="w-full text-left px-3 py-2 text-foreground hover:bg-secondary/70">Ver cobrança e NFS-e</button>
                              {r.payment && !pago && (
                                <>
                                  <button type="button" onClick={() => { close(); actions.onChangeDue(r) }} className="w-full text-left px-3 py-2 text-foreground hover:bg-secondary/70 inline-flex items-center gap-2">
                                    <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" /> Alterar vencimento
                                  </button>
                                  <button type="button" onClick={() => { close(); actions.onResend(r) }} className="w-full text-left px-3 py-2 text-foreground hover:bg-secondary/70 inline-flex items-center gap-2">
                                    <Send className="w-3.5 h-3.5 text-muted-foreground" /> Reenviar fatura por e-mail
                                  </button>
                                  <button type="button" onClick={() => { close(); actions.onCancel(r) }} className="w-full text-left px-3 py-2 text-destructive-texto hover:bg-destructive-suave inline-flex items-center gap-2 border-t border-border mt-1">
                                    <Ban className="w-3.5 h-3.5" /> Cancelar parcela
                                  </button>
                                </>
                              )}
                              {!charge && (
                                <button type="button" onClick={() => { close(); actions.onGenerateCharge(r.client.id) }} className="w-full text-left px-3 py-2 text-foreground font-semibold hover:bg-secondary/70 border-t border-border mt-1">
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
                    <tr key={`${r.id}-det`} className="bg-secondary/40">
                      <td colSpan={6} className="px-6 py-3.5">
                        <div className="flex flex-wrap items-center gap-2">
                          {!charge ? (
                            <button
                              type="button"
                              onClick={() => actions.onGenerateCharge(r.client.id)}
                              disabled={busy}
                              className="h-8 px-3 text-[12px] font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
                            >
                              {busy ? 'Gerando…' : 'Gerar cobrança Asaas'}
                            </button>
                          ) : (
                            <>
                              {st && <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${st.cls}`}>{st.label}</span>}
                              {nf && <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${nf.cls}`}>{nf.label}</span>}
                              {charge.invoiceUrl && <a href={charge.invoiceUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-marca-texto hover:underline font-medium">Fatura</a>}
                              {charge.bankSlipUrl && <a href={charge.bankSlipUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-marca-texto hover:underline font-medium">Boleto</a>}
                              {charge.identificationField && (
                                <button type="button" onClick={() => navigator.clipboard?.writeText(charge.identificationField!)} className="text-[11.5px] text-muted-foreground hover:text-marca-texto font-medium">
                                  Copiar linha digitável
                                </button>
                              )}
                              <button type="button" onClick={() => actions.onSyncCharge(charge.id)} disabled={busy} className="text-[11.5px] text-muted-foreground hover:text-marca-texto font-medium disabled:opacity-50">Sincronizar</button>
                              {!charge.nfse && ['CONFIRMED', 'RECEIVED'].includes(charge.status) && (
                                <button
                                  type="button"
                                  onClick={() => actions.onNfse(charge.id, 'emit')}
                                  disabled={busy || !actions.fiscalReady}
                                  title={!actions.fiscalReady ? `Configuração fiscal incompleta: ${actions.fiscalMissing.join(', ')}` : undefined}
                                  className="h-8 px-3 text-[12px] font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Emitir NFS-e
                                </button>
                              )}
                              {charge.nfse && (
                                <>
                                  <button type="button" onClick={() => actions.onNfse(charge.id, 'consult')} disabled={busy} className="text-[11.5px] text-muted-foreground hover:text-marca-texto font-medium disabled:opacity-50">Consultar NFS-e</button>
                                  {charge.nfse.pdfUrl && <a href={charge.nfse.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-marca-texto hover:underline font-medium">PDF</a>}
                                  {charge.nfse.xmlUrl && <a href={charge.nfse.xmlUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-marca-texto hover:underline font-medium">XML</a>}
                                  {charge.nfse.status === 'AUTORIZADO' && (
                                    <button type="button" onClick={() => actions.onNfse(charge.id, 'email')} disabled={busy} className="text-[11.5px] text-muted-foreground hover:text-marca-texto font-medium disabled:opacity-50">Reenviar por e-mail</button>
                                  )}
                                  {charge.nfse.status === 'ERRO_AUTORIZACAO' && (
                                    <button type="button" onClick={() => actions.onNfse(charge.id, 'emit')} disabled={busy || !actions.fiscalReady} className="text-[11.5px] font-semibold text-destructive-texto hover:underline disabled:opacity-50">Tentar novamente</button>
                                  )}
                                </>
                              )}
                              {(charge.lastError || charge.nfse?.lastError || charge.nfse?.municipalMessage) && (
                                <button type="button" onClick={() => alert(charge.lastError || charge.nfse?.lastError || charge.nfse?.municipalMessage || '')} className="text-[11.5px] text-destructive-texto hover:underline font-medium">Ver erro</button>
                              )}
                              {charge.status === 'ERROR' && (
                                <button type="button" onClick={() => actions.onGenerateCharge(r.client.id)} disabled={busy} className="text-[11.5px] font-semibold text-destructive-texto hover:underline disabled:opacity-50">Gerar de novo</button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-secondary/40 border-t border-border">
              <tr className="text-[12px]">
                <td colSpan={3} className="px-6 py-3 font-semibold uppercase tracking-[0.08em] text-[11px] text-muted-foreground">Total visível</td>
                <td className="px-3 py-3 text-right font-display font-semibold text-foreground text-[14px] tabular-nums">{formatCurrency(rows.reduce((s, r) => s + r.amount, 0))}</td>
                <td colSpan={2} className="px-3 py-3 text-muted-foreground">
                  <span className="text-success font-semibold">{formatCurrency(totals.pago)} pago</span>
                  {' · '}<span className="text-warning font-semibold">{formatCurrency(totals.pendente)} pendente</span>
                  {totals.atrasado > 0 && <> · <span className="text-destructive-texto font-semibold">{formatCurrency(totals.atrasado)} atrasado</span></>}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
