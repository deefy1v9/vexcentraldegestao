'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileText, Loader2, Send, X } from 'lucide-react'
import { Button } from '@/components/vex/button'
import { Badge } from '@/components/vex/badge'
import CopiarLink from '@/components/briefings/CopiarLink'

interface Assinante {
  id: string | null; token: string; papel: string; nome: string; whatsapp: string; status: string
  enviadoEm: string | null; abertoEm: string | null; assinadoEm: string | null
}
interface Contrato {
  id: string; titulo: string; status: string
  cliente: { id: string; nome: string } | null
  criadoEm: string; preparadoPor: string
  assinantes: Assinante[]
}

const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

function Situacao({ c }: { c: Contrato }) {
  if (c.status === 'ASSINADO') return <Badge variant="success">Assinado por todos</Badge>
  if (c.status === 'CANCELADO') return <Badge variant="default">Cancelado</Badge>
  const faltam = c.assinantes.filter((a) => a.status !== 'ASSINADO').length
  return <Badge variant="warning">{faltam === 1 ? 'Falta 1 assinatura' : `Faltam ${faltam} assinaturas`}</Badge>
}

function SituacaoDoAssinante({ a }: { a: Assinante }) {
  if (a.assinadoEm) return <span className="text-success">assinou {dataHora(a.assinadoEm)}</span>
  if (a.abertoEm) return <span>abriu {dataHora(a.abertoEm)}</span>
  if (a.enviadoEm) return <span>enviado {dataHora(a.enviadoEm)}</span>
  return <span>não enviado</span>
}

export default function ListaDeContratos({ contratos }: { contratos: Contrato[] }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<{ id: string; texto: string } | null>(null)

  async function enviar(c: Contrato, a?: Assinante) {
    const quem = a ? `${a.nome} (${a.whatsapp})` : c.assinantes.filter((x) => x.status !== 'ASSINADO').map((x) => `${x.nome} (${x.whatsapp})`).join(' e ')
    if (!confirm(`Mandar o PDF e o link de assinatura de "${c.titulo}" para ${quem}? Cada um recebe no próprio WhatsApp.`)) return
    setOcupado(c.id); setErro(null)
    const r = await fetch(`/api/assinaturas/${c.id}/enviar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a?.id ? { assinanteId: a.id } : {}) })
    const d = await r.json().catch(() => ({}))
    setOcupado(null)
    if (!r.ok || r.status === 207) setErro({ id: c.id, texto: d.error ?? 'Não foi possível enviar.' })
    router.refresh()
  }

  async function cancelar(c: Contrato) {
    if (!confirm(`Cancelar "${c.titulo}"? Os links param de aceitar assinatura.`)) return
    setOcupado(c.id); setErro(null)
    const r = await fetch(`/api/assinaturas/${c.id}`, { method: 'DELETE' })
    const d = await r.json().catch(() => ({}))
    setOcupado(null)
    if (!r.ok) setErro({ id: c.id, texto: d.error ?? 'Não foi possível cancelar.' })
    router.refresh()
  }

  if (contratos.length === 0) {
    return (
      <section className="rounded-[12px] border border-border bg-card p-6">
        <p className="font-medium text-foreground">Nenhum contrato para assinar ainda.</p>
        <p className="mt-1 text-sm text-muted-foreground">Suba o PDF ao lado: cada assinante recebe o próprio link e assina com nome, CPF e o código do próprio WhatsApp.</p>
      </section>
    )
  }

  return (
    <section className="rounded-[12px] border border-border bg-card divide-y divide-border">
      {contratos.map((c) => {
        const aberto = c.status === 'AGUARDANDO'
        const novos = c.assinantes.some((a) => a.id)
        return (
          <article key={c.id} className="p-4 space-y-2">
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{c.titulo}</p>
                <p className="text-xs text-muted-foreground">
                  {c.cliente ? <Link href={`/clientes/${c.cliente.id}`} className="hover:underline">{c.cliente.nome}</Link> : 'Sem cliente'}
                  {' · '}preparado por {c.preparadoPor} em {dataHora(c.criadoEm)}
                </p>
              </div>
              <Situacao c={c} />
            </div>

            <ul className="pl-8 space-y-1.5">
              {c.assinantes.map((a, i) => (
                <li key={a.id ?? i} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="text-foreground font-medium">{a.nome}</span>
                  <span>{a.papel === 'CONTRATADA' ? 'VEX' : 'cliente'} · WhatsApp {a.whatsapp} ·</span>
                  <SituacaoDoAssinante a={a} />
                  {aberto && a.status !== 'ASSINADO' && novos && (
                    <>
                      <CopiarLink caminho={`/assinar/${a.token}`} rotulo="Copiar link" />
                      {a.enviadoEm && (
                        <button type="button" onClick={() => enviar(c, a)} disabled={ocupado === c.id} className="text-link hover:underline">Reenviar</button>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center gap-2 pl-8">
              <a href={`/api/assinaturas/${c.id}/pdf`} target="_blank" rel="noreferrer" className="text-xs font-medium text-link hover:underline">PDF enviado</a>
              {c.status === 'ASSINADO' && (
                <a href={`/api/assinaturas/${c.id}/pdf?tipo=assinado`} target="_blank" rel="noreferrer" className="text-xs font-medium text-link hover:underline">PDF assinado</a>
              )}
              {aberto && novos && (
                <>
                  {c.assinantes.some((a) => a.status !== 'ASSINADO' && !a.enviadoEm) && (
                    <Button size="sm" variant="outline" onClick={() => enviar(c)} disabled={ocupado === c.id}>
                      {ocupado === c.id ? <Loader2 className="animate-spin" /> : <Send />} Enviar pelo WhatsApp
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => cancelar(c)} disabled={ocupado === c.id}><X /> Cancelar</Button>
                </>
              )}
            </div>
            {erro?.id === c.id && <p className="pl-8 text-sm text-destructive">{erro.texto}</p>}
          </article>
        )
      })}
    </section>
  )
}
