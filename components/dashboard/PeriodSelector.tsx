'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function hojeSP() {
  const [y, m] = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).split('-').map(Number)
  return { year: y, month: m }
}

const caixa = 'h-9 rounded-lg border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

/**
 * Seleção do período do Dashboard: mensal ou anual, com navegação e atalho
 * para o período atual. Fica na URL, então recarregar ou compartilhar o
 * endereço mantém o que estava sendo visto.
 *
 * O mês se escolhe num painel próprio (ano + grade de meses): o campo nativo
 * `type="month"` não abre no Firefox nem no Safari.
 */
export default function PeriodSelector({
  view, year, month, isCurrent, referenceDate,
}: {
  view: 'mensal' | 'anual'
  year: number
  month: number | null
  isCurrent: boolean
  referenceDate: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [aberto, setAberto] = useState(false)
  const [anoDoPainel, setAnoDoPainel] = useState(year)
  const painel = useRef<HTMLDivElement>(null)

  const push = useCallback((next: { view?: 'mensal' | 'anual'; year?: number; month?: number | null }) => {
    const q = new URLSearchParams(params.toString())
    const v = next.view ?? view
    q.set('visao', v)
    q.set('ano', String(next.year ?? year))
    if (v === 'mensal') q.set('mes', String(next.month ?? month ?? hojeSP().month))
    else q.delete('mes')
    router.replace(`${pathname}?${q.toString()}`, { scroll: false })
  }, [params, router, pathname, view, year, month])

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (!painel.current?.contains(e.target as Node)) setAberto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [aberto])

  function trocarVisao(v: 'mensal' | 'anual') {
    if (v === view) return
    // Voltando para o mensal: o mês de hoje se o ano é o atual; senão, janeiro
    const hoje = hojeSP()
    push({ view: v, month: v === 'mensal' ? (year === hoje.year ? hoje.month : 1) : null })
  }

  function shift(delta: number) {
    if (view === 'anual') { push({ year: year + delta }); return }
    const d = new Date(Date.UTC(year, (month ?? 1) - 1 + delta, 1))
    push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 })
  }

  function agora() {
    const hoje = hojeSP()
    push({ year: hoje.year, month: view === 'mensal' ? hoje.month : null })
  }

  const rotulo = view === 'anual' ? `Ano de ${year}` : `${MESES[(month ?? 1) - 1]} de ${year}`
  const refFmt = referenceDate.split('-').reverse().join('/')
  const hoje = hojeSP()

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-0.5 bg-secondary rounded-lg p-0.5" role="group" aria-label="Visão">
        {(['mensal', 'anual'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => trocarVisao(v)}
            aria-pressed={view === v}
            className={`h-8 px-3 rounded-md t-rotulo transition-colors ${view === v ? 'bg-card text-foreground shadow-[0_0_0_1px_var(--border)]' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {v === 'mensal' ? 'Mensal' : 'Anual'}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <button type="button" onClick={() => shift(-1)} aria-label={view === 'anual' ? 'Ano anterior' : 'Mês anterior'} className={`${caixa} w-9 grid place-items-center`}>
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="relative" ref={painel}>
          <button
            type="button"
            onClick={() => { setAnoDoPainel(year); setAberto((a) => !a) }}
            aria-haspopup="dialog"
            aria-expanded={aberto}
            className={`${caixa} min-w-[180px] px-3 inline-flex items-center justify-between gap-2 text-foreground`}
          >
            <span className="t-corpo font-semibold">{rotulo}</span>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${aberto ? 'rotate-180' : ''}`} />
          </button>

          {aberto && (
            <div role="dialog" aria-label="Escolher período" className="absolute left-0 top-full mt-1 z-30 w-[260px] rounded-[12px] border border-border bg-card p-3 shadow-[0_8px_24px_rgb(16_24_40/0.12)]">
              <div className="flex items-center justify-between mb-2">
                <button type="button" onClick={() => setAnoDoPainel((a) => a - 1)} aria-label="Ano anterior" className="w-8 h-8 grid place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="t-secao text-foreground tabular">{anoDoPainel}</span>
                <button type="button" onClick={() => setAnoDoPainel((a) => a + 1)} aria-label="Próximo ano" className="w-8 h-8 grid place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              {view === 'mensal' ? (
                <div className="grid grid-cols-3 gap-1">
                  {MESES.map((nome, i) => {
                    const sel = anoDoPainel === year && i + 1 === month
                    const atual = anoDoPainel === hoje.year && i + 1 === hoje.month
                    return (
                      <button
                        key={nome}
                        type="button"
                        onClick={() => { push({ year: anoDoPainel, month: i + 1 }); setAberto(false) }}
                        aria-current={sel ? 'date' : undefined}
                        className={`h-9 rounded-md t-rotulo transition-colors ${
                          sel ? 'bg-marca text-white' : atual ? 'bg-marca-suave text-marca-texto' : 'text-foreground hover:bg-accent'
                        }`}
                      >
                        {nome.slice(0, 3)}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { push({ year: anoDoPainel }); setAberto(false) }}
                  className="w-full h-9 rounded-md bg-primary text-primary-foreground t-rotulo"
                >
                  Ver o ano de {anoDoPainel}
                </button>
              )}
            </div>
          )}
        </div>

        <button type="button" onClick={() => shift(1)} aria-label={view === 'anual' ? 'Próximo ano' : 'Próximo mês'} className={`${caixa} w-9 grid place-items-center`}>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {!isCurrent && (
        <button type="button" onClick={agora} className={`${caixa} px-3 inline-flex items-center gap-1.5 t-rotulo`}>
          <CalendarDays className="w-3.5 h-3.5" /> {view === 'anual' ? 'Ano atual' : 'Mês atual'}
        </button>
      )}

      <span className="t-legenda">
        {isCurrent ? `Até hoje, ${refFmt}` : `Fechado em ${refFmt}`}
      </span>
    </div>
  )
}
