import { notFound } from 'next/navigation'
import { contratoPeloToken, ROTULO_DO_PAPEL } from '@/lib/assinatura'
import AssinarContrato from '@/components/assinaturas/AssinarContrato'
import VisualizadorPdf from '@/components/assinaturas/VisualizadorPdf'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Assinar contrato · VEX Growth', robots: { index: false, follow: false } }

/**
 * O contrato que cada assinante abre pelo próprio link (público: o segredo
 * está no link). Lê o PDF, informa nome e CPF, recebe o código no próprio
 * WhatsApp e assina. Mostra quem mais assina e se já assinou.
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
        <p className="mt-1 text-sm text-muted-foreground">Assinatura de {c.eu.nome} · {ROTULO_DO_PAPEL[c.eu.papel]}</p>
        {c.outros.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {c.outros.map((o, i) => (
              <li key={i} className="text-sm text-muted-foreground">
                {o.nome} ({ROTULO_DO_PAPEL[o.papel]}): {o.status === 'ASSINADO' && o.em ? `assinou em ${dataHora(o.em)}` : 'ainda vai assinar'}
              </li>
            ))}
          </ul>
        )}

        {/* No celular o contrato vai de ponta a ponta da tela, num quadro que rola por dentro */}
        <div className="mt-6 -mx-4 sm:mx-0 sm:rounded-[12px] border-y sm:border border-border bg-card overflow-hidden">
          <VisualizadorPdf url={`/api/assinar/${token}/pdf`} titulo={c.titulo} />
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-border">
            <p className="text-xs text-muted-foreground truncate">{c.status === 'ASSINADO' ? 'Contrato assinado por todos, com o relatório no final' : c.arquivo}</p>
            <a href={`/api/assinar/${token}/pdf?baixar=1`} className="text-xs font-medium text-link hover:underline shrink-0">Baixar PDF</a>
          </div>
        </div>

        {c.status === 'CANCELADO' ? (
          <div className="mt-6 rounded-[12px] border border-border bg-card p-6">
            <p className="font-medium text-foreground">Este contrato foi cancelado.</p>
            <p className="mt-1 text-sm text-muted-foreground">Se precisar de um novo, fale com a equipe da VEX.</p>
          </div>
        ) : c.eu.assinado ? (
          <div className="mt-6 rounded-[12px] border border-border bg-card p-6">
            <p className="font-medium text-foreground">{c.status === 'ASSINADO' ? 'Contrato assinado. Obrigado!' : 'Sua assinatura foi registrada. Obrigado!'}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Assinado por {c.eu.assinado.nome} (CPF {c.eu.assinado.cpf}) em {dataHora(c.eu.assinado.em)}.{' '}
              {c.status === 'ASSINADO'
                ? 'O PDF com o relatório de assinatura também foi para o seu WhatsApp.'
                : 'Quando todos assinarem, o PDF final com o relatório chega no seu WhatsApp.'}
            </p>
          </div>
        ) : (
          <AssinarContrato token={token} destino={c.eu.destino} codigoPendente={c.eu.codigoPendente} />
        )}

        <p className="mt-6 text-[12px] leading-relaxed text-muted-foreground">
          Assinatura eletrônica simples, aceita pelas partes no próprio contrato (MP 2.200-2/2001, art. 10, § 2º, e Lei 14.063/2020).
          A autoria é confirmada pelo nome, pelo CPF e pelo código enviado ao WhatsApp de cada assinante; a integridade, pelo resumo SHA-256 do PDF:
          <span className="font-mono break-all"> {c.sha256}</span>
        </p>
      </div>
    </main>
  )
}
