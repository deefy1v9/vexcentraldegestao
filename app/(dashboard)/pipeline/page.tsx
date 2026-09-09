import { Suspense } from 'react'
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
      {/* Sem overflow aqui: quem rola é o quadro, para o Kanban ocupar toda
          a altura que sobra do cabeçalho */}
      <div className="flex-1 min-h-0 flex flex-col p-4 sm:p-6">
        {/* O quadro guarda filtros e visualização na URL (useSearchParams) */}
        <Suspense fallback={<p className="text-sm text-gray-400">Carregando pipeline…</p>}>
          <PipelineBoard isAdmin={viewer.role === 'ADMIN'} currentUserId={viewer.id} />
        </Suspense>
      </div>
    </div>
  )
}
