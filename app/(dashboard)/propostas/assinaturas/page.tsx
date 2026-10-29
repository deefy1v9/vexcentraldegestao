import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import Header from '@/components/layout/Header'
import ProposalsNav from '@/components/propostas/ProposalsNav'
import NovoContrato from '@/components/assinaturas/NovoContrato'
import ListaDeContratos from '@/components/assinaturas/ListaDeContratos'
import { mascararTelefone } from '@/lib/assinatura-core'

export const dynamic = 'force-dynamic'

/**
 * Contratos para assinar por link: a VEX sobe o PDF e assina do lado dela;
 * o cliente assina com nome, CPF e o código que chega no WhatsApp.
 */
export default async function AssinaturasPage() {
  const viewer = await getSessionUser()
  if (!viewer || viewer.role !== 'ADMIN') redirect('/dashboard')

  const [contratos, clientes] = await Promise.all([
    prisma.contractSignature.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true, token: true, title: true, status: true, fileName: true, signerPhone: true, createdAt: true,
        companySignerName: true, sentAt: true, openedAt: true, signedAt: true, signerName: true, signerCpfMasked: true,
        client: { select: { id: true, name: true } },
      },
    }),
    prisma.client.findMany({ where: { status: { not: 'ENCERRADO' } }, orderBy: { name: 'asc' }, select: { id: true, name: true, phone: true } }),
  ])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Assinaturas" subtitle="Contratos para o cliente assinar pelo link" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <ProposalsNav showNew={false} />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,8fr)_minmax(0,4fr)] items-start">
          <ListaDeContratos
            contratos={contratos.map((c) => ({
              id: c.id,
              token: c.token,
              titulo: c.title,
              status: c.status,
              arquivo: c.fileName,
              whatsapp: mascararTelefone(c.signerPhone),
              cliente: c.client ? { id: c.client.id, nome: c.client.name } : null,
              criadoEm: c.createdAt.toISOString(),
              vex: c.companySignerName,
              enviadoEm: c.sentAt?.toISOString() ?? null,
              abertoEm: c.openedAt?.toISOString() ?? null,
              assinadoEm: c.signedAt?.toISOString() ?? null,
              assinante: c.signerName ? `${c.signerName} (CPF ${c.signerCpfMasked})` : null,
            }))}
          />
          <NovoContrato clientes={clientes.map((c) => ({ id: c.id, name: c.name, phone: c.phone ?? '' }))} />
        </div>
      </div>
    </div>
  )
}
