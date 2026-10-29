import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/api-auth'
import Header from '@/components/layout/Header'
import ClientRowActions from '@/components/clientes/ClientRowActions'
import ProposalsNav from '@/components/propostas/ProposalsNav'
import TierBadge from '@/components/ui/TierBadge'
import Link from 'next/link'
import { formatCurrency, formatDate } from '@/lib/utils'
import { recurringTicketCents } from '@/lib/billing-core'
import { Plus, Search, Eye } from 'lucide-react'

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

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  ATIVO: { label: 'Ativo', cls: 'bg-green-100 text-green-700' },
  PAUSADO: { label: 'Pausado', cls: 'bg-amber-100 text-amber-700' },
  ENCERRADO: { label: 'Encerrado', cls: 'bg-gray-100 text-gray-500' },
}

const SORTS = [
  { key: '', label: 'Nome (A–Z)' },
  { key: 'ticket_desc', label: 'Maior ticket' },
  { key: 'ticket_asc', label: 'Menor ticket' },
]

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

  const qs = (params: Record<string, string | undefined>) => {
    const merged = { search, tier, sort, status, ...params }
    const parts = Object.entries(merged)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    return parts.length ? `?${parts.join('&')}` : ''
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Clientes"
        subtitle={`${clients.length} cliente(s)${isAdmin ? ` · ${formatCurrency(totalTicket / 100)}/mês recorrente` : ''}`}
      />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {/* Navegação interna da área de Clientes (menu lateral não muda) */}
        {isAdmin && <ProposalsNav />}

        {/* Os grupos (Start, Growth, Scale) saem sozinhos do ticket recorrente: sem card de faixas na tela (o dono, 15/10) */}

        {/* Filtro por status, por grupo + ordenação */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {STATUS_FILTERS.map((f) => (
            <Link
              key={f.key || 'ativos'}
              href={`/clientes${qs({ status: f.key || undefined })}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                (status ?? '') === f.key ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {f.label}
            </Link>
          ))}
          <span className="w-px h-5 bg-gray-200 mx-1" />
          {TIER_FILTERS.map((f) => (
            <Link
              key={f.key}
              href={`/clientes${qs({ tier: f.key || undefined })}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                (tier ?? '') === f.key
                  ? 'bg-[#030A8C] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </Link>
          ))}
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            {SORTS.map((s) => (
              <Link
                key={s.key}
                href={`/clientes${qs({ sort: s.key || undefined })}`}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                  (sort ?? '') === s.key
                    ? 'bg-[#030A8C]/10 text-[#030A8C]'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
          <form className="flex-1 relative w-full sm:max-w-sm">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              name="search"
              defaultValue={search}
              placeholder="Buscar por nome, CNPJ ou nicho..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#030A8C] bg-white text-gray-900 placeholder:text-gray-400"
            />
          </form>
          {isAdmin && (
            <Link
              href="/clientes/novo"
              className="flex items-center justify-center gap-2 bg-[#030A8C] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#02077a] transition-colors w-full sm:w-auto"
            >
              <Plus className="w-4 h-4" />
              Novo Cliente
            </Link>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">
                  Cliente
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide hidden md:table-cell">
                  Nicho
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide hidden lg:table-cell">
                  Serviços
                </th>
                {isAdmin && (
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide hidden lg:table-cell">
                    Valor Mensal
                  </th>
                )}
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide hidden xl:table-cell">
                  Fim do Contrato
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">
                  Status
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-500 text-sm">
                    Nenhum cliente encontrado.{' '}
                    {isAdmin && (
                      <Link href="/clientes/novo" className="text-[#030A8C] hover:underline">
                        Cadastrar primeiro cliente
                      </Link>
                    )}
                  </td>
                </tr>
              ) : (
                clients.map((client) => (
                  <tr key={client.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/clientes/${client.id}`} className="block">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-900 hover:text-[#030A8C]">
                            {client.name}
                          </p>
                          <TierBadge tier={client.tier} />
                        </div>
                        {client.cnpj && (
                          <p className="text-xs text-gray-500">{client.cnpj}</p>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-sm text-gray-500">{client.niche || '—'}</span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {/* Só os serviços ativos: os encerrados confundiam a leitura */}
                        {client.services.filter((s) => s.status === 'ATIVO').slice(0, 3).map((s) => (
                          <span key={s.id} className="text-xs bg-[#030A8C]/10 text-[#030A8C] px-2 py-0.5 rounded-full">
                            {s.customName || s.serviceName}
                          </span>
                        ))}
                        {client.services.filter((s) => s.status === 'ATIVO').length > 3 && (
                          <span className="text-xs text-gray-500">+{client.services.filter((s) => s.status === 'ATIVO').length - 3}</span>
                        )}
                      </div>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 hidden lg:table-cell text-sm text-gray-700">
                        {ticket.get(client.id) ? formatCurrency(ticket.get(client.id)! / 100) : '—'}
                      </td>
                    )}
                    <td className="px-4 py-3 hidden xl:table-cell text-sm text-gray-500">
                      {client.contractEnd ? formatDate(client.contractEnd) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${(STATUS_LABEL[client.status] ?? STATUS_LABEL.ENCERRADO).cls}`}>
                        {STATUS_LABEL[client.status]?.label ?? client.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/clientes/${client.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-gray-600 border border-gray-200 rounded-lg text-xs font-medium hover:border-[#030A8C] hover:text-[#030A8C] transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                          Ver perfil
                        </Link>
                        {/* Ações secundárias e destrutivas ficam no menu ⋮ */}
                        <ClientRowActions clientId={client.id} clientName={client.name} isAdmin={isAdmin} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
