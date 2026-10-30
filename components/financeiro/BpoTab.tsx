'use client'

import { useEffect, useState, type ReactNode } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CheckCircle2, Circle, Plus, Printer, ShieldCheck, Wallet } from 'lucide-react'
import type {
  ContaSocio, FaixaAtraso, ItemChecklist, LinhaDre, MovSocio, PontoSaldo, Previsto, Projecao, ReceitaCliente, Risco,
} from '@/lib/bpo-core'

interface Socio {
  id: string; socio: string; tipo: string
  retiradasCents: number; aportesCents: number; liquidoCents: number; movimentos: MovSocio[]; conta: ContaSocio
}
interface ClienteNovo { id: string; nome: string; origem: string | null; desde: string; previstoCents: number; recebidoCents: number }

interface BpoData {
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

/* Paleta dos gráficos: as mesmas cores dos tokens da Central (marca, sucesso, perigo e séries) */
const COR = { marca: '#030A8C', verde: '#15803d', vermelho: '#d92d20', laranja: '#e8500f', cinza: '#98a2b3', grafite: '#1d2939', areia: '#f2994a' }
const PIZZA = [COR.marca, COR.laranja, COR.grafite, COR.areia, '#5b63c7', COR.cinza, '#c4c9d4']

const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const brlCurto = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 })
const br = (d: string) => d.split('-').reverse().join('/')
const soma = (l: Previsto[]) => l.reduce((s, p) => s + p.cents, 0)
const ORIGEM: Record<string, string> = { ANUNCIO: 'Anúncio', INDICACAO: 'Indicação', SOCIO: 'Dos sócios', OUTRO: 'Outro' }

function Cartao({ titulo, subtitulo, acao, children, className = '' }: { titulo: string; subtitulo?: string; acao?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-xl border border-border bg-card p-5 break-inside-avoid ${className}`}>
      <div className="flex items-start gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="t-secao text-foreground">{titulo}</h3>
          {subtitulo && <p className="t-legenda mt-0.5">{subtitulo}</p>}
        </div>
        {acao && <div className="ml-auto shrink-0">{acao}</div>}
      </div>
      {children}
    </section>
  )
}

function Metrica({ rotulo, valor, detalhe, icone, tom = 'neutro' }: { rotulo: string; valor: string; detalhe: string; icone: ReactNode; tom?: 'neutro' | 'marca' | 'ok' | 'alerta' | 'perigo' }) {
  const fundo = tom === 'marca' ? 'bg-marca text-white border-transparent' : 'bg-card border-border'
  const corValor = tom === 'ok' ? 'text-success' : tom === 'perigo' ? 'text-destructive' : tom === 'alerta' ? 'text-warning' : tom === 'marca' ? 'text-white' : 'text-foreground'
  return (
    <div className={`rounded-xl border p-5 flex flex-col gap-3 ${fundo}`}>
      <div className="flex items-center gap-2">
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${tom === 'marca' ? 'bg-white/15' : 'bg-secondary'}`}>{icone}</span>
        <p className={`t-rotulo ${tom === 'marca' ? 'text-white/80' : 'text-muted-foreground'}`}>{rotulo}</p>
      </div>
      <p className={`text-[26px] leading-none font-semibold tabular-nums ${corValor}`}>{valor}</p>
      <p className={`t-legenda ${tom === 'marca' ? '!text-white/70' : ''}`}>{detalhe}</p>
    </div>
  )
}

