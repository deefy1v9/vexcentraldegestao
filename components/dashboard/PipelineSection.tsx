import Link from 'next/link'
import { ArrowUpRight, Target, TrendingUp, HelpCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { PipelineSummary } from '@/lib/pipeline-core'

const brl = (cents: number) => formatCurrency(cents / 100)

/**
 * Pipeline comercial no Dashboard: potencial em aberto e resultado do período,
 * visualmente separados. Estes valores NÃO entram na receita prevista, que
 * representa contratações; só viram receita depois do fechamento.
 */
export default function PipelineSection({
  summary, periodLabel, novosLeads,
}: {
  summary: PipelineSummary
  periodLabel: string
  novosLeads: number
}) {
  const carteira = [
    { label: 'Oportunidades em aberto', value: String(summary.abertas), sub: 'fechamento previsto no período' },
    { label: 'MRR potencial', value: `${brl(summary.mrrPotencialCents)}/mês`, sub: 'recorrente em negociação' },
    { label: 'Avulso em negociação', value: brl(summary.avulsoPotencialCents), sub: 'cobrança única' },
    ...(summary.projetoPotencialCents > 0
      ? [{ label: 'Projetos em negociação', value: `${brl(summary.projetoPotencialCents)}/mês`, sub: 'durante o período contratado' }]
      : []),
  ]

  const resultado = [
    { label: 'Negociações ganhas', value: String(summary.ganhas), sub: `${brl(summary.ganhasRecorrenteCents)}/mês contratados` },
    { label: 'Negociações perdidas', value: String(summary.perdidas), sub: 'pela data real do fechamento' },
    { label: 'Novos leads', value: String(novosLeads), sub: 'pela data de cadastro' },
  ]

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
        <p className="font-semibold text-gray-900 text-sm flex items-center gap-2">
          <Target className="w-4 h-4 text-[#030A8C]" /> Pipeline comercial
        </p>
        <Link href="/pipeline" className="text-[11px] font-semibold text-[#030A8C] hover:underline flex items-center gap-1">
          Abrir pipeline <ArrowUpRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-gray-100">
        {carteira.map((c) => (
          <Link key={c.label} href="/pipeline" className="p-4 hover:bg-gray-50 transition-colors">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">{c.label}</p>
            <p className="text-lg font-bold text-[#030A8C] mt-0.5">{c.value}</p>
            <p className="text-[10px] text-gray-400">{c.sub}</p>
          </Link>
        ))}
      </div>

      <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-2">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Resultado de {periodLabel}</p>
      </div>
      <div className="grid grid-cols-3 divide-x divide-gray-100">
        {resultado.map((c) => (
          <div key={c.label} className="p-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">{c.label}</p>
            <p className="text-lg font-bold text-gray-900 mt-0.5">{c.value}</p>
            <p className="text-[10px] text-gray-400">{c.sub}</p>
          </div>
        ))}
      </div>

      {summary.semPrevisao > 0 && (
        <p className="px-5 py-2.5 text-[11px] text-amber-700 bg-amber-50 border-t border-amber-100 flex items-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5" />
          {summary.semPrevisao} negociação(ões) sem previsão de fechamento, fora dos valores acima.
        </p>
      )}
      {summary.estimativaCents > 0 && (
        <p className="px-5 py-2.5 text-[11px] text-gray-500 border-t border-gray-100 flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5" />
          {brl(summary.estimativaCents)} ainda como valor estimado, sem composição de serviços.
        </p>
      )}
      <p className="px-5 py-2 text-[10px] text-gray-400 border-t border-gray-100">
        Potencial comercial. Não entra na receita prevista nem no MRR até o fechamento.
      </p>
    </div>
  )
}
