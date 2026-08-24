import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/api-auth'
import Header from '@/components/layout/Header'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import { Plus, Mail, Phone, Pencil } from 'lucide-react'

export default async function ColaboradoresPage() {
  // Equipe, salários e contatos: restrito a administradores.
  const viewer = await getSessionUser()
  if (!viewer || viewer.role !== 'ADMIN') redirect('/dashboard')

  const users = await prisma.user.findMany({
    where: { isActive: true },
    include: {
      _count: { select: { assignedTasks: true, activityLogs: true } },
    },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Colaboradores" subtitle={`${users.length} colaborador(es) ativo(s)`} />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="flex justify-end mb-4 sm:mb-6">
          <Link
            href="/colaboradores/novo"
            className="flex items-center justify-center gap-2 w-full sm:w-auto bg-[#030A8C] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#02077a] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Novo Colaborador
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map((user) => (
            <div key={user.id} className="bg-white rounded-2xl border border-gray-200 p-5 hover:border-[#030A8C] hover:bg-gray-50 transition-all group">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 bg-[#030A8C] rounded-full flex items-center justify-center shrink-0">
                  <span className="text-white font-bold text-base">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-gray-900 text-sm truncate">{user.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                      user.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-[#030A8C]/10 text-[#030A8C]'
                    }`}>
                      {user.role}
                    </span>
                  </div>
                  {user.position && (
                    <p className="text-xs text-gray-500 mt-0.5">{user.position}</p>
                  )}
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Mail className="w-3 h-3" />
                      <span className="truncate">{user.email}</span>
                    </div>
                    {user.phone && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Phone className="w-3 h-3" />
                        <span>{user.phone}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-gray-500">
                        <span className="font-semibold text-gray-900">{user._count.assignedTasks}</span> tarefas
                      </span>
                      {user.salary && (
                        <span className="text-gray-500">
                          <span className="font-semibold text-gray-900">{formatCurrency(user.salary)}</span>/mês
                        </span>
                      )}
                    </div>
                    <Link
                      href={`/colaboradores/${user.id}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#030A8C]/10 text-[#030A8C] rounded-lg text-xs font-medium hover:bg-[#030A8C] hover:text-white transition-colors"
                    >
                      <Pencil className="w-3 h-3" />
                      Editar
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
