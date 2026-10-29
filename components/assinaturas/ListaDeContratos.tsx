'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileText, Loader2, Send, X } from 'lucide-react'
import { Button } from '@/components/vex/button'
import { Badge } from '@/components/vex/badge'
import CopiarLink from '@/components/briefings/CopiarLink'

interface Contrato {
  id: string; token: string; titulo: string; status: string; arquivo: string; whatsapp: string
  cliente: { id: string; nome: string } | null
  criadoEm: string; vex: string; enviadoEm: string | null; abertoEm: string | null; assinadoEm: string | null; assinante: string | null
}

const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

function Situacao({ c }: { c: Contrato }) {
  if (c.status === 'ASSINADO') return <Badge variant="success">Assinado</Badge>
  if (c.status === 'CANCELADO') return <Badge variant="default">Cancelado</Badge>
  if (c.abertoEm) return <Badge variant="info">Cliente abriu</Badge>
  if (c.enviadoEm) return <Badge variant="warning">Enviado</Badge>
  return <Badge variant="outline">Não enviado</Badge>
}

export default function ListaDeContratos({ contratos }: { contratos: Contrato[] }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<{ id: string; texto: string } | null>(null)

  async function enviar(c: Contrato) {
    if (!confirm(`Mandar o PDF e o link de "${c.titulo}" para o WhatsApp ${c.whatsapp}?`)) return
    setOcupado(c.id); setErro(null)
    const r = await fetch(`/api/assinaturas/${c.id}/enviar`, { method: 'POST' })
    const d = await r.json().catch(() => ({}))
    setOcupado(null)
    if (!r.ok) setErro({ id: c.id, texto: d.error ?? 'Não foi possível enviar.' })
    router.refresh()
  }

  async function cancelar(c: Contrato) {
    if (!confirm(`Cancelar "${c.titulo}"? O link para de aceitar assinatura.`)) return
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
        <p className="mt-1 text-sm text-muted-foreground">Suba o PDF ao lado: a VEX assina ao gerar e o cliente assina pelo link, com nome, CPF e o código do WhatsApp.</p>
      </section>
    )
  }

  return (
    <section className="rounded-[12px] border border-border bg-card divide-y divide-border">
      {contratos.map((c) => (
        <article key={c.id} className="p-4 space-y-2">
          <div className="flex items-start gap-3">
            <FileText className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate">{c.titulo}</p>
              <p className="text-xs text-muted-foreground">
                {c.cliente ? <Link href={`/clientes/${c.cliente.id}`} className="hover:underline">{c.cliente.nome}</Link> : 'Sem cliente'}
                {' · '}WhatsApp {c.whatsapp}{' · '}VEX assinou ({c.vex}) {dataHora(c.criadoEm)}
              </p>
              <p className="text-xs text-muted-foreground">
                {c.assinadoEm
                  ? `Assinado por ${c.assinante} em ${dataHora(c.assinadoEm)}`
                  : [c.enviadoEm && `enviado ${dataHora(c.enviadoEm)}`, c.abertoEm && `aberto ${dataHora(c.abertoEm)}`].filter(Boolean).join(' · ') || 'Ainda não foi para o cliente'}
              </p>
            </div>
            <Situacao c={c} />
          </div>
          <div className="flex flex-wrap items-center gap-2 pl-8">
            <a href={`/api/assinaturas/${c.id}/pdf`} target="_blank" rel="noreferrer" className="text-xs font-medium text-link hover:underline">PDF enviado</a>
            {c.status === 'ASSINADO' && (
              <a href={`/api/assinaturas/${c.id}/pdf?tipo=assinado`} target="_blank" rel="noreferrer" className="text-xs font-medium text-link hover:underline">PDF assinado</a>
            )}
            {c.status === 'AGUARDANDO' && (
              <>
                <CopiarLink caminho={`/assinar/${c.token}`} rotulo="Copiar link" />
                <Button size="sm" variant="outline" onClick={() => enviar(c)} disabled={ocupado === c.id}>
                  {ocupado === c.id ? <Loader2 className="animate-spin" /> : <Send />} {c.enviadoEm ? 'Reenviar' : 'Enviar pelo WhatsApp'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => cancelar(c)} disabled={ocupado === c.id}><X /> Cancelar</Button>
              </>
            )}
          </div>
          {erro?.id === c.id && <p className="pl-8 text-sm text-destructive">{erro.texto}</p>}
        </article>
      ))}
    </section>
  )
}
