import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Header from '@/components/layout/Header'
import { formatCurrency, formatDate } from '@/lib/utils'
import Link from 'next/link'
import {
  ArrowLeft, Pencil, FileText, IdCard, Building2, Mail, Phone, Briefcase, CalendarRange, CalendarClock,
  Wallet, AlertTriangle, CalendarCheck, Clock, Layers, ListTodo,
} from 'lucide-react'
import { Badge } from '@/components/vex/badge'
import { Button } from '@/components/vex/button'
import { Kpi, Painel, Sobretitulo } from '@/components/vex/vireo'
import MenuMaisCliente from '@/components/clientes/MenuMaisCliente'
import ClientCredentialsPanel from '@/components/clientes/ClientCredentialsPanel'
import ClientServicesPanel from '@/components/clientes/ClientServicesPanel'
import ClientProfileTabs from '@/components/clientes/ClientProfileTabs'
import ClientEmailActions from '@/components/clientes/ClientEmailActions'
import ProposalsList from '@/components/propostas/ProposalsList'
import ClientLinkChips from '@/components/clientes/ClientLinkChips'
import { AvatarCliente, GrupoCliente, MarcaInterna, StatusCliente, ehMarcaInterna } from '@/components/clientes/ClienteVisual'
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

/** Ícone de cada linha de contato do cartão do perfil. */
const ICONE_DADO: Record<string, React.ElementType> = {
  'CNPJ/CPF': IdCard,
  'Razão social': Building2,
  'E-mail': Mail,
  Telefone: Phone,
  Nicho: Briefcase,
  Contrato: CalendarRange,
  Vencimento: CalendarClock,
}

