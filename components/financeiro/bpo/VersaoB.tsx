'use client'

import { useState } from 'react'
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  AlertTriangle, ArrowDownLeft, ArrowUpRight, CheckCircle2, Circle, FileSpreadsheet, Printer, Wallet,
} from 'lucide-react'
import { Button } from '@/components/vex/button'
import { Chip, Numero, Painel, Pilulas, Sobretitulo, TOM, type Tom } from '@/components/vex/vireo'
import { cn } from '@/lib/utils'
import { CartaoSocio, COR, Dica, Rosca, br, brl, brlCurto, resumir, type VersaoProps } from './shared'

/**
 * Indicador no padrão Vireo: chip à esquerda, rótulo e selo à direita, o
 * número grande, a nota (conferência / estimativa) e a barra de progresso.
 */
function Indicador({ icone, tom, cor, valor, rotulo, nota, selo, seloTom = 'neutro', progresso, alerta }: {
  icone: React.ElementType; tom: Tom; cor: string; valor: string; rotulo: string; nota?: string
  selo?: string; seloTom?: Tom; progresso: number; alerta?: boolean
}) {
  return (
    <div className="h-full flex flex-col rounded-[24px] border border-border bg-card p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <Chip icone={icone} tom={tom} tamanho="lg" />
        <div className="min-w-0 flex flex-col items-end gap-1.5 text-right">
          <p className="t-rotulo text-muted-foreground">{rotulo}</p>
          {selo && <span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap', TOM[seloTom])}>{selo}</span>}
        </div>
      </div>
      <Numero alerta={alerta} className="block text-[28px] leading-9 mt-3">{valor}</Numero>
      {nota && <p className="t-legenda mt-1">{nota}</p>}
      <div className="mt-auto pt-4">
        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, progresso))}%`, background: cor }} />
        </div>
      </div>
    </div>
  )
}

function LinhaResumo({ cor, titulo, sub, valor, valorCls = 'text-foreground' }: { cor: string; titulo: string; sub: string; valor: string; valorCls?: string }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cor }} />
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold text-foreground">{titulo}</p>
        <p className="t-legenda">{sub}</p>
      </div>
      <p className={cn('ml-auto font-display text-[16px] font-semibold tabular-nums', valorCls)}>{valor}</p>
    </li>
  )
}

/** Número lateral do cartão de destaque (como "Savings rate · Bills due"). */
function NumeroLateral({ rotulo, valor, alerta }: { rotulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className="min-w-[96px]">
      <p className="t-rotulo text-muted-foreground">{rotulo}</p>
      <Numero alerta={alerta} className="block text-[24px] leading-8 mt-1.5">{valor}</Numero>
    </div>
  )
}

/**
 * BPO financeiro no padrão Vireo: o destaque do topo com o quanto sobra (ou
 * falta) em 30 dias, quatro indicadores, o saldo projetado com o seletor de
 * período e, abaixo, sócios, contas a pagar, inadimplência, fechamento e as
 * roscas de custo e receita.
 */
export default function VersaoB({ d, onSalvo }: VersaoProps) {
  const r = resumir(d)
  const [dias, setDias] = useState<30 | 60 | 90>(90)
  const serie = d.caixa.serie.slice(0, dias + 1).map((p) => ({ dia: p.dia, Saldo: p.saldoCents }))
  const fim = d.caixa.projecoes.find((p) => p.dias === dias)
  const pctRecebido = r.previstaCents > 0 ? Math.round((r.recebidaCents / r.previstaCents) * 100) : 0
  const ate30 = br(new Date(Date.parse(`${d.referencia.hoje}T12:00:00Z`) + 30 * 86400000).toISOString().slice(0, 10)).slice(0, 5)
  const cf = d.caixa.conferido
  const conferencia = !cf
    ? { emDia: false, selo: 'sem extrato', nota: 'Nenhum extrato importado ainda' }
    : cf.emDia
      ? { emDia: true, selo: 'conferido', nota: `${cf.conta} conferido até ${br(cf.ate!).slice(0, 5)}` }
      : { emDia: false, selo: 'a conferir', nota: `${cf.conta} conferido até ${cf.ate ? br(cf.ate).slice(0, 5) : '—'}${cf.pendentes ? ` · ${cf.pendentes} pendente(s)` : ''}` }
  const maxFaixa = Math.max(1, ...d.receber.faixas.map((f) => f.cents))
  const saldo30 = r.d30?.saldoCents ?? 0
  const falta = d.caixa.risco === 'falta'
  const totalPagar = r.pagarTodas.reduce((s, p) => s + p.cents, 0)

  return (
    <div className="space-y-5 py-1">
      {/* Destaque: quanto sobra (ou falta) em 30 dias, com os números ao lado */}
      <section className="relative overflow-hidden rounded-[24px] border border-marca/15 bg-gradient-to-br from-card via-card to-marca-suave p-6 sm:p-7 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <Sobretitulo className="text-marca-texto">Financeiro de {r.mesNome}</Sobretitulo>
            <h2 className="mt-1 font-display text-[26px] sm:text-[30px] font-semibold tracking-[-0.02em] text-foreground">
              {falta ? 'Faltam' : 'Sobram'} <span className={falta ? 'text-destructive-texto' : undefined}>{brl(Math.abs(saldo30))}</span> até {ate30}
            </h2>
            <p className="t-corpo text-muted-foreground mt-1.5 max-w-[620px]">
              Hoje há <strong className="text-foreground">{brl(d.caixa.saldoCents)}</strong> no caixa. Nos próximos 30 dias entram <strong className="text-foreground">{brl(r.d30?.entradasCents ?? 0)}</strong> e saem <strong className="text-foreground">{brl(r.d30?.saidasCents ?? 0)}</strong>.
              {r.atrasado > 0 && <> Há <span className="rounded-md bg-destructive-suave text-destructive-texto px-1.5 py-0.5 font-semibold whitespace-nowrap">{brl(r.atrasado)} atrasado</span>.</>}
            </p>
            <div className="mt-5 flex flex-wrap gap-2 print:hidden">
              <Button variant="outline" asChild>
                <a href="/financeiro?aba=conciliacao"><FileSpreadsheet /> Conciliação</a>
              </Button>
              <Button variant="outline" type="button" onClick={() => window.print()}>
                <Printer /> Relatório
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-10 gap-y-4 lg:pr-4">
            <NumeroLateral rotulo="Recebido do previsto" valor={`${pctRecebido}%`} />
            <NumeroLateral rotulo="Contas vencidas" valor={String(d.pagar.vencidas.length)} alerta={d.pagar.vencidas.length > 0} />
            <NumeroLateral rotulo="Fechamento" valor={`${r.okFechamento}/${d.checklist.length}`} />
          </div>
        </div>
      </section>

      {/* Indicadores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <Indicador
          icone={Wallet} tom="marca" cor={COR.marca} valor={brl(d.caixa.saldoCents)} rotulo="Caixa hoje"
          nota={conferencia.nota} selo={conferencia.selo} seloTom={conferencia.emDia ? 'sucesso' : 'atencao'} progresso={100}
        />
        <Indicador
          icone={ArrowDownLeft} tom="sucesso" cor={COR.verde} valor={brl(r.recebidaCents)} rotulo={`Recebido em ${r.mesNome}`}
          selo={`${pctRecebido}% do previsto`} seloTom="sucesso" progresso={pctRecebido}
        />
        <Indicador
          icone={ArrowUpRight} tom="perigo" cor={COR.vermelho} valor={brl(r.d30?.saidasCents ?? 0)} rotulo={`A pagar até ${ate30}`}
          nota="Só o que ainda falta pagar, incluindo vencidas"
          selo={d.pagar.vencidas.length ? `${d.pagar.vencidas.length} vencida(s)` : undefined} seloTom="perigo"
          progresso={(r.d30?.entradasCents ?? 0) > 0 ? ((r.d30?.saidasCents ?? 0) / (r.d30!.entradasCents)) * 100 : 100}
        />
        <Indicador
          icone={d.caixa.risco === 'ok' ? CheckCircle2 : AlertTriangle} tom={d.caixa.risco === 'ok' ? 'sucesso' : 'atencao'}
          cor={d.caixa.risco === 'ok' ? COR.verde : COR.ambar} valor={brl(saldo30)} alerta={saldo30 < 0}
          rotulo={falta ? `Falta até ${ate30}` : `Sobra até ${ate30}`}
          nota={conferencia.emDia ? 'Projeção a partir do saldo conferido com o banco' : 'Estimativa: o saldo ainda não foi conferido com o banco'}
          selo={d.caixa.risco === 'ok' ? (conferencia.emDia ? 'caixa ok' : 'ok, a conferir') : falta ? 'vai faltar' : 'apertado'}
          seloTom={d.caixa.risco === 'ok' && conferencia.emDia ? 'sucesso' : 'atencao'}
          progresso={(r.d30?.entradasCents ?? 0) > 0 ? (saldo30 / (r.d30!.entradasCents)) * 100 : 0}
        />
      </div>

      {/* Saldo projetado + resumo do mês */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Painel
          rotulo="Fluxo de caixa" titulo="Saldo projetado" sub="O que sobra no caixa dia a dia" className="xl:col-span-2 min-w-0"
          acoes={
            <Pilulas
              rotulo="Período da projeção"
              valor={String(dias) as '30' | '60' | '90'}
              aoMudar={(v) => setDias(Number(v) as 30 | 60 | 90)}
              opcoes={[{ valor: '30', rotulo: '30 dias' }, { valor: '60', rotulo: '60 dias' }, { valor: '90', rotulo: '90 dias' }]}
            />
          }
        >
          <div className="flex flex-wrap items-baseline gap-3 mb-4">
            <Numero alerta={(fim?.saldoCents ?? 0) < 0} className="text-[30px] leading-none">{brl(fim?.saldoCents ?? 0)}</Numero>
            <span className="rounded-full bg-marca-suave text-marca-texto px-2.5 py-0.5 text-[12px] font-semibold">em {fim ? br(fim.ate) : '—'}</span>
            <span className="ml-auto flex items-center gap-4 t-legenda">
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: COR.marca }} /> Saldo</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-3 border-t-2 border-dashed" style={{ borderColor: COR.vermelho }} /> Zero</span>
            </span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={serie} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="vbSaldo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COR.marca} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={COR.marca} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
                <XAxis dataKey="dia" tickFormatter={(v: string) => br(v).slice(0, 5)} tick={{ fontSize: 11.5, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} minTickGap={30} />
                <YAxis tickFormatter={(v: number) => brlCurto(v)} tick={{ fontSize: 11.5, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={70} />
                <Tooltip content={<Dica />} />
                <ReferenceLine y={0} stroke={COR.vermelho} strokeDasharray="4 4" />
                <Area type="monotone" dataKey="Saldo" stroke={COR.marca} strokeWidth={2.5} fill="url(#vbSaldo)" dot={false} activeDot={{ r: 5, fill: COR.marca, stroke: 'var(--card)', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Painel>

        <Painel rotulo="Competência" titulo={`Resumo de ${r.mesNome}`} sub="Previsto, recebido e o que sobrou">
          <ul className="divide-y divide-border -my-3">
            <LinhaResumo cor={COR.marca} titulo="Receita prevista" sub="parcelas do mês" valor={brl(r.previstaCents)} />
            <LinhaResumo cor={COR.verde} titulo="Recebido" sub={`${pctRecebido}% do previsto`} valor={brl(r.recebidaCents)} />
            <LinhaResumo cor={COR.laranja} titulo="Custos e salários" sub="pagos no mês" valor={brl(r.custosCents)} />
            <LinhaResumo cor={r.operacionalCents < 0 ? COR.vermelho : COR.verde} titulo="Resultado operacional" sub="recebido − custos" valor={brl(r.operacionalCents)} valorCls={r.operacionalCents < 0 ? 'text-destructive-texto' : 'text-success'} />
            <LinhaResumo cor={COR.cinza} titulo="Retiradas dos sócios" sub="pró-labore e divisões" valor={brl(r.retiradasCents)} />
          </ul>
        </Painel>
      </div>

      {/* Sócios */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {d.socios.map((s) => (
          <Painel key={s.id} className="flex">
            <CartaoSocio s={s} onSalvo={onSalvo} className="flex-1" />
          </Painel>
        ))}
      </div>

      {/* Pagar, inadimplência e fechamento */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Painel rotulo="Saídas" titulo="Contas a pagar" sub={`${brl(totalPagar)} em 30 dias`}>
          <ul className="max-h-80 overflow-y-auto pr-1 -my-2 divide-y divide-border">
            {r.pagarTodas.length === 0 && <li className="t-legenda py-2">Nada vence nos próximos 30 dias.</li>}
            {r.pagarTodas.map((p, i) => {
              const vencida = p.vence < d.referencia.hoje
              return (
                <li key={`${p.nome}-${i}`} className="flex items-center gap-3 py-2.5">
                  <span className={cn('w-11 h-9 rounded-xl flex items-center justify-center text-[11.5px] font-semibold tabular-nums shrink-0', vencida ? TOM.perigo : TOM.neutro)}>{br(p.vence).slice(0, 5)}</span>
                  <p className="text-[13px] font-medium text-foreground truncate flex-1">{p.nome}</p>
                  <p className={cn('font-display text-[14px] font-semibold tabular-nums', vencida ? 'text-destructive-texto' : 'text-foreground')}>{brl(p.cents)}</p>
                </li>
              )
            })}
          </ul>
        </Painel>

        <Painel rotulo="Recebíveis" titulo="Inadimplência" sub={`${brl(r.atrasado)} atrasado`}>
          <div className="space-y-3">
            {d.receber.faixas.map((f) => (
              <div key={f.faixa} className="rounded-2xl bg-secondary/60 px-4 py-3">
                <div className="flex items-center">
                  <span className="w-2 h-2 rounded-full mr-2" style={{ background: f.cents ? COR.vermelho : COR.cinza }} />
                  <p className="text-[13px] font-medium text-foreground">{f.faixa}</p>
                  <p className={cn('ml-auto font-display text-[14px] font-semibold tabular-nums', f.cents ? 'text-destructive-texto' : 'text-muted-foreground')}>{brl(f.cents)}</p>
                </div>
                <div className="h-1.5 rounded-full bg-card mt-2.5 overflow-hidden"><div className="h-full rounded-full bg-destructive" style={{ width: `${(f.cents / maxFaixa) * 100}%` }} /></div>
              </div>
            ))}
            {d.receber.atrasadosPorCliente.length > 0 && (
              <ul className="divide-y divide-border pt-1">
                {d.receber.atrasadosPorCliente.map((c) => (
                  <li key={c.nome} className="flex items-center text-[13px] py-2 px-1">
                    <span className="text-foreground truncate flex-1">{c.nome} <span className="t-meta">desde {br(c.desde).slice(0, 5)}</span></span>
                    <span className="font-semibold text-destructive-texto tabular-nums">{brl(c.cents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Painel>

        <Painel rotulo="Checklist" titulo={`Fechamento de ${r.mes}/${r.ano}`} sub={`${r.okFechamento} de ${d.checklist.length} itens ok`}>
          <div className="h-2 rounded-full bg-secondary overflow-hidden mb-5"><div className="h-full rounded-full bg-marca" style={{ width: `${(r.okFechamento / Math.max(1, d.checklist.length)) * 100}%` }} /></div>
          <ul className="space-y-3.5">
            {d.checklist.map((i) => (
              <li key={i.rotulo} className="flex items-start gap-2.5">
                {i.ok ? <CheckCircle2 className="w-[18px] h-[18px] text-success shrink-0 mt-0.5" /> : <Circle className="w-[18px] h-[18px] text-warning shrink-0 mt-0.5" />}
                <div className="min-w-0"><p className="text-[13px] font-semibold text-foreground">{i.rotulo}</p><p className="t-legenda">{i.detalhe}</p></div>
              </li>
            ))}
          </ul>
        </Painel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Painel rotulo="Custos" titulo="Para onde vai o dinheiro" sub="Custos previstos do mês"><Rosca dados={r.custos} vazio="Nenhum custo no mês." /></Painel>
        <Painel rotulo="Receitas" titulo="De onde vem o dinheiro" sub={d.concentracao.alerta ?? 'Receita do mês por cliente'}><Rosca dados={r.receitas} vazio="Nenhuma receita no mês." /></Painel>
      </div>
    </div>
  )
}
