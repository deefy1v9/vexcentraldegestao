/**
 * Quebra a descrição de uma demanda em seções legíveis.
 *
 * As demandas de conteúdo chegam como texto corrido com cabeçalhos em caixa
 * alta (COPY DA ARTE, LEGENDA, HASHTAGS...). Aqui isso vira blocos separados,
 * cada um copiável, sem alterar o texto guardado no banco. Descrição sem
 * cabeçalho conhecido vira um bloco só, com as quebras de linha preservadas.
 */

export type BriefKind = 'copy' | 'legenda' | 'hashtags' | 'cta' | 'imagem' | 'alerta' | 'texto'

export interface BriefSection {
  title: string
  kind: BriefKind
  body: string
}

const CABECALHOS: Array<{ re: RegExp; kind: BriefKind }> = [
  { re: /^COPY DA ARTE\b/i, kind: 'copy' },
  { re: /^CAPA DO REEL\b/i, kind: 'copy' },
  { re: /^TEXTO NA TELA\b/i, kind: 'copy' },
  { re: /^CRIATIVO\s+\d+/i, kind: 'copy' },
  { re: /^T[ÍI]TULO\b/i, kind: 'copy' },
  { re: /^SUBT[ÍI]TULO\b/i, kind: 'copy' },
  { re: /^DESCRI[ÇC][ÃA]O\b/i, kind: 'copy' },
  { re: /^PADR[ÃA]O DE CAPA\b/i, kind: 'imagem' },
  { re: /^LEGENDA\b/i, kind: 'legenda' },
  { re: /^ADAPTA[ÇC][ÃA]O\b/i, kind: 'legenda' },
  { re: /^HASHTAGS?\b/i, kind: 'hashtags' },
  { re: /^CTA\b/i, kind: 'cta' },
  { re: /^IMAGEM\b/i, kind: 'imagem' },
  { re: /^DIRE[ÇC][ÃA]O VISUAL\b/i, kind: 'imagem' },
]

function detectar(linha: string): { title: string; kind: BriefKind } | null {
  const t = linha.trim()
  if (!t) return null
  if (t.startsWith('⚠')) return { title: t.replace(/^⚠\s*/, ''), kind: 'alerta' }
  for (const c of CABECALHOS) {
    if (c.re.test(t)) return { title: t, kind: c.kind }
  }
  return null
}

/** Cabeçalho tipo "TÍTULO (maior destaque)" é curto e sem ponto final. */
function pareceCabecalho(linha: string): boolean {
  const t = linha.trim()
  return t.length <= 70 && !/[.!?]$/.test(t)
}

export function parseBrief(description: string | null | undefined): BriefSection[] {
  const texto = (description ?? '').replace(/\r\n/g, '\n').trim()
  if (!texto) return []

  const linhas = texto.split('\n')
  const secoes: BriefSection[] = []
  let atual: BriefSection | null = null

  for (const linha of linhas) {
    const cab = detectar(linha)
    if (cab && (cab.kind === 'alerta' || pareceCabecalho(linha))) {
      if (atual) secoes.push({ ...atual, body: atual.body.trim() })
      // Alerta é uma linha só: título é o próprio aviso
      atual = cab.kind === 'alerta'
        ? { title: 'Atenção', kind: 'alerta', body: cab.title }
        : { title: cab.title, kind: cab.kind, body: '' }
      continue
    }
    if (!atual) atual = { title: '', kind: 'texto', body: '' }
    atual.body += (atual.body ? '\n' : '') + linha
  }
  if (atual) secoes.push({ ...atual, body: atual.body.trim() })

  // Sem nenhum cabeçalho reconhecido: um bloco só, com quebras preservadas
  return secoes.filter((s) => s.body || s.kind === 'alerta')
}

/** Hashtags viram lista para virar etiqueta na tela. */
export function splitHashtags(body: string): string[] {
  return body.split(/\s+/).map((h) => h.trim()).filter((h) => h.startsWith('#'))
}

/** Legenda e hashtags juntas, pronto para colar no Instagram. */
export function captionWithHashtags(sections: BriefSection[]): string | null {
  const legenda = sections.find((s) => s.kind === 'legenda')
  const tags = sections.find((s) => s.kind === 'hashtags')
  if (!legenda) return null
  return tags ? `${legenda.body}\n\n${tags.body}` : legenda.body
}
