'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/vex/button'
import { Badge } from '@/components/vex/badge'
import SearchSelect from '@/components/ui/SearchSelect'
import CopiarLink from './CopiarLink'

interface Convite {
  id: string; token: string; cliente: string; criadoEm: string; abertoEm: string | null
  respostaId: string | null; respondidoEm: string | null
}

const dataBr = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })

/**
 * Link do briefing para um cliente: a resposta chega já ligada a ele e dá
 * para ver quem abriu e quem ainda não respondeu.
 */
export default function LinksPorCliente({ briefingId, ativo, clientes, convites }: {
  briefingId: string; ativo: boolean; clientes: Array<{ id: string; name: string }>; convites: Convite[]
}) {
  const router = useRouter()
  const [clienteId, setClienteId] = useState('')
  const [gerando, setGerando] = useState(false)
  const [novo, setNovo] = useState<{ token: string; reaproveitado: boolean } | null>(null)
  const [erro, setErro] = useState('')

  async function gerar() {
    setGerando(true)
    setErro('')
    const res = await fetch(`/api/briefings/${briefingId}/convites`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: clienteId }) })
    const data = await res.json().catch(() => ({}))
    setGerando(false)
    if (!res.ok) { setErro(data.error ?? 'Não foi possível gerar o link.'); return }
    setNovo({ token: data.token, reaproveitado: !!data.reaproveitado })
    router.refresh()
  }

  async function apagar(id: string) {
    if (!confirm('Apagar este link? O cliente não vai conseguir mais abrir.')) return
    await fetch(`/api/briefings/${briefingId}/convites?convite=${id}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <aside className="rounded-[12px] border border-border bg-card p-4 space-y-4 xl:sticky xl:top-0">
      <div>
        <p className="t-secao text-foreground">Link para um cliente</p>
        <p className="text-xs text-muted-foreground mt-0.5">A resposta já chega ligada ao cliente, e a Central mostra quem ainda não respondeu.</p>
      </div>
      {!ativo ? (
        <p className="text-sm text-muted-foreground">Ligue o briefing para gerar links.</p>
      ) : (
        <div className="space-y-2">
          <SearchSelect options={clientes} value={clienteId} onChange={(v) => { setClienteId(v); setNovo(null) }} placeholder="Escolher cliente" allLabel="Nenhum" searchPlaceholder="Buscar cliente" shortLabel={false} />
          <Button onClick={gerar} disabled={!clienteId || gerando} className="w-full">{gerando && <Loader2 className="animate-spin" />} Gerar link</Button>
          {novo && (
            <div className="rounded-lg bg-secondary p-3 space-y-2">
              <p className="text-xs text-muted-foreground">{novo.reaproveitado ? 'Esse cliente já tinha um link sem resposta; é o mesmo:' : 'Link pronto:'}</p>
              <p className="text-xs break-all text-foreground">{typeof window !== 'undefined' ? window.location.origin : ''}/b/{novo.token}</p>
              <CopiarLink caminho={`/b/${novo.token}`} />
            </div>
          )}
          {erro && <p className="text-sm text-destructive">{erro}</p>}
        </div>
      )}

      <div className="border-t border-border pt-3">
        <p className="t-rotulo text-muted-foreground mb-2">Links gerados ({convites.length})</p>
        {convites.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum ainda.</p>
        ) : (
          <ul className="space-y-2">
            {convites.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{c.cliente}</p>
                  <p className="text-[11px] text-muted-foreground">
                    criado {dataBr(c.criadoEm)}{c.abertoEm && !c.respondidoEm ? ` · abriu ${dataBr(c.abertoEm)}` : ''}
                  </p>
                </div>
                {c.respostaId ? (
                  <Link href={`/briefings/respostas/${c.respostaId}`}><Badge variant="success">Respondeu {dataBr(c.respondidoEm!)}</Badge></Link>
                ) : (
                  <>
                    <Badge variant={c.abertoEm ? 'info' : 'default'}>{c.abertoEm ? 'Abriu' : 'Aguardando'}</Badge>
                    <CopiarLink caminho={`/b/${c.token}`} rotulo="Copiar" />
                    <button type="button" onClick={() => apagar(c.id)} className="p-1.5 text-muted-foreground hover:text-destructive" aria-label={`Apagar o link de ${c.cliente}`}><Trash2 className="w-4 h-4" /></button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
