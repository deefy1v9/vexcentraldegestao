'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/vex/button'
import { Input } from '@/components/vex/input'
import { Label } from '@/components/vex/label'
import SearchSelect from '@/components/ui/SearchSelect'

type Pessoa = { id: string; name: string; phone: string }

/**
 * Sobe o PDF do contrato e diz quem assina: o representante da VEX e quem
 * assina pelo cliente, cada um com o próprio WhatsApp (o código vai para o
 * celular de cada um). Nada sai aqui; o envio é o botão "Enviar" na lista.
 */
export default function NovoContrato({ clientes, representantes }: { clientes: Pessoa[]; representantes: Pessoa[] }) {
  const router = useRouter()
  const [clienteId, setClienteId] = useState('')
  const [titulo, setTitulo] = useState('')
  const [vexId, setVexId] = useState('')
  const [vexNome, setVexNome] = useState('')
  const [vexWhats, setVexWhats] = useState('')
  const [clienteNome, setClienteNome] = useState('')
  const [clienteWhats, setClienteWhats] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [revisei, setRevisei] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  function escolherCliente(id: string) {
    setClienteId(id)
    const c = clientes.find((x) => x.id === id)
    if (c?.phone && !clienteWhats) setClienteWhats(c.phone)
  }
  function escolherRepresentante(id: string) {
    setVexId(id)
    const u = representantes.find((x) => x.id === id)
    if (u) { setVexNome(u.name); setVexWhats(u.phone) }
  }

  async function salvar() {
    if (!arquivo) return
    setSalvando(true)
    setErro('')
    const assinantes = [
      ...(vexNome.trim() ? [{ papel: 'CONTRATADA', nome: vexNome, telefone: vexWhats }] : []),
      { papel: 'CONTRATANTE', nome: clienteNome, telefone: clienteWhats },
    ]
    const f = new FormData()
    f.set('arquivo', arquivo)
    f.set('titulo', titulo)
    f.set('clientId', clienteId)
    f.set('assinantes', JSON.stringify(assinantes))
    f.set('revisei', revisei ? '1' : '0')
    const r = await fetch('/api/assinaturas', { method: 'POST', body: f })
    const d = await r.json().catch(() => ({}))
    setSalvando(false)
    if (!r.ok) { setErro(d.error ?? 'Não foi possível guardar o contrato.'); return }
    setTitulo(''); setArquivo(null); setRevisei(false); setClienteId(''); setClienteNome(''); setClienteWhats(''); setVexId(''); setVexNome(''); setVexWhats('')
    router.refresh()
  }

  const pronto = !!arquivo && revisei && titulo.trim().length >= 3 && clienteNome.trim().length >= 3 && !!clienteWhats && (!vexNome.trim() || !!vexWhats)

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

      <fieldset className="space-y-1.5 rounded-lg border border-border p-3">
        <legend className="px-1 text-xs font-medium text-foreground">Assina pela VEX</legend>
        <SearchSelect options={representantes} value={vexId} onChange={escolherRepresentante} placeholder="Escolher sócio" allLabel="Ninguém" searchPlaceholder="Buscar" shortLabel={false} />
        <Input value={vexNome} onChange={(e) => setVexNome(e.target.value)} placeholder="Nome de quem assina" aria-label="Nome de quem assina pela VEX" />
        <Input value={vexWhats} onChange={(e) => setVexWhats(e.target.value)} inputMode="tel" placeholder="WhatsApp (31) 99999-9999" aria-label="WhatsApp de quem assina pela VEX" />
      </fieldset>

      <fieldset className="space-y-1.5 rounded-lg border border-border p-3">
        <legend className="px-1 text-xs font-medium text-foreground">Assina pelo cliente</legend>
        <Input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} placeholder="Nome de quem assina" aria-label="Nome de quem assina pelo cliente" />
        <Input value={clienteWhats} onChange={(e) => setClienteWhats(e.target.value)} inputMode="tel" placeholder="WhatsApp (11) 99999-9999" aria-label="WhatsApp de quem assina pelo cliente" />
      </fieldset>
      <p className="text-[11px] text-muted-foreground">O código de 6 dígitos vai para o WhatsApp de cada um: tem que ser o celular da pessoa, não o grupo.</p>

      <div className="space-y-1.5">
        <Label htmlFor="pdf">PDF do contrato</Label>
        <input id="pdf" type="file" accept="application/pdf,.pdf" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} className="block w-full text-sm text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-medium" />
      </div>
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input type="checkbox" checked={revisei} onChange={(e) => setRevisei(e.target.checked)} className="mt-1" />
        Revisei o contrato e os dados de quem assina.
      </label>
      <Button onClick={salvar} disabled={salvando || !pronto} className="w-full">
        {salvando && <Loader2 className="animate-spin" />} Gerar os links de assinatura
      </Button>
      {erro && <p className="text-sm text-destructive">{erro}</p>}
    </aside>
  )
}
