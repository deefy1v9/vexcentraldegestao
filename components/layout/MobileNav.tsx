'use client'
import { createContext, useContext, useState, useCallback, useEffect } from 'react'

/**
 * Estado da navegação, compartilhado entre o hambúrguer (no Header, dentro
 * de cada página) e a Sidebar (no layout). Os dois vivem em subárvores
 * diferentes, então o estado sobe para um contexto no layout que envolve ambos.
 *
 * `open` é o drawer do celular. `collapsed` é o menu recolhido do desktop
 * (só ícones), lembrado no navegador.
 */
interface MobileNavState {
  open: boolean
  toggle: () => void
  close: () => void
  collapsed: boolean
  toggleCollapsed: () => void
}

const MobileNavContext = createContext<MobileNavState>({
  open: false,
  toggle: () => {},
  close: () => {},
  collapsed: false,
  toggleCollapsed: () => {},
})

const STORAGE_KEY = 'vex-menu-recolhido'

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const toggle = useCallback(() => setOpen((o) => !o), [])
  const close = useCallback(() => setOpen(false), [])
  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      try { localStorage.setItem(STORAGE_KEY, c ? '0' : '1') } catch { /* sem storage */ }
      return !c
    })
  }, [])

  // Preferência salva só pode ser lida no navegador; ler no useState
  // quebraria a hidratação (o servidor não vê o localStorage).
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(STORAGE_KEY) === '1') setCollapsed(true)
    } catch { /* sem storage */ }
  }, [])

  // O drawer fecha ao navegar porque cada item da Sidebar chama close() no
  // clique; e com o drawer aberto o backdrop cobre o resto da tela, então não
  // há outra forma de navegar sem fechá-lo antes.

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
    <MobileNavContext.Provider value={{ open, toggle, close, collapsed, toggleCollapsed }}>
      {children}
    </MobileNavContext.Provider>
  )
}

export const useMobileNav = () => useContext(MobileNavContext)
