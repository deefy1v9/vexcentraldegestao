'use client'

import { useState } from 'react'
import { Check, Link2 } from 'lucide-react'

/** Copia o link completo (com o endereço da Central) para mandar ao cliente. */
export default function CopiarLink({ caminho, rotulo = 'Copiar link' }: { caminho: string; rotulo?: string }) {
  const [ok, setOk] = useState(false)
  async function copiar() {
    const url = `${window.location.origin}${caminho}`
    try { await navigator.clipboard.writeText(url) } catch { window.prompt('Copie o link:', url); return }
    setOk(true)
    setTimeout(() => setOk(false), 1800)
  }
  return (
    <button type="button" onClick={copiar} className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary-hover">
      {ok ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
      {ok ? 'Copiado' : rotulo}
    </button>
  )
}
