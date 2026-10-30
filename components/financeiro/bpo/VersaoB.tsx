'use client'

import { useState, type ReactNode } from 'react'
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  AlertTriangle, ArrowDownLeft, ArrowUpRight, CheckCircle2, Circle, FileSpreadsheet, Landmark, PieChart as IconePizza, Printer, Receipt, Users, Wallet,
} from 'lucide-react'
import { CartaoSocio, COR, Dica, Rosca, br, brl, brlCurto, resumir, type VersaoProps } from './shared'

function Painel({ titulo, subtitulo, icone, acao, children, className = '' }: { titulo: string; subtitulo?: string; icone: ReactNode; acao?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-border bg-card p-5 ${className}`}>
      <div className="flex items-start gap-3 mb-5">
        <span className="w-9 h-9 rounded-xl bg-marca-suave text-marca-texto flex items-center justify-center shrink-0">{icone}</span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-foreground">{titulo}</h3>
          {subtitulo && <p className="t-legenda">{subtitulo}</p>}
        </div>
        {acao && <div className="ml-auto shrink-0">{acao}</div>}
      </div>
      {children}
    </section>
  )
}

function Indicador({ icone, fundo, cor, valor, rotulo, selo, seloCls, progresso }: { icone: ReactNode; fundo: string; cor: string; valor: string; rotulo: string; selo?: string; seloCls?: string; progresso: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start">
        <span className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: fundo, color: cor }}>{icone}</span>
        {selo && <span className={`ml-auto rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${seloCls}`}>{selo}</span>}
      </div>
      <p className="text-[26px] font-bold text-foreground tabular-nums mt-4 leading-none">{valor}</p>
      <p className="text-[11.5px] font-semibold tracking-wide uppercase text-muted-foreground mt-2">{rotulo}</p>
      <div className="h-1.5 rounded-full bg-secondary mt-4 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, progresso))}%`, background: cor }} />
      </div>
    </div>
  )
}

function LinhaResumo({ cor, titulo, sub, valor, valorCls = 'text-foreground' }: { cor: string; titulo: string; sub: string; valor: string; valorCls?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-secondary px-4 py-3.5">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cor }} />
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold text-foreground">{titulo}</p>
        <p className="t-legenda">{sub}</p>
      </div>
      <p className={`ml-auto text-[15px] font-bold tabular-nums ${valorCls}`}>{valor}</p>
    </div>
  )
}

/**
 * Versão B (modelo Invenza): faixa de boas-vindas na cor da marca,
 * indicadores com ícone e barra, gráfico de linha com seletor de período e,
 * ao lado, o resumo do mês em linhas.
 */
