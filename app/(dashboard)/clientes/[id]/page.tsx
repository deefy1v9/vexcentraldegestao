import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Header from '@/components/layout/Header'
import { formatCurrency, formatDate } from '@/lib/utils'
import Link from 'next/link'
import { ArrowLeft, Pencil, FileText } from 'lucide-react'
import { Badge } from '@/components/vex/badge'
import { Button } from '@/components/vex/button'
import MenuMaisCliente from '@/components/clientes/MenuMaisCliente'
import ClientCredentialsPanel from '@/components/clientes/ClientCredentialsPanel'
import ClientServicesPanel from '@/components/clientes/ClientServicesPanel'
import ClientProfileTabs from '@/components/clientes/ClientProfileTabs'
import ClientEmailActions from '@/components/clientes/ClientEmailActions'
import ProposalsList from '@/components/propostas/ProposalsList'
import TierBadge from '@/components/ui/TierBadge'
import ClientLinkChips from '@/components/clientes/ClientLinkChips'
import { clientLinks } from '@/lib/client-links'
import { missingBillingFields } from '@/lib/billing-core'
import { clientMonthIndicators } from '@/lib/finance-summary'
import { tierRecommendation, TIER_LABEL } from '@/lib/client-tier'
import { decryptSecret } from '@/lib/crypto'

