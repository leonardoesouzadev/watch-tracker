import { useEffect, useId, useRef, useState } from 'react'
import { CheckIcon, ChevronDownIcon } from './icons'

interface Option {
  id: string
  label: string
  /** Shown on the right (e.g. how many results the option has). */
  count?: number
}

interface Props {
  options: Option[]
  /** Ids currently checked. */
  selected: Set<string>
  onToggle: (id: string) => void
  onSetAll: (checked: boolean) => void
  /** Noun for the summary: "Todas as fontes", "3 de 15 fontes". */
  noun: { singular: string; plural: string; all: string; none: string }
}

// Dropdown with checkboxes: one compact field instead of a row of chips.
export function MultiSelect({ options, selected, onToggle, onSetAll, noun }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const checkedCount = options.filter((o) => selected.has(o.id)).length

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const summary =
    checkedCount === options.length
      ? noun.all
      : checkedCount === 0
        ? noun.none
        : `${checkedCount} de ${options.length} ${options.length === 1 ? noun.singular : noun.plural}`

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={listId}
        className="field flex w-full items-center justify-between gap-2 text-left"
      >
        <span className={`truncate ${checkedCount === options.length ? 'text-fg' : 'font-medium text-gold-text'}`}>
          {summary}
        </span>
        <ChevronDownIcon className={`h-4 w-4 shrink-0 text-icon transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          id={listId}
          className="absolute right-0 z-20 mt-1.5 w-64 rounded-xl border border-border bg-surface p-1 shadow-soft-lg"
        >
          <div className="flex items-center justify-end gap-1 border-b border-border px-2 pb-1.5 pt-1">
            <button
              type="button"
              onClick={() => onSetAll(true)}
              disabled={checkedCount === options.length}
              className="rounded px-1 text-xs font-medium text-fg-secondary hover:text-gold-deep disabled:pointer-events-none disabled:opacity-40"
            >
              Todas
            </button>
            <span className="text-xs text-fg-muted">·</span>
            <button
              type="button"
              onClick={() => onSetAll(false)}
              disabled={checkedCount === 0}
              className="rounded px-1 text-xs font-medium text-fg-secondary hover:text-gold-deep disabled:pointer-events-none disabled:opacity-40"
            >
              Nenhuma
            </button>
          </div>
          <ul className="max-h-72 overflow-y-auto py-1">
            {options.map((o) => {
              const checked = selected.has(o.id)
              return (
                <li key={o.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-fg-secondary transition-colors duration-100 hover:bg-surface-muted hover:text-fg">
                    <input type="checkbox" className="peer sr-only" checked={checked} onChange={() => onToggle(o.id)} />
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors peer-focus-visible:ring-3 peer-focus-visible:ring-gold/25 ${
                        checked ? 'border-ink bg-ink text-gold' : 'border-border-strong bg-surface'
                      }`}
                      aria-hidden
                    >
                      {checked && <CheckIcon className="h-3 w-3" />}
                    </span>
                    <span className="flex-1 truncate">{o.label}</span>
                    {o.count !== undefined && <span className="text-xs tabular-nums text-fg-muted">{o.count}</span>}
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
