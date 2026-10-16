'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/vex/button'
import { Badge } from '@/components/vex/badge'

export interface EquipeLinha {
  id: string
  name: string
  color: string
  description: string | null
  active: boolean
  members: Array<{ user: { id: string; name: string } }>
  _count: { stages: number; tasks: number }
}

const CORES = ['#030A8C', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#7C3AED', '#EC4899', '#475467']

function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/)
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase()
}

/**
 * Equipes: quem assume as etapas de processo. Uma etapa pode ir para uma
 * equipe; com uma pessoa só, vai direto para ela; com mais, entra na fila e
 * alguém da equipe assume.
 */
export default function EquipesPanel({ equipes, pessoas }: { equipes: EquipeLinha[]; pessoas: Array<{ id: string; name: string }> }) {
  const router = useRouter()
  const [editando, setEditando] = useState<string | 'nova' | null>(null)
  const [nome, setNome] = useState('')
  const [cor, setCor] = useState(CORES[0])
  const [descricao, setDescricao] = useState('')
  const [membros, setMembros] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function abrir(e: EquipeLinha | null) {
    setEditando(e ? e.id : 'nova')
    setNome(e?.name ?? '')
    setCor(e?.color ?? CORES[equipes.length % CORES.length])
    setDescricao(e?.description ?? '')
    setMembros(e ? e.members.map((m) => m.user.id) : [])
    setErro(null)
  }

  async function salvar() {
    setBusy(true); setErro(null)
    const corpo = { name: nome, color: cor, description: descricao, memberIds: membros }
    const r = editando === 'nova'
      ? await fetch('/api/equipes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
      : await fetch(`/api/equipes/${editando}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
    const b = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErro(b.error || 'Não foi possível salvar.'); return }
    setEditando(null); router.refresh()
  }

  async function remover(e: EquipeLinha) {
    const msg = e._count.stages > 0
      ? `"${e.name}" está em ${e._count.stages} etapa(s) de processo. Ela será desativada, não apagada. Continuar?`
      : `Apagar a equipe "${e.name}"?`
    if (!confirm(msg)) return
    await fetch(`/api/equipes/${e.id}`, { method: 'DELETE' })
    setEditando(null); router.refresh()
  }

  const input = 'w-full h-9 px-3 rounded-lg border border-border bg-card t-corpo text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-3 items-start">
      <div className="grid sm:grid-cols-2 gap-3">
        {equipes.map((e) => (
          <button key={e.id} type="button" onClick={() => abrir(e)}
            className={`text-left rounded-[12px] border bg-card p-4 transition-colors ${editando === e.id ? 'border-marca ring-2 ring-marca/20' : 'border-border hover:border-subtle'}`}>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: e.color }} />
              <p className="t-secao text-foreground flex-1 truncate">{e.name}</p>
              {!e.active && <Badge variant="default">Desativada</Badge>}
            </div>
            {e.description && <p className="t-legenda mt-1 line-clamp-2">{e.description}</p>}
            <div className="mt-3 flex items-center gap-1">
              {e.members.slice(0, 6).map((m) => (
                <span key={m.user.id} title={m.user.name} className="w-7 h-7 rounded-full bg-secondary text-foreground text-[10px] font-semibold grid place-items-center">{iniciais(m.user.name)}</span>
              ))}
              {e.members.length === 0 && <span className="t-legenda text-warning">Sem ninguém: as etapas dela ficariam paradas</span>}
            </div>
            <p className="t-legenda mt-2">{e.members.length} pessoa(s) · em {e._count.stages} etapa(s) · {e._count.tasks} tarefa(s) agora</p>
          </button>
        ))}
        <button type="button" onClick={() => abrir(null)}
          className="rounded-[12px] border border-dashed border-subtle bg-card p-4 min-h-[132px] grid place-items-center text-muted-foreground hover:border-marca hover:text-marca-texto transition-colors">
          <span className="inline-flex items-center gap-1.5 t-corpo font-medium"><Plus className="w-4 h-4" /> Nova equipe</span>
        </button>
      </div>

      {editando ? (
        <section className="rounded-[12px] border border-border bg-card p-4 space-y-4">
          <p className="t-secao text-foreground">{editando === 'nova' ? 'Nova equipe' : 'Editar equipe'}</p>
          <label className="block"><span className="t-rotulo text-foreground mb-1.5 block">Nome</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Atendimento, Criação, Desenvolvimento" className={input} /></label>
          <label className="block"><span className="t-rotulo text-foreground mb-1.5 block">O que a equipe faz</span>
            <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Opcional" className={input} /></label>
          <div><span className="t-rotulo text-foreground mb-1.5 block">Cor</span>
            <div className="flex gap-1.5">
              {CORES.map((c) => (
                <button key={c} type="button" onClick={() => setCor(c)} aria-label={`Cor ${c}`} aria-pressed={cor === c}
                  className={`w-7 h-7 rounded-full ${cor === c ? 'ring-2 ring-offset-2 ring-offset-card ring-marca' : ''}`} style={{ background: c }} />
              ))}
            </div>
          </div>
          <div><span className="t-rotulo text-foreground mb-1.5 block">Quem participa</span>
            <div className="max-h-56 overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {pessoas.map((p) => (
                <label key={p.id} className="flex items-center gap-2.5 px-3 py-2 t-corpo text-foreground cursor-pointer hover:bg-accent">
                  <input type="checkbox" checked={membros.includes(p.id)} onChange={(e) => setMembros((l) => (e.target.checked ? [...l, p.id] : l.filter((x) => x !== p.id)))} className="w-4 h-4 accent-[var(--marca)]" />
                  {p.name}
                </label>
              ))}
            </div>
            <p className="t-legenda mt-1.5">Com uma pessoa, a etapa vai direto para ela. Com mais, entra na fila da equipe e alguém assume.</p>
          </div>
          {erro && <p className="t-rotulo text-destructive-texto bg-destructive-suave rounded-lg px-3 py-2">{erro}</p>}
          <div className="flex items-center gap-2">
            {editando !== 'nova' && (
              <Button type="button" variant="ghost" size="sm" onClick={() => { const e = equipes.find((x) => x.id === editando); if (e) remover(e) }} className="text-destructive-texto hover:text-destructive-texto">
                <Trash2 /> Remover
              </Button>
            )}
            <Button type="button" variant="outline" className="ml-auto" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button type="button" onClick={salvar} disabled={busy || !nome.trim()}>{busy && <Loader2 className="animate-spin" />} Salvar</Button>
          </div>
        </section>
      ) : (
        <section className="rounded-[12px] border border-border bg-card p-4">
          <Users className="w-5 h-5 text-muted-foreground" />
          <p className="t-secao text-foreground mt-2">Como funcionam as equipes</p>
          <p className="t-corpo text-muted-foreground mt-1">
            No processo, cada etapa diz quem assume. Mandando para uma equipe, a tarefa aparece em &ldquo;Minhas tarefas&rdquo; de todos dela até alguém clicar em <span className="font-medium text-foreground">Assumir</span>. Todos recebem o aviso no WhatsApp.
          </p>
        </section>
      )}
    </div>
  )
}
