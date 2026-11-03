'use client'

import { ArrowDownLeft, ArrowUpRight, TrendingUp, TrendingDown, Info } from 'lucide-react'
import { Chip, Numero, Sobretitulo } from '@/components/vex/vireo'
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
  if (Math.abs(d) < 0.5) return <span className="text-[11.5px] text-muted-foreground">igual ao mês anterior</span>
  const up = d > 0
  const good = invert ? !up : up
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold inline-flex items-center gap-1 whitespace-nowrap ${good ? 'bg-success-suave text-success' : 'bg-destructive-suave text-destructive-texto'}`}>
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
      className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors ${on ? 'bg-marca-suave ring-1 ring-marca/30' : 'hover:bg-secondary/70'}`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cor}`} />
        <span className={`text-[13px] font-medium truncate ${on ? 'text-marca-texto' : 'text-foreground'}`}>{label}</span>
      </span>
      <span className="flex items-baseline gap-1.5 shrink-0">
        <span className="font-display text-[15px] font-semibold text-foreground tabular-nums">{brl(cents)}</span>
        <span className="text-[11px] text-muted-foreground tabular-nums w-8 text-right">{pct(cents, total).toFixed(0)}%</span>
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 h-full">
        {[...Array(2)].map((_, i) => <div key={i} className="min-h-[240px] bg-card border border-border rounded-[24px] animate-pulse" />)}
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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 h-full">
      {/* ------------------------------ Receitas ------------------------------ */}
      <div className="bg-card rounded-[24px] border border-border p-6 flex flex-col shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <Chip icone={ArrowDownLeft} tom="sucesso" tamanho="lg" />
            <div className="min-w-0">
              <Sobretitulo>Receita prevista no mês</Sobretitulo>
              <Numero className="block text-[28px] leading-9 mt-0.5">{brl(s.previstaCents)}</Numero>
              <p className="t-legenda mt-0.5">
                {brl(s.previstaRecorrenteCents)} recorrente · {brl(s.previstaAvulsaCents)} avulso
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="font-display text-[28px] leading-9 font-semibold text-success tabular-nums">{recebidoPct.toFixed(0)}%</p>
            <p className="t-legenda">já recebido</p>
          </div>
        </div>

        <div className="mt-5 h-2.5 w-full rounded-full bg-secondary overflow-hidden flex" aria-hidden>
          <div className="h-full bg-success" style={{ width: `${pct(s.recebidaCents, base)}%` }} />
          <div className="h-full bg-warning/70" style={{ width: `${pct(s.pendenteCents, base)}%` }} />
          <div className="h-full bg-destructive" style={{ width: `${pct(s.atrasadaCents, base)}%` }} />
        </div>

        <div className="mt-3 grid gap-0.5 -mx-3">
          <Legenda cor="bg-success" label="Recebido" cents={s.recebidaCents} total={s.previstaCents} on={active === 'recebido'} onClick={() => onToggle('recebido')} />
          <Legenda cor="bg-warning/70" label="A receber (no prazo)" cents={s.pendenteCents} total={s.previstaCents} on={active === 'receber'} onClick={() => onToggle('receber')} />
          <Legenda cor="bg-destructive" label="Atrasado" cents={s.atrasadaCents} total={s.previstaCents} on={active === 'atrasado'} onClick={() => onToggle('atrasado')} />
        </div>

        {Math.abs(diferenca) >= 100 && (
          <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-warning-suave border border-warning/20 px-3 py-2 text-[11.5px] text-warning">
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
      <div className="bg-card rounded-[24px] border border-border p-6 flex flex-col shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <button
          type="button"
          onClick={() => onToggle('custos')}
          aria-pressed={active === 'custos'}
          className={`-m-3 p-3 rounded-2xl text-left transition-colors ${active === 'custos' ? 'bg-marca-suave ring-1 ring-marca/30' : 'hover:bg-secondary/60'}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <Chip icone={ArrowUpRight} tom="perigo" tamanho="lg" />
              <div className="min-w-0">
                <Sobretitulo>Custos e salários</Sobretitulo>
                <Numero className="block text-[28px] leading-9 mt-0.5">{brl(s.custosPrevistosCents)}</Numero>
                <p className="t-legenda mt-0.5">
                  {brl(s.custosPagosCents)} pago · <span className={custosPendentes > 0 ? 'text-warning font-semibold' : ''}>{brl(custosPendentes)} a pagar</span>
                </p>
              </div>
            </div>
            <Trend current={s.custosPrevistosCents} previous={p?.custosPrevistosCents} invert />
          </div>
          <div className="mt-4 h-2 w-full rounded-full bg-secondary overflow-hidden" aria-hidden>
            <div className="h-full bg-marca" style={{ width: `${pct(s.custosPagosCents, s.custosPrevistosCents)}%` }} />
          </div>
        </button>

        <dl className="mt-5 divide-y divide-border text-[13.5px]">
          <div className="flex items-center justify-between py-2.5">
            <dt className="text-foreground">
              Resultado previsto
              <span className="block t-legenda">receita prevista − custos</span>
            </dt>
            <dd className={`font-display text-[16px] font-semibold tabular-nums ${s.resultadoPrevistoCents < 0 ? 'text-destructive-texto' : 'text-marca-texto'}`}>{brl(s.resultadoPrevistoCents)}</dd>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <dt className="text-foreground">
              Lucro realizado
              <span className="block t-legenda">recebido − custos pagos</span>
            </dt>
            <dd className={`font-display text-[16px] font-semibold tabular-nums ${s.lucroRealizadoCents < 0 ? 'text-destructive-texto' : 'text-success'}`}>{brl(s.lucroRealizadoCents)}</dd>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <dt className="text-foreground">
              Receita recorrente (MRR)
              <span className="block t-legenda">{s.activeClients} cliente(s) com recorrência</span>
            </dt>
            <dd className="font-display text-[16px] font-semibold tabular-nums text-foreground text-right">
              {brl(s.mrrCents)}
              <span className="block mt-0.5 font-sans"><Trend current={s.mrrCents} previous={p?.mrrCents} /></span>
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
