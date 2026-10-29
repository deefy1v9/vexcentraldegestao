'use client'

import Link from 'next/link'
import { Bot } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export interface VexSalesMes {
  totalCents: number
  recebidoCents: number
  clientes: Array<{
    clientId: string
    nome: string
    plano: string
    cents: number
    situacao: 'pago' | 'pendente' | 'atrasado' | 'sem parcela'
    vence: string | null
  }>
}

const SITUACAO: Record<VexSalesMes['clientes'][number]['situacao'], string> = {
  pago: 'bg-green-100 text-green-700',
  pendente: 'bg-orange-100 text-orange-700',
  atrasado: 'bg-red-100 text-red-700',
  'sem parcela': 'bg-gray-100 text-gray-500',
}

/**
 * Faturamento da plataforma VEX Sales no mês, separado do resto da agência:
 * quem usa, o plano, quanto paga e se já pagou. O repasse de custo de IA
 * fica de fora (não é receita da plataforma).
 */
export default function VexSalesCard({ d }: { d: VexSalesMes | null }) {
  if (!d || d.clientes.length === 0) return null
  const brl = (c: number) => formatCurrency(c / 100)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 border-b border-gray-100">
        <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <span className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 inline-flex items-center justify-center"><Bot className="w-4 h-4" /></span>
          VEX Sales
        </p>
        <p className="text-sm text-gray-600">
          <span className="font-bold text-gray-900 tabular-nums">{brl(d.totalCents)}</span>/mês · {d.clientes.length} cliente(s)
        </p>
        <p className="text-[11px] text-gray-500 sm:ml-auto">
          {brl(d.recebidoCents)} recebido no mês · {brl(d.totalCents - d.recebidoCents)} a receber
        </p>
      </div>
      <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 divide-y md:divide-y-0 divide-gray-100">
        {d.clientes.map((c) => (
          <li key={`${c.clientId}-${c.plano}`} className="flex items-center justify-between gap-3 px-5 py-2.5 md:border-b md:border-gray-100">
            <div className="min-w-0">
              <Link href={`/clientes/${c.clientId}`} className="text-[13px] font-semibold text-gray-900 hover:text-[#030A8C] truncate block">
                {c.nome.split(' /')[0]}
              </Link>
              <p className="text-[11px] text-gray-400 truncate">
                {c.plano}
                {c.vence && c.situacao !== 'pago' ? ` · vence ${new Date(c.vence).toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' })}` : ''}
              </p>
            </div>
            <span className="flex items-center gap-2 shrink-0">
              <span className="text-[13px] font-bold text-gray-900 tabular-nums">{brl(c.cents)}</span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${SITUACAO[c.situacao]}`}>{c.situacao}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
