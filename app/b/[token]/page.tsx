import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { abrirLink, perguntasDe } from '@/lib/briefing'
import FormularioBriefing from '@/components/briefings/FormularioBriefingCliente'
import type { Pergunta } from '@/lib/briefing-core'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Briefing · VEX Growth', robots: { index: false, follow: false } }

/**
 * Briefing que o cliente responde pelo link (público). O link de um cliente
 * marca quando foi aberto e, depois de respondido, não aceita outro envio.
 */
export default async function BriefingPublico({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const link = await abrirLink(token)
  if (!link) notFound()

  let jaRespondido = false
  if (link.convite) {
    jaRespondido = (await prisma.briefingResponse.count({ where: { inviteId: link.convite.id } })) > 0
    if (!link.convite.openedAt) await prisma.briefingInvite.update({ where: { id: link.convite.id }, data: { openedAt: new Date() } })
  }

  // O cliente não vê os avisos internos nem para que a Central usa cada campo
  const perguntas: Pergunta[] = perguntasDe(link.template.questions).map(({ alerta: _a, papel: _p, ...p }) => p)

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex items-center gap-2 mb-6">
          <img src="/logo-mark.png" alt="" className="w-8 h-8" />
          <span className="t-rotulo text-muted-foreground">VEX Growth</span>
        </div>
        <h1 className="text-2xl font-semibold text-foreground">{link.template.name}</h1>
        {link.convite && <p className="mt-1 text-sm text-muted-foreground">Para: {link.convite.client.name}</p>}
        {link.template.description && <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground whitespace-pre-line">{link.template.description}</p>}
        {jaRespondido ? (
          <div className="mt-8 rounded-[12px] border border-border bg-card p-6">
            <p className="font-medium text-foreground">Este briefing já foi respondido. Obrigado!</p>
            <p className="mt-1 text-sm text-muted-foreground">Se precisar mudar alguma resposta, é só falar com a equipe da VEX.</p>
          </div>
        ) : (
          <FormularioBriefing token={token} perguntas={perguntas} />
        )}
      </div>
    </main>
  )
}
