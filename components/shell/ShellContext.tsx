'use client'

import { createContext, useContext } from 'react'

/**
 * O que o cabeçalho de cada página e o menu pedem à casca: abrir/recolher o
 * menu (☰ no topo, como no modelo Vireo), a gaveta no celular e a busca geral.
 */
export type Casca = {
  /** Dentro da casca V2 o topo (sino, tema, pessoa) já existe: o Header da página mostra só o título. */
  v2?: boolean
  alternarMenu: () => void
  abrirGaveta: () => void
  abrirBusca: () => void
}

export const CascaContext = createContext<Casca>({ alternarMenu: () => {}, abrirGaveta: () => {}, abrirBusca: () => {} })

export const useCasca = () => useContext(CascaContext)
