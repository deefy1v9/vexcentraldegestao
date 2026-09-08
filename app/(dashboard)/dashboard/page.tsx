import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Header from '@/components/layout/Header'
import DashboardIndicators from '@/components/dashboard/DashboardIndicators'
import RevenueChart from '@/components/dashboard/RevenueChart'
import PortfolioSegmentation from '@/components/dashboard/PortfolioSegmentation'
import PeriodSelector from '@/components/dashboard/PeriodSelector'
import PipelineSection from '@/components/dashboard/PipelineSection'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getPeriodSummary, type PeriodView } from '@/lib/finance-summary'
import { newLeadsInPeriod, pipelinePeriodSummary } from '@/lib/pipeline'
import { Building2, Kanban, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'

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

async function getOperationalData(viewer: { id: string; isAdmin: boolean }) {
  const now = new Date()
  const taskScope = viewer.isAdmin ? {} : { assigneeId: viewer.id }

  const hojeInicio = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) + 'T00:00:00Z')
  const [totalClients, activeClients, totalUsers, pendingTasks, inProgressTasks, lateTasks, upcomingEvents, recentLogs, recentTasks] =
    await Promise.all([
      prisma.client.count(),
      prisma.client.count({ where: { status: 'ATIVO' } }),
      prisma.user.count({ where: { isActive: true } }),
      prisma.task.count({ where: { status: 'TODO', ...taskScope } }),
      prisma.task.count({ where: { status: 'EM_ANDAMENTO', ...taskScope } }),
      // Demandas atrasadas: prazo vencido e ainda não concluídas
      prisma.task.count({ where: { status: { not: 'CONCLUIDO' }, dueDate: { lt: hojeInicio }, ...taskScope } }),
      prisma.calendarEvent.findMany({
        where: { startDate: { gte: now }, status: 'PENDENTE' },
        include: { client: { select: { name: true } } },
        orderBy: { startDate: 'asc' },
        take: 5,
      }),
      prisma.activityLog.findMany({
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      prisma.task.findMany({
        where: { status: { not: 'CONCLUIDO' }, ...taskScope },
        include: { assignee: { select: { name: true } }, client: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
    ])

  return { totalClients, activeClients, totalUsers, pendingTasks, inProgressTasks, lateTasks, upcomingEvents, recentLogs, recentTasks }
}

const STATUS_LABEL: Record<string, string> = {
  TODO: 'A Fazer', EM_ANDAMENTO: 'Em Andamento', EM_REVISAO: 'Em Revisão',
  CONCLUIDO: 'Concluído', BACKLOG: 'Backlog',
}
const STATUS_DOT: Record<string, string> = {
  TODO: 'bg-blue-500', EM_ANDAMENTO: 'bg-yellow-500', EM_REVISAO: 'bg-purple-500',
  CONCLUIDO: 'bg-green-500', BACKLOG: 'bg-gray-400',
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [session, params] = await Promise.all([auth(), searchParams])
  const isAdmin = session?.user?.role === 'ADMIN'
  const period = periodFromParams(params)
  const op = await getOperationalData({ id: session?.user?.id ?? '', isAdmin })
  const firstName = session?.user?.name?.split(' ')[0]

  // Financeiro e comercial são exclusivos de administradores
  const summary = isAdmin ? await getPeriodSummary(period.view, period.year, period.month) : null
  const inicio = period.view === 'anual'
    ? new Date(Date.UTC(period.year, 0, 1))
    : new Date(Date.UTC(period.year, (period.month ?? 1) - 1, 1))
  const fim = period.view === 'anual'
    ? new Date(Date.UTC(period.year, 11, 31, 23, 59, 59))
    : new Date(Date.UTC(period.year, period.month ?? 1, 0, 23, 59, 59))
  const [pipeline, novosLeads] = isAdmin
    ? await Promise.all([pipelinePeriodSummary(inicio, fim), newLeadsInPeriod(inicio, fim)])
    : [null, 0]

  const financeiroHref = period.view === 'mensal'
    ? `/financeiro?mes=${period.year}-${String(period.month ?? 1).padStart(2, '0')}`
    : '/financeiro'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Dashboard" subtitle={summary?.label ?? 'Resumo da agência'} />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Olá, {firstName} 👋</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {summary ? `Resumo de ${summary.label.toLowerCase()}.` : 'Resumo da agência de hoje.'}
            </p>
          </div>
          <Link
            href="/demandas"
            className="flex items-center justify-center gap-2 w-full sm:w-auto bg-[#030A8C] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#02077a] transition-colors"
          >
            <Kanban className="w-4 h-4" /> Ver Demandas
          </Link>
        </div>

        {isAdmin && summary ? (
          <>
            <PeriodSelector
              view={summary.view}
              year={summary.year}
              month={summary.month}
              isCurrent={summary.isCurrentPeriod}
              referenceDate={summary.referenceDate}
            />
            <DashboardIndicators
              s={summary}
              inProgressTasks={op.inProgressTasks}
              pendingTasks={op.pendingTasks}
              lateTasks={op.lateTasks}
              totalUsers={op.totalUsers}
              financeiroHref={financeiroHref}
            />
            {pipeline && (
              <PipelineSection summary={pipeline} periodLabel={summary.label.toLowerCase()} novosLeads={novosLeads} />
            )}
            <PortfolioSegmentation
              segments={summary.segments.map((x) => ({ tier: x.tier, count: x.count, revenue: x.recurringCents / 100, share: x.share }))}
              total={summary.mrrCents / 100}
            />
            <RevenueChart />
          </>
        ) : (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            <Link href="/clientes" className="group bg-white border border-gray-100 rounded-xl p-5 hover:border-gray-200 transition-all">
              <div className="flex items-start justify-between mb-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#030A8C22' }}>
                  <Building2 className="w-4 h-4" style={{ color: '#030A8C' }} />
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 transition-colors" />
              </div>
              <p className="text-2xl font-bold text-gray-900 leading-none">{op.activeClients}</p>
              <p className="text-xs text-gray-500 mt-1">Clientes Ativos</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{op.totalClients} total</p>
            </Link>

            <Link href="/demandas" className="group bg-white border border-gray-100 rounded-xl p-5 hover:border-gray-200 transition-all">
              <div className="flex items-start justify-between mb-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#f59e0b22' }}>
                  <Kanban className="w-4 h-4" style={{ color: '#f59e0b' }} />
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 transition-colors" />
              </div>
              <p className="text-2xl font-bold text-gray-900 leading-none">{op.inProgressTasks}</p>
              <p className="text-xs text-gray-500 mt-1">Em Andamento</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{op.pendingTasks} a fazer</p>
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className={`${isAdmin ? 'lg:col-span-3' : 'lg:col-span-5'} bg-white border border-gray-100 rounded-xl overflow-hidden`}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <p className="font-semibold text-gray-900 text-sm">
                Demandas em aberto
                <span className="ml-2 text-[11px] font-normal text-gray-400">
                  {op.inProgressTasks} em andamento · {op.pendingTasks} a fazer
                </span>
              </p>
              <Link href="/demandas" className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1">
                Ver todas <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
            {op.recentTasks.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Nenhuma demanda em aberto</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {op.recentTasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[task.status] || 'bg-gray-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate">{task.title}</p>
                      {task.client && <p className="text-[11px] text-gray-400 truncate">{task.client.name}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-gray-400">{STATUS_LABEL[task.status]}</span>
                      {task.assignee && (
                        <div className="w-5 h-5 bg-[#030A8C] rounded-full flex items-center justify-center">
                          <span className="text-white text-[9px] font-bold">{task.assignee.name.charAt(0)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {isAdmin && (
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                  <p className="font-semibold text-gray-900 text-sm">Custos por categoria</p>
                  <Link href={financeiroHref} className="text-gray-400 hover:text-gray-600 transition-colors">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
                {!summary || summary.custosPorCategoria.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-3">Nenhum custo no período</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {summary.custosPorCategoria.slice(0, 6).map((c) => (
                      <div key={c.category} className="flex items-center justify-between px-5 py-2.5">
                        <p className="text-xs text-gray-700 truncate flex-1 mr-2">{c.category}</p>
                        <p className="text-xs font-semibold text-gray-900">{formatCurrency(c.previstoCents / 100)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                  <p className="font-semibold text-gray-900 text-sm">Próximas Entregas</p>
                  <Link href="/calendario" className="text-gray-400 hover:text-gray-600 transition-colors">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
                {op.upcomingEvents.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-3">Nenhuma entrega próxima</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {op.upcomingEvents.map((ev) => (
                      <div key={ev.id} className="flex items-start gap-3 px-5 py-2.5">
                        <div className="w-1 h-1 rounded-full bg-[#030A8C] mt-2 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate">{ev.title}</p>
                          <div className="flex gap-1.5 mt-0.5">
                            {ev.client && <p className="text-[10px] text-gray-400">{ev.client.name} ·</p>}
                            <p className="text-[10px] text-[#030A8C]">{formatDate(ev.startDate)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {isAdmin && (
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <p className="font-semibold text-gray-900 text-sm">
                Atividade recente
                <span className="ml-2 text-[11px] font-normal text-gray-400">{op.totalUsers} colaborador(es) ativo(s)</span>
              </p>
              <Link href="/logs" className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-1">
                Ver logs <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
            {op.recentLogs.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Nenhuma atividade registrada</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
                {op.recentLogs.map((log, i) => (
                  <div
                    key={log.id}
                    className={`flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100 lg:border-b-0 ${i % 4 !== 3 ? 'lg:border-r border-gray-100' : ''}`}
                  >
                    <div className="w-7 h-7 bg-[#030A8C] rounded-full flex items-center justify-center shrink-0">
                      <span className="text-white text-[10px] font-bold">{log.user.name.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-900 truncate">{log.user.name}</p>
                      <p className="text-[10px] text-gray-400 truncate">{log.action} · {log.module}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
