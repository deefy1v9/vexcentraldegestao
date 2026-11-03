/**
 * Selo do grupo do cliente (Start/Growth/Scale).
 * Start é neutro, Growth tem destaque intermediário e Scale usa o laranja
 * da marca Vex — destaque elegante, sem exagero.
 */
const STYLES: Record<string, { label: string; cls: string }> = {
  START: { label: 'Start', cls: 'bg-gray-100 text-gray-600' },
  GROWTH: { label: 'Growth', cls: 'bg-marca/10 text-marca-texto' },
  SCALE: { label: 'Scale', cls: 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/30' },
}

export default function TierBadge({
  tier,
  size = 'xs',
}: {
  tier?: string | null
  size?: 'xs' | 'sm'
}) {
  if (!tier || !STYLES[tier]) return null
  const s = STYLES[tier]
  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold ${s.cls} ${
        size === 'sm' ? 'text-xs px-2.5 py-0.5' : 'text-[10px] px-2 py-0.5'
      }`}
    >
      {s.label}
    </span>
  )
}
