import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * As peças do padrão visual novo (modelo Vireo, 03/11), com as cores da VEX:
 * azul-marinho na seleção e na marca, laranja só na ação, roxo só na IA.
 * Toda tela usa estas peças para os cartões terem o mesmo raio, o mesmo
 * cabeçalho e a mesma escala de número.
 */

export type Tom = 'marca' | 'sucesso' | 'info' | 'perigo' | 'atencao' | 'neutro' | 'ia'

export const TOM: Record<Tom, string> = {
  marca: 'bg-marca-suave text-marca-texto',
  sucesso: 'bg-success-suave text-success',
  info: 'bg-info-suave text-info',
  perigo: 'bg-destructive-suave text-destructive-texto',
  atencao: 'bg-warning-suave text-warning',
  neutro: 'bg-secondary text-muted-foreground',
  ia: 'bg-ia/10 text-ia',
}

/** O ícone num quadradinho de cor suave. */
export function Chip({ icone: Icone, tom = 'marca', tamanho = 'md', className }: { icone: React.ElementType; tom?: Tom; tamanho?: 'sm' | 'md' | 'lg'; className?: string }) {
  const caixa = tamanho === 'sm' ? 'w-8 h-8 rounded-lg' : tamanho === 'lg' ? 'w-11 h-11 rounded-xl' : 'w-9 h-9 rounded-xl'
  const ico = tamanho === 'sm' ? 'w-4 h-4' : tamanho === 'lg' ? 'w-5 h-5' : 'w-[18px] h-[18px]'
  return <span className={cn('shrink-0 grid place-items-center', caixa, TOM[tom], className)}><Icone className={ico} /></span>
}

