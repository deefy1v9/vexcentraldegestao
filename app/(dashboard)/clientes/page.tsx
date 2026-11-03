import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/api-auth'
import Header from '@/components/layout/Header'
import ClientRowActions from '@/components/clientes/ClientRowActions'
import ProposalsNav from '@/components/propostas/ProposalsNav'
import { AvatarCliente, GrupoCliente, MarcaInterna, StatusCliente, ehMarcaInterna } from '@/components/clientes/ClienteVisual'
import { Kpi } from '@/components/vex/vireo'
import { Button } from '@/components/vex/button'
import Link from 'next/link'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { recurringTicketCents } from '@/lib/billing-core'
import { Plus, Search, Eye, FileText, Users, Wallet, Receipt, CalendarClock, Layers } from 'lucide-react'

const TIER_FILTERS = [
  { key: '', label: 'Todos' },
  { key: 'START', label: 'Start' },
  { key: 'GROWTH', label: 'Growth' },
  { key: 'SCALE', label: 'Scale' },
]

const STATUS_FILTERS = [
  { key: '', label: 'Ativos' },
  { key: 'PAUSADO', label: 'Pausados' },
  { key: 'ENCERRADO', label: 'Encerrados' },
  { key: 'todos', label: 'Todos' },
]

const SORTS = [
  { key: '', label: 'Nome (A–Z)' },
  { key: 'ticket_desc', label: 'Maior ticket' },
  { key: 'ticket_asc', label: 'Menor ticket' },
]

