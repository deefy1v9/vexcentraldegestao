import { notFound } from 'next/navigation'
import { contratoPeloToken } from '@/lib/assinatura'
import AssinarContrato from '@/components/assinaturas/AssinarContrato'
import VisualizadorPdf from '@/components/assinaturas/VisualizadorPdf'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Assinar contrato · VEX Growth', robots: { index: false, follow: false } }

/**
 * O contrato que o cliente assina pelo link (público: o segredo está no
 * link). Lê o PDF na própria página, informa nome e CPF, recebe o código no
 * WhatsApp e assina. Depois de assinado, a página mostra o PDF com o relatório.
 */
export default async function AssinarPublico({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const c = await contratoPeloToken(token)
  if (!c) notFound()

  const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-center gap-2 mb-6">
          <img src="/logo-mark.png" alt="" className="w-8 h-8" />
          <span className="t-rotulo text-muted-foreground">VEX Growth</span>
        </div>
        <h1 className="text-2xl font-semibold text-foreground">{c.titulo}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Assinado pela VEX Growth ({c.vex.quem}) em {dataHora(c.vex.em)}.
        </p>

        {/* No celular o contrato vai de ponta a ponta da tela; rolar a página rola o contrato */}
        <div className="mt-6 -mx-4 sm:mx-0 sm:rounded-[12px] border-y sm:border border-border bg-card overflow-hidden">
          <VisualizadorPdf url={`/api/assinar/${token}/pdf`} titulo={c.titulo} />
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-border">
            <p className="text-xs text-muted-foreground truncate">{c.status === 'ASSINADO' ? 'Contrato assinado, com o relatório na última página' : c.arquivo}</p>
            <a href={`/api/assinar/${token}/pdf?baixar=1`} className="text-xs font-medium text-link hover:underline shrink-0">Baixar PDF</a>
          </div>
        </div>

        {c.status === 'CANCELADO' ? (
          <div className="mt-6 rounded-[12px] border border-border bg-card p-6">
            <p className="font-medium text-foreground">Este contrato foi cancelado.</p>
            <p className="mt-1 text-sm text-muted-foreground">Se precisar de um novo, fale com a equipe da VEX.</p>
          </div>
        ) : c.assinado ? (
          <div className="mt-6 rounded-[12px] border border-border bg-card p-6">
            <p className="font-medium text-foreground">Contrato assinado. Obrigado!</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Assinado por {c.assinado.nome} (CPF {c.assinado.cpf}) em {dataHora(c.assinado.em)}. O PDF com o relatório de assinatura também foi para o seu WhatsApp.
            </p>
          </div>
        ) : (
          <AssinarContrato token={token} destino={c.destino} codigoPendente={c.codigoPendente} />
        )}

        <p className="mt-6 text-[12px] leading-relaxed text-muted-foreground">
          Assinatura eletrônica simples, aceita pelas partes no próprio contrato (MP 2.200-2/2001, art. 10, § 2º, e Lei 14.063/2020).
          A autoria é confirmada pelo nome, pelo CPF e pelo código enviado ao WhatsApp; a integridade, pelo resumo SHA-256 do PDF:
          <span className="font-mono break-all"> {c.sha256}</span>
        </p>
      </div>
    </main>
  )
}
