import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/api-auth'
import Header from '@/components/layout/Header'
import FinanceiroPanel from '@/components/financeiro/FinanceiroPanel'

export default async function FinanceiroPage() {
  // Página financeira: restrita a administradores.
  const user = await getSessionUser()
  if (!user || user.role !== 'ADMIN') redirect('/dashboard')

  // Os dados são carregados pelo painel via /api/financeiro conforme o mês
  // selecionado — a navegação de período não recarrega a página.
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Financeiro" subtitle="Controle financeiro por mês" />
      {/* O painel lê a competência da URL (useSearchParams) */}
      <Suspense fallback={<div className="flex-1 p-6 text-sm text-gray-400">Carregando financeiro…</div>}>
        <FinanceiroPanel />
      </Suspense>
    </div>
  )
}
