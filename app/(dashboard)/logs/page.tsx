import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/api-auth'
import Header from '@/components/layout/Header'
import { formatDateTime } from '@/lib/utils'

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string; module?: string }>
}) {
  // Logs de atividade: restritos a administradores.
  const user = await getSessionUser()
  if (!user || user.role !== 'ADMIN') redirect('/dashboard')

  const { userId, module } = await searchParams

  const [logs, users] = await Promise.all([
    prisma.activityLog.findMany({
      where: {
        ...(userId ? { userId } : {}),
        ...(module ? { module } : {}),
      },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  const modules = ['Clientes', 'Colaboradores', 'Demandas', 'Calendário', 'CRM', 'Financeiro']

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Logs de Atividade" subtitle="Registro de todas as ações no sistema" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {/* Filters */}
        <form className="flex flex-col sm:flex-row gap-3 sm:flex-wrap">
          <select name="userId" defaultValue={userId || ''} className="input text-sm w-full sm:w-auto sm:max-w-[200px]">
            <option value="">Todos os colaboradores</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <select name="module" defaultValue={module || ''} className="input text-sm w-full sm:w-auto sm:max-w-[200px]">
            <option value="">Todos os módulos</option>
            {modules.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <button type="submit"
            className="w-full sm:w-auto px-4 py-2 bg-[#030A8C] text-white rounded-lg text-sm font-medium hover:bg-[#02077a] transition-colors">
            Filtrar
          </button>
        </form>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">Colaborador</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">Ação</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide hidden md:table-cell">Módulo</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide hidden lg:table-cell">Detalhes</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">Data/Hora</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-gray-500 text-sm">
                    Nenhum log encontrado
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-[#030A8C] rounded-full flex items-center justify-center shrink-0">
                          <span className="text-white text-xs font-bold">{log.user.name.charAt(0)}</span>
                        </div>
                        <span className="text-sm font-medium text-gray-900">{log.user.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{log.action}</td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs bg-[#030A8C]/10 text-[#030A8C] px-2 py-1 rounded-full font-medium">
                        {log.module}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-sm text-gray-500 max-w-[200px] truncate">
                      {log.details || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {formatDateTime(log.createdAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </div>
  )
}
