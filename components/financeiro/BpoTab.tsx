'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Circle, Printer, Wallet } from 'lucide-react'
import type { FaixaAtraso, ItemChecklist, LinhaDre, Previsto, Projecao, ReceitaCliente, ResumoSocio, Risco } from '@/lib/bpo-core'

interface BpoData {
  referencia: { hoje: string; competencia: string }
  caixa: { saldoCents: number; risco: Risco; projecoes: Projecao[]; atrasadosReceberCents: number }
  pagar: { vencidas: Previsto[]; proximos7: Previsto[]; ate30: Previsto[] }
  receber: {
    proximos7: Previsto[]
    faixas: FaixaAtraso[]
    atrasadosPorCliente: Array<{ nome: string; cents: number; desde: string; qtd: number }>
  }
  socios: ResumoSocio[]
  dre: LinhaDre[]
  custosPorCategoria: Array<{ category: string; previstoCents: number; pagoCents: number }>
  concentracao: { clientes: ReceitaCliente[]; totalCents: number; top1: number; top3: number; alerta: string | null }
  pendencias: { semCategoria: Array<{ id: string; dia: string; kind: string; cents: number; descricao: string }>; semConta: number }
  checklist: ItemChecklist[]
}

const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const br = (d: string) => d.split('-').reverse().join('/')
const soma = (l: Previsto[]) => l.reduce((s, p) => s + p.cents, 0)

const RISCO: Record<Risco, { titulo: string; cls: string }> = {
  falta: { titulo: 'Risco de faltar dinheiro nos próximos 30 dias', cls: 'bg-red-50 border-red-200 text-red-800' },
  apertado: { titulo: 'Caixa apertado nos próximos 30 dias', cls: 'bg-amber-50 border-amber-200 text-amber-800' },
  ok: { titulo: 'Caixa cobre as contas dos próximos 30 dias', cls: 'bg-green-50 border-green-200 text-green-800' },
}

/** Atalhos do topo: cada um rola até a sua seção. */
const SECOES = [
  ['caixa', 'Fluxo de caixa'], ['pagar', 'Contas a pagar'], ['receber', 'A receber e inadimplência'],
  ['socios', 'Pró-labore e sócios'], ['dre', 'Resultado do mês'], ['clientes', 'Receita por cliente'], ['fechamento', 'Fechamento'],
] as const

