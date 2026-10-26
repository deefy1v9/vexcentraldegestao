'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowLeft, Copy, Eye, Loader2, Lock, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/vex/button'
import SearchSelect from '@/components/ui/SearchSelect'
import { ehSensivel, respostasEmTexto, type Pergunta } from '@/lib/briefing-core'

interface Resposta {
  id: string; briefing: string; briefingId: string; cliente: { id: string; name: string } | null
  empresa: string | null; pessoa: string | null; email: string | null; criadaEm: string
  alertas: string[]; resumo: string | null; resumoEm: string | null
  perguntas: Pergunta[]; respostas: Record<string, string | string[]>
}

const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/**
 * A resposta do cliente, pergunta por pergunta, com o resumo da IA, os
 * avisos e a ligação com o cadastro. Campo sensível só aparece quando alguém
 * clica em "ver" (e a Central registra quem viu).
 */
export default function VerResposta({ resposta: r, clientes }: { resposta: Resposta; clientes: Array<{ id: string; name: string }> }) {
  const router = useRouter()
  const [reveladas, setReveladas] = useState<Record<string, string>>({})
  const [resumo, setResumo] = useState(r.resumo)
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState('')
  const [clienteId, setClienteId] = useState(r.cliente?.id ?? '')
  const [copiado, setCopiado] = useState(false)

  async function revelar(pid: string) {
    const res = await fetch(`/api/briefings/respostas/${r.id}?revelar=${encodeURIComponent(pid)}`)
    const data = await res.json().catch(() => ({}))
    if (res.ok) setReveladas((x) => ({ ...x, [pid]: data.valor }))
  }

  async function gerarResumo() {
    setGerando(true)
    setErro('')
    const res = await fetch(`/api/briefings/respostas/${r.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'resumo' }) })
    const data = await res.json().catch(() => ({}))
    setGerando(false)
    if (!res.ok) { setErro(data.error ?? 'Não foi possível gerar o resumo.'); return }
    setResumo(data.summary)
  }

  async function ligarCliente(id: string) {
    setClienteId(id)
    await fetch(`/api/briefings/respostas/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: id || null }) })
    router.refresh()
  }

  async function marcarNaoLida() {
    await fetch(`/api/briefings/respostas/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lida: false }) })
    router.push('/briefings?aba=respostas')
  }

  async function apagar() {
    if (!confirm('Apagar esta resposta de vez? Não dá para desfazer.')) return
    await fetch(`/api/briefings/respostas/${r.id}`, { method: 'DELETE' })
    router.push('/briefings?aba=respostas')
    router.refresh()
  }

  async function copiarTudo() {
    const texto = `${r.briefing}\n${r.cliente?.name ?? r.empresa ?? ''}\n\n${respostasEmTexto(r.perguntas, r.respostas)}`
    await navigator.clipboard.writeText(texto).catch(() => undefined)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 1800)
  }

  return (
    <div className="grid xl:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
      <div className="space-y-4 min-w-0">
        <Link href="/briefings?aba=respostas" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Respostas</Link>

        {r.alertas.length > 0 && (
          <div className="rounded-[12px] border border-warning/40 bg-warning-suave p-4 space-y-1">
            {r.alertas.map((a) => <p key={a} className="text-sm text-foreground flex gap-2"><AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" /> {a}</p>)}
          </div>
        )}

        <div className="rounded-[12px] border border-border bg-card divide-y divide-border">
          {r.perguntas.map((p) => {
            if (p.tipo === 'secao') return <p key={p.id} className="px-4 pt-4 pb-2 t-secao text-foreground bg-secondary/40">{p.titulo}</p>
            const v = r.respostas[p.id]
            const vazio = v === undefined || v === '' || (Array.isArray(v) && v.length === 0)
            return (
              <div key={p.id} className="px-4 py-3">
                <p className="text-xs text-muted-foreground">{p.titulo}</p>
                {vazio ? (
                  <p className="text-sm text-subtle italic">sem resposta</p>
                ) : ehSensivel(p) ? (
                  reveladas[p.id] !== undefined ? (
                    <p className="text-sm text-foreground font-mono break-all">{reveladas[p.id]}</p>
                  ) : (
                    <button type="button" onClick={() => revelar(p.id)} className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-link hover:underline">
                      <Lock className="w-3.5 h-3.5" /> •••••• <Eye className="w-3.5 h-3.5" /> ver
                    </button>
                  )
                ) : Array.isArray(v) ? (
                  <div className="mt-1 flex flex-wrap gap-1.5">{v.map((x) => <span key={x} className="text-xs rounded-full bg-secondary px-2 py-0.5 text-foreground">{x}</span>)}</div>
                ) : (
                  <p className="text-sm text-foreground whitespace-pre-line break-words">{p.tipo === 'data' ? new Date(`${v}T12:00:00Z`).toLocaleDateString('pt-BR') : v}</p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-0">
        <div className="rounded-[12px] border border-border bg-card p-4 space-y-3">
          <div>
            <p className="t-secao text-foreground">{r.briefing}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Respondido em {dataHora(r.criadaEm)}</p>
            {(r.pessoa || r.email || r.empresa) && (
              <p className="text-xs text-muted-foreground mt-1">{[r.empresa, r.pessoa, r.email].filter(Boolean).join(' · ')}</p>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Cliente</p>
            <SearchSelect options={clientes} value={clienteId} onChange={ligarCliente} placeholder="Ligar a um cliente" allLabel="Sem cliente" searchPlaceholder="Buscar cliente" shortLabel={false} />
            {r.cliente && <Link href={`/clientes/${r.cliente.id}`} className="text-xs text-link hover:underline">Abrir cadastro de {r.cliente.name}</Link>}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={copiarTudo}><Copy /> {copiado ? 'Copiado' : 'Copiar respostas'}</Button>
            <Button variant="ghost" size="sm" onClick={marcarNaoLida}>Marcar não lida</Button>
            <Button variant="ghost" size="sm" onClick={apagar} className="text-destructive"><Trash2 /> Apagar</Button>
          </div>
        </div>

        <div className="rounded-[12px] border border-border bg-card p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-ia" />
            <p className="t-secao text-foreground flex-1">Resumo</p>
            <Button variant="outline" size="sm" onClick={gerarResumo} disabled={gerando}>{gerando && <Loader2 className="animate-spin" />}{resumo ? 'Refazer' : 'Gerar com IA'}</Button>
          </div>
          {resumo ? (
            <p className="text-sm text-foreground whitespace-pre-line">{resumo}</p>
          ) : (
            <p className="text-xs text-muted-foreground">A IA lê as respostas e resume o essencial para a equipe, com o que faltou perguntar. Senhas e CPF não vão para a IA.</p>
          )}
          {erro && <p className="text-sm text-destructive">{erro}</p>}
        </div>
      </aside>
    </div>
  )
}
