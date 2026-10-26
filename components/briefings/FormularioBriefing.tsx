'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/vex/button'
import { Input } from '@/components/vex/input'
import { OUTRO_PREFIXO, progresso, type Pergunta, type Respostas } from '@/lib/briefing-core'

/**
 * O formulário que o cliente preenche. Guarda um rascunho no próprio
 * navegador (se fechar a aba, não perde o que escreveu) e mostra o erro ao
 * lado de cada campo. As senhas aparecem escondidas por padrão.
 */
function lerRascunho(chave: string): { respostas?: Respostas; outros?: Record<string, string> } {
  try { return JSON.parse(localStorage.getItem(chave) ?? 'null') ?? {} } catch { return {} }
}

/** Só roda no navegador (carregado com ssr: false em FormularioBriefingCliente). */
export default function FormularioBriefing({ token, perguntas }: { token: string; perguntas: Pergunta[] }) {
  const chave = `vex-briefing-${token}`
  const [respostas, setRespostas] = useState<Respostas>(() => lerRascunho(chave).respostas ?? {})
  const [outros, setOutros] = useState<Record<string, string>>(() => lerRascunho(chave).outros ?? {})
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [ver, setVer] = useState<Record<string, boolean>>({})
  const [isca, setIsca] = useState('')

  useEffect(() => {
    // Senha e CPF não ficam guardados no navegador
    const semSenha = Object.fromEntries(Object.entries(respostas).filter(([k]) => {
      const p = perguntas.find((x) => x.id === k)
      return p && p.tipo !== 'senha' && !p.sensivel
    }))
    try { localStorage.setItem(chave, JSON.stringify({ respostas: semSenha, outros })) } catch { /* navegador sem espaço */ }
  }, [chave, respostas, outros, perguntas])

  const final = useMemo(() => {
    // "Outro" vira "Outro: texto" no que vai para a Central
    const r: Respostas = { ...respostas }
    for (const p of perguntas) {
      if (!p.outro) continue
      const extra = (outros[p.id] ?? '').trim()
      const v = r[p.id]
      if (p.tipo === 'multipla') {
        const lista = (Array.isArray(v) ? v : []).filter((x) => x !== '__outro')
        if (Array.isArray(v) && v.includes('__outro') && extra) lista.push(OUTRO_PREFIXO + extra)
        r[p.id] = lista
      } else if (v === '__outro') r[p.id] = extra ? OUTRO_PREFIXO + extra : ''
    }
    return r
  }, [respostas, outros, perguntas])

  const { respondidas, total } = progresso(perguntas, final)

  const set = (id: string, v: string | string[]) => {
    setRespostas((r) => ({ ...r, [id]: v }))
    if (erros[id]) setErros((e) => { const n = { ...e }; delete n[id]; return n })
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErroGeral('')
    const faltando: Record<string, string> = {}
    for (const p of perguntas) {
      if (!p.obrigatoria || p.tipo === 'secao') continue
      const v = final[p.id]
      if (Array.isArray(v) ? v.length === 0 : !String(v ?? '').trim()) faltando[p.id] = p.tipo === 'multipla' ? 'Marque pelo menos uma opção.' : 'Resposta obrigatória.'
    }
    if (Object.keys(faltando).length) {
      setErros(faltando)
      setErroGeral('Faltam respostas obrigatórias. Os campos estão marcados em vermelho.')
      document.getElementById(`q-${Object.keys(faltando)[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setEnviando(true)
    try {
      const res = await fetch(`/api/b/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ respostas: final, site: isca }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErros(data.erros ?? {})
        setErroGeral(data.error ?? 'Não foi possível enviar. Tente de novo.')
        return
      }
      try { localStorage.removeItem(chave) } catch { /* nada */ }
      setEnviado(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      setErroGeral('Sem conexão. Confira a internet e tente de novo; suas respostas continuam aqui.')
    } finally {
      setEnviando(false)
    }
  }

  if (enviado) {
    return (
      <div className="mt-8 rounded-[12px] border border-border bg-card p-6 flex gap-3">
        <CheckCircle2 className="w-6 h-6 text-success shrink-0" />
        <div>
          <p className="font-medium text-foreground">Respostas enviadas. Obrigado!</p>
          <p className="mt-1 text-sm text-muted-foreground">A equipe da VEX já recebeu o seu briefing e entra em contato para os próximos passos.</p>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={enviar} className="mt-6 space-y-4" noValidate>
      <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-background/95 backdrop-blur">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>{respondidas} de {total} respondidas</span>
          <span>* obrigatória</span>
        </div>
        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${total ? Math.round((respondidas / total) * 100) : 0}%` }} />
        </div>
      </div>

      {/* Isca para robôs: invisível para pessoas */}
      <input type="text" name="site" value={isca} onChange={(e) => setIsca(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] w-px h-px opacity-0" />

      {perguntas.map((p) => {
        if (p.tipo === 'secao') {
          return (
            <div key={p.id} className="pt-4">
              <h2 className="text-lg font-semibold text-foreground">{p.titulo}</h2>
              {p.ajuda && <p className="mt-0.5 text-sm text-muted-foreground">{p.ajuda}</p>}
            </div>
          )
        }
        const erro = erros[p.id]
        const v = respostas[p.id]
        const idCampo = `campo-${p.id}`
        return (
          <div key={p.id} id={`q-${p.id}`} className={`rounded-[12px] border bg-card p-4 sm:p-5 ${erro ? 'border-destructive' : 'border-border'}`}>
            <label htmlFor={p.tipo === 'escolha' || p.tipo === 'multipla' ? undefined : idCampo} className="block text-[15px] font-medium text-foreground">
              {p.titulo}{p.obrigatoria && <span className="text-destructive"> *</span>}
            </label>
            {p.ajuda && <p className="mt-0.5 text-sm text-muted-foreground">{p.ajuda}</p>}
            <div className="mt-3">
              {p.tipo === 'paragrafo' ? (
                <textarea id={idCampo} value={(v as string) ?? ''} onChange={(e) => set(p.id, e.target.value)} rows={4} maxLength={5000}
                  className="w-full rounded-lg border border-border bg-input px-3 py-2 text-[15px] focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30" />
              ) : p.tipo === 'escolha' || p.tipo === 'multipla' ? (
                <fieldset className="space-y-2">
                  <legend className="sr-only">{p.titulo}</legend>
                  {[...(p.opcoes ?? []), ...(p.outro ? ['__outro'] : [])].map((o) => {
                    const marcado = p.tipo === 'multipla' ? Array.isArray(v) && v.includes(o) : v === o
                    return (
                      <label key={o} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-secondary cursor-pointer">
                        <input
                          type={p.tipo === 'multipla' ? 'checkbox' : 'radio'}
                          name={p.id}
                          checked={marcado}
                          onChange={() => {
                            if (p.tipo === 'multipla') {
                              const lista = Array.isArray(v) ? v : []
                              set(p.id, marcado ? lista.filter((x) => x !== o) : [...lista, o])
                            } else set(p.id, o)
                          }}
                          className="w-4 h-4 accent-[var(--primary)]"
                        />
                        <span className="text-[15px] text-foreground">{o === '__outro' ? 'Outro' : o}</span>
                      </label>
                    )
                  })}
                  {p.outro && (p.tipo === 'multipla' ? Array.isArray(v) && v.includes('__outro') : v === '__outro') && (
                    <Input value={outros[p.id] ?? ''} onChange={(e) => setOutros((x) => ({ ...x, [p.id]: e.target.value }))} placeholder="Escreva aqui" className="h-10 text-[15px]" />
                  )}
                </fieldset>
              ) : p.tipo === 'senha' ? (
                <div className="relative">
                  <Input id={idCampo} type={ver[p.id] ? 'text' : 'password'} autoComplete="off" value={(v as string) ?? ''} onChange={(e) => set(p.id, e.target.value)} className="h-10 pr-10 text-[15px]" />
                  <button type="button" onClick={() => setVer((x) => ({ ...x, [p.id]: !x[p.id] }))} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground" aria-label={ver[p.id] ? 'Esconder senha' : 'Mostrar senha'}>
                    {ver[p.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              ) : (
                <Input
                  id={idCampo}
                  type={p.tipo === 'email' ? 'email' : p.tipo === 'data' ? 'date' : p.tipo === 'hora' ? 'time' : p.tipo === 'telefone' ? 'tel' : 'text'}
                  inputMode={p.tipo === 'telefone' ? 'tel' : undefined}
                  value={(v as string) ?? ''}
                  onChange={(e) => set(p.id, e.target.value)}
                  maxLength={5000}
                  className="h-10 text-[15px]"
                />
              )}
            </div>
            {erro && <p className="mt-2 text-sm text-destructive" role="alert">{erro}</p>}
          </div>
        )
      })}

      {erroGeral && <p className="text-sm text-destructive" role="alert">{erroGeral}</p>}
      <Button type="submit" disabled={enviando} className="w-full h-11 text-[15px]">
        {enviando ? <><Loader2 className="animate-spin" /> Enviando…</> : 'Enviar respostas'}
      </Button>
      <p className="text-xs text-muted-foreground text-center">As suas respostas vão direto para a equipe da VEX Growth. Senhas e CPF ficam guardados de forma cifrada.</p>
    </form>
  )
}
