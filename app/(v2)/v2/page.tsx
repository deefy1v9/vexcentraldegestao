import Link from 'next/link'
import { AlarmClock, ArrowUpRight, CalendarClock, CircleAlert, Inbox, ListChecks, TrendingUp, Users } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { prazoAtual } from '@/lib/processos'
import { formatCurrency } from '@/lib/utils'
import { Entrada, EntradaItem } from '@/components/v2/Entrada'
import GraficoComparativo from '@/components/v2/GraficoComparativo'
import { Chip, Numero, type Tom } from '@/components/vex/vireo'
import { Button } from '@/components/vex/button'

/**
 * Visão geral da versão 2 (prévia): números do mês no cabeçalho, como chips,
 * e dois gráficos de "este mês × mês anterior" (recebimentos e entregas),
 * mais a semana, a carga da equipe e o que pede atenção.
 */
const diaSP = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const brl = (c: number) => formatCurrency(c / 100)
const cents = (v: unknown) => Math.round(Number(v) * 100)

function acumulado(datas: Array<{ dia: number; valor: number }>, diasNoMes: number, ate: number | null) {
  const porDia = new Array(diasNoMes + 1).fill(0)
  for (const d of datas) porDia[d.dia] += d.valor
  let soma = 0
  return Array.from({ length: diasNoMes }, (_, i) => {
    soma += porDia[i + 1]
    return ate !== null && i + 1 > ate ? null : soma
  })
}

