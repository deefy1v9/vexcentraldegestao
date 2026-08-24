import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/api-auth'
import Header from '@/components/layout/Header'
import FiscalConfigPanel from '@/components/financeiro/FiscalConfigPanel'

export default async function FiscalConfigPage() {
  const user = await getSessionUser()
  if (!user || user.role !== 'ADMIN') redirect('/dashboard')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Configuração fiscal" subtitle="Dados do prestador para emissão de NFS-e (Focus NFe)" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <FiscalConfigPanel />
      </div>
    </div>
  )
}
