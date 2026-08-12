'use client'

import { useEffect, useRef, useState } from 'react'
import { BarChart3 } from 'lucide-react'

interface Point {
  year: number
  month: number
  total: number
}

type RangeKey = '6m' | '12m' | 'ano'

const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MONTH_LONG = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const brlAxis = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

/** Arredonda o teto do eixo para um valor "limpo" (1/2/5 × 10^n). */
function niceCeil(v: number) {
  if (v <= 0) return 100
  const pow = Math.pow(10, Math.floor(Math.log10(v)))
  const unit = v / pow
  const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10
  return nice * pow
}

/**
 * Evolução do faturamento — linha da receita efetivamente recebida por mês.
 * Dados reais de /api/financeiro/evolucao (pagamentos com status PAGO);
 * nunca simula valores. Exclusivo de administradores.
 */
export default function RevenueChart() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [series, setSeries] = useState<Point[]>([])
  const [hasData, setHasData] = useState(false)
  const [range, setRange] = useState<RangeKey>('12m')
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    let alive = true
    fetch('/api/financeiro/evolucao')
      .then((r) => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then((data: { series: Point[]; hasData: boolean }) => {
        if (!alive) return
        setSeries(data.series)
        setHasData(data.hasData)
        setLoading(false)
      })
      .catch(() => {
        if (!alive) return
        setError(true)
        setLoading(false)
      })
    return () => { alive = false }
  }, [])

  const now = new Date()
  const points =
    range === '6m' ? series.slice(-6)
    : range === '12m' ? series.slice(-12)
    : series.filter((p) => p.year === now.getFullYear())

  const empty = !loading && !error && (!hasData || points.every((p) => p.total === 0))

  // Geometria
  const H = 240
  const PAD = { top: 16, right: 16, bottom: 26, left: 8 }
  const yMax = niceCeil(Math.max(...points.map((p) => p.total), 0) * 1.05)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax)
  const axisW = 8 + Math.max(...yTicks.map((t) => brlAxis.format(t).length)) * 6.4
  const plotW = Math.max(width - PAD.left - PAD.right - axisW, 0)
  const plotH = H - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + axisW + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW)
  const y = (v: number) => PAD.top + plotH - (yMax === 0 ? 0 : (v / yMax) * plotH)

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.total).toFixed(1)}`).join(' ')
  const areaPath = points.length > 1
    ? `${linePath} L${x(points.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`
    : ''

  // Rótulos do eixo x sem colisão: no máximo ~6 marcas
  const step = Math.max(1, Math.ceil(points.length / 6))

  function handleMove(e: React.MouseEvent<SVGRectElement>) {
    if (points.length === 0 || plotW <= 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const idx = Math.round(((px) / rect.width) * (points.length - 1))
    setHover(Math.min(Math.max(idx, 0), points.length - 1))
  }

  const hovered = hover != null ? points[hover] : null
  const tooltipLeft = hover != null && width > 0
    ? Math.min(Math.max(x(hover) - 70, 4), width - 148)
    : 0

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 border-b border-gray-100">
        <p className="font-semibold text-gray-900 text-sm">Evolução do faturamento</p>
        <div className="flex items-center gap-1" role="group" aria-label="Período do gráfico">
          {([['6m', '6 meses'], ['12m', '12 meses'], ['ano', 'Ano atual']] as [RangeKey, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => { setRange(key); setHover(null) }}
              aria-pressed={range === key}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                range === key
                  ? 'bg-[#030A8C] text-white'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div ref={containerRef} className="relative px-2 pt-2 pb-1">
        {loading ? (
          <div className="h-[240px] flex items-center justify-center" aria-label="Carregando gráfico">
            <div className="w-full h-full p-6 space-y-3 animate-pulse">
              <div className="h-3 bg-gray-100 rounded w-1/4" />
              <div className="h-40 bg-gray-50 rounded-lg" />
            </div>
          </div>
        ) : error ? (
          <div className="h-[240px] flex flex-col items-center justify-center text-center px-6">
            <BarChart3 className="w-6 h-6 text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">Não foi possível carregar o gráfico.</p>
            <p className="text-xs text-gray-400 mt-0.5">Recarregue a página para tentar de novo.</p>
          </div>
        ) : empty ? (
          <div className="h-[240px] flex flex-col items-center justify-center text-center px-6">
            <BarChart3 className="w-6 h-6 text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">Nenhum recebimento registrado no período.</p>
            <p className="text-xs text-gray-400 mt-0.5">
              O gráfico é preenchido conforme os pagamentos forem marcados como pagos no Financeiro.
            </p>
          </div>
        ) : width > 0 && (
          <>
            <svg
              width={width}
              height={H}
              role="img"
              aria-label={`Evolução do faturamento: receita recebida por mês, ${points.length} meses`}
            >
              <defs>
                <linearGradient id="rev-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#030A8C" stopOpacity="0.10" />
                  <stop offset="100%" stopColor="#030A8C" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Grade horizontal + rótulos do eixo y */}
              {yTicks.map((t) => (
                <g key={t}>
                  <line
                    x1={PAD.left + axisW} x2={width - PAD.right}
                    y1={y(t)} y2={y(t)}
                    stroke="#f3f4f6" strokeWidth="1"
                  />
                  <text x={PAD.left + axisW - 6} y={y(t) + 3.5} textAnchor="end" className="fill-gray-400" fontSize="10">
                    {brlAxis.format(t)}
                  </text>
                </g>
              ))}

              {/* Área + linha */}
              {areaPath && <path d={areaPath} fill="url(#rev-fill)" />}
              <path d={linePath} fill="none" stroke="#030A8C" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

              {/* Rótulos do eixo x */}
              {points.map((p, i) => (
                i % step === 0 && (
                  <text key={`${p.year}-${p.month}`} x={x(i)} y={H - 8} textAnchor="middle" className="fill-gray-400" fontSize="10">
                    {MONTH_SHORT[p.month - 1]}/{String(p.year).slice(2)}
                  </text>
                )
              ))}

              {/* Crosshair + marcador */}
              {hover != null && hovered && (
                <g>
                  <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke="#d1d5db" strokeWidth="1" strokeDasharray="3 3" />
                  <circle cx={x(hover)} cy={y(hovered.total)} r="5" fill="#030A8C" stroke="#fff" strokeWidth="2" />
                </g>
              )}

              {/* Camada de captura do mouse */}
              <rect
                x={PAD.left + axisW} y={PAD.top}
                width={plotW} height={plotH}
                fill="transparent"
                onMouseMove={handleMove}
                onMouseLeave={() => setHover(null)}
              />
            </svg>

            {/* Tooltip */}
            {hovered && (
              <div
                className="absolute pointer-events-none bg-gray-900 text-white rounded-lg px-3 py-2 shadow-lg z-10"
                style={{ left: tooltipLeft, top: Math.max(y(hovered.total) - 56, 0) }}
              >
                <p className="text-[10px] text-gray-300">{MONTH_LONG[hovered.month - 1]} de {hovered.year}</p>
                <p className="text-xs font-bold">{brl.format(hovered.total)}</p>
              </div>
            )}

            {/* Versão em tabela para leitores de tela */}
            <table className="sr-only">
              <caption>Receita recebida por mês</caption>
              <thead><tr><th>Mês</th><th>Valor recebido</th></tr></thead>
              <tbody>
                {points.map((p) => (
                  <tr key={`${p.year}-${p.month}`}>
                    <td>{MONTH_LONG[p.month - 1]} de {p.year}</td>
                    <td>{brl.format(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  )
}
