import Link from 'next/link'
import { ArrowUpRight, CalendarClock, CircleAlert, Clock, Inbox, Wallet, TrendingUp, Receipt, ListChecks } from 'lucide-react'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Header from '@/components/layout/Header'
import PeriodSelector from '@/components/dashboard/PeriodSelector'
import GraficoMeses from '@/components/dashboard/GraficoMeses'
import { Card } from '@/components/vex/card'
import { Badge } from '@/components/vex/badge'
import { Button } from '@/components/vex/button'
import { formatCurrency } from '@/lib/utils'
import { getPeriodSummary, getSeries, type PeriodView } from '@/lib/finance-summary'
import { cashBalance } from '@/lib/caixa-core'

/**
 * Dashboard: "o que precisa da minha atenção hoje?". Quatro números do mês,
 * o movimento dos últimos meses, o que está atrasado ou vence logo e onde as
 * demandas estão paradas. Indicadores de carteira (MRR, ARR, segmentação,
 * pipeline) moram no Financeiro e no Pipeline, não aqui.
 */

/** Período pedido na URL; sem parâmetro, mês atual em America/Sao_Paulo. */
function periodFromParams(params: Record<string, string | string[] | undefined>) {
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const [anoHoje, mesHoje] = hoje.split('-').map(Number)
  const raw = (k: string) => (Array.isArray(params[k]) ? params[k]?.[0] : params[k]) as string | undefined
  const view: PeriodView = raw('visao') === 'anual' ? 'anual' : 'mensal'
  const ano = Number(raw('ano'))
  const mes = Number(raw('mes'))
  return {
    view,
    year: Number.isInteger(ano) && ano >= 2000 && ano <= 2100 ? ano : anoHoje,
    month: view === 'mensal' ? (Number.isInteger(mes) && mes >= 1 && mes <= 12 ? mes : mesHoje) : null,
  }
}

const DAY = 24 * 60 * 60 * 1000
const brl = (cents: number) => formatCurrency(cents / 100)
const diaMes = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' }).replace('.', '')

function hojeSP() {
  return new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) + 'T00:00:00Z')
}

/** Demandas abertas agrupadas pela etapa em que estão, com as atrasadas. */
async function demandasPorEtapa(scope: Record<string, unknown>) {
  const hoje = hojeSP()
  const abertas = await prisma.task.findMany({
    where: { status: { not: 'CONCLUIDO' }, ...scope },
    select: { dueDate: true, stage: { select: { name: true, position: true } } },
  })
  const etapas = new Map<string, { nome: string; ordem: number; total: number; atrasadas: number }>()
  for (const t of abertas) {
    const nome = t.stage?.name ?? 'Sem etapa'
    const e = etapas.get(nome) ?? { nome, ordem: t.stage?.position ?? 99, total: 0, atrasadas: 0 }
    e.total++
    if (t.dueDate && t.dueDate < hoje) e.atrasadas++
    etapas.set(nome, e)
  }
  const lista = [...etapas.values()].sort((a, b) => a.ordem - b.ordem || b.total - a.total)
  return { lista, total: abertas.length, atrasadas: lista.reduce((a, e) => a + e.atrasadas, 0) }
}

function Numero({ rotulo, valor, detalhe, icone: Icone, href, alerta }: {
  rotulo: string; valor: string; detalhe?: React.ReactNode; icone: React.ElementType; href?: string; alerta?: boolean
}) {
  const corpo = (
    <Card className={`p-5 h-full flex flex-col gap-4 ${href ? 'hover:border-subtle/60 transition-colors' : ''}`}>
      <div className="flex items-center justify-between">
        <p className="t-rotulo text-muted-foreground">{rotulo}</p>
        <span className="w-8 h-8 rounded-lg bg-secondary grid place-items-center text-muted-foreground"><Icone className="w-4 h-4" /></span>
      </div>
      <div>
        <p className={`text-[24px] leading-8 font-semibold tracking-[-0.02em] tabular ${alerta ? 'text-destructive-texto' : 'text-foreground'}`}>{valor}</p>
        {detalhe && <div className="mt-1.5 t-rotulo text-muted-foreground">{detalhe}</div>}
      </div>
    </Card>
  )
  return href ? <Link href={href} className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded-[12px]">{corpo}</Link> : corpo
}

