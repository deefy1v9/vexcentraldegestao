'use client'

import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

/**
 * Linha do período atual (cheia, com área) contra o período anterior
 * (tracejada), dia a dia — como "Audience growth" no modelo. `formato`
 * escreve o valor no eixo e no balão.
 */
export default function GraficoComparativo({ pontos, cor = 'var(--marca)', formato, rotulos = ['Este mês', 'Mês anterior'] }: {
  pontos: Array<{ dia: string; atual: number | null; anterior: number | null }>
  cor?: string
  formato: 'moeda' | 'numero'
  rotulos?: [string, string]
}) {
  const fmt = (n: number) => formato === 'moeda'
    ? (n >= 1000 ? `R$ ${Math.round(n / 1000).toLocaleString('pt-BR')} mil` : `R$ ${Math.round(n).toLocaleString('pt-BR')}`)
    : n.toLocaleString('pt-BR')
  const fmtCheio = (n: number) => formato === 'moeda' ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : n.toLocaleString('pt-BR')
  const id = `grad-${cor.replace(/[^a-z0-9]/gi, '')}`
  return (
    <div>
      <div className="flex items-center gap-4 mb-3 t-legenda">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: cor }} />{rotulos[0]}</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-muted-foreground" />{rotulos[1]}</span>
      </div>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={pontos} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={cor} stopOpacity={0.22} />
                <stop offset="100%" stopColor={cor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis dataKey="dia" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={18} tick={{ fill: 'var(--muted-foreground)', fontSize: 11.5 }} />
            <YAxis tickFormatter={fmt} tickLine={false} axisLine={false} width={formato === 'moeda' ? 72 : 32} tick={{ fill: 'var(--muted-foreground)', fontSize: 11.5 }} />
            <Tooltip
              formatter={(v, nome) => [fmtCheio(Number(v ?? 0)), nome === 'atual' ? rotulos[0] : rotulos[1]]}
              labelFormatter={(d) => `Dia ${d}`}
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12.5 }}
            />
            <Line type="monotone" dataKey="anterior" stroke="var(--muted-foreground)" strokeDasharray="5 5" strokeWidth={1.5} dot={false} isAnimationActive animationDuration={900} connectNulls />
            <Area type="monotone" dataKey="atual" stroke={cor} strokeWidth={2.5} fill={`url(#${id})`} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--card)' }} isAnimationActive animationDuration={1100} connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