const TIER_PT: Record<string, string> = { START: 'Start', GROWTH: 'Growth', SCALE: 'Scale' }
type Tom = 'default' | 'success' | 'warning' | 'danger'
const CHARGE_STATUS: Record<string, { label: string; variant: Tom }> = {
  PENDING: { label: 'Aguardando', variant: 'warning' },
  CONFIRMED: { label: 'Confirmado', variant: 'success' },
  RECEIVED: { label: 'Recebido', variant: 'success' },
  OVERDUE: { label: 'Vencido', variant: 'danger' },
  REFUNDED: { label: 'Estornado', variant: 'danger' },
  CANCELLED: { label: 'Cancelado', variant: 'default' },
  DELETED: { label: 'Cancelado', variant: 'default' },
  ERROR: { label: 'Erro', variant: 'danger' },
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [session, { id }] = await Promise.all([auth(), params])
  const isAdmin = session?.user?.role === 'ADMIN'

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      credentials: true,
      services: {
        include: {
          catalog: { select: { id: true, name: true, category: true, minCents: true, maxCents: true, billingType: true } },
          payments: {
            select: { id: true, status: true, amount: true, dueDate: true, year: true, month: true },
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
        include: { assignee: { select: { name: true } }, process: { select: { name: true } }, stage: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 6,
      },
    },
  })

  if (!client) notFound()

  // Indicadores da competência atual — mesma regra do Financeiro e do Dashboard
  const hoje = new Date()
  const indicators = await clientMonthIndicators(id, hoje.getFullYear(), hoje.getMonth() + 1)
  const recomendacao = isAdmin && client.tierManual ? await tierRecommendation(id) : null

  const activeServices = client.services.filter((s) => s.status === 'ATIVO')
  // Ticket recorrente (só serviços que entram no MRR); avulso fica de fora
  const ticketMensal = (indicators?.ticketCents ?? 0) / 100
  const avulsoMes = (indicators?.avulsaCents ?? 0) / 100
  const billingMissing = missingBillingFields(client)
  const sanitizedServices = isAdmin
    ? client.services
    : client.services.map((s) => ({
        ...s, monthlyValue: null, totalContractValue: null, priceCents: null, discountCents: 0,
        payments: [], catalog: s.catalog ? { ...s.catalog, minCents: null, maxCents: null } : null,
      }))

  // O cofre guarda a senha cifrada em repouso, mas serve justamente para o
  // administrador consultar o acesso — aqui ela é aberta para exibição.
  // Colaborador não recebe nada: a aba inteira é exclusiva de admin.
  const decryptedCredentials = isAdmin
    ? client.credentials.map((c) => ({ ...c, password: decryptSecret(c.password) }))
    : []

  /* ------------------------------ seções (server) ------------------------------ */

  const emAbertoCents = client.payments
    .filter((p) => p.status === 'PENDENTE')
    .reduce((a, p) => a + Math.round(Number(p.amount) * 100), 0)
  const proximoPendente = [...client.payments]
    .filter((p) => p.status === 'PENDENTE')
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0]
  const hojeUtc = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) + 'T00:00:00Z')
  const emAtraso = client.payments.some((p) => p.status === 'PENDENTE' && p.dueDate < hojeUtc)

  // Só o que está preenchido: os "—" ficam no Editar
  const dados = ([
    ['CNPJ/CPF', client.cnpj],
    ['Razão social', client.legalName],
    ['E-mail', client.billingEmail || client.email],
    ['Telefone', client.phone],
    ['Nicho', client.niche],
    ['Contrato', client.contractStart ? `${formatDate(client.contractStart)}${client.contractEnd ? ` a ${formatDate(client.contractEnd)}` : ''}` : null],
    ['Vencimento', client.paymentDay ? `Todo dia ${client.paymentDay}` : null],
  ] as [string, string | null][]).filter(([, v]) => !!v && String(v).trim() !== '') as [string, string][]

  const card = 'rounded-[12px] border border-border bg-card'
  const tituloCard = 'flex items-center justify-between px-5 h-12 border-b border-border'

  const numeros = isAdmin ? (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className={`${card} p-5`}>
        <p className="t-rotulo text-muted-foreground">Mensal recorrente</p>
        <p className="mt-1 text-[22px] leading-7 font-semibold tabular text-foreground">{formatCurrency(ticketMensal)}</p>
        <p className="t-legenda mt-1">{activeServices.length} serviço(s) ativo(s){avulsoMes > 0 ? ` · ${formatCurrency(avulsoMes)} avulso no mês` : ''}</p>
      </div>
      <div className={`${card} p-5`}>
        <p className="t-rotulo text-muted-foreground">Em aberto</p>
        <p className={`mt-1 text-[22px] leading-7 font-semibold tabular ${emAtraso ? 'text-destructive-texto' : 'text-foreground'}`}>{formatCurrency(emAbertoCents / 100)}</p>
        <p className="t-legenda mt-1">{emAtraso ? 'Tem cobrança vencida' : emAbertoCents > 0 ? 'Dentro do prazo' : 'Nada em aberto'}</p>
      </div>
      <div className={`${card} p-5`}>
        <p className="t-rotulo text-muted-foreground">Próximo vencimento</p>
        <p className="mt-1 text-[22px] leading-7 font-semibold tabular text-foreground">{proximoPendente ? formatDate(proximoPendente.dueDate) : '—'}</p>
        <p className="t-legenda mt-1">{proximoPendente ? formatCurrency(Number(proximoPendente.amount)) : 'Sem cobrança pendente'}</p>
      </div>
    </div>
  ) : null

  const servicosCard = (
    <section className={card}>
      <div className={tituloCard}>
        <h2 className="t-secao text-foreground">Serviços ativos <span className="font-medium text-muted-foreground">{activeServices.length}</span></h2>
      </div>
      {activeServices.length === 0 ? (
        <p className="px-5 py-6 t-corpo text-muted-foreground">Nenhum serviço ativo.</p>
      ) : (
        <ul className="divide-y divide-border">
          {activeServices.slice(0, 6).map((s) => (
            <li key={s.id} className="px-5 py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="t-corpo text-foreground truncate">{s.customName || s.serviceName}</p>
                <p className="t-legenda">{s.contractType === 'RECORRENTE' ? 'Recorrente' : s.contractType === 'AVULSO' ? 'Avulso' : s.contractType}</p>
              </div>
              {isAdmin && (s.priceCents != null || s.monthlyValue != null) && (
                <span className="t-corpo font-semibold tabular text-foreground">
                  {formatCurrency(s.priceCents != null ? s.priceCents / 100 : Number(s.monthlyValue))}{s.contractType === 'RECORRENTE' && <span className="t-legenda font-normal">/mês</span>}
                </span>
              )}
            </li>
          ))}
          {activeServices.length > 6 && <li className="px-5 py-2.5 t-rotulo text-muted-foreground">+ {activeServices.length - 6} serviço(s) na aba Serviços</li>}
        </ul>
      )}
    </section>
  )

  const demandasCard = (
    <section className={card}>
      <div className={tituloCard}>
        <h2 className="t-secao text-foreground">Demandas em andamento <span className="font-medium text-muted-foreground">{client.tasks.length}</span></h2>
        <Link href="/demandas" className="t-rotulo text-muted-foreground hover:text-foreground">Abrir demandas</Link>
      </div>
      {client.tasks.length === 0 ? (
        <p className="px-5 py-6 t-corpo text-muted-foreground">Nenhuma demanda aberta.</p>
      ) : (
        <ul className="divide-y divide-border">
          {client.tasks.map((t) => (
            <li key={t.id}>
              <Link href={`/demandas?t=${t.id}`} className="px-5 py-3 flex items-center gap-3 hover:bg-accent transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="t-corpo text-foreground truncate">{t.title} <span className="text-muted-foreground">#{t.number}</span></p>
                  <p className="t-legenda truncate">{t.process?.name ?? 'Sem processo'}{t.assignee?.name ? ` · ${t.assignee.name.split(' ')[0]}` : ''}</p>
                </div>
                <Badge variant={t.dueDate && t.dueDate < hojeUtc ? 'danger' : 'default'}>{t.stage?.name ?? '—'}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )

  const dadosCard = (
    <section className={card}>
      <div className={tituloCard}>
        <h2 className="t-secao text-foreground">Dados do cliente</h2>
        {isAdmin && (
          <Link href={`/clientes/${id}/editar`} className="t-rotulo text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <Pencil className="w-3.5 h-3.5" /> Editar
          </Link>
        )}
      </div>
      <dl className="px-5 py-4 space-y-2.5">
        {dados.map(([rotulo, valor]) => (
          <div key={rotulo} className="grid grid-cols-[110px_1fr] gap-3">
            <dt className="t-rotulo text-muted-foreground">{rotulo}</dt>
            <dd className="t-corpo text-foreground break-words">{valor}</dd>
          </div>
        ))}
        {dados.length === 0 && <p className="t-corpo text-muted-foreground">Cadastro sem dados. Use Editar.</p>}
      </dl>
      {clientLinks(client).length > 0 && (
        <div className="px-5 pb-4">
          <ClientLinkChips client={client} size="md" />
        </div>
      )}
      {client.notes && (
        <div className="px-5 py-4 border-t border-border">
          <p className="t-rotulo text-muted-foreground mb-1">Observações</p>
          <p className="t-corpo text-foreground whitespace-pre-wrap">{client.notes}</p>
        </div>
      )}
    </section>
  )

  const statusPagamento = (s: string) => s === 'PAGO'
    ? <Badge variant="success">Pago</Badge>
    : s === 'CANCELADO' ? <Badge variant="default">Cancelado</Badge> : <Badge variant="warning">Pendente</Badge>

  const paymentsList = (limit?: number) => {
    const rows = limit ? client.payments.slice(0, limit) : client.payments
    return rows.length === 0 ? (
      <p className="px-5 py-6 t-corpo text-muted-foreground">Nenhum pagamento cadastrado.</p>
    ) : (
      <ul className="divide-y divide-border">
        {rows.map((p) => (
          <li key={p.id} className="px-5 py-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="t-corpo text-foreground">{p.month.toString().padStart(2, '0')}/{p.year}</p>
              <p className="t-legenda">vence {formatDate(p.dueDate)}</p>
            </div>
            <span className="t-corpo font-semibold tabular text-foreground">{formatCurrency(Number(p.amount))}</span>
            {statusPagamento(p.status)}
          </li>
        ))}
      </ul>
    )
  }

  const cobrancasCard = isAdmin ? (
    <section className={card}>
      <div className={tituloCard}>
        <h2 className="t-secao text-foreground">Últimas cobranças</h2>
      </div>
      {paymentsList(5)}
    </section>
  ) : null

  const recomendacaoAviso = isAdmin && recomendacao && recomendacao.recommended !== client.tier ? (
    <p className="t-rotulo text-warning bg-warning-suave rounded-lg px-3 py-2">
      Grupo definido à mão. Pelo ticket atual ({formatCurrency(recomendacao.ticketCents / 100)}), a classificação automática seria{' '}
      <span className="font-semibold">{recomendacao.recommended ? TIER_LABEL[recomendacao.recommended] : 'Não classificado'}</span>.
    </p>
  ) : null

  const configFaturamento = isAdmin ? (
    <section className={card}>
      <div className={tituloCard}>
        <h2 className="t-secao text-foreground">Faturamento e NFS-e</h2>
        <Link href={`/clientes/${id}/editar`} className="t-rotulo text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <Pencil className="w-3.5 h-3.5" /> Editar
        </Link>
      </div>
      <dl className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
        {([
          ['Cobrança automática', client.billingEnabled ? 'Ligada' : 'Desligada'],
          ['Forma de pagamento', client.billingType === 'UNDEFINED' ? 'Cliente escolhe' : client.billingType],
          ['Antecedência', `${client.billingLeadDays} dias`],
          ['E-mail financeiro', client.billingEmail || client.email || '—'],
          ['NFS-e automática', client.nfseEnabled ? 'Ligada' : 'Desligada'],
          ['Asaas', client.asaasSyncStatus === 'OK' ? 'Sincronizado' : client.asaasSyncStatus === 'ERRO' ? 'Erro na sincronização' : 'Nunca sincronizado'],
        ] as [string, string][]).map(([rotulo, valor]) => (
          <div key={rotulo} className="grid grid-cols-[140px_1fr] gap-3">
            <dt className="t-rotulo text-muted-foreground">{rotulo}</dt>
            <dd className="t-corpo text-foreground break-all">{valor}</dd>
          </div>
        ))}
      </dl>
      {client.asaasSyncError && <p className="mx-5 mb-4 t-rotulo text-destructive-texto bg-destructive-suave rounded-lg px-3 py-2">{client.asaasSyncError}</p>}
      {billingMissing.length > 0 && <p className="mx-5 mb-4 t-rotulo text-warning bg-warning-suave rounded-lg px-3 py-2">Falta para cobrar: {billingMissing.join(', ')}</p>}
    </section>
  ) : null

  const cobrancasAsaas = isAdmin ? (
    <section className={card}>
      <div className={tituloCard}>
        <h2 className="t-secao text-foreground">Cobranças e notas fiscais</h2>
      </div>
      {client.asaasCharges.length === 0 ? (
        <p className="px-5 py-6 t-corpo text-muted-foreground">Nenhuma cobrança gerada no Asaas.</p>
      ) : (
        <ul className="divide-y divide-border">
          {client.asaasCharges.map((c) => {
            const st = CHARGE_STATUS[c.status] ?? { label: c.status, variant: 'default' as const }
            return (
              <li key={c.id} className="px-5 py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="t-corpo text-foreground">{String(c.month).padStart(2, '0')}/{c.year} · {formatCurrency(Number(c.value))}</p>
                  <p className="t-legenda">vence {formatDate(c.dueDate)}{c.nfse?.numero ? ` · NFS-e nº ${c.nfse.numero}` : ''}</p>
                </div>
                {c.nfse?.pdfUrl && <a href={c.nfse.pdfUrl} target="_blank" rel="noopener noreferrer" className="t-rotulo text-link hover:underline">Nota</a>}
                {c.invoiceUrl && <a href={c.invoiceUrl} target="_blank" rel="noopener noreferrer" className="t-rotulo text-link hover:underline">Fatura</a>}
                <Badge variant={st.variant}>{st.label}</Badge>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  ) : null

  const historySection = (
    <section className={card}>
      <div className={tituloCard}><h2 className="t-secao text-foreground">Histórico do cliente</h2></div>
      <ul className="px-5 py-4 space-y-2">
        <li className="t-corpo text-foreground">Cadastrado em {formatDate(client.createdAt)}</li>
        {isAdmin && client.tierHistory.map((h) => (
          <li key={h.id} className="t-corpo text-foreground">
            <span className="text-muted-foreground">{formatDate(h.createdAt)} · </span>
            Grupo {h.fromTier ? TIER_PT[h.fromTier] : 'sem grupo'} → {h.toTier ? TIER_PT[h.toTier] : 'sem grupo'}
            <span className="text-muted-foreground"> · ticket {formatCurrency(h.ticket)} · {h.manual ? 'manual' : 'automática'}{h.reason ? ` · ${h.reason}` : ''}</span>
          </li>
        ))}
      </ul>
    </section>
  )

  /* --------------------------------- render --------------------------------- */

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Clientes" subtitle="Perfil do cliente" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        <Link href="/clientes" className="inline-flex items-center gap-1 t-rotulo text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Clientes
        </Link>

        {/* identidade e ações */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="t-pagina text-foreground">{client.name}</h1>
              <TierBadge tier={client.tier} size="sm" />
              <Badge variant={client.status === 'ATIVO' ? 'success' : client.status === 'PAUSADO' ? 'warning' : 'default'}>
                {client.status === 'ATIVO' ? 'Ativo' : client.status === 'PAUSADO' ? 'Pausado' : client.status === 'ENCERRADO' ? 'Encerrado' : client.status}
              </Badge>
            </div>
            <p className="t-rotulo text-muted-foreground mt-1.5">
              {[client.cnpj, client.phone, `cliente desde ${formatDate(client.contractStart ?? client.createdAt)}`].filter(Boolean).join(' · ')}
            </p>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <ClientEmailActions clientId={id} clientName={client.name} />
              <Button asChild>
                <Link href={`/propostas/nova?clientId=${id}`}><FileText /> Nova proposta</Link>
              </Button>
              <MenuMaisCliente clientId={id} />
            </div>
          )}
        </div>

        <ClientProfileTabs
          tabs={[
            { key: 'resumo', label: 'Resumo' },
            { key: 'servicos', label: 'Serviços e contrato' },
            ...(isAdmin ? [{ key: 'financeiro', label: 'Financeiro' }] : []),
            ...(isAdmin ? [{ key: 'documentos', label: 'Documentos' }] : []),
            { key: 'historico', label: 'Histórico' },
          ]}
          sections={{
            resumo: (
              <div className="space-y-3">
                {recomendacaoAviso}
                {numeros}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
                  <div className="lg:col-span-3 space-y-3">
                    {servicosCard}
                    {demandasCard}
                  </div>
                  <div className="lg:col-span-2 space-y-3">
                    {dadosCard}
                    {cobrancasCard}
                  </div>
                </div>
              </div>
            ),
            servicos: (
              <ClientServicesPanel clientId={id} initialServices={sanitizedServices} isAdmin={isAdmin} />
            ),
            financeiro: (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
                <div className="lg:col-span-3 space-y-3">
                  {cobrancasAsaas}
                  <section className={card}>
                    <div className={tituloCard}><h2 className="t-secao text-foreground">Lançamentos</h2></div>
                    {paymentsList()}
                  </section>
                </div>
                <div className="lg:col-span-2">{configFaturamento}</div>
              </div>
            ),
            documentos: isAdmin ? (
              <div className="space-y-3">
                <section className={card}>
                  <div className={tituloCard}>
                    <h2 className="t-secao text-foreground">Propostas e aditivos</h2>
                    <Link href={`/propostas/nova?clientId=${id}`} className="t-rotulo text-muted-foreground hover:text-foreground">Nova proposta</Link>
                  </div>
                  <div className="p-4"><ProposalsList clientId={id} compact /></div>
                </section>
                <section className={card}>
                  <div className={tituloCard}><h2 className="t-secao text-foreground">Acessos e credenciais</h2></div>
                  <div className="p-4"><ClientCredentialsPanel clientId={id} initialCredentials={decryptedCredentials} /></div>
                </section>
              </div>
            ) : null,
            historico: historySection,
          }}
        />
      </div>
    </div>
  )
}
