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
  // selecionado — a navegação de período não recarrega a página. O cabeçalho
  // fica dentro do painel, porque o período e as ações do mês ficam nele.
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* O painel lê a competência da URL (useSearchParams) */}
      <Suspense fallback={(
        <>
          <Header title="Financeiro" subtitle="Controle financeiro por mês" />
          <div className="flex-1 px-4 sm:px-8 py-6 text-sm text-muted-foreground">Carregando financeiro…</div>
        </>
      )}>
        <FinanceiroPanel />
      </Suspense>
    </div>
  )
}
