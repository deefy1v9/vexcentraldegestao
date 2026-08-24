import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Header from '@/components/layout/Header'
import { formatCurrency, formatDate } from '@/lib/utils'
import Link from 'next/link'
import { ArrowLeft, Globe, Mail, Instagram, Facebook, Lock, Eye } from 'lucide-react'
import ClientCredentialsPanel from '@/components/clientes/ClientCredentialsPanel'
import { decryptSecret } from '@/lib/crypto'

const CRED_ICONS: Record<string, React.ElementType> = {
  wordpress: Globe,
  email: Mail,
  instagram: Instagram,
  facebook: Facebook,
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      credentials: true,
      services: true,
      calendarEvents: { orderBy: { startDate: 'asc' }, take: 5 },
      payments: { orderBy: { dueDate: 'desc' }, take: 6 },
    },
  })

  if (!client) notFound()

  // As senhas ficam cifradas no banco (AES-256-GCM). Sem descriptografar aqui,
  // o cofre exibia o texto cifrado 'enc:v1:...' em vez da senha real.
  const credentials = client.credentials.map((c) => ({
    ...c,
    password: decryptSecret(c.password),
  }))

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title={client.name} subtitle={client.niche || 'Cliente'} />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <Link href="/clientes" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" /> Voltar para Clientes
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main info */}
          <div className="lg:col-span-2 space-y-4">
            {/* Info Card */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">Dados do Cliente</h2>
                <Link href={`/clientes/${id}/editar`}
                  className="text-xs text-[#030A8C] hover:underline font-medium">
                  Editar
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {[
                  ['CNPJ', client.cnpj || '—'],
                  ['Email', client.email || '—'],
                  ['Telefone', client.phone || '—'],
                  ['Nicho', client.niche || '—'],
                  ['Início do Contrato', client.contractStart ? formatDate(client.contractStart) : '—'],
                  ['Fim do Contrato', client.contractEnd ? formatDate(client.contractEnd) : '—'],
                  ['Duração', client.contractMonths ? `${client.contractMonths} meses` : '—'],
                  ['Valor Mensal', client.monthlyValue ? formatCurrency(client.monthlyValue) : '—'],
                  ['Dia de Pagamento', client.paymentDay ? `Dia ${client.paymentDay}` : '—'],
                  ['Status', client.status],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-gray-500 font-medium">{label}</p>
                    <p className="text-gray-900 mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
              {client.notes && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs text-gray-500 font-medium mb-1">Observações</p>
                  <p className="text-sm text-gray-700">{client.notes}</p>
                </div>
              )}
            </div>

            {/* Services */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Serviços Contratados</h2>
              {client.services.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhum serviço cadastrado</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {client.services.map((s) => (
                    <span key={s.id} className="bg-[#030A8C]/10 text-[#030A8C] text-sm px-3 py-1.5 rounded-lg font-medium">
                      {s.serviceName}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Credentials */}
            <ClientCredentialsPanel clientId={id} initialCredentials={credentials} />
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Events */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-3 text-sm">Próximas Entregas</h2>
              {client.calendarEvents.length === 0 ? (
                <p className="text-xs text-gray-500">Nenhuma entrega próxima</p>
              ) : (
                <div className="space-y-2">
                  {client.calendarEvents.map((ev) => (
                    <div key={ev.id} className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#030A8C] mt-1.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{ev.title}</p>
                        <p className="text-xs text-gray-500">{formatDate(ev.startDate)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Payments */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-3 text-sm">Histórico de Pagamentos</h2>
              {client.payments.length === 0 ? (
                <p className="text-xs text-gray-500">Nenhum pagamento cadastrado</p>
              ) : (
                <div className="space-y-2">
                  {client.payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-gray-700">
                          {p.month.toString().padStart(2, '0')}/{p.year}
                        </p>
                        <p className="text-xs text-gray-500">{formatCurrency(p.amount)}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        p.status === 'PAGO' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                        {p.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
