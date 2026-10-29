'use client'

import { TrendingUp, TrendingDown, Info } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export interface MonthSummary {
  year: number
  month: number
  mrrCents: number
  previstaRecorrenteCents: number
  previstaAvulsaCents: number
  previstaCents: number
  recebidaCents: number
  recebidaRecorrenteCents: number
  recebidaAvulsaCents: number
  pendenteCents: number
  atrasadaCents: number
  custosPrevistosCents: number
  custosPagosCents: number
  salariosPrevistosCents: number
  salariosPagosCents: number
  resultadoPrevistoCents: number
  lucroRealizadoCents: number
  activeClients: number
  segments: Array<{ tier: string | null; count: number; recurringCents: number; share: number }>
  custosPorCategoria: Array<{ category: string; previstoCents: number; pagoCents: number }>
  cobrancasPorStatus: Array<{ status: string; count: number; cents: number }>
  previous: {
    previstaCents: number
    recebidaCents: number
    pendenteCents: number
    atrasadaCents: number
    custosPrevistosCents: number
    custosPagosCents: number
    resultadoPrevistoCents: number
    lucroRealizadoCents: number
    mrrCents: number
  } | null
}

export type TileKey = 'recebido' | 'receber' | 'atrasado' | 'custos'

const brl = (cents: number) => formatCurrency(cents / 100)
const pct = (part: number, total: number) => (total > 0 ? Math.max(0, Math.min(100, (part / total) * 100)) : 0)

/** Variação real contra o mês anterior. Sem base de comparação, não inventa. */
function Trend({ current, previous, invert = false }: { current: number; previous: number | null | undefined; invert?: boolean }) {
  if (previous == null || previous === 0) return null
  const d = ((current - previous) / Math.abs(previous)) * 100
  if (Math.abs(d) < 0.5) return <span className="text-[11px] text-gray-400">igual ao mês anterior</span>
  const up = d > 0
  const good = invert ? !up : up
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span className={`text-[11px] font-semibold inline-flex items-center gap-1 ${good ? 'text-green-600' : 'text-red-600'}`}>
      <Icon className="w-3 h-3" />
      {up ? '+' : ''}{d.toFixed(0)}% vs mês anterior
    </span>
  )
}

/** Linha da legenda que também filtra a tabela abaixo. */
function Legenda({
  cor, label, cents, total, on, onClick,
}: { cor: string; label: string; cents: number; total: number; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left transition-colors ${on ? 'bg-[#030A8C]/[0.06] ring-1 ring-[#030A8C]/30' : 'hover:bg-gray-50'}`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${cor}`} />
        <span className="text-xs font-medium text-gray-700 truncate">{label}</span>
      </span>
      <span className="flex items-baseline gap-1.5 shrink-0">
        <span className="text-sm font-bold text-gray-900 tabular-nums">{brl(cents)}</span>
        <span className="text-[10px] text-gray-400 tabular-nums w-8 text-right">{pct(cents, total).toFixed(0)}%</span>
      </span>
    </button>
  )
}

/**
 * Os números do mês em dois cartões que fecham a conta:
 * - Receitas: previsto = recebido + a receber + atrasado, numa barra só.
 *   Quando as parcelas não batem com a previsão, a diferença aparece com o
 *   motivo — nada de três números soltos que ninguém sabe somar.
 * - Custos e resultado: o que sai, o que sobra e o MRR.
 * Cada parte da legenda filtra a tabela abaixo. Tudo vem do resumo do backend
 * (lib/finance-summary), a mesma regra do Dashboard.
 */
