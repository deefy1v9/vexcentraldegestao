'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/layout/Header'
import CurrencyInput from '@/components/ui/CurrencyInput'
import { formatCurrency } from '@/lib/utils'
import { Plus, Trash2, ArrowLeft, Building2, FileSignature, Layers, StickyNote, Save } from 'lucide-react'
import Link from 'next/link'
import ClientLinksFields from '@/components/clientes/ClientLinksFields'
import { Button } from '@/components/vex/button'
import { Campo, RodapeForm, SecaoForm, campo, campoLeitura, campoTexto } from '@/components/clientes/FormSecao'

interface ServiceForm {
  serviceName: string
  description: string
  monthlyValue: number | null
}

const EMPTY_SERVICE: ServiceForm = { serviceName: '', description: '', monthlyValue: null }

export default function NovoClientePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [services, setServices] = useState<ServiceForm[]>([{ ...EMPTY_SERVICE }])
  const [form, setForm] = useState({
    name: '', cnpj: '', email: '', phone: '', niche: '',
    contractStart: '', contractMonths: '',
    paymentDay: '', status: 'ATIVO', notes: '',
    website: '', instagram: '', facebook: '', linkedin: '', youtube: '', tiktok: '',
  })

  // Valor total mensal: somatório automático dos serviços, somente leitura
  const totalMensal = services.reduce((sum, s) => sum + (s.monthlyValue ?? 0), 0)

  function setField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function addService() {
    setServices((prev) => [...prev, { ...EMPTY_SERVICE }])
  }

  function removeService(i: number) {
    setServices((prev) => prev.filter((_, idx) => idx !== i))
  }

  function updateService<K extends keyof ServiceForm>(i: number, field: K, value: ServiceForm[K]) {
    setServices((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          contractMonths: form.contractMonths ? Number(form.contractMonths) : null,
          paymentDay: form.paymentDay ? Number(form.paymentDay) : null,
          services: services.filter((s) => s.serviceName.trim()),
        }),
      })
      if (res.ok) {
        const created = await res.json()
        // Cliente criado → abre direto o perfil dele
        router.push(`/clientes/${created.id}`)
      } else {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Erro ao cadastrar cliente. Verifique os campos e tente de novo.')
        setLoading(false)
      }
    } catch {
      setError('Falha de conexão. Tente de novo.')
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Novo Cliente"
        subtitle="Preencha os dados do cliente"
        acoes={(
          <Button asChild variant="ghost">
            <Link href="/clientes"><ArrowLeft /> Voltar</Link>
          </Button>
        )}
      />
      <div className="relative flex-1 overflow-y-auto px-4 sm:px-8 pt-2">
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
            <div className="space-y-5 min-w-0">
              {/* Dados Gerais */}
              <SecaoForm rotulo="Passo 1" titulo="Dados Gerais" sub="O essencial para identificar o cliente." icone={Building2}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Campo rotulo="Nome do Cliente" obrigatorio className="sm:col-span-2">
                    <input required value={form.name} onChange={(e) => setField('name', e.target.value)}
                      className={campo} placeholder="Ex: Empresa XYZ" />
                  </Campo>
                  <Campo rotulo="CNPJ">
                    <input value={form.cnpj} onChange={(e) => setField('cnpj', e.target.value)}
                      className={campo} placeholder="00.000.000/0001-00" />
                  </Campo>
                  <Campo rotulo="Nicho/Segmento">
                    <input value={form.niche} onChange={(e) => setField('niche', e.target.value)}
                      className={campo} placeholder="Ex: E-commerce, Saúde..." />
                  </Campo>
                  <Campo rotulo="Email">
                    <input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)}
                      className={campo} placeholder="contato@empresa.com" />
                  </Campo>
                  <Campo rotulo="Telefone">
                    <input value={form.phone} onChange={(e) => setField('phone', e.target.value)}
                      className={campo} placeholder="(11) 99999-9999" />
                  </Campo>
                  <Campo rotulo="Status">
                    <select value={form.status} onChange={(e) => setField('status', e.target.value)} className={campo}>
                      <option value="ATIVO">Ativo</option>
                      <option value="INATIVO">Inativo</option>
                      <option value="PAUSADO">Pausado</option>
                    </select>
                  </Campo>
                </div>
              </SecaoForm>

              {/* Serviços */}
              <SecaoForm
                rotulo="Passo 2"
                titulo="Serviços Contratados"
                sub="Cadastre cada serviço com nome, valor mensal e descrição."
                icone={Layers}
                acoes={(
                  <p className="t-rotulo text-muted-foreground text-right">
                    Total mensal<br />
                    <span className="font-display text-[17px] font-semibold tabular text-foreground">{formatCurrency(totalMensal)}</span>
                  </p>
                )}
              >
                <div className="space-y-3">
                  {services.map((service, i) => (
                    <div key={i} className="rounded-[16px] border border-border bg-secondary/40 p-4">
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
                        {services.length > 1 && (
                          <button type="button" onClick={() => removeService(i)}
                            title="Remover serviço"
                            aria-label={`Remover serviço ${i + 1}`}
                            className="mt-1 p-2 text-muted-foreground hover:text-destructive-texto hover:bg-destructive-suave rounded-lg transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addService} className="mt-4">
                  <Plus /> Adicionar outro serviço
                </Button>
              </SecaoForm>

              <ClientLinksFields value={form} onChange={setField} />
            </div>

            <div className="space-y-5 min-w-0">
              {/* Contrato */}
              <SecaoForm titulo="Contrato e Financeiro" icone={FileSignature}>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4">
                  <Campo rotulo="Início do Contrato">
                    <input type="date" value={form.contractStart} onChange={(e) => setField('contractStart', e.target.value)}
                      className={campo} />
                  </Campo>
                  <Campo rotulo="Duração (meses)">
                    <input type="number" min="1" value={form.contractMonths} onChange={(e) => setField('contractMonths', e.target.value)}
                      className={campo} placeholder="Ex: 12" />
                  </Campo>
                  <Campo rotulo="Dia de Pagamento">
                    <input type="number" min="1" max="31" value={form.paymentDay} onChange={(e) => setField('paymentDay', e.target.value)}
                      className={campo} placeholder="Ex: 10" />
                  </Campo>
                  <Campo rotulo="Valor total mensal" dica="Calculado automaticamente pela soma dos serviços.">
                    <div className={campoLeitura}>{formatCurrency(totalMensal)}</div>
                  </Campo>
                  {form.contractStart && form.contractMonths && (
                    <p className="sm:col-span-2 xl:col-span-1 t-rotulo text-muted-foreground rounded-xl bg-secondary/60 px-3 py-2">
                      Fim do contrato:{' '}
                      <span className="font-semibold text-foreground">
                        {new Date(
                          new Date(form.contractStart).setMonth(
                            new Date(form.contractStart).getMonth() + Number(form.contractMonths)
                          )
                        ).toLocaleDateString('pt-BR')}
                      </span>
                    </p>
                  )}
                </div>
              </SecaoForm>

              {/* Observações */}
              <SecaoForm titulo="Observações" icone={StickyNote}>
                <textarea
                  value={form.notes} onChange={(e) => setField('notes', e.target.value)}
                  rows={5} className={campoTexto}
                  aria-label="Observações"
                  placeholder="Anotações internas sobre o cliente..."
                />
              </SecaoForm>
            </div>
          </div>

          <RodapeForm
            aviso={error ? (
              <span className="inline-block font-medium text-destructive-texto bg-destructive-suave rounded-lg px-3 py-1.5">{error}</span>
            ) : 'Campos com * são obrigatórios.'}
          >
            <Button asChild variant="ghost">
              <Link href="/clientes">Cancelar</Link>
            </Button>
            <Button type="submit" disabled={loading}>
              <Save /> {loading ? 'Salvando...' : 'Cadastrar Cliente'}
            </Button>
          </RodapeForm>
        </form>
      </div>
    </div>
  )
}
