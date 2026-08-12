import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/api-auth'
import Header from '@/components/layout/Header'
import CrmPanel from '@/components/crm/CrmPanel'

export default async function CrmPage() {
  // Conversas com clientes: restrito a administradores.
  const viewer = await getSessionUser()
  if (!viewer || viewer.role !== 'ADMIN') redirect('/dashboard')

  const [contacts, clients] = await Promise.all([
    prisma.crmContact.findMany({
      include: {
        client: { select: { id: true, name: true, phone: true } },
        conversations: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
          include: {
            messages: { orderBy: { sentAt: 'desc' }, take: 1 },
          },
        },
      },
      orderBy: { lastMessage: { sort: 'desc', nulls: 'last' } },
    }),
    prisma.client.findMany({
      where: { status: 'ATIVO', crmContact: null },
      select: { id: true, name: true, phone: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="CRM — WhatsApp" subtitle="Gestão de conversas via UAZAPI" />
      <CrmPanel initialContacts={contacts} availableClients={clients} />
    </div>
  )
}