function Dica({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm text-[12px]">
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

function Linhas({ itens, vazio, cor }: { itens: Previsto[]; vazio: string; cor?: string }) {
  if (itens.length === 0) return <p className="t-legenda py-2">{vazio}</p>
  return (
    <ul className="divide-y divide-border">
      {itens.map((p, i) => (
        <li key={`${p.nome}-${p.vence}-${i}`} className="flex items-center gap-3 py-2 t-corpo">
          <span className="t-meta tabular-nums w-10 shrink-0">{br(p.vence).slice(0, 5)}</span>
          <span className="text-foreground truncate flex-1">{p.nome}</span>
          <span className={`font-medium tabular-nums shrink-0 ${cor ?? 'text-foreground'}`}>{brl(p.cents)}</span>
        </li>
      ))}
    </ul>
  )
}

const SITUACAO = {
  deve: { rotulo: 'Deve à empresa', cls: 'bg-destructive/10 text-destructive', frase: 'Precisa pagar este valor à empresa.' },
  receber: { rotulo: 'A receber da empresa', cls: 'bg-success/10 text-success', frase: 'A empresa precisa devolver este valor.' },
  zerado: { rotulo: 'Em dia com a empresa', cls: 'bg-secondary text-muted-foreground', frase: 'Nada a pagar nem a receber.' },
} as const

/** Um sócio: saldo com a empresa, o mês dele e o histórico, tudo à vista. */
function CartaoSocio({ s, mesAno, investidor, anuncio, onOrigem, onSalvo }: {
  s: Socio
  mesAno: string
  investidor: { desde: string; clientes: ClienteNovo[] } | null
  anuncio: ClienteNovo[]
  onOrigem: (clientId: string, origem: string) => void
  onSalvo: () => void
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
    <div className="min-w-0 rounded-xl border border-border bg-card p-5 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white ${investidorSocio ? 'bg-[#6d28d9]' : 'bg-marca'}`}>{s.socio.slice(0, 1)}</span>
        <div className="min-w-0">
          <p className="t-secao text-foreground truncate">{s.socio}</p>
          <p className="t-legenda">{investidorSocio ? 'Sócio investidor' : 'Sócio operacional'}</p>
        </div>
        <span className={`ml-auto t-meta rounded-full px-2.5 py-1 ${sit.cls}`}>{sit.rotulo}</span>
      </div>

      <div>
        <p className={`text-[28px] leading-none font-semibold tabular-nums ${s.conta.situacao === 'deve' ? 'text-destructive' : s.conta.situacao === 'receber' ? 'text-success' : 'text-foreground'}`}>
          {s.conta.situacao === 'zerado' ? 'R$ 0,00' : brl(Math.abs(s.conta.saldoCents))}
        </p>
        <p className="t-legenda mt-1">{sit.frase}</p>
      </div>

      {investidorSocio ? (
        <div className="rounded-lg bg-secondary px-3 py-2.5 t-corpo text-muted-foreground">
          Recebe dos clientes novos que vierem de anúncio. Em {mesAno}: <strong className="text-foreground">{anuncio.length} cliente(s)</strong>, {brl(anuncio.reduce((t, c) => t + c.previstoCents, 0))} de receita · percentual a definir.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-secondary px-3 py-2.5">
          <div><p className="t-meta">Retirou no mês</p><p className="t-rotulo text-foreground tabular-nums mt-0.5">{brl(s.retiradasCents)}</p></div>
          <div><p className="t-meta">Pôs no caixa</p><p className="t-rotulo text-foreground tabular-nums mt-0.5">{brl(s.aportesCents)}</p></div>
          <div><p className="t-meta">Líquido</p><p className="t-rotulo text-marca-texto tabular-nums mt-0.5">{brl(s.liquidoCents)}</p></div>
        </div>
      )}

      <div className="min-h-0">
        <p className="t-rotulo text-foreground mb-1.5">Conta com a empresa</p>
        {s.conta.lancamentos.length === 0 ? <p className="t-legenda">Nenhum lançamento.</p> : (
          <ul className="max-h-36 overflow-y-auto pr-1 space-y-1.5">
            {s.conta.lancamentos.map((l, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px] leading-snug">
                <span className="t-meta tabular-nums w-9 shrink-0">{br(l.dia).slice(0, 5)}</span>
                <span className="text-muted-foreground flex-1">{l.description}</span>
                <span className={`tabular-nums shrink-0 font-medium ${l.amountCents < 0 ? 'text-destructive' : 'text-success'}`}>{l.amountCents < 0 ? '−' : '+'}{brl(Math.abs(l.amountCents))}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {investidor && (
        <div>
          <p className="t-rotulo text-foreground mb-1.5">Clientes novos desde {br(investidor.desde)}</p>
          {investidor.clientes.length === 0 ? <p className="t-legenda">Nenhum.</p> : (
            <ul className="max-h-32 overflow-y-auto pr-1 space-y-1.5">
              {investidor.clientes.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-[12px]">
                  <span className="truncate flex-1 text-foreground">{c.nome} <span className="text-muted-foreground">· {brl(c.previstoCents)}</span></span>
                  <select value={c.origem ?? ''} onChange={(e) => onOrigem(c.id, e.target.value)} className="h-7 rounded-md border border-border bg-card px-1.5 text-[12px]">
                    <option value="">Origem?</option>
                    {Object.entries(ORIGEM).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-auto">
        {form ? (
          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="grid grid-cols-2 gap-1.5">
              {(['CREDITO', 'DEBITO'] as const).map((t) => (
                <button key={t} type="button" onClick={() => setTipo(t)} className={`h-8 rounded-md text-[12px] font-medium border ${tipo === t ? 'border-marca bg-marca-suave text-marca-texto' : 'border-border text-muted-foreground'}`}>
                  {t === 'CREDITO' ? 'Pagou / pôs (+)' : 'Ficou devendo (−)'}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Valor" className="h-8 w-24 rounded-md border border-border bg-card px-2 text-[12px]" />
              <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Do que se trata" className="h-8 flex-1 min-w-0 rounded-md border border-border bg-card px-2 text-[12px]" />
            </div>
            {erro && <p className="text-[12px] text-destructive">{erro}</p>}
            <div className="flex justify-end gap-1.5">
              <button type="button" onClick={() => setForm(false)} className="h-8 px-3 rounded-md text-[12px] text-muted-foreground hover:bg-secondary">Cancelar</button>
              <button type="button" onClick={salvar} className="h-8 px-3 rounded-md bg-marca text-white text-[12px] font-medium">Salvar acerto</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setForm(true)} className="w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border text-[12.5px] font-medium text-foreground hover:border-marca hover:text-marca-texto">
            <Plus className="w-3.5 h-3.5" /> Registrar acerto
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * BPO financeiro: os números que respondem "tem dinheiro?", o saldo dia a
 * dia em gráfico, o fechamento do mês, os sócios com o saldo de cada um com a
 * empresa e, embaixo, para onde vai e de onde vem o dinheiro. Tudo à vista,
 * sem nada para abrir.
 */
export default function BpoTab({ competencia }: { competencia: string }) {
  // A resposta guarda a competência: trocar de mês mostra o carregando até chegar a nova
  const [res, setRes] = useState<{ competencia: string; dados?: BpoData; erro?: string } | null>(null)
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    let vivo = true
    fetch(`/api/financeiro/bpo?mes=${competencia}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('falhou'))))
      .then((dados: BpoData) => { if (vivo) setRes({ competencia, dados }) })
      .catch(() => { if (vivo) setRes({ competencia, erro: 'Não consegui montar o BPO financeiro.' }) })
    return () => { vivo = false }
  }, [competencia, versao])

  const atual = res?.competencia === competencia ? res : null
  const d = atual?.dados ?? null
  const erro = atual?.erro ?? ''

  async function marcarOrigem(clientId: string, origem: string) {
    await fetch('/api/financeiro/bpo', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, origem: origem || null }) })
    setVersao((v) => v + 1)
  }

  if (erro) return <p className="t-corpo font-medium text-destructive bg-destructive/10 rounded-lg px-4 py-3 text-center">{erro}</p>
  if (!d) {
    return (
      <div className="space-y-4 animate-pulse py-2">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="h-32 rounded-xl border border-border bg-card" />)}</div>
        <div className="h-72 rounded-xl border border-border bg-card" />
      </div>
    )
  }

  const [ano, mes] = d.referencia.competencia.split('-')
  const d30 = d.caixa.projecoes.find((p) => p.dias === 30)
  const okFechamento = d.checklist.filter((i) => i.ok).length
  const anuncio = d.investidor?.clientes.filter((c) => c.origem === 'ANUNCIO') ?? []
  const pagarTodas = [...d.pagar.vencidas, ...d.pagar.proximos7, ...d.pagar.ate30]
  const atrasado = d.receber.faixas.reduce((s, f) => s + f.cents, 0)

  const serie = d.caixa.serie.map((p) => ({ dia: p.dia, Saldo: p.saldoCents, 'Se os atrasados entrarem': p.comAtrasadosCents }))
  // Rosca legível: as seis maiores fatias e o resto junto em "Outros"
  const custosTodos = d.custosPorCategoria.filter((c) => c.previstoCents > 0).sort((a, b) => b.previstoCents - a.previstoCents)
  const custosOutros = custosTodos.slice(6).reduce((s, c) => s + c.previstoCents, 0)
  const custos = [...custosTodos.slice(0, 6).map((c) => ({ nome: c.category, valor: c.previstoCents })), ...(custosOutros > 0 ? [{ nome: 'Outros', valor: custosOutros }] : [])]
  const topClientes = d.concentracao.clientes.slice(0, 6)
  const outros = d.concentracao.clientes.slice(6).reduce((s, c) => s + c.cents, 0)
  const receitas = [...topClientes.map((c) => ({ nome: c.nome, valor: c.cents })), ...(outros > 0 ? [{ nome: 'Outros', valor: outros }] : [])]
  const linha = (rotulo: string) => d.dre.find((l) => l.rotulo.includes(rotulo))
  const comparativo = [
    { mes: 'Mês anterior', Recebido: linha('recebida')?.anteriorCents ?? 0, Custos: (linha('Custos')?.anteriorCents ?? 0) + (linha('Salários')?.anteriorCents ?? 0), Retiradas: linha('Retiradas')?.anteriorCents ?? 0 },
    { mes: `${mes}/${ano}`, Recebido: linha('recebida')?.atualCents ?? 0, Custos: (linha('Custos')?.atualCents ?? 0) + (linha('Salários')?.atualCents ?? 0), Retiradas: linha('Retiradas')?.atualCents ?? 0 },
  ]
  const resultado = linha('operacional')

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center gap-2">
        <p className="t-legenda">Dados da Central em {br(d.referencia.hoje)} · competência {mes}/{ano} · visão gerencial, não substitui a contabilidade</p>
        <button type="button" onClick={() => window.print()} className="ml-auto h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card t-rotulo text-foreground hover:border-marca print:hidden">
          <Printer className="w-3.5 h-3.5" /> Relatório
        </button>
      </div>

      {/* Tem dinheiro? */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Metrica rotulo="Caixa hoje" valor={brl(d.caixa.saldoCents)} detalhe="saldo lançado na Central" icone={<Wallet className="w-4 h-4 text-white" />} tom="marca" />
        <Metrica rotulo="Entra em 30 dias" valor={brl(d30?.entradasCents ?? 0)} detalhe={d.caixa.atrasadosReceberCents ? `+ ${brl(d.caixa.atrasadosReceberCents)} atrasado` : 'parcelas no prazo'} icone={<ArrowDownLeft className="w-4 h-4 text-success" />} tom="ok" />
        <Metrica rotulo="Sai em 30 dias" valor={brl(d30?.saidasCents ?? 0)} detalhe="custos e salários em aberto" icone={<ArrowUpRight className="w-4 h-4 text-destructive" />} tom="perigo" />
        <Metrica
          rotulo={d.caixa.risco === 'ok' ? 'Sobra em 30 dias' : d.caixa.risco === 'falta' ? 'Falta em 30 dias' : 'Sobra apertada'}
          valor={brl(d30?.saldoCents ?? 0)}
          detalhe={d.caixa.risco === 'ok' ? 'o caixa cobre as contas' : d.caixa.risco === 'falta' ? 'o saldo projetado fica negativo' : 'sobra menos de 10% do que sai'}
          icone={d.caixa.risco === 'ok' ? <ShieldCheck className="w-4 h-4 text-success" /> : <AlertTriangle className="w-4 h-4 text-warning" />}
          tom={d.caixa.risco === 'ok' ? 'ok' : d.caixa.risco === 'falta' ? 'perigo' : 'alerta'}
        />
      </div>

      {/* Saldo dia a dia + fechamento */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Cartao titulo="Fluxo de caixa · próximos 90 dias" subtitulo="Saldo de hoje + o que entra − o que sai, dia a dia" className="xl:col-span-2"
          acao={<div className="flex gap-4 t-meta">{d.caixa.projecoes.map((p) => <span key={p.dias}>{p.dias}d <strong className={p.saldoCents < 0 ? 'text-destructive' : 'text-foreground'}>{brlCurto(p.saldoCents)}</strong></span>)}</div>}>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={serie} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="bpoSaldo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COR.marca} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={COR.marca} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#eaecf0" />
                <XAxis dataKey="dia" tickFormatter={(v: string) => br(v).slice(0, 5)} tick={{ fontSize: 11, fill: '#667085' }} axisLine={false} tickLine={false} minTickGap={28} />
                <YAxis tickFormatter={(v: number) => brlCurto(v)} tick={{ fontSize: 11, fill: '#667085' }} axisLine={false} tickLine={false} width={72} />
                <Tooltip content={<Dica />} />
                <ReferenceLine y={0} stroke={COR.vermelho} strokeDasharray="4 4" />
                <Area type="monotone" dataKey="Se os atrasados entrarem" stroke={COR.cinza} strokeDasharray="4 4" fill="none" strokeWidth={1.5} dot={false} />
                <Area type="monotone" dataKey="Saldo" stroke={COR.marca} fill="url(#bpoSaldo)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Cartao>

        <Cartao titulo={`Fechamento de ${mes}/${ano}`} subtitulo={`${okFechamento} de ${d.checklist.length} itens ok`}>
          <div className="h-2 rounded-full bg-secondary overflow-hidden mb-4">
            <div className="h-full bg-marca rounded-full" style={{ width: `${(okFechamento / d.checklist.length) * 100}%` }} />
          </div>
          <ul className="space-y-3">
            {d.checklist.map((i) => (
              <li key={i.rotulo} className="flex items-start gap-2.5">
                {i.ok ? <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" /> : <Circle className="w-4 h-4 text-warning shrink-0 mt-0.5" />}
                <div className="min-w-0">
                  <p className="t-rotulo text-foreground">{i.rotulo}</p>
                  <p className="t-legenda">{i.detalhe}</p>
                </div>
              </li>
            ))}
          </ul>
        </Cartao>
      </div>

      {/* Sócios */}
      <div>
        <h3 className="t-secao text-foreground mb-3">Sócios</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {d.socios.map((s) => (
            <CartaoSocio key={s.id} s={s} mesAno={`${mes}/${ano}`} investidor={s.tipo === 'INVESTIDOR' ? d.investidor : null} anuncio={anuncio} onOrigem={marcarOrigem} onSalvo={() => setVersao((v) => v + 1)} />
          ))}
        </div>
      </div>

      {/* De onde vem e para onde vai */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Cartao titulo="Resultado do mês" subtitulo={resultado ? `Operacional ${brl(resultado.atualCents)} (recebido − custos − salários)` : undefined}>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparativo} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={4}>
                <CartesianGrid vertical={false} stroke="#eaecf0" />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#667085' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v: number) => brlCurto(v)} tick={{ fontSize: 11, fill: '#667085' }} axisLine={false} tickLine={false} width={64} />
                <Tooltip content={<Dica />} cursor={{ fill: '#f2f4f7' }} />
                <Bar dataKey="Recebido" fill={COR.marca} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Custos" fill={COR.laranja} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Retiradas" fill={COR.cinza} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 mt-2 t-meta">
            {[['Recebido', COR.marca], ['Custos e salários', COR.laranja], ['Retiradas', COR.cinza]].map(([n, c]) => <span key={n} className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: c }} />{n}</span>)}
          </div>
        </Cartao>

        <Cartao titulo="Para onde vai o dinheiro" subtitulo="Custos previstos do mês por categoria">
          <Rosca dados={custos} vazio="Nenhum custo no mês." />
        </Cartao>

        <Cartao titulo="De onde vem o dinheiro" subtitulo={d.concentracao.alerta ?? `${d.concentracao.clientes.length} clientes · ${brl(d.concentracao.totalCents)}`}>
          <Rosca dados={receitas} vazio="Nenhuma receita no mês." />
        </Cartao>
      </div>

      {/* Contas a pagar e a receber */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Cartao titulo="Contas a pagar · 30 dias" subtitulo={`${brl(soma(pagarTodas))}${d.pagar.vencidas.length ? ` · ${d.pagar.vencidas.length} vencida(s)` : ''}`}>
          <div className="max-h-72 overflow-y-auto pr-1">
            {d.pagar.vencidas.length > 0 && <><p className="t-meta !text-destructive mt-1">Vencidas</p><Linhas itens={d.pagar.vencidas} vazio="" cor="text-destructive" /></>}
            <p className="t-meta mt-2">A vencer</p>
            <Linhas itens={[...d.pagar.proximos7, ...d.pagar.ate30]} vazio="Nada vence nos próximos 30 dias." />
          </div>
        </Cartao>

        <Cartao titulo="A receber e inadimplência" subtitulo={`${brl(soma(d.receber.proximos7))} entra em 7 dias · ${brl(atrasado)} atrasado`}>
          <div className="space-y-2.5 mb-4">
            {d.receber.faixas.map((f) => (
              <div key={f.faixa} className="flex items-center gap-3">
                <span className="t-meta w-28 shrink-0">{f.faixa}</span>
                <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full rounded-full bg-destructive" style={{ width: `${atrasado ? (f.cents / atrasado) * 100 : 0}%` }} />
                </div>
                <span className={`t-rotulo tabular-nums w-24 text-right ${f.cents ? 'text-destructive' : 'text-muted-foreground'}`}>{brl(f.cents)}</span>
              </div>
            ))}
          </div>
          <div className="max-h-40 overflow-y-auto pr-1">
            {d.receber.atrasadosPorCliente.length === 0 ? <Linhas itens={d.receber.proximos7} vazio="Ninguém atrasado e nada vence em 7 dias." /> : (
              <ul className="divide-y divide-border">
                {d.receber.atrasadosPorCliente.map((c) => (
                  <li key={c.nome} className="flex items-center gap-3 py-2 t-corpo">
                    <span className="text-foreground truncate flex-1">{c.nome} <span className="t-meta">desde {br(c.desde).slice(0, 5)}</span></span>
                    <span className="font-medium text-destructive tabular-nums">{brl(c.cents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Cartao>
      </div>

      {d.pendencias.semCategoria.length > 0 && (
        <Cartao titulo="Pendente de classificação" subtitulo={`${d.pendencias.semCategoria.length} movimento(s) do caixa sem categoria · classifique em Caixa`}>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 max-h-48 overflow-y-auto pr-1">
            {d.pendencias.semCategoria.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-1.5 t-corpo border-b border-border">
                <span className="t-meta tabular-nums w-10 shrink-0">{br(m.dia).slice(0, 5)}</span>
                <span className="text-foreground truncate flex-1">{m.descricao}</span>
                <span className="tabular-nums text-foreground shrink-0">{brl(Math.abs(m.cents))}</span>
              </li>
            ))}
          </ul>
        </Cartao>
      )}
    </div>
  )
}

/** Rosca com a legenda ao lado: valor e participação de cada fatia. */
function Rosca({ dados, vazio }: { dados: Array<{ nome: string; valor: number }>; vazio: string }) {
  const total = dados.reduce((s, x) => s + x.valor, 0)
  if (total <= 0) return <p className="t-legenda py-10 text-center">{vazio}</p>
  return (
    <div className="flex items-center gap-4">
      <div className="relative w-36 h-36 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={dados} dataKey="valor" nameKey="nome" innerRadius={44} outerRadius={68} paddingAngle={1} stroke="none">
              {dados.map((_, i) => <Cell key={i} fill={PIZZA[i % PIZZA.length]} />)}
            </Pie>
            <Tooltip content={<Dica />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="t-meta">total</span>
          <span className="t-rotulo text-foreground tabular-nums">{brlCurto(total)}</span>
        </div>
      </div>
      <ul className="flex-1 min-w-0 space-y-1.5">
        {dados.map((x, i) => (
          <li key={x.nome} className="flex items-center gap-2 text-[12px]">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PIZZA[i % PIZZA.length] }} />
            <span className="truncate flex-1 text-muted-foreground">{x.nome}</span>
            <span className="tabular-nums font-medium text-foreground">{brlCurto(x.valor)}</span>
            <span className="tabular-nums t-meta w-8 text-right">{Math.round((x.valor / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
