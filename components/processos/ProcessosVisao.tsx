'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, CheckCircle2, ChevronRight, Clock, ListChecks, Plus, ShieldCheck, UserRound, Users } from 'lucide-react'
import { Badge } from '@/components/vex/badge'
import { Numero, Pilulas, Sobretitulo } from '@/components/vex/vireo'
import { FIELD_LABEL, ROLE_LABEL, type StageField, type StageRole } from '@/lib/processos'

/** O que a tela precisa de cada etapa (só leitura; editar é no construtor). */
export interface EtapaResumo {
  id: string
  name: string
  kind: string
  role: string | null
  defaultUser: { name: string } | null
  team: { name: string; color: string } | null
  dueMode: string
  dueDays: number
  fields: string[]
  checklist: string[]
  checklistRequired: boolean
}

export interface ProcessoResumo {
  id: string
  name: string
  color: string
  description: string | null
  active: boolean
  taskCount: number
  stages: EtapaResumo[]
}

/** Quem assume, na mesma ordem da regra (papel → pessoa fixa → equipe → quem já estava). */
function responsavel(s: EtapaResumo): { principal: string; reserva: string | null; equipe: EtapaResumo['team'] } {
  const ordem: string[] = []
  if (s.role) ordem.push(ROLE_LABEL[s.role as StageRole] ?? s.role)
  if (s.defaultUser) ordem.push(s.defaultUser.name)
  if (s.team) ordem.push(`Equipe ${s.team.name}`)
  if (ordem.length === 0) return { principal: 'Quem já estava na demanda', reserva: null, equipe: null }
  return { principal: ordem[0], reserva: ordem.length > 1 ? ordem.slice(1).join(' → ') : null, equipe: s.team }
}

function prazo(s: EtapaResumo): string {
  const n = s.dueDays
  const dias = `${n} dia${n === 1 ? '' : 's'}`
  if (s.dueMode === 'ANTES_DA_ENTREGA') return n === 0 ? 'No dia da entrega' : `${dias} antes da entrega`
  return n === 0 ? 'No dia em que chega' : `${dias} depois de chegar`
}

function conclusao(s: EtapaResumo): string[] {
  const itens: string[] = []
  if (s.kind === 'APROVACAO') itens.push('Aprovar ou devolver')
  for (const f of s.fields) itens.push(FIELD_LABEL[f as StageField] ?? f)
  if (s.checklist.length > 0) {
    itens.push(`Checklist de ${s.checklist.length} ${s.checklist.length === 1 ? 'item' : 'itens'}${s.checklistRequired ? ' (obrigatório)' : ''}`)
  }
  return itens
}

/**
 * Processos em dois jeitos de ver: "Fluxo" (cartões com a rota de etapas) e
 * "Lista" (cada etapa numa linha, com responsável, regra de prazo e o que
 * precisa para concluir). Só apresentação: os dados vêm prontos da página.
 */
