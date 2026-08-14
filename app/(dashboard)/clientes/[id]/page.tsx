import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Header from '@/components/layout/Header'
import { formatCurrency, formatDate } from '@/lib/utils'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import ClientCredentialsPanel from '@/components/clientes/ClientCredentialsPanel'
import ClientServicesPanel from '@/components/clientes/ClientServicesPanel'
import TierBadge from '@/components/ui/TierBadge'

const TIER_PT: Record<string, string> = { START: 'Start', GROWTH: 'Growth', SCALE: 'Scale' }
const TIER_PRIORITY_PT: Record<string, string> = {
  SCALE: 'Máxima — cliente de maior valor',
  GROWTH: 'Intermediária',
  START: 'Padrão',
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [session, { id }] = await Promise.all([auth(), params])
  const isAdmin = (session?.user as any)?.role === 'ADMIN'

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      credentials: true,
      services: {
        include: {
          payments: {
            select: { id: true, status: true, amount: true, dueDate: true },
            orderBy: { dueDate: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
      calendarEvents: { orderBy: { startDate: 'asc' }, take: 5 },
      payments: { orderBy: { dueDate: 'desc' }, take: 6 },
      tierHistory: { orderBy: { createdAt: 'desc' }, take: 8 },
    },
  })

  if (!client) notFound()

  // Valor total mensal: calculado pela soma dos serviços ativos, nunca manual
  const activeServices = client.services.filter((s) => s.status === 'ATIVO')
  const totalMensal = activeServices.reduce((sum, s) => sum + (s.monthlyValue ?? 0), 0)

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
            {/* Segmentação */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-1">Grupo do cliente</p>
                  <div className="flex items-center gap-2">
                    <TierBadge tier={client.tier} size="sm" />
                    {!client.tier && <span className="text-sm text-gray-400">Não classificado</span>}
                    <span className="text-[10px] text-gray-400">
                      {client.tier ? (client.tierManual ? 'definido manualmente' : 'classificação automática') : ''}
                    </span>
                  </div>
                </div>
                {isAdmin && (
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-1">Ticket mensal</p>
                    <p className="text-sm font-bold text-gray-900">{formatCurrency(totalMensal)}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-1">Serviços ativos</p>
                  <p className="text-sm font-bold text-gray-900">{activeServices.length}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-1">Prioridade operacional</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {client.tier ? TIER_PRIORITY_PT[client.tier] : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-1">Última alteração de grupo</p>
                  <p className="text-sm text-gray-700">
                    {client.tierChangedAt ? formatDate(client.tierChangedAt) : '—'}
                  </p>
                </div>
              </div>

              {/* Histórico de grupo — só administradores */}
              {isAdmin && client.tierHistory.length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500 font-medium mb-2">Histórico de alterações</p>
                  <div className="space-y-1">
                    {client.tierHistory.map((h) => (
                      <p key={h.id} className="text-[11px] text-gray-500">
                        {formatDate(h.createdAt)} · {h.fromTier ? TIER_PT[h.fromTier] : 'Sem grupo'} → {h.toTier ? TIER_PT[h.toTier] : 'Sem grupo'}
                        {' '}· ticket {formatCurrency(h.ticket)} · {h.manual ? 'manual' : 'automática'}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Info Card */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">Dados do Cliente</h2>
                {isAdmin && (
                  <Link href={`/clientes/${id}/editar`}
                    className="text-xs text-[#030A8C] hover:underline font-medium">
                    Editar
                  </Link>
                )}
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
                  // Valores financeiros são exclusivos de administradores
                  ...(isAdmin ? [['Valor Total Mensal', formatCurrency(totalMensal)] as [string, string]] : []),
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

            {/* Services — colaborador vê os serviços sem nenhum valor financeiro */}
            <ClientServicesPanel
              clientId={id}
              initialServices={
                isAdmin
                  ? client.services
                  : client.services.map((s) => ({
                      ...s,
                      monthlyValue: null,
                      totalContractValue: null,
                      payments: [],
                    }))
              }
              isAdmin={isAdmin}
            />

            {/* Credentials — senhas dos clientes, só administradores */}
            {isAdmin && (
              <ClientCredentialsPanel clientId={id} initialCredentials={client.credentials} />
            )}
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

            {/* Payments — financeiro é exclusivo de administradores */}
            {isAdmin && (
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
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
