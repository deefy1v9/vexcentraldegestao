'use client'

import { useState, type ReactNode } from 'react'

interface TabDef {
  key: string
  label: string
}

/**
 * Abas do perfil do cliente — reduzem a rolagem vertical sem tocar no
 * conteúdo: cada aba recebe seções já renderizadas no servidor (dados
 * reais), então nada de lógica é duplicado aqui. Desenho do Vireo: pílulas
 * numa faixa, a ativa no azul-marinho claro da marca.
 */
export default function ClientProfileTabs({
  tabs,
  sections,
}: {
  tabs: TabDef[]
  sections: Record<string, ReactNode>
}) {
  const [active, setActive] = useState(tabs[0]?.key ?? '')

  return (
    <div>
      <div className="flex gap-1 mb-4 overflow-x-auto sem-barra rounded-full border border-border bg-card p-1 w-fit max-w-full" role="tablist" aria-label="Seções do cliente">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            aria-selected={active === t.key}
            role="tab"
            className={`h-9 px-4 rounded-full text-[13px] font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring ${
              active === t.key
                ? 'bg-marca-suave text-marca-texto'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">{sections[active]}</div>
    </div>
  )
}
