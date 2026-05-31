import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/api-auth'
import Header from '@/components/layout/Header'
import FinanceiroPanel from '@/components/financeiro/FinanceiroPanel'

export default async function FinanceiroPage() {
  // Página financeira: restrita a administradores.
  const user = await getSessionUser()
  if (!user || user.role !== 'ADMIN') redirect('/dashboard')

  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0, 23, 59, 59)

  const [entries, clientPayments, salaries, serviceRevenueAgg] = await Promise.all([
    prisma.financialEntry.findMany({
      where: { date: { gte: start, lte: end } },
      orderBy: { date: 'desc' },
    }),
    prisma.clientPayment.findMany({
      where: { month, year },
      include: { client: { select: { id: true, name: true } } },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.user.findMany({
      where: { isActive: true, salary: { not: null } },
      select: { id: true, name: true, position: true, salary: true },
    }),
    prisma.clientService.aggregate({
      _sum: { monthlyValue: true },
      where: { status: 'ATIVO', client: { status: 'ATIVO' } },
    }),
  ])

  const serviceRevenue = serviceRevenueAgg._sum.monthlyValue ?? 0

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Financeiro" subtitle={`Controle financeiro — ${month.toString().padStart(2,'0')}/${year}`} />
      <FinanceiroPanel
        initialEntries={entries}
        initialPayments={clientPayments}
        salaries={salaries}
        serviceRevenue={serviceRevenue}
        month={month}
        year={year}
      />
    </div>
  )
}
