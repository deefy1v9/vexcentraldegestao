import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/api-auth'
import Header from '@/components/layout/Header'
import PipelineBoard from '@/components/pipeline/PipelineBoard'

/**
 * Pipeline comercial: leads, negociações e conversão em cliente.
 * Acesso exclusivo de administradores, no menu, na página e na API.
 */
export default async function PipelinePage() {
  // Pipeline comercial é de administrador: colaborador nem chega à página
  const viewer = await getSessionUser()
  if (!viewer) redirect('/api/sessao-expirada')
  if (viewer.role !== 'ADMIN') redirect('/dashboard')

  return (
    // Sem overflow no conteúdo: quem rola é o quadro, para o Kanban ocupar
    // toda a altura que sobra do cabeçalho. O cabeçalho mora no quadro, porque
    // o "Novo lead" abre o formulário que vive nele.
    <div className="flex flex-col h-full overflow-hidden">
      {/* O quadro guarda filtros e visualização na URL (useSearchParams) */}
      <Suspense fallback={
        <>
          <Header title="Pipeline" subtitle="Leads, negociações e fechamento comercial" />
          <p className="px-4 sm:px-8 text-sm text-subtle">Carregando pipeline…</p>
        </>
      }>
        <PipelineBoard isAdmin={viewer.role === 'ADMIN'} currentUserId={viewer.id} />
      </Suspense>
    </div>
  )
}
