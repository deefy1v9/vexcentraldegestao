'use client'

import { Globe } from 'lucide-react'
import { CLIENT_LINK_KINDS, CLIENT_LINK_LABEL, type ClientLinkKind } from '@/lib/client-links'
import { Campo, SecaoForm, campo } from '@/components/clientes/FormSecao'

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
    <SecaoForm titulo="Site e redes" sub="Aparecem no detalhe do cliente e nas demandas, para o produtor conferir o perfil." icone={Globe}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {CLIENT_LINK_KINDS.map((k) => (
          <Campo key={k} rotulo={CLIENT_LINK_LABEL[k]}>
            <input value={value[k]} onChange={(e) => onChange(k, e.target.value)} className={campo} placeholder={PLACEHOLDER[k]} />
          </Campo>
        ))}
      </div>
    </SecaoForm>
  )
}
