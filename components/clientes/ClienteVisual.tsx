import { cn } from '@/lib/utils'
import { iniciais } from '@/components/vex/avatar'

/**
 * Peças visuais da carteira (modelo Vireo, 03/11): avatar de iniciais, selo
 * de grupo, pílula de status e a etiqueta de marca interna. Só aparência:
 * nenhuma regra de negócio mora aqui.
 */

/** Pílula do padrão: fundo suave, ponto e rótulo. */
export function Pilula({ className, ponto = true, children, title }: { className?: string; ponto?: boolean; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex items-center gap-1.5 h-[22px] rounded-full px-2.5 text-[11.5px] font-semibold leading-none whitespace-nowrap', className)}>
      {ponto && <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

const STATUS: Record<string, { label: string; cls: string }> = {
  ATIVO: { label: 'Ativo', cls: 'bg-success-suave text-success' },
  PAUSADO: { label: 'Pausado', cls: 'bg-warning-suave text-warning' },
  ENCERRADO: { label: 'Encerrado', cls: 'bg-secondary text-muted-foreground' },
  INATIVO: { label: 'Inativo', cls: 'bg-secondary text-muted-foreground' },
}

export function StatusCliente({ status, className }: { status: string; className?: string }) {
  const s = STATUS[status] ?? { label: status, cls: 'bg-secondary text-muted-foreground' }
  return <Pilula className={cn(s.cls, className)}>{s.label}</Pilula>
}

/** Grupo do cliente: Start neutro, Growth e Scale no azul-marinho da marca. */
const GRUPO: Record<string, { label: string; cls: string }> = {
  START: { label: 'Start', cls: 'bg-secondary text-muted-foreground' },
  GROWTH: { label: 'Growth', cls: 'bg-marca-suave text-marca-texto' },
  SCALE: { label: 'Scale', cls: 'bg-marca text-white' },
}

export function GrupoCliente({ tier, className }: { tier?: string | null; className?: string }) {
  if (!tier || !GRUPO[tier]) return null
  const g = GRUPO[tier]
  return <Pilula ponto={false} className={cn(g.cls, className)}>{g.label}</Pilula>
}

/** As marcas da própria VEX cadastradas como cliente (VEX Growth, VEX Sales). */
export function ehMarcaInterna(nome: string) {
  return /^\s*vex\s+(growth|sales)\b/i.test(nome)
}

export function MarcaInterna({ className }: { className?: string }) {
  return (
    <span
      title="Marca da própria VEX cadastrada como cliente"
      className={cn('inline-flex items-center h-[20px] rounded-md border border-marca/25 px-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-marca-texto whitespace-nowrap', className)}
    >
      Marca interna
    </span>
  )
}

/** Avatar de iniciais do cliente. `xl` é o do cartão do perfil. */
export function AvatarCliente({ nome, tamanho = 'md', className }: { nome: string; tamanho?: 'md' | 'xl'; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'shrink-0 grid place-items-center rounded-full font-display font-semibold select-none',
        tamanho === 'xl'
          ? 'w-24 h-24 text-[30px] bg-marca-suave text-marca-texto ring-2 ring-marca/25 ring-offset-4 ring-offset-card'
          : 'w-9 h-9 text-[12.5px] bg-secondary text-foreground border border-border',
        className,
      )}
    >
      {iniciais(nome)}
    </span>
  )
}
