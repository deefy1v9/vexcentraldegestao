'use client'

import { useEffect, useState } from 'react'
import { Settings2, X, Check } from 'lucide-react'

interface Config {
  groupADays: number[]
  groupBDays: number[]
  allowSaturday: boolean
  allowSunday: boolean
  holidayMode: 'skip' | 'allow'
  extraHolidays: string[]
  capacityPerDay: number
  capacityPerUser: number
  leadProduction: number
  leadReview: number
  leadApproval: number
  leadSchedule: number
  durationByType: Record<string, number>
}

const WEEKDAYS = [
  { value: 1, label: 'Seg' }, { value: 2, label: 'Ter' }, { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' }, { value: 5, label: 'Sex' }, { value: 6, label: 'Sáb' },
  { value: 7, label: 'Dom' },
]

/**
 * Configuração administrativa do planejamento: dias dos grupos, capacidade,
 * antecedências, sábado/domingo, feriados e duração estimada por tipo.
 * Também informa a capacidade diária ao calendário, para o alerta de
 * sobrecarga usar o valor configurado — nunca um número fixo no código.
 */
export default function PlannerConfigPanel({ onCapacity }: { onCapacity?: (n: number) => void }) {
  const [open, setOpen] = useState(false)
  const [cfg, setCfg] = useState<Config | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/planejamento/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (!b?.config) return
        setCfg(b.config)
        onCapacity?.(b.config.capacityPerDay)
      })
      .catch(() => {})
    // onCapacity é estável na prática (setState do pai); recarregar aqui
    // dispararia requisições em loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function set<K extends keyof Config>(k: K, v: Config[K]) {
    setCfg((p) => (p ? { ...p, [k]: v } : p))
  }

  function toggleDay(group: 'groupADays' | 'groupBDays', day: number) {
    setCfg((p) => {
      if (!p) return p
      const cur = p[group]
      return { ...p, [group]: cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day].sort((a, b) => a - b) }
    })
  }

  async function save() {
    if (!cfg) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/planejamento/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cfg, extraHolidays: cfg.extraHolidays }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body.error || 'Não foi possível salvar.'); return }
      setCfg(body.config)
      onCapacity?.(body.config.capacityPerDay)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Configuração do planejamento"
        className="flex items-center gap-1.5 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-500 hover:border-[#030A8C] hover:text-[#030A8C] transition-colors"
      >
        <Settings2 className="w-3.5 h-3.5" />
        <span className="hidden lg:inline">Planejamento</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center sm:justify-center sm:p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <h3 className="font-bold text-gray-900 text-sm">Configuração do planejamento</h3>
                <p className="text-[11px] text-gray-500 mt-0.5">Vale para as próximas propostas da IA.</p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Fechar" className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            {!cfg ? (
              <div className="p-5 space-y-3 animate-pulse">
                {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded-xl" />)}
              </div>
            ) : (
              <div className="p-4 sm:p-5 space-y-5">
                {/* Grupos */}
                <div className="space-y-3">
                  <p className="text-xs font-bold text-gray-900">Dias de publicação por grupo</p>
                  {(['groupADays', 'groupBDays'] as const).map((group) => (
                    <div key={group}>
                      <p className="text-[11px] font-medium text-gray-600 mb-1.5">
                        Grupo {group === 'groupADays' ? 'A' : 'B'}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {WEEKDAYS.map((d) => {
                          const active = cfg[group].includes(d.value)
                          const blocked = (d.value === 6 && !cfg.allowSaturday) || (d.value === 7 && !cfg.allowSunday)
                          return (
                            <button
                              key={d.value}
                              type="button"
                              onClick={() => toggleDay(group, d.value)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                                active
                                  ? 'bg-[#030A8C] text-white border-[#030A8C]'
                                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                              } ${blocked && active ? 'opacity-50' : ''}`}
                              title={blocked ? 'Dia desativado nas regras abaixo' : undefined}
                            >
                              {d.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-xs text-gray-700">
                      <input type="checkbox" checked={cfg.allowSaturday} onChange={(e) => set('allowSaturday', e.target.checked)} />
                      Permitir sábado
                    </label>
                    <label className="flex items-center gap-2 text-xs text-gray-700">
                      <input type="checkbox" checked={cfg.allowSunday} onChange={(e) => set('allowSunday', e.target.checked)} />
                      Permitir domingo
                    </label>
                  </div>
                </div>

                {/* Capacidade */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-900">Capacidade</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 mb-1">Entregas por dia</label>
                      <input type="number" min={1} max={100} value={cfg.capacityPerDay}
                        onChange={(e) => set('capacityPerDay', Number(e.target.value))} className="input" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 mb-1">Por colaborador/dia</label>
                      <input type="number" min={1} max={50} value={cfg.capacityPerUser}
                        onChange={(e) => set('capacityPerUser', Number(e.target.value))} className="input" />
                    </div>
                  </div>
                </div>

                {/* Antecedências */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-900">Antecedência (dias antes da publicação)</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {([
                      ['leadProduction', 'Produção'],
                      ['leadReview', 'Revisão'],
                      ['leadApproval', 'Aprovação'],
                      ['leadSchedule', 'Agendamento'],
                    ] as const).map(([key, label]) => (
                      <div key={key}>
                        <label className="block text-[11px] font-medium text-gray-600 mb-1">{label}</label>
                        <input type="number" min={0} max={30} value={cfg[key]}
                          onChange={(e) => set(key, Number(e.target.value))} className="input" />
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-400">
                    A produção precisa ter antecedência maior ou igual à revisão — é o fluxo já usado nas demandas.
                  </p>
                </div>

                {/* Feriados */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-900">Feriados</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 mb-1">Tratamento</label>
                      <select value={cfg.holidayMode} onChange={(e) => set('holidayMode', e.target.value as 'skip' | 'allow')} className="input">
                        <option value="skip">Não publicar em feriado</option>
                        <option value="allow">Permitir publicar em feriado</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 mb-1">Datas extras (AAAA-MM-DD)</label>
                      <input
                        value={cfg.extraHolidays.join(', ')}
                        onChange={(e) => set('extraHolidays', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
                        className="input"
                        placeholder="2026-01-25, 2026-07-09"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Feriados nacionais (incluindo Carnaval, Páscoa e Corpus Christi) são calculados automaticamente.
                  </p>
                </div>

                {/* Duração por tipo */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-900">Duração estimada por tipo (minutos)</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {Object.entries(cfg.durationByType).map(([type, minutes]) => (
                      <div key={type}>
                        <label className="block text-[11px] font-medium text-gray-600 mb-1 capitalize">{type}</label>
                        <input
                          type="number" min={5} max={2000} value={minutes}
                          onChange={(e) => set('durationByType', { ...cfg.durationByType, [type]: Number(e.target.value) })}
                          className="input"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
              </div>
            )}

            <div className="flex justify-end gap-2 p-4 sm:p-5 border-t border-gray-100 sticky bottom-0 bg-white">
              <button onClick={() => setOpen(false)} className="px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-900">
                Fechar
              </button>
              <button
                onClick={save}
                disabled={saving || !cfg}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#030A8C] text-white rounded-lg text-xs font-semibold hover:bg-[#02077a] disabled:opacity-40 transition-colors"
              >
                {saved ? <Check className="w-3.5 h-3.5" /> : null}
                {saving ? 'Salvando…' : saved ? 'Salvo' : 'Salvar configuração'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
