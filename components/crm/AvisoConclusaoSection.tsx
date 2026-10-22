'use client'
import { useEffect, useState } from 'react'
import { BellRing, Check, Loader2 } from 'lucide-react'

/**
 * Liga/desliga geral do aviso de demanda concluída no grupo do cliente.
 * Desligado, nenhum cliente é avisado, mesmo com o aviso ligado no cadastro.
 */
export default function AvisoConclusaoSection() {
  const [ligado, setLigado] = useState<boolean | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)

  useEffect(() => {
    fetch('/api/settings')
      .then(async (r) => (r.ok ? ((await r.json()) as Record<string, string>) : {}))
      .then((d) => setLigado(d.AVISO_CONCLUSAO_CLIENTE === 'on'))
      .catch(() => setLigado(false))
  }, [])

  async function alternar(v: boolean) {
    setSalvando(true)
    const r = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ AVISO_CONCLUSAO_CLIENTE: v ? 'on' : 'off' }),
    }).catch(() => null)
    setSalvando(false)
    if (r?.ok) {
      setLigado(v)
      setSalvo(true)
      setTimeout(() => setSalvo(false), 2500)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
        <BellRing className="w-3.5 h-3.5 text-[#030A8C]" />
        Aviso de demanda concluída
      </p>
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={!!ligado}
          disabled={ligado === null || salvando}
          onChange={(e) => alternar(e.target.checked)}
          className="mt-0.5 accent-[#030A8C]"
        />
        <span className="min-w-0">
          <span className="block text-xs text-gray-700 font-medium flex items-center gap-1.5">
            Avisar o grupo do cliente quando a demanda for concluída
            {salvando && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
            {salvo && <Check className="w-3 h-3 text-green-600" />}
          </span>
          <span className="block text-[10px] text-gray-400 leading-snug">
            Vale só para os clientes com o aviso ligado e o grupo escolhido no cadastro. Cada demanda avisa uma vez.
          </span>
        </span>
      </label>
    </div>
  )
}
