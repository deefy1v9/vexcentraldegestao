'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/vex/button'
import { Input } from '@/components/vex/input'
import { Label } from '@/components/vex/label'

const mascaraCpf = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11)
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/(\d{3})-?(\d{1,2})$/, '$1-$2')
}

/**
 * Os dois passos do cliente: nome e CPF → código no WhatsApp; código (e a
 * rubrica, se quiser) → assinado. Funciona no celular com o dedo.
 */
export default function AssinarContrato({ token, destino, codigoPendente }: { token: string; destino: string; codigoPendente: boolean }) {
  const router = useRouter()
  const [passo, setPasso] = useState<'dados' | 'codigo'>(codigoPendente ? 'codigo' : 'dados')
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [li, setLi] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [comRubrica, setComRubrica] = useState(false)
  const [rabiscou, setRabiscou] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const tela = useRef<HTMLCanvasElement>(null)

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
    const desenho = comRubrica && rabiscou && tela.current ? tela.current.toDataURL('image/png') : null
    const r = await fetch(`/api/assinar/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo, desenho }) })
    const d = await r.json().catch(() => ({}))
    setOcupado(false)
    if (!r.ok) { setErro(d.error ?? 'Não deu para assinar.'); return }
    router.refresh()
  }

  // A rubrica: traço com o dedo ou o mouse, em PNG transparente.
  useEffect(() => {
    const c = tela.current
    if (!comRubrica || !c) return
    const escala = window.devicePixelRatio || 1
    c.width = c.clientWidth * escala
    c.height = c.clientHeight * escala
    const ctx = c.getContext('2d')!
    ctx.scale(escala, escala)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#111'
    let desenhando = false
    const ponto = (e: PointerEvent) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const }
    const abaixa = (e: PointerEvent) => { desenhando = true; c.setPointerCapture(e.pointerId); const [x, y] = ponto(e); ctx.beginPath(); ctx.moveTo(x, y) }
    const move = (e: PointerEvent) => { if (!desenhando) return; const [x, y] = ponto(e); ctx.lineTo(x, y); ctx.stroke(); setRabiscou(true) }
    const solta = () => { desenhando = false }
    c.addEventListener('pointerdown', abaixa)
    c.addEventListener('pointermove', move)
    c.addEventListener('pointerup', solta)
    c.addEventListener('pointercancel', solta)
    return () => {
      c.removeEventListener('pointerdown', abaixa)
      c.removeEventListener('pointermove', move)
      c.removeEventListener('pointerup', solta)
      c.removeEventListener('pointercancel', solta)
    }
  }, [comRubrica])

  function limpar() {
    const c = tela.current
    if (!c) return
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    setRabiscou(false)
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
        <div className="space-y-3">
          {aviso && <p className="text-sm text-muted-foreground">{aviso}</p>}
          <div className="space-y-1.5">
            <Label htmlFor="codigo">Código de 6 dígitos</Label>
            <Input id="codigo" value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" className="tracking-[0.4em] text-lg max-w-[12rem]" />
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={comRubrica} onChange={(e) => { setComRubrica(e.target.checked); setRabiscou(false) }} />
            Quero desenhar a minha rubrica (opcional)
          </label>
          {comRubrica && (
            <div className="space-y-1.5">
              <canvas ref={tela} className="w-full h-36 rounded-lg border border-dashed border-border bg-white touch-none" />
              <button type="button" onClick={limpar} className="text-xs text-link hover:underline">Limpar</button>
            </div>
          )}

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
    </section>
  )
}
