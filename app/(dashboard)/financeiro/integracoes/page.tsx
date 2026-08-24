import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/api-auth'
import Header from '@/components/layout/Header'
import IntegrationsDiagnostics from '@/components/financeiro/IntegrationsDiagnostics'

export default async function IntegracoesPage() {
  const user = await getSessionUser()
  if (!user || user.role !== 'ADMIN') redirect('/dashboard')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Diagnóstico das integrações" subtitle="Asaas e Focus NFe — status, webhooks e pendências" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <IntegrationsDiagnostics />
      </div>
    </div>
  )
}
