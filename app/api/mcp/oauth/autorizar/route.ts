import { getSessionUser } from '@/lib/api-auth'
import { emitirCodigo, OAuthErro, urlDeRecusa, validarPedido } from '@/lib/mcp/oauth-core'
import { baseDaCentral, repoPrisma } from '@/lib/mcp/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * A decisão da tela /autorizar. Exige a sessão de um administrador e um
 * POST da própria Central (Origin): outro site não consegue autorizar no
 * lugar da pessoa. O pedido é validado de novo aqui, nunca confiado da tela.
 */
export async function POST(req: Request): Promise<Response> {
  const base = baseDaCentral()
  const origem = req.headers.get('origin')
  if (origem && origem !== new URL(base).origin && origem !== new URL(req.url).origin) {
    return pagina(403, 'Pedido de outro site recusado.')
  }
  const form = await req.formData().catch(() => null)
  const params = new URLSearchParams(String(form?.get('q') ?? ''))
  const v = await validarPedido(params, base, repoPrisma)
  if (!v.ok) return 'fatal' in v ? pagina(400, v.fatal) : ir(v.redirecionar)
  if (form?.get('decisao') !== 'autorizar') return ir(urlDeRecusa(v.pedido))

  const viewer = await getSessionUser()
  const usuario = viewer ? await repoPrisma.usuario(viewer.id) : null
  try {
    return ir(await emitirCodigo(v.pedido, usuario, repoPrisma))
  } catch (e) {
    if (e instanceof OAuthErro) return pagina(e.status, e.message)
    console.error('[mcp] autorizar:', e instanceof Error ? e.message : e)
    return pagina(500, 'Não foi possível autorizar agora. Tente de novo.')
  }
}

function ir(url: string): Response {
  return new Response(null, { status: 303, headers: { location: url, 'cache-control': 'no-store' } })
}

function pagina(status: number, mensagem: string): Response {
  const t = mensagem.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!)
  return new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>VEX Central</title><meta name="robots" content="noindex"></head>` +
    `<body style="font-family:system-ui,sans-serif;background:#f6f7f9;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px"><main style="max-width:420px;background:#fff;border:1px solid #e4e7ec;border-radius:12px;padding:28px"><h1 style="font-size:17px;margin:0 0 8px">Não foi possível autorizar</h1><p style="font-size:14px;color:#555e6d;margin:0">${t}</p></main></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  )
}
