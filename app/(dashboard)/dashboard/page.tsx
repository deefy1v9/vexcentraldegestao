import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Header from '@/components/layout/Header'
import DashboardIndicators from '@/components/dashboard/DashboardIndicators'
import RevenueChart from '@/components/dashboard/RevenueChart'
import PortfolioSegmentation from '@/components/dashboard/PortfolioSegmentation'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Building2, Kanban, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'

async function getDashboardData(viewer: { id: string; isAdmin: boolean }) {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  // Admin vê os números da agência inteira; colaborador, só o que é dele.
  const taskScope = viewer.isAdmin ? {} : { assigneeId: viewer.id }

  const [
    totalClients,
    inactiveClients,
    totalUsers,
    pendingTasks,
    inProgressTasks,
    doneTasks,
    monthPayments,
    upcomingEvents,
    recentLogs,
    recentTasks,
    serviceRevenueAgg,
    recebidaAgg,
    pendenteAgg,
    atrasadaAgg,
    activeClients,
    clientsWithServices,
  ] = await Promise.all([
    prisma.client.count(),
    prisma.client.count({ where: { status: 'INATIVO' } }),
    prisma.user.count({ where: { isActive: true } }),
    prisma.task.count({ where: { status: 'TODO', ...taskScope } }),
    prisma.task.count({ where: { status: 'EM_ANDAMENTO', ...taskScope } }),
    prisma.task.count({ where: { status: 'CONCLUIDO', ...taskScope } }),
    prisma.clientPayment.findMany({
      where: { month, year },
      include: { client: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
    }),
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
    // Colaborador só enxerga as demandas atribuídas a ele.
    prisma.task.findMany({
      where: { status: { not: 'CONCLUIDO' }, ...taskScope },
      include: {
        assignee: { select: { name: true } },
        client: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 6,
    }),
    // Faturamento mensal (MRR): soma dos serviços ativos de clientes ativos.
    // Client.monthlyValue é mantido em sincronia com esta soma, então o
    // número bate com a coluna "Valor Mensal" da tela Clientes.
    prisma.clientService.aggregate({
      _sum: { monthlyValue: true },
      where: { status: 'ATIVO', client: { status: 'ATIVO' } },
    }),
    // Receita recebida (mês corrente)
    prisma.clientPayment.aggregate({
      _sum: { amount: true },
      where: { status: 'PAGO', month, year },
    }),
    // Receita pendente (dentro do prazo)
    prisma.clientPayment.aggregate({
      _sum: { amount: true },
      where: { status: 'PENDENTE', dueDate: { gte: startOfToday } },
    }),
    // Receita atrasada (vencida e não paga)
    prisma.clientPayment.aggregate({
      _sum: { amount: true },
      where: { status: 'PENDENTE', dueDate: { lt: startOfToday } },
    }),
    prisma.client.count({ where: { status: 'ATIVO' } }),
    // Ticket médio considera só clientes ativos que têm serviço ativo
    prisma.client.count({
      where: { status: 'ATIVO', services: { some: { status: 'ATIVO' } } },
    }),
  ])

  const mrr = serviceRevenueAgg._sum.monthlyValue ?? 0
  const arr = mrr * 12
  const recebida = recebidaAgg._sum.amount ?? 0
  const pendente = pendenteAgg._sum.amount ?? 0
  const atrasada = atrasadaAgg._sum.amount ?? 0
  const prevista = recebida + pendente + atrasada
  const ticketMedio = clientsWithServices > 0 ? mrr / clientsWithServices : 0
  const inadimplencia = prevista > 0 ? (atrasada / prevista) * 100 : 0

  const pendingRevenue = monthPayments
    .filter((p) => p.status === 'PENDENTE')
    .reduce((s, p) => s + p.amount, 0)

  // Tendências REAIS vs mês anterior (nunca inventadas): receita recebida
  // por competência e clientes novos por data de cadastro
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  const [prevRecebidaAgg, newClientsNow, newClientsPrev] = await Promise.all([
    prisma.clientPayment.aggregate({
      _sum: { amount: true },
      where: { status: 'PAGO', month: prevMonth, year: prevYear },
    }),
    prisma.client.count({ where: { createdAt: { gte: new Date(year, month - 1, 1) } } }),
    prisma.client.count({
      where: { createdAt: { gte: new Date(prevYear, prevMonth - 1, 1), lt: new Date(year, month - 1, 1) } },
    }),
  ])
  const recebidaPrev = prevRecebidaAgg._sum.amount ?? 0

  // Segmentação da carteira: clientes ativos por grupo + receita mensal
  const tierAgg = await prisma.client.groupBy({
    by: ['tier'],
    where: { status: 'ATIVO' },
    _count: { _all: true },
    _sum: { monthlyValue: true },
  })
  const segments = (['SCALE', 'GROWTH', 'START'] as const).map((t) => {
    const row = tierAgg.find((r) => r.tier === t)
    return { tier: t, count: row?._count._all ?? 0, revenue: row?._sum.monthlyValue ?? 0 }
  })

  return {
    segments,
    recebidaPrev,
    newClientsNow,
    newClientsPrev,
    totalClients,
    activeClients,
    inactiveClients,
    totalUsers,
    pendingTasks,
    inProgressTasks,
    doneTasks,
    mrr,
    arr,
    recebida,
    pendente,
    atrasada,
    prevista,
    ticketMedio,
    inadimplencia,
    clientsWithServices,
    pendingRevenue,
    monthPayments: monthPayments.slice(0, 5),
    upcomingEvents,
    recentLogs,
    recentTasks,
  }
}

const STATUS_LABEL: Record<string, string> = {
  TODO: 'A Fazer',
  EM_ANDAMENTO: 'Em Andamento',
  EM_REVISAO: 'Em Revisão',
  CONCLUIDO: 'Concluído',
  BACKLOG: 'Backlog',
}

const STATUS_DOT: Record<string, string> = {
  TODO: 'bg-blue-500',
  EM_ANDAMENTO: 'bg-yellow-500',
  EM_REVISAO: 'bg-purple-500',
  CONCLUIDO: 'bg-green-500',
  BACKLOG: 'bg-gray-400',
}

export default async function DashboardPage() {
  const session = await auth()
  const isAdmin = (session?.user as any)?.role === 'ADMIN'
  const d = await getDashboardData({ id: (session?.user as any)?.id, isAdmin })
  const firstName = session?.user?.name?.split(' ')[0]
  const now = new Date()
  const timeStr = now.toLocaleString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Dashboard" subtitle={timeStr} />

      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* Welcome */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Olá, {firstName} 👋</h2>
            <p className="text-sm text-gray-500 mt-0.5">Resumo da agência de hoje.</p>
          </div>
          <Link
            href="/demandas"
            className="flex items-center gap-2 bg-[#030A8C] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#02077a] transition-colors"
          >
            <Kanban className="w-4 h-4" />
            Ver Demandas
          </Link>
        </div>

        {/* Indicadores — admin: 4 principais + "Ver mais indicadores" + gráfico.
            Colaborador vê apenas clientes e as próprias demandas. */}
        {isAdmin ? (
          <>
            <DashboardIndicators d={d} />
            <PortfolioSegmentation segments={d.segments} total={d.mrr} />
            <RevenueChart />
          </>
        ) : (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            <Link
              href="/clientes"
              className="group bg-white border border-gray-100 rounded-xl p-5 hover:border-gray-200 transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#030A8C22' }}>
                  <Building2 className="w-4 h-4" style={{ color: '#030A8C' }} />
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 transition-colors" />
              </div>
              <p className="text-2xl font-bold text-gray-900 leading-none">{d.activeClients}</p>
              <p className="text-xs text-gray-500 mt-1">Clientes Ativos</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{d.totalClients} total</p>
            </Link>

            <Link
              href="/demandas"
              className="group bg-white border border-gray-100 rounded-xl p-5 hover:border-gray-200 transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#f59e0b22' }}>
                  <Kanban className="w-4 h-4" style={{ color: '#f59e0b' }} />
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 transition-colors" />
              </div>
              <p className="text-2xl font-bold text-gray-900 leading-none">{d.inProgressTasks}</p>
              <p className="text-xs text-gray-500 mt-1">Em Andamento</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{d.pendingTasks} a fazer</p>
            </Link>
          </div>
        )}

        {/* Middle columns */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Open tasks — ocupa a linha toda quando não há coluna de admin */}
          <div className={`${isAdmin ? 'lg:col-span-3' : 'lg:col-span-5'} bg-white border border-gray-100 rounded-xl overflow-hidden`}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
              <p className="font-semibold text-gray-900 text-sm">Demandas em Aberto</p>
              <Link href="/demandas" className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1">
                Ver todas <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
            {d.recentTasks.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-8">Nenhuma demanda em aberto</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {d.recentTasks.map((task) => (
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

          {/* Right column — 2 cols. Pagamentos e agenda são só de admin. */}
          {isAdmin && (
            <div className="lg:col-span-2 space-y-4">

              <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                  <p className="font-semibold text-gray-900 text-sm">Pagamentos do Mês</p>
                  <Link href="/financeiro" className="text-gray-400 hover:text-gray-600 transition-colors">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
                {d.monthPayments.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-5">Sem pagamentos este mês</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {d.monthPayments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between px-5 py-2.5">
                        <p className="text-xs text-gray-700 truncate flex-1 mr-2">{p.client.name}</p>
                        <div className="flex items-center gap-2 shrink-0">
                          <p className="text-xs font-semibold text-gray-900">{formatCurrency(p.amount)}</p>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                            p.status === 'PAGO' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                          }`}>
                            {p.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Upcoming events */}
              <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                  <p className="font-semibold text-gray-900 text-sm">Próximas Entregas</p>
                  <Link href="/calendario" className="text-gray-400 hover:text-gray-600 transition-colors">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
                {d.upcomingEvents.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-5">Nenhuma entrega próxima</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {d.upcomingEvents.map((ev) => (
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

        {/* Activity feed — expõe o que toda a equipe fez, então é só de admin */}
        {isAdmin && (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <p className="font-semibold text-gray-900 text-sm">Atividade Recente</p>
            <Link href="/logs" className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-1">
              Ver logs <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          {d.recentLogs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Nenhuma atividade registrada</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
              {d.recentLogs.map((log, i) => (
                <div
                  key={log.id}
                  className={`flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100 lg:border-b-0 ${
                    i % 4 !== 3 ? 'lg:border-r border-gray-100' : ''
                  }`}
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
