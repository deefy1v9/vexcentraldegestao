import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Header from '@/components/layout/Header'
import { formatCurrency, formatDate } from '@/lib/utils'
import Link from 'next/link'
import { ArrowLeft, Pencil } from 'lucide-react'
import ClientCredentialsPanel from '@/components/clientes/ClientCredentialsPanel'
import ClientServicesPanel from '@/components/clientes/ClientServicesPanel'
import ClientProfileTabs from '@/components/clientes/ClientProfileTabs'
import ClientEmailActions from '@/components/clientes/ClientEmailActions'
import TierBadge from '@/components/ui/TierBadge'
import { missingBillingFields } from '@/lib/billing-core'

const TIER_PT: Record<string, string> = { START: 'Start', GROWTH: 'Growth', SCALE: 'Scale' }
const TIER_PRIORITY_PT: Record<string, string> = {
  SCALE: 'Máxima — cliente de maior valor',
  GROWTH: 'Intermediária',
  START: 'Padrão',
}

const CHARGE_STATUS_PT: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Aguardando pagamento', cls: 'bg-orange-100 text-orange-700' },
  CONFIRMED: { label: 'Confirmado', cls: 'bg-green-100 text-green-700' },
  RECEIVED: { label: 'Recebido', cls: 'bg-green-100 text-green-700' },
  OVERDUE: { label: 'Vencido', cls: 'bg-red-100 text-red-700' },
  REFUNDED: { label: 'Estornado', cls: 'bg-red-100 text-red-700' },
  CANCELLED: { label: 'Cancelado', cls: 'bg-gray-100 text-gray-600' },
  DELETED: { label: 'Cancelado', cls: 'bg-gray-100 text-gray-600' },
  ERROR: { label: 'Erro', cls: 'bg-red-100 text-red-700' },
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
      payments: { orderBy: { dueDate: 'desc' }, take: 24 },
      tierHistory: { orderBy: { createdAt: 'desc' }, take: 10 },
      asaasCharges: { orderBy: [{ year: 'desc' }, { month: 'desc' }], take: 12, include: { nfse: true } },
      tasks: {
        where: { status: { not: 'CONCLUIDO' } },
        include: { assignee: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 6,
      },
    },
  })

  if (!client) notFound()

  // Valor total mensal: calculado pela soma dos serviços ativos, nunca manual
  const activeServices = client.services.filter((s) => s.status === 'ATIVO')
  const totalMensal = activeServices.reduce((sum, s) => sum + (s.monthlyValue ?? 0), 0)
  const billingMissing = missingBillingFields(client)
  const nextCharge = client.asaasCharges.find((c) => ['PENDING', 'OVERDUE'].includes(c.status))
  const sanitizedServices = isAdmin
    ? client.services
    : client.services.map((s) => ({ ...s, monthlyValue: null, totalContractValue: null, payments: [] }))

  /* ------------------------------ seções (server) ------------------------------ */

  const infoCard = (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">Dados do Cliente</h2>
        {isAdmin && (
          <Link href={`/clientes/${id}/editar`} className="flex items-center gap-1 text-xs text-[#030A8C] hover:underline font-medium">
            <Pencil className="w-3 h-3" /> Editar
          </Link>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
        {([
          ['CNPJ/CPF', client.cnpj || '—'],
          ['Email', client.email || '—'],
          ['Telefone', client.phone || '—'],
          ['Nicho', client.niche || '—'],
          ['Início do Contrato', client.contractStart ? formatDate(client.contractStart) : '—'],
          ['Fim do Contrato', client.contractEnd ? formatDate(client.contractEnd) : '—'],
          ['Duração', client.contractMonths ? `${client.contractMonths} meses` : '—'],
          ...(isAdmin ? [['Valor Total Mensal', formatCurrency(totalMensal)] as [string, string]] : []),
          ['Dia de Pagamento', client.paymentDay ? `Dia ${client.paymentDay}` : '—'],
          ['Status', client.status],
        ] as [string, string][]).map(([label, value]) => (
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
  )

  const segmentCard = (
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
          <p className="text-sm font-semibold text-gray-900">{client.tier ? TIER_PRIORITY_PT[client.tier] : '—'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 font-medium mb-1">Última alteração de grupo</p>
          <p className="text-sm text-gray-700">{client.tierChangedAt ? formatDate(client.tierChangedAt) : '—'}</p>
        </div>
      </div>
    </div>
  )

  const deliveriesCard = (
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
  )

  const tasksCard = (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="font-semibold text-gray-900 mb-3 text-sm">Demandas em andamento</h2>
      {client.tasks.length === 0 ? (
        <p className="text-xs text-gray-500">Nenhuma demanda aberta</p>
      ) : (
        <div className="space-y-2">
          {client.tasks.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2">
              <p className="text-sm text-gray-900 truncate">#{t.number} {t.title}</p>
              <span className="text-[11px] text-gray-400 shrink-0">{t.assignee?.name?.split(' ')[0] ?? '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const paymentsList = (limit?: number) => {
    const rows = limit ? client.payments.slice(0, limit) : client.payments
    return rows.length === 0 ? (
      <p className="text-xs text-gray-500">Nenhum pagamento cadastrado</p>
    ) : (
      <div className="space-y-2">
        {rows.map((p) => (
          <div key={p.id} className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-700">{p.month.toString().padStart(2, '0')}/{p.year}</p>
              <p className="text-xs text-gray-500">{formatCurrency(p.amount)}</p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === 'PAGO' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
              {p.status}
            </span>
          </div>
        ))}
      </div>
    )
  }

  const billingSection = isAdmin ? (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Faturamento e NFS-e</h2>
          <Link href={`/clientes/${id}/editar`} className="flex items-center gap-1 text-xs text-[#030A8C] hover:underline font-medium">
            <Pencil className="w-3 h-3" /> Editar dados de faturamento
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          {([
            ['Cobrança automática', client.billingEnabled ? 'Ativada' : 'Desativada'],
            ['Forma de pagamento', client.billingType === 'UNDEFINED' ? 'Cliente escolhe' : client.billingType],
            ['Antecedência', `${client.billingLeadDays} dias`],
            ['E-mail financeiro', client.billingEmail || client.email || '—'],
            ['Sincronização Asaas', client.asaasSyncStatus === 'OK' ? 'Sincronizado' : client.asaasSyncStatus === 'ERRO' ? 'Erro' : 'Nunca sincronizado'],
            ['ID no Asaas', client.asaasCustomerId || '—'],
            ['NFS-e automática', client.nfseEnabled ? 'Ativada' : 'Desativada'],
            ['Regra de emissão', client.nfseRule],
          ] as [string, string][]).map(([label, value]) => (
            <div key={label}>
              <p className="text-xs text-gray-500 font-medium">{label}</p>
              <p className="text-gray-900 mt-0.5 break-all">{value}</p>
            </div>
          ))}
        </div>
        {client.asaasSyncError && (
          <p className="mt-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{client.asaasSyncError}</p>
        )}
        {billingMissing.length > 0 && (
          <p className="mt-3 text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
            Campos pendentes para cobrança: {billingMissing.join(', ')}
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
        <h2 className="font-semibold text-gray-900 mb-3">Cobranças Asaas</h2>
        {client.asaasCharges.length === 0 ? (
          <p className="text-xs text-gray-500">Nenhuma cobrança gerada ainda — use os Recebimentos do Financeiro para gerar.</p>
        ) : (
          <div className="space-y-2">
            {client.asaasCharges.map((c) => {
              const st = CHARGE_STATUS_PT[c.status] ?? { label: c.status, cls: 'bg-gray-100 text-gray-600' }
              return (
                <div key={c.id} className="flex items-center justify-between gap-2 border border-gray-100 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {String(c.month).padStart(2, '0')}/{c.year} · {formatCurrency(Number(c.value))}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      vence {formatDate(c.dueDate)}
                      {c.nfse ? ` · NFS-e: ${c.nfse.status}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {c.invoiceUrl && (
                      <a href={c.invoiceUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#030A8C] hover:underline">
                        fatura
                      </a>
                    )}
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  ) : (
    <p className="text-sm text-gray-500">Informações de faturamento são exclusivas de administradores.</p>
  )

  const historySection = (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
      <h2 className="font-semibold text-gray-900 mb-3">Histórico do cliente</h2>
      <div className="space-y-1.5">
        <p className="text-[11px] text-gray-500">Cadastrado em {formatDate(client.createdAt)}</p>
        {isAdmin && client.tierHistory.map((h) => (
          <p key={h.id} className="text-[11px] text-gray-500">
            {formatDate(h.createdAt)} · Grupo: {h.fromTier ? TIER_PT[h.fromTier] : 'Sem grupo'} → {h.toTier ? TIER_PT[h.toTier] : 'Sem grupo'}
            {' '}· ticket {formatCurrency(h.ticket)} · {h.manual ? 'manual' : 'automática'}
          </p>
        ))}
        {isAdmin && client.tierHistory.length === 0 && (
          <p className="text-[11px] text-gray-400">Nenhuma alteração de grupo registrada.</p>
        )}
      </div>
    </div>
  )

  /* --------------------------------- render --------------------------------- */

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title={client.name} subtitle={client.niche || 'Cliente'} />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Link href="/clientes" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
            <ArrowLeft className="w-4 h-4" /> Voltar para Clientes
          </Link>
          <div className="flex items-center gap-4 flex-wrap">
            {isAdmin && nextCharge && (
              <div className="text-right">
                <p className="text-[11px] text-gray-400">Próxima cobrança</p>
                <p className="text-sm font-bold text-gray-900">
                  {formatCurrency(Number(nextCharge.value))} · vence {formatDate(nextCharge.dueDate)}
                </p>
              </div>
            )}
            {isAdmin && <ClientEmailActions clientId={id} clientName={client.name} />}
          </div>
        </div>

        <ClientProfileTabs
          tabs={[
            { key: 'geral', label: 'Visão geral' },
            { key: 'servicos', label: 'Serviços' },
            ...(isAdmin ? [{ key: 'financeiro', label: 'Financeiro' }] : []),
            ...(isAdmin ? [{ key: 'faturamento', label: 'Faturamento e NFS-e' }] : []),
            ...(isAdmin ? [{ key: 'credenciais', label: 'Credenciais' }] : []),
            { key: 'historico', label: 'Histórico' },
          ]}
          sections={{
            geral: (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2 space-y-4">
                  {segmentCard}
                  {infoCard}
                  {tasksCard}
                </div>
                <div className="space-y-4">
                  {deliveriesCard}
                  {isAdmin && (
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <h2 className="font-semibold text-gray-900 mb-3 text-sm">Pagamentos recentes</h2>
                      {paymentsList(6)}
                    </div>
                  )}
                </div>
              </div>
            ),
            servicos: (
              <ClientServicesPanel clientId={id} initialServices={sanitizedServices} isAdmin={isAdmin} />
            ),
            financeiro: (
              <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
                <h2 className="font-semibold text-gray-900 mb-3">Histórico de Pagamentos</h2>
                {paymentsList()}
              </div>
            ),
            faturamento: billingSection,
            credenciais: isAdmin ? (
              <ClientCredentialsPanel clientId={id} initialCredentials={client.credentials} />
            ) : null,
            historico: historySection,
          }}
        />
      </div>
    </div>
  )
}
