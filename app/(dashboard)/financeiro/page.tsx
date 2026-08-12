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
      <FinanceiroPanel />
    </div>
  )
}
