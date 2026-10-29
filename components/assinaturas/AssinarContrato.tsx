'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, PenLine, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/vex/button'
import { Input } from '@/components/vex/input'
import { Label } from '@/components/vex/label'
import RubricaTelaCheia from './RubricaTelaCheia'

const mascaraCpf = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11)
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/(\d{3})-?(\d{1,2})$/, '$1-$2')
}

/**
 * Os dois passos do cliente: nome e CPF → código no WhatsApp; código (e a
 * rubrica, se quiser, desenhada em tela cheia e deitada) → assinado.
 */
export default function AssinarContrato({ token, destino, codigoPendente }: { token: string; destino: string; codigoPendente: boolean }) {
  const router = useRouter()
  const [passo, setPasso] = useState<'dados' | 'codigo'>(codigoPendente ? 'codigo' : 'dados')
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [li, setLi] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [rubrica, setRubrica] = useState<string | null>(null)
  const [desenhando, setDesenhando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  async function pedir() {
    setOcupado(true); setErro(''); setAviso('')
    const r = await fetch(`/api/assinar/${token}/codigo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome, cpf }) })
    const d = await r.json().catch(() => ({}))
    setOcupado(false)
    if (!r.ok) { setErro(d.error ?? 'Não deu para mandar o código.'); return }
    setAviso(`Mandamos o código para o WhatsApp ${d.destino}. Ele vale por 10 minutos.`)
    setPasso('codigo')
  }

  async function assinar() {
    setOcupado(true); setErro('')
    const r = await fetch(`/api/assinar/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo, desenho: rubrica }) })
    const d = await r.json().catch(() => ({}))
    setOcupado(false)
    if (!r.ok) { setErro(d.error ?? 'Não deu para assinar.'); return }
    router.refresh()
  }

  return (
    <section className="mt-6 rounded-[12px] border border-border bg-card p-5 sm:p-6 space-y-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-foreground">Assinar o contrato</p>
          <p className="text-sm text-muted-foreground">Você assina pelo celular com o nome, o CPF e um código que chega no WhatsApp {destino}.</p>
        </div>
      </div>

      {passo === 'dados' ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome completo</Label>
            <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" placeholder="Como no documento" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cpf">CPF</Label>
            <Input id="cpf" value={cpf} onChange={(e) => setCpf(mascaraCpf(e.target.value))} inputMode="numeric" placeholder="000.000.000-00" />
          </div>
          <label className="flex items-start gap-2 text-sm text-foreground">
            <input type="checkbox" checked={li} onChange={(e) => setLi(e.target.checked)} className="mt-1" />
            Li o contrato inteiro e concordo com os termos e com a assinatura eletrônica.
          </label>
          <Button onClick={pedir} disabled={ocupado || !li || nome.trim().length < 5 || cpf.replace(/\D/g, '').length !== 11} className="w-full sm:w-auto">
            {ocupado && <Loader2 className="animate-spin" />} Receber o código no WhatsApp
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {aviso && <p className="text-sm text-muted-foreground">{aviso}</p>}
          <div className="space-y-1.5">
            <Label htmlFor="codigo">Código de 6 dígitos</Label>
            <Input id="codigo" value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" className="tracking-[0.4em] text-lg max-w-[12rem]" />
          </div>

          <div className="space-y-2">
            <p className="text-sm text-foreground">Rubrica <span className="text-muted-foreground">(opcional)</span></p>
            {rubrica ? (
              <div className="flex items-center gap-3">
                <img src={rubrica} alt="A sua rubrica" className="h-16 max-w-[60%] rounded-lg border border-border bg-white p-1 object-contain" />
                <button type="button" onClick={() => setDesenhando(true)} className="text-xs text-link hover:underline">Refazer</button>
                <button type="button" onClick={() => setRubrica(null)} className="text-xs text-link hover:underline">Tirar</button>
              </div>
            ) : (
              <Button type="button" variant="outline" onClick={() => setDesenhando(true)}><PenLine /> Desenhar a rubrica</Button>
            )}
            <p className="text-[12px] text-muted-foreground">A tela abre deitada, para ficar mais fácil desenhar com o dedo.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={assinar} disabled={ocupado || codigo.length !== 6}>
              {ocupado && <Loader2 className="animate-spin" />} Assinar o contrato
            </Button>
            <button type="button" onClick={() => { setPasso('dados'); setCodigo(''); setErro('') }} className="text-xs text-link hover:underline">
              Pedir outro código
            </button>
          </div>
        </div>
      )}

      {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}
      {desenhando && <RubricaTelaCheia onPronta={(png) => { setRubrica(png); setDesenhando(false) }} onFechar={() => setDesenhando(false)} />}
    </section>
  )
}
