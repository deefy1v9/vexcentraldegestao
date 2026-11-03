'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDownCircle, ArrowUpCircle, Loader2, Plus, Trash2, Wallet } from 'lucide-react'
import { CASH_KINDS, brlFromCents, cashLabel, parseAmountCents, type CashKind } from '@/lib/caixa-core'
import { Button } from '@/components/vex/button'
import { Destaque, Kpi, Painel } from '@/components/vex/vireo'

interface Movimento {
  id: string
  kind: string
  amountCents: number
  description: string
  category: string | null
  account: string | null
  date: string
  source: string
  notes: string | null
  partner: { id: string; name: string } | null
  createdBy: { id: string; name: string } | null
}

interface Dados {
  movimentos: Movimento[]
  socios: Array<{ id: string; name: string }>
  saldoCents: number
  totaisDoPeriodo: { entradasCents: number; saidasCents: number; retiradasCents: number; aportesCents: number; saldoCents: number }
  retiradasPorSocio: Array<{ nome: string; cents: number }>
}

const hojeISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

export default function CaixaPanel() {
  const [mes, setMes] = useState(() => hojeISO().slice(0, 7))
  const [dados, setDados] = useState<Dados | null>(null)
  const [loading, setLoading] = useState(true)
  const [novo, setNovo] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(() => {
    return fetch(`/api/caixa?mes=${mes}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('falhou'))))
      .then((d: Dados) => setDados(d))
      .catch(() => setErro('Não consegui carregar o caixa.'))
      .finally(() => setLoading(false))
  }, [mes])

  useEffect(() => { carregar() }, [carregar])

  const mesLabel = useMemo(() => {
    const [y, m] = mes.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  }, [mes])

  if (loading && !dados) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="w-4 h-4 animate-spin" /> Carregando caixa...</div>
  }

  const t = dados?.totaisDoPeriodo
  const entra = (kind: string) => kind === 'ENTRADA' || kind === 'APORTE'

  return (
    <div className="space-y-5">
      {/* Saldo do caixa no cartão de destaque, com o mês e o lançamento à direita */}
      <Destaque
        rotulo="Saldo do caixa"
        titulo={<span className={(dados?.saldoCents ?? 0) < 0 ? 'text-destructive-texto' : undefined}>{brlFromCents(dados?.saldoCents ?? 0)}</span>}
        sub="Soma de tudo que já entrou e saiu, desde o primeiro lançamento."
        acoes={
          <>
            <input
              type="month"
              aria-label="Mês do caixa"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="h-10 rounded-xl border border-border bg-card px-3 text-[13px] font-semibold text-foreground outline-none focus:border-marca"
            />
            <Button type="button" onClick={() => { setNovo(true); setErro('') }} className="h-10 rounded-xl">
              <Plus /> Lançar
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <Kpi icone={ArrowUpCircle} tom="sucesso" rotulo="Entrou" valor={brlFromCents(t?.entradasCents ?? 0)} nota={`em ${mesLabel}`} />
        <Kpi icone={ArrowDownCircle} tom="perigo" rotulo="Saiu" valor={brlFromCents(t?.saidasCents ?? 0)} nota={`em ${mesLabel}`} />
        <Kpi icone={Wallet} tom="atencao" rotulo="Retiradas dos sócios" valor={brlFromCents(t?.retiradasCents ?? 0)} nota={`em ${mesLabel}`} />
        <Kpi icone={Wallet} tom={(t?.saldoCents ?? 0) < 0 ? 'perigo' : 'sucesso'} rotulo="Resultado do mês" valor={brlFromCents(t?.saldoCents ?? 0)} alerta={(t?.saldoCents ?? 0) < 0} nota={`em ${mesLabel}`} />
      </div>

      {(dados?.retiradasPorSocio.length ?? 0) > 0 && (
        <Painel rotulo="Sócios" titulo={`Retiradas em ${mesLabel}`}>
          <div className="flex flex-wrap gap-3 -mt-1">
            {dados!.retiradasPorSocio.map((r) => (
              <span key={r.nome} className="inline-flex items-center gap-2 rounded-xl bg-secondary/60 px-3 py-2 text-[13px] text-foreground">
                <b className="font-semibold">{r.nome}</b> <span className="font-display font-semibold tabular-nums">{brlFromCents(r.cents)}</span>
              </span>
            ))}
          </div>
        </Painel>
      )}

      {erro && <p className="text-[13px] text-destructive-texto bg-destructive-suave rounded-2xl px-4 py-3">{erro}</p>}

      {novo && dados && (
        <NovoLancamento
          socios={dados.socios}
          onClose={() => setNovo(false)}
          onSaved={async () => { setNovo(false); setLoading(true); await carregar() }}
          setErro={setErro}
        />
      )}

      <Painel rotulo="Extrato" titulo="Movimentos do mês" sub={mesLabel} semPadding className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground bg-secondary/60">
              <tr className="border-y border-border">
                <th className="text-left font-semibold px-6 py-3">Data</th>
                <th className="text-left font-semibold px-3 py-3">Tipo</th>
                <th className="text-left font-semibold px-3 py-3">Descrição</th>
                <th className="text-right font-semibold px-3 py-3">Valor</th>
                <th className="px-6 py-3"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(dados?.movimentos ?? []).map((m) => (
                <tr key={m.id} className="hover:bg-secondary/40 transition-colors">
                  <td className="px-6 py-4 text-[13px] text-muted-foreground whitespace-nowrap tabular-nums">{new Date(m.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</td>
                  <td className="px-3 py-4">
                    <span className={`text-[11.5px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${
                      entra(m.kind) ? 'bg-success-suave text-success'
                      : m.kind === 'RETIRADA' ? 'bg-warning-suave text-warning' : 'bg-destructive-suave text-destructive-texto'}`}>
                      {cashLabel(m.kind)}
                    </span>
                  </td>
                  <td className="px-3 py-4 text-[13px] text-foreground">
                    {m.description}
                    {m.partner && <span className="text-muted-foreground"> · {m.partner.name}</span>}
                    {m.source === 'IA' && <span className="text-[11px] font-semibold text-ia"> · pela IA</span>}
                  </td>
                  <td className={`px-3 py-4 text-right font-display text-[14px] font-semibold whitespace-nowrap tabular-nums ${entra(m.kind) ? 'text-success' : 'text-destructive-texto'}`}>
                    {entra(m.kind) ? '+' : '−'} {brlFromCents(m.amountCents)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={async () => {
                        if (!confirm(`Remover "${m.description}" do caixa?`)) return
                        const r = await fetch(`/api/caixa/${m.id}`, { method: 'DELETE' })
                        if (r.ok) { setLoading(true); await carregar() } else setErro('Não consegui remover.')
                      }}
                      className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive-suave hover:text-destructive-texto transition-colors"
                      aria-label="Remover"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {(dados?.movimentos.length ?? 0) === 0 && (
                <tr><td colSpan={5} className="px-6 py-14 text-center t-legenda">Nenhum lançamento em {mesLabel}.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Painel>
    </div>
  )
}

const CAMPO = 'w-full h-10 border border-border rounded-xl px-3 text-[13px] text-foreground bg-card outline-none focus:border-marca'
const ROTULO = 'block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1'

function NovoLancamento({ socios, onClose, onSaved, setErro }: {
  socios: Array<{ id: string; name: string }>
  onClose: () => void
  onSaved: () => void | Promise<void>
  setErro: (v: string) => void
}) {
  const [form, setForm] = useState({
    kind: 'SAIDA' as CashKind, valor: '', description: '', date: hojeISO(),
    partnerId: '', category: '', account: '',
  })
  const [salvando, setSalvando] = useState(false)
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))

  const salvar = async () => {
    const cents = parseAmountCents(form.valor)
    if (!cents) { setErro('Informe um valor válido, por exemplo 1.500,00'); return }
    setSalvando(true)
    setErro('')
    const r = await fetch('/api/caixa', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...form, amountCents: cents, partnerId: form.partnerId || null }),
    })
    setSalvando(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErro(d.error ?? 'Não consegui lançar.'); return }
    await onSaved()
  }

  return (
    <Painel rotulo="Caixa" titulo="Novo lançamento">
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className={ROTULO}>Tipo</label>
            <select value={form.kind} onChange={(e) => set('kind', e.target.value as CashKind)} className={CAMPO}>
              {CASH_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
          </div>
          <div>
            <label className={ROTULO}>Valor</label>
            <input value={form.valor} onChange={(e) => set('valor', e.target.value)} placeholder="1.500,00" className={CAMPO} />
          </div>
          <div>
            <label className={ROTULO}>Data</label>
            <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} className={CAMPO} />
          </div>
          {(form.kind === 'RETIRADA' || form.kind === 'APORTE') && (
            <div>
              <label className={ROTULO}>Sócio</label>
              <select value={form.partnerId} onChange={(e) => set('partnerId', e.target.value)} className={CAMPO}>
                <option value="">Escolha</option>
                {socios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className={ROTULO}>Do que se trata</label>
            <input
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Pró-labore de setembro, plano de saúde, recebimento da Promo Prime..."
              className={CAMPO}
            />
          </div>
          <div>
            <label className={ROTULO}>Conta (opcional)</label>
            <input value={form.account} onChange={(e) => set('account', e.target.value)} placeholder="Nubank, Asaas..." className={CAMPO} />
          </div>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Button type="button" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Lançar no caixa'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
        </div>
      </div>
    </Painel>
  )
}
