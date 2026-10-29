'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/vex/button'
import { Input } from '@/components/vex/input'
import { Label } from '@/components/vex/label'
import SearchSelect from '@/components/ui/SearchSelect'

/**
 * Sobe o PDF do contrato. Marcar "revisei" é a assinatura da VEX: o nome de
 * quem gerou, a data, a hora e o IP vão para o relatório. Nada sai para o
 * cliente aqui; o envio é o botão "Enviar" na lista.
 */
export default function NovoContrato({ clientes }: { clientes: Array<{ id: string; name: string; phone: string }> }) {
  const router = useRouter()
  const [clienteId, setClienteId] = useState('')
  const [titulo, setTitulo] = useState('')
  const [telefone, setTelefone] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [revisei, setRevisei] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  function escolherCliente(id: string) {
    setClienteId(id)
    const c = clientes.find((x) => x.id === id)
    if (c?.phone && !telefone) setTelefone(c.phone)
  }

  async function salvar() {
    if (!arquivo) return
    setSalvando(true)
    setErro('')
    const f = new FormData()
    f.set('arquivo', arquivo)
    f.set('titulo', titulo)
    f.set('telefone', telefone)
    f.set('clientId', clienteId)
    f.set('revisei', revisei ? '1' : '0')
    const r = await fetch('/api/assinaturas', { method: 'POST', body: f })
    const d = await r.json().catch(() => ({}))
    setSalvando(false)
    if (!r.ok) { setErro(d.error ?? 'Não foi possível guardar o contrato.'); return }
    setTitulo(''); setArquivo(null); setRevisei(false); setClienteId(''); setTelefone('')
    router.refresh()
  }

  return (
    <aside className="rounded-[12px] border border-border bg-card p-4 space-y-3 xl:sticky xl:top-0">
      <div>
        <p className="t-secao text-foreground">Novo contrato para assinar</p>
        <p className="text-xs text-muted-foreground mt-0.5">O PDF fica congelado: depois de guardado, não muda. Para corrigir, cancele e suba de novo.</p>
      </div>
      <div className="space-y-1.5">
        <Label>Cliente (opcional)</Label>
        <SearchSelect options={clientes} value={clienteId} onChange={escolherCliente} placeholder="Escolher cliente" allLabel="Nenhum" searchPlaceholder="Buscar cliente" shortLabel={false} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="titulo">Título</Label>
        <Input id="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Contrato MOOP · SEO Essencial 3 meses" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="whats">WhatsApp de quem assina</Label>
        <Input id="whats" value={telefone} onChange={(e) => setTelefone(e.target.value)} inputMode="tel" placeholder="(11) 99999-9999" />
        <p className="text-[11px] text-muted-foreground">O código de 6 dígitos vai para este número: tem que ser o celular de quem assina, não o grupo.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pdf">PDF do contrato</Label>
        <input id="pdf" type="file" accept="application/pdf,.pdf" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} className="block w-full text-sm text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-medium" />
      </div>
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input type="checkbox" checked={revisei} onChange={(e) => setRevisei(e.target.checked)} className="mt-1" />
        Revisei o contrato e assino em nome da VEX Growth.
      </label>
      <Button onClick={salvar} disabled={salvando || !arquivo || !revisei || titulo.trim().length < 3 || !telefone} className="w-full">
        {salvando && <Loader2 className="animate-spin" />} Assinar pela VEX e gerar o link
      </Button>
      {erro && <p className="text-sm text-destructive">{erro}</p>}
    </aside>
  )
}
