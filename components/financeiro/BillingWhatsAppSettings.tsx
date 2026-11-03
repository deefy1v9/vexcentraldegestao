'use client'

import { useEffect, useState } from 'react'
import { MessageCircle, Check } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface Confirmation {
  id: string
  code: string
  year: number
  month: number
  amount: number
  status: string
  sentAt: string
  respondedByName?: string | null
  respondedAt?: string | null
  receivedAccount?: string | null
  client: { name: string }
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  AGUARDANDO: { label: 'Aguardando resposta', cls: 'bg-warning-suave text-warning' },
  AGUARDANDO_VALOR: { label: 'Aguardando valor', cls: 'bg-info-suave text-info' },
  AGUARDANDO_CONTA: { label: 'Aguardando conta', cls: 'bg-info-suave text-info' },
  CONFIRMADO: { label: 'Pago', cls: 'bg-success-suave text-success' },
  PARCIAL: { label: 'Pago parcialmente', cls: 'bg-secondary text-foreground' },
}

/**
 * Configuração e histórico da confirmação de recebimentos via WhatsApp.
 * A pergunta é enviada aos administradores dois dias antes do vencimento.
 */
export default function BillingWhatsAppSettings() {
  const [time, setTime] = useState('09:00')
  const [account, setAccount] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [history, setHistory] = useState<Confirmation[]>([])

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : {}))
      .then((s: Record<string, string>) => {
        if (s.BILLING_REMINDER_TIME) setTime(s.BILLING_REMINDER_TIME)
        if (s.DEFAULT_RECEIVING_ACCOUNT) setAccount(s.DEFAULT_RECEIVING_ACCOUNT)
      })
      .catch(() => {})
    fetch('/api/financeiro/cobrancas')
      .then((r) => (r.ok ? r.json() : []))
      .then(setHistory)
      .catch(() => {})
  }, [])

  async function save() {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          BILLING_REMINDER_TIME: time || '09:00',
          DEFAULT_RECEIVING_ACCOUNT: account,
        }),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } finally {
      setSaving(false)
    }
  }

  const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <MessageCircle className="w-4 h-4 text-marca-texto" />
        <p className="font-semibold text-foreground text-sm">Confirmação de recebimento via WhatsApp</p>
      </div>
      <div className="p-4 space-y-4">
        <p className="text-xs text-muted-foreground">
          Dois dias antes de cada vencimento, os administradores recebem no WhatsApp a pergunta
          de confirmação. A primeira resposta registra o pagamento — sem duplicar.
        </p>

        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Horário do envio diário</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="input text-sm !w-auto" />
          </div>
          <div className="flex-1 sm:min-w-[220px]">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Conta padrão para recebimentos confirmados pelo WhatsApp
            </label>
            <input
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              className="input text-sm"
              placeholder="Ex: Conta PJ Inter — se vazio, o WhatsApp pergunta a conta"
            />
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary-hover disabled:opacity-50 transition-colors"
          >
            {saved ? <Check className="w-3.5 h-3.5" /> : null}
            {saving ? 'Salvando...' : saved ? 'Salvo' : 'Salvar'}
          </button>
        </div>

        {history.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">Últimas cobranças enviadas</p>
            <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
              {history.slice(0, 6).map((c) => {
                const st = STATUS_LABEL[c.status] ?? { label: c.status, cls: 'bg-secondary text-muted-foreground' }
                return (
                  <div key={c.id} className="flex items-center justify-between px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        {c.client.name} · {MONTHS[c.month - 1]}/{c.year} · #{c.code}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {c.respondedByName
                          ? `${c.respondedByName}${c.receivedAccount ? ` · ${c.receivedAccount}` : ''}`
                          : 'Sem resposta ainda'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-xs font-bold text-foreground">{formatCurrency(c.amount)}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
