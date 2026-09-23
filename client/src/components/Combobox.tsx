import { useMemo, useRef, useState } from 'react'
import { SearchIcon, ChevronDownIcon, CheckIcon } from './icons'
import { normalize } from '../normalize'

interface Props {
  options: string[]
  placeholder?: string
  onSelect: (value: string) => void
  maxResults?: number
  /** Lets Enter (or a dedicated row) add whatever was typed, even if it matches no option. */
  allowFreeText?: boolean
  /** Closed-set mode: renders as a click-to-open dropdown trigger instead of a search input. */
  selectOnly?: boolean
  /** Currently selected value, shown on the trigger in selectOnly mode. */
  value?: string
  className?: string
  /** Surface the combobox sits on — `dark` for the sidebar. */
  tone?: 'light' | 'dark'
}

const TONES = {
  light: {
    field: 'field',
    icon: 'text-icon',
    list: 'border-border bg-surface shadow-soft-lg',
    empty: 'text-fg-muted',
    option: 'text-fg-secondary',
    optionActive: 'bg-surface-muted text-fg',
    freeText: 'text-gold-deep',
    freeTextActive: 'bg-gold-tint text-gold-text',
  },
  dark: {
    field:
      'rounded-[10px] border border-white/10 bg-ink-soft px-3 py-2 text-sm text-sidebar-fg transition-[border-color,box-shadow] duration-150 placeholder:text-sidebar-faint focus:border-gold focus:outline-none focus:ring-3 focus:ring-gold/15',
    icon: 'text-sidebar-faint',
    list: 'border-white/10 bg-ink-muted shadow-soft-lg',
    empty: 'text-sidebar-muted',
    option: 'text-white/75',
    optionActive: 'bg-white/6 text-white',
    freeText: 'text-gold-light',
    freeTextActive: 'bg-gold/10 text-gold-light',
  },
}

export function Combobox({
  options,
  placeholder,
  onSelect,
  maxResults = 8,
  allowFreeText = false,
  selectOnly = false,
  value,
  className,
  tone = 'light',
}: Props) {
  const t = TONES[tone]
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const trimmedQuery = query.trim()

  const filtered = useMemo(() => {
    if (selectOnly) return options.slice(0, maxResults)
    const q = normalize(trimmedQuery)
    const matches = q ? options.filter((o) => normalize(o).includes(q)) : options
    return matches.slice(0, maxResults)
  }, [options, trimmedQuery, maxResults, selectOnly])

  const showFreeText =
    allowFreeText &&
    !selectOnly &&
    trimmedQuery !== '' &&
    !filtered.some((o) => normalize(o) === normalize(trimmedQuery))
  const rowCount = filtered.length + (showFreeText ? 1 : 0)

  function select(next: string) {
    onSelect(next)
    setQuery('')
    setOpen(false)
    setHighlighted(0)
  }

  function openList() {
    const currentIndex = value ? filtered.findIndex((o) => o === value) : -1
    setHighlighted(currentIndex >= 0 ? currentIndex : 0)
    setOpen(true)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement | HTMLButtonElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter')) {
      e.preventDefault()
      openList()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (rowCount > 0) setHighlighted((prev) => Math.min(prev + 1, rowCount - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (rowCount > 0) setHighlighted((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlighted < filtered.length && filtered[highlighted]) {
        select(filtered[highlighted])
      } else if (showFreeText) {
        select(trimmedQuery)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
      triggerRef.current?.blur()
    }
  }

  return (
    <div className={`relative ${className ?? ''}`}>
      <div className="relative">
        {selectOnly ? (
          <button
            ref={triggerRef}
            type="button"
            onClick={() => (open ? setOpen(false) : openList())}
            onBlur={() => setOpen(false)}
            onKeyDown={handleKeyDown}
            className={`${t.field} w-full truncate pr-8 text-left`}
          >
            {value || placeholder}
          </button>
        ) : (
          <>
            <SearchIcon className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${t.icon}`} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setHighlighted(0)
                setOpen(true)
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setOpen(false)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className={`${t.field} w-full py-2.5 pl-9`}
            />
          </>
        )}
        {selectOnly && (
          <ChevronDownIcon className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 ${t.icon}`} />
        )}
      </div>

      {open && (
        <ul className={`absolute z-20 mt-1.5 max-h-60 w-full overflow-auto rounded-xl border p-1 ${t.list}`}>
          {filtered.length === 0 && !showFreeText && (
            <li className={`px-3 py-2 text-sm ${t.empty}`}>Nenhuma marca encontrada</li>
          )}
          {filtered.map((option, index) => (
            <li key={option}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  select(option)
                }}
                onMouseEnter={() => setHighlighted(index)}
                className={`flex w-full items-center gap-2 truncate rounded-lg px-3 py-1.5 text-left text-sm transition-colors duration-150 ${
                  index === highlighted ? t.optionActive : t.option
                }`}
              >
                {selectOnly && (
                  <CheckIcon
                    className={`h-3.5 w-3.5 shrink-0 text-gold ${option === value ? 'opacity-100' : 'opacity-0'}`}
                  />
                )}
                <span className="truncate">{option}</span>
              </button>
            </li>
          ))}
          {showFreeText && (
            <li>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  select(trimmedQuery)
                }}
                onMouseEnter={() => setHighlighted(filtered.length)}
                className={`block w-full truncate rounded-lg px-3 py-1.5 text-left text-sm font-medium transition-colors duration-150 ${
                  filtered.length === highlighted ? t.freeTextActive : t.freeText
                }`}
              >
                Adicionar “{trimmedQuery}”
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
