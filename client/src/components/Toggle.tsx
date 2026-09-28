import type { ReactNode } from 'react'

interface Props {
  checked: boolean
  onChange: () => void
  label: ReactNode
  labelClassName?: string
  /** Surface the toggle sits on — `dark` for the sidebar. */
  tone?: 'light' | 'dark'
  /** `sm` for dense lists. */
  size?: 'md' | 'sm'
}

const SIZES = {
  md: { box: 'h-5 w-9', knob: 'h-4 w-4 peer-checked:translate-x-4', gap: 'gap-2.5' },
  sm: { box: 'h-4 w-7', knob: 'h-3 w-3 peer-checked:translate-x-3', gap: 'gap-2' },
}

export function Toggle({ checked, onChange, label, labelClassName, tone = 'light', size = 'md' }: Props) {
  const track = tone === 'dark' ? 'bg-white/15' : 'bg-border-strong'
  const s = SIZES[size]
  return (
    <label className={`flex cursor-pointer select-none items-center ${s.gap}`}>
      <span className={`relative inline-flex ${s.box} shrink-0 items-center`}>
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={onChange} />
        <span
          className={`absolute inset-0 rounded-full ${track} transition-colors duration-200 peer-checked:bg-gold peer-focus-visible:ring-3 peer-focus-visible:ring-gold/25`}
        />
        <span className={`absolute left-0.5 ${s.knob} rounded-full bg-white shadow-soft-md transition-transform duration-200`} />
      </span>
      <span className={labelClassName ?? 'truncate text-sm text-fg-secondary'}>{label}</span>
    </label>
  )
}
