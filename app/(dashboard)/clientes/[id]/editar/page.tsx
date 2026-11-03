'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import CurrencyInput from '@/components/ui/CurrencyInput'
import ClientBillingSection, { BillingForm, EMPTY_BILLING } from '@/components/clientes/ClientBillingSection'
import ClientLinksFields from '@/components/clientes/ClientLinksFields'
import ClientAvisoSection, { AvisoForm, EMPTY_AVISO } from '@/components/clientes/ClientAvisoSection'
import { CLIENT_LINK_KINDS, type ClientLinkKind } from '@/lib/client-links'
import { formatCurrency } from '@/lib/utils'
import Link from 'next/link'
import { ArrowLeft, Save, Trash2, Plus, Building2, Layers, FileSignature, StickyNote } from 'lucide-react'
import { Button } from '@/components/vex/button'
import { Campo, RodapeForm, SecaoForm, campo, campoLeitura, campoTexto } from '@/components/clientes/FormSecao'

interface ServiceForm {
  id: string | null
  serviceName: string
  description: string
  monthlyValue: number | null
}

interface Client {
  id: string
  name: string
  cnpj?: string | null
  email?: string | null
  phone?: string | null
  niche?: string | null
  status: string
  contractStart?: string | null
  contractEnd?: string | null
  contractMonths?: number | null
  monthlyValue?: number | null
  paymentDay?: number | null
  notes?: string | null
  tier?: string | null
  tierManual?: boolean
  website?: string | null
  instagram?: string | null
  facebook?: string | null
  linkedin?: string | null
  youtube?: string | null
  tiktok?: string | null
  services: { id: string; serviceName: string; description?: string | null; monthlyValue?: number | null }[]
}

