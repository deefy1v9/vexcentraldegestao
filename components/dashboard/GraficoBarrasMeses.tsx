'use client'

import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatCurrency } from '@/lib/utils'

const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const SERIES = [
  { chave: 'recebido', nome: 'Recebido', cor: 'var(--marca)' },
  { chave: 'despesas', nome: 'Despesas', cor: 'var(--grafico-3)' },
] as const

type Ponto = { data: string; recebido: number; despesas: number }

const rotuloMes = (d: string) => { const [y, m] = d.split('-').map(Number); return `${MES[m - 1]}/${String(y).slice(2)}` }
const curto = (n: number) => n >= 1000 ? `R$ ${Math.round(n / 1000).toLocaleString('pt-BR')} mil` : `R$ ${Math.round(n).toLocaleString('pt-BR')}`

/**
 * Recebido × despesas por mês em barras, no modelo Vireo: com os meses
 * embaixo, a escala em reais ao lado e o valor exato ao passar o mouse (o
 * gráfico antigo era uma curva sem eixo, que não dizia quanto nem quando).
 */
export default function GraficoBarrasMeses({ pontos }: { pontos: Ponto[] }) {
  const [janela, setJanela] = useState<6 | 12>(6)
  if (pontos.length === 0) return <p className="t-corpo text-muted-foreground py-16 text-center">Sem movimento registrado ainda.</p>
  const dados = pontos.slice(-janela)
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-4">
          {SERIES.map((s) => (
            <span key={s.chave} className="t-rotulo text-muted-foreground inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.cor }} /> {s.nome}
            </span>
          ))}
        </div>
        <div className="inline-flex rounded-xl border border-border bg-secondary/60 p-1" role="tablist" aria-label="Período do gráfico">
          {([6, 12] as const).map((n) => (
            <button
              key={n}
              type="button"
              role="tab"
              aria-selected={janela === n}
              onClick={() => setJanela(n)}
              className={`h-7 px-3 rounded-lg text-[12px] font-semibold transition-colors ${janela === n ? 'bg-marca-suave text-marca-texto' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {n} meses
            </button>
          ))}
        </div>
      </div>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} barGap={4} barCategoryGap="28%" margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis dataKey="data" tickFormatter={rotuloMes} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
            <YAxis tickFormatter={curto} tickLine={false} axisLine={false} width={78} tick={{ fill: 'var(--muted-foreground)', fontSize: 11.5 }} />
            <Tooltip
              cursor={{ fill: 'var(--secondary)' }}
              formatter={(v, nome) => [formatCurrency(Number(v ?? 0)), nome]}
              labelFormatter={(d) => rotuloMes(String(d))}
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12.5 }}
            />
            {SERIES.map((s) => (
              <Bar key={s.chave} dataKey={s.chave} name={s.nome} fill={s.cor} radius={[6, 6, 0, 0]} maxBarSize={28} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
