'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, AlertTriangle } from 'lucide-react'

/**
 * Exclusão de cliente. A remoção é definitiva e leva junto pagamentos,
 * serviços, credenciais e o histórico de CRM — por isso o passo de
 * confirmação exige digitar o nome do cliente.
 */
export default function DeleteClientButton({
  clientId,
  clientName,
  variant = 'button',
}: {
  clientId: string
  clientName: string
  /** 'menu' renderiza como item de menu de contexto (largura total) */
  variant?: 'button' | 'menu'
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirmed = typed.trim().toLowerCase() === clientName.trim().toLowerCase()

  function close() {
    setOpen(false)
    setTyped('')
    setError(null)
  }

  async function handleDelete() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/clientes/${clientId}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error === 'Forbidden' ? 'Você não tem permissão para excluir clientes.' : 'Não foi possível excluir o cliente.')
        setBusy(false)
        return
      }
      close()
      router.refresh()
    } catch {
      setError('Falha de conexão. Tente de novo.')
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Excluir ${clientName}`}
        className={
          variant === 'menu'
            ? 'w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive-texto hover:bg-destructive-suave transition-colors text-left'
            : 'inline-flex items-center gap-1.5 px-3 py-1.5 bg-destructive-suave text-destructive-texto rounded-lg text-xs font-medium hover:bg-destructive hover:text-destructive-foreground transition-colors'
        }
      >
        <Trash2 className={variant === 'menu' ? 'w-4 h-4' : 'w-3 h-3'} />
        Excluir
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card border border-border rounded-[24px] w-full max-w-md max-h-[90dvh] overflow-y-auto p-6 shadow-xl">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-destructive-suave flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4 text-destructive-texto" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Excluir {clientName}?</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Esta ação não pode ser desfeita. Também serão apagados os pagamentos,
                  serviços, credenciais e o histórico de CRM deste cliente. As demandas e
                  eventos de calendário são mantidos, mas ficam sem cliente vinculado.
                </p>
              </div>
            </div>

            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Digite <span className="font-semibold text-foreground">{clientName}</span> para confirmar
            </label>
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-destructive text-foreground"
            />

            {error && <p className="text-xs text-destructive-texto mt-2">{error}</p>}

            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={close}
                disabled={busy}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!confirmed || busy}
                className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm font-semibold hover:brightness-95 disabled:opacity-40 disabled:hover:bg-destructive transition-colors"
              >
                {busy ? 'Excluindo...' : 'Excluir cliente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
