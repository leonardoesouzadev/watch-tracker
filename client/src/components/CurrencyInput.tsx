interface Props {
  /** Whole reais as a digit string ("30000"), or "" for empty. */
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  id?: string
  'aria-label'?: string
}

const format = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

/** Keeps only digits, dropping leading zeros: "R$ 1.500" → "1500". */
function toDigits(text: string): string {
  return text.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 12)
}

/**
 * Price field in whole reais, formatted as the user types ("30000" shows as
 * "R$ 30.000"). The value stays a plain digit string for the parent.
 */
export function CurrencyInput({ value, onChange, placeholder, className, id, ...rest }: Props) {
  const digits = toDigits(value)
  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={digits ? format.format(Number(digits)) : ''}
      onChange={(e) => onChange(toDigits(e.target.value))}
      placeholder={placeholder}
      aria-label={rest['aria-label']}
      className={`field tabular-nums ${className ?? ''}`}
    />
  )
}
