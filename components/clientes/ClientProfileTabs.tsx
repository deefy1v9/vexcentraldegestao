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
      <div className="flex flex-wrap gap-1 border-b border-gray-200 mb-5 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            aria-selected={active === t.key}
            role="tab"
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              active === t.key
                ? 'text-[#030A8C] border-[#030A8C]'
                : 'text-gray-500 border-transparent hover:text-gray-900'
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
