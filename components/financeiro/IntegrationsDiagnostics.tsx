'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'

interface Diag {
  asaas: {
    env: string
    keyConfigured: boolean
    webhookTokenConfigured: boolean
    connection: { ok: boolean; error?: string }
    webhookUrl: string
    webhookRegistered: boolean
  }
  focus: {
    env: string
    mode: string
    tokenConfigured: boolean
    webhookTokenConfigured: boolean
    connection: { ok: boolean; error?: string }
    webhookUrl: string
    webhookRegistered: boolean
  }
  fiscal: { ready: boolean; missing: string[] }
  cron: { lastRun: string | null; active: boolean }
  lastWebhookEvent: { provider: string; type: string | null; createdAt: string } | null
  clients: {
    billingEnabled: number
    readyForBilling: number
    incomplete: Array<{ id: string; name: string; missing: string[] }>
  }
  errors: { charges: number; nfse: number }
}

function Flag({ ok, warn }: { ok: boolean; warn?: boolean }) {
  if (ok) return <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
  if (warn) return <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
  return <XCircle className="w-4 h-4 text-red-500 shrink-0" />
}

/** Diagnóstico admin: tudo roda no backend; nenhum token aparece aqui. */
export default function IntegrationsDiagnostics() {
  const [diag, setDiag] = useState<Diag | null>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/integracoes/diagnostico')
      .then((r) => (r.ok ? r.json() : null))
      .then(setDiag)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function registerWebhook(provider: 'asaas' | 'focus') {
    setBusy(provider)
    setMsg(null)
    try {
      const res = await fetch('/api/integracoes/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      })
      const body = await res.json().catch(() => ({}))
      setMsg(res.ok
        ? body.created ? `Webhook ${provider} registrado.` : `Webhook ${provider} já estava registrado.`
        : body.error || 'Falha ao registrar.')
      load()
    } finally {
      setBusy(null)
    }
  }

  if (loading && !diag) {
    return <div className="max-w-3xl space-y-3 animate-pulse">{[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl" />)}</div>
  }
  if (!diag) return <p className="text-sm text-gray-400">Não foi possível carregar o diagnóstico.</p>

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        {msg ? <p className="text-xs font-medium text-gray-700">{msg}</p> : <span />}
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#030A8C] font-medium">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      {/* Asaas */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 space-y-2 text-sm">
        <p className="font-bold text-gray-900">Asaas</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-gray-700">
          <p className="flex items-center gap-2"><Flag ok={diag.asaas.env === 'sandbox'} warn={diag.asaas.env === 'production'} /> Ambiente: <b>{diag.asaas.env}</b></p>
          <p className="flex items-center gap-2"><Flag ok={diag.asaas.keyConfigured} /> API Key configurada</p>
          <p className="flex items-center gap-2"><Flag ok={diag.asaas.connection.ok} /> Conexão {diag.asaas.connection.error ? `— ${diag.asaas.connection.error}` : 'OK'}</p>
          <p className="flex items-center gap-2"><Flag ok={diag.asaas.webhookTokenConfigured} /> Token do webhook configurado</p>
          <p className="flex items-center gap-2 sm:col-span-2">
            <Flag ok={diag.asaas.webhookRegistered} warn />
            Webhook registrado
            {!diag.asaas.webhookRegistered && diag.asaas.keyConfigured && diag.asaas.webhookTokenConfigured && (
              <button onClick={() => registerWebhook('asaas')} disabled={busy === 'asaas'}
                className="ml-2 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-[#030A8C] text-white hover:bg-[#02077a] disabled:opacity-50">
                {busy === 'asaas' ? 'Registrando...' : 'Registrar agora'}
              </button>
            )}
          </p>
          <p className="sm:col-span-2 text-xs text-gray-400 break-all">URL: {diag.asaas.webhookUrl}</p>
        </div>
      </div>

      {/* Focus */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 space-y-2 text-sm">
        <p className="font-bold text-gray-900">Focus NFe</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-gray-700">
          <p className="flex items-center gap-2"><Flag ok={diag.focus.env === 'homologacao'} warn={diag.focus.env === 'producao'} /> Ambiente: <b>{diag.focus.env}</b></p>
          <p className="flex items-center gap-2"><Flag ok /> Modo: <b>{diag.focus.mode === 'national' ? 'Nacional (/v2/nfsen)' : 'Municipal (/v2/nfse)'}</b></p>
          <p className="flex items-center gap-2"><Flag ok={diag.focus.tokenConfigured} /> Token do ambiente configurado</p>
          <p className="flex items-center gap-2"><Flag ok={diag.focus.connection.ok} /> Conexão {diag.focus.connection.error ? `— ${diag.focus.connection.error}` : 'OK'}</p>
          <p className="flex items-center gap-2 sm:col-span-2">
            <Flag ok={diag.focus.webhookRegistered} warn />
            Gatilho registrado
            {!diag.focus.webhookRegistered && diag.focus.tokenConfigured && diag.focus.webhookTokenConfigured && (
              <button onClick={() => registerWebhook('focus')} disabled={busy === 'focus'}
                className="ml-2 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-[#030A8C] text-white hover:bg-[#02077a] disabled:opacity-50">
                {busy === 'focus' ? 'Registrando...' : 'Registrar agora'}
              </button>
            )}
          </p>
          <p className="sm:col-span-2 text-xs text-gray-400 break-all">URL: {diag.focus.webhookUrl}</p>
        </div>
      </div>

      {/* Fiscal + cron + eventos */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 space-y-1.5 text-sm text-gray-700">
        <p className="font-bold text-gray-900 mb-1">Sistema</p>
        <p className="flex items-center gap-2">
          <Flag ok={diag.fiscal.ready} />
          Configuração fiscal {diag.fiscal.ready ? 'completa' : `incompleta — falta: ${diag.fiscal.missing.join(', ')}`}
        </p>
        <p className="flex items-center gap-2"><Flag ok={diag.cron.active} /> Cron diário {diag.cron.lastRun ? `— última execução ${diag.cron.lastRun}` : 'nunca executou'}</p>
        <p className="flex items-center gap-2">
          <Flag ok={!!diag.lastWebhookEvent} warn />
          Último webhook: {diag.lastWebhookEvent
            ? `${diag.lastWebhookEvent.provider} · ${diag.lastWebhookEvent.type ?? '—'} · ${new Date(diag.lastWebhookEvent.createdAt).toLocaleString('pt-BR')}`
            : 'nenhum recebido ainda'}
        </p>
        <p className="flex items-center gap-2"><Flag ok={diag.errors.charges === 0} /> Cobranças com erro: {diag.errors.charges}</p>
        <p className="flex items-center gap-2"><Flag ok={diag.errors.nfse === 0} /> Notas com erro: {diag.errors.nfse}</p>
        <p className="flex items-center gap-2"><Flag ok /> Cobrança automática ativa em {diag.clients.billingEnabled} cliente(s) · {diag.clients.readyForBilling} apto(s)</p>
      </div>

      {/* Cadastros incompletos */}
      {diag.clients.incomplete.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 text-sm">
          <p className="font-bold text-gray-900 mb-2">Clientes com cadastro incompleto para cobrança</p>
          <div className="space-y-1">
            {diag.clients.incomplete.map((c) => (
              <p key={c.id} className="text-xs text-gray-600">
                <b>{c.name}</b> — falta: {c.missing.join(', ')}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