function Card({ id, titulo, extra, children }: { id: string; titulo: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section id={`bpo-${id}`} className="bg-white border border-gray-200 rounded-2xl overflow-hidden scroll-mt-4 break-inside-avoid">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900 text-sm">{titulo}</h3>
        {extra}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

function Lista({ itens, vazio }: { itens: Previsto[]; vazio: string }) {
  if (itens.length === 0) return <p className="text-xs text-gray-400">{vazio}</p>
  return (
    <ul className="divide-y divide-gray-100 text-sm">
      {itens.map((p, i) => (
        <li key={`${p.nome}-${p.vence}-${i}`} className="flex items-center justify-between gap-3 py-1.5">
          <span className="text-gray-700 min-w-0 truncate"><span className="text-gray-400 tabular-nums mr-2">{br(p.vence)}</span>{p.nome}</span>
          <span className="font-medium text-gray-900 tabular-nums shrink-0">{brl(p.cents)}</span>
        </li>
      ))}
    </ul>
  )
}

function Variacao({ l }: { l: LinhaDre }) {
  if (l.anteriorCents === null || l.anteriorCents === 0) return <span className="text-gray-300">—</span>
  const pct = Math.round(((l.atualCents - l.anteriorCents) / Math.abs(l.anteriorCents)) * 100)
  const ruim = l.despesa ? pct > 0 : pct < 0
  return <span className={pct === 0 ? 'text-gray-400' : ruim ? 'text-red-600' : 'text-green-600'}>{pct > 0 ? '+' : ''}{pct}%</span>
}

/**
 * BPO financeiro: o mês da empresa numa página, na ordem das perguntas do
 * sócio: quanto há, quanto sai, quanto entra, se falta, quem tirou quanto e o
 * que falta para fechar o mês. Só leitura: as ações ficam nas outras abas.
 */
export default function BpoTab({ competencia }: { competencia: string }) {
  // A resposta guarda a competência: trocar de mês mostra o carregando até chegar a nova
  const [res, setRes] = useState<{ competencia: string; dados?: BpoData; erro?: string } | null>(null)

  useEffect(() => {
    let vivo = true
    fetch(`/api/financeiro/bpo?mes=${competencia}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('falhou'))))
      .then((dados: BpoData) => { if (vivo) setRes({ competencia, dados }) })
      .catch(() => { if (vivo) setRes({ competencia, erro: 'Não consegui montar o BPO financeiro.' }) })
    return () => { vivo = false }
  }, [competencia])

  const atual = res?.competencia === competencia ? res : null
  const d = atual?.dados ?? null
  const erro = atual?.erro ?? ''

  if (erro) return <p className="text-sm font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-center">{erro}</p>
  if (!d) {
    return (
      <div className="space-y-3 animate-pulse py-2">
        {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-white border border-gray-200 rounded-2xl" />)}
      </div>
    )
  }

  const risco = RISCO[d.caixa.risco]
  const d30 = d.caixa.projecoes.find((p) => p.dias === 30)
  const [ano, mes] = d.referencia.competencia.split('-')

  return (
    <div className="space-y-4 py-2">
      {/* Atalhos e data de referência */}
      <div className="flex items-center gap-2 flex-wrap print:hidden">
        {SECOES.map(([id, rotulo]) => (
          <a key={id} href={`#bpo-${id}`} className="h-8 px-3 inline-flex items-center rounded-full border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:border-[#030A8C] hover:text-[#030A8C]">{rotulo}</a>
        ))}
        <button type="button" onClick={() => window.print()} className="ml-auto h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:border-[#030A8C] hover:text-[#030A8C]">
          <Printer className="w-3.5 h-3.5" /> Relatório
        </button>
      </div>
      <p className="text-[11px] text-gray-500">
        Dados da Central em {br(d.referencia.hoje)} · competência {mes}/{ano}. Valores gerenciais: não substituem a contabilidade.
      </p>

      {/* O que importa primeiro */}
      <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${risco.cls}`}>
        {d.caixa.risco === 'ok' ? <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" /> : <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />}
        <div className="text-sm">
          <p className="font-semibold">{risco.titulo}</p>
          {d30 && (
            <p className="mt-0.5">
              Hoje há {brl(d.caixa.saldoCents)} no caixa. Até {br(d30.ate)} entram {brl(d30.entradasCents)} e saem {brl(d30.saidasCents)}: sobra <strong>{brl(d30.saldoCents)}</strong>
              {d.caixa.atrasadosReceberCents > 0 && <> ({brl(d30.saldoComAtrasadosCents)} se os {brl(d.caixa.atrasadosReceberCents)} atrasados entrarem)</>}.
            </p>
          )}
        </div>
      </div>

      <Card id="caixa" titulo="Fluxo de caixa projetado" extra={<span className="text-[11px] text-gray-400 flex items-center gap-1"><Wallet className="w-3.5 h-3.5" />saldo confirmado {brl(d.caixa.saldoCents)}</span>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-gray-400 text-left">
                <th className="font-medium pb-2">Horizonte</th>
                <th className="font-medium pb-2 text-right">Entradas previstas</th>
                <th className="font-medium pb-2 text-right">Saídas previstas</th>
                <th className="font-medium pb-2 text-right">Saldo projetado</th>
                <th className="font-medium pb-2 text-right">Com atrasados</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {d.caixa.projecoes.map((p) => (
                <tr key={p.dias}>
                  <td className="py-2 text-gray-700">{p.dias} dias <span className="text-gray-400 text-xs">até {br(p.ate)}</span></td>
                  <td className="py-2 text-right tabular-nums text-green-700">{brl(p.entradasCents)}</td>
                  <td className="py-2 text-right tabular-nums text-red-600">{brl(p.saidasCents)}</td>
                  <td className={`py-2 text-right tabular-nums font-semibold ${p.saldoCents < 0 ? 'text-red-600' : 'text-gray-900'}`}>{brl(p.saldoCents)}</td>
                  <td className="py-2 text-right tabular-nums text-gray-500">{brl(p.saldoComAtrasadosCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-400 mt-3">
          Premissas: saldo do caixa lançado na Central + parcelas de clientes que vencem no período − custos e salários em aberto (os vencidos entram, porque continuam devidos). Recebimento atrasado só entra na última coluna, porque é incerto.
        </p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card id="pagar" titulo="Contas a pagar" extra={<span className="text-xs font-semibold text-gray-700 tabular-nums">{brl(soma(d.pagar.vencidas) + soma(d.pagar.proximos7) + soma(d.pagar.ate30))} em 30 dias</span>}>
          {d.pagar.vencidas.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-red-600 mb-1">Vencidas · {brl(soma(d.pagar.vencidas))}</p>
              <Lista itens={d.pagar.vencidas} vazio="" />
            </div>
          )}
          <p className="text-xs font-semibold text-gray-700 mb-1">Próximos 7 dias · {brl(soma(d.pagar.proximos7))}</p>
          <Lista itens={d.pagar.proximos7} vazio="Nada vence nos próximos 7 dias." />
          <p className="text-xs font-semibold text-gray-700 mt-3 mb-1">Do 8º ao 30º dia · {brl(soma(d.pagar.ate30))}</p>
          <Lista itens={d.pagar.ate30} vazio="Nada vence nesse período." />
        </Card>

        <Card id="receber" titulo="A receber e inadimplência">
          <p className="text-xs font-semibold text-gray-700 mb-1">Entra nos próximos 7 dias · {brl(soma(d.receber.proximos7))}</p>
          <Lista itens={d.receber.proximos7} vazio="Nenhuma parcela vence nos próximos 7 dias." />
          <p className="text-xs font-semibold text-gray-700 mt-4 mb-2">Atrasados por faixa</p>
          <div className="grid grid-cols-4 gap-2">
            {d.receber.faixas.map((f) => (
              <div key={f.faixa} className={`rounded-lg border px-2 py-2 ${f.cents > 0 ? 'border-red-100 bg-red-50/50' : 'border-gray-100'}`}>
                <p className="text-[10px] text-gray-500 leading-tight">{f.faixa}</p>
                <p className={`text-sm font-semibold tabular-nums ${f.cents > 0 ? 'text-red-700' : 'text-gray-400'}`}>{brl(f.cents)}</p>
              </div>
            ))}
          </div>
          {d.receber.atrasadosPorCliente.length > 0 && (
            <ul className="divide-y divide-gray-100 text-sm mt-3">
              {d.receber.atrasadosPorCliente.map((c) => (
                <li key={c.nome} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="text-gray-700 truncate">{c.nome} <span className="text-gray-400 text-xs">desde {br(c.desde)} · {c.qtd} parcela{c.qtd === 1 ? '' : 's'}</span></span>
                  <span className="font-medium text-red-700 tabular-nums">{brl(c.cents)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card id="socios" titulo={`Pró-labore e sócios · ${mes}/${ano}`}>
        {d.socios.length === 0 ? (
          <p className="text-xs text-gray-400">Nenhuma retirada ou aporte de sócio lançado no caixa neste mês.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {d.socios.map((s) => (
              <div key={s.socio} className="rounded-xl border border-gray-200 p-3">
                <p className="font-semibold text-gray-900 text-sm">{s.socio}</p>
                <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                  <div><p className="text-gray-400">Retirou</p><p className="font-semibold text-gray-900 tabular-nums">{brl(s.retiradasCents)}</p></div>
                  <div><p className="text-gray-400">Pôs / pagou</p><p className="font-semibold text-gray-900 tabular-nums">{brl(s.aportesCents)}</p></div>
                  <div><p className="text-gray-400">Líquido</p><p className="font-semibold text-[#030A8C] tabular-nums">{brl(s.liquidoCents)}</p></div>
                </div>
                <ul className="mt-3 space-y-1 text-[11px] text-gray-600">
                  {s.movimentos.map((m, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="truncate"><span className="text-gray-400 tabular-nums mr-1">{br(m.dia).slice(0, 5)}</span>{m.kind === 'APORTE' ? '+ ' : ''}{m.descricao}</span>
                      <span className={`tabular-nums shrink-0 ${m.kind === 'APORTE' ? 'text-green-700' : 'text-gray-900'}`}>{brl(Math.abs(m.cents))}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-gray-400 mt-3">Retirada inclui pró-labore, divisão de cliente e acerto. “Pôs / pagou” é aporte ou conta da empresa paga do bolso, que volta para o sócio.</p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card id="dre" titulo="Resultado do mês (gerencial)">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-gray-400 text-left">
                <th className="font-medium pb-2" />
                <th className="font-medium pb-2 text-right">Este mês</th>
                <th className="font-medium pb-2 text-right">Mês anterior</th>
                <th className="font-medium pb-2 text-right">Var.</th>
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
          {d.custosPorCategoria.length > 0 && (
            <>
              <p className="text-xs font-semibold text-gray-700 mt-4 mb-1">Custos por categoria</p>
              <ul className="divide-y divide-gray-100 text-sm">
                {d.custosPorCategoria.map((c) => (
                  <li key={c.category} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="text-gray-700">{c.category}</span>
                    <span className="tabular-nums text-gray-900">{brl(c.pagoCents)} <span className="text-gray-400 text-xs">de {brl(c.previstoCents)}</span></span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card id="clientes" titulo="Receita por cliente" extra={<span className="text-xs text-gray-500 tabular-nums">{brl(d.concentracao.totalCents)}</span>}>
          {d.concentracao.alerta && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">Concentração: {d.concentracao.alerta}</p>
          )}
          <ul className="space-y-2 text-sm">
            {d.concentracao.clientes.map((c) => (
              <li key={c.nome}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-700 truncate">{c.nome}</span>
                  <span className="tabular-nums text-gray-900 shrink-0">{brl(c.cents)} <span className="text-gray-400 text-xs">{c.share}%</span></span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 mt-1"><div className="h-1.5 rounded-full bg-[#030A8C]" style={{ width: `${Math.min(100, c.share)}%` }} /></div>
              </li>
            ))}
          </ul>
          {d.concentracao.clientes.length === 0 && <p className="text-xs text-gray-400">Nenhuma receita na competência.</p>}
        </Card>
      </div>

      <Card id="fechamento" titulo={`Fechamento de ${mes}/${ano}`}>
        <ul className="space-y-2">
          {d.checklist.map((i) => (
            <li key={i.rotulo} className="flex items-start gap-2 text-sm">
              {i.ok ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" /> : <Circle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />}
              <span><span className="font-medium text-gray-900">{i.rotulo}</span> <span className="text-gray-500">· {i.detalhe}</span></span>
            </li>
          ))}
        </ul>
        {d.pendencias.semCategoria.length > 0 && (
          <>
            <p className="text-xs font-semibold text-gray-700 mt-4 mb-1">Pendente de classificação (caixa sem categoria)</p>
            <ul className="divide-y divide-gray-100 text-sm">
              {d.pendencias.semCategoria.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="text-gray-700 truncate"><span className="text-gray-400 tabular-nums mr-2">{br(m.dia)}</span>{m.descricao}</span>
                  <span className="tabular-nums text-gray-900 shrink-0">{brl(Math.abs(m.cents))}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  )
}
