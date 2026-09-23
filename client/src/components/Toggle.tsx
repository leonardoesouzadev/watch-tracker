import type { ReactNode } from 'react'

interface Props {
  checked: boolean
  onChange: () => void
  label: ReactNode
  labelClassName?: string
  /** Surface the toggle sits on — `dark` for the sidebar. */
  tone?: 'light' | 'dark'
}

export function Toggle({ checked, onChange, label, labelClassName, tone = 'light' }: Props) {
  const track = tone === 'dark' ? 'bg-white/15' : 'bg-border-strong'
  return (
    <label className="flex cursor-pointer select-none items-center gap-2.5">
      <span className="relative inline-flex h-5 w-9 shrink-0 items-center">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={onChange} />
        <span
          className={`absolute inset-0 rounded-full ${track} transition-colors duration-200 peer-checked:bg-gold peer-focus-visible:ring-3 peer-focus-visible:ring-gold/25`}
        />
        <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-soft-md transition-transform duration-200 peer-checked:translate-x-4" />
      </span>
      <span className={labelClassName ?? 'truncate text-sm text-fg-secondary'}>{label}</span>
    </label>
  )
}
