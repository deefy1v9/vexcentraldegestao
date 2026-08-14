'use client'

import { useState } from 'react'
import { ChevronDown, Layers } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import TierBadge from '@/components/ui/TierBadge'

interface Segment {
  tier: string
  count: number
  revenue: number
}

/**
 * Resumo compacto e expansível da carteira por grupo (Start/Growth/Scale):
 * quantidade de clientes, receita mensal e participação no faturamento.
 */
export default function PortfolioSegmentation({ segments, total }: { segments: Segment[]; total: number }) {
  const [open, setOpen] = useState(false)
  const classified = segments.reduce((s, x) => s + x.count, 0)
  if (classified === 0) return null

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-2 font-semibold text-gray-900 text-sm">
          <Layers className="w-4 h-4 text-[#030A8C]" />
          Segmentação da carteira
        </span>
        <span className="flex items-center gap-3">
          <span className="hidden sm:flex items-center gap-2">
            {segments.filter((s) => s.count > 0).map((s) => (
              <span key={s.tier} className="flex items-center gap-1">
                <TierBadge tier={s.tier} />
                <span className="text-[11px] text-gray-500 font-semibold">{s.count}</span>
              </span>
            ))}
          </span>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <div className="border-t border-gray-100 grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
          {segments.map((s) => {
            const share = total > 0 ? (s.revenue / total) * 100 : 0
            return (
              <div key={s.tier} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <TierBadge tier={s.tier} size="sm" />
                  <span className="text-xs text-gray-400">{s.count} cliente(s)</span>
                </div>
                <p className="text-lg font-bold text-gray-900">{formatCurrency(s.revenue)}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${s.tier === 'SCALE' ? 'bg-[#F74A13]' : 'bg-[#030A8C]'}`}
                      style={{ width: `${Math.min(share, 100)}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-gray-500 font-semibold">{share.toFixed(0)}%</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
