'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDownCircle, ArrowUpCircle, Loader2, Plus, Trash2, Wallet } from 'lucide-react'
import { CASH_KINDS, brlFromCents, cashLabel, parseAmountCents, type CashKind } from '@/lib/caixa-core'

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
    return <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Carregando caixa...</div>
  }

  const t = dados?.totaisDoPeriodo

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs text-gray-500">Saldo do caixa</p>
          <p className={`text-2xl font-bold ${(dados?.saldoCents ?? 0) < 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {brlFromCents(dados?.saldoCents ?? 0)}
          </p>
          <p className="text-[10px] text-gray-400">Soma de tudo que já entrou e saiu, desde o primeiro lançamento.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-2 text-xs text-gray-700 outline-none focus:border-[#030A8C] bg-white"
          />
          <button
            onClick={() => { setNovo(true); setErro('') }}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#030A8C] text-white text-xs font-semibold rounded-lg hover:bg-[#02077a] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Lançar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Entrou" value={t?.entradasCents ?? 0} tone="green" icon={ArrowUpCircle} />
        <Tile label="Saiu" value={t?.saidasCents ?? 0} tone="red" icon={ArrowDownCircle} />
        <Tile label="Retiradas dos sócios" value={t?.retiradasCents ?? 0} tone="amber" icon={Wallet} />
        <Tile label="Resultado do mês" value={t?.saldoCents ?? 0} tone={(t?.saldoCents ?? 0) < 0 ? 'red' : 'green'} icon={Wallet} />
      </div>

      {(dados?.retiradasPorSocio.length ?? 0) > 0 && (
        <div className="card p-3">
          <p className="text-xs font-semibold text-gray-600 mb-2">Retiradas em {mesLabel}</p>
          <div className="flex flex-wrap gap-3">
            {dados!.retiradasPorSocio.map((r) => (
              <span key={r.nome} className="text-xs text-gray-700">
                <b>{r.nome}</b> {brlFromCents(r.cents)}
              </span>
            ))}
          </div>
        </div>
      )}

      {erro && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}

      {novo && dados && (
        <NovoLancamento
          socios={dados.socios}
          onClose={() => setNovo(false)}
          onSaved={async () => { setNovo(false); setLoading(true); await carregar() }}
          setErro={setErro}
        />
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left font-medium px-3 py-2">Data</th>
              <th className="text-left font-medium px-3 py-2">Tipo</th>
              <th className="text-left font-medium px-3 py-2">Descrição</th>
              <th className="text-right font-medium px-3 py-2">Valor</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {(dados?.movimentos ?? []).map((m) => (
              <tr key={m.id} className="border-t border-gray-100">
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{new Date(m.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</td>
                <td className="px-3 py-2">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                    m.kind === 'ENTRADA' || m.kind === 'APORTE' ? 'bg-green-100 text-green-700'
                    : m.kind === 'RETIRADA' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                    {cashLabel(m.kind)}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-800">
                  {m.description}
                  {m.partner && <span className="text-gray-400"> · {m.partner.name}</span>}
                  {m.source === 'IA' && <span className="text-[10px] text-purple-600"> · pela IA</span>}
                </td>
                <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${m.kind === 'ENTRADA' || m.kind === 'APORTE' ? 'text-green-700' : 'text-red-600'}`}>
                  {m.kind === 'ENTRADA' || m.kind === 'APORTE' ? '+' : '−'} {brlFromCents(m.amountCents)}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={async () => {
                      if (!confirm(`Remover "${m.description}" do caixa?`)) return
                      const r = await fetch(`/api/caixa/${m.id}`, { method: 'DELETE' })
                      if (r.ok) { setLoading(true); await carregar() } else setErro('Não consegui remover.')
                    }}
                    className="text-gray-300 hover:text-red-500 transition-colors"
                    aria-label="Remover"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {(dados?.movimentos.length ?? 0) === 0 && (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-400">Nenhum lançamento em {mesLabel}.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Tile({ label, value, tone, icon: Icon }: { label: string; value: number; tone: 'green' | 'red' | 'amber'; icon: React.ElementType }) {
  const cor = tone === 'green' ? 'text-green-700' : tone === 'red' ? 'text-red-600' : 'text-amber-700'
  return (
    <div className="card p-3">
      <p className="text-[10px] text-gray-500 flex items-center gap-1"><Icon className="w-3 h-3" /> {label}</p>
      <p className={`text-base font-bold ${cor}`}>{brlFromCents(value)}</p>
    </div>
  )
}

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
    <div className="card p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="block text-[10px] text-gray-500 mb-1">Tipo</label>
          <select
            value={form.kind}
            onChange={(e) => set('kind', e.target.value as CashKind)}
            className="w-full border border-gray-200 rounded-lg px-2 py-2 text-xs text-gray-900 outline-none focus:border-[#030A8C] bg-white"
          >
            {CASH_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 mb-1">Valor</label>
          <input
            value={form.valor}
            onChange={(e) => set('valor', e.target.value)}
            placeholder="1.500,00"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 outline-none focus:border-[#030A8C] bg-white"
          />
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 mb-1">Data</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => set('date', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2 py-2 text-xs text-gray-900 outline-none focus:border-[#030A8C] bg-white"
          />
        </div>
        {(form.kind === 'RETIRADA' || form.kind === 'APORTE') && (
          <div>
            <label className="block text-[10px] text-gray-500 mb-1">Sócio</label>
            <select
              value={form.partnerId}
              onChange={(e) => set('partnerId', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2 py-2 text-xs text-gray-900 outline-none focus:border-[#030A8C] bg-white"
            >
              <option value="">Escolha</option>
              {socios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-[10px] text-gray-500 mb-1">Do que se trata</label>
          <input
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Pró-labore de setembro, plano de saúde, recebimento da Promo Prime..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 outline-none focus:border-[#030A8C] bg-white"
          />
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 mb-1">Conta (opcional)</label>
          <input
            value={form.account}
            onChange={(e) => set('account', e.target.value)}
            placeholder="Nubank, Asaas..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 outline-none focus:border-[#030A8C] bg-white"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={salvar}
          disabled={salvando}
          className="px-4 py-2 bg-[#030A8C] text-white text-xs font-semibold rounded-lg hover:bg-[#02077a] disabled:opacity-40 transition-colors"
        >
          {salvando ? 'Salvando...' : 'Lançar no caixa'}
        </button>
        <button onClick={onClose} className="px-3 py-2 text-xs text-gray-500 hover:text-gray-700">Cancelar</button>
      </div>
    </div>
  )
}
