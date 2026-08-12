'use client'

/**
 * Campo monetário com máscara brasileira (R$ 1.234,56).
 *
 * O valor trafega como número (reais) via `value`/`onChange`; a digitação é
 * tratada como centavos — cada dígito desloca a vírgula, como em apps de
 * banco. Aceita apenas valores >= 0.
 */
const fmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function CurrencyInput({
  value,
  onChange,
  placeholder = '0,00',
  className = 'input',
  required = false,
  ariaLabel,
}: {
  value: number | null
  onChange: (value: number | null) => void
  placeholder?: string
  className?: string
  required?: boolean
  ariaLabel?: string
}) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '')
    if (!digits) {
      onChange(null)
      return
    }
    // Limita a 12 dígitos (R$ 9.999.999.999,99) para evitar overflow visual
    const cents = parseInt(digits.slice(0, 12), 10)
    onChange(cents / 100)
  }

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">
        R$
      </span>
      <input
        inputMode="numeric"
        autoComplete="off"
        required={required}
        aria-label={ariaLabel}
        value={value == null ? '' : fmt.format(value)}
        onChange={handleChange}
        placeholder={placeholder}
        className={className}
        // paddingLeft inline: a classe .input do globals.css define padding
        // fora de layer e venceria o utilitário pl-9, deixando o texto
        // digitado por cima do prefixo "R$".
        style={{ paddingLeft: '2.25rem' }}
      />
    </div>
  )
}
