'use client'

import { useEffect, useState } from 'react'
import { Layers, Check, ChevronDown } from 'lucide-react'
import CurrencyInput from '@/components/ui/CurrencyInput'
import { formatCurrency } from '@/lib/utils'

/**
 * Faixas da segmentação da carteira (só administradores):
 * Start ≤ X · Growth de X até Y · Scale acima de Y.
 * O grupo automático de cada cliente é recalculado quando os serviços
 * mudam; classificações manuais nunca são sobrescritas.
 */
export default function TierRangesConfig() {
  const [open, setOpen] = useState(false)
  const [startMax, setStartMax] = useState<number | null>(null)
  const [growthMax, setGrowthMax] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : {}))
      .then((s: Record<string, string>) => {
        if (s.TIER_START_MAX) setStartMax(Number(s.TIER_START_MAX))
        if (s.TIER_GROWTH_MAX) setGrowthMax(Number(s.TIER_GROWTH_MAX))
      })
      .catch(() => {})
  }, [])

  async function save() {
    setError(null)
    if (startMax == null || growthMax == null || growthMax <= startMax) {
      setError('O limite do Growth precisa ser maior que o do Start.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ TIER_START_MAX: String(startMax), TIER_GROWTH_MAX: String(growthMax) }),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } else {
        setError('Não foi possível salvar as faixas.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Layers className="w-4 h-4 text-[#030A8C]" />
          Faixas da segmentação (Start · Growth · Scale)
        </span>
        <span className="flex items-center gap-2">
          {startMax != null && growthMax != null && (
            <span className="text-[11px] text-gray-400 hidden sm:inline">
              Start ≤ {formatCurrency(startMax)} · Growth ≤ {formatCurrency(growthMax)} · Scale acima
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && (
        <div className="border-t border-gray-100 p-4 space-y-3">
          <p className="text-xs text-gray-500">
            O grupo recomendado de cada cliente é calculado pelo ticket mensal (soma dos serviços
            ativos). Classificações manuais têm prioridade e nunca são alteradas automaticamente.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Start: ticket até</label>
              <CurrencyInput value={startMax} onChange={setStartMax} className="input text-sm" ariaLabel="Limite do grupo Start" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Growth: ticket até</label>
              <CurrencyInput value={growthMax} onChange={setGrowthMax} className="input text-sm" ariaLabel="Limite do grupo Growth" />
            </div>
            <p className="text-xs text-gray-400 pb-2.5">Scale: acima do limite do Growth</p>
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#030A8C] text-white rounded-lg text-xs font-semibold hover:bg-[#02077a] disabled:opacity-50 transition-colors"
            >
              {saved ? <Check className="w-3.5 h-3.5" /> : null}
              {saving ? 'Salvando...' : saved ? 'Salvo' : 'Salvar faixas'}
            </button>
          </div>
          {error && (
            <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>
      )}
    </div>
  )
}
