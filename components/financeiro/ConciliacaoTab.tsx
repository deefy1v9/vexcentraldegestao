'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, FileUp, Link2, Loader2, RefreshCw, Undo2 } from 'lucide-react'
import { COST_CATEGORIES } from '@/components/financeiro/EntryForms'

interface Mov { id: string; kind: string; amountCents: number; description: string; dia: string }
interface Linha {
  id: string; conta: string; data: string; descricao: string; documento: string | null; valorCents: number
  contraparte: string | null; status: string; motivo: string | null; diferencaCents: number; auto: boolean; movimentos: Mov[]
}
interface Regra { acao: string; kind: string | null; descricao: string | null; categoria: string | null; partnerId: string | null }
interface Conta {
  conta: string; pendentes: number; conciliadas: number; ignoradas: number; cobertoAte: string | null
  conciliadoAte: string | null; saldoBancoCents: number | null; ultimoArquivo: { nome: string; em: string } | null
}
interface Painel {
  hoje: string
  responsavel: { id: string; name: string; phone: string | null } | null
  socios: Array<{ id: string; name: string; socio?: string | null }>
  admins: Array<{ id: string; name: string }>
  contas: Conta[]
  saldoCentralCents: number
  saldoBancosCents: number | null
  linhas: Linha[]
  sugestoes: Record<string, { movimentos: Mov[]; regra: Regra | null; daCasa: boolean }>
}

const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const br = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—')
const CATEGORIAS = ['Recebimento', 'Pró-labore', 'Salários', 'Equipe', ...COST_CATEGORIES, 'Transferência']
const MOTIVO: Record<string, string> = { INTERNA: 'Entre contas da VEX / saque do Asaas', PESSOAL: 'Repasse pessoal do Davi', OUTRO: 'Ignorada' }
const FILTROS = [['PENDENTE', 'Pendentes'], ['CONCILIADO', 'Conciliadas'], ['IGNORADO', 'Ignoradas'], ['', 'Todas']] as const

/** Lê o PDF no navegador (o mesmo pdfjs do visualizador de contratos) e devolve os textos com posição. */
async function itensDoPdf(file: File) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const itens: Array<{ pagina: number; x: number; y: number; s: string }> = []
  for (let n = 1; n <= doc.numPages; n++) {
    const tc = await (await doc.getPage(n)).getTextContent()
    for (const i of tc.items) {
      if (!('str' in i) || !i.str.trim()) continue
      itens.push({ pagina: n, x: Math.round(i.transform[4]), y: Math.round(i.transform[5]), s: i.str })
    }
  }
  return itens
}

/**
 * Conciliação bancária: sobe o extrato (PDF do Santander/Nubank ou OFX), a
 * Central casa sozinha o que dá e a pessoa resolve o resto linha a linha —
 * vincular a um lançamento, lançar no caixa ou ignorar com o motivo.
 */
