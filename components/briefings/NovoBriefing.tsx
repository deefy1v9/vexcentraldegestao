'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/vex/button'
import { Input } from '@/components/vex/input'

/** Cria um briefing novo, do zero ou copiando as perguntas de outro. */
export default function NovoBriefing({ modelos }: { modelos: Array<{ id: string; name: string }> }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState('')
  const [copiarDe, setCopiarDe] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErro('')
    const res = await fetch('/api/briefings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nome, copiarDe }) })
    const data = await res.json().catch(() => ({}))
    setSalvando(false)
    if (!res.ok) { setErro(data.error ?? 'Não foi possível criar.'); return }
    router.push(`/briefings/${data.id}`)
  }

  if (!aberto) return <Button onClick={() => setAberto(true)}><Plus /> Novo briefing</Button>
  return (
    <form onSubmit={criar} className="w-full rounded-[12px] border border-border bg-card p-4 flex flex-col sm:flex-row gap-2 sm:items-end">
      <label className="flex-1 text-xs text-muted-foreground">Nome
        <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Onboarding · SEO" autoFocus className="mt-1" />
      </label>
      <label className="sm:w-64 text-xs text-muted-foreground">Começar com as perguntas de
        <select value={copiarDe} onChange={(e) => setCopiarDe(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border bg-input px-2 text-[13.5px]">
          <option value="">Nenhum (do zero)</option>
          {modelos.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </label>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={() => setAberto(false)}>Cancelar</Button>
        <Button type="submit" disabled={salvando || !nome.trim()}>{salvando && <Loader2 className="animate-spin" />} Criar</Button>
      </div>
      {erro && <p className="text-sm text-destructive sm:basis-full">{erro}</p>}
    </form>
  )
}
