'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { CalendarCheck, CalendarX, CheckCircle2, ChevronLeft, ChevronRight, Hourglass, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Chip, Numero, Pilulas } from '@/components/vex/vireo'
import { Button } from '@/components/vex/button'
import { Entrada } from './Entrada'

export type ItemAgenda = {
  id: string; tipo: 'demanda' | 'evento'; numero: number | null; titulo: string; dia: string; status: string
  cliente: string | null; responsavel: string | null; processoId: string | null; cor: string | null; href: string
}

type Resumo = { agendadasSemana: number; aguardandoAprovacao: number; concluidasSemana: number; diasVazios: number }

const SEMANA = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM']
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** Situação de cada item, com a cor da legenda. */
function situacao(i: ItemAgenda, hoje: string): { rotulo: string; classe: string } {
  if (i.tipo === 'evento') return { rotulo: 'Evento', classe: 'bg-info' }
  if (i.status === 'CONCLUIDO') return { rotulo: 'Concluída', classe: 'bg-success' }
  if (i.status === 'EM_REVISAO' || i.status === 'APROVADO') return { rotulo: 'Aguardando aprovação', classe: 'bg-warning' }
  if (i.dia < hoje) return { rotulo: 'Atrasada', classe: 'bg-destructive' }
  return { rotulo: 'Agendada', classe: 'bg-marca' }
}

const LEGENDA = [
  { rotulo: 'Agendada', classe: 'bg-marca' },
  { rotulo: 'Aguardando aprovação', classe: 'bg-warning' },
  { rotulo: 'Concluída', classe: 'bg-success' },
  { rotulo: 'Atrasada', classe: 'bg-destructive' },
  { rotulo: 'Evento', classe: 'bg-info' },
]