export default function ConciliacaoTab() {
  const [status, setStatus] = useState<string>('PENDENTE')
  const [conta, setConta] = useState('')
  const [d, setD] = useState<Painel | null>(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const [aberta, setAberta] = useState<string | null>(null)
  const [ocupada, setOcupada] = useState<string | null>(null)

  const carregar = useCallback(() => {
    const q = new URLSearchParams({ status, ...(conta ? { conta } : {}) })
    return fetch(`/api/financeiro/conciliacao?${q}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('falhou'))))
      .then((b: Painel) => { setD(b); setErro('') })
      .catch(() => setErro('Não consegui carregar a conciliação.'))
  }, [status, conta])

  useEffect(() => { carregar() }, [carregar])

  async function subir(file: File) {
    setEnviando(true)
    setAviso('')
    try {
      const ofx = /\.ofx$/i.test(file.name)
      const corpo = ofx
        ? { tipo: 'ofx', arquivo: file.name, texto: await file.text() }
        : { tipo: 'pdf', arquivo: file.name, itens: await itensDoPdf(file) }
      const r = await fetch('/api/financeiro/conciliacao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) setAviso(b.error || 'Não consegui ler o extrato.')
      else setAviso(`${b.conta}: ${b.lidas} lançamento(s) no arquivo, ${b.novas} novo(s)${b.repetidas ? `, ${b.repetidas} já estava(m) na Central` : ''}. A Central conciliou ${b.casadas} sozinha${b.lancadas ? `, lançou ${b.lancadas} pelo que já sabia` : ''}${b.ignoradas ? ` e ignorou ${b.ignoradas}` : ''}${b.demandasConcluidas ? `. ${b.demandasConcluidas} demanda(s) de extrato concluída(s)` : ''}. O resumo foi para o WhatsApp do responsável.`)
      await carregar()
    } catch {
      setAviso('Não consegui abrir este arquivo. Use o PDF do extrato do Santander ou do Nubank, ou um OFX.')
    } finally {
      setEnviando(false)
    }
  }

  async function agir(id: string, corpo: Record<string, unknown>) {
    setOcupada(id)
    try {
      const r = await fetch(`/api/financeiro/conciliacao/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
      const b = await r.json().catch(() => ({}))
      setAviso(r.ok ? b.mensagem : b.error || 'Falhou.')
      if (r.ok) { setAberta(null); await carregar() }
    } finally {
      setOcupada(null)
    }
  }

  async function trocarResponsavel(responsavelId: string) {
    await fetch('/api/financeiro/conciliacao', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ responsavelId }) })
    await carregar()
  }

  async function reconciliar() {
    setEnviando(true)
    const r = await fetch('/api/financeiro/conciliacao', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reconciliar: true }) })
    const b = await r.json().catch(() => ({}))
    setAviso(r.ok ? `A Central conciliou mais ${b.casadas} linha(s)${b.ignoradas ? ` e ignorou ${b.ignoradas}` : ''}.` : 'Falhou.')
    setEnviando(false)
    await carregar()
  }

  if (erro) return <p className="text-sm font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-center">{erro}</p>
  if (!d) return <div className="flex items-center gap-2 text-sm text-gray-400 py-6"><Loader2 className="w-4 h-4 animate-spin" /> Carregando conciliação...</div>

  const diferenca = d.saldoBancosCents === null ? null : d.saldoBancosCents - d.saldoCentralCents

  return (
    <div className="space-y-4 py-2">
      {/* Situação: responsável, contas e saldo do banco contra o da Central */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3">
        <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Responsável</p>
            <select value={d.responsavel?.id ?? ''} onChange={(e) => trocarResponsavel(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-gray-200 bg-white px-2 text-sm">
              {d.admins.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <p className="text-[11px] text-gray-500 mt-1">Todo dia às 23h, se a conta não está conciliada até o dia, recebe a demanda “Subir extrato” e o aviso no WhatsApp. A demanda se fecha sozinha quando o extrato chega.</p>
          </div>
          <div className="border-t border-gray-100 pt-3">
            <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Saldo</p>
            <div className="flex justify-between text-sm mt-1"><span className="text-gray-600">Bancos (último extrato de cada conta)</span><span className="font-semibold tabular-nums">{d.saldoBancosCents === null ? '—' : brl(d.saldoBancosCents)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-600">Caixa da Central</span><span className="font-semibold tabular-nums">{brl(d.saldoCentralCents)}</span></div>
            {diferenca !== null && (
              <p className={`text-xs mt-2 font-medium ${diferenca === 0 ? 'text-green-700' : 'text-amber-700'}`}>
                {diferenca === 0 ? 'Bate com o banco.' : `Diferença de ${brl(diferenca)}: falta conciliar algo ou há dinheiro que ainda não caiu.`}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <label
            onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastando(false); const f = e.dataTransfer.files?.[0]; if (f) subir(f) }}
            className={`flex items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-4 cursor-pointer transition-colors ${arrastando ? 'border-[#030A8C] bg-[#030A8C]/5' : 'border-gray-200 bg-white hover:border-[#030A8C]/50'}`}
          >
            {enviando ? <Loader2 className="w-6 h-6 text-[#030A8C] animate-spin shrink-0" /> : <FileUp className="w-6 h-6 text-[#030A8C] shrink-0" />}
            <div className="text-sm">
              <p className="font-semibold text-gray-900">{enviando ? 'Lendo o extrato…' : 'Subir extrato'}</p>
              <p className="text-xs text-gray-500">Arraste ou clique: PDF do Santander Empresas ou do Nubank PJ, ou arquivo OFX. Pode subir o mesmo período de novo, a Central não duplica.</p>
            </div>
            <input type="file" accept=".pdf,.ofx,application/pdf" className="hidden" disabled={enviando} onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); e.target.value = '' }} />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {d.contas.length === 0 && <p className="text-xs text-gray-400">Nenhum extrato ainda. Suba o primeiro acima.</p>}
            {d.contas.map((c) => (
              <button key={c.conta} type="button" onClick={() => setConta(conta === c.conta ? '' : c.conta)} className={`text-left bg-white border rounded-xl p-3 transition-colors ${conta === c.conta ? 'border-[#030A8C]' : 'border-gray-200 hover:border-gray-300'}`}>
                <p className="font-semibold text-sm text-gray-900 truncate">{c.conta}</p>
                <p className="text-xs text-gray-500 mt-0.5">Conciliado até <strong className={c.conciliadoAte === c.cobertoAte ? 'text-green-700' : 'text-amber-700'}>{br(c.conciliadoAte)}</strong> · extrato até {br(c.cobertoAte)}</p>
                <p className="text-xs text-gray-500">{c.pendentes} pendente(s) · {c.conciliadas} conciliada(s) · {c.ignoradas} ignorada(s){c.saldoBancoCents !== null ? ` · saldo ${brl(c.saldoBancoCents)}` : ''}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {aviso && <p className="text-xs font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5">{aviso}</p>}

      <div className="flex items-center gap-2 flex-wrap">
        {FILTROS.map(([v, rotulo]) => (
          <button key={v} type="button" onClick={() => setStatus(v)} className={`h-8 px-3 rounded-full border text-xs font-medium ${status === v ? 'border-[#030A8C] bg-[#030A8C] text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-[#030A8C]'}`}>{rotulo}</button>
        ))}
        {conta && <span className="text-xs text-gray-500">· só {conta}</span>}
        <button type="button" onClick={reconciliar} disabled={enviando} className="ml-auto h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:border-[#030A8C] hover:text-[#030A8C] disabled:opacity-50">
          <RefreshCw className="w-3.5 h-3.5" /> Conciliar de novo
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
        {d.linhas.length === 0 && <p className="text-sm text-gray-400 px-4 py-6 text-center">{status === 'PENDENTE' ? 'Nada pendente. Tudo conciliado.' : 'Nenhuma linha.'}</p>}
        {d.linhas.map((l) => (
          <LinhaExtrato
            key={l.id}
            l={l}
            sug={d.sugestoes[l.id]}
            socios={d.socios}
            aberta={aberta === l.id}
            ocupada={ocupada === l.id}
            onAbrir={() => setAberta(aberta === l.id ? null : l.id)}
            onAgir={(corpo) => agir(l.id, corpo)}
          />
        ))}
      </div>
    </div>
  )
}

function LinhaExtrato({
  l, sug, socios, aberta, ocupada, onAbrir, onAgir,
}: {
  l: Linha
  sug?: { movimentos: Mov[]; regra: Regra | null; daCasa: boolean }
  socios: Array<{ id: string; name: string }>
  aberta: boolean
  ocupada: boolean
  onAbrir: () => void
  onAgir: (corpo: Record<string, unknown>) => void
}) {
  const entra = l.valorCents > 0
  const regra = sug?.regra?.acao === 'LANCAR' ? sug.regra : null
  const [kind, setKind] = useState(regra?.kind ?? (entra ? 'ENTRADA' : 'SAIDA'))
  const [descricao, setDescricao] = useState(regra?.descricao ?? l.descricao)
  const [categoria, setCategoria] = useState(regra?.categoria ?? (entra ? 'Recebimento' : ''))
  const [socio, setSocio] = useState(regra?.partnerId ?? '')
  const [lembrar, setLembrar] = useState(true)
  const comSocio = kind === 'RETIRADA' || kind === 'APORTE'

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-gray-900 truncate"><span className="text-gray-400 tabular-nums mr-2">{br(l.data)}</span>{l.descricao}</p>
          <p className="text-[11px] text-gray-400 truncate">{l.conta}{l.documento ? ` · doc ${l.documento}` : ''}</p>
        </div>
        <span className={`text-sm font-semibold tabular-nums shrink-0 ${entra ? 'text-green-700' : 'text-red-600'}`}>{brl(l.valorCents)}</span>
      </div>

      {l.status === 'CONCILIADO' && (
        <div className="mt-1.5 flex items-start gap-2 text-xs">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0 mt-0.5" />
          <span className="text-gray-600 flex-1">
            {l.auto ? 'A Central casou com ' : 'Casada com '}
            {l.movimentos.map((m) => `${m.description} (${brl(m.amountCents)} em ${br(m.dia)})`).join(' + ')}
            {l.diferencaCents !== 0 && <span className="text-amber-700 font-medium"> · diferença de {brl(l.diferencaCents)}</span>}
          </span>
          <button type="button" disabled={ocupada} onClick={() => onAgir({ acao: 'desfazer' })} className="inline-flex items-center gap-1 text-gray-500 hover:text-[#030A8C]"><Undo2 className="w-3 h-3" />Desfazer</button>
        </div>
      )}
      {l.status === 'IGNORADO' && (
        <div className="mt-1.5 flex items-center gap-2 text-xs text-gray-500">
          <span className="flex-1">{MOTIVO[l.motivo ?? 'OUTRO']}{l.auto ? ' (a Central lembrou)' : ''}</span>
          <button type="button" disabled={ocupada} onClick={() => onAgir({ acao: 'desfazer' })} className="inline-flex items-center gap-1 hover:text-[#030A8C]"><Undo2 className="w-3 h-3" />Desfazer</button>
        </div>
      )}

      {l.status === 'PENDENTE' && (
        <div className="mt-2 space-y-2">
          {sug?.daCasa && <p className="text-[11px] text-gray-500">Pix com o CNPJ da própria VEX: costuma ser transferência entre contas ou saque do Asaas.</p>}
          <div className="flex flex-wrap gap-1.5">
            {sug?.movimentos.map((m) => (
              <button key={m.id} type="button" disabled={ocupada} onClick={() => onAgir({ acao: 'vincular', movimentos: [m.id] })} className="h-7 px-2.5 inline-flex items-center gap-1 rounded-md border border-[#030A8C]/30 bg-[#030A8C]/5 text-[11px] font-medium text-[#030A8C] hover:bg-[#030A8C]/10 max-w-full">
                <Link2 className="w-3 h-3 shrink-0" /><span className="truncate">{m.description} · {brl(m.amountCents)} · {br(m.dia)}</span>
              </button>
            ))}
            <button type="button" onClick={onAbrir} className="h-7 px-2.5 rounded-md border border-gray-200 text-[11px] font-semibold text-gray-700 hover:border-[#030A8C]">{aberta ? 'Fechar' : 'Lançar no caixa'}</button>
            <button type="button" disabled={ocupada} onClick={() => onAgir({ acao: 'ignorar', motivo: 'INTERNA' })} className="h-7 px-2.5 rounded-md border border-gray-200 text-[11px] text-gray-600 hover:border-gray-400">Entre contas / Asaas</button>
            <button type="button" disabled={ocupada} onClick={() => onAgir({ acao: 'ignorar', motivo: 'PESSOAL', lembrar: true })} className="h-7 px-2.5 rounded-md border border-gray-200 text-[11px] text-gray-600 hover:border-gray-400" title="A Central lembra desta contraparte e ignora as próximas sozinha">Pessoal do Davi</button>
            <button type="button" disabled={ocupada} onClick={() => onAgir({ acao: 'ignorar', motivo: 'OUTRO' })} className="h-7 px-2.5 rounded-md border border-gray-200 text-[11px] text-gray-500 hover:border-gray-400">Ignorar</button>
          </div>

          {aberta && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[150px_minmax(0,1fr)_170px_170px_auto] gap-2 items-end rounded-lg bg-gray-50 border border-gray-100 p-3">
              <label className="text-[11px] text-gray-600">Tipo
                <select value={kind} onChange={(e) => setKind(e.target.value)} className="mt-0.5 h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-xs">
                  {(entra ? [['ENTRADA', 'Entrada'], ['APORTE', 'Aporte de sócio']] : [['SAIDA', 'Saída'], ['RETIRADA', 'Retirada de sócio']]).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                </select>
              </label>
              <label className="text-[11px] text-gray-600">Descrição
                <input value={descricao} onChange={(e) => setDescricao(e.target.value)} className="mt-0.5 h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-xs" />
              </label>
              {comSocio ? (
                <label className="text-[11px] text-gray-600">Sócio
                  <select value={socio} onChange={(e) => setSocio(e.target.value)} className="mt-0.5 h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-xs">
                    <option value="">Escolha</option>
                    {socios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
              ) : <span className="hidden lg:block" />}
              <label className="text-[11px] text-gray-600">Categoria
                <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="mt-0.5 h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-xs">
                  <option value="">Sem categoria</option>
                  {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-gray-600 inline-flex items-center gap-1 whitespace-nowrap" title="Da próxima vez, a Central sugere o mesmo para esta contraparte">
                  <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} /> lembrar
                </label>
                <button type="button" disabled={ocupada || !descricao.trim() || (comSocio && !socio)} onClick={() => onAgir({ acao: 'lancar', kind, descricao, categoria, partnerId: socio || null, lembrar })} className="h-8 px-3 rounded-md bg-[#030A8C] text-white text-xs font-semibold disabled:opacity-50">Lançar</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
