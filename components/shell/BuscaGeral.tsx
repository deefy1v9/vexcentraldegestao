'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CornerDownLeft, Search, Building2, ListChecks, Handshake, FileText } from 'lucide-react'
import type { NavSection } from './nav-config'

type Resultado = { tipo: string; titulo: string; detalhe: string; href: string; icone: React.ElementType }

const ICONE: Record<string, React.ElementType> = { Cliente: Building2, Demanda: ListChecks, Oportunidade: Handshake, Proposta: FileText }

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * A busca geral (Ctrl K ou o "Buscar…" do menu): as telas do menu na hora e,
 * do servidor, clientes, demandas, oportunidades e propostas. Setas escolhem,
 * Enter abre, Esc fecha.
 */
export function BuscaGeral({ secoes, aoFechar }: { secoes: NavSection[]; aoFechar: () => void }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const [doServidor, setDoServidor] = useState<{ q: string; itens: Resultado[] }>({ q: '', itens: [] })

  const telas: Resultado[] = useMemo(() => secoes
    .flatMap((s) => s.items.map((i) => ({ tipo: 'Tela', titulo: i.label, detalhe: `${s.label} · ${i.hint}`, href: i.href, icone: i.icon })))
    .filter((i) => !q.trim() || norm(`${i.titulo} ${i.detalhe}`).includes(norm(q.trim()))), [secoes, q])

  useEffect(() => {
    const termo = q.trim()
    if (termo.length < 2) return
    const ctl = new AbortController()
    const t = setTimeout(() => {
      fetch(`/api/busca?q=${encodeURIComponent(termo)}`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((d: { resultados?: Array<Omit<Resultado, 'icone'>> }) => setDoServidor({ q: termo, itens: (d.resultados ?? []).map((r) => ({ ...r, icone: ICONE[r.tipo] ?? Search })) }))
        .catch(() => {})
    }, 200)
    return () => { clearTimeout(t); ctl.abort() }
  }, [q])

  const servidor = doServidor.q === q.trim() ? doServidor.itens : []
  const itens = [...(q.trim() ? telas.slice(0, 4) : telas), ...servidor]
  const buscando = q.trim().length >= 2 && doServidor.q !== q.trim()

  function ir(href: string) { aoFechar(); router.push(href) }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh] px-4" role="dialog" aria-modal aria-label="Buscar na Central">
      <button aria-label="Fechar" onClick={aoFechar} className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]" />
      <div className="relative w-full max-w-[600px] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 h-14 border-b border-border">
          <Search className="w-5 h-5 text-muted-foreground" strokeWidth={1.75} />
          <input
            autoFocus
            value={q}
            onChange={(e) => { setQ(e.target.value); setSel(0) }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') aoFechar()
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((v) => Math.min(itens.length - 1, v + 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSel((v) => Math.max(0, v - 1)) }
              if (e.key === 'Enter' && itens[sel]) ir(itens[sel].href)
            }}
            placeholder="Buscar cliente, demanda, proposta ou tela…"
            className="flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <span className="rounded-md border border-border px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground">Esc</span>
        </div>
        <ul className="max-h-[420px] overflow-y-auto p-2">
          {itens.length === 0 && (
            <li className="px-3 py-8 text-center t-corpo text-muted-foreground">{buscando ? 'Buscando…' : 'Nada encontrado.'}</li>
          )}
          {itens.map((i, n) => {
            const Icone = i.icone
            const ativo = n === sel
            return (
              <li key={`${i.tipo}-${i.href}`}>
                <button
                  type="button"
                  onMouseEnter={() => setSel(n)}
                  onClick={() => ir(i.href)}
                  className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${ativo ? 'bg-marca-suave' : 'hover:bg-secondary'}`}
                >
                  <span className={`w-9 h-9 shrink-0 rounded-lg grid place-items-center ${ativo ? 'bg-marca text-white' : 'bg-secondary text-muted-foreground'}`}><Icone className="w-[18px] h-[18px]" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold text-foreground truncate">{i.titulo}</span>
                    <span className="block text-[12px] text-muted-foreground truncate">{i.tipo}{i.detalhe ? ` · ${i.detalhe}` : ''}</span>
                  </span>
                  {ativo && <CornerDownLeft className="w-4 h-4 text-marca-texto shrink-0" />}
                </button>
              </li>
            )
          })}
          {buscando && itens.length > 0 && <li className="px-3 py-2 t-legenda">Buscando clientes e demandas…</li>}
        </ul>
      </div>
    </div>
  )
}
