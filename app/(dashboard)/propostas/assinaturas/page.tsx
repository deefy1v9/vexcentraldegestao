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
 * Contratos para assinar por link: a VEX sobe o PDF, escolhe quem assina pela
 * VEX e pelo cliente, e cada um assina no próprio celular com nome, CPF e o
 * código que chega no próprio WhatsApp.
 */
export default async function AssinaturasPage() {
  const viewer = await getSessionUser()
  if (!viewer || viewer.role !== 'ADMIN') redirect('/dashboard')

  const [contratos, clientes, representantes] = await Promise.all([
    prisma.contractSignature.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true, token: true, title: true, status: true, signerPhone: true, createdAt: true,
        companySignerName: true, sentAt: true, openedAt: true, signedAt: true, signerName: true, signerCpfMasked: true,
        client: { select: { id: true, name: true } },
        signers: { orderBy: { ordem: 'asc' }, select: { id: true, token: true, role: true, name: true, phone: true, status: true, sentAt: true, openedAt: true, signedAt: true } },
      },
    }),
    prisma.client.findMany({ where: { status: { not: 'ENCERRADO' } }, orderBy: { name: 'asc' }, select: { id: true, name: true, phone: true } }),
    prisma.user.findMany({ where: { role: 'ADMIN', isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, phone: true } }),
  ])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Assinaturas" subtitle="Contratos para assinar pelo link, cada um no próprio celular" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <ProposalsNav showNew={false} />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,8fr)_minmax(0,4fr)] items-start">
          <ListaDeContratos
            contratos={contratos.map((c) => ({
              id: c.id,
              titulo: c.title,
              status: c.status,
              cliente: c.client ? { id: c.client.id, nome: c.client.name } : null,
              criadoEm: c.createdAt.toISOString(),
              preparadoPor: c.companySignerName,
              assinantes: c.signers.length
                ? c.signers.map((s) => ({
                    id: s.id, token: s.token, papel: s.role, nome: s.name, whatsapp: mascararTelefone(s.phone), status: s.status,
                    enviadoEm: s.sentAt?.toISOString() ?? null, abertoEm: s.openedAt?.toISOString() ?? null, assinadoEm: s.signedAt?.toISOString() ?? null,
                  }))
                // Contrato antigo, de um assinante só
                : [{
                    id: null, token: c.token, papel: 'CONTRATANTE', nome: c.signerName ?? 'Contratante', whatsapp: mascararTelefone(c.signerPhone), status: c.status === 'ASSINADO' ? 'ASSINADO' : 'AGUARDANDO',
                    enviadoEm: c.sentAt?.toISOString() ?? null, abertoEm: c.openedAt?.toISOString() ?? null, assinadoEm: c.signedAt?.toISOString() ?? null,
                  }],
            }))}
          />
          <NovoContrato
            clientes={clientes.map((c) => ({ id: c.id, name: c.name, phone: c.phone ?? '' }))}
            representantes={representantes.map((u) => ({ id: u.id, name: u.name, phone: u.phone ?? '' }))}
          />
        </div>
      </div>
    </div>
  )
}
