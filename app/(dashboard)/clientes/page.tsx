import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/api-auth'
import Header from '@/components/layout/Header'
import ClientRowActions from '@/components/clientes/ClientRowActions'
import TierRangesConfig from '@/components/clientes/TierRangesConfig'
import TierBadge from '@/components/ui/TierBadge'
import Link from 'next/link'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Search, Eye } from 'lucide-react'

const TIER_FILTERS = [
  { key: '', label: 'Todos' },
  { key: 'START', label: 'Start' },
  { key: 'GROWTH', label: 'Growth' },
  { key: 'SCALE', label: 'Scale' },
]

const SORTS = [
  { key: '', label: 'Nome (A–Z)' },
  { key: 'ticket_desc', label: 'Maior ticket' },
  { key: 'ticket_asc', label: 'Menor ticket' },
]

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; tier?: string; sort?: string }>
}) {
  const { search, tier, sort } = await searchParams
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
    },
    include: { services: true },
    orderBy:
      sort === 'ticket_desc' ? { monthlyValue: 'desc' }
      : sort === 'ticket_asc' ? { monthlyValue: 'asc' }
      : { name: 'asc' },
  })

  const qs = (params: Record<string, string | undefined>) => {
    const merged = { search, tier, sort, ...params }
    const parts = Object.entries(merged)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    return parts.length ? `?${parts.join('&')}` : ''
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Clientes" subtitle={`${clients.length} cliente(s) cadastrado(s)`} />
      <div className="flex-1 overflow-y-auto p-6">
        {/* Faixas da segmentação — só administradores configuram */}
        {isAdmin && <TierRangesConfig />}

        {/* Filtro por grupo + ordenação */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
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

        <div className="flex items-center gap-3 mb-6">
          <form className="flex-1 relative max-w-sm">
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
              className="flex items-center gap-2 bg-[#030A8C] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#02077a] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Novo Cliente
            </Link>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
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
                        {client.services.slice(0, 3).map((s) => (
                          <span key={s.id} className="text-xs bg-[#030A8C]/10 text-[#030A8C] px-2 py-0.5 rounded-full">
                            {s.serviceName}
                          </span>
                        ))}
                        {client.services.length > 3 && (
                          <span className="text-xs text-gray-500">+{client.services.length - 3}</span>
                        )}
                      </div>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 hidden lg:table-cell text-sm text-gray-700">
                        {client.monthlyValue ? formatCurrency(client.monthlyValue) : '—'}
                      </td>
                    )}
                    <td className="px-4 py-3 hidden xl:table-cell text-sm text-gray-500">
                      {client.contractEnd ? formatDate(client.contractEnd) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${
                          client.status === 'ATIVO'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {client.status}
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