/** Rótulo pequeno em caixa alta, acima do título de um cartão. */
export function Sobretitulo({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground', className)}>{children}</p>
}

/** Número grande, na fonte de display (Space Grotesk). */
export function Numero({ children, className, alerta }: { children: React.ReactNode; className?: string; alerta?: boolean }) {
  return <span className={cn('font-display font-semibold tracking-[-0.02em] tabular', alerta ? 'text-destructive-texto' : 'text-foreground', className)}>{children}</span>
}

/**
 * O cartão do padrão: rótulo em caixa alta, título grande e a frase; à
 * direita, um link ("Ver tudo") ou ações. `semPadding` para tabelas e listas
 * que vão de borda a borda (o cabeçalho continua com respiro).
 */
export function Painel({
  rotulo, titulo, sub, href, rotuloLink = 'Ver tudo', acoes, className, semPadding, children,
}: {
  rotulo?: string; titulo?: React.ReactNode; sub?: React.ReactNode; href?: string; rotuloLink?: string
  acoes?: React.ReactNode; className?: string; semPadding?: boolean; children?: React.ReactNode
}) {
  const temCabecalho = rotulo || titulo || sub || href || acoes
  return (
    <section className={cn('rounded-[24px] border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]', !semPadding && 'p-6', className)}>
      {temCabecalho && (
        <div className={cn('flex items-start justify-between gap-3', semPadding ? 'px-6 pt-6 pb-4' : 'mb-5')}>
          <div className="min-w-0">
            {rotulo && <Sobretitulo>{rotulo}</Sobretitulo>}
            {titulo && <h2 className={cn('font-display text-[21px] font-semibold tracking-[-0.01em] text-foreground', rotulo && 'mt-1')}>{titulo}</h2>}
            {sub && <p className="t-legenda mt-0.5">{sub}</p>}
          </div>
          {(href || acoes) && (
            <div className="flex items-center gap-2 shrink-0">
              {acoes}
              {href && (
                <Link href={href} className="t-rotulo font-semibold text-marca-texto hover:underline inline-flex items-center gap-1">
                  {rotuloLink} <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          )}
        </div>
      )}
      {children}
    </section>
  )
}

/** O cartão de destaque do topo (tom azul-marinho claro em degradê). */
export function Destaque({ rotulo, titulo, sub, acoes, className, children }: {
  rotulo?: React.ReactNode; titulo: React.ReactNode; sub?: React.ReactNode; acoes?: React.ReactNode; className?: string; children?: React.ReactNode
}) {
  return (
    <section className={cn('relative overflow-hidden rounded-[24px] border border-marca/15 bg-gradient-to-br from-marca-suave via-card to-card p-6 sm:p-7', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {rotulo && <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-marca-texto">{rotulo}</p>}
          <h2 className="mt-1 font-display text-[26px] sm:text-[30px] font-semibold tracking-[-0.02em] text-foreground">{titulo}</h2>
          {sub && <p className="t-corpo text-muted-foreground mt-1 max-w-[680px]">{sub}</p>}
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>
      {children}
    </section>
  )
}

/**
 * Card de indicador (KPI): chip, rótulo, número grande e uma nota. Com
 * `href` vira link; `tendencia` mostra a variação num selo verde/vermelho.
 */
export function Kpi({ icone, tom = 'marca', rotulo, valor, nota, href, alerta, tendencia, className, children }: {
  icone: React.ElementType; tom?: Tom; rotulo: string; valor: React.ReactNode; nota?: React.ReactNode; href?: string
  alerta?: boolean; tendencia?: { texto: string; bom: boolean }; className?: string; children?: React.ReactNode
}) {
  const corpo = (
    <div className={cn('h-full rounded-[20px] border border-border bg-card p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]', href && 'hover:border-marca/30 transition-colors', className)}>
      <div className="flex items-start justify-between gap-2">
        <Chip icone={icone} tom={tom} tamanho="lg" />
        {tendencia && (
          <span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-semibold', tendencia.bom ? 'bg-success-suave text-success' : 'bg-destructive-suave text-destructive-texto')}>{tendencia.texto}</span>
        )}
      </div>
      <p className="t-rotulo text-muted-foreground mt-4">{rotulo}</p>
      <Numero alerta={alerta} className="block text-[26px] leading-8 mt-0.5">{valor}</Numero>
      {nota && <p className="t-legenda mt-1">{nota}</p>}
      {children}
    </div>
  )
  return href ? <Link href={href} className="block h-full rounded-[20px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{corpo}</Link> : corpo
}

/** Uma linha de "num relance": chip, rótulo (e detalhe) e o valor à direita. */
export function LinhaRelance({ icone, tom = 'marca', rotulo, detalhe, valor, href }: {
  icone: React.ElementType; tom?: Tom; rotulo: React.ReactNode; detalhe?: React.ReactNode; valor: React.ReactNode; href?: string
}) {
  const conteudo = (
    <>
      <Chip icone={icone} tom={tom} />
      <span className="min-w-0 flex-1">
        <span className="block t-corpo text-foreground group-hover:text-marca-texto">{rotulo}</span>
        {detalhe && <span className="block t-legenda">{detalhe}</span>}
      </span>
      <Numero className="text-[18px]">{valor}</Numero>
    </>
  )
  return (
    <li>
      {href
        ? <Link href={href} className="flex items-center gap-3 py-3 group">{conteudo}</Link>
        : <div className="flex items-center gap-3 py-3">{conteudo}</div>}
    </li>
  )
}

/** Abas em pílula (como "6M · 12M · YTD" e "Board · List" do modelo). */
export function Pilulas<T extends string>({ opcoes, valor, aoMudar, rotulo }: {
  opcoes: Array<{ valor: T; rotulo: React.ReactNode }>; valor: T; aoMudar: (v: T) => void; rotulo: string
}) {
  return (
    <div className="inline-flex rounded-xl border border-border bg-secondary/60 p-1" role="tablist" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="tab"
          aria-selected={valor === o.valor}
          onClick={() => aoMudar(o.valor)}
          className={cn('h-7 px-3 rounded-lg text-[12px] font-semibold transition-colors inline-flex items-center gap-1.5', valor === o.valor ? 'bg-card text-marca-texto shadow-[0_0_0_1px_var(--border)]' : 'text-muted-foreground hover:text-foreground')}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  )
}

/** Cabeçalho de grupo numa lista (ATRASADAS 3 · VENCE HOJE 2). */
export function GrupoDaLista({ titulo, quantidade, tom = 'neutro' }: { titulo: string; quantidade?: number; tom?: Tom }) {
  return (
    <div className="flex items-center gap-2 px-6 py-2.5 bg-secondary/60 border-y border-border">
      <span className={cn('text-[11px] font-semibold uppercase tracking-[0.12em]', tom === 'perigo' ? 'text-destructive-texto' : tom === 'atencao' ? 'text-warning' : tom === 'marca' ? 'text-marca-texto' : 'text-muted-foreground')}>{titulo}</span>
      {quantidade !== undefined && <span className="rounded-full bg-card px-1.5 text-[11px] font-semibold text-muted-foreground border border-border">{quantidade}</span>}
    </div>
  )
}
