'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * A rubrica em tela cheia e deitada: dá espaço para o dedo. No Android a tela
 * entra em tela cheia e trava na horizontal; onde o navegador não deixa travar
 * (iPhone), a área de desenho é girada 90° por CSS quando o celular está em pé,
 * e o toque é convertido para o sistema girado. Sai um PNG recortado no traço.
 */
export default function RubricaTelaCheia({ onPronta, onFechar }: { onPronta: (png: string) => void; onFechar: () => void }) {
  const tela = useRef<HTMLCanvasElement>(null)
  const limites = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [vista, setVista] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  const [rabiscou, setRabiscou] = useState(false)
  const girar = vista.h > vista.w

  // Tela cheia + horizontal, quando o navegador deixa; volta ao normal ao sair.
  useEffect(() => {
    const el = document.documentElement
    ;(async () => {
      try { if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' }) } catch { /* iPhone: segue sem */ }
      try { await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape') } catch { /* gira por CSS */ }
    })()
    const mudou = () => setVista({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', mudou)
    window.addEventListener('orientationchange', mudou)
    const rolagem = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('resize', mudou)
      window.removeEventListener('orientationchange', mudou)
      document.body.style.overflow = rolagem
      try { screen.orientation?.unlock?.() } catch { /* nada */ }
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    }
  }, [])

  // Prepara a tela a cada mudança de tamanho (girar o celular recomeça o desenho).
  useEffect(() => {
    const c = tela.current
    if (!c) return
    const escala = Math.min(window.devicePixelRatio || 1, 2)
    c.width = Math.floor(c.clientWidth * escala)
    c.height = Math.floor(c.clientHeight * escala)
    const ctx = c.getContext('2d')!
    ctx.setTransform(escala, 0, 0, escala, 0, 0)
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111111'
    limites.current = null
    setRabiscou(false)

    // Do toque na tela para o sistema da área de desenho (girada ou não).
    const ponto = (e: PointerEvent) => {
      const r = c.getBoundingClientRect()
      return girar ? [e.clientY - r.top, r.right - e.clientX] as const : [e.clientX - r.left, e.clientY - r.top] as const
    }
    const marca = (x: number, y: number) => {
      const l = limites.current
      limites.current = l ? { x0: Math.min(l.x0, x), y0: Math.min(l.y0, y), x1: Math.max(l.x1, x), y1: Math.max(l.y1, y) } : { x0: x, y0: y, x1: x, y1: y }
    }
    let desenhando = false
    const abaixa = (e: PointerEvent) => {
      e.preventDefault()
      desenhando = true
      c.setPointerCapture(e.pointerId)
      const [x, y] = ponto(e)
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.1, y + 0.1); ctx.stroke()
      marca(x, y)
    }
    const move = (e: PointerEvent) => {
      if (!desenhando) return
      e.preventDefault()
      const [x, y] = ponto(e)
      ctx.lineTo(x, y); ctx.stroke()
      marca(x, y)
      setRabiscou(true)
    }
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
  }, [vista, girar])

  const limpar = useCallback(() => {
    const c = tela.current
    if (!c) return
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    limites.current = null
    setRabiscou(false)
  }, [])

  // Recorta no traço (com folga) e reduz para no máximo 1200 px de largura: PNG leve.
  function usar() {
    const c = tela.current
    const l = limites.current
    if (!c || !l) return
    const escala = c.width / c.clientWidth
    const folga = 12
    const x = Math.max(0, (l.x0 - folga) * escala)
    const y = Math.max(0, (l.y0 - folga) * escala)
    const w = Math.min(c.width - x, (l.x1 - l.x0 + folga * 2) * escala)
    const h = Math.min(c.height - y, (l.y1 - l.y0 + folga * 2) * escala)
    const reduz = Math.min(1, 1200 / w)
    const saida = document.createElement('canvas')
    saida.width = Math.max(1, Math.round(w * reduz))
    saida.height = Math.max(1, Math.round(h * reduz))
    saida.getContext('2d')!.drawImage(c, x, y, w, h, 0, 0, saida.width, saida.height)
    onPronta(saida.toDataURL('image/png'))
  }

  const palco: React.CSSProperties = girar
    ? { position: 'absolute', top: 0, left: vista.w, width: vista.h, height: vista.w, transform: 'rotate(90deg)', transformOrigin: 'top left' }
    : { position: 'absolute', inset: 0 }

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-white text-gray-900" role="dialog" aria-modal="true" aria-label="Desenhar a rubrica">
      <div style={palco} className="flex flex-col">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200">
          <p className="flex-1 text-sm font-medium">Desenhe a sua rubrica com o dedo</p>
          <button type="button" onClick={limpar} className="h-9 px-3 rounded-lg text-sm text-gray-700 hover:bg-gray-100">Limpar</button>
          <button type="button" onClick={onFechar} className="h-9 px-3 rounded-lg text-sm text-gray-700 hover:bg-gray-100">Cancelar</button>
          <button type="button" onClick={usar} disabled={!rabiscou} className="h-9 px-4 rounded-lg text-sm font-medium bg-[#030A8C] text-white disabled:opacity-40">Usar rubrica</button>
        </div>
        <div className="relative flex-1 m-3 rounded-xl border-2 border-dashed border-gray-300">
          <canvas ref={tela} className="absolute inset-0 w-full h-full touch-none" />
          <div className="pointer-events-none absolute left-8 right-8 bottom-[28%] border-b border-gray-300" />
        </div>
      </div>
    </div>,
    document.body,
  )
}
