'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Wallet } from 'lucide-react'
import { brlFromCents } from '@/lib/caixa-core'

interface Saldo {
  competencia: string
  saldoCents: number
  entradasCents: number
  saidasCents: number
  retiradasCents: number
  retiradasPorSocio: Array<{ nome: string; cents: number }>
  temMovimento: boolean
  ultimo: { date: string; description: string } | null
}

/**
 * Saldo do caixa no azul da marca. Aparece no Dashboard e no Financeiro:
 * é o número que os sócios olham antes de dividir qualquer coisa.
 */
export default function CashBalanceCard({ mes, href = '/financeiro?aba=caixa' }: { mes?: string; href?: string }) {
  const [d, setD] = useState<Saldo | null>(null)
  const [erro, setErro] = useState(false)

  const carregar = useCallback(() => {
    return fetch(`/api/caixa/saldo${mes ? `?mes=${mes}` : ''}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('falhou'))))
      .then((j: Saldo) => setD(j))
      .catch(() => setErro(true))
  }, [mes])

  useEffect(() => { carregar() }, [carregar])

  if (erro) return null

  const negativo = (d?.saldoCents ?? 0) < 0

  return (
    <Link
      href={href}
      className="block rounded-2xl p-5 text-white shadow-sm transition-transform hover:-translate-y-0.5"
      style={{ backgroundImage: 'linear-gradient(135deg, #030A8C 0%, #1B2BC4 55%, #3B4DF0 100%)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70 flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5" /> Saldo do caixa
          </p>
          <p className={`text-3xl font-bold mt-1 ${negativo ? 'text-red-200' : 'text-white'}`}>
            {d ? brlFromCents(d.saldoCents) : '—'}
          </p>
          <p className="text-[11px] text-white/70 mt-1">
            {d?.temMovimento
              ? d.ultimo
                ? `Último lançamento: ${d.ultimo.description.slice(0, 48)} · ${new Date(d.ultimo.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}`
                : 'Tudo que entrou e saiu das contas da VEX'
              : 'Nenhum lançamento ainda. Comece pelo próximo recebimento.'}
          </p>
        </div>
        <ArrowUpRight className="w-4 h-4 text-white/60 shrink-0" />
      </div>

      {d && d.temMovimento && (
        <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/15">
          <div>
            <p className="text-[10px] text-white/60">Entrou no mês</p>
            <p className="text-sm font-semibold">{brlFromCents(d.entradasCents)}</p>
          </div>
          <div>
            <p className="text-[10px] text-white/60">Saiu no mês</p>
            <p className="text-sm font-semibold">{brlFromCents(d.saidasCents)}</p>
          </div>
          <div>
            <p className="text-[10px] text-white/60">Retiradas</p>
            <p className="text-sm font-semibold">{brlFromCents(d.retiradasCents)}</p>
          </div>
        </div>
      )}

      {d && d.retiradasPorSocio.length > 0 && (
        <p className="text-[10px] text-white/70 mt-3">
          {d.retiradasPorSocio.map((r) => `${r.nome.split(' ')[0]} ${brlFromCents(r.cents)}`).join(' · ')}
        </p>
      )}
    </Link>
  )
}
