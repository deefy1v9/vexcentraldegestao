import { Globe, Instagram, Facebook, Linkedin, Youtube, Music2, ExternalLink } from 'lucide-react'
import { clientLinks, type ClientLinkFields, type ClientLinkKind } from '@/lib/client-links'

const ICON: Record<ClientLinkKind, React.ElementType> = {
  website: Globe,
  instagram: Instagram,
  facebook: Facebook,
  linkedin: Linkedin,
  youtube: Youtube,
  tiktok: Music2,
}

/** Chips com os perfis do cliente; abre em nova aba. Nada quando vazio. */
export default function ClientLinkChips({ client, size = 'sm' }: { client: ClientLinkFields | null | undefined; size?: 'sm' | 'md' }) {
  const links = clientLinks(client)
  if (links.length === 0) return null
  const cls = size === 'md' ? 'text-sm px-3 py-1.5' : 'text-xs px-2.5 py-1'
  return (
    <div className="flex flex-wrap gap-1.5">
      {links.map((l) => {
        const Icon = ICON[l.kind]
        return (
          <a
            key={l.kind}
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            title={`${l.label} · ${l.url}`}
            className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 text-foreground font-medium hover:border-marca/40 hover:text-marca-texto transition-colors ${cls}`}
          >
            <Icon className="w-3.5 h-3.5" />
            {l.handle}
            <ExternalLink className="w-3 h-3 text-subtle" />
          </a>
        )
      })}
    </div>
  )
}
