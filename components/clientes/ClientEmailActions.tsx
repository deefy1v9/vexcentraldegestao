'use client'

import { useEffect, useRef, useState } from 'react'
import { Mail, ChevronDown, Sparkles, ClipboardList, CalendarClock, Megaphone } from 'lucide-react'

type Kind = 'welcome' | 'complete-profile' | 'contract-ending' | 'announcement'

const ITEMS: Array<{ kind: Kind; label: string; icon: React.ElementType; confirm: string }> = [
  { kind: 'welcome', label: 'Boas-vindas', icon: Sparkles, confirm: 'Enviar o e-mail de boas-vindas para este cliente?' },
  { kind: 'complete-profile', label: 'Completar cadastro', icon: ClipboardList, confirm: 'Pedir ao cliente os dados fiscais que faltam?' },
  { kind: 'contract-ending', label: 'Renovação de contrato', icon: CalendarClock, confirm: 'Enviar o aviso de término de contrato?' },
]

/**
 * "Enviar e-mail" no perfil do cliente (admin): boas-vindas, pedido de
 * cadastro, aviso de contrato e comunicado livre — todos no layout da marca,
 * pelo remetente contato@. O backend valida destinatário e conteúdo.
 */
export default function ClientEmailActions({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [open, setOpen] = useState(false)
  const [modal, setModal] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [ctaLabel, setCtaLabel] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 6000)
    return () => clearTimeout(t)
  }, [msg])

  async function send(kind: Kind, extra?: Record<string, string>) {
    setBusy(kind)
    setMsg(null)
    try {
      const res = await fetch(`/api/clientes/${clientId}/emails`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, ...extra }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.ok) {
        setMsg({ ok: true, text: 'E-mail enviado.' })
        setModal(false)
        setTitle(''); setMessage(''); setCtaLabel(''); setCtaUrl('')
      } else {
        setMsg({ ok: false, text: body.error || 'Não foi possível enviar.' })
      }
    } catch {
      setMsg({ ok: false, text: 'Falha de conexão.' })
    } finally {
      setBusy(null)
      setOpen(false)
    }
  }

  return (
    <div className="relative inline-flex items-center gap-2" ref={ref}>
      {msg && (
        <span className={`text-xs font-medium ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</span>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:border-[#030A8C] hover:text-[#030A8C] transition-colors"
      >
        <Mail className="w-3.5 h-3.5" />
        Enviar e-mail
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-100 rounded-xl shadow-lg z-30 py-1 overflow-hidden">
          {ITEMS.map((it) => (
            <button
              key={it.kind}
              type="button"
              disabled={busy != null}
              onClick={() => { if (confirm(it.confirm)) void send(it.kind) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors text-left"
            >
              <it.icon className="w-4 h-4 text-gray-400" />
              {busy === it.kind ? 'Enviando...' : it.label}
            </button>
          ))}
          <div className="border-t border-gray-100 my-1" />
          <button
            type="button"
            onClick={() => { setOpen(false); setModal(true) }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
          >
            <Megaphone className="w-4 h-4 text-gray-400" />
            Comunicado…
          </button>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90dvh] overflow-y-auto p-4 sm:p-6 shadow-xl space-y-3">
            <div>
              <p className="font-semibold text-gray-900">Comunicado para {clientName}</p>
              <p className="text-xs text-gray-500 mt-0.5">Sai pelo remetente contato@ no layout da marca.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Título *</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" maxLength={120} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Mensagem *</label>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} className="input" rows={6} maxLength={4000} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Texto do botão (opcional)</label>
                <input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} className="input" maxLength={40} placeholder="Ex: Ver novidade" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Link do botão</label>
                <input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} className="input" placeholder="https://..." />
              </div>
            </div>
            {msg && !msg.ok && <p className="text-xs text-red-600">{msg.text}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setModal(false)} disabled={busy != null} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50">
                Cancelar
              </button>
              <button
                type="button"
                disabled={!title.trim() || !message.trim() || busy != null || (!!ctaLabel !== !!ctaUrl)}
                onClick={() => send('announcement', { title, message, ctaLabel, ctaUrl })}
                className="px-4 py-2 bg-[#030A8C] text-white rounded-lg text-sm font-semibold hover:bg-[#02077a] disabled:opacity-40 transition-colors"
              >
                {busy ? 'Enviando...' : 'Enviar comunicado'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
