import Link from 'next/link'
import { ArrowUpRight, CalendarClock, CircleAlert, Clock, Inbox, Wallet, TrendingUp, Receipt, ListChecks, AlarmClock, Users, CalendarCheck } from 'lucide-react'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Header from '@/components/layout/Header'
import PeriodSelector from '@/components/dashboard/PeriodSelector'
import GraficoBarrasMeses from '@/components/dashboard/GraficoBarrasMeses'
import { Card } from '@/components/vex/card'
import { Badge } from '@/components/vex/badge'
import { Button } from '@/components/vex/button'
import { Chip, Painel, LinhaRelance as Relance, type Tom } from '@/components/vex/vireo'
import { formatCurrency } from '@/lib/utils'
import { getPeriodSummary, getSeries, type PeriodView } from '@/lib/finance-summary'
import { cashBalance } from '@/lib/caixa-core'
import { prazoAtual } from '@/lib/processos'

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

const diaSP = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

function hojeSP() {
  return new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) + 'T00:00:00Z')
}

/**
 * Demandas abertas agrupadas pela etapa em que estão, com as atrasadas. O
 * prazo é o mesmo da lista de Demandas (o da etapa atual, via prazoAtual),
 * para os dois lugares nunca contarem atrasadas diferentes.
 */
async function demandasPorEtapa(scope: Record<string, unknown>) {
  const agora = new Date()
  // Meia-noite de verdade em Brasília (não a "meia-noite UTC" de hojeSP), para
  // o "vence hoje" do prazoAtual cair no dia certo
  const meiaNoiteSP = new Date(`${diaSP(agora)}T00:00:00-03:00`)
  const abertas = await prisma.task.findMany({
    where: { status: { not: 'CONCLUIDO' }, ...scope },
    select: { dueDate: true, stageId: true, stageEnteredAt: true, stageDeadlines: true, stage: true },
  })
  const etapas = new Map<string, { nome: string; ordem: number; total: number; atrasadas: number }>()
  for (const t of abertas) {
    const nome = t.stage?.name ?? 'Sem etapa'
    const e = etapas.get(nome) ?? { nome, ordem: t.stage?.position ?? 99, total: 0, atrasadas: 0 }
    e.total++
    // Compara o dia em Brasília, como a lista faz no navegador
    const prazo = prazoAtual(t.stage, t, agora, meiaNoiteSP)
    if (prazo && diaSP(prazo) < diaSP(agora)) e.atrasadas++
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
  const [summary, serie, movs, atrasadas, aReceber7, aPagar7, clientesAtivos] = await Promise.all([
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
    prisma.client.count({ where: { status: 'ATIVO' } }),
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

  const aReceber7Cents = aReceber7.reduce((a, p) => a + Math.round(Number(p.amount) * 100), 0)
  const aPagar7Cents = aPagar7.reduce((a, e) => a + Math.round(Number(e.amount) * 100), 0)
  const mesNome = summary.label

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Dashboard"
        subtitle={`${mesNome} · o que pede a sua atenção hoje`}
        acoes={
          <>
            <PeriodSelector
              view={summary.view}
              year={summary.year}
              month={summary.month}
              isCurrent={summary.isCurrentPeriod}
              referenceDate={summary.referenceDate}
            />
            <Button asChild><Link href="/demandas">Abrir demandas</Link></Button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto px-4 sm:px-8 pb-8 pt-2 space-y-5">
        {/* Resumo do período, no cartão de destaque do modelo Vireo */}
        <section className="relative overflow-hidden rounded-[24px] border border-marca/15 bg-gradient-to-br from-marca-suave via-card to-card p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-marca-texto">{mesNome} · {clientesAtivos} clientes ativos</p>
              <h2 className="mt-1 font-display text-[26px] sm:text-[30px] font-semibold tracking-[-0.02em] text-foreground">Resumo do mês</h2>
            </div>
            <Link href={financeiroHref} className="t-rotulo font-semibold text-marca-texto hover:underline inline-flex items-center gap-1">Abrir o financeiro <ArrowUpRight className="w-3.5 h-3.5" /></Link>
          </div>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/70">
            <Celula icone={Wallet} tom="marca" rotulo="Saldo do caixa" valor={brl(saldoCents)} nota="Ver extrato" href="/financeiro?aba=caixa" alerta={saldoCents < 0} />
            <Celula icone={TrendingUp} tom="sucesso" rotulo="Recebido" valor={brl(summary.recebidaCents)} nota={`${pctRecebido}% de ${brl(summary.previstaCents)} previstos`} href={`${financeiroHref}${mesParam ? '&' : '?'}situacao=pago`} />
            <Celula icone={Inbox} tom="info" rotulo="A receber no prazo" valor={brl(summary.pendenteCents)} nota={`${brl(aReceberCents)} em aberto no mês`} href={`${financeiroHref}${mesParam ? '&' : '?'}situacao=pendente`} />
            <Celula icone={CircleAlert} tom="perigo" rotulo="Em atraso" valor={brl(totalAtrasoCents)} nota={atrasos.length ? `${atrasos.length} cliente(s), todos os meses` : 'Ninguém em atraso'} href="/financeiro?aba=atrasados" alerta={totalAtrasoCents > 0} />
            <Celula icone={Receipt} tom="atencao" rotulo={period.view === 'anual' ? 'Despesas do ano' : 'Despesas do mês'} valor={brl(despesasCents)} nota={`${brl(despesasPagasCents)} pagas · ${brl(despesasCents - despesasPagasCents)} a pagar`} href={`${financeiroHref}${mesParam ? '&' : '?'}aba=custos`} />
            <Celula icone={AlarmClock} tom="perigo" rotulo="Demandas atrasadas" valor={String(etapas.atrasadas)} nota={`de ${etapas.total} abertas · equipe toda`} href="/demandas" alerta={etapas.atrasadas > 0} />
          </div>
        </section>

        {/* Movimento + num relance */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <Painel rotulo="Movimento" titulo="Recebido × despesas" sub="Quanto entrou e quanto saiu, mês a mês" className="xl:col-span-2" href="/financeiro" rotuloLink="Financeiro">
            <GraficoBarrasMeses pontos={pontos} />
          </Painel>
          <Painel rotulo="Hoje" titulo="Num relance" sub="O que vence e o que está parado">
            <ul className="divide-y divide-border">
              <Relance icone={ListChecks} tom="marca" rotulo="Demandas abertas" valor={String(etapas.total)} href="/demandas" />
              <Relance icone={AlarmClock} tom="perigo" rotulo="Com prazo vencido" valor={String(etapas.atrasadas)} href="/demandas" />
              <Relance icone={CalendarCheck} tom="sucesso" rotulo="A receber em 7 dias" valor={brl(aReceber7Cents)} detalhe={`${aReceber7.length} parcela(s)`} href={financeiroHref} />
              <Relance icone={CalendarClock} tom="atencao" rotulo="A pagar em 7 dias" valor={brl(aPagar7Cents)} detalhe={`${aPagar7.length} conta(s)`} href={`${financeiroHref}${mesParam ? '&' : '?'}aba=custos`} />
              <Relance icone={Users} tom="info" rotulo="Clientes ativos" valor={String(clientesAtivos)} href="/clientes" />
            </ul>
          </Painel>
        </div>

        {/* O que pede atenção + próximos 7 dias */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <Painel rotulo="Ação" titulo="Precisa de atenção" sub="Atrasos de clientes e demandas vencidas">
            <ul className="divide-y divide-border -mx-6">
              {atrasos.slice(0, 4).map((a) => (
                <li key={a.nome} className="px-6 py-3 flex items-center gap-3">
                  <Chip icone={CircleAlert} tom="perigo" />
                  <div className="min-w-0 flex-1">
                    <p className="t-corpo font-medium text-foreground truncate">{a.nome}</p>
                    <p className="t-legenda">em atraso desde {diaMes(a.desde)}</p>
                  </div>
                  <span className="font-display text-[15px] font-semibold text-destructive-texto tabular">{brl(a.cents)}</span>
                </li>
              ))}
              {atrasos.length > 4 && (
                <li className="px-6 py-2.5 t-rotulo text-muted-foreground">+ {atrasos.length - 4} cliente(s) · {brl(totalAtrasoCents)} no total</li>
              )}
              {etapas.atrasadas > 0 && (
                <li className="px-6 py-3 flex items-center gap-3">
                  <Chip icone={ListChecks} tom="atencao" />
                  <p className="t-corpo text-foreground flex-1">{etapas.atrasadas} demanda(s) com prazo vencido <span className="t-legenda">· equipe toda</span></p>
                  <Button asChild variant="outline" size="sm"><Link href="/demandas">Ver</Link></Button>
                </li>
              )}
              {atrasos.length === 0 && etapas.atrasadas === 0 && (
                <li className="px-6 py-10 text-center t-corpo text-muted-foreground">Tudo em dia.</li>
              )}
            </ul>
          </Painel>

          <Painel rotulo="Agenda" titulo="Próximos 7 dias" sub="Recebimentos e pagamentos por data" href={financeiroHref} rotuloLink="Financeiro">
            {proximos.length === 0 ? (
              <p className="py-10 text-center t-corpo text-muted-foreground">Nada vence nos próximos 7 dias.</p>
            ) : (
              <ul className="divide-y divide-border -mx-6">
                {proximos.slice(0, 6).map((p, i) => (
                  <li key={i} className="px-6 py-2.5 flex items-center gap-3">
                    <span className="w-12 shrink-0 text-center rounded-xl bg-secondary py-1">
                      <span className="block font-display text-[16px] font-semibold leading-5 text-foreground tabular">{p.data.toLocaleDateString('pt-BR', { day: '2-digit', timeZone: 'UTC' })}</span>
                      <span className="block text-[10.5px] uppercase text-muted-foreground">{p.data.toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', '')}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="t-corpo font-medium text-foreground truncate">{p.nome}</p>
                      {p.detalhe && <p className="t-legenda truncate">{p.detalhe}</p>}
                    </div>
                    <Badge variant={p.tipo === 'receber' ? 'success' : 'default'}>{p.tipo === 'receber' ? 'Receber' : 'Pagar'}</Badge>
                    <span className="font-display text-[15px] font-semibold text-foreground tabular w-28 text-right">{brl(p.cents)}</span>
                  </li>
                ))}
                {proximos.length > 6 && <li className="px-6 py-2.5 t-rotulo text-muted-foreground">+ {proximos.length - 6} lançamento(s)</li>}
              </ul>
            )}
          </Painel>
        </div>

        {/* Demandas por etapa, como o "Deals by stage" do Vireo */}
        <Painel rotulo="Produção" titulo="Demandas por etapa" sub={`${etapas.total} abertas · onde cada uma está parada`} href="/demandas" rotuloLink="Abrir demandas">
          <ListaEtapas etapas={etapas.lista} />
        </Painel>
      </div>
    </div>
  )
}

/** Um número do cartão de resumo: ícone em chip, rótulo, valor grande e a nota. */
function Celula({ icone, tom, rotulo, valor, nota, href, alerta }: {
  icone: React.ElementType; tom: Tom; rotulo: string; valor: string; nota?: string; href: string; alerta?: boolean
}) {
  return (
    <Link href={href} className="group flex items-start gap-3.5 p-5 bg-card/85 hover:bg-card transition-colors">
      <Chip icone={icone} tom={tom} />
      <div className="min-w-0">
        <p className="t-rotulo text-muted-foreground">{rotulo}</p>
        <p className={`mt-0.5 font-display text-[24px] leading-8 font-semibold tracking-[-0.02em] tabular ${alerta ? 'text-destructive-texto' : 'text-foreground'}`}>{valor}</p>
        {nota && <p className="t-legenda mt-0.5 truncate group-hover:text-foreground">{nota}</p>}
      </div>
    </Link>
  )
}

function ListaEtapas({ etapas }: { etapas: Array<{ nome: string; total: number; atrasadas: number }> }) {
  if (etapas.length === 0) return <p className="px-5 py-10 text-center t-corpo text-muted-foreground">Nenhuma demanda aberta.</p>
  const maior = Math.max(...etapas.map((e) => e.total))
  return (
    <ul className="space-y-3.5">
      {etapas.map((e) => (
        <li key={e.nome} className="grid grid-cols-[160px_1fr_auto] items-center gap-4">
          <span className="t-corpo text-foreground truncate">{e.nome}</span>
          <span className="h-2 rounded-full bg-secondary overflow-hidden">
            <span className="block h-full rounded-full bg-marca" style={{ width: `${Math.max(6, (e.total / maior) * 100)}%` }} />
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
