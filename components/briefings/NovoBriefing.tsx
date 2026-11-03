'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, X } from 'lucide-react'
import { Button } from '@/components/vex/button'
import { Input } from '@/components/vex/input'

/**
 * Cria um briefing novo, do zero ou copiando as perguntas de outro. O botão
 * fica no cabeçalho da página (a ação principal) e o formulário abre num
 * quadro por cima, para não empurrar a lista.
 */
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

  return (
    <>
      <Button onClick={() => setAberto(true)}><Plus /> Novo briefing</Button>
      {aberto && (
        <div className="fixed inset-0 z-50 bg-veu flex items-end sm:items-center sm:justify-center sm:p-4" onClick={() => setAberto(false)}>
          <form
            onSubmit={criar}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Novo briefing"
            className="w-full sm:max-w-md rounded-t-[24px] sm:rounded-[24px] border border-border bg-card shadow-xl"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="font-display text-[19px] font-semibold tracking-[-0.01em] text-foreground">Novo briefing</h3>
              <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" className="p-1.5 hover:bg-secondary rounded-lg"><X className="w-4 h-4 text-subtle" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <label className="block text-xs text-muted-foreground">Nome
                <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Onboarding · SEO" autoFocus className="mt-1" />
              </label>
              <label className="block text-xs text-muted-foreground">Começar com as perguntas de
                <select value={copiarDe} onChange={(e) => setCopiarDe(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border bg-input px-2 text-[13.5px] text-foreground">
                  <option value="">Nenhum (do zero)</option>
                  {modelos.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
              {erro && <p className="text-sm text-destructive-texto">{erro}</p>}
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
              <Button type="button" variant="ghost" onClick={() => setAberto(false)}>Cancelar</Button>
              <Button type="submit" disabled={salvando || !nome.trim()}>{salvando && <Loader2 className="animate-spin" />} Criar</Button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
