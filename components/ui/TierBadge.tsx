/**
 * Selo do grupo do cliente (Start/Growth/Scale).
 * Start é neutro, Growth tem destaque intermediário e Scale usa o laranja
 * da marca Vex — destaque elegante, sem exagero.
 */
const STYLES: Record<string, { label: string; cls: string }> = {
  START: { label: 'Start', cls: 'bg-gray-100 text-gray-600' },
  GROWTH: { label: 'Growth', cls: 'bg-[#030A8C]/10 text-[#030A8C]' },
  SCALE: { label: 'Scale', cls: 'bg-[#F74A13]/10 text-[#F74A13] ring-1 ring-inset ring-[#F74A13]/30' },
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
