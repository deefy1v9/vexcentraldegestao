import Image from 'next/image'
import { cn } from '@/lib/utils'

/** Proporção da marca-palavra "VEX" (logo.png, 833 × 200). */
const PROPORCAO = 833 / 200

/**
 * A marca da VEX no topo do trilho: a palavra "VEX" inteira, em laranja no
 * tema claro e em branco no escuro. O branco não é filtro na imagem: é a
 * própria forma da marca usada como máscara sobre um fundo branco, então a
 * proporção e o desenho ficam idênticos nos dois temas.
 *
 * `palavra` continua aceito por compatibilidade; a marca é sempre a palavra,
 * só muda a altura (menor no trilho fechado).
 */
export function Logo({
  altura = 22,
  className,
}: {
  altura?: number
  palavra?: boolean
  className?: string
}) {
  const largura = Math.round(altura * PROPORCAO)
  const mascara = {
    background: '#ffffff',
    WebkitMaskImage: 'url(/logo.png)', maskImage: 'url(/logo.png)',
    WebkitMaskSize: 'contain', maskSize: 'contain',
    WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'left center', maskPosition: 'left center',
  } as React.CSSProperties
  return (
    <span className={cn('relative inline-flex flex-shrink-0 items-center', className)} style={{ height: altura, width: largura }}>
      <Image
        src="/logo.png"
        alt="VEX Growth"
        width={largura}
        height={altura}
        priority
        className="dark:hidden"
        style={{ objectFit: 'contain', objectPosition: 'left center', height: '100%', width: '100%' }}
      />
      <span aria-hidden className="hidden dark:block absolute inset-0" style={mascara} />
    </span>
  )
}
