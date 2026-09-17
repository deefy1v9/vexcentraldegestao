/**
 * Perfis públicos do cliente (site e redes). Regras puras, sem Prisma.
 *
 * O cadastro aceita URL completa, "@handle" ou só o handle; aqui tudo vira
 * URL canônica para abrir de qualquer tela (detalhe do cliente, demanda).
 */

export type ClientLinkKind = 'website' | 'instagram' | 'facebook' | 'linkedin' | 'youtube' | 'tiktok'

export const CLIENT_LINK_KINDS: ClientLinkKind[] = ['website', 'instagram', 'facebook', 'linkedin', 'youtube', 'tiktok']

export const CLIENT_LINK_LABEL: Record<ClientLinkKind, string> = {
  website: 'Site',
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  tiktok: 'TikTok',
}

/** Campos do Client para `select` nas consultas que mostram os perfis. */
export const CLIENT_LINK_SELECT = {
  website: true, instagram: true, facebook: true, linkedin: true, youtube: true, tiktok: true,
} as const

export type ClientLinkFields = Partial<Record<ClientLinkKind, string | null | undefined>>

export interface ClientLink {
  kind: ClientLinkKind
  label: string
  url: string
  /** Texto curto para o chip: @handle ou domínio. */
  handle: string
}

const HOST: Record<Exclude<ClientLinkKind, 'website'>, string> = {
  instagram: 'https://www.instagram.com/',
  facebook: 'https://www.facebook.com/',
  linkedin: 'https://www.linkedin.com/',
  youtube: 'https://www.youtube.com/',
  tiktok: 'https://www.tiktok.com/@',
}

/** URL canônica a partir do que foi digitado; null quando vazio. */
export function normalizeProfileUrl(kind: ClientLinkKind, value: string | null | undefined): string | null {
  const v = (value ?? '').trim()
  if (!v) return null
  if (/^https?:\/\//i.test(v)) return v
  if (kind === 'website') return `https://${v.replace(/^\/+/, '')}`
  // "www.instagram.com/x" ou "instagram.com/x" sem protocolo
  if (/^(www\.)?[a-z0-9-]+\.[a-z.]+\//i.test(v)) return `https://${v}`
  const handle = v.replace(/^@/, '').replace(/^\/+/, '')
  if (kind === 'linkedin' && !/^(in|company)\//i.test(handle)) return `${HOST.linkedin}company/${handle}`
  if (kind === 'youtube' && !/^(@|c\/|channel\/|user\/)/i.test(handle)) return `${HOST.youtube}@${handle}`
  return `${HOST[kind]}${handle}`
}

/** Texto curto: @handle das redes ou o domínio do site. */
export function linkHandle(kind: ClientLinkKind, url: string): string {
  try {
    const u = new URL(url)
    if (kind === 'website') return u.hostname.replace(/^www\./, '')
    const path = u.pathname.replace(/\/+$/, '').replace(/^\/+/, '')
    if (!path) return u.hostname.replace(/^www\./, '')
    const last = path.split('/').filter(Boolean).pop() ?? path
    return last.startsWith('@') ? last : `@${last}`
  } catch {
    return url
  }
}

export function clientLinks(client: ClientLinkFields | null | undefined): ClientLink[] {
  if (!client) return []
  const out: ClientLink[] = []
  for (const kind of CLIENT_LINK_KINDS) {
    const url = normalizeProfileUrl(kind, client[kind])
    if (!url) continue
    out.push({ kind, label: CLIENT_LINK_LABEL[kind], url, handle: linkHandle(kind, url) })
  }
  return out
}
