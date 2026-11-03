'use client'

import { motion, type Variants } from 'motion/react'

/**
 * Entradas animadas da versão 2: o bloco sobe e aparece, e os filhos marcados
 * com <Entrada.Item> entram um depois do outro.
 */
const pai: Variants = { oculto: {}, visivel: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } }
const filho: Variants = {
  oculto: { opacity: 0, y: 16, filter: 'blur(4px)' },
  visivel: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
}

export function Entrada({ children, className }: { children: React.ReactNode; className?: string }) {
  return <motion.div variants={pai} initial="oculto" animate="visivel" className={className}>{children}</motion.div>
}

/** Um filho que entra em sequência (use este nome em páginas do servidor). */
export function EntradaItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return <motion.div variants={filho} className={className}>{children}</motion.div>
}

Entrada.Item = EntradaItem
