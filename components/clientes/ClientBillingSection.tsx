'use client'

import { useState } from 'react'
import { CreditCard, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react'

export interface BillingForm {
  billingEnabled: boolean
  legalName: string
  municipalReg: string
  billingEmail: string
  extraEmails: string
  zipCode: string
  street: string
  addressNumber: string
  complement: string
  district: string
  city: string
  state: string
  ibgeCode: string
  billingLeadDays: string
  billingType: string
  nfseEnabled: boolean
  nfseRule: string
  fiscalDescription: string
}

export const EMPTY_BILLING: BillingForm = {
  billingEnabled: false, legalName: '', municipalReg: '', billingEmail: '',
  extraEmails: '', zipCode: '', street: '', addressNumber: '', complement: '',
  district: '', city: '', state: '', ibgeCode: '', billingLeadDays: '10',
  billingType: 'UNDEFINED', nfseEnabled: false, nfseRule: 'ON_CONFIRMED',
  fiscalDescription: '',
}

/**
 * Seção "Faturamento e NFS-e" do cadastro do cliente (só admin).
 * Mostra os campos ausentes antes de ativar cobrança/nota e o status da
 * sincronização com o Asaas (ID somente leitura).
 */
export default function ClientBillingSection({
  clientId,
  form,
  onChange,
  asaas,
}: {
  clientId: string
  form: BillingForm
  onChange: <K extends keyof BillingForm>(field: K, value: BillingForm[K]) => void
  asaas: { customerId: string | null; syncStatus: string | null; syncError: string | null; syncedAt: string | null }
}) {
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  // Validação local dos obrigatórios (o backend revalida)
  const missingBilling: string[] = []
  if (!form.billingEmail.trim()) missingBilling.push('E-mail financeiro')
  const missingNfse: string[] = []
  if (!form.legalName.trim()) missingNfse.push('Razão social')
  if (!form.zipCode.trim()) missingNfse.push('CEP')
  if (!form.street.trim()) missingNfse.push('Logradouro')
  if (!form.addressNumber.trim()) missingNfse.push('Número')
  if (!form.district.trim()) missingNfse.push('Bairro')
  if (!form.city.trim()) missingNfse.push('Cidade')
  if (!form.state.trim()) missingNfse.push('UF')
  if (!form.ibgeCode.trim()) missingNfse.push('Código IBGE')

  async function syncNow() {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await fetch(`/api/asaas/clientes/${clientId}/sync`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      setSyncMsg(res.ok ? 'Sincronizado com o Asaas.' : body.error || 'Falha na sincronização.')
    } catch {
      setSyncMsg('Falha de conexão.')
    } finally {
      setSyncing(false)
    }
  }

  const input = 'input'

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="font-bold text-gray-900 flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-[#030A8C]" />
          Faturamento e NFS-e
        </h2>
        <div className="flex items-center gap-2 text-xs">
          {asaas.syncStatus === 'OK' && (
            <span className="flex items-center gap-1 text-green-700 bg-green-50 px-2 py-0.5 rounded-full font-semibold">
              <CheckCircle2 className="w-3 h-3" /> Asaas OK
            </span>
          )}
          {asaas.syncStatus === 'ERRO' && (
            <span className="flex items-center gap-1 text-red-700 bg-red-50 px-2 py-0.5 rounded-full font-semibold">
              <AlertTriangle className="w-3 h-3" /> Erro na sincronização
            </span>
          )}
          <button
            type="button"
            onClick={syncNow}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:border-[#030A8C] hover:text-[#030A8C] disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando...' : 'Sincronizar Asaas'}
          </button>
        </div>
      </div>

      {syncMsg && (
        <p className={`text-xs font-medium rounded-lg px-3 py-2 border ${syncMsg.includes('Sincronizado') ? 'text-green-700 bg-green-50 border-green-100' : 'text-red-600 bg-red-50 border-red-100'}`}>
          {syncMsg}
        </p>
      )}
      {asaas.syncError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{asaas.syncError}</p>
      )}

      <div className="flex flex-wrap items-center gap-5">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={form.billingEnabled} onChange={(e) => onChange('billingEnabled', e.target.checked)} />
          Cobrança automática mensal (Asaas)
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={form.nfseEnabled} onChange={(e) => onChange('nfseEnabled', e.target.checked)} />
          Emissão automática de NFS-e (Focus)
        </label>
      </div>

      {form.billingEnabled && missingBilling.length > 0 && (
        <p className="text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
          Faltam para a cobrança: {missingBilling.join(', ')} (além de CPF/CNPJ e dia de vencimento nos dados do cliente).
        </p>
      )}
      {form.nfseEnabled && missingNfse.length > 0 && (
        <p className="text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
          Faltam para a NFS-e: {missingNfse.join(', ')}.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Razão social / nome</label>
          <input value={form.legalName} onChange={(e) => onChange('legalName', e.target.value)} className={input} placeholder="Razão social do tomador" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Inscrição municipal</label>
          <input value={form.municipalReg} onChange={(e) => onChange('municipalReg', e.target.value)} className={input} placeholder="Quando aplicável" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">E-mail financeiro</label>
          <input type="email" value={form.billingEmail} onChange={(e) => onChange('billingEmail', e.target.value)} className={input} placeholder="financeiro@cliente.com.br" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">E-mails adicionais (separados por vírgula)</label>
          <input value={form.extraEmails} onChange={(e) => onChange('extraEmails', e.target.value)} className={input} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">CEP</label>
          <input value={form.zipCode} onChange={(e) => onChange('zipCode', e.target.value)} className={input} placeholder="00000-000" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Logradouro</label>
          <input value={form.street} onChange={(e) => onChange('street', e.target.value)} className={input} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Número</label>
          <input value={form.addressNumber} onChange={(e) => onChange('addressNumber', e.target.value)} className={input} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Complemento</label>
          <input value={form.complement} onChange={(e) => onChange('complement', e.target.value)} className={input} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Bairro</label>
          <input value={form.district} onChange={(e) => onChange('district', e.target.value)} className={input} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
          <input value={form.city} onChange={(e) => onChange('city', e.target.value)} className={input} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">UF</label>
          <input value={form.state} onChange={(e) => onChange('state', e.target.value.toUpperCase().slice(0, 2))} className={input} placeholder="SP" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Código IBGE do município</label>
          <input value={form.ibgeCode} onChange={(e) => onChange('ibgeCode', e.target.value)} className={input} placeholder="Ex: 3550308" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Forma de pagamento</label>
          <select value={form.billingType} onChange={(e) => onChange('billingType', e.target.value)} className={input}>
            <option value="UNDEFINED">Cliente escolhe (boleto/Pix)</option>
            <option value="BOLETO">Boleto</option>
            <option value="PIX">Pix</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Antecedência da geração (dias)</label>
          <input type="number" min="1" max="60" value={form.billingLeadDays} onChange={(e) => onChange('billingLeadDays', e.target.value)} className={input} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Regra de emissão da NFS-e</label>
          <select value={form.nfseRule} onChange={(e) => onChange('nfseRule', e.target.value)} className={input}>
            <option value="ON_CONFIRMED">Após confirmação do pagamento (padrão)</option>
            <option value="ON_RECEIVED">Após recebimento (saldo disponível)</option>
            <option value="ON_COMPETENCE">Por competência (manual/agendada)</option>
            <option value="MANUAL">Manual</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descrição fiscal padrão</label>
          <input value={form.fiscalDescription} onChange={(e) => onChange('fiscalDescription', e.target.value)} className={input} placeholder="Ex: Serviços de marketing digital" />
        </div>
      </div>

      <p className="text-xs text-gray-400">
        ID no Asaas: <span className="font-mono">{asaas.customerId || '— (nunca sincronizado)'}</span>
        {asaas.syncedAt ? ` · última sincronização ${new Date(asaas.syncedAt).toLocaleString('pt-BR')}` : ''}
      </p>
    </div>
  )
}
