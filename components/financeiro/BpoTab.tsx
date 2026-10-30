'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, CheckCircle2, ChevronDown, Circle, Plus, Printer, ShieldCheck, Wallet } from 'lucide-react'
import type { ContaSocio, FaixaAtraso, ItemChecklist, LinhaDre, MovSocio, Previsto, Projecao, ReceitaCliente, Risco } from '@/lib/bpo-core'

interface Socio {
  id: string; socio: string; tipo: string
  retiradasCents: number; aportesCents: number; liquidoCents: number; movimentos: MovSocio[]; conta: ContaSocio
}
interface ClienteNovo { id: string; nome: string; origem: string | null; desde: string; previstoCents: number; recebidoCents: number }

interface BpoData {
  referencia: { hoje: string; competencia: string }
  caixa: { saldoCents: number; risco: Risco; projecoes: Projecao[]; atrasadosReceberCents: number }
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

const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const br = (d: string) => d.split('-').reverse().join('/')
const soma = (l: Previsto[]) => l.reduce((s, p) => s + p.cents, 0)

const COR_RISCO: Record<Risco, { tile: string; texto: string; frase: string }> = {
  falta: { tile: 'bg-red-50 border-red-200', texto: 'text-red-700', frase: 'Vai faltar dinheiro' },
  apertado: { tile: 'bg-amber-50 border-amber-200', texto: 'text-amber-700', frase: 'Caixa apertado' },
  ok: { tile: 'bg-green-50 border-green-200', texto: 'text-green-700', frase: 'Caixa cobre as contas' },
}

function Numero({ rotulo, valor, detalhe, icone, cls = 'bg-white border-gray-200', valorCls = 'text-gray-900', rotuloCls = 'text-gray-500' }: { rotulo: string; valor: string; detalhe?: string; icone?: ReactNode; cls?: string; valorCls?: string; rotuloCls?: string }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 shadow-sm ${cls}`}>
      <div className="flex items-center gap-1.5">
        {icone}
        <p className={`text-[11px] uppercase tracking-wide font-semibold ${rotuloCls}`}>{rotulo}</p>
      </div>
      <p className={`text-2xl font-bold tabular-nums mt-1 ${valorCls}`}>{valor}</p>
      {detalhe && <p className={`text-[11px] mt-0.5 ${rotuloCls} opacity-90`}>{detalhe}</p>}
    </div>
  )
}

const SITUACAO = {
  deve: { rotulo: 'Deve à empresa', cls: 'bg-red-50 text-red-700 border-red-100' },
  receber: { rotulo: 'A receber da empresa', cls: 'bg-green-50 text-green-700 border-green-100' },
  zerado: { rotulo: 'Em dia com a empresa', cls: 'bg-gray-50 text-gray-600 border-gray-100' },
} as const

/** Um sócio: saldo com a empresa em destaque; ao abrir, os lançamentos, as retiradas do mês e o acerto. */
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

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 pt-3 pb-3">
        <div className="flex items-center gap-2">
          <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${s.tipo === 'INVESTIDOR' ? 'bg-purple-600' : 'bg-[#030A8C]'}`}>{s.socio.slice(0, 1)}</span>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{s.socio}</p>
            <p className={`text-[10px] font-semibold uppercase tracking-wide ${s.tipo === 'INVESTIDOR' ? 'text-purple-600' : 'text-[#030A8C]'}`}>{s.tipo === 'INVESTIDOR' ? 'Sócio investidor' : 'Sócio operacional'}</p>
          </div>
        </div>
        <div className={`mt-3 rounded-xl border px-3 py-2 ${sit.cls}`}>
          <p className="text-[10px] uppercase tracking-wide font-semibold opacity-80">{sit.rotulo}</p>
          <p className="text-xl font-bold tabular-nums">{s.conta.situacao === 'zerado' ? 'R$ 0,00' : brl(Math.abs(s.conta.saldoCents))}</p>
          {s.conta.situacao === 'deve' && <p className="text-[11px]">Precisa pagar este valor à empresa.</p>}
          {s.conta.situacao === 'receber' && <p className="text-[11px]">A empresa precisa devolver este valor.</p>}
        </div>
        {investidor ? (
          <p className="text-[11px] text-gray-500 mt-2">Recebe dos clientes novos vindos de anúncio. Em {mesAno}: {anuncio.length} cliente(s), {brl(anuncio.reduce((t, c) => t + c.previstoCents, 0))} de receita · percentual a definir.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 mt-2 text-[11px]">
            <div><p className="text-gray-400">Retirou no mês</p><p className="font-semibold text-gray-900 tabular-nums">{brl(s.retiradasCents)}</p></div>
            <div><p className="text-gray-400">Pôs no caixa</p><p className="font-semibold text-gray-900 tabular-nums">{brl(s.aportesCents)}</p></div>
            <div><p className="text-gray-400">Líquido</p><p className="font-semibold text-[#030A8C] tabular-nums">{brl(s.liquidoCents)}</p></div>
          </div>
        )}
      </div>
      <details className="group border-t border-gray-100">
        <summary className="list-none cursor-pointer select-none px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 flex items-center">
          Ver lançamentos {investidor ? 'e clientes novos' : 'e retiradas'}
          <ChevronDown className="w-4 h-4 text-gray-400 ml-auto transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-4 pb-3 space-y-3">
          <div>
            <p className="text-[11px] font-semibold text-gray-700 mb-1">Conta com a empresa</p>
            {s.conta.lancamentos.length === 0 && <p className="text-[11px] text-gray-400">Nenhum lançamento.</p>}
            <ul className="space-y-1 text-[11px] text-gray-600">
              {s.conta.lancamentos.map((l, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className="truncate"><span className="text-gray-400 tabular-nums mr-1">{br(l.dia).slice(0, 5)}</span>{l.description}</span>
                  <span className={`tabular-nums shrink-0 ${l.amountCents < 0 ? 'text-red-600' : 'text-green-700'}`}>{l.amountCents < 0 ? '−' : '+'}{brl(Math.abs(l.amountCents))}</span>
                </li>
              ))}
            </ul>
          </div>
          {investidor ? (
            <div>
              <p className="text-[11px] font-semibold text-gray-700 mb-1">Clientes novos desde {br(investidor.desde)}</p>
              <ul className="space-y-1.5 text-[11px]">
                {investidor.clientes.length === 0 && <li className="text-gray-400">Nenhum.</li>}
                {investidor.clientes.map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <span className="truncate flex-1 text-gray-700">{c.nome} <span className="text-gray-400">· {brl(c.previstoCents)}</span></span>
                    <select value={c.origem ?? ''} onChange={(e) => onOrigem(c.id, e.target.value)} className="h-7 rounded-md border border-gray-200 bg-white px-1.5 text-[11px]">
                      <option value="">Origem?</option>
                      {Object.entries(ORIGEM).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div>
              <p className="text-[11px] font-semibold text-gray-700 mb-1">Retiradas e aportes no caixa ({mesAno})</p>
              <ul className="space-y-1 text-[11px] text-gray-600">
                {s.movimentos.length === 0 && <li className="text-gray-400">Nenhum no mês.</li>}
                {s.movimentos.map((m, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="truncate"><span className="text-gray-400 tabular-nums mr-1">{br(m.dia).slice(0, 5)}</span>{m.kind === 'APORTE' ? '+ ' : ''}{m.descricao}</span>
                    <span className={`tabular-nums shrink-0 ${m.kind === 'APORTE' ? 'text-green-700' : 'text-gray-900'}`}>{brl(Math.abs(m.cents))}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {form ? (
            <div className="rounded-lg bg-gray-50 border border-gray-100 p-2 space-y-1.5">
              <select value={tipo} onChange={(e) => setTipo(e.target.value as 'CREDITO' | 'DEBITO')} className="h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-xs">
                <option value="CREDITO">Pagou à empresa / pagou conta do bolso (+)</option>
                <option value="DEBITO">Ficou devendo à empresa (−)</option>
              </select>
              <div className="flex gap-1.5">
                <input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Valor (ex.: 160,00)" className="h-8 w-28 rounded-md border border-gray-200 bg-white px-2 text-xs" />
                <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Do que se trata" className="h-8 flex-1 min-w-0 rounded-md border border-gray-200 bg-white px-2 text-xs" />
              </div>
              {erro && <p className="text-[11px] text-red-600">{erro}</p>}
              <div className="flex justify-end gap-1.5">
                <button type="button" onClick={() => setForm(false)} className="h-7 px-2.5 rounded-md text-[11px] text-gray-600 hover:bg-gray-100">Cancelar</button>
                <button type="button" onClick={salvar} className="h-7 px-3 rounded-md bg-[#030A8C] text-white text-[11px] font-semibold">Salvar</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setForm(true)} className="h-7 px-2.5 inline-flex items-center gap-1 rounded-md border border-gray-200 text-[11px] font-semibold text-gray-700 hover:border-[#030A8C] hover:text-[#030A8C]">
              <Plus className="w-3 h-3" /> Registrar acerto
            </button>
          )}
        </div>
      </details>
    </div>
  )
}

/** Seção que abre e fecha; o resumo fica sempre visível na linha do título. */
function Secao({ id, titulo, resumo, alerta, children, aberta = false }: { id: string; titulo: string; resumo: ReactNode; alerta?: boolean; children: ReactNode; aberta?: boolean }) {
  return (
    <details id={`bpo-${id}`} open={aberta} className="group bg-white border border-gray-200 rounded-2xl overflow-hidden break-inside-avoid">
      <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none select-none hover:bg-gray-50">
        <span className="font-semibold text-gray-900 text-sm">{titulo}</span>
        <span className={`text-xs ml-auto text-right ${alerta ? 'text-red-600 font-medium' : 'text-gray-500'}`}>{resumo}</span>
        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4 pt-1 border-t border-gray-100">{children}</div>
    </details>
  )
}

function Lista({ itens, vazio, max = 8 }: { itens: Previsto[]; vazio: string; max?: number }) {
  if (itens.length === 0) return <p className="text-xs text-gray-400">{vazio}</p>
  return (
    <ul className="divide-y divide-gray-100 text-sm">
      {itens.slice(0, max).map((p, i) => (
        <li key={`${p.nome}-${p.vence}-${i}`} className="flex items-center justify-between gap-3 py-1.5">
          <span className="text-gray-700 min-w-0 truncate"><span className="text-gray-400 tabular-nums mr-2">{br(p.vence).slice(0, 5)}</span>{p.nome}</span>
          <span className="font-medium text-gray-900 tabular-nums shrink-0">{brl(p.cents)}</span>
        </li>
      ))}
      {itens.length > max && <li className="py-1.5 text-xs text-gray-400">+ {itens.length - max} item(ns)</li>}
    </ul>
  )
}

function Variacao({ l }: { l: LinhaDre }) {
  if (l.anteriorCents === null || l.anteriorCents === 0) return <span className="text-gray-300">—</span>
  const pct = Math.round(((l.atualCents - l.anteriorCents) / Math.abs(l.anteriorCents)) * 100)
  const ruim = l.despesa ? pct > 0 : pct < 0
  return <span className={pct === 0 ? 'text-gray-400' : ruim ? 'text-red-600' : 'text-green-600'}>{pct > 0 ? '+' : ''}{pct}%</span>
}

const ORIGEM: Record<string, string> = { ANUNCIO: 'Anúncio', INDICACAO: 'Indicação', SOCIO: 'Dos sócios', OUTRO: 'Outro' }

/**
 * BPO financeiro: no topo os quatro números que respondem "tem dinheiro?",
 * ao lado o fechamento do mês em uma barra, os sócios em cartões e o resto em
 * seções que abrem com um clique (o resumo de cada uma fica na linha do
 * título). Só leitura, fora a origem dos clientes novos do investidor.
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

  if (erro) return <p className="text-sm font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-center">{erro}</p>
  if (!d) {
    return (
      <div className="space-y-3 animate-pulse py-2">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-white border border-gray-200 rounded-2xl" />)}</div>
        {[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-white border border-gray-200 rounded-2xl" />)}
      </div>
    )
  }

  const [ano, mes] = d.referencia.competencia.split('-')
  const d30 = d.caixa.projecoes.find((p) => p.dias === 30)
  const risco = COR_RISCO[d.caixa.risco]
  const okFechamento = d.checklist.filter((i) => i.ok).length
  const pagar30 = soma(d.pagar.vencidas) + soma(d.pagar.proximos7) + soma(d.pagar.ate30)
  const atrasado = d.receber.faixas.reduce((s, f) => s + f.cents, 0)
  const resultado = d.dre.find((l) => l.rotulo.includes('operacional'))
  const anuncio = d.investidor?.clientes.filter((c) => c.origem === 'ANUNCIO') ?? []

  return (
    <div className="space-y-3 py-2">
      <div className="flex items-center gap-2 text-[11px] text-gray-500">
        <span>Dados da Central em {br(d.referencia.hoje)} · competência {mes}/{ano} · gerencial, não substitui a contabilidade</span>
        <button type="button" onClick={() => window.print()} className="ml-auto h-7 px-2.5 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white font-semibold text-gray-700 hover:border-[#030A8C] hover:text-[#030A8C] print:hidden">
          <Printer className="w-3.5 h-3.5" /> Relatório
        </button>
      </div>

      {/* Tem dinheiro? Os quatro números, e o fechamento do mês ao lado */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,3fr)_minmax(0,1.2fr)] gap-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Numero rotulo="Caixa hoje" valor={brl(d.caixa.saldoCents)} detalhe="saldo lançado na Central" icone={<Wallet className="w-3.5 h-3.5 text-white/80" />} cls="bg-gradient-to-br from-[#030A8C] to-[#2a35c9] border-transparent" valorCls="text-white" rotuloCls="text-white/80" />
          <Numero rotulo="Entra em 30 dias" valor={brl(d30?.entradasCents ?? 0)} valorCls="text-green-700" detalhe={d.caixa.atrasadosReceberCents ? `+ ${brl(d.caixa.atrasadosReceberCents)} atrasado` : 'parcelas no prazo'} icone={<ArrowDownCircle className="w-3.5 h-3.5 text-green-600" />} />
          <Numero rotulo="Sai em 30 dias" valor={brl(d30?.saidasCents ?? 0)} valorCls="text-red-600" detalhe="custos e salários em aberto" icone={<ArrowUpCircle className="w-3.5 h-3.5 text-red-500" />} />
          <Numero rotulo={risco.frase} valor={brl(d30?.saldoCents ?? 0)} cls={risco.tile} valorCls={risco.texto} detalhe={`sobra até ${d30 ? br(d30.ate).slice(0, 5) : '—'}`} icone={d.caixa.risco === 'ok' ? <ShieldCheck className="w-3.5 h-3.5 text-green-600" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />} />
        </div>
        <details className="group bg-white border border-gray-200 rounded-2xl px-4 py-3">
          <summary className="list-none cursor-pointer select-none">
            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">Fechamento de {mes}/{ano}</p>
              <ChevronDown className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-180" />
            </div>
            <p className="text-xl font-bold text-gray-900 mt-0.5">{okFechamento} de {d.checklist.length} <span className="text-xs font-medium text-gray-500">itens ok</span></p>
            <div className="flex gap-1 mt-2">
              {d.checklist.map((i) => <span key={i.rotulo} title={i.rotulo} className={`h-1.5 flex-1 rounded-full ${i.ok ? 'bg-green-500' : 'bg-amber-400'}`} />)}
            </div>
          </summary>
          <ul className="space-y-1.5 mt-3">
            {d.checklist.map((i) => (
              <li key={i.rotulo} className="flex items-start gap-2 text-xs">
                {i.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0 mt-0.5" /> : <Circle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />}
                <span><span className="font-medium text-gray-900">{i.rotulo}</span> <span className="text-gray-500">· {i.detalhe}</span></span>
              </li>
            ))}
          </ul>
        </details>
      </div>

      {d.caixa.risco !== 'ok' && (
        <p className={`flex items-center gap-2 text-sm rounded-xl border px-4 py-2.5 ${risco.tile} ${risco.texto}`}>
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {d.caixa.risco === 'falta' ? 'O saldo projetado para os próximos 30 dias fica negativo.' : 'Sobra menos de 10% do que sai nos próximos 30 dias.'}
        </p>
      )}

      {/* Sócios: saldo de cada um com a empresa, retiradas do mês e, no investidor, os clientes novos */}
      <div id="bpo-socios" className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {d.socios.map((s) => (
          <CartaoSocio
            key={s.id}
            s={s}
            mesAno={`${mes}/${ano}`}
            investidor={s.tipo === 'INVESTIDOR' ? d.investidor : null}
            anuncio={anuncio}
            onOrigem={marcarOrigem}
            onSalvo={() => setVersao((v) => v + 1)}
          />
        ))}
      </div>

      <Secao id="caixa" titulo="Fluxo de caixa" resumo={d.caixa.projecoes.map((p) => `${p.dias}d ${brl(p.saldoCents)}`).join(' · ')} alerta={d.caixa.projecoes.some((p) => p.saldoCents < 0)}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-gray-400 text-left">
                <th className="font-medium py-2">Até</th>
                <th className="font-medium py-2 text-right">Entra</th>
                <th className="font-medium py-2 text-right">Sai</th>
                <th className="font-medium py-2 text-right">Sobra</th>
                <th className="font-medium py-2 text-right">Se os atrasados entrarem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {d.caixa.projecoes.map((p) => (
                <tr key={p.dias}>
                  <td className="py-1.5 text-gray-700">{br(p.ate)} <span className="text-gray-400 text-xs">({p.dias} dias)</span></td>
                  <td className="py-1.5 text-right tabular-nums text-green-700">{brl(p.entradasCents)}</td>
                  <td className="py-1.5 text-right tabular-nums text-red-600">{brl(p.saidasCents)}</td>
                  <td className={`py-1.5 text-right tabular-nums font-semibold ${p.saldoCents < 0 ? 'text-red-600' : 'text-gray-900'}`}>{brl(p.saldoCents)}</td>
                  <td className="py-1.5 text-right tabular-nums text-gray-500">{brl(p.saldoComAtrasadosCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">Caixa lançado na Central + parcelas que vencem no período − custos e salários em aberto (os vencidos entram). Atrasado a receber só na última coluna, porque é incerto.</p>
      </Secao>

      <Secao id="pagar" titulo="Contas a pagar" resumo={<>{brl(pagar30)} em 30 dias{d.pagar.vencidas.length ? ` · ${d.pagar.vencidas.length} vencida(s)` : ''}</>} alerta={d.pagar.vencidas.length > 0}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div><p className="text-xs font-semibold text-red-600 mb-1">Vencidas · {brl(soma(d.pagar.vencidas))}</p><Lista itens={d.pagar.vencidas} vazio="Nenhuma." /></div>
          <div><p className="text-xs font-semibold text-gray-700 mb-1">Próximos 7 dias · {brl(soma(d.pagar.proximos7))}</p><Lista itens={d.pagar.proximos7} vazio="Nada vence." /></div>
          <div><p className="text-xs font-semibold text-gray-700 mb-1">Do 8º ao 30º dia · {brl(soma(d.pagar.ate30))}</p><Lista itens={d.pagar.ate30} vazio="Nada vence." /></div>
        </div>
      </Secao>

      <Secao id="receber" titulo="A receber e inadimplência" resumo={<>{brl(soma(d.receber.proximos7))} em 7 dias · {brl(atrasado)} atrasado</>} alerta={atrasado > 0}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {d.receber.faixas.map((f) => (
            <div key={f.faixa} className={`rounded-lg border px-2 py-2 ${f.cents > 0 ? 'border-red-100 bg-red-50/50' : 'border-gray-100'}`}>
              <p className="text-[10px] text-gray-500">{f.faixa}</p>
              <p className={`text-sm font-semibold tabular-nums ${f.cents > 0 ? 'text-red-700' : 'text-gray-400'}`}>{brl(f.cents)}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-1">Atrasados por cliente</p>
            {d.receber.atrasadosPorCliente.length === 0 ? <p className="text-xs text-gray-400">Ninguém atrasado.</p> : (
              <ul className="divide-y divide-gray-100 text-sm">
                {d.receber.atrasadosPorCliente.map((c) => (
                  <li key={c.nome} className="flex justify-between gap-3 py-1.5">
                    <span className="text-gray-700 truncate">{c.nome} <span className="text-gray-400 text-xs">desde {br(c.desde).slice(0, 5)}</span></span>
                    <span className="font-medium text-red-700 tabular-nums">{brl(c.cents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div><p className="text-xs font-semibold text-gray-700 mb-1">Entra nos próximos 7 dias</p><Lista itens={d.receber.proximos7} vazio="Nada vence." /></div>
        </div>
      </Secao>

      <Secao id="dre" titulo="Resultado do mês" resumo={resultado ? <>operacional {brl(resultado.atualCents)}</> : '—'} alerta={!!resultado && resultado.atualCents < 0}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-gray-400 text-left">
                <th className="font-medium py-2" /><th className="font-medium py-2 text-right">Este mês</th><th className="font-medium py-2 text-right">Anterior</th><th className="font-medium py-2 text-right">Var.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {d.dre.map((l) => (
                <tr key={l.rotulo} className={l.total ? 'font-semibold' : ''}>
                  <td className={`py-1.5 ${l.total ? 'text-gray-900' : 'text-gray-600'}`}>{l.rotulo}</td>
                  <td className={`py-1.5 text-right tabular-nums ${l.total && l.atualCents < 0 ? 'text-red-600' : 'text-gray-900'}`}>{brl(l.atualCents)}</td>
                  <td className="py-1.5 text-right tabular-nums text-gray-500">{l.anteriorCents === null ? '—' : brl(l.anteriorCents)}</td>
                  <td className="py-1.5 text-right tabular-nums text-xs"><Variacao l={l} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-1">Custos por categoria</p>
            <ul className="divide-y divide-gray-100 text-sm">
              {d.custosPorCategoria.map((c) => (
                <li key={c.category} className="flex justify-between gap-3 py-1.5">
                  <span className="text-gray-700">{c.category}</span>
                  <span className="tabular-nums text-gray-900">{brl(c.pagoCents)} <span className="text-gray-400 text-xs">de {brl(c.previstoCents)}</span></span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Secao>

      <Secao id="clientes" titulo="Receita por cliente" resumo={d.concentracao.alerta ? `Concentração: maior cliente ${d.concentracao.top1}%` : `${d.concentracao.clientes.length} clientes · ${brl(d.concentracao.totalCents)}`} alerta={!!d.concentracao.alerta}>
        {d.concentracao.alerta && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">{d.concentracao.alerta}</p>}
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {d.concentracao.clientes.map((c) => (
            <li key={c.nome}>
              <div className="flex justify-between gap-3">
                <span className="text-gray-700 truncate">{c.nome}</span>
                <span className="tabular-nums text-gray-900 shrink-0">{brl(c.cents)} <span className="text-gray-400 text-xs">{c.share}%</span></span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 mt-1"><div className="h-1.5 rounded-full bg-[#030A8C]" style={{ width: `${Math.min(100, c.share)}%` }} /></div>
            </li>
          ))}
        </ul>
      </Secao>

      {d.pendencias.semCategoria.length > 0 && (
        <Secao id="pendencias" titulo="Pendente de classificação" resumo={`${d.pendencias.semCategoria.length} movimento(s) do caixa sem categoria`}>
          <ul className="divide-y divide-gray-100 text-sm">
            {d.pendencias.semCategoria.map((m) => (
              <li key={m.id} className="flex justify-between gap-3 py-1.5">
                <span className="text-gray-700 truncate"><span className="text-gray-400 tabular-nums mr-2">{br(m.dia).slice(0, 5)}</span>{m.descricao}</span>
                <span className="tabular-nums text-gray-900 shrink-0">{brl(Math.abs(m.cents))}</span>
              </li>
            ))}
          </ul>
        </Secao>
      )}
    </div>
  )
}
