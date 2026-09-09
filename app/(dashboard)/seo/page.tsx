import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import Header from '@/components/layout/Header'
import SeoPanel from '@/components/seo/SeoPanel'

/**
 * SEO: Google Search Console. Nesta etapa é exclusivo de CEO e administrador
 * — a permissão é validada aqui e de novo em cada rota da API.
 */
export default async function SeoPage() {
  const viewer = await getSessionUser()
  if (!viewer) redirect('/login')
  if (viewer.role !== 'ADMIN') redirect('/dashboard')

  const clientes = await prisma.client.findMany({
    where: { status: 'ATIVO' },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="SEO" subtitle="Google Search Console: propriedades, cliques e posições" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <Suspense fallback={<p className="text-sm text-gray-400">Carregando SEO…</p>}>
          <SeoPanel clientes={clientes} />
        </Suspense>
      </div>
    </div>
  )
}
