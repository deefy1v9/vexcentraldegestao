'use client'

import { useEffect, useState } from 'react'
import { Mail, CheckCircle2, XCircle, AlertTriangle, Send } from 'lucide-react'

interface DnsReport {
  spf: boolean
  dkim: boolean
  dkimSelector: string | null
  dmarc: boolean
  missing: string[]
}

interface TestResult {
  sent: boolean
  from?: string
  profile?: string
  providerResponse?: string
  error?: string
  dns?: DnsReport
}

const EMPTY = {
  SMTP_HOST: '',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  SMTP_USER: '',
  SMTP_PASS: '',
  SMTP_CONTATO_USER: '',
  SMTP_CONTATO_PASS: '',
  MAIL_FROM_FINANCEIRO: 'VEX Growth Financeiro <financeiro@vexgrowth.com.br>',
  MAIL_FROM_CONTATO: 'VEX Growth <contato@vexgrowth.com.br>',
}

/**
 * Configuração dos dois remetentes do sistema (contato e financeiro).
 *
 * As senhas são write-only: entram aqui, ficam cifradas no banco e nunca
 * voltam ao navegador — o formulário só mostra se existe ou não. Campo de
 * senha em branco significa "não mexi nela".
 */
export default function EmailSettingsCard() {
  const [form, setForm] = useState({ ...EMPTY })
  const [passSet, setPassSet] = useState({ financeiro: false, contato: false })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [to, setTo] = useState('')
  const [testing, setTesting] = useState<string | null>(null)
  const [result, setResult] = useState<TestResult | null>(null)

  function set<K extends keyof typeof EMPTY>(k: K, v: string) {
    setForm((p) => ({ ...p, [k]: v }))
  }

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return
        setForm({
          SMTP_HOST: d.SMTP_HOST || '',
          SMTP_PORT: d.SMTP_PORT || '587',
          SMTP_SECURE: d.SMTP_SECURE || 'false',
          SMTP_USER: d.SMTP_USER || '',
          SMTP_PASS: '',
          SMTP_CONTATO_USER: d.SMTP_CONTATO_USER || '',
          SMTP_CONTATO_PASS: '',
          MAIL_FROM_FINANCEIRO: d.MAIL_FROM_FINANCEIRO || EMPTY.MAIL_FROM_FINANCEIRO,
          MAIL_FROM_CONTATO: d.MAIL_FROM_CONTATO || EMPTY.MAIL_FROM_CONTATO,
        })
        setPassSet({
          financeiro: d.SMTP_PASS_SET === 'true',
          contato: d.SMTP_CONTATO_PASS_SET === 'true',
        })
      })
      .finally(() => setLoading(false))
  }, [])

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        // Senhas gravadas somem do formulário; o estado passa a "configurada"
        setPassSet((p) => ({
          financeiro: p.financeiro || !!form.SMTP_PASS,
          contato: p.contato || !!form.SMTP_CONTATO_PASS,
        }))
        setForm((p) => ({ ...p, SMTP_PASS: '', SMTP_CONTATO_PASS: '' }))
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } finally {
      setSaving(false)
    }
  }

  async function test(profile: 'contato' | 'financeiro') {
    setTesting(profile)
    setResult(null)
    try {
      const res = await fetch('/api/integracoes/email-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, profile }),
      })
      setResult(await res.json().catch(() => ({ sent: false, error: 'Falha na resposta do servidor.' })))
    } catch {
      setResult({ sent: false, error: 'Falha de conexão.' })
    } finally {
      setTesting(null)
    }
  }

  if (loading) return <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />

  const input = 'input'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 space-y-4 text-sm">
      <p className="font-bold text-gray-900 flex items-center gap-2">
        <Mail className="w-4 h-4 text-[#030A8C]" /> E-mail transacional
      </p>

      {/* Servidor */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Servidor SMTP</label>
          <input value={form.SMTP_HOST} onChange={(e) => set('SMTP_HOST', e.target.value)} className={input} placeholder="smtp.gmail.com" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Porta</label>
          <input value={form.SMTP_PORT} onChange={(e) => set('SMTP_PORT', e.target.value)} className={input} placeholder="587" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Segurança</label>
          <select value={form.SMTP_SECURE} onChange={(e) => set('SMTP_SECURE', e.target.value)} className={input}>
            <option value="false">STARTTLS (porta 587)</option>
            <option value="true">SSL/TLS direto (porta 465)</option>
          </select>
        </div>
      </div>

      {/* Perfis */}
      {([
        { key: 'contato', title: 'Contato — mensagens e avisos', fromKey: 'MAIL_FROM_CONTATO', userKey: 'SMTP_CONTATO_USER', passKey: 'SMTP_CONTATO_PASS' },
        { key: 'financeiro', title: 'Financeiro — boletos e cobrança', fromKey: 'MAIL_FROM_FINANCEIRO', userKey: 'SMTP_USER', passKey: 'SMTP_PASS' },
      ] as const).map((p) => (
        <div key={p.key} className="border border-gray-100 rounded-lg p-3 space-y-3">
          <p className="text-xs font-semibold text-gray-700 flex items-center gap-2">
            {p.title}
            {passSet[p.key] ? (
              <span className="text-[11px] font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">senha configurada</span>
            ) : (
              <span className="text-[11px] font-medium text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full">sem senha</span>
            )}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Remetente exibido</label>
              <input value={form[p.fromKey]} onChange={(e) => set(p.fromKey, e.target.value)} className={input} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Usuário SMTP</label>
              <input value={form[p.userKey]} onChange={(e) => set(p.userKey, e.target.value)} className={input} placeholder={`${p.key}@vexgrowth.com.br`} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Senha de app</label>
              <input
                type="password"
                autoComplete="new-password"
                value={form[p.passKey]}
                onChange={(e) => set(p.passKey, e.target.value)}
                className={input}
                placeholder={passSet[p.key] ? '•••••••• (em branco mantém)' : 'senha de app do provedor'}
              />
            </div>
          </div>
        </div>
      ))}

      <p className="text-[11px] text-gray-400">
        Sem usuário/senha próprios, o perfil de contato usa a credencial do financeiro — o que só funciona se o
        servidor de saída autorizar enviar por todo o domínio (relay). As senhas ficam cifradas no banco e nunca voltam para a tela.
      </p>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 bg-[#030A8C] text-white rounded-lg text-xs font-semibold hover:bg-[#02077a] disabled:opacity-50 transition-colors"
        >
          {saving ? 'Salvando...' : saved ? 'Salvo' : 'Salvar e-mail'}
        </button>
      </div>

      {/* Teste real */}
      <div className="border-t border-gray-100 pt-3 space-y-2">
        <label className="block text-xs font-medium text-gray-700">Enviar teste real para</label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={to} onChange={(e) => setTo(e.target.value)} className={`${input} flex-1`} placeholder="voce@exemplo.com" />
          <button
            onClick={() => test('contato')}
            disabled={!to || testing != null}
            className="flex items-center justify-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:border-[#030A8C] hover:text-[#030A8C] disabled:opacity-50 transition-colors"
          >
            <Send className="w-3.5 h-3.5" /> {testing === 'contato' ? 'Enviando...' : 'Testar contato'}
          </button>
          <button
            onClick={() => test('financeiro')}
            disabled={!to || testing != null}
            className="flex items-center justify-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:border-[#030A8C] hover:text-[#030A8C] disabled:opacity-50 transition-colors"
          >
            <Send className="w-3.5 h-3.5" /> {testing === 'financeiro' ? 'Enviando...' : 'Testar financeiro'}
          </button>
        </div>

        {result && (
          <div className="space-y-1.5">
            <p className={`flex items-center gap-2 text-xs font-medium ${result.sent ? 'text-green-700' : 'text-red-600'}`}>
              {result.sent ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
              {result.sent
                ? `Aceito pelo provedor como ${result.from} — ${result.providerResponse ?? ''}`
                : result.error}
            </p>
            {result.dns && (
              <div className="text-xs text-gray-600 space-y-0.5">
                <p className="flex items-center gap-2">
                  {result.dns.spf ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />}
                  SPF {result.dns.spf ? 'publicado' : 'ausente'}
                </p>
                <p className="flex items-center gap-2">
                  {result.dns.dkim ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />}
                  DKIM {result.dns.dkim ? `publicado (seletor ${result.dns.dkimSelector})` : 'ausente'}
                </p>
                <p className="flex items-center gap-2">
                  {result.dns.dmarc ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />}
                  DMARC {result.dns.dmarc ? 'publicado' : 'ausente'}
                </p>
                {result.dns.missing.map((m) => (
                  <p key={m} className="text-[11px] text-orange-700 break-words">• {m}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
