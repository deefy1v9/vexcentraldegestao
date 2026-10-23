/**
 * Para onde ir depois do login (sem Node: roda na tela de login). Só
 * caminhos da própria Central: um callbackUrl de outro site viraria um
 * redirecionamento aberto. Testado em scripts/tests/mcp-oauth.test.ts.
 */
export function destinoDepoisDoLogin(callbackUrl: string | null | undefined, origem: string): string {
  const padrao = '/dashboard'
  if (!callbackUrl) return padrao
  try {
    const u = new URL(callbackUrl, origem)
    if (u.origin !== new URL(origem).origin) return padrao
    if (u.pathname === '/login' || u.pathname.startsWith('//')) return padrao
    return `${u.pathname}${u.search}`
  } catch {
    return padrao
  }
}
