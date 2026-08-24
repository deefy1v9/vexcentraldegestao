'use client'
import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Estado da navegação mobile, compartilhado entre o hambúrguer (no Header,
 * dentro de cada página) e a Sidebar (no layout). Os dois vivem em subárvores
 * diferentes, então o estado sobe para um contexto no layout que envolve ambos.
 *
 * No desktop (lg+) a sidebar é estática e este estado é ignorado.
 */
interface MobileNavState {
  open: boolean
  toggle: () => void
  close: () => void
}

const MobileNavContext = createContext<MobileNavState>({
  open: false,
  toggle: () => {},
  close: () => {},
})

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  const toggle = useCallback(() => setOpen((o) => !o), [])
  const close = useCallback(() => setOpen(false), [])

  // Fecha o drawer ao navegar para outra rota.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // Trava o scroll do body enquanto o drawer estiver aberto no mobile.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <MobileNavContext.Provider value={{ open, toggle, close }}>
      {children}
    </MobileNavContext.Provider>
  )
}

export const useMobileNav = () => useContext(MobileNavContext)