const somaDias = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const mesParam = (a: number, m: number) => { const d = new Date(Date.UTC(a, m - 1, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` }

export default function AgendaMes({ ano, mes, hoje, inicioGrade, itens, semData, processos, resumo }: {
  ano: number; mes: number; hoje: string; inicioGrade: string; itens: ItemAgenda[]
  semData: Array<{ id: string; numero: number; titulo: string; cliente: string | null; cor: string | null; processo: string | null }>
  processos: Array<{ id: string; name: string; color: string }>
  resumo: Resumo
}) {
  const [filtro, setFiltro] = useState<string>('todos')
  const [visao, setVisao] = useState<'mes' | 'lista'>('mes')
  // No celular a grade do mês só cabe pontinhos: começa na lista, que dá para ler
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- só depois de montar dá para saber a largura da tela
    if (window.matchMedia('(max-width: 767px)').matches) setVisao('lista')
  }, [])
  const [diaAberto, setDiaAberto] = useState<string | null>(null)
  const chaveMes = `${ano}-${String(mes).padStart(2, '0')}`

  const visiveis = useMemo(() => itens.filter((i) => filtro === 'todos' || (filtro === 'eventos' ? i.tipo === 'evento' : i.processoId === filtro)), [itens, filtro])
  const porDia = useMemo(() => {
    const m = new Map<string, ItemAgenda[]>()
    for (const i of visiveis) m.set(i.dia, [...(m.get(i.dia) ?? []), i])
    return m
  }, [visiveis])
  const dias = Array.from({ length: 42 }, (_, n) => somaDias(inicioGrade, n))
  const contagem = (id: string) => itens.filter((i) => (id === 'eventos' ? i.tipo === 'evento' : i.processoId === id)).length
  const usados = processos.filter((p) => contagem(p.id) > 0)

  const stats = [
    { icone: CalendarCheck, tom: 'marca' as const, n: resumo.agendadasSemana, t: 'agendadas nesta semana' },
    { icone: Hourglass, tom: 'atencao' as const, n: resumo.aguardandoAprovacao, t: 'aguardando aprovação' },
    { icone: CheckCircle2, tom: 'sucesso' as const, n: resumo.concluidasSemana, t: 'concluídas na semana' },
    { icone: CalendarX, tom: 'perigo' as const, n: resumo.diasVazios, t: 'dias vazios nos próximos 7' },
  ]

  return (
    <Entrada className="space-y-5">
      {/* Cabeçalho com os números da semana, como no modelo */}
      <Entrada.Item className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <div>
          <p className="t-legenda">Demandas e eventos</p>
          <h1 className="font-display text-[34px] leading-tight font-semibold tracking-[-0.03em] text-foreground">Agenda</h1>
        </div>
        <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
          {stats.map((s) => (
            <div key={s.t} className="flex items-center gap-3">
              <Chip icone={s.icone} tom={s.tom} />
              <div><Numero className="text-[20px] leading-6">{s.n}</Numero><p className="t-legenda">{s.t}</p></div>
            </div>
          ))}
        </div>
      </Entrada.Item>

      {/* Filtros por processo + navegação */}
      <Entrada.Item className="flex flex-wrap items-center gap-2">
        {/* No celular os filtros correm numa linha só, para o mês não ficar longe */}
        <div className="flex items-center gap-2 max-sm:w-full max-sm:overflow-x-auto [&>button]:shrink-0 [&>button]:whitespace-nowrap sm:contents">
        <button type="button" onClick={() => setFiltro('todos')} className={cn('h-8 px-3.5 rounded-full text-[12.5px] font-semibold border transition-colors', filtro === 'todos' ? 'bg-marca text-white border-marca' : 'bg-card border-border text-muted-foreground hover:text-foreground')}>
          Todos <span className="ml-1 opacity-70">{itens.length}</span>
        </button>
        {usados.map((p) => (
          <button key={p.id} type="button" onClick={() => setFiltro(p.id)} className={cn('h-8 px-3 rounded-full text-[12.5px] font-semibold border inline-flex items-center gap-1.5 transition-colors', filtro === p.id ? 'bg-marca-suave text-marca-texto border-marca/30' : 'bg-card border-border text-muted-foreground hover:text-foreground')}>
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />{p.name}<span className="opacity-60">{contagem(p.id)}</span>
          </button>
        ))}
        {contagem('eventos') > 0 && (
          <button type="button" onClick={() => setFiltro('eventos')} className={cn('h-8 px-3 rounded-full text-[12.5px] font-semibold border inline-flex items-center gap-1.5', filtro === 'eventos' ? 'bg-marca-suave text-marca-texto border-marca/30' : 'bg-card border-border text-muted-foreground hover:text-foreground')}>
            <span className="w-2 h-2 rounded-full bg-info" />Eventos<span className="opacity-60">{contagem('eventos')}</span>
          </button>
        )}
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <Pilulas rotulo="Visão" valor={visao} aoMudar={setVisao} opcoes={[{ valor: 'mes', rotulo: 'Mês' }, { valor: 'lista', rotulo: 'Lista' }]} />
          <Link href={`/v2/agenda?mes=${mesParam(ano, mes - 1)}`} aria-label="Mês anterior" className="grid place-items-center w-9 h-9 rounded-full border border-border bg-card hover:bg-secondary"><ChevronLeft className="w-4 h-4" /></Link>
          <Link href="/v2/agenda" className="h-9 px-3.5 inline-flex items-center rounded-full border border-border bg-card text-[12.5px] font-semibold hover:bg-secondary">Hoje</Link>
          <Link href={`/v2/agenda?mes=${mesParam(ano, mes + 1)}`} aria-label="Próximo mês" className="grid place-items-center w-9 h-9 rounded-full border border-border bg-card hover:bg-secondary"><ChevronRight className="w-4 h-4" /></Link>
          <Button asChild><Link href="/demandas"><Plus className="w-4 h-4" />Nova demanda</Link></Button>
        </div>
      </Entrada.Item>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-5">
        {/* O mês */}
        <Entrada.Item>
          <section className="rounded-[24px] border border-white/60 dark:border-border/70 bg-card/65 backdrop-blur-xl p-5 sm:p-6 shadow-[0_10px_40px_-28px_rgba(16,24,40,0.45)]">
            <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
              <div>
                <h2 className="font-display text-[22px] font-semibold capitalize text-foreground">{MESES[mes - 1]} {ano}</h2>
                <p className="t-legenda">{visiveis.filter((i) => i.dia.startsWith(chaveMes)).length} itens no mês</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 t-legenda">
                {LEGENDA.map((l) => <span key={l.rotulo} className="inline-flex items-center gap-1.5"><span className={cn('w-2 h-2 rounded-full', l.classe)} />{l.rotulo}</span>)}
              </div>
            </div>

            {visao === 'mes' ? (
              <>
                <div className="grid grid-cols-7 gap-2 mb-2">
                  {SEMANA.map((d) => <p key={d} className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground px-1">{d}</p>)}
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {dias.map((d, n) => {
                    const doMes = d.startsWith(chaveMes)
                    const lista = porDia.get(d) ?? []
                    const ehHoje = d === hoje
                    return (
                      <motion.button
                        key={d}
                        type="button"
                        onClick={() => setDiaAberto(d)}
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.15 + n * 0.008, duration: 0.3 }}
                        className={cn(
                          'group text-left min-h-[112px] rounded-2xl p-2 border transition-colors flex flex-col gap-1',
                          doMes ? 'bg-secondary/40 border-transparent hover:border-marca/30 hover:bg-card' : 'bg-transparent border-dashed border-border/60 opacity-50',
                          ehHoje && 'bg-marca-suave/70 border-marca/30',
                        )}
                      >
                        <span className={cn('text-[12px] font-semibold tabular self-start', ehHoje ? 'grid place-items-center w-6 h-6 rounded-full bg-marca text-white' : 'text-muted-foreground px-1')}>{Number(d.slice(8))}</span>
                        {lista.slice(0, 3).map((i) => {
                          const s = situacao(i, hoje)
                          return (
                            <span key={i.id} className="flex items-center gap-1.5 rounded-lg bg-card px-1.5 py-1 shadow-[0_1px_0_var(--border)] min-w-0" title={`${i.titulo}${i.cliente ? ` · ${i.cliente}` : ''}`}>
                              <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', s.classe)} />
                              <span className="w-0.5 h-3 rounded-full shrink-0" style={{ background: i.cor ?? 'var(--border)' }} />
                              <span className={cn('text-[11px] leading-4 truncate', i.status === 'CONCLUIDO' ? 'text-muted-foreground line-through' : 'text-foreground')}>{i.titulo}</span>
                            </span>
                          )
                        })}
                        {lista.length > 3 && <span className="text-[10.5px] font-semibold text-muted-foreground px-1">+{lista.length - 3} mais</span>}
                      </motion.button>
                    )
                  })}
                </div>
              </>
            ) : (
              <ul className="divide-y divide-border">
                {visiveis.filter((i) => i.dia.startsWith(chaveMes)).map((i) => {
                  const s = situacao(i, hoje)
                  return (
                    <li key={i.id}>
                      <Link href={i.href} className="flex items-center gap-3 py-3 hover:bg-secondary/60 rounded-xl px-2">
                        <span className="w-12 text-center"><span className="block font-display text-[18px] font-semibold tabular">{i.dia.slice(8)}</span><span className="block text-[10.5px] uppercase text-muted-foreground">{MESES[mes - 1].slice(0, 3)}</span></span>
                        <span className="w-1 self-stretch rounded-full" style={{ background: i.cor ?? 'var(--border)' }} />
                        <span className="min-w-0 flex-1"><span className="block t-corpo font-medium text-foreground truncate">{i.numero ? `#${i.numero} ` : ''}{i.titulo}</span><span className="block t-legenda truncate">{[i.cliente, i.responsavel].filter(Boolean).join(' · ')}</span></span>
                        <span className="inline-flex items-center gap-1.5 t-legenda"><span className={cn('w-2 h-2 rounded-full', s.classe)} />{s.rotulo}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </Entrada.Item>

        {/* Lateral: mini calendário + sem data */}
        <div className="space-y-5">
          <Entrada.Item>
            <section className="rounded-[24px] border border-white/60 dark:border-border/70 bg-card/65 backdrop-blur-xl p-5 shadow-[0_10px_40px_-28px_rgba(16,24,40,0.45)]">
              <div className="flex items-center justify-between mb-3">
                <p className="font-display text-[16px] font-semibold capitalize">{MESES[mes - 1]} {ano}</p>
                <div className="flex gap-1">
                  <Link href={`/v2/agenda?mes=${mesParam(ano, mes - 1)}`} aria-label="Mês anterior" className="grid place-items-center w-7 h-7 rounded-full hover:bg-secondary"><ChevronLeft className="w-3.5 h-3.5" /></Link>
                  <Link href={`/v2/agenda?mes=${mesParam(ano, mes + 1)}`} aria-label="Próximo mês" className="grid place-items-center w-7 h-7 rounded-full hover:bg-secondary"><ChevronRight className="w-3.5 h-3.5" /></Link>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center">
                {SEMANA.map((d) => <span key={d} className="text-[10px] font-semibold text-muted-foreground">{d[0]}</span>)}
                {dias.map((d) => {
                  const n = (porDia.get(d) ?? []).length
                  return (
                    <button key={d} type="button" onClick={() => setDiaAberto(d)} className={cn('relative h-8 rounded-lg text-[12px] tabular transition-colors', d.startsWith(chaveMes) ? 'text-foreground hover:bg-secondary' : 'text-muted-foreground/40', d === hoje && 'bg-marca text-white hover:bg-marca')}>
                      {Number(d.slice(8))}
                      {n > 0 && d !== hoje && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-marca" />}
                    </button>
                  )
                })}
              </div>
            </section>
          </Entrada.Item>
          <Entrada.Item>
            <section className="rounded-[24px] border border-white/60 dark:border-border/70 bg-card/65 backdrop-blur-xl p-5 shadow-[0_10px_40px_-28px_rgba(16,24,40,0.45)]">
              <p className="font-display text-[16px] font-semibold">Sem data</p>
              <p className="t-legenda mb-3">Demandas abertas sem prazo: defina a data na demanda</p>
              <ul className="space-y-2">
                {semData.map((t) => (
                  <li key={t.id}>
                    <Link href={`/demandas?task=${t.id}`} className="flex items-center gap-2.5 rounded-xl border border-border bg-secondary/40 px-3 py-2 hover:border-marca/30 hover:bg-card transition-colors">
                      <span className="w-1 self-stretch rounded-full" style={{ background: t.cor ?? 'var(--border)' }} />
                      <span className="min-w-0 flex-1"><span className="block text-[12.5px] font-medium text-foreground truncate">#{t.numero} {t.titulo}</span><span className="block t-legenda truncate">{t.cliente ?? 'Interno'}{t.processo ? ` · ${t.processo}` : ''}</span></span>
                    </Link>
                  </li>
                ))}
                {semData.length === 0 && <li className="t-legenda py-4 text-center">Todas as demandas abertas têm data.</li>}
              </ul>
            </section>
          </Entrada.Item>
        </div>
      </div>

      {/* O dia aberto, num painel que sobe */}
      <AnimatePresence>
        {diaAberto && (
          <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button aria-label="Fechar" onClick={() => setDiaAberto(null)} className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]" />
            <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }} className="relative w-full max-w-[520px] rounded-[24px] border border-border bg-card p-6 shadow-2xl">
              <p className="t-legenda">{new Date(`${diaAberto}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'UTC' })}</p>
              <h3 className="font-display text-[24px] font-semibold">{new Date(`${diaAberto}T12:00:00Z`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', timeZone: 'UTC' })}</h3>
              <ul className="mt-4 space-y-2 max-h-[50vh] overflow-y-auto">
                {(porDia.get(diaAberto) ?? []).map((i) => {
                  const s = situacao(i, hoje)
                  return (
                    <li key={i.id}>
                      <Link href={i.href} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 hover:bg-secondary">
                        <span className="w-1 self-stretch rounded-full" style={{ background: i.cor ?? 'var(--border)' }} />
                        <span className="min-w-0 flex-1"><span className="block t-corpo font-medium truncate">{i.numero ? `#${i.numero} ` : ''}{i.titulo}</span><span className="block t-legenda truncate">{[i.cliente, i.responsavel].filter(Boolean).join(' · ') || '—'}</span></span>
                        <span className="inline-flex items-center gap-1.5 t-legenda whitespace-nowrap"><span className={cn('w-2 h-2 rounded-full', s.classe)} />{s.rotulo}</span>
                      </Link>
                    </li>
                  )
                })}
                {(porDia.get(diaAberto) ?? []).length === 0 && <li className="t-corpo text-muted-foreground py-6 text-center">Nada neste dia.</li>}
              </ul>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Entrada>
  )
}