function Secao({ titulo, href, rotuloLink = 'Ver tudo', children, className }: {
  titulo: React.ReactNode; href?: string; rotuloLink?: string; children: React.ReactNode; className?: string
}) {
  return (
    <Card className={`overflow-hidden ${className ?? ''}`}>
      <div className="flex items-center justify-between px-5 h-12 border-b border-border">
        <h2 className="t-secao text-foreground">{titulo}</h2>
        {href && (
          <Link href={href} className="t-rotulo text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            {rotuloLink} <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>
      {children}
    </Card>
  )
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [session, params] = await Promise.all([auth(), searchParams])
  const isAdmin = session?.user?.role === 'ADMIN'
  const userId = session?.user?.id ?? ''
  const period = periodFromParams(params)
  const hoje = hojeSP()
  const em7 = new Date(hoje.getTime() + 7 * DAY)

  const etapas = await demandasPorEtapa(isAdmin ? {} : { assigneeId: userId })

  /* ───────────── colaborador: só as próprias demandas ───────────── */
  if (!isAdmin) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <Header title="Dashboard" subtitle="Suas demandas" />
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-5xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Numero rotulo="Suas tarefas abertas" valor={String(etapas.total)} icone={Inbox} href="/demandas" />
            <Numero rotulo="Atrasadas" valor={String(etapas.atrasadas)} icone={CircleAlert} href="/demandas" alerta={etapas.atrasadas > 0} />
          </div>
          <Secao titulo="Onde estão suas tarefas" href="/demandas" rotuloLink="Abrir demandas">
            <ListaEtapas etapas={etapas.lista} />
          </Secao>
        </div>
      </div>
    )
  }

  /* ───────────────────────── administrador ───────────────────────── */
  const [summary, serie, movs, atrasadas, aReceber7, aPagar7] = await Promise.all([
    getPeriodSummary(period.view, period.year, period.month),
    getSeries(12),
    prisma.cashMovement.findMany({ select: { kind: true, amountCents: true } }),
    prisma.clientPayment.findMany({
      where: { status: 'PENDENTE', dueDate: { lt: hoje } },
      include: { client: { select: { id: true, name: true } } },
    }),
    prisma.clientPayment.findMany({
      where: { status: 'PENDENTE', dueDate: { gte: hoje, lte: em7 } },
      include: { client: { select: { name: true } }, service: { select: { serviceName: true } } },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.financialEntry.findMany({
      where: { status: { not: 'PAGO' }, type: { in: ['CUSTO', 'SALARIO'] }, dueDate: { gte: hoje, lte: em7 } },
      orderBy: { dueDate: 'asc' },
    }),
  ])

  const saldoCents = cashBalance(movs)
  const despesasCents = summary.custosPrevistosCents + summary.salariosPrevistosCents
  const despesasPagasCents = summary.custosPagosCents + summary.salariosPagosCents
  const aReceberCents = summary.pendenteCents + summary.atrasadaCents
  const pctRecebido = summary.previstaCents > 0 ? Math.min(100, Math.round((summary.recebidaCents / summary.previstaCents) * 100)) : 0

  // Atrasos por cliente, do maior para o menor
  const porCliente = new Map<string, { nome: string; cents: number; desde: Date }>()
  for (const p of atrasadas) {
    const k = p.client.id
    const atual = porCliente.get(k) ?? { nome: p.client.name, cents: 0, desde: p.dueDate }
    atual.cents += Math.round(Number(p.amount) * 100)
    if (p.dueDate < atual.desde) atual.desde = p.dueDate
    porCliente.set(k, atual)
  }
  const atrasos = [...porCliente.values()].sort((a, b) => b.cents - a.cents)
  const totalAtrasoCents = atrasos.reduce((a, x) => a + x.cents, 0)

  // Próximos 7 dias: recebimentos e pagamentos numa lista só, por data
  const proximos = [
    ...aReceber7.map((p) => ({ data: p.dueDate, tipo: 'receber' as const, nome: p.client.name, detalhe: p.service?.serviceName ?? '', cents: Math.round(Number(p.amount) * 100) })),
    ...aPagar7.map((e) => ({ data: e.dueDate ?? hoje, tipo: 'pagar' as const, nome: e.name || e.description || 'Despesa', detalhe: e.category ?? '', cents: Math.round(Number(e.amount) * 100) })),
  ].sort((a, b) => a.data.getTime() - b.data.getTime())

  // Gráfico: a partir do primeiro mês com movimento
  const primeiro = serie.series.findIndex((p) => p.recebidaCents > 0 || p.custosCents > 0)
  const pontos = primeiro < 0 ? [] : serie.series.slice(primeiro).map((p) => ({
    data: `${p.year}-${String(p.month).padStart(2, '0')}`, recebido: p.recebidaCents / 100, despesas: p.custosCents / 100,
  }))

  const mesParam = period.view === 'mensal' ? `${period.year}-${String(period.month ?? 1).padStart(2, '0')}` : ''
  const financeiroHref = mesParam ? `/financeiro?mes=${mesParam}` : '/financeiro'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Dashboard" subtitle={summary.label} />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        <PeriodSelector
          view={summary.view}
          year={summary.year}
          month={summary.month}
          isCurrent={summary.isCurrentPeriod}
          referenceDate={summary.referenceDate}
        />

        {/* Os quatro números do período */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <Numero
            rotulo="Saldo do caixa"
            valor={brl(saldoCents)}
            icone={Wallet}
            href="/financeiro?aba=caixa"
            alerta={saldoCents < 0}
            detalhe="Ver extrato"
          />
          <Numero
            rotulo="Recebido"
            valor={brl(summary.recebidaCents)}
            icone={TrendingUp}
            href={`${financeiroHref}${mesParam ? '&' : '?'}situacao=pago`}
            detalhe={
              <div className="space-y-1.5">
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden" role="progressbar" aria-valuenow={pctRecebido} aria-valuemin={0} aria-valuemax={100} aria-label="Recebido do previsto">
                  <div className="h-full rounded-full bg-marca" style={{ width: `${pctRecebido}%` }} />
                </div>
                <p>{pctRecebido}% de {brl(summary.previstaCents)} previstos</p>
              </div>
            }
          />
          <Numero
            rotulo="A receber"
            valor={brl(aReceberCents)}
            icone={Inbox}
            href={`${financeiroHref}${mesParam ? '&' : '?'}situacao=pendente`}
            detalhe={summary.atrasadaCents > 0
              ? <span className="text-destructive-texto font-medium">{brl(summary.atrasadaCents)} em atraso</span>
              : 'Nada em atraso'}
          />
          <Numero
            rotulo="Despesas"
            valor={brl(despesasCents)}
            icone={Receipt}
            href={`${financeiroHref}${mesParam ? '&' : '?'}aba=custos`}
            detalhe={`${brl(despesasPagasCents)} pagas · ${brl(despesasCents - despesasPagasCents)} a pagar`}
          />
        </div>

        {/* Movimento e o que pede atenção */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-3">
          <Secao titulo="Recebido e despesas por mês" href="/financeiro" rotuloLink="Financeiro" className="xl:col-span-3">
            <div className="p-4">
              <GraficoMeses pontos={pontos} />
            </div>
          </Secao>

          <Secao titulo="Precisa de atenção" className="xl:col-span-2">
            <ul className="divide-y divide-border">
              {atrasos.slice(0, 4).map((a) => (
                <li key={a.nome} className="px-5 py-3 flex items-center gap-3">
                  <CircleAlert className="w-4 h-4 text-destructive-texto shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="t-corpo text-foreground truncate">{a.nome}</p>
                    <p className="t-legenda">em atraso desde {diaMes(a.desde)}</p>
                  </div>
                  <span className="t-corpo font-semibold text-foreground tabular">{brl(a.cents)}</span>
                </li>
              ))}
              {atrasos.length > 4 && (
                <li className="px-5 py-2.5 t-rotulo text-muted-foreground">+ {atrasos.length - 4} cliente(s) · {brl(totalAtrasoCents)} no total</li>
              )}
              {etapas.atrasadas > 0 && (
                <li className="px-5 py-3 flex items-center gap-3">
                  <ListChecks className="w-4 h-4 text-warning shrink-0" />
                  <p className="t-corpo text-foreground flex-1">{etapas.atrasadas} demanda(s) com prazo vencido</p>
                  <Button asChild variant="outline" size="sm"><Link href="/demandas">Ver</Link></Button>
                </li>
              )}
              {aPagar7.length > 0 && (
                <li className="px-5 py-3 flex items-center gap-3">
                  <CalendarClock className="w-4 h-4 text-muted-foreground shrink-0" />
                  <p className="t-corpo text-foreground flex-1">{aPagar7.length} conta(s) vencem em 7 dias</p>
                  <span className="t-corpo font-semibold text-foreground tabular">{brl(aPagar7.reduce((a, e) => a + Math.round(Number(e.amount) * 100), 0))}</span>
                </li>
              )}
              {atrasos.length === 0 && etapas.atrasadas === 0 && aPagar7.length === 0 && (
                <li className="px-5 py-10 text-center t-corpo text-muted-foreground">Tudo em dia.</li>
              )}
            </ul>
          </Secao>
        </div>

        {/* Operação */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-3">
          <Secao titulo={<>Demandas por etapa <span className="font-medium text-muted-foreground">{etapas.total}</span></>} href="/demandas" rotuloLink="Abrir demandas" className="xl:col-span-3">
            <ListaEtapas etapas={etapas.lista} />
          </Secao>

          <Secao titulo="Próximos 7 dias" href={financeiroHref} rotuloLink="Financeiro" className="xl:col-span-2">
            {proximos.length === 0 ? (
              <p className="px-5 py-10 text-center t-corpo text-muted-foreground">Nada vence nos próximos 7 dias.</p>
            ) : (
              <ul className="divide-y divide-border">
                {proximos.slice(0, 7).map((p, i) => (
                  <li key={i} className="px-5 py-2.5 flex items-center gap-3">
                    <span className="t-rotulo text-muted-foreground w-12 shrink-0 tabular">{diaMes(p.data)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="t-corpo text-foreground truncate">{p.nome}</p>
                      {p.detalhe && <p className="t-legenda truncate">{p.detalhe}</p>}
                    </div>
                    <Badge variant={p.tipo === 'receber' ? 'success' : 'default'}>{p.tipo === 'receber' ? 'Receber' : 'Pagar'}</Badge>
                    <span className="t-corpo font-semibold text-foreground tabular w-24 text-right">{brl(p.cents)}</span>
                  </li>
                ))}
                {proximos.length > 7 && <li className="px-5 py-2.5 t-rotulo text-muted-foreground">+ {proximos.length - 7} lançamento(s)</li>}
              </ul>
            )}
          </Secao>
        </div>
      </div>
    </div>
  )
}

function ListaEtapas({ etapas }: { etapas: Array<{ nome: string; total: number; atrasadas: number }> }) {
  if (etapas.length === 0) return <p className="px-5 py-10 text-center t-corpo text-muted-foreground">Nenhuma demanda aberta.</p>
  const maior = Math.max(...etapas.map((e) => e.total))
  return (
    <ul className="p-5 space-y-3">
      {etapas.map((e) => (
        <li key={e.nome} className="grid grid-cols-[120px_1fr_auto] items-center gap-3">
          <span className="t-corpo text-foreground truncate">{e.nome}</span>
          <span className="h-2 rounded-full bg-secondary overflow-hidden">
            <span className="block h-full rounded-full bg-[var(--grafico-2)]" style={{ width: `${Math.max(6, (e.total / maior) * 100)}%` }} />
          </span>
          <span className="t-rotulo text-foreground tabular flex items-center gap-2">
            {e.total}
            {e.atrasadas > 0 && <Badge variant="danger"><Clock className="w-3 h-3" />{e.atrasadas} atrasada(s)</Badge>}
          </span>
        </li>
      ))}
    </ul>
  )
}
