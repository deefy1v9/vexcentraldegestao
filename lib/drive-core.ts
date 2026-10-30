/**
 * Regras puras do Drive compartilhado de clientes: achar a pasta de um
 * cliente pelo nome. Testado em scripts/tests/drive-core.test.ts.
 *
 * As pastas seguem o nome comercial e às vezes trazem o contato junto
 * ("MOOP - ANA"); o cadastro traz a razão ou o nome com sufixo ("Trusted
 * Football Tickets", "Promo Prime / Fabio"). Casamos pela primeira palavra
 * que importa, e a pasta modelo e a de encerrados nunca entram.
 */

const IGNORAR = new Set(['DE', 'DA', 'DO', 'DOS', 'DAS', 'E', 'LTDA', 'ME', 'EIRELI', 'SA', 'S/A', 'GRUPO', 'ESPACO'])

export function normalizarNome(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Palavras que identificam o nome, sem as genéricas. */
function palavras(s: string): string[] {
  return normalizarNome(s).split(' ').filter((p) => p.length > 1 && !IGNORAR.has(p))
}

/**
 * A pasta do cliente entre as pastas da raiz do Drive, ou null. Vale a que
 * tem mais palavras em comum com o nome do cliente, desde que a primeira
 * palavra do cliente esteja nela.
 */
export function pastaDoCliente<T extends { name: string }>(cliente: string, pastas: T[]): T | null {
  const doCliente = palavras(cliente)
  if (doCliente.length === 0) return null
  let melhor: { pasta: T; pontos: number } | null = null
  for (const pasta of pastas) {
    const nome = normalizarNome(pasta.name)
    if (nome.startsWith('_') || nome === 'VEX GROWTH' || /ENCERRADO/.test(nome)) continue
    const daPasta = new Set(palavras(pasta.name))
    if (!daPasta.has(doCliente[0])) continue
    const pontos = doCliente.filter((p) => daPasta.has(p)).length
    if (!melhor || pontos > melhor.pontos) melhor = { pasta, pontos }
  }
  return melhor?.pasta ?? null
}

/** Nome da pasta nova quando o cliente ainda não tem: o nome comercial em maiúsculas, sem sufixos. */
export function nomeDaPastaNova(cliente: string): string {
  return normalizarNome(cliente.split('/')[0]).replace(/\b(LTDA|ME|EIRELI)\b/g, '').replace(/\s+/g, ' ').trim()
}
