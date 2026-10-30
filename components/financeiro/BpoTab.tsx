'use client'

import { useEffect, useState } from 'react'
import VersaoB from './bpo/VersaoB'
import type { BpoData } from './bpo/shared'

/**
 * BPO financeiro: carrega os números da competência e mostra o painel
 * (layout do modelo Invenza, escolhido pelo Antonio em 30/10).
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
  if (atual?.erro) return <p className="mt-3 t-corpo font-medium text-destructive bg-destructive/10 rounded-lg px-4 py-3 text-center">{atual.erro}</p>
  if (!atual?.dados) {
    return (
      <div className="space-y-4 animate-pulse py-4">
        <div className="h-24 rounded-2xl bg-card" />
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-5">{[...Array(4)].map((_, i) => <div key={i} className="h-36 rounded-2xl bg-card" />)}</div>
        <div className="h-80 rounded-2xl bg-card" />
      </div>
    )
  }
  return <VersaoB d={atual.dados} onSalvo={() => setVersao((v) => v + 1)} />
}
