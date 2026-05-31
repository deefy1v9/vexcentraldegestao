import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Header from '@/components/layout/Header'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Users, Building2, DollarSign, Kanban, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'

async function getDashboardData() {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const [
    totalClients,
    activeClients,
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
  ] = await Promise.all([
    prisma.client.count(),
    prisma.client.count({ where: { status: 'ATIVO' } }),
    prisma.client.count({ where: { status: 'INATIVO' } }),
    prisma.user.count({ where: { isActive: true } }),
    prisma.task.count({ where: { status: 'TODO' } }),
    prisma.task.count({ where: { status: 'EM_ANDAMENTO' } }),
    prisma.task.count({ where: { status: 'CONCLUIDO' } }),
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
    prisma.task.findMany({
      where: { status: { not: 'CONCLUIDO' } },
      include: {
        assignee: { select: { name: true } },
        client: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 6,
    }),
    prisma.clientService.aggregate({
      _sum: { monthlyValue: true },
      where: { status: 'ATIVO', client: { status: 'ATIVO' } },
    }),
  ])

  const serviceRevenue = serviceRevenueAgg._sum.monthlyValue ?? 0

  const pendingRevenue = monthPayments
    .filter((p) => p.status === 'PENDENTE')
    .reduce((s, p) => s + p.amount, 0)

  return {
    totalClients, activeClients, inactiveClients,
    totalUsers, pendingTasks, inProgressTasks, doneTasks,
    serviceRevenue, pendingRevenue,
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
  const d = await getDashboardData()
  const firstName = session?.user?.name?.split(' ')[0]
  const now = new Date()
  const timeStr = now.toLocaleString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Dashboard" subtitle={timeStr} />

      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* Welcome + action */}
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

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Clientes Ativos', value: String(d.activeClients), sub: `${d.totalClients} total`, icon: Building2, href: '/clientes', color: '#030A8C' },
            { label: 'Faturamento', value: formatCurrency(d.serviceRevenue), sub: `${formatCurrency(d.pendingRevenue)} pendente`, icon: DollarSign, href: '/financeiro', color: '#10b981' },
            { label: 'Em Andamento', value: String(d.inProgressTasks), sub: `${d.pendingTasks} a fazer`, icon: Kanban, href: '/demandas', color: '#f59e0b' },
            { label: 'Colaboradores', value: String(d.totalUsers), sub: 'ativos', icon: Users, href: '/colaboradores', color: '#8b5cf6' },
          ].map((s) => (
            <Link
              key={s.label}
              href={s.href}
              className="group bg-white border border-gray-100 rounded-xl p-5 hover:border-gray-200 transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: s.color + '22' }}>
                  <s.icon className="w-4 h-4" style={{ color: s.color }} />
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 transition-colors" />
              </div>
              <p className="text-2xl font-bold text-gray-900 leading-none">{s.value}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{s.sub}</p>
            </Link>
          ))}
        </div>

        {/* Middle columns */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Open tasks — 3 cols */}
          <div className="lg:col-span-3 bg-white border border-gray-100 rounded-xl overflow-hidden">
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

          {/* Right column — 2 cols */}
          <div className="lg:col-span-2 space-y-4">

            {/* Payments */}
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
        </div>

        {/* Activity feed */}
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

      </div>
    </div>
  )
}
