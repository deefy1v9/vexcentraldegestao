'use client'

import { useState } from 'react'
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { Plus } from 'lucide-react'
import type {
  ContaSocio, FaixaAtraso, ItemChecklist, LinhaDre, MovSocio, PontoSaldo, Previsto, Projecao, ReceitaCliente, Risco,
} from '@/lib/bpo-core'

/* ------------------------------- dados ------------------------------- */

export interface Socio {
  id: string; socio: string; tipo: string
  retiradasCents: number; aportesCents: number; liquidoCents: number; movimentos: MovSocio[]; conta: ContaSocio
}
export interface ClienteNovo { id: string; nome: string; origem: string | null; desde: string; previstoCents: number; recebidoCents: number }

export interface BpoData {
  referencia: { hoje: string; competencia: string }
  caixa: { saldoCents: number; risco: Risco; projecoes: Projecao[]; atrasadosReceberCents: number; serie: PontoSaldo[] }
  pagar: { vencidas: Previsto[]; proximos7: Previsto[]; ate30: Previsto[] }
  receber: {
    proximos7: Previsto[]
    faixas: FaixaAtraso[]
    atrasadosPorCliente: Array<{ nome: string; cents: number; desde: string; qtd: number }>
  }
  socios: Socio[]
  investidor: { desde: string; clientes: ClienteNovo[] } | null
  dre: LinhaDre[]
  custosPorCategoria: Array<{ category: string; previstoCents: number; pagoCents: number }>
  concentracao: { clientes: ReceitaCliente[]; totalCents: number; top1: number; top3: number; alerta: string | null }
  pendencias: { semCategoria: Array<{ id: string; dia: string; kind: string; cents: number; descricao: string }>; semConta: number }
  checklist: ItemChecklist[]
}

/** O que as duas versões da tela recebem. */
export interface VersaoProps {
  d: BpoData
  onSalvo: () => void
}

/* ------------------------------ formatação ------------------------------ */

/* Paleta dos gráficos: as cores dos tokens da Central (marca, sucesso, perigo e séries) */
export const COR = { marca: '#030A8C', marcaClara: '#5b63c7', verde: '#15803d', vermelho: '#d92d20', laranja: '#e8500f', cinza: '#98a2b3', grafite: '#1d2939', areia: '#f2994a', ambar: '#b54708' }
export const PIZZA = [COR.marca, COR.laranja, COR.grafite, COR.areia, COR.marcaClara, COR.cinza, '#c4c9d4']

export const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const brlCurto = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 })
export const br = (d: string) => d.split('-').reverse().join('/')
export const soma = (l: Previsto[]) => l.reduce((s, p) => s + p.cents, 0)
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** Os números que as duas versões mostram, calculados uma vez só. */
export function resumir(d: BpoData) {
  const [ano, mes] = d.referencia.competencia.split('-')
  const linha = (rotulo: string) => d.dre.find((l) => l.rotulo.includes(rotulo))
  const custosTodos = d.custosPorCategoria.filter((c) => c.previstoCents > 0).sort((a, b) => b.previstoCents - a.previstoCents)
  const custosOutros = custosTodos.slice(6).reduce((s, c) => s + c.previstoCents, 0)
  const outrosClientes = d.concentracao.clientes.slice(6).reduce((s, c) => s + c.cents, 0)
  return {
    ano, mes, mesNome: MESES[Number(mes) - 1],
    d30: d.caixa.projecoes.find((p) => p.dias === 30),
    okFechamento: d.checklist.filter((i) => i.ok).length,
    pagarTodas: [...d.pagar.vencidas, ...d.pagar.proximos7, ...d.pagar.ate30],
    atrasado: d.receber.faixas.reduce((s, f) => s + f.cents, 0),
    linha,
    previstaCents: linha('prevista')?.atualCents ?? 0,
    recebidaCents: linha('recebida')?.atualCents ?? 0,
    custosCents: (linha('Custos')?.atualCents ?? 0) + (linha('Salários')?.atualCents ?? 0),
    retiradasCents: linha('Retiradas')?.atualCents ?? 0,
    operacionalCents: linha('operacional')?.atualCents ?? 0,
    custos: [...custosTodos.slice(0, 6).map((c) => ({ nome: c.category, valor: c.previstoCents })), ...(custosOutros > 0 ? [{ nome: 'Outros', valor: custosOutros }] : [])],
    receitas: [...d.concentracao.clientes.slice(0, 6).map((c) => ({ nome: c.nome, valor: c.cents })), ...(outrosClientes > 0 ? [{ nome: 'Outros', valor: outrosClientes }] : [])],
  }
}

