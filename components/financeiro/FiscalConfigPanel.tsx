'use client'

import { useEffect, useState } from 'react'
import { Check, AlertTriangle, ShieldCheck, Trash2, Percent } from 'lucide-react'
import { MUNICIPIOS_SEM_CODIGO_SERVICO, ALIQUOTA_ISS_MIN, ALIQUOTA_ISS_MAX } from '@/lib/billing-core'

interface FiscalForm {
  cnpj: string
  razaoSocial: string
  inscricaoMunicipal: string
  codigoMunicipio: string
  optanteSimples: boolean
  regimeEspecial: string
  naturezaOperacao: string
  incentivadorCultural: boolean
  codigoServicoMunicipal: string
  itemListaServico: string
  cnae: string
  codigoTributacao: string
  issRetido: boolean
  pis: string
  cofins: string
  csll: string
  inss: string
  ibsCbs: string
  descricaoPadrao: string
  wsKeyConfigured: boolean
  autoEmit: boolean
  emitRule: string
}

interface Aliquota {
  year: number
  month: number
  aliquotaIss: number
  note?: string | null
}

const EMPTY: FiscalForm = {
  cnpj: '', razaoSocial: '', inscricaoMunicipal: '', codigoMunicipio: '',
  optanteSimples: true, regimeEspecial: '', naturezaOperacao: '',
  incentivadorCultural: false, codigoServicoMunicipal: '', itemListaServico: '',
  cnae: '', codigoTributacao: '', issRetido: false,
  pis: '', cofins: '', csll: '', inss: '', ibsCbs: '', descricaoPadrao: '',
  wsKeyConfigured: false, autoEmit: false, emitRule: 'ON_CONFIRMED',
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

/**
 * Configuração fiscal do prestador. Todos os valores tributários são
 * definidos pelo administrador com validação da contabilidade — o sistema
 * não presume alíquota, código de serviço nem regime. Tokens não aparecem
 * aqui (ficam nas configurações do servidor, write-only).
 */
export default function FiscalConfigPanel() {
  const [form, setForm] = useState<FiscalForm>({ ...EMPTY })
  const [envInfo, setEnvInfo] = useState<{ focusEnv?: string; mode?: string; connection?: string }>({})
  const [missing, setMissing] = useState<string[]>([])
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aliquotas, setAliquotas] = useState<Aliquota[]>([])
  const [competence, setCompetence] = useState<{ year: number; month: number }>(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  })
  const [novaAliquota, setNovaAliquota] = useState('')
  const [aliqBusy, setAliqBusy] = useState(false)
  const [aliqError, setAliqError] = useState<string | null>(null)

  function set<K extends keyof FiscalForm>(k: K, v: FiscalForm[K]) {
    setForm((p) => ({ ...p, [k]: v }))
  }

  useEffect(() => {
    Promise.all([
      fetch('/api/fiscal-config').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/integracoes/diagnostico').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([fc, diag]) => {
        if (fc?.config) {
          const c = fc.config
          setForm({
            cnpj: c.cnpj ?? '', razaoSocial: c.razaoSocial ?? '',
            inscricaoMunicipal: c.inscricaoMunicipal ?? '', codigoMunicipio: c.codigoMunicipio ?? '',
            optanteSimples: !!c.optanteSimples, regimeEspecial: c.regimeEspecial ?? '',
            naturezaOperacao: c.naturezaOperacao ?? '', incentivadorCultural: !!c.incentivadorCultural,
            codigoServicoMunicipal: c.codigoServicoMunicipal ?? '', itemListaServico: c.itemListaServico ?? '',
            cnae: c.cnae ?? '', codigoTributacao: c.codigoTributacao ?? '',
            issRetido: !!c.issRetido,
            pis: c.pis != null ? String(c.pis) : '', cofins: c.cofins != null ? String(c.cofins) : '',
            csll: c.csll != null ? String(c.csll) : '', inss: c.inss != null ? String(c.inss) : '',
            ibsCbs: c.ibsCbs ?? '', descricaoPadrao: c.descricaoPadrao ?? '',
            wsKeyConfigured: !!c.wsKeyConfigured,
            autoEmit: !!c.autoEmit, emitRule: c.emitRule ?? 'ON_CONFIRMED',
          })
          setMissing(fc.missing ?? [])
          setReady(!!fc.ready)
          setAliquotas(fc.aliquotas ?? [])
          if (fc.competence) setCompetence(fc.competence)
        }
        if (diag?.focus) {
          setEnvInfo({
            focusEnv: diag.focus.env,
            mode: diag.focus.mode,
            connection: diag.focus.connection?.ok ? 'ok' : diag.focus.connection?.error || 'sem conexão',
          })
        }
      })
      .finally(() => setLoading(false))
  }, [])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const payload = {
        ...form,
        pis: form.pis || null,
        cofins: form.cofins || null,
        csll: form.csll || null,
        inss: form.inss || null,
      }
      const res = await fetch('/api/fiscal-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      setMissing(body.missing ?? [])
      setReady(!!body.ready)
      if (!res.ok) {
        setError(body.error || 'Não foi possível salvar.')
        if (body.config) setForm((p) => ({ ...p, autoEmit: !!body.config.autoEmit }))
      } else {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } finally {
      setSaving(false)
    }
  }

  /** Grava a alíquota efetiva do ISS de uma competência (2% a 5%). */
  async function saveAliquota() {
    setAliqBusy(true)
    setAliqError(null)
    try {
      const res = await fetch('/api/fiscal-config/aliquotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...competence, aliquotaIss: novaAliquota }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAliqError(body.error || 'Não foi possível salvar a alíquota.')
        return
      }
      setNovaAliquota('')
      await refreshFiscal()
    } finally {
      setAliqBusy(false)
    }
  }

  async function removeAliquota(a: Aliquota) {
    setAliqBusy(true)
    setAliqError(null)
    try {
      await fetch(`/api/fiscal-config/aliquotas?year=${a.year}&month=${a.month}`, { method: 'DELETE' })
      await refreshFiscal()
    } finally {
      setAliqBusy(false)
    }
  }

  async function refreshFiscal() {
    const fc = await fetch('/api/fiscal-config').then((r) => (r.ok ? r.json() : null))
    if (!fc) return
    setAliquotas(fc.aliquotas ?? [])
    setMissing(fc.missing ?? [])
    setReady(!!fc.ready)
    if (fc.config) setForm((p) => ({ ...p, autoEmit: !!fc.config.autoEmit }))
  }

  if (loading) {
    return <div className="max-w-3xl space-y-3 animate-pulse">{[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded-xl" />)}</div>
  }

  const input = 'input'
  const ibge = form.codigoMunicipio.replace(/\D/g, '')
  const exigeCodigoServico = !MUNICIPIOS_SEM_CODIGO_SERVICO.has(ibge)
  const statusLabel = !form.inscricaoMunicipal.trim()
    ? 'Configuração fiscal incompleta — aguardando Inscrição Municipal'
    : ready
      ? 'Pronto para emitir'
      : 'Configuração fiscal incompleta'

  return (
    <div className="max-w-3xl space-y-4">
      {/* Status */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-3 text-xs">
        <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold ${ready ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
          {ready ? <ShieldCheck className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
          {statusLabel}
        </span>
        <span className="text-gray-500">Ambiente Focus: <b>{envInfo.focusEnv ?? '—'}</b></span>
        <span className="text-gray-500">Modo: <b>{envInfo.mode === 'national' ? 'NFS-e Nacional (/v2/nfsen)' : 'Municipal (/v2/nfse)'}</b></span>
        <span className="text-gray-500">Conexão: <b>{envInfo.connection ?? '—'}</b></span>
      </div>

      {!ready && missing.length > 0 && (
        <div className="text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2.5 space-y-1">
          <p className="font-semibold">Pendências bloqueadoras — a emissão de NFS-e fica desativada:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {missing.map((m) => <li key={m}>{m}</li>)}
          </ul>
          <p className="text-orange-600/80">
            Confirme cada valor com a contabilidade e com a prefeitura. O sistema não presume nenhum dado tributário.
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
        <h2 className="font-bold text-gray-900">Prestador</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ *</label>
            <input value={form.cnpj} onChange={(e) => set('cnpj', e.target.value)} className={input} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Razão social *</label>
            <input value={form.razaoSocial} onChange={(e) => set('razaoSocial', e.target.value)} className={input} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Inscrição Municipal *</label>
            <input value={form.inscricaoMunicipal} onChange={(e) => set('inscricaoMunicipal', e.target.value)} className={input} />
            {!form.inscricaoMunicipal.trim() && (
              <p className="text-[11px] text-orange-600 mt-1">
                Ainda não emitida pela prefeitura — a emissão de NFS-e fica bloqueada até o cadastro.
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Código IBGE do município *</label>
            <input value={form.codigoMunicipio} onChange={(e) => set('codigoMunicipio', e.target.value)} className={input} placeholder="Ex: 3550308" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.optanteSimples} onChange={(e) => set('optanteSimples', e.target.checked)} />
            Optante pelo Simples Nacional
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.incentivadorCultural} onChange={(e) => set('incentivadorCultural', e.target.checked)} />
            Incentivador cultural
          </label>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Regime especial de tributação</label>
            <input value={form.regimeEspecial} onChange={(e) => set('regimeEspecial', e.target.value)} className={input} placeholder="Quando aplicável (código)" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Natureza da operação *</label>
            <input value={form.naturezaOperacao} onChange={(e) => set('naturezaOperacao', e.target.value)} className={input} placeholder="Ex: 1" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
        <h2 className="font-bold text-gray-900">Serviço e tributos</h2>
        <p className="text-xs text-gray-400">
          Preencha com os valores validados pela contabilidade e pelas regras do seu município. Nada aqui é presumido pelo sistema.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Item da lista de serviço *</label>
            <input value={form.itemListaServico} onChange={(e) => set('itemListaServico', e.target.value)} className={input} placeholder="Ex: 17.06" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Código municipal do serviço {exigeCodigoServico ? '*' : ''}
            </label>
            <input
              value={form.codigoServicoMunicipal}
              onChange={(e) => set('codigoServicoMunicipal', e.target.value)}
              className={input}
              placeholder={exigeCodigoServico ? '' : 'Não utilizado neste município'}
            />
            {!exigeCodigoServico && (
              <p className="text-[11px] text-gray-400 mt-1">
                Município não utiliza este campo (confirmado com a Focus) — não é enviado na nota.
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CNAE</label>
            <input value={form.cnae} onChange={(e) => set('cnae', e.target.value)} className={input} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Código de tributação</label>
            <input value={form.codigoTributacao} onChange={(e) => set('codigoTributacao', e.target.value)} className={input} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 mt-6">
            <input type="checkbox" checked={form.issRetido} onChange={(e) => set('issRetido', e.target.checked)} />
            ISS retido pelo tomador
          </label>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">PIS (valor)</label>
            <input type="number" step="0.01" min="0" value={form.pis} onChange={(e) => set('pis', e.target.value)} className={input} placeholder="Quando aplicável" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">COFINS (valor)</label>
            <input type="number" step="0.01" min="0" value={form.cofins} onChange={(e) => set('cofins', e.target.value)} className={input} placeholder="Quando aplicável" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CSLL (valor)</label>
            <input type="number" step="0.01" min="0" value={form.csll} onChange={(e) => set('csll', e.target.value)} className={input} placeholder="Quando aplicável" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">INSS (valor)</label>
            <input type="number" step="0.01" min="0" value={form.inss} onChange={(e) => set('inss', e.target.value)} className={input} placeholder="Quando aplicável" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">IBS/CBS (configuração conforme regra vigente)</label>
            <input value={form.ibsCbs} onChange={(e) => set('ibsCbs', e.target.value)} className={input} placeholder="Preencher conforme orientação contábil, quando exigido" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição padrão do serviço *</label>
            <textarea
              rows={3}
              value={form.descricaoPadrao}
              onChange={(e) => set('descricaoPadrao', e.target.value)}
              className={input}
              placeholder="Ex: Prestação de serviços de marketing digital... referente à competência [MM/AAAA]."
            />
            <p className="text-[11px] text-gray-400 mt-1">
              O marcador <span className="font-mono">[MM/AAAA]</span> é substituído pela competência da cobrança.
            </p>
          </div>
        </div>
      </div>

      {/* Alíquota efetiva do ISS por competência */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
        <h2 className="font-bold text-gray-900 flex items-center gap-2">
          <Percent className="w-4 h-4 text-[#030A8C]" />
          Alíquota efetiva do ISS por competência
        </h2>
        <p className="text-xs text-gray-400">
          No Simples Nacional a alíquota varia conforme o faturamento da competência (entre {ALIQUOTA_ISS_MIN}% e {ALIQUOTA_ISS_MAX}%).
          O sistema não assume nenhum valor: sem a alíquota confirmada pelo contador, a nota do mês não é emitida.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mês</label>
            <select
              value={competence.month}
              onChange={(e) => setCompetence((p) => ({ ...p, month: Number(e.target.value) }))}
              className={input}
            >
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ano</label>
            <input
              type="number"
              min="2020"
              max="2100"
              value={competence.year}
              onChange={(e) => setCompetence((p) => ({ ...p, year: Number(e.target.value) }))}
              className={input}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Alíquota (%)</label>
            <input
              type="number"
              step="0.01"
              min={ALIQUOTA_ISS_MIN}
              max={ALIQUOTA_ISS_MAX}
              value={novaAliquota}
              onChange={(e) => setNovaAliquota(e.target.value)}
              className={input}
              placeholder={`${ALIQUOTA_ISS_MIN} a ${ALIQUOTA_ISS_MAX}`}
            />
          </div>
          <button
            type="button"
            onClick={saveAliquota}
            disabled={aliqBusy || !novaAliquota}
            className="px-4 py-2.5 bg-[#030A8C] text-white rounded-lg text-sm font-semibold hover:bg-[#02077a] disabled:opacity-50 transition-colors"
          >
            {aliqBusy ? 'Salvando...' : 'Definir'}
          </button>
        </div>

        {aliqError && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{aliqError}</p>
        )}

        {aliquotas.length === 0 ? (
          <p className="text-xs text-gray-400">Nenhuma competência configurada.</p>
        ) : (
          <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {aliquotas.map((a) => (
              <div key={`${a.year}-${a.month}`} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="text-gray-700">
                  {String(a.month).padStart(2, '0')}/{a.year}
                  <b className="ml-3 text-gray-900">{a.aliquotaIss.toFixed(2)}%</b>
                </span>
                <button
                  type="button"
                  onClick={() => removeAliquota(a)}
                  disabled={aliqBusy}
                  className="text-gray-300 hover:text-red-600 disabled:opacity-50 transition-colors"
                  aria-label={`Remover alíquota de ${String(a.month).padStart(2, '0')}/${a.year}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Web Service da prefeitura */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-3">
        <h2 className="font-bold text-gray-900">Web Service da prefeitura</h2>
        <p className="text-xs text-gray-400">
          Gere a chave em <b>Notas Fiscais → Web Service → Gerar Chave Autenticação</b> no portal da prefeitura e
          cadastre-a na Focus NFe. A chave nunca é digitada nem armazenada aqui — só o estado do cadastro.
        </p>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={form.wsKeyConfigured}
            onChange={(e) => set('wsKeyConfigured', e.target.checked)}
          />
          Chave de autenticação já cadastrada na Focus NFe
        </label>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
        <h2 className="font-bold text-gray-900">Emissão</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={`flex items-center gap-2 text-sm ${ready ? 'text-gray-700' : 'text-gray-400'}`}>
              <input
                type="checkbox"
                checked={form.autoEmit}
                disabled={!ready}
                onChange={(e) => set('autoEmit', e.target.checked)}
              />
              Emissão automática ativada (global)
            </label>
            {!ready && (
              <p className="text-[11px] text-orange-600 mt-1">
                Indisponível enquanto houver pendências bloqueadoras.
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Regra padrão de emissão</label>
            <select value={form.emitRule} onChange={(e) => set('emitRule', e.target.value)} className={input}>
              <option value="ON_CONFIRMED">Após confirmação do pagamento (padrão)</option>
              <option value="ON_RECEIVED">Após recebimento (saldo disponível)</option>
              <option value="ON_COMPETENCE">Por competência</option>
              <option value="MANUAL">Manual</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <p className="text-sm font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">{error}</p>
      )}

      <div className="flex justify-end pb-6">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#030A8C] text-white rounded-lg text-sm font-semibold hover:bg-[#02077a] disabled:opacity-50 transition-colors"
        >
          {saved ? <Check className="w-4 h-4" /> : null}
          {saving ? 'Salvando...' : saved ? 'Salvo' : 'Salvar configuração'}
        </button>
      </div>
    </div>
  )
}