export default async function VisaoGeralV2() {
  const agora = new Date()
  const hoje = diaSP(agora)
  const [ano, mes, diaHoje] = hoje.split('-').map(Number)
  const ini = new Date(Date.UTC(ano, mes - 1, 1, 3))
  const fim = new Date(Date.UTC(ano, mes, 1, 3))
  const iniAnt = new Date(Date.UTC(ano, mes - 2, 1, 3))
  const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  const meiaNoite = new Date(`${hoje}T00:00:00-03:00`)
  const em7 = new Date(meiaNoite.getTime() + 7 * 86400000)

  const [pagos, pagosAnt, mesParcelas, vencidas, concluidas, concluidasAnt, abertas] = await Promise.all([
    prisma.clientPayment.findMany({ where: { status: 'PAGO', paidAt: { gte: ini, lt: fim } }, select: { amount: true, paidAt: true } }),
    prisma.clientPayment.findMany({ where: { status: 'PAGO', paidAt: { gte: iniAnt, lt: ini } }, select: { amount: true, paidAt: true } }),
    prisma.clientPayment.findMany({ where: { year: ano, month: mes, status: { not: 'CANCELADO' } }, select: { amount: true, status: true } }),
    prisma.clientPayment.findMany({ where: { status: 'PENDENTE', dueDate: { lt: meiaNoite } }, select: { amount: true, dueDate: true, client: { select: { id: true, name: true } } } }),
    prisma.task.findMany({ where: { status: 'CONCLUIDO', updatedAt: { gte: ini, lt: fim } }, select: { updatedAt: true } }),
    prisma.task.findMany({ where: { status: 'CONCLUIDO', updatedAt: { gte: iniAnt, lt: ini } }, select: { updatedAt: true } }),
    prisma.task.findMany({
      where: { status: { not: 'CONCLUIDO' } },
      select: { id: true, number: true, title: true, dueDate: true, stageId: true, stageEnteredAt: true, stageDeadlines: true, stage: true, assignee: { select: { name: true } }, client: { select: { name: true } }, process: { select: { color: true, name: true } } },
    }),
  ])

  const diaDo = (d: Date) => Number(diaSP(d).slice(8, 10))
  const recebidoAtual = acumulado(pagos.map((p) => ({ dia: diaDo(p.paidAt!), valor: Number(p.amount) })), diasNoMes, diaHoje)
  const recebidoAnt = acumulado(pagosAnt.map((p) => ({ dia: diaDo(p.paidAt!), valor: Number(p.amount) })), diasNoMes, null)
  const entregasAtual = acumulado(concluidas.map((t) => ({ dia: diaDo(t.updatedAt), valor: 1 })), diasNoMes, diaHoje)
  const entregasAnt = acumulado(concluidasAnt.map((t) => ({ dia: diaDo(t.updatedAt), valor: 1 })), diasNoMes, null)
  const serie = (a: Array<number | null>, b: Array<number | null>) => a.map((v, i) => ({ dia: String(i + 1).padStart(2, '0'), atual: v, anterior: b[i] ?? null }))

  const recebidoCents = pagos.reduce((s, p) => s + cents(p.amount), 0)
  const previstoCents = mesParcelas.reduce((s, p) => s + cents(p.amount), 0)
  const aReceberCents = mesParcelas.filter((p) => p.status === 'PENDENTE').reduce((s, p) => s + cents(p.amount), 0)
  const atrasoCents = vencidas.reduce((s, p) => s + cents(p.amount), 0)
  const atrasadas = abertas.filter((t) => { const p = prazoAtual(t.stage, t, agora, meiaNoite); return !!p && diaSP(p) < hoje })
  const semana = abertas
    .filter((t) => t.dueDate && t.dueDate >= meiaNoite && t.dueDate < em7)
    .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime())
  const carga = [...abertas.reduce((m, t) => {
    const nome = t.assignee?.name ?? 'Sem responsável'
    const c = m.get(nome) ?? { nome, abertas: 0, atrasadas: 0 }
    c.abertas++
    if (atrasadas.includes(t)) c.atrasadas++
    return m.set(nome, c)
  }, new Map<string, { nome: string; abertas: number; atrasadas: number }>()).values()].sort((a, b) => b.abertas - a.abertas)
  const maiorCarga = Math.max(1, ...carga.map((c) => c.abertas))
  const porCliente = [...vencidas.reduce((m, p) => {
    const c = m.get(p.client.id) ?? { nome: p.client.name, cents: 0 }
    c.cents += cents(p.amount)
    return m.set(p.client.id, c)
  }, new Map<string, { nome: string; cents: number }>()).values()].sort((a, b) => b.cents - a.cents)

  // Comparação justa: o mês anterior até o mesmo dia de hoje
  const antAteHojeCents = Math.round((recebidoAnt[Math.min(diaHoje, diasNoMes) - 1] ?? 0) * 100)
  const variacao = antAteHojeCents > 0 ? Math.round(((recebidoCents - antAteHojeCents) / antAteHojeCents) * 100) : null
  const entregasAntAteHoje = entregasAnt[Math.min(diaHoje, diasNoMes) - 1] ?? 0
  const difEntregas = concluidas.length - (entregasAntAteHoje ?? 0)
  const nomeMesBruto = new Date(Date.UTC(ano, mes - 1, 15)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const nomeMes = nomeMesBruto.charAt(0).toUpperCase() + nomeMesBruto.slice(1)

  const stats: Array<{ icone: React.ElementType; tom: Tom; valor: string; rotulo: string; selo?: { texto: string; bom: boolean } }> = [
    { icone: TrendingUp, tom: 'sucesso', valor: brl(recebidoCents), rotulo: 'recebido no mês', selo: variacao !== null ? { texto: `${variacao >= 0 ? '+' : ''}${variacao}%`, bom: variacao >= 0 } : undefined },
    { icone: Inbox, tom: 'info', valor: brl(aReceberCents), rotulo: `a receber de ${brl(previstoCents)}` },
    { icone: CircleAlert, tom: 'perigo', valor: brl(atrasoCents), rotulo: `em atraso · ${porCliente.length} cliente(s)` },
    { icone: AlarmClock, tom: 'atencao', valor: String(atrasadas.length), rotulo: `demandas atrasadas de ${abertas.length}` },
  ]

  return (
    <Entrada className="space-y-5">
      {/* Cabeçalho: título e os números como chips, como no modelo */}
      <EntradaItem className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <div>
          <p className="t-legenda">{nomeMes} · até hoje</p>
          <h1 className="font-display text-[34px] leading-tight font-semibold tracking-[-0.03em] text-foreground">Visão geral</h1>
        </div>
        <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
          {stats.map((s) => (
            <div key={s.rotulo} className="flex items-center gap-3">
              <Chip icone={s.icone} tom={s.tom} />
              <div>
                <div className="flex items-center gap-2">
                  <Numero className="text-[18px] leading-6">{s.valor}</Numero>
                  {s.selo && <span className={`rounded-full px-1.5 py-0.5 text-[10.5px] font-bold ${s.selo.bom ? 'bg-success-suave text-success' : 'bg-destructive-suave text-destructive-texto'}`}>{s.selo.texto}</span>}
                </div>
                <p className="t-legenda">{s.rotulo}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="outline"><Link href="/financeiro">Abrir financeiro</Link></Button>
          <Button asChild><Link href="/demandas">Nova demanda</Link></Button>
        </div>
      </EntradaItem>

      {/* Os dois gráficos lado a lado */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <EntradaItem>
          <Cartao titulo="Recebimentos" destaque={brl(recebidoCents)} selo={variacao !== null ? { texto: `${variacao >= 0 ? '+' : ''}${variacao}% vs. mês anterior`, bom: variacao >= 0 } : undefined} legenda="recebido no mês, acumulado dia a dia" href="/financeiro?aba=recebiveis">
            <GraficoComparativo formato="moeda" cor="var(--marca)" pontos={serie(recebidoAtual, recebidoAnt)} />
          </Cartao>
        </EntradaItem>
        <EntradaItem>
          <Cartao titulo="Entregas da equipe" destaque={String(concluidas.length)} selo={entregasAntAteHoje ? { texto: `${difEntregas >= 0 ? '+' : ''}${difEntregas} vs. mês anterior`, bom: difEntregas >= 0 } : undefined} legenda="demandas concluídas no mês, acumulado" href="/demandas?visao=quadro">
            <GraficoComparativo formato="numero" cor="var(--grafico-1)" pontos={serie(entregasAtual, entregasAnt)} />
          </Cartao>
        </EntradaItem>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <EntradaItem>
          <Cartao titulo="Esta semana" legenda={`${semana.length} demanda(s) vencem nos próximos 7 dias`} href="/v2/agenda">
            <ul className="space-y-1.5">
              {semana.slice(0, 6).map((t) => (
                <li key={t.id}>
                  <Link href={`/demandas?task=${t.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-secondary transition-colors">
                    <span className="w-1 self-stretch rounded-full" style={{ background: t.process?.color ?? 'var(--marca)' }} />
                    <span className="min-w-0 flex-1">
                      <span className="block t-corpo font-medium text-foreground truncate">{t.title}</span>
                      <span className="block t-legenda truncate">{t.client?.name ?? 'Interno'} · {t.assignee?.name ?? 'sem responsável'}</span>
                    </span>
                    <span className="t-rotulo text-muted-foreground tabular">{t.dueDate!.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' }).replace('.', '')}</span>
                  </Link>
                </li>
              ))}
              {semana.length === 0 && <li className="py-8 text-center t-corpo text-muted-foreground">Nada vence nesta semana.</li>}
            </ul>
          </Cartao>
        </EntradaItem>

        <EntradaItem>
          <Cartao titulo="Carga da equipe" legenda="demandas abertas por pessoa" href="/demandas">
            <ul className="space-y-4">
              {carga.map((c) => (
                <li key={c.nome}>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="flex items-center gap-2 t-corpo text-foreground"><Users className="w-4 h-4 text-muted-foreground" />{c.nome}</span>
                    <span className="t-rotulo tabular text-muted-foreground">{c.abertas} abertas{c.atrasadas ? <span className="text-destructive-texto font-semibold"> · {c.atrasadas} atrasadas</span> : null}</span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden flex">
                    <span className="h-full bg-destructive" style={{ width: `${(c.atrasadas / maiorCarga) * 100}%` }} />
                    <span className="h-full bg-marca" style={{ width: `${((c.abertas - c.atrasadas) / maiorCarga) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </Cartao>
        </EntradaItem>

        <EntradaItem>
          <Cartao titulo="Precisa de atenção" legenda="clientes em atraso e demandas vencidas" href="/financeiro?aba=atrasados">
            <ul className="space-y-2">
              {porCliente.slice(0, 4).map((c) => (
                <li key={c.nome} className="flex items-center gap-3 rounded-xl bg-destructive-suave/50 px-3 py-2.5">
                  <CircleAlert className="w-4 h-4 text-destructive-texto shrink-0" />
                  <span className="flex-1 t-corpo text-foreground truncate">{c.nome}</span>
                  <Numero className="text-[14px] text-destructive-texto">{brl(c.cents)}</Numero>
                </li>
              ))}
              {atrasadas.slice(0, 4).map((t) => (
                <li key={t.id}>
                  <Link href={`/demandas?task=${t.id}`} className="flex items-center gap-3 rounded-xl bg-warning-suave/60 px-3 py-2.5 hover:bg-warning-suave transition-colors">
                    <ListChecks className="w-4 h-4 text-warning shrink-0" />
                    <span className="flex-1 t-corpo text-foreground truncate">#{t.number} {t.title}</span>
                  </Link>
                </li>
              ))}
              {atrasadas.length > 4 && <li className="t-legenda px-1">+ {atrasadas.length - 4} demanda(s) atrasada(s)</li>}
              {porCliente.length === 0 && atrasadas.length === 0 && <li className="py-8 text-center t-corpo text-muted-foreground">Tudo em dia.</li>}
            </ul>
          </Cartao>
        </EntradaItem>
      </div>
      <EntradaItem className="flex items-center gap-2 t-legenda"><CalendarClock className="w-3.5 h-3.5" />Prévia da versão 2. A versão atual continua em <Link href="/dashboard" className="underline">/dashboard</Link>.</EntradaItem>
    </Entrada>
  )
}

function Cartao({ titulo, destaque, selo, legenda, href, children }: { titulo: string; destaque?: string; selo?: { texto: string; bom: boolean }; legenda?: string; href?: string; children: React.ReactNode }) {
  return (
    <section className="h-full rounded-[24px] border border-white/60 dark:border-border/70 bg-card/65 backdrop-blur-xl p-6 shadow-[0_10px_40px_-28px_rgba(16,24,40,0.45)]">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <p className="t-rotulo text-muted-foreground">{titulo}</p>
          {destaque && (
            <div className="flex items-center gap-2 mt-1">
              <Numero className="text-[28px] leading-8">{destaque}</Numero>
              {selo && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${selo.bom ? 'bg-success-suave text-success' : 'bg-destructive-suave text-destructive-texto'}`}>{selo.texto}</span>}
            </div>
          )}
          {legenda && <p className="t-legenda mt-0.5">{legenda}</p>}
        </div>
        {href && <Link href={href} aria-label={`Abrir ${titulo}`} className="grid place-items-center w-9 h-9 rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"><ArrowUpRight className="w-4 h-4" /></Link>}
      </div>
      {children}
    </section>
  )
}