/* ------------------------------ componentes ------------------------------ */

export function Dica({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md text-[12px]">
      {label && <p className="t-meta mb-1">{/^\d{4}-\d{2}-\d{2}$/.test(label) ? br(label) : label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 tabular-nums">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto font-semibold text-foreground">{brl(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

/** Linha de tendência pequena, sem eixos, ao lado de um número. */
export function Tendencia({ valores, cor, id }: { valores: number[]; cor: string; id: string }) {
  const dados = valores.map((v, i) => ({ i, v }))
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={dados} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={cor} stopOpacity={0.3} />
            <stop offset="100%" stopColor={cor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={cor} strokeWidth={2} fill={`url(#${id})`} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/** Rosca com a legenda ao lado: valor e participação de cada fatia. */
export function Rosca({ dados, vazio, tamanho = 144 }: { dados: Array<{ nome: string; valor: number }>; vazio: string; tamanho?: number }) {
  const total = dados.reduce((s, x) => s + x.valor, 0)
  if (total <= 0) return <p className="t-legenda py-10 text-center">{vazio}</p>
  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: tamanho, height: tamanho }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={dados} dataKey="valor" nameKey="nome" innerRadius={tamanho * 0.32} outerRadius={tamanho * 0.48} paddingAngle={1} stroke="none">
              {dados.map((_, i) => <Cell key={i} fill={PIZZA[i % PIZZA.length]} />)}
            </Pie>
            <Tooltip content={<Dica />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="t-meta">total</span>
          <span className="text-[13px] font-semibold text-foreground tabular-nums">{brlCurto(total)}</span>
        </div>
      </div>
      <ul className="flex-1 min-w-0 space-y-2">
        {dados.map((x, i) => (
          <li key={x.nome} className="flex items-center gap-2 text-[12.5px]">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIZZA[i % PIZZA.length] }} />
            <span className="truncate flex-1 text-muted-foreground">{x.nome}</span>
            <span className="tabular-nums font-semibold text-foreground">{brlCurto(x.valor)}</span>
            <span className="tabular-nums t-meta w-8 text-right">{Math.round((x.valor / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const SITUACAO = {
  deve: { rotulo: 'Deve à empresa', cls: 'bg-destructive/10 text-destructive', frase: 'Precisa pagar este valor à empresa.' },
  receber: { rotulo: 'A receber', cls: 'bg-success/10 text-success', frase: 'A empresa precisa devolver este valor.' },
  zerado: { rotulo: 'Em dia', cls: 'bg-secondary text-muted-foreground', frase: 'Nada a pagar nem a receber.' },
} as const

/** Um sócio: saldo com a empresa, o mês dele e o histórico, tudo à vista. */
export function CartaoSocio({ s, onSalvo, className = '' }: {
  s: Socio
  onSalvo: () => void
  className?: string
}) {
  const sit = SITUACAO[s.conta.situacao]
  const [form, setForm] = useState(false)
  const [tipo, setTipo] = useState<'CREDITO' | 'DEBITO'>('CREDITO')
  const [valor, setValor] = useState('')
  const [descricao, setDescricao] = useState('')
  const [erro, setErro] = useState('')

  async function salvar() {
    setErro('')
    const r = await fetch('/api/financeiro/socios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ partnerId: s.id, tipo, valor, descricao }) })
    const b = await r.json().catch(() => ({}))
    if (!r.ok) { setErro(b.error || 'Falhou.'); return }
    setForm(false); setValor(''); setDescricao(''); onSalvo()
  }

  const investidorSocio = s.tipo === 'INVESTIDOR'
  return (
    <div className={`min-w-0 flex flex-col gap-4 ${className}`}>
      <div className="flex items-center gap-3">
        <span className={`w-11 h-11 rounded-full flex items-center justify-center text-[15px] font-semibold text-white ${investidorSocio ? 'bg-[#6d28d9]' : 'bg-marca'}`}>{s.socio.slice(0, 1)}</span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-foreground truncate">{s.socio}</p>
          <p className="t-legenda">{investidorSocio ? 'Sócio investidor' : 'Sócio operacional'}</p>
        </div>
        <span className={`ml-auto t-meta rounded-full px-2.5 py-1 ${sit.cls}`}>{sit.rotulo}</span>
      </div>

      <div>
        <p className={`text-[30px] leading-none font-bold tabular-nums ${s.conta.situacao === 'deve' ? 'text-destructive' : s.conta.situacao === 'receber' ? 'text-success' : 'text-foreground'}`}>
          {s.conta.situacao === 'zerado' ? 'R$ 0,00' : brl(Math.abs(s.conta.saldoCents))}
        </p>
        <p className="t-legenda mt-1.5">{sit.frase}</p>
      </div>

      {investidorSocio ? (
        <div className="rounded-xl bg-secondary px-3.5 py-3 t-corpo text-muted-foreground">
          Entra nos clientes novos que vierem de anúncio, a partir do investimento dele. <strong className="text-foreground">Ainda não participa dos clientes atuais.</strong>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-secondary px-3.5 py-3">
          <div><p className="t-meta">Retirou</p><p className="text-[13px] font-semibold text-foreground tabular-nums mt-0.5">{brl(s.retiradasCents)}</p></div>
          <div><p className="t-meta">Pôs no caixa</p><p className="text-[13px] font-semibold text-foreground tabular-nums mt-0.5">{brl(s.aportesCents)}</p></div>
          <div><p className="t-meta">Líquido</p><p className="text-[13px] font-semibold text-marca-texto tabular-nums mt-0.5">{brl(s.liquidoCents)}</p></div>
        </div>
      )}

      <div>
        <p className="t-rotulo text-foreground mb-2">Conta com a empresa</p>
        {s.conta.lancamentos.length === 0 ? <p className="t-legenda">Nenhum lançamento.</p> : (
          <ul className="max-h-40 overflow-y-auto pr-1 space-y-2">
            {s.conta.lancamentos.map((l, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px] leading-snug">
                <span className="t-meta tabular-nums w-9 shrink-0">{br(l.dia).slice(0, 5)}</span>
                <span className="text-muted-foreground flex-1">{l.description}</span>
                <span className={`tabular-nums shrink-0 font-semibold ${l.amountCents < 0 ? 'text-destructive' : 'text-success'}`}>{l.amountCents < 0 ? '−' : '+'}{brl(Math.abs(l.amountCents))}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-auto">
        {form ? (
          <div className="rounded-xl border border-border p-3 space-y-2">
            <div className="grid grid-cols-2 gap-1.5">
              {(['CREDITO', 'DEBITO'] as const).map((t) => (
                <button key={t} type="button" onClick={() => setTipo(t)} className={`h-8 rounded-lg text-[12px] font-medium border ${tipo === t ? 'border-marca bg-marca-suave text-marca-texto' : 'border-border text-muted-foreground'}`}>
                  {t === 'CREDITO' ? 'Pagou / pôs (+)' : 'Ficou devendo (−)'}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Valor" className="h-9 w-24 rounded-lg border border-border bg-card px-2 text-[12px]" />
              <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Do que se trata" className="h-9 flex-1 min-w-0 rounded-lg border border-border bg-card px-2 text-[12px]" />
            </div>
            {erro && <p className="text-[12px] text-destructive">{erro}</p>}
            <div className="flex justify-end gap-1.5">
              <button type="button" onClick={() => setForm(false)} className="h-8 px-3 rounded-lg text-[12px] text-muted-foreground hover:bg-secondary">Cancelar</button>
              <button type="button" onClick={salvar} className="h-8 px-3 rounded-lg bg-marca text-white text-[12px] font-medium">Salvar acerto</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setForm(true)} className="w-full h-10 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border text-[13px] font-medium text-foreground hover:border-marca hover:text-marca-texto">
            <Plus className="w-4 h-4" /> Registrar acerto
          </button>
        )}
      </div>
    </div>
  )
}
