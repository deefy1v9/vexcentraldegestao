import Link from 'next/link'
import { ArrowUpRight, Target, CalendarClock, HelpCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { PipelineSummary } from '@/lib/pipeline-core'

const brl = (cents: number) => formatCurrency(cents / 100)

/**
 * Comercial no Dashboard, em dois blocos que não se misturam:
 * a carteira aberta é a foto de agora, valendo para qualquer período; ganhas,
 * perdidas e novos leads pertencem ao período selecionado. Nada aqui entra na
 * receita prevista, que representa contratações.
 */
export default function PipelineSection({
  summary, periodLabel, novosLeads,
}: {
  summary: PipelineSummary
  periodLabel: string
  novosLeads: number
}) {
  const pontuais = summary.avulsoPotencialCents + summary.projetoPotencialCents
  // O total junta a PRIMEIRA mensalidade com os pontuais: é o que entra no
  // primeiro período se tudo fechar, não o valor de contratos inteiros.
  const totalPotencial = summary.mrrPotencialCents + pontuais

  const carteira = [
    { label: 'Oportunidades abertas', value: String(summary.abertas), sub: 'todas as etapas em aberto', href: '/pipeline', destaque: false },
    { label: 'MRR potencial', value: `${brl(summary.mrrPotencialCents)}/mês`, sub: 'mensalidades propostas', href: '/pipeline', destaque: false },
    { label: 'Projetos e avulsos', value: brl(pontuais), sub: 'cobrança única em negociação', href: '/pipeline', destaque: false },
    { label: 'Total potencial', value: brl(totalPotencial), sub: '1ª mensalidade + pontuais', href: '/pipeline', destaque: true },
  ]

  const resultado = [
    { label: 'Ganhas', value: String(summary.ganhas), sub: `${brl(summary.ganhasRecorrenteCents)}/mês contratados`, href: '/pipeline?etapa=GANHO' },
    { label: 'Perdidas', value: String(summary.perdidas), sub: 'pela data real do fechamento', href: '/pipeline?etapa=PERDIDO' },
    { label: 'Novos leads', value: String(novosLeads), sub: 'pela data de cadastro', href: '/pipeline' },
  ]

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <p className="font-semibold text-gray-900 text-sm flex items-center gap-2">
          <Target className="w-4 h-4 text-[#030A8C]" /> Carteira aberta atual
          <span className="text-[11px] font-normal text-gray-400">todos os períodos</span>
        </p>
        <Link href="/pipeline" className="text-[11px] font-semibold text-[#030A8C] hover:underline flex items-center gap-1">
          Abrir pipeline <ArrowUpRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-gray-100">
        {carteira.map((c) => (
          <Link key={c.label} href={c.href} className={`p-4 hover:bg-gray-50 transition-colors ${c.destaque ? 'bg-[#030A8C]/[0.03]' : ''}`}>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">{c.label}</p>
            <p className={`text-lg font-bold mt-0.5 ${c.destaque ? 'text-[#F74A13]' : 'text-[#030A8C]'}`}>{c.value}</p>
            <p className="text-[10px] text-gray-400">{c.sub}</p>
          </Link>
        ))}
      </div>

      {(summary.semPrevisao > 0 || summary.semValor > 0) && (
        <div className="flex flex-wrap gap-2 px-4 pb-3">
          {summary.semPrevisao > 0 && (
            <Link
              href="/pipeline?semPrevisao=1"
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1 hover:border-[#030A8C] hover:text-[#030A8C] transition-colors"
            >
              <CalendarClock className="w-3 h-3" />
              {summary.semPrevisao} sem previsão de fechamento
            </Link>
          )}
          {summary.semValor > 0 && (
            <Link
              href="/pipeline?semValor=1"
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1 hover:border-[#030A8C] hover:text-[#030A8C] transition-colors"
            >
              <HelpCircle className="w-3 h-3" />
              {summary.semValor} sem valor informado
            </Link>
          )}
        </div>
      )}

      <div className="border-t border-gray-100 bg-gray-50/70 px-5 py-2">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Resultado de {periodLabel}</p>
      </div>
      <div className="grid grid-cols-3 divide-x divide-gray-100">
        {resultado.map((c) => (
          <Link key={c.label} href={c.href} className="p-4 hover:bg-gray-50 transition-colors">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">{c.label}</p>
            <p className="text-lg font-bold text-gray-900 mt-0.5">{c.value}</p>
            <p className="text-[10px] text-gray-400">{c.sub}</p>
          </Link>
        ))}
      </div>

      <p className="px-5 py-2 text-[10px] text-gray-400 border-t border-gray-100">
        Potencial comercial. Não entra na receita prevista nem no MRR até o fechamento.
      </p>
    </div>
  )
}
