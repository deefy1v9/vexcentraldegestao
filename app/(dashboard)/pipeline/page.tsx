import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/api-auth'
import Header from '@/components/layout/Header'
import PipelineBoard from '@/components/pipeline/PipelineBoard'

/**
 * Pipeline comercial: leads, negociações e conversão em cliente.
 * Administrador enxerga tudo; colaborador vê apenas as próprias negociações
 * (o filtro real acontece no servidor, em /api/pipeline).
 */
export default async function PipelinePage() {
  const viewer = await getSessionUser()
  if (!viewer) redirect('/login')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Pipeline" subtitle="Leads, negociações e fechamento comercial" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <PipelineBoard isAdmin={viewer.role === 'ADMIN'} currentUserId={viewer.id} />
      </div>
    </div>
  )
}
