'use client'

import { createContext, useContext, useRef, useState } from 'react'
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, type MotionValue, type SpringOptions } from 'motion/react'
import { cn } from '@/lib/utils'

/**
 * O "dock" do trilho flutuante, no modelo que o dono mandou (03/11), em pé:
 * o ícone cresce quando o mouse chega perto e os vizinhos crescem menos,
 * como no dock do Mac; o nome aparece ao lado do ícone em foco.
 */
type Ctx = { mouseY: MotionValue<number>; distancia: number; base: number; aumento: number; mola: SpringOptions }
const DockCtx = createContext<Ctx | null>(null)
const useDock = () => {
  const c = useContext(DockCtx)
  if (!c) throw new Error('DockItem fora do DockVertical')
  return c
}

export function DockVertical({ children, className, base = 44, aumento = 64, distancia = 120, mola = { mass: 0.1, stiffness: 170, damping: 13 } }: {
  children: React.ReactNode; className?: string; base?: number; aumento?: number; distancia?: number; mola?: SpringOptions
}) {
  const mouseY = useMotionValue(Infinity)
  return (
    <motion.div
      onMouseMove={(e) => mouseY.set(e.clientY)}
      onMouseLeave={() => mouseY.set(Infinity)}
      role="toolbar"
      aria-label="Menu"
      aria-orientation="vertical"
      className={cn('flex flex-col items-center gap-2', className)}
    >
      <DockCtx.Provider value={{ mouseY, distancia, base, aumento, mola }}>{children}</DockCtx.Provider>
    </motion.div>
  )
}

/** Um destino do dock: o tamanho acompanha a distância do mouse; `rotulo` é o nome ao lado. */
export function DockItem({ rotulo, atalho, children }: { rotulo: string; atalho?: string; children: (tamanho: MotionValue<number>) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const { mouseY, distancia, base, aumento, mola } = useDock()
  const [aberto, setAberto] = useState(false)

  const dist = useTransform(mouseY, (y) => {
    const r = ref.current?.getBoundingClientRect() ?? { y: 0, height: 0 }
    return y - r.y - r.height / 2
  })
  const tamanho = useSpring(useTransform(dist, [-distancia, 0, distancia], [base, aumento, base]), mola)

  return (
    <motion.div
      ref={ref}
      style={{ width: tamanho, height: tamanho }}
      onHoverStart={() => setAberto(true)}
      onHoverEnd={() => setAberto(false)}
      onFocusCapture={() => setAberto(true)}
      onBlurCapture={() => setAberto(false)}
      className="relative grid place-items-center"
    >
      {children(tamanho)}
      <AnimatePresence>
        {aberto && (
          <motion.span
            role="tooltip"
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 10 }}
            exit={{ opacity: 0, x: -4 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 whitespace-nowrap rounded-xl border border-border bg-card/90 backdrop-blur-md px-3 py-1.5 text-[12.5px] font-semibold text-foreground shadow-[0_10px_30px_-12px_rgba(16,24,40,0.45)]"
          >
            {rotulo}
            {atalho && <span className="ml-2 rounded-md border border-border bg-secondary px-1.5 py-0.5 text-[10.5px] text-muted-foreground">{atalho}</span>}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/** O ícone cresce junto (metade do tamanho do item). */
export function DockIcone({ tamanho, children }: { tamanho: MotionValue<number>; children: React.ReactNode }) {
  const lado = useTransform(tamanho, (v) => v * 0.42)
  return <motion.span style={{ width: lado, height: lado }} className="relative grid place-items-center [&>svg]:w-full [&>svg]:h-full">{children}</motion.span>
}