export default function EditClientePage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [services, setServices] = useState<ServiceForm[]>([])
  const [form, setForm] = useState({
    name: '',
    cnpj: '',
    email: '',
    phone: '',
    niche: '',
    status: 'ATIVO',
    contractStart: '',
    contractEnd: '',
    contractMonths: '',
    paymentDay: '',
    notes: '',
    tier: 'AUTO',
    tierReason: '',
    website: '', instagram: '', facebook: '', linkedin: '', youtube: '', tiktok: '',
  })

  // Valor total mensal: soma automática dos serviços, somente leitura
  const totalMensal = services.reduce((sum, s) => sum + (s.monthlyValue ?? 0), 0)

  // Faturamento e NFS-e
  const [billing, setBilling] = useState<BillingForm>({ ...EMPTY_BILLING })
  const [asaasInfo, setAsaasInfo] = useState<{ customerId: string | null; syncStatus: string | null; syncError: string | null; syncedAt: string | null }>({
    customerId: null, syncStatus: null, syncError: null, syncedAt: null,
  })
  // Aviso de demanda concluída no grupo do cliente
  const [aviso, setAviso] = useState<AvisoForm>({ ...EMPTY_AVISO })
  function setAvisoField<K extends keyof AvisoForm>(field: K, value: AvisoForm[K]) {
    setAviso((prev) => ({ ...prev, [field]: value }))
  }
  function setBillingField<K extends keyof BillingForm>(field: K, value: BillingForm[K]) {
    setBilling((prev) => ({ ...prev, [field]: value }))
  }

  useEffect(() => {
    fetch(`/api/clientes/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then((data: Client) => {
        setClient(data)
        setForm({
          name: data.name || '',
          cnpj: data.cnpj || '',
          email: data.email || '',
          phone: data.phone || '',
          niche: data.niche || '',
          status: data.status || 'ATIVO',
          contractStart: data.contractStart ? data.contractStart.split('T')[0] : '',
          contractEnd: data.contractEnd ? data.contractEnd.split('T')[0] : '',
          contractMonths: data.contractMonths?.toString() || '',
          paymentDay: data.paymentDay?.toString() || '',
          notes: data.notes || '',
          tier: data.tierManual && data.tier ? data.tier : 'AUTO',
          tierReason: '',
          ...Object.fromEntries(CLIENT_LINK_KINDS.map((k) => [k, data[k] || ''])) as Record<ClientLinkKind, string>,
        })
        setServices(data.services.map((s) => ({
          id: s.id,
          serviceName: s.serviceName,
          description: s.description || '',
          monthlyValue: s.monthlyValue ?? null,
        })))
        const d = data as unknown as Record<string, unknown>
        setBilling({
          billingEnabled: !!d.billingEnabled,
          legalName: (d.legalName as string) || '',
          municipalReg: (d.municipalReg as string) || '',
          billingEmail: (d.billingEmail as string) || '',
          extraEmails: (d.extraEmails as string) || '',
          zipCode: (d.zipCode as string) || '',
          street: (d.street as string) || '',
          addressNumber: (d.addressNumber as string) || '',
          complement: (d.complement as string) || '',
          district: (d.district as string) || '',
          city: (d.city as string) || '',
          state: (d.state as string) || '',
          ibgeCode: (d.ibgeCode as string) || '',
          billingLeadDays: String(d.billingLeadDays ?? 10),
          billingType: (d.billingType as string) || 'UNDEFINED',
          nfseEnabled: !!d.nfseEnabled,
          nfseRule: (d.nfseRule as string) || 'ON_CONFIRMED',
          fiscalDescription: (d.fiscalDescription as string) || '',
        })
        setAviso({
          whatsappGroupId: (d.whatsappGroupId as string) || '',
          avisoConclusaoAtivo: !!d.avisoConclusaoAtivo,
          agenteAcompanha: !!d.agenteAcompanha,
        })
        setAsaasInfo({
          customerId: (d.asaasCustomerId as string) || null,
          syncStatus: (d.asaasSyncStatus as string) || null,
          syncError: (d.asaasSyncError as string) || null,
          syncedAt: (d.asaasSyncedAt as string) || null,
        })
        setLoading(false)
      })
      .catch(() => {
        setError('Não foi possível carregar o cliente.')
        setLoading(false)
      })
  }, [id])

  function setField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function addService() {
    setServices((prev) => [...prev, { id: null, serviceName: '', description: '', monthlyValue: null }])
  }

  function removeService(i: number) {
    setServices((prev) => prev.filter((_, idx) => idx !== i))
  }

  function updateService<K extends keyof ServiceForm>(i: number, field: K, value: ServiceForm[K]) {
    setServices((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const res = await fetch(`/api/clientes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          ...billing,
          ...aviso,
          billingLeadDays: Number(billing.billingLeadDays) || 10,
          contractMonths: form.contractMonths ? Number(form.contractMonths) : null,
          paymentDay: form.paymentDay ? Number(form.paymentDay) : null,
          services: services.filter((s) => s.serviceName.trim()),
        }),
      })

      if (res.ok) {
        router.push(`/clientes/${id}`)
      } else {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Erro ao salvar. Verifique os campos e tente de novo.')
        setSaving(false)
      }
    } catch {
      setError('Falha de conexão. Tente de novo.')
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Excluir o cliente "${client?.name}"? Esta ação não pode ser desfeita.`)) return
    const res = await fetch(`/api/clientes/${id}`, { method: 'DELETE' })
    if (res.ok) router.push('/clientes')
    else alert('Erro ao excluir')
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <Header title="Carregando..." />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-marca border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (!client) return null

  const botaoExcluir = (
    <button
      type="button"
      onClick={handleDelete}
      className="inline-flex items-center gap-2 h-9 px-3 text-destructive-texto hover:bg-destructive-suave rounded-lg text-[13.5px] font-medium transition-colors"
    >
      <Trash2 className="w-4 h-4" />
      Excluir Cliente
    </button>
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title={`Editar — ${client.name}`}
        subtitle={client.niche || 'Cliente'}
        acoes={(
          <Button asChild variant="ghost">
            <Link href={`/clientes/${id}`}><ArrowLeft /> Voltar para o cliente</Link>
          </Button>
        )}
      />
      <div className="relative flex-1 overflow-y-auto px-4 sm:px-8 pt-2">
        <form onSubmit={handleSave}>
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
            <div className="space-y-5 min-w-0">
              {/* Dados básicos */}
              <SecaoForm rotulo="Cadastro" titulo="Dados do Cliente" icone={Building2}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Campo rotulo="Nome" obrigatorio className="sm:col-span-2">
                    <input required value={form.name} onChange={(e) => setField('name', e.target.value)} className={campo} placeholder="Nome da empresa" />
                  </Campo>
                  <Campo rotulo="CNPJ">
                    <input value={form.cnpj} onChange={(e) => setField('cnpj', e.target.value)} className={campo} placeholder="00.000.000/0001-00" />
                  </Campo>
                  <Campo rotulo="Nicho">
                    <input value={form.niche} onChange={(e) => setField('niche', e.target.value)} className={campo} placeholder="Ex: E-commerce, Saúde..." />
                  </Campo>
                  <Campo rotulo="Email">
                    <input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} className={campo} />
                  </Campo>
                  <Campo rotulo="Telefone">
                    <input value={form.phone} onChange={(e) => setField('phone', e.target.value)} className={campo} placeholder="(11) 99999-9999" />
                  </Campo>
                  <Campo rotulo="Status">
                    <select value={form.status} onChange={(e) => setField('status', e.target.value)} className={campo}>
                      <option value="ATIVO">Ativo</option>
                      <option value="INATIVO">Inativo</option>
                      <option value="PAUSADO">Pausado</option>
                    </select>
                  </Campo>
                  <Campo
                    rotulo="Grupo do cliente"
                    dica={client?.tier ? `Atual: ${client.tier === 'START' ? 'Start' : client.tier === 'GROWTH' ? 'Growth' : 'Scale'}${client.tierManual ? ' (manual)' : ' (automático)'}` : 'Ainda não classificado'}
                  >
                    <select value={form.tier} onChange={(e) => setField('tier', e.target.value)} className={campo}>
                      <option value="AUTO">Automático (pela faixa de ticket)</option>
                      <option value="START">Start</option>
                      <option value="GROWTH">Growth</option>
                      <option value="SCALE">Scale</option>
                    </select>
                  </Campo>
                  {/* Grupo manual prevalece sobre o automático até ser devolvido
                      para "Automático"; o motivo entra no histórico do cliente. */}
                  {form.tier !== 'AUTO' && (
                    <Campo rotulo="Motivo da classificação manual" className="sm:col-span-2">
                      <input
                        value={form.tierReason}
                        onChange={(e) => setField('tierReason', e.target.value)}
                        className={campo}
                        placeholder="Motivo da classificação manual (opcional)"
                        maxLength={300}
                      />
                    </Campo>
                  )}
                </div>
              </SecaoForm>

              {/* Serviços */}
              <SecaoForm
                titulo="Serviços Contratados"
                icone={Layers}
                acoes={(
                  <p className="t-rotulo text-muted-foreground text-right">
                    Total mensal<br />
                    <span className="font-display text-[17px] font-semibold tabular text-foreground">{formatCurrency(totalMensal)}</span>
                  </p>
                )}
              >
                {services.length === 0 ? (
                  <p className="t-corpo text-muted-foreground text-center py-4 rounded-[16px] border border-dashed border-border">Nenhum serviço contratado cadastrado.</p>
                ) : (
                  <div className="space-y-3">
                    {services.map((service, i) => (
                      <div key={service.id ?? `new-${i}`} className="rounded-[16px] border border-border bg-secondary/40 p-4">
                        <div className="flex gap-3 items-start">
                          <span className="mt-2 w-6 h-6 shrink-0 grid place-items-center rounded-full bg-card border border-border text-[11.5px] font-semibold text-muted-foreground tabular">{i + 1}</span>
                          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <input
                              value={service.serviceName}
                              onChange={(e) => updateService(i, 'serviceName', e.target.value)}
                              className={campo} placeholder="Nome do serviço *"
                              aria-label={`Nome do serviço ${i + 1}`}
                            />
                            <CurrencyInput
                              value={service.monthlyValue}
                              onChange={(v) => updateService(i, 'monthlyValue', v)}
                              ariaLabel={`Valor mensal do serviço ${i + 1}`}
                              className={campo}
                            />
                            <input
                              value={service.description}
                              onChange={(e) => updateService(i, 'description', e.target.value)}
                              className={`${campo} sm:col-span-2`} placeholder="Descrição do serviço (opcional)"
                              aria-label={`Descrição do serviço ${i + 1}`}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (service.id && !confirm(`Remover o serviço "${service.serviceName}"? A remoção é aplicada ao salvar.`)) return
                              removeService(i)
                            }}
                            title="Remover serviço"
                            aria-label={`Remover serviço ${i + 1}`}
                            className="mt-1 p-2 text-muted-foreground hover:text-destructive-texto hover:bg-destructive-suave rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <Button type="button" variant="outline" size="sm" onClick={addService} className="mt-4">
                  <Plus /> Adicionar outro serviço
                </Button>
              </SecaoForm>

              {/* Faturamento e NFS-e */}
              <ClientBillingSection
                clientId={id}
                form={billing}
                onChange={setBillingField}
                asaas={asaasInfo}
                cnpj={form.cnpj}
                email={form.email}
              />

              <ClientLinksFields value={form} onChange={setField} />
            </div>

            <div className="space-y-5 min-w-0">
              {/* Contrato */}
              <SecaoForm titulo="Contrato" icone={FileSignature}>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4">
                  <Campo rotulo="Início do Contrato">
                    <input type="date" value={form.contractStart} onChange={(e) => setField('contractStart', e.target.value)} className={campo} />
                  </Campo>
                  <Campo rotulo="Duração (meses)">
                    <input type="number" min="1" value={form.contractMonths} onChange={(e) => setField('contractMonths', e.target.value)} className={campo} placeholder="Ex: 12" />
                  </Campo>
                  <Campo rotulo="Fim do Contrato">
                    <input type="date" value={form.contractEnd} onChange={(e) => setField('contractEnd', e.target.value)} className={campo} />
                  </Campo>
                  <Campo rotulo="Dia de Pagamento">
                    <input type="number" min="1" max="31" value={form.paymentDay} onChange={(e) => setField('paymentDay', e.target.value)} className={campo} placeholder="Ex: 10" />
                  </Campo>
                  <Campo rotulo="Valor total mensal" dica="Calculado automaticamente pela soma dos serviços." className="sm:col-span-2 xl:col-span-1">
                    <div className={campoLeitura}>{formatCurrency(totalMensal)}</div>
                  </Campo>
                </div>
              </SecaoForm>

              {/* Aviso de demanda concluída no grupo do cliente */}
              <ClientAvisoSection form={aviso} onChange={setAvisoField} />

              {/* Observações */}
              <SecaoForm titulo="Observações" icone={StickyNote}>
                <textarea
                  value={form.notes}
                  onChange={(e) => setField('notes', e.target.value)}
                  rows={5}
                  className={campoTexto}
                  aria-label="Observações"
                  placeholder="Notas internas sobre o cliente..."
                />
              </SecaoForm>
            </div>
          </div>

          {/* Actions */}
          <RodapeForm
            aviso={error ? (
              <span className="inline-block font-medium text-destructive-texto bg-destructive-suave rounded-lg px-3 py-1.5">{error}</span>
            ) : <span className="-ml-3 inline-block">{botaoExcluir}</span>}
          >
            {error && botaoExcluir}
            <Button asChild variant="ghost">
              <Link href={`/clientes/${id}`}>Cancelar</Link>
            </Button>
            <Button type="submit" disabled={saving}>
              <Save />
              {saving ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </RodapeForm>
        </form>
      </div>
    </div>
  )
}
