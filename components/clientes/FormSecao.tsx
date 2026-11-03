import { cn } from '@/lib/utils'

/**
 * Peças dos formulários do cliente e do catálogo, no desenho do Vireo:
 * cartão de 24px com rótulo em caixa alta, título grande e a frase; campos
 * de 40px com raio 12. Só aparência — cada tela continua dona dos dados.
 */

/** Campo de texto, select e número. Sem a classe global `.input`, que fica fora de layer e venceria os utilitários. */
export const campo =
  'block w-full h-10 rounded-xl border border-border bg-input px-3.5 text-[14px] text-foreground placeholder:text-subtle ' +
  'hover:border-subtle focus:outline-none focus:border-marca focus:ring-2 focus:ring-marca/20 transition-colors ' +
  'disabled:cursor-not-allowed disabled:opacity-60'

/** Área de texto: o mesmo campo, com altura livre. */
export const campoTexto = cn(campo, 'h-auto py-2.5 leading-relaxed resize-none')

/** Valor calculado, só leitura (ex.: total mensal). */
export const campoLeitura =
  'flex items-center w-full h-10 rounded-xl border border-border bg-secondary/60 px-3.5 font-display text-[15px] font-semibold tabular text-foreground select-none'

export function SecaoForm({
  rotulo, titulo, sub, icone: Icone, acoes, className, children,
}: {
  rotulo?: string; titulo: React.ReactNode; sub?: React.ReactNode; icone?: React.ElementType
  acoes?: React.ReactNode; className?: string; children: React.ReactNode
}) {
  return (
    <section className={cn('rounded-[24px] border border-border bg-card p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]', className)}>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0 flex items-start gap-3">
          {Icone && (
            <span className="mt-0.5 w-9 h-9 shrink-0 rounded-xl grid place-items-center bg-marca-suave text-marca-texto">
              <Icone className="w-[18px] h-[18px]" />
            </span>
          )}
          <div className="min-w-0">
            {rotulo && <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{rotulo}</p>}
            <h2 className={cn('font-display text-[21px] font-semibold tracking-[-0.01em] text-foreground', rotulo && 'mt-0.5')}>{titulo}</h2>
            {sub && <p className="t-legenda mt-0.5">{sub}</p>}
          </div>
        </div>
        {acoes && <div className="shrink-0 flex items-center gap-2">{acoes}</div>}
      </div>
      {children}
    </section>
  )
}

/** Rótulo + campo + dica. `obrigatorio` põe o asterisco do modelo. */
export function Campo({
  rotulo, obrigatorio, dica, className, children, htmlFor,
}: {
  rotulo: React.ReactNode; obrigatorio?: boolean; dica?: React.ReactNode; className?: string; children: React.ReactNode; htmlFor?: string
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-foreground mb-1.5">
        {rotulo}{obrigatorio && <span className="text-destructive-texto"> *</span>}
      </label>
      {children}
      {dica && <p className="t-legenda mt-1.5">{dica}</p>}
    </div>
  )
}

/** Barra de ações no pé do formulário, presa ao fim da rolagem (Cancelar · Salvar). */
export function RodapeForm({ aviso, children }: { aviso?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 sm:-mx-8 mt-6 border-t border-border bg-card/90 backdrop-blur-md px-4 sm:px-8 py-3 flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1 t-rotulo text-muted-foreground">{aviso}</div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}
