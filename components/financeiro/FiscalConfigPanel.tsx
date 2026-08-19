'use client'

import { useEffect, useState } from 'react'
import { Check, AlertTriangle, ShieldCheck } from 'lucide-react'

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
  aliquotaIss: string
  issRetido: boolean
  pis: string
  cofins: string
  csll: string
  inss: string
  ibsCbs: string
  descricaoPadrao: string
  autoEmit: boolean
  emitRule: string
}

const EMPTY: FiscalForm = {
  cnpj: '', razaoSocial: '', inscricaoMunicipal: '', codigoMunicipio: '',
  optanteSimples: true, regimeEspecial: '', naturezaOperacao: '',
  incentivadorCultural: false, codigoServicoMunicipal: '', itemListaServico: '',
  cnae: '', codigoTributacao: '', aliquotaIss: '', issRetido: false,
  pis: '', cofins: '', csll: '', inss: '', ibsCbs: '', descricaoPadrao: '',
  autoEmit: false, emitRule: 'ON_CONFIRMED',
}

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
            aliquotaIss: c.aliquotaIss != null ? String(c.aliquotaIss) : '',
            issRetido: !!c.issRetido,
            pis: c.pis != null ? String(c.pis) : '', cofins: c.cofins != null ? String(c.cofins) : '',
            csll: c.csll != null ? String(c.csll) : '', inss: c.inss != null ? String(c.inss) : '',
            ibsCbs: c.ibsCbs ?? '', descricaoPadrao: c.descricaoPadrao ?? '',
            autoEmit: !!c.autoEmit, emitRule: c.emitRule ?? 'ON_CONFIRMED',
          })
          setMissing(fc.missing ?? [])
          setReady(!!fc.ready)
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
        aliquotaIss: form.aliquotaIss || null,
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
      if (!res.ok) {
        setError(body.error || 'Não foi possível salvar.')
      } else {
        setMissing(body.missing ?? [])
        setReady(!!body.ready)
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="max-w-3xl space-y-3 animate-pulse">{[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded-xl" />)}</div>
  }

  const input = 'input'

  return (
    <div className="max-w-3xl space-y-4">
      {/* Status */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-3 text-xs">
        <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold ${ready ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
          {ready ? <ShieldCheck className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
          {ready ? 'Pronto para emitir' : 'Configuração incompleta'}
        </span>
        <span className="text-gray-500">Ambiente Focus: <b>{envInfo.focusEnv ?? '—'}</b></span>
        <span className="text-gray-500">Modo: <b>{envInfo.mode === 'national' ? 'NFS-e Nacional (/v2/nfsen)' : 'Municipal (/v2/nfse)'}</b></span>
        <span className="text-gray-500">Conexão: <b>{envInfo.connection ?? '—'}</b></span>
      </div>

      {!ready && missing.length > 0 && (
        <p className="text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
          Campos obrigatórios ausentes: {missing.join(', ')}. A emissão fica bloqueada até completar —
          confirme os valores com a contabilidade e as regras do seu município.
        </p>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Inscrição municipal *</label>
            <input value={form.inscricaoMunicipal} onChange={(e) => set('inscricaoMunicipal', e.target.value)} className={input} />
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

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Código municipal do serviço *</label>
            <input value={form.codigoServicoMunicipal} onChange={(e) => set('codigoServicoMunicipal', e.target.value)} className={input} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CNAE</label>
            <input value={form.cnae} onChange={(e) => set('cnae', e.target.value)} className={input} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Código de tributação</label>
            <input value={form.codigoTributacao} onChange={(e) => set('codigoTributacao', e.target.value)} className={input} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Alíquota do ISS (%) *</label>
            <input type="number" step="0.01" min="0" value={form.aliquotaIss} onChange={(e) => set('aliquotaIss', e.target.value)} className={input} placeholder="Ex: 2.00" />
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
            <input value={form.descricaoPadrao} onChange={(e) => set('descricaoPadrao', e.target.value)} className={input} placeholder="Ex: Serviços de marketing digital" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="font-bold text-gray-900">Emissão</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.autoEmit} onChange={(e) => set('autoEmit', e.target.checked)} />
            Emissão automática ativada (global)
          </label>
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
