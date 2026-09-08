import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/api-auth'
import Header from '@/components/layout/Header'
import ServiceCatalogPanel from '@/components/servicos/ServiceCatalogPanel'

export default async function ServicosPage() {
  // Catálogo do que a VEX oferece — gestão exclusiva de administradores.
  const viewer = await getSessionUser()
  if (!viewer || viewer.role !== 'ADMIN') redirect('/dashboard')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Serviços" subtitle="Catálogo de serviços da VEX — escopo, faixa de preço e clientes" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <ServiceCatalogPanel />
      </div>
    </div>
  )
}