/** "1 ano e 3 meses", "8 meses", "menos de 1 mês". */
function tempoDeCasa(desde: Date, hoje: Date) {
  const meses = (hoje.getFullYear() - desde.getFullYear()) * 12 + (hoje.getMonth() - desde.getMonth()) - (hoje.getDate() < desde.getDate() ? 1 : 0)
  if (meses < 1) return 'menos de 1 mês'
  const anos = Math.floor(meses / 12)
  const resto = meses % 12
  const a = anos > 0 ? `${anos} ano${anos > 1 ? 's' : ''}` : ''
  const m = resto > 0 ? `${resto} ${resto > 1 ? 'meses' : 'mês'}` : ''
  return [a, m].filter(Boolean).join(' e ')
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

  // Todas as pendentes, não só as 24 últimas: as 24 de vencimento mais
  // distante escondiam atraso antigo e somavam parcelas de 12 meses à frente.
  const pendentes = isAdmin
    ? await prisma.clientPayment.findMany({
        where: { clientId: id, status: 'PENDENTE' },
        select: { amount: true, dueDate: true },
        orderBy: { dueDate: 'asc' },
      })
    : []
  const hojeUtc = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) + 'T00:00:00Z')
  const vencidas = pendentes.filter((p) => p.dueDate < hojeUtc)
  const emAtrasoCents = vencidas.reduce((a, p) => a + Math.round(Number(p.amount) * 100), 0)
  const emAtraso = vencidas.length > 0
  const proximoPendente = pendentes.find((p) => p.dueDate >= hojeUtc)

  // Cobranças em duas listas: em aberto (atrasadas e próximas, a mais antiga
  // primeiro) e histórico (pagas ou canceladas, a mais recente primeiro). Numa
  // lista só, ordenada por vencimento, as parcelas de 2027 vinham antes de tudo.
  const pagamentoSelect = { id: true, status: true, amount: true, dueDate: true, year: true, month: true, service: { select: { serviceName: true, customName: true } } } as const
  const [emAbertoCobrancas, historicoCobrancas] = isAdmin
    ? await Promise.all([
        prisma.clientPayment.findMany({ where: { clientId: id, status: 'PENDENTE' }, select: pagamentoSelect, orderBy: { dueDate: 'asc' }, take: 36 }),
        prisma.clientPayment.findMany({ where: { clientId: id, status: { not: 'PENDENTE' } }, select: pagamentoSelect, orderBy: { dueDate: 'desc' }, take: 36 }),
      ])
    : [[], []]
  const dataUtc = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'UTC' })

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

  const desde = client.contractStart ?? client.createdAt
  const linha = 'px-6 py-3.5'

  /* ------------------------------ números do topo ------------------------------ */

  const kpiCliente = (
    <Kpi icone={Clock} tom="neutro" rotulo="Cliente desde" valor={<span className="text-[22px]">{tempoDeCasa(desde, hoje)}</span>} nota={formatDate(desde)} />
  )
  const numeros = isAdmin ? (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <Kpi
        icone={Wallet}
        tom="sucesso"
        rotulo="Mensal recorrente"
        valor={<span className="text-[22px]">{formatCurrency(ticketMensal)}</span>}
        nota={`${activeServices.length} serviço(s) ativo(s)${avulsoMes > 0 ? ` · ${formatCurrency(avulsoMes)} avulso no mês` : ''}`}
      />
      <Kpi
        icone={AlertTriangle}
        tom={emAtraso ? 'perigo' : 'neutro'}
        rotulo="Em atraso"
        alerta={emAtraso}
        valor={<span className="text-[22px]">{formatCurrency(emAtrasoCents / 100)}</span>}
        nota={emAtraso
          ? `${vencidas.length} parcela(s) vencida(s), a mais antiga em ${dataUtc(vencidas[0].dueDate)}`
          : 'Nada vencido'}
      />
      <Kpi
        icone={CalendarCheck}
        tom="info"
        rotulo="Próximo vencimento"
        valor={<span className="text-[22px]">{proximoPendente ? dataUtc(proximoPendente.dueDate) : '—'}</span>}
        nota={proximoPendente ? formatCurrency(Number(proximoPendente.amount)) : 'Sem cobrança pendente'}
      />
      {kpiCliente}
    </div>
  ) : (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Kpi icone={Layers} rotulo="Serviços ativos" valor={activeServices.length} nota="Na aba Serviços e contrato" />
      <Kpi icone={ListTodo} tom="info" rotulo="Demandas em andamento" valor={client.tasks.length} nota="Abertas agora" />
      {kpiCliente}
    </div>
  )

  /* ------------------------------ cartão do perfil ------------------------------ */

  const perfil = (
    <aside className="rounded-[24px] border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] overflow-hidden">
      <div className="px-6 pt-8 pb-6 flex flex-col items-center text-center">
        <AvatarCliente nome={client.name} tamanho="xl" />
        <h2 className="mt-5 font-display text-[22px] leading-tight font-semibold tracking-[-0.01em] text-foreground break-words">{client.name}</h2>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
          <GrupoCliente tier={client.tier} />
          <StatusCliente status={client.status} />
          {ehMarcaInterna(client.name) && <MarcaInterna />}
        </div>
        {(client.niche || client.legalName) && (
          <p className="mt-2.5 t-corpo text-muted-foreground">{[client.niche, client.legalName].filter(Boolean).join(' · ')}</p>
        )}
      </div>

      <ul className="px-6 pb-2 border-t border-border">
        {dados.map(([rotulo, valor]) => {
          const Icone = ICONE_DADO[rotulo] ?? FileText
          return (
            <li key={rotulo} className="flex items-start gap-3 py-3 border-b border-border/60 last:border-0">
              <Icone className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0">
                <p className="t-legenda">{rotulo}</p>
                <p className="t-corpo text-foreground break-words">{valor}</p>
              </div>
            </li>
          )
        })}
        {dados.length === 0 && <li className="py-4 t-corpo text-muted-foreground">Cadastro sem dados. Use Editar.</li>}
      </ul>

      {clientLinks(client).length > 0 && (
        <div className="px-6 py-4 border-t border-border">
          <Sobretitulo className="mb-2">Site e redes</Sobretitulo>
          <ClientLinkChips client={client} />
        </div>
      )}

      {client.notes && (
        <div className="px-6 py-4 border-t border-border">
          <Sobretitulo className="mb-1.5">Observações</Sobretitulo>
          <p className="t-corpo text-foreground whitespace-pre-wrap">{client.notes}</p>
        </div>
      )}

      {isAdmin && (
        <div className="px-6 py-4 border-t border-border grid grid-cols-2 gap-2">
          <Button asChild variant="outline">
            <Link href={`/clientes/${id}/editar`}><Pencil /> Editar</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/clientes/${id}/propostas`}><FileText /> Propostas</Link>
          </Button>
        </div>
      )}
    </aside>
  )

  /* ------------------------------ cartões das abas ------------------------------ */

  const servicosCard = (
    <Painel semPadding titulo="Serviços ativos" sub={`${activeServices.length} serviço(s)`}>
      {activeServices.length === 0 ? (
        <p className="px-6 pb-6 t-corpo text-muted-foreground">Nenhum serviço ativo.</p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {activeServices.slice(0, 6).map((s) => (
            <li key={s.id} className={`${linha} flex items-center gap-3`}>
              <div className="min-w-0 flex-1">
                <p className="t-corpo font-medium text-foreground truncate">{s.customName || s.serviceName}</p>
                <p className="t-legenda">{s.contractType === 'RECORRENTE' ? 'Recorrente' : s.contractType === 'AVULSO' ? 'Avulso' : s.contractType}</p>
              </div>
              {isAdmin && (s.priceCents != null || s.monthlyValue != null) && (
                <span className="font-display text-[15px] font-semibold tabular text-foreground whitespace-nowrap">
                  {formatCurrency(s.priceCents != null ? s.priceCents / 100 : Number(s.monthlyValue))}{s.contractType === 'RECORRENTE' && <span className="t-legenda font-normal font-sans">/mês</span>}
                </span>
              )}
            </li>
          ))}
          {activeServices.length > 6 && <li className="px-6 py-3 t-rotulo text-muted-foreground">+ {activeServices.length - 6} serviço(s) na aba Serviços</li>}
        </ul>
      )}
    </Painel>
  )

  const demandasCard = (
    <Painel semPadding titulo="Demandas em andamento" sub={`${client.tasks.length} aberta(s)`} href="/demandas" rotuloLink="Abrir demandas">
      {client.tasks.length === 0 ? (
        <p className="px-6 pb-6 t-corpo text-muted-foreground">Nenhuma demanda aberta.</p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {client.tasks.map((t) => (
            <li key={t.id}>
              <Link href={`/demandas?t=${t.id}`} className={`${linha} flex items-center gap-3 hover:bg-secondary/50 transition-colors`}>
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
    </Painel>
  )

  const statusPagamento = (s: string) => s === 'PAGO'
    ? <Badge variant="success">Pago</Badge>
    : s === 'CANCELADO' ? <Badge variant="default">Cancelado</Badge> : <Badge variant="warning">Pendente</Badge>

  // Cobranças do mesmo dia e situação viram uma linha ("2 cobranças · R$ 4.500"),
  // com o detalhe por serviço ao abrir
  type Cobranca = (typeof emAbertoCobrancas)[number]
  const agrupar = (rows: Cobranca[]) => {
    const grupos: Array<{ chave: string; dueDate: Date; status: string; competencia: string; total: number; itens: Cobranca[] }> = []
    for (const p of rows) {
      const chave = `${p.dueDate.toISOString().slice(0, 10)}|${p.status}`
      const g = grupos.find((x) => x.chave === chave)
      if (g) { g.itens.push(p); g.total += Number(p.amount) } else {
        grupos.push({ chave, dueDate: p.dueDate, status: p.status, competencia: `${p.month.toString().padStart(2, '0')}/${p.year}`, total: Number(p.amount), itens: [p] })
      }
    }
    return grupos
  }
  const nomeServico = (p: Cobranca) => p.service?.customName || p.service?.serviceName || 'Cobrança avulsa'
  const situacaoCobranca = (status: string, dueDate: Date) =>
    status === 'PENDENTE' && dueDate < hojeUtc ? <Badge variant="danger">Atrasada</Badge> : statusPagamento(status)

  const paymentsList = (rows: Cobranca[], vazio: string, limite?: number) => {
    const grupos = agrupar(rows)
    const visiveis = limite ? grupos.slice(0, limite) : grupos
    if (visiveis.length === 0) return <p className="px-6 py-5 t-corpo text-muted-foreground">{vazio}</p>
    return (
      <ul className="divide-y divide-border">
        {visiveis.map((g) => (
          <li key={g.chave} className={linha}>
            {g.itens.length === 1 ? (
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="t-corpo text-foreground truncate">{g.competencia} · {nomeServico(g.itens[0])}</p>
                  <p className="t-legenda">vence {dataUtc(g.dueDate)}</p>
                </div>
                <span className="font-display text-[14.5px] font-semibold tabular text-foreground whitespace-nowrap">{formatCurrency(g.total)}</span>
                {situacaoCobranca(g.status, g.dueDate)}
              </div>
            ) : (
              <details className="group">
                <summary className="flex items-center gap-3 cursor-pointer list-none">
                  <div className="min-w-0 flex-1">
                    <p className="t-corpo text-foreground">{g.competencia} · {g.itens.length} cobranças</p>
                    <p className="t-legenda">vence {dataUtc(g.dueDate)} · toque para ver</p>
                  </div>
                  <span className="font-display text-[14.5px] font-semibold tabular text-foreground whitespace-nowrap">{formatCurrency(g.total)}</span>
                  {situacaoCobranca(g.status, g.dueDate)}
                </summary>
                <ul className="mt-2 ml-1 space-y-1 border-l border-border pl-3">
                  {g.itens.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 t-rotulo text-muted-foreground">
                      <span className="min-w-0 flex-1 truncate">{nomeServico(p)}</span>
                      <span className="tabular text-foreground">{formatCurrency(Number(p.amount))}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
        {limite && grupos.length > limite && (
          <li className="px-6 py-3 t-rotulo text-muted-foreground">+ {grupos.length - limite} na aba Financeiro</li>
        )}
      </ul>
    )
  }

  const cobrancasCard = isAdmin ? (
    <Painel semPadding titulo="Cobranças em aberto">
      <div className="border-t border-border">{paymentsList(emAbertoCobrancas, 'Nenhuma cobrança em aberto.', 4)}</div>
      <div className="px-6 py-2.5 bg-secondary/60 border-y border-border">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Últimos pagamentos</h3>
      </div>
      {paymentsList(historicoCobrancas, 'Nenhum pagamento registrado ainda.', 3)}
    </Painel>
  ) : null

  const recomendacaoAviso = isAdmin && recomendacao && recomendacao.recommended !== client.tier ? (
    <p className="t-rotulo text-warning bg-warning-suave rounded-xl px-4 py-3">
      Grupo definido à mão. Pelo ticket atual ({formatCurrency(recomendacao.ticketCents / 100)}), a classificação automática seria{' '}
      <span className="font-semibold">{recomendacao.recommended ? TIER_LABEL[recomendacao.recommended] : 'Não classificado'}</span>.
    </p>
  ) : null

  const configFaturamento = isAdmin ? (
    <Painel
      titulo="Faturamento e NFS-e"
      acoes={(
        <Button asChild variant="ghost" size="sm">
          <Link href={`/clientes/${id}/editar`}><Pencil /> Editar</Link>
        </Button>
      )}
    >
      <dl className="space-y-3">
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
      {client.asaasSyncError && <p className="mt-4 t-rotulo text-destructive-texto bg-destructive-suave rounded-xl px-3 py-2">{client.asaasSyncError}</p>}
      {billingMissing.length > 0 && <p className="mt-4 t-rotulo text-warning bg-warning-suave rounded-xl px-3 py-2">Falta para cobrar: {billingMissing.join(', ')}</p>}
    </Painel>
  ) : null

  const cobrancasAsaas = isAdmin ? (
    <Painel semPadding titulo="Cobranças e notas fiscais">
      {client.asaasCharges.length === 0 ? (
        <p className="px-6 pb-6 t-corpo text-muted-foreground">Nenhuma cobrança gerada no Asaas.</p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {client.asaasCharges.map((c) => {
            const st = CHARGE_STATUS[c.status] ?? { label: c.status, variant: 'default' as const }
            return (
              <li key={c.id} className={`${linha} flex items-center gap-3`}>
                <div className="min-w-0 flex-1">
                  <p className="t-corpo text-foreground">{String(c.month).padStart(2, '0')}/{c.year} · <span className="font-display font-semibold tabular">{formatCurrency(Number(c.value))}</span></p>
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
    </Painel>
  ) : null

  // Linha do tempo do cliente, no desenho de "atividade recente" do Vireo
  const historySection = (
    <Painel titulo="Histórico do cliente">
      <ol className="relative space-y-4 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-border">
        <li className="relative pl-7">
          <span aria-hidden className="absolute left-0 top-1 w-[15px] h-[15px] rounded-full bg-success-suave ring-2 ring-success/40" />
          <p className="t-corpo text-foreground">Cadastrado em {formatDate(client.createdAt)}</p>
        </li>
        {isAdmin && client.tierHistory.map((h) => (
          <li key={h.id} className="relative pl-7">
            <span aria-hidden className="absolute left-0 top-1 w-[15px] h-[15px] rounded-full bg-marca-suave ring-2 ring-marca/30" />
            <p className="t-corpo text-foreground">
              Grupo {h.fromTier ? TIER_PT[h.fromTier] : 'sem grupo'} → {h.toTier ? TIER_PT[h.toTier] : 'sem grupo'}
            </p>
            <p className="t-legenda">
              {formatDate(h.createdAt)} · ticket {formatCurrency(h.ticket)} · {h.manual ? 'manual' : 'automática'}{h.reason ? ` · ${h.reason}` : ''}
            </p>
          </li>
        ))}
      </ol>
    </Painel>
  )

  /* --------------------------------- render --------------------------------- */

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title={client.name}
        subtitle={[
          `Cliente desde ${formatDate(desde)}`,
          `${activeServices.length} serviço(s) ativo(s)`,
          isAdmin && ticketMensal > 0 ? `${formatCurrency(ticketMensal)}/mês` : null,
        ].filter(Boolean).join(' · ')}
        acoes={(
          <>
            <Button asChild variant="ghost">
              <Link href="/clientes"><ArrowLeft /> Clientes</Link>
            </Button>
            {isAdmin && (
              <>
                <ClientEmailActions clientId={id} clientName={client.name} />
                <Button asChild>
                  <Link href={`/propostas/nova?clientId=${id}`}><FileText /> Nova proposta</Link>
                </Button>
                <MenuMaisCliente clientId={id} />
              </>
            )}
          </>
        )}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 pb-8 pt-2">
        <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-5 items-start">
          <div>{perfil}</div>

          <div className="min-w-0 space-y-5">
            {numeros}

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
                  <div className="space-y-4">
                    {recomendacaoAviso}
                    {isAdmin ? (
                      <div className="grid grid-cols-1 2xl:grid-cols-5 gap-4 items-start">
                        <div className="2xl:col-span-3 space-y-4">
                          {servicosCard}
                          {demandasCard}
                        </div>
                        <div className="2xl:col-span-2 space-y-4">
                          {cobrancasCard}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {servicosCard}
                        {demandasCard}
                      </div>
                    )}
                  </div>
                ),
                servicos: (
                  <ClientServicesPanel clientId={id} initialServices={sanitizedServices} isAdmin={isAdmin} />
                ),
                financeiro: (
                  <div className="grid grid-cols-1 2xl:grid-cols-5 gap-4 items-start">
                    <div className="2xl:col-span-3 space-y-4">
                      {cobrancasAsaas}
                      <Painel semPadding titulo="Em aberto">
                        <div className="border-t border-border">{paymentsList(emAbertoCobrancas, 'Nenhuma cobrança em aberto.')}</div>
                      </Painel>
                      <Painel semPadding titulo="Histórico de pagamentos">
                        <div className="border-t border-border">{paymentsList(historicoCobrancas, 'Nenhum pagamento registrado ainda.')}</div>
                      </Painel>
                    </div>
                    <div className="2xl:col-span-2">{configFaturamento}</div>
                  </div>
                ),
                documentos: isAdmin ? (
                  <div className="space-y-4">
                    <Painel
                      titulo="Propostas e aditivos"
                      acoes={(
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/propostas/nova?clientId=${id}`}><FileText /> Nova proposta</Link>
                        </Button>
                      )}
                    >
                      <ProposalsList clientId={id} compact />
                    </Painel>
                    <ClientCredentialsPanel clientId={id} initialCredentials={decryptedCredentials} />
                  </div>
                ) : null,
                historico: historySection,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