const pilulaFiltro = (ativa: boolean) => cn(
  'h-8 px-3 inline-flex items-center rounded-full text-[12.5px] font-semibold transition-colors border',
  ativa ? 'bg-marca text-white border-marca' : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-subtle/60',
)

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; tier?: string; sort?: string; status?: string }>
}) {
  const { search, tier, sort, status } = await searchParams
  // Colaborador consulta a carteira, mas não cadastra, edita nem exclui.
  const viewer = await getSessionUser()
  const isAdmin = viewer?.role === 'ADMIN'
  const clients = await prisma.client.findMany({
    where: {
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { cnpj: { contains: search } },
              { niche: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(tier && ['START', 'GROWTH', 'SCALE'].includes(tier) ? { tier } : {}),
      // Padrão: só ativos. Pausados e encerrados ficam a um clique.
      ...(status === 'todos' ? {} : { status: status === 'PAUSADO' || status === 'ENCERRADO' ? status : 'ATIVO' }),
    },
    include: { services: true },
    orderBy: { name: 'asc' },
  })

  // Ticket calculado dos serviços (mesma regra do MRR), não o espelho
  // Client.monthlyValue, que fica velho quando o serviço muda fora da tela.
  const hojeISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const ticket = new Map(clients.map((c) => [c.id, recurringTicketCents(c.services, hojeISO)]))
  if (sort === 'ticket_desc') clients.sort((a, b) => ticket.get(b.id)! - ticket.get(a.id)!)
  if (sort === 'ticket_asc') clients.sort((a, b) => ticket.get(a.id)! - ticket.get(b.id)!)
  const totalTicket = clients.reduce((a, c) => a + ticket.get(c.id)!, 0)

  // Números do topo, tirados da própria lista (o que o filtro mostra)
  const comTicket = clients.filter((c) => ticket.get(c.id)! > 0).length
  const ticketMedio = comTicket > 0 ? totalTicket / comTicket : 0
  const servicosAtivos = clients.reduce((a, c) => a + c.services.filter((s) => s.status === 'ATIVO').length, 0)
  const hojeMs = new Date(hojeISO + 'T00:00:00Z').getTime()
  const vencendo = clients.filter((c) => {
    if (!c.contractEnd) return false
    const dias = (c.contractEnd.getTime() - hojeMs) / 86_400_000
    return dias >= 0 && dias <= 60
  }).length

  const qs = (params: Record<string, string | undefined>) => {
    const merged = { search, tier, sort, status, ...params }
    const parts = Object.entries(merged)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    return parts.length ? `?${parts.join('&')}` : ''
  }

  const th = 'text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground px-4 py-3 whitespace-nowrap'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Clientes"
        subtitle={`${clients.length} cliente(s)${isAdmin ? ` · ${formatCurrency(totalTicket / 100)}/mês recorrente` : ''}`}
        acoes={isAdmin ? (
          <>
            <Button asChild variant="outline">
              <Link href="/propostas/nova"><FileText /> Nova proposta</Link>
            </Button>
            <Button asChild>
              <Link href="/clientes/novo"><Plus /> Novo Cliente</Link>
            </Button>
          </>
        ) : undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 pb-8 pt-2 space-y-5">
        {/* Navegação interna da área de Clientes (menu lateral não muda) */}
        {isAdmin && <ProposalsNav showNew={false} />}

        {/* Os grupos (Start, Growth, Scale) saem sozinhos do ticket recorrente: sem card de faixas na tela (o dono, 15/10) */}

        <div className={cn('grid grid-cols-1 sm:grid-cols-2 gap-4', isAdmin ? 'xl:grid-cols-4' : 'xl:grid-cols-3')}>
          <Kpi icone={Users} rotulo="Clientes na lista" valor={clients.length} nota={STATUS_FILTERS.find((f) => f.key === (status ?? ''))?.label ?? 'Ativos'} />
          {isAdmin ? (
            <>
              <Kpi icone={Wallet} tom="sucesso" rotulo="Mensal recorrente" valor={formatCurrency(totalTicket / 100)} nota="Soma dos serviços recorrentes" />
              <Kpi icone={Receipt} tom="info" rotulo="Ticket médio" valor={formatCurrency(ticketMedio / 100)} nota={`${comTicket} cliente(s) com recorrência`} />
            </>
          ) : (
            <Kpi icone={Layers} tom="info" rotulo="Serviços ativos" valor={servicosAtivos} nota="Somando a lista" />
          )}
          <Kpi icone={CalendarClock} tom={vencendo > 0 ? 'atencao' : 'neutro'} rotulo="Contratos a vencer" valor={vencendo} nota="Nos próximos 60 dias" />
        </div>

        <section className="rounded-[24px] border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] overflow-hidden">
          {/* Cabeçalho do cartão: título, busca, filtros e ordenação (modelo Vireo) */}
          <div className="px-6 pt-6 pb-4 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-[21px] font-semibold tracking-[-0.01em] text-foreground">Carteira</h2>
                <p className="t-legenda mt-0.5">{clients.length} cliente(s) mostrado(s)</p>
              </div>
              <form className="relative w-full lg:max-w-sm">
                <Search className="w-4 h-4 text-subtle absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  name="search"
                  defaultValue={search}
                  placeholder="Buscar por nome, CNPJ ou nicho..."
                  className="w-full h-10 pl-9 pr-3 text-[13.5px] border border-border rounded-full bg-input text-foreground placeholder:text-subtle hover:border-subtle focus:outline-none focus:border-marca focus:ring-2 focus:ring-marca/20"
                />
              </form>
            </div>

            {/* Filtro por status, por grupo + ordenação */}
            <div className="flex flex-wrap items-center gap-2">
              {STATUS_FILTERS.map((f) => (
                <Link key={f.key || 'ativos'} href={`/clientes${qs({ status: f.key || undefined })}`} className={pilulaFiltro((status ?? '') === f.key)}>
                  {f.label}
                </Link>
              ))}
              <span aria-hidden className="w-px h-5 bg-border mx-1" />
              {TIER_FILTERS.map((f) => (
                <Link key={f.key || 'todos-grupos'} href={`/clientes${qs({ tier: f.key || undefined })}`} className={pilulaFiltro((tier ?? '') === f.key)}>
                  {f.label}
                </Link>
              ))}
              <div className="flex-1" />
              <div className="inline-flex rounded-xl border border-border bg-secondary/60 p-1" aria-label="Ordenar">
                {SORTS.map((s) => (
                  <Link
                    key={s.key || 'nome'}
                    href={`/clientes${qs({ sort: s.key || undefined })}`}
                    className={cn(
                      'h-7 px-3 inline-flex items-center rounded-lg text-[12px] font-semibold transition-colors',
                      (sort ?? '') === s.key ? 'bg-card text-marca-texto shadow-[0_0_0_1px_var(--border)]' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {s.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="border-y border-border bg-secondary/60">
                  <th className={cn(th, 'pl-6')}>Cliente</th>
                  <th className={cn(th, 'hidden md:table-cell')}>Nicho</th>
                  <th className={cn(th, 'hidden lg:table-cell')}>Serviços</th>
                  {isAdmin && <th className={cn(th, 'hidden lg:table-cell text-right')}>Valor mensal</th>}
                  <th className={cn(th, 'hidden xl:table-cell')}>Fim do contrato</th>
                  <th className={th}>Status</th>
                  <th className="px-4 py-3 pr-6"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {clients.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-14 t-corpo text-muted-foreground">
                      Nenhum cliente encontrado.{' '}
                      {isAdmin && (
                        <Link href="/clientes/novo" className="font-semibold text-marca-texto hover:underline">
                          Cadastrar primeiro cliente
                        </Link>
                      )}
                    </td>
                  </tr>
                ) : (
                  clients.map((client) => {
                    // Só os serviços ativos: os encerrados confundiam a leitura
                    const nomes = client.services.filter((s) => s.status === 'ATIVO').map((s) => s.customName || s.serviceName)
                    const resto = nomes.slice(2)
                    const valor = ticket.get(client.id)!
                    return (
                      <tr key={client.id} className="hover:bg-secondary/50 transition-colors">
                        <td className="px-4 pl-6 py-3.5 min-w-[280px]">
                          <Link href={`/clientes/${client.id}`} className="flex items-center gap-3 group min-w-0">
                            <AvatarCliente nome={client.name} />
                            <span className="min-w-0">
                              <span className="block text-[14px] font-semibold leading-snug text-foreground group-hover:text-marca-texto">{client.name}</span>
                              <span className="mt-1 flex flex-wrap items-center gap-1.5">
                                <GrupoCliente tier={client.tier} />
                                {ehMarcaInterna(client.name) && <MarcaInterna />}
                                {client.cnpj && <span className="text-[12px] text-muted-foreground tabular whitespace-nowrap">{client.cnpj}</span>}
                              </span>
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-3.5 hidden md:table-cell">
                          <span className="t-corpo text-muted-foreground">{client.niche || '—'}</span>
                        </td>
                        <td className="px-4 py-3.5 hidden lg:table-cell">
                          {nomes.length === 0 ? (
                            <span className="t-corpo text-subtle">—</span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1.5 max-w-[340px]">
                              {nomes.slice(0, 2).map((n, i) => (
                                <span key={`${n}-${i}`} title={n} className="max-w-[160px] truncate rounded-md border border-border bg-secondary/60 px-2 py-0.5 text-[12px] font-medium text-foreground">
                                  {n}
                                </span>
                              ))}
                              {resto.length > 0 && (
                                <span title={resto.join('\n')} className="cursor-help rounded-md bg-secondary px-1.5 py-0.5 text-[12px] font-semibold text-muted-foreground">
                                  +{resto.length}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3.5 hidden lg:table-cell text-right whitespace-nowrap">
                            {valor ? (
                              <span className="font-display text-[15px] font-semibold tabular text-foreground">{formatCurrency(valor / 100)}</span>
                            ) : (
                              <span className="t-corpo text-subtle">—</span>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3.5 hidden xl:table-cell t-corpo text-muted-foreground tabular whitespace-nowrap">
                          {client.contractEnd ? formatDate(client.contractEnd) : '—'}
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusCliente status={client.status} />
                        </td>
                        <td className="px-4 pr-6 py-3.5">
                          <div className="flex items-center justify-end gap-0.5">
                            <Link
                              href={`/clientes/${client.id}`}
                              title="Ver perfil"
                              aria-label={`Ver perfil de ${client.name}`}
                              className="p-2 rounded-lg text-muted-foreground hover:text-marca-texto hover:bg-secondary transition-colors"
                            >
                              <Eye className="w-4 h-4" />
                            </Link>
                            {/* Ações secundárias e destrutivas ficam no menu ⋮ */}
                            <ClientRowActions clientId={client.id} clientName={client.name} isAdmin={isAdmin} />
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