export default function VersaoB({ d, onSalvo }: VersaoProps) {
  const r = resumir(d)
  const [dias, setDias] = useState<30 | 60 | 90>(90)
  const serie = d.caixa.serie.slice(0, dias + 1).map((p) => ({ dia: p.dia, Saldo: p.saldoCents }))
  const fim = d.caixa.projecoes.find((p) => p.dias === dias)
  const pctRecebido = r.previstaCents > 0 ? Math.round((r.recebidaCents / r.previstaCents) * 100) : 0
  const maxFaixa = Math.max(1, ...d.receber.faixas.map((f) => f.cents))

  return (
    <div className="space-y-5 py-2">
      {/* Faixa de boas-vindas */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#030A8C] via-[#1a24b0] to-[#3a46d6] px-6 py-6 text-white">
        <div className="absolute -right-10 -top-16 w-64 h-64 rounded-full bg-white/5" />
        <div className="absolute right-40 -bottom-20 w-48 h-48 rounded-full bg-white/5" />
        <div className="relative flex flex-wrap items-center gap-5">
          <span className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center"><Landmark className="w-6 h-6" /></span>
          <div className="min-w-0">
            <p className="text-[22px] font-bold leading-tight">Financeiro de {r.mesNome}</p>
            <p className="text-[13.5px] text-white/80 mt-1">
              Hoje há <strong className="text-white">{brl(d.caixa.saldoCents)}</strong> no caixa. Nos próximos 30 dias entram <strong className="text-white">{brl(r.d30?.entradasCents ?? 0)}</strong> e saem <strong className="text-white">{brl(r.d30?.saidasCents ?? 0)}</strong>.
              {r.atrasado > 0 && <> Há <span className="rounded-md bg-white/20 px-1.5 py-0.5 font-semibold">{brl(r.atrasado)} atrasado</span>.</>}
            </p>
          </div>
          <div className="ml-auto flex gap-2">
            <a href="/financeiro?aba=conciliacao" className="h-10 px-4 inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 text-[13px] font-medium hover:bg-white/20"><FileSpreadsheet className="w-4 h-4" /> Conciliação</a>
            <button type="button" onClick={() => window.print()} className="h-10 px-4 inline-flex items-center gap-2 rounded-xl bg-white text-[#030A8C] text-[13px] font-semibold hover:bg-white/90 print:hidden"><Printer className="w-4 h-4" /> Relatório</button>
          </div>
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <Indicador icone={<Wallet className="w-5 h-5" />} fundo="#e8eaf8" cor={COR.marca} valor={brl(d.caixa.saldoCents)} rotulo="Caixa hoje" progresso={100} />
        <Indicador icone={<ArrowDownLeft className="w-5 h-5" />} fundo="#dcfce7" cor={COR.verde} valor={brl(r.recebidaCents)} rotulo={`Recebido em ${r.mesNome}`} selo={`${pctRecebido}% do previsto`} seloCls="bg-success/10 text-success" progresso={pctRecebido} />
        <Indicador icone={<ArrowUpRight className="w-5 h-5" />} fundo="#fee4e2" cor={COR.vermelho} valor={brl(r.d30?.saidasCents ?? 0)} rotulo="Sai em 30 dias" selo={d.pagar.vencidas.length ? `${d.pagar.vencidas.length} vencida(s)` : undefined} seloCls="bg-destructive/10 text-destructive" progresso={(r.d30?.entradasCents ?? 0) > 0 ? ((r.d30?.saidasCents ?? 0) / (r.d30!.entradasCents)) * 100 : 100} />
        <Indicador icone={d.caixa.risco === 'ok' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />} fundo={d.caixa.risco === 'ok' ? '#dcfce7' : '#fef0c7'} cor={d.caixa.risco === 'ok' ? COR.verde : COR.ambar} valor={brl(r.d30?.saldoCents ?? 0)} rotulo={d.caixa.risco === 'falta' ? 'Falta em 30 dias' : 'Sobra em 30 dias'} selo={d.caixa.risco === 'ok' ? 'caixa ok' : d.caixa.risco === 'falta' ? 'vai faltar' : 'apertado'} seloCls={d.caixa.risco === 'ok' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'} progresso={(r.d30?.entradasCents ?? 0) > 0 ? ((r.d30?.saldoCents ?? 0) / (r.d30!.entradasCents)) * 100 : 0} />
      </div>

      {/* Saldo projetado + resumo do mês */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Painel titulo="Saldo projetado" subtitulo="O que sobra no caixa dia a dia" icone={<Landmark className="w-4.5 h-4.5" />} className="xl:col-span-2" acao={
          <div className="flex rounded-xl bg-secondary p-1">
            {([30, 60, 90] as const).map((n) => (
              <button key={n} type="button" onClick={() => setDias(n)} className={`h-8 px-3 rounded-lg text-[12.5px] font-semibold ${dias === n ? 'bg-marca text-white' : 'text-muted-foreground'}`}>{n} dias</button>
            ))}
          </div>
        }>
          <div className="flex items-baseline gap-3 mb-3">
            <p className={`text-[30px] font-bold tabular-nums leading-none ${(fim?.saldoCents ?? 0) < 0 ? 'text-destructive' : 'text-foreground'}`}>{brl(fim?.saldoCents ?? 0)}</p>
            <span className="rounded-full bg-marca-suave text-marca-texto px-2.5 py-0.5 text-[12px] font-semibold">em {fim ? br(fim.ate) : '—'}</span>
          </div>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={serie} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="vbSaldo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COR.marca} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={COR.marca} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#f2f4f7" strokeDasharray="4 4" />
                <XAxis dataKey="dia" tickFormatter={(v: string) => br(v).slice(0, 5)} tick={{ fontSize: 11.5, fill: '#667085' }} axisLine={false} tickLine={false} minTickGap={30} />
                <YAxis tickFormatter={(v: number) => brlCurto(v)} tick={{ fontSize: 11.5, fill: '#667085' }} axisLine={false} tickLine={false} width={70} />
                <Tooltip content={<Dica />} />
                <ReferenceLine y={0} stroke={COR.vermelho} strokeDasharray="4 4" />
                <Area type="monotone" dataKey="Saldo" stroke={COR.marca} strokeWidth={2.5} fill="url(#vbSaldo)" dot={false} activeDot={{ r: 5, fill: COR.marca, stroke: '#fff', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Painel>

        <Painel titulo={`Resumo de ${r.mesNome}`} icone={<Receipt className="w-4.5 h-4.5" />}>
          <div className="space-y-3">
            <LinhaResumo cor={COR.marca} titulo="Receita prevista" sub="parcelas do mês" valor={brl(r.previstaCents)} />
            <LinhaResumo cor={COR.verde} titulo="Recebido" sub={`${pctRecebido}% do previsto`} valor={brl(r.recebidaCents)} />
            <LinhaResumo cor={COR.laranja} titulo="Custos e salários" sub="pagos no mês" valor={brl(r.custosCents)} />
            <LinhaResumo cor={r.operacionalCents < 0 ? COR.vermelho : COR.verde} titulo="Resultado operacional" sub="recebido − custos" valor={brl(r.operacionalCents)} valorCls={r.operacionalCents < 0 ? 'text-destructive' : 'text-success'} />
            <LinhaResumo cor={COR.cinza} titulo="Retiradas dos sócios" sub="pró-labore e divisões" valor={brl(r.retiradasCents)} />
          </div>
        </Painel>
      </div>

      {/* Sócios */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {d.socios.map((s) => (
          <section key={s.id} className="rounded-2xl border border-border bg-card p-5 flex">
            <CartaoSocio s={s} onSalvo={onSalvo} className="flex-1" />
          </section>
        ))}
      </div>

      {/* Pagar, inadimplência e fechamento */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Painel titulo="Contas a pagar" subtitulo={`${brl(r.pagarTodas.reduce((s, p) => s + p.cents, 0))} em 30 dias`} icone={<ArrowUpRight className="w-4.5 h-4.5" />}>
          <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
            {r.pagarTodas.length === 0 && <p className="t-legenda">Nada vence nos próximos 30 dias.</p>}
            {r.pagarTodas.map((p, i) => {
              const vencida = p.vence < d.referencia.hoje
              return (
                <div key={`${p.nome}-${i}`} className="flex items-center gap-3 rounded-xl bg-secondary px-3.5 py-3">
                  <span className={`w-9 h-9 rounded-lg flex items-center justify-center text-[11px] font-bold tabular-nums ${vencida ? 'bg-destructive/10 text-destructive' : 'bg-card text-muted-foreground'}`}>{br(p.vence).slice(0, 5)}</span>
                  <p className="text-[13px] font-medium text-foreground truncate flex-1">{p.nome}</p>
                  <p className={`text-[13.5px] font-bold tabular-nums ${vencida ? 'text-destructive' : 'text-foreground'}`}>{brl(p.cents)}</p>
                </div>
              )
            })}
          </div>
        </Painel>

        <Painel titulo="Inadimplência" subtitulo={`${brl(r.atrasado)} atrasado`} icone={<Users className="w-4.5 h-4.5" />}>
          <div className="space-y-3">
            {d.receber.faixas.map((f) => (
              <div key={f.faixa} className="rounded-xl bg-secondary px-4 py-3">
                <div className="flex items-center">
                  <span className="w-2 h-2 rounded-full mr-2" style={{ background: f.cents ? COR.vermelho : COR.cinza }} />
                  <p className="text-[13px] font-medium text-foreground">{f.faixa}</p>
                  <p className={`ml-auto text-[14px] font-bold tabular-nums ${f.cents ? 'text-destructive' : 'text-muted-foreground'}`}>{brl(f.cents)}</p>
                </div>
                <div className="h-1.5 rounded-full bg-card mt-2.5 overflow-hidden"><div className="h-full rounded-full bg-destructive" style={{ width: `${(f.cents / maxFaixa) * 100}%` }} /></div>
              </div>
            ))}
            {d.receber.atrasadosPorCliente.map((c) => (
              <div key={c.nome} className="flex items-center text-[13px] px-1">
                <span className="text-foreground truncate flex-1">{c.nome} <span className="t-meta">desde {br(c.desde).slice(0, 5)}</span></span>
                <span className="font-semibold text-destructive tabular-nums">{brl(c.cents)}</span>
              </div>
            ))}
          </div>
        </Painel>

        <Painel titulo={`Fechamento de ${r.mes}/${r.ano}`} subtitulo={`${r.okFechamento} de ${d.checklist.length} itens ok`} icone={<CheckCircle2 className="w-4.5 h-4.5" />}>
          <div className="h-2 rounded-full bg-secondary overflow-hidden mb-4"><div className="h-full rounded-full bg-marca" style={{ width: `${(r.okFechamento / d.checklist.length) * 100}%` }} /></div>
          <ul className="space-y-3.5">
            {d.checklist.map((i) => (
              <li key={i.rotulo} className="flex items-start gap-2.5">
                {i.ok ? <CheckCircle2 className="w-4.5 h-4.5 text-success shrink-0 mt-0.5" /> : <Circle className="w-4.5 h-4.5 text-warning shrink-0 mt-0.5" />}
                <div className="min-w-0"><p className="text-[13px] font-semibold text-foreground">{i.rotulo}</p><p className="t-legenda">{i.detalhe}</p></div>
              </li>
            ))}
          </ul>
        </Painel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Painel titulo="Para onde vai o dinheiro" subtitulo="Custos previstos do mês" icone={<IconePizza className="w-4.5 h-4.5" />}><Rosca dados={r.custos} vazio="Nenhum custo no mês." /></Painel>
        <Painel titulo="De onde vem o dinheiro" subtitulo={d.concentracao.alerta ?? 'Receita do mês por cliente'} icone={<IconePizza className="w-4.5 h-4.5" />}><Rosca dados={r.receitas} vazio="Nenhuma receita no mês." /></Painel>
      </div>
    </div>
  )
}
