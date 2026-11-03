'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, FileUp, Landmark, Link2, Loader2, RefreshCw, Undo2 } from 'lucide-react'
import { Chip, Numero, Pilulas, Sobretitulo } from '@/components/vex/vireo'
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

  if (erro) return <p className="text-sm font-medium text-destructive-texto bg-destructive-suave border border-destructive/20 rounded-2xl px-4 py-3 text-center">{erro}</p>
  if (!d) return <div className="flex items-center gap-2 text-sm text-muted-foreground py-6"><Loader2 className="w-4 h-4 animate-spin" /> Carregando conciliação...</div>

  const diferenca = d.saldoBancosCents === null ? null : d.saldoBancosCents - d.saldoCentralCents

  return (
    <div className="space-y-5 py-1">
      {/* Situação: responsável, contas e saldo do banco contra o da Central */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-5">
        <div className="rounded-[24px] border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] p-6 space-y-4">
          <div>
            <Sobretitulo>Responsável</Sobretitulo>
            <select value={d.responsavel?.id ?? ''} onChange={(e) => trocarResponsavel(e.target.value)} className="mt-2 h-10 w-full rounded-xl border border-border bg-card px-3 text-[13.5px] text-foreground outline-none focus:border-marca">
              {d.admins.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <p className="t-legenda mt-2">Todo dia às 23h, se a conta não está conciliada até o dia, recebe a demanda “Subir extrato” e o aviso no WhatsApp. A demanda se fecha sozinha quando o extrato chega.</p>
          </div>
          <div className="border-t border-border pt-4">
            <Sobretitulo>Saldo</Sobretitulo>
            <div className="flex justify-between gap-3 text-[13.5px] mt-2"><span className="text-muted-foreground">Bancos (último extrato de cada conta)</span><span className="font-display font-semibold text-foreground tabular-nums">{d.saldoBancosCents === null ? '—' : brl(d.saldoBancosCents)}</span></div>
            <div className="flex justify-between gap-3 text-[13.5px] mt-1.5"><span className="text-muted-foreground">Caixa da Central</span><span className="font-display font-semibold text-foreground tabular-nums">{brl(d.saldoCentralCents)}</span></div>
            {diferenca !== null && (
              <p className={`text-[12px] mt-3 font-medium rounded-xl px-3 py-2 ${diferenca === 0 ? 'bg-success-suave text-success' : 'bg-warning-suave text-warning'}`}>
                {diferenca === 0 ? 'Bate com o banco.' : `Diferença de ${brl(diferenca)}: falta conciliar algo ou há dinheiro que ainda não caiu.`}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <label
            onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastando(false); const f = e.dataTransfer.files?.[0]; if (f) subir(f) }}
            className={`flex items-center gap-4 rounded-[24px] border-2 border-dashed px-6 py-5 cursor-pointer transition-colors ${arrastando ? 'border-marca bg-marca-suave' : 'border-border bg-card hover:border-marca/50'}`}
          >
            {enviando ? <span className="w-11 h-11 rounded-xl grid place-items-center bg-marca-suave text-marca-texto shrink-0"><Loader2 className="w-5 h-5 animate-spin" /></span> : <Chip icone={FileUp} tom="marca" tamanho="lg" />}
            <div className="text-sm">
              <p className="font-display text-[16px] font-semibold text-foreground">{enviando ? 'Lendo o extrato…' : 'Subir extrato'}</p>
              <p className="t-legenda mt-0.5">Arraste ou clique: PDF do Santander Empresas ou do Nubank PJ, ou arquivo OFX. Pode subir o mesmo período de novo, a Central não duplica.</p>
            </div>
            <input type="file" accept=".pdf,.ofx,application/pdf" className="hidden" disabled={enviando} onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); e.target.value = '' }} />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {d.contas.length === 0 && <p className="t-legenda">Nenhum extrato ainda. Suba o primeiro acima.</p>}
            {d.contas.map((c) => (
              <button key={c.conta} type="button" onClick={() => setConta(conta === c.conta ? '' : c.conta)} aria-pressed={conta === c.conta} className={`text-left rounded-[20px] border p-5 transition-colors ${conta === c.conta ? 'border-marca/40 bg-marca-suave' : 'border-border bg-card hover:border-marca/30'}`}>
                <div className="flex items-center gap-3"><Chip icone={Landmark} tom={conta === c.conta ? 'marca' : 'neutro'} /><p className="font-display font-semibold text-[15px] text-foreground truncate">{c.conta}</p></div>
                <p className="t-legenda mt-3">Conciliado até <strong className={c.conciliadoAte === c.cobertoAte ? 'text-success' : 'text-warning'}>{br(c.conciliadoAte)}</strong> · extrato até {br(c.cobertoAte)}</p>
                <p className="t-legenda">{c.pendentes} pendente(s) · {c.conciliadas} conciliada(s) · {c.ignoradas} ignorada(s){c.saldoBancoCents !== null ? ` · saldo ${brl(c.saldoBancoCents)}` : ''}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {aviso && <p className="text-[13px] font-medium text-foreground bg-info-suave border border-info/20 rounded-2xl px-4 py-3">{aviso}</p>}

      <section className="rounded-[24px] border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] overflow-hidden">
        <div className="flex items-start justify-between gap-3 flex-wrap px-6 pt-6 pb-4">
          <div className="min-w-0">
            <Sobretitulo>Extrato</Sobretitulo>
            <h2 className="mt-1 font-display text-[21px] font-semibold tracking-[-0.01em] text-foreground">Linhas do banco</h2>
            <p className="t-legenda mt-0.5">{conta ? `Só ${conta}` : 'Todas as contas'} · <Numero className="text-[12px]">{d.linhas.length}</Numero> linha(s)</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Pilulas rotulo="Situação das linhas" valor={status} aoMudar={setStatus} opcoes={FILTROS.map(([v, rotulo]) => ({ valor: v as string, rotulo }))} />
            <button type="button" onClick={reconciliar} disabled={enviando} className="h-9 px-3 inline-flex items-center gap-1.5 rounded-xl border border-border bg-card text-[12.5px] font-semibold text-foreground hover:border-marca/40 hover:text-marca-texto disabled:opacity-50">
              <RefreshCw className="w-3.5 h-3.5" /> Conciliar de novo
            </button>
          </div>
        </div>

        <div className="border-t border-border divide-y divide-border">
        {d.linhas.length === 0 && <p className="t-legenda px-6 py-14 text-center">{status === 'PENDENTE' ? 'Nada pendente. Tudo conciliado.' : 'Nenhuma linha.'}</p>}
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
      </section>
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
    <div className="px-6 py-4 hover:bg-secondary/30 transition-colors">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium text-foreground truncate"><span className="text-muted-foreground font-normal tabular-nums mr-2">{br(l.data)}</span>{l.descricao}</p>
          <p className="t-legenda truncate">{l.conta}{l.documento ? ` · doc ${l.documento}` : ''}</p>
        </div>
        <span className={`font-display text-[15px] font-semibold tabular-nums shrink-0 ${entra ? 'text-success' : 'text-destructive-texto'}`}>{brl(l.valorCents)}</span>
      </div>

      {l.status === 'CONCILIADO' && (
        <div className="mt-1.5 flex items-start gap-2 text-xs">
          <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" />
          <span className="text-muted-foreground flex-1">
            {l.auto ? 'A Central casou com ' : 'Casada com '}
            {l.movimentos.map((m) => `${m.description} (${brl(m.amountCents)} em ${br(m.dia)})`).join(' + ')}
            {l.diferencaCents !== 0 && <span className="text-warning font-medium"> · diferença de {brl(l.diferencaCents)}</span>}
          </span>
          <button type="button" disabled={ocupada} onClick={() => onAgir({ acao: 'desfazer' })} className="inline-flex items-center gap-1 text-muted-foreground hover:text-marca-texto"><Undo2 className="w-3 h-3" />Desfazer</button>
        </div>
      )}
      {l.status === 'IGNORADO' && (
        <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex-1">{MOTIVO[l.motivo ?? 'OUTRO']}{l.auto ? ' (a Central lembrou)' : ''}</span>
          <button type="button" disabled={ocupada} onClick={() => onAgir({ acao: 'desfazer' })} className="inline-flex items-center gap-1 hover:text-marca-texto"><Undo2 className="w-3 h-3" />Desfazer</button>
        </div>
      )}

      {l.status === 'PENDENTE' && (
        <div className="mt-2 space-y-2">
          {sug?.daCasa && <p className="t-legenda">Pix com o CNPJ da própria VEX: costuma ser transferência entre contas ou saque do Asaas.</p>}
          <div className="flex flex-wrap gap-1.5">
            {sug?.movimentos.map((m) => (
              <button key={m.id} type="button" disabled={ocupada} onClick={() => onAgir({ acao: 'vincular', movimentos: [m.id] })} className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 text-[12px] font-medium text-primary hover:bg-primary/10 max-w-full">
                <Link2 className="w-3 h-3 shrink-0" /><span className="truncate">{m.description} · {brl(m.amountCents)} · {br(m.dia)}</span>
              </button>
            ))}
            <button type="button" onClick={onAbrir} className="h-8 px-3 rounded-lg border border-border bg-card text-[12px] font-semibold text-foreground hover:border-marca/40 hover:text-marca-texto">{aberta ? 'Fechar' : 'Lançar no caixa'}</button>
            <button type="button" disabled={ocupada} onClick={() => onAgir({ acao: 'ignorar', motivo: 'INTERNA' })} className="h-8 px-3 rounded-lg border border-border bg-card text-[12px] text-muted-foreground hover:text-foreground hover:border-subtle">Entre contas / Asaas</button>
            <button type="button" disabled={ocupada} onClick={() => onAgir({ acao: 'ignorar', motivo: 'PESSOAL', lembrar: true })} className="h-8 px-3 rounded-lg border border-border bg-card text-[12px] text-muted-foreground hover:text-foreground hover:border-subtle" title="A Central lembra desta contraparte e ignora as próximas sozinha">Pessoal do Davi</button>
            <button type="button" disabled={ocupada} onClick={() => onAgir({ acao: 'ignorar', motivo: 'OUTRO' })} className="h-8 px-3 rounded-lg text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground">Ignorar</button>
          </div>

          {aberta && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[150px_minmax(0,1fr)_170px_170px_auto] gap-2 items-end rounded-2xl bg-secondary/60 border border-border p-3">
              <label className="text-[11px] font-semibold text-muted-foreground">Tipo
                <select value={kind} onChange={(e) => setKind(e.target.value)} className="mt-0.5 h-9 w-full rounded-lg border border-border bg-card px-2 text-xs text-foreground outline-none focus:border-marca">
                  {(entra ? [['ENTRADA', 'Entrada'], ['APORTE', 'Aporte de sócio']] : [['SAIDA', 'Saída'], ['RETIRADA', 'Retirada de sócio']]).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                </select>
              </label>
              <label className="text-[11px] font-semibold text-muted-foreground">Descrição
                <input value={descricao} onChange={(e) => setDescricao(e.target.value)} className="mt-0.5 h-9 w-full rounded-lg border border-border bg-card px-2 text-xs text-foreground outline-none focus:border-marca" />
              </label>
              {comSocio ? (
                <label className="text-[11px] font-semibold text-muted-foreground">Sócio
                  <select value={socio} onChange={(e) => setSocio(e.target.value)} className="mt-0.5 h-9 w-full rounded-lg border border-border bg-card px-2 text-xs text-foreground outline-none focus:border-marca">
                    <option value="">Escolha</option>
                    {socios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
              ) : <span className="hidden lg:block" />}
              <label className="text-[11px] font-semibold text-muted-foreground">Categoria
                <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="mt-0.5 h-9 w-full rounded-lg border border-border bg-card px-2 text-xs text-foreground outline-none focus:border-marca">
                  <option value="">Sem categoria</option>
                  {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-muted-foreground inline-flex items-center gap-1 whitespace-nowrap" title="Da próxima vez, a Central sugere o mesmo para esta contraparte">
                  <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} /> lembrar
                </label>
                <button type="button" disabled={ocupada || !descricao.trim() || (comSocio && !socio)} onClick={() => onAgir({ acao: 'lancar', kind, descricao, categoria, partnerId: socio || null, lembrar })} className="h-9 px-3.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary-hover text-xs font-semibold disabled:opacity-50">Lançar</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
