import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/api-auth'
import { validarPedido } from '@/lib/mcp/oauth-core'
import { baseDaCentral, repoPrisma } from '@/lib/mcp/oauth'
import { temAcoes } from '@/lib/mcp/formato'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Autorizar assistente · VEX Central', robots: { index: false } }

/**
 * Tela de consentimento do conector de IA. O assistente manda a pessoa para
 * cá com o pedido OAuth na URL; o middleware garante a sessão (sem ela, o
 * login traz de volta para cá). Aqui se confere o pedido e se mostra o que o
 * assistente vai poder ver; a decisão vai para /api/mcp/oauth/autorizar.
 *
 * Regra do OAuth: cliente ou retorno desconhecido mostra o erro AQUI, nunca
 * redireciona (seria mandar a pessoa para um endereço qualquer).
 */
export default async function AutorizarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) if (typeof v === 'string') params.set(k, v)

  const v = await validarPedido(params, baseDaCentral(), repoPrisma)
  if (!v.ok && 'redirecionar' in v) redirect(v.redirecionar)
  const viewer = await getSessionUser()

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-[#030A8C] rounded-xl flex items-center justify-center mx-auto mb-3">
            <span className="text-white text-xl font-bold">V</span>
          </div>
          <p className="text-sm text-gray-500">VEX Central de Gestão</p>
        </div>

        {!v.ok ? (
          <>
            <h1 className="text-lg font-semibold text-gray-900 mb-2">Não foi possível autorizar</h1>
            <p className="text-sm text-gray-600">{v.fatal}</p>
          </>
        ) : viewer?.role !== 'ADMIN' ? (
          <>
            <h1 className="text-lg font-semibold text-gray-900 mb-2">Só administradores</h1>
            <p className="text-sm text-gray-600">Conectar assistentes de IA à Central é permitido apenas para administradores.</p>
          </>
        ) : (
          <form method="post" action="/api/mcp/oauth/autorizar" className="space-y-5">
            <input type="hidden" name="q" value={params.toString()} />
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Autorizar <span className="text-[#030A8C]">{v.pedido.appNome}</span>?</h1>
              <p className="text-sm text-gray-600 mt-1">
                O assistente vai ler a Central como <strong>{viewer.name}</strong>.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Ler</p>
              <ul className="text-sm text-gray-700 space-y-1.5 bg-gray-50 rounded-xl p-4">
                <li>• Clientes e serviços contratados</li>
                <li>• Demandas, prazos e processos</li>
                <li>• Financeiro do mês, contas a receber e a pagar, caixa</li>
                <li>• Risco de churn por cliente</li>
              </ul>
            </div>
            {temAcoes(v.pedido.escopo) && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Agir como agente de IA</p>
                <ul className="text-sm text-gray-700 space-y-1.5 bg-amber-50 rounded-xl p-4">
                  <li>• Ler as mensagens dos grupos de WhatsApp dos clientes</li>
                  <li>• Criar demandas na fila do agente e comentar nelas</li>
                  <li>• Entregar a etapa em que trabalhou para você validar</li>
                </ul>
                <p className="text-xs text-gray-500 mt-1.5">Só nas demandas da fila do agente. Ele nunca aprova, nunca conclui e nunca manda mensagem ao cliente: o aviso no grupo só sai depois que você aprova na Central.</p>
              </div>
            )}
            <p className="text-xs text-gray-500">
              {temAcoes(v.pedido.escopo) ? 'Fora isso, só leitura.' : <><strong>Só leitura:</strong> ele não envia mensagem nem altera nada.</>} Você pode desconectar quando quiser em Agentes.
              Ao autorizar, você volta para <span className="font-mono">{new URL(v.pedido.redirectUri).host}</span>.
            </p>
            <div className="flex gap-3">
              <button type="submit" name="decisao" value="cancelar" className="flex-1 h-11 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50">
                Cancelar
              </button>
              <button type="submit" name="decisao" value="autorizar" className="flex-1 h-11 rounded-xl bg-[#030A8C] text-white text-sm font-semibold hover:opacity-90">
                Autorizar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