export default function ProcessosVisao({ processos }: { processos: ProcessoResumo[] }) {
  const [visao, setVisao] = useState<'fluxo' | 'lista'>('fluxo')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="t-legenda">
          <Numero className="text-[15px] mr-1">{processos.length}</Numero> processo(s) ·{' '}
          <Numero className="text-[15px] mx-1">{processos.filter((p) => p.active).length}</Numero> ligado(s)
        </p>
        <Pilulas
          rotulo="Jeito de ver os processos"
          valor={visao}
          aoMudar={setVisao}
          opcoes={[{ valor: 'fluxo', rotulo: 'Fluxo' }, { valor: 'lista', rotulo: 'Lista' }]}
        />
      </div>

      {visao === 'fluxo' ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {processos.map((p) => {
            const etapas = p.stages.filter((s) => s.kind !== 'FINAL')
            const equipesDoProcesso = [...new Set(p.stages.map((s) => s.team?.name).filter(Boolean))]
            return (
              <Link key={p.id} href={`/processos/${p.id}`} className="group rounded-[24px] border border-border bg-card p-6 hover:border-marca/30 transition-colors flex flex-col gap-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                <div className="flex items-start gap-3">
                  <span className="mt-1 w-3 h-3 rounded-full shrink-0" style={{ background: p.color, boxShadow: `0 0 0 4px color-mix(in srgb, ${p.color} 18%, transparent)` }} />
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[17px] font-semibold tracking-[-0.01em] text-foreground truncate group-hover:text-marca-texto">{p.name}</p>
                    {p.description && <p className="t-legenda line-clamp-2 mt-0.5">{p.description}</p>}
                  </div>
                  {!p.active && <Badge variant="default">Desligado</Badge>}
                  <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {etapas.map((s, i) => (
                    <span key={s.id} className="inline-flex items-center gap-1">
                      <Badge variant={s.kind === 'APROVACAO' ? 'warning' : 'default'}>{s.name}</Badge>
                      {i < etapas.length - 1 && <ChevronRight className="w-3 h-3 text-subtle" />}
                    </span>
                  ))}
                </div>
                <dl className="mt-auto pt-4 border-t border-border grid grid-cols-2 gap-2">
                  <div>
                    <dt className="t-meta">Etapas</dt>
                    <dd><Numero className="text-[18px]">{etapas.length}</Numero></dd>
                  </div>
                  <div>
                    <dt className="t-meta">Demandas no processo</dt>
                    <dd><Numero className="text-[18px]">{p.taskCount}</Numero></dd>
                  </div>
                  {equipesDoProcesso.length > 0 && (
                    <div className="col-span-2 t-legenda flex items-center gap-1.5 truncate"><Users className="w-3.5 h-3.5 shrink-0" /> {equipesDoProcesso.join(', ')}</div>
                  )}
                </dl>
              </Link>
            )
          })}
          <Link href="/processos/novo" className="rounded-[24px] border border-dashed border-subtle bg-card p-6 min-h-[180px] grid place-items-center text-muted-foreground hover:border-marca hover:text-marca-texto transition-colors">
            <span className="inline-flex items-center gap-1.5 t-corpo font-medium"><Plus className="w-4 h-4" /> Novo processo</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {processos.map((p) => {
            const etapas = p.stages.filter((s) => s.kind !== 'FINAL')
            return (
              <section key={p.id} className="rounded-[24px] border border-border bg-card overflow-hidden shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                <div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-5 pb-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="mt-2 w-3 h-3 rounded-full shrink-0" style={{ background: p.color }} />
                    <div className="min-w-0">
                      <Sobretitulo>{etapas.length} etapa(s) · {p.taskCount} demanda(s)</Sobretitulo>
                      <h2 className="font-display text-[19px] font-semibold tracking-[-0.01em] text-foreground mt-0.5 flex items-center gap-2">
                        {p.name} {!p.active && <Badge variant="default">Desligado</Badge>}
                      </h2>
                    </div>
                  </div>
                  <Link href={`/processos/${p.id}`} className="t-rotulo font-semibold text-marca-texto hover:underline inline-flex items-center gap-1">
                    Editar processo <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] table-fixed">
                    <colgroup><col className="w-[30%]" /><col className="w-[27%]" /><col className="w-[19%]" /><col className="w-[24%]" /></colgroup>
                    <thead>
                      <tr className="bg-secondary/60 border-y border-border text-left">
                        {['Etapa', 'Responsável', 'Prazo', 'Para concluir'].map((h) => (
                          <th key={h} className="px-6 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground first:pl-6">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {etapas.map((s, i) => {
                        const r = responsavel(s)
                        const precisa = conclusao(s)
                        return (
                          <tr key={s.id} className="align-top hover:bg-secondary/40 transition-colors">
                            <td className="px-6 py-3.5">
                              <div className="flex items-start gap-3">
                                <span className="w-6 h-6 rounded-full bg-secondary text-[11px] font-semibold text-muted-foreground grid place-items-center shrink-0 tabular">{i + 1}</span>
                                <div className="min-w-0">
                                  <p className="t-corpo font-medium text-foreground">{s.name}</p>
                                  <span className={`mt-1 inline-flex items-center gap-1 text-[11px] font-medium ${s.kind === 'APROVACAO' ? 'text-warning' : 'text-muted-foreground'}`}>
                                    {s.kind === 'APROVACAO' ? <ShieldCheck className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                                    {s.kind === 'APROVACAO' ? 'Aprovação' : 'Execução'}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-3.5">
                              <p className="t-corpo text-foreground flex items-center gap-1.5">
                                {r.equipe && r.principal.startsWith('Equipe')
                                  ? <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.equipe.color }} />
                                  : <UserRound className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                                {r.principal}
                              </p>
                              {r.reserva && <p className="t-legenda mt-0.5">sem ele(a): {r.reserva}</p>}
                            </td>
                            <td className="px-6 py-3.5">
                              <p className="t-corpo text-foreground flex items-center gap-1.5 whitespace-nowrap"><Clock className="w-3.5 h-3.5 text-muted-foreground" /> {prazo(s)}</p>
                            </td>
                            <td className="px-6 py-3.5">
                              {precisa.length === 0 ? (
                                <p className="t-legenda">Basta concluir</p>
                              ) : (
                                <ul className="flex flex-wrap gap-1">
                                  {precisa.map((x) => (
                                    <li key={x} className="inline-flex items-center gap-1 h-[22px] rounded-md bg-secondary px-2 text-[11.5px] font-medium text-muted-foreground">
                                      {x.startsWith('Checklist') && <ListChecks className="w-3 h-3" />}{x}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
