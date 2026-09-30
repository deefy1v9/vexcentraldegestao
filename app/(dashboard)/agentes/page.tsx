import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/api-auth'
import Header from '@/components/layout/Header'
import AgentsPanel from '@/components/agentes/AgentsPanel'

export default async function AgentesPage() {
  // Quem comanda a IA da agência é administrador.
  const viewer = await getSessionUser()
  if (!viewer || viewer.role !== 'ADMIN') redirect('/dashboard')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Agentes" subtitle="Assistentes de IA que atendem no WhatsApp da agência" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <AgentsPanel />
      </div>
    </div>
  )
}
