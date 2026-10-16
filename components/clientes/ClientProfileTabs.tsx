'use client'

import { useState, type ReactNode } from 'react'

interface TabDef {
  key: string
  label: string
}

/**
 * Abas do perfil do cliente — reduzem a rolagem vertical sem tocar no
 * conteúdo: cada aba recebe seções já renderizadas no servidor (dados
 * reais), então nada de lógica é duplicado aqui.
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
      <div className="flex gap-1 border-b border-border mb-4 overflow-x-auto" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            aria-selected={active === t.key}
            role="tab"
            className={`h-10 px-3 t-rotulo whitespace-nowrap transition-colors border-b-2 -mb-px focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring ${
              active === t.key
                ? 'text-foreground border-marca'
                : 'text-muted-foreground border-transparent hover:text-foreground'
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
