import { NextRequest, NextResponse } from 'next/server'

/**
 * Sessão que o middleware aceita (o cookie é válido) mas o servidor recusa
 * (usuário desativado ou que não existe mais no banco). Sem isto, /login
 * mandava para /dashboard e o layout mandava de volta para /login, em loop
 * (ERR_TOO_MANY_REDIRECTS). Aqui o cookie da sessão é apagado e a pessoa cai
 * no login limpo.
 */
export function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/login', req.nextUrl.origin))
  for (const { name } of req.cookies.getAll()) {
    if (/^(__Secure-|__Host-)?(authjs|next-auth)\.session-token(\.\d+)?$/.test(name)) {
      res.cookies.set(name, '', { path: '/', maxAge: 0, secure: name.startsWith('__') })
    }
  }
  return res
}
