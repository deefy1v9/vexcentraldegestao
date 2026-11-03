'use client'

import { useState } from 'react'
import { CreditCard, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { campo } from '@/components/clientes/FormSecao'

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
  cnpj,
  email,
}: {
  clientId: string
  form: BillingForm
  onChange: <K extends keyof BillingForm>(field: K, value: BillingForm[K]) => void
  asaas: { customerId: string | null; syncStatus: string | null; syncError: string | null; syncedAt: string | null }
  /** CPF/CNPJ e e-mail vêm dos dados gerais do cliente (mesma tela) */
  cnpj?: string
  email?: string
}) {
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  // Validação local dos obrigatórios (o backend revalida)
  const missingBilling: string[] = []
  if (!form.billingEmail.trim()) missingBilling.push('E-mail financeiro')
  const missingNfse: string[] = []
  if (!form.legalName.trim()) missingNfse.push('Razão social')
  if (!(cnpj ?? '').trim()) missingNfse.push('CPF/CNPJ')
  if (!(form.billingEmail || email || '').trim()) missingNfse.push('E-mail financeiro')
  if (!form.zipCode.trim()) missingNfse.push('CEP')
  if (!form.street.trim()) missingNfse.push('Logradouro')
  if (!form.addressNumber.trim()) missingNfse.push('Número')
  if (!form.district.trim()) missingNfse.push('Bairro')
  if (!form.city.trim()) missingNfse.push('Cidade')
  if (!form.state.trim()) missingNfse.push('UF')
  if (!form.ibgeCode.trim()) missingNfse.push('Código IBGE')

  // Só é possível ligar a emissão com o cadastro fiscal completo
  const nfseBlocked = !form.nfseEnabled && missingNfse.length > 0

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

  const input = campo

  return (
    <section className="bg-card rounded-[24px] border border-border p-6 space-y-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="font-display text-[21px] font-semibold tracking-[-0.01em] text-foreground flex items-center gap-3">
          <span className="w-9 h-9 shrink-0 rounded-xl grid place-items-center bg-marca-suave text-marca-texto"><CreditCard className="w-[18px] h-[18px]" /></span>
          Faturamento e NFS-e
        </h2>
        <div className="flex items-center gap-2 text-xs">
          {asaas.syncStatus === 'OK' && (
            <span className="flex items-center gap-1 text-success bg-success-suave px-2 py-0.5 rounded-full font-semibold">
              <CheckCircle2 className="w-3 h-3" /> Asaas OK
            </span>
          )}
          {asaas.syncStatus === 'ERRO' && (
            <span className="flex items-center gap-1 text-destructive-texto bg-destructive-suave px-2 py-0.5 rounded-full font-semibold">
              <AlertTriangle className="w-3 h-3" /> Erro na sincronização
            </span>
          )}
          <button
            type="button"
            onClick={syncNow}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 h-8 px-3 border border-border bg-card rounded-lg text-[13px] font-medium text-foreground hover:bg-accent disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando...' : 'Sincronizar Asaas'}
          </button>
        </div>
      </div>

      {syncMsg && (
        <p className={`text-xs font-medium rounded-xl px-3 py-2 border ${syncMsg.includes('Sincronizado') ? 'text-success bg-success-suave border-success/20' : 'text-destructive-texto bg-destructive-suave border-destructive/20'}`}>
          {syncMsg}
        </p>
      )}
      {asaas.syncError && (
        <p className="text-xs text-destructive-texto bg-destructive-suave border border-destructive/20 rounded-xl px-3 py-2">{asaas.syncError}</p>
      )}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[16px] border border-border bg-secondary/40 px-4 py-3">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={form.billingEnabled} onChange={(e) => onChange('billingEnabled', e.target.checked)} />
          Cobrança automática mensal (Asaas)
        </label>
        <label className={`flex items-center gap-2 text-sm ${nfseBlocked ? 'text-muted-foreground' : 'text-foreground'}`}>
          <input
            type="checkbox"
            checked={form.nfseEnabled}
            disabled={nfseBlocked}
            onChange={(e) => onChange('nfseEnabled', e.target.checked)}
          />
          Emissão automática de NFS-e (Focus)
        </label>
      </div>

      {nfseBlocked && (
        <p className="text-xs text-warning bg-warning-suave border border-warning/20 rounded-xl px-3 py-2">
          Para ativar a NFS-e, complete o cadastro fiscal do cliente: {missingNfse.join(', ')}.
        </p>
      )}

      {form.billingEnabled && missingBilling.length > 0 && (
        <p className="text-xs text-warning bg-warning-suave border border-warning/20 rounded-xl px-3 py-2">
          Faltam para a cobrança: {missingBilling.join(', ')} (além de CPF/CNPJ e dia de vencimento nos dados do cliente).
        </p>
      )}
      {form.nfseEnabled && missingNfse.length > 0 && (
        <p className="text-xs text-warning bg-warning-suave border border-warning/20 rounded-xl px-3 py-2">
          Faltam para a NFS-e: {missingNfse.join(', ')}.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-[13px] font-medium text-foreground mb-1.5">Razão social / nome</label>
          <input value={form.legalName} onChange={(e) => onChange('legalName', e.target.value)} className={input} placeholder="Razão social do tomador" />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-foreground mb-1.5">Inscrição municipal</label>
          <input value={form.municipalReg} onChange={(e) => onChange('municipalReg', e.target.value)} className={input} placeholder="Quando aplicável" />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-foreground mb-1.5">E-mail financeiro</label>
          <input type="email" value={form.billingEmail} onChange={(e) => onChange('billingEmail', e.target.value)} className={input} placeholder="financeiro@cliente.com.br" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-[13px] font-medium text-foreground mb-1.5">E-mails adicionais (separados por vírgula)</label>
          <input value={form.extraEmails} onChange={(e) => onChange('extraEmails', e.target.value)} className={input} />
        </div>

        <div>
          <label className="block text-[13px] font-medium text-foreground mb-1.5">CEP</label>
          <input value={form.zipCode} onChange={(e) => onChange('zipCode', e.target.value)} className={input} placeholder="00000-000" />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-foreground mb-1.5">Logradouro</label>
          <input value={form.street} onChange={(e) => onChange('street', e.target.value)} className={input} />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-foreground mb-1.5">Número</label>
          <input value={form.addressNumber} onChange={(e) => onChange('addressNumber', e.target.value)} className={input} />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-foreground mb-1.5">Complemento</label>
          <input value={form.complement} onChange={(e) => onChange('complement', e.target.value)} className={input} />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-foreground mb-1.5">Bairro</label>
          <input value={form.district} onChange={(e) => onChange('district', e.target.value)} className={input} />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-foreground mb-1.5">Cidade</label>
          <input value={form.city} onChange={(e) => onChange('city', e.target.value)} className={input} />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-foreground mb-1.5">UF</label>
          <input value={form.state} onChange={(e) => onChange('state', e.target.value.toUpperCase().slice(0, 2))} className={input} placeholder="SP" />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-foreground mb-1.5">Código IBGE do município</label>
          <input value={form.ibgeCode} onChange={(e) => onChange('ibgeCode', e.target.value)} className={input} placeholder="Ex: 3550308" />
        </div>

        <div>
          <label className="block text-[13px] font-medium text-foreground mb-1.5">Forma de pagamento</label>
          <select value={form.billingType} onChange={(e) => onChange('billingType', e.target.value)} className={input}>
            <option value="UNDEFINED">Cliente escolhe (boleto/Pix)</option>
            <option value="BOLETO">Boleto</option>
            <option value="PIX">Pix</option>
          </select>
        </div>
        <div>
          <label className="block text-[13px] font-medium text-foreground mb-1.5">Antecedência da geração (dias)</label>
          <input type="number" min="1" max="60" value={form.billingLeadDays} onChange={(e) => onChange('billingLeadDays', e.target.value)} className={input} />
        </div>

        <div>
          <label className="block text-[13px] font-medium text-foreground mb-1.5">Regra de emissão da NFS-e</label>
          <select value={form.nfseRule} onChange={(e) => onChange('nfseRule', e.target.value)} className={input}>
            <option value="ON_CONFIRMED">Após confirmação do pagamento (padrão)</option>
            <option value="ON_RECEIVED">Após recebimento (saldo disponível)</option>
            <option value="ON_COMPETENCE">Por competência (manual/agendada)</option>
            <option value="MANUAL">Manual</option>
          </select>
        </div>
        <div>
          <label className="block text-[13px] font-medium text-foreground mb-1.5">Descrição fiscal padrão</label>
          <input value={form.fiscalDescription} onChange={(e) => onChange('fiscalDescription', e.target.value)} className={input} placeholder="Ex: Serviços de marketing digital" />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        ID no Asaas: <span className="font-mono">{asaas.customerId || '— (nunca sincronizado)'}</span>
        {asaas.syncedAt ? ` · última sincronização ${new Date(asaas.syncedAt).toLocaleString('pt-BR')}` : ''}
      </p>
    </section>
  )
}
