'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Posicao {
  left: number
  top?: number
  bottom?: number
  maxHeight: number
}

/**
 * Menu suspenso renderizado em portal no `body`.
 *
 * Dentro de coluna com `overflow`, um menu absoluto é recortado — e subir o
 * z-index não resolve, porque quem corta é o contêiner de rolagem, não a
 * ordem de pintura. Aqui o menu sai da árvore, é posicionado por coordenadas
 * da viewport, abre para cima quando falta espaço abaixo e rola sozinho se as
 * opções não couberem. Reposiciona ao rolar (inclusive rolagem interna) e ao
 * redimensionar a janela.
 */
export default function PortalMenu({
  ariaLabel,
  trigger,
  children,
  width = 208,
  align = 'right',
}: {
  ariaLabel: string
  trigger: (props: { open: boolean; toggle: () => void; ref: React.RefObject<HTMLButtonElement | null> }) => React.ReactNode
  children: (close: () => void) => React.ReactNode
  width?: number
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<Posicao | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])

  const place = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const margem = 8
    const espacoAbaixo = window.innerHeight - r.bottom - margem
    const espacoAcima = r.top - margem
    // Abre para cima quando não cabe embaixo e sobra mais espaço em cima
    const paraCima = espacoAbaixo < 200 && espacoAcima > espacoAbaixo
    const maxHeight = Math.max(140, Math.floor(paraCima ? espacoAcima : espacoAbaixo))
    const bruto = align === 'right' ? r.right - width : r.left
    const left = Math.min(Math.max(margem, bruto), Math.max(margem, window.innerWidth - width - margem))
    setPos(paraCima
      ? { left, bottom: window.innerHeight - r.top + 4, maxHeight }
      : { left, top: r.bottom + 4, maxHeight })
  }, [align, width])

  useLayoutEffect(() => { if (open) place() }, [open, place])

  useEffect(() => {
    if (!open) return
    const reposicionar = () => place()
    // capture: pega rolagem de qualquer contêiner interno, não só da janela
    window.addEventListener('scroll', reposicionar, true)
    window.addEventListener('resize', reposicionar)
    const fora = (e: PointerEvent) => {
      const alvo = e.target as Node
      if (menuRef.current?.contains(alvo) || triggerRef.current?.contains(alvo)) return
      setOpen(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('scroll', reposicionar, true)
      window.removeEventListener('resize', reposicionar)
      document.removeEventListener('pointerdown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [open, place])

  return (
    <>
      {trigger({ open, toggle: () => setOpen((v) => !v), ref: triggerRef })}
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={ariaLabel}
          style={{
            position: 'fixed',
            left: pos.left,
            top: pos.top,
            bottom: pos.bottom,
            width,
            maxHeight: pos.maxHeight,
          }}
          className="z-[60] bg-white border border-gray-200 rounded-lg shadow-lg py-1 overflow-y-auto overscroll-contain"
        >
          {children(close)}
        </div>,
        document.body,
      )}
    </>
  )
}
