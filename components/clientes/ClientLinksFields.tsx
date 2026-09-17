'use client'

import { CLIENT_LINK_KINDS, CLIENT_LINK_LABEL, type ClientLinkKind } from '@/lib/client-links'

const PLACEHOLDER: Record<ClientLinkKind, string> = {
  website: 'https://empresa.com.br',
  instagram: '@perfil ou link',
  facebook: 'link da página',
  linkedin: 'link da empresa',
  youtube: '@canal ou link',
  tiktok: '@perfil ou link',
}

/** Campos de site e redes do cliente; os formulários guardam por chave. */
export default function ClientLinksFields({
  value,
  onChange,
}: {
  value: Record<ClientLinkKind, string>
  onChange: (kind: ClientLinkKind, v: string) => void
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
      <h2 className="font-semibold text-gray-900 mb-1">Site e redes</h2>
      <p className="text-xs text-gray-400 mb-4">Aparecem no detalhe do cliente e nas demandas, para o produtor conferir o perfil.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {CLIENT_LINK_KINDS.map((k) => (
          <div key={k}>
            <label className="block text-sm font-medium text-gray-700 mb-1">{CLIENT_LINK_LABEL[k]}</label>
            <input value={value[k]} onChange={(e) => onChange(k, e.target.value)} className="input" placeholder={PLACEHOLDER[k]} />
          </div>
        ))}
      </div>
    </div>
  )
}