export default function FinanceKpis({
  s, loading, active, onToggle,
}: {
  s: MonthSummary | null
  loading: boolean
  active: TileKey | null
  onToggle: (k: TileKey) => void
}) {
  if (loading || !s) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 h-full">
        {[...Array(2)].map((_, i) => <div key={i} className="min-h-[220px] bg-white border border-gray-200 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  const p = s.previous
  const parcelas = s.recebidaCents + s.pendenteCents + s.atrasadaCents
  // Base da barra: o maior entre o previsto e o que já existe em parcelas,
  // para a barra nunca passar de 100% quando entra algo fora da previsão.
  const base = Math.max(s.previstaCents, parcelas)
  const diferenca = parcelas - s.previstaCents
  const custosPendentes = Math.max(0, s.custosPrevistosCents - s.custosPagosCents)
  const recebidoPct = pct(s.recebidaCents, s.previstaCents)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 h-full">
      {/* ------------------------------ Receitas ------------------------------ */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Receita prevista no mês</p>
            <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{brl(s.previstaCents)}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {brl(s.previstaRecorrenteCents)} recorrente · {brl(s.previstaAvulsaCents)} avulso
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-bold text-green-600 tabular-nums">{recebidoPct.toFixed(0)}%</p>
            <p className="text-[11px] text-gray-400">já recebido</p>
          </div>
        </div>

        <div className="mt-4 h-2.5 w-full rounded-full bg-gray-100 overflow-hidden flex" aria-hidden>
          <div className="h-full bg-green-500" style={{ width: `${pct(s.recebidaCents, base)}%` }} />
          <div className="h-full bg-orange-400" style={{ width: `${pct(s.pendenteCents, base)}%` }} />
          <div className="h-full bg-red-500" style={{ width: `${pct(s.atrasadaCents, base)}%` }} />
        </div>

        <div className="mt-3 grid gap-0.5">
          <Legenda cor="bg-green-500" label="Recebido" cents={s.recebidaCents} total={s.previstaCents} on={active === 'recebido'} onClick={() => onToggle('recebido')} />
          <Legenda cor="bg-orange-400" label="A receber (no prazo)" cents={s.pendenteCents} total={s.previstaCents} on={active === 'receber'} onClick={() => onToggle('receber')} />
          <Legenda cor="bg-red-500" label="Atrasado" cents={s.atrasadaCents} total={s.previstaCents} on={active === 'atrasado'} onClick={() => onToggle('atrasado')} />
        </div>

        {Math.abs(diferenca) >= 100 && (
          <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50 border border-amber-100 px-2.5 py-2 text-[11px] text-amber-800">
            <Info className="w-3.5 h-3.5 mt-px shrink-0" />
            {diferenca < 0
              ? `${brl(-diferenca)} da previsão ainda não virou parcela (serviço sem cobrança gerada no mês).`
              : `${brl(diferenca)} em parcelas fora da previsão (pagamento de serviço encerrado, pausado ou lançado à parte).`}
          </p>
        )}

        <div className="mt-auto pt-3">
          <Trend current={s.recebidaCents} previous={p?.recebidaCents} />
        </div>
      </div>

      {/* ------------------------- Custos e resultado ------------------------- */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col">
        <button
          type="button"
          onClick={() => onToggle('custos')}
          aria-pressed={active === 'custos'}
          className={`-m-2 p-2 rounded-xl text-left transition-colors ${active === 'custos' ? 'bg-[#030A8C]/[0.06] ring-1 ring-[#030A8C]/30' : 'hover:bg-gray-50'}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Custos e salários</p>
              <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{brl(s.custosPrevistosCents)}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {brl(s.custosPagosCents)} pago · <span className={custosPendentes > 0 ? 'text-orange-600 font-semibold' : ''}>{brl(custosPendentes)} a pagar</span>
              </p>
            </div>
            <Trend current={s.custosPrevistosCents} previous={p?.custosPrevistosCents} invert />
          </div>
          <div className="mt-3 h-2 w-full rounded-full bg-gray-100 overflow-hidden" aria-hidden>
            <div className="h-full bg-purple-500" style={{ width: `${pct(s.custosPagosCents, s.custosPrevistosCents)}%` }} />
          </div>
        </button>

        <dl className="mt-4 divide-y divide-gray-100 text-sm">
          <div className="flex items-center justify-between py-2">
            <dt className="text-gray-600">
              Resultado previsto
              <span className="block text-[10px] text-gray-400">receita prevista − custos</span>
            </dt>
            <dd className={`font-bold tabular-nums ${s.resultadoPrevistoCents < 0 ? 'text-red-600' : 'text-[#030A8C]'}`}>{brl(s.resultadoPrevistoCents)}</dd>
          </div>
          <div className="flex items-center justify-between py-2">
            <dt className="text-gray-600">
              Lucro realizado
              <span className="block text-[10px] text-gray-400">recebido − custos pagos</span>
            </dt>
            <dd className={`font-bold tabular-nums ${s.lucroRealizadoCents < 0 ? 'text-red-600' : 'text-green-600'}`}>{brl(s.lucroRealizadoCents)}</dd>
          </div>
          <div className="flex items-center justify-between py-2">
            <dt className="text-gray-600">
              Receita recorrente (MRR)
              <span className="block text-[10px] text-gray-400">{s.activeClients} cliente(s) com recorrência</span>
            </dt>
            <dd className="font-bold tabular-nums text-gray-900 text-right">
              {brl(s.mrrCents)}
              <span className="block"><Trend current={s.mrrCents} previous={p?.mrrCents} /></span>
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
