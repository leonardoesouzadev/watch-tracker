import { useState } from 'react'
import { Toggle } from './Toggle'
import { ChevronDownIcon } from './icons'

interface BuiltInSource {
  id: string
  name: string
  region: string
}

interface Props {
  builtInSources: BuiltInSource[]
  regions: { id: string; name: string }[]
  disabledSources: Set<string>
  onToggleBuiltIn: (id: string) => void
  onSetAll: (enabled: boolean) => void
}

const OPEN_KEY = 'watch-tracker:sources-open'

function loadOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === '1'
  } catch {
    return false
  }
}

function saveOpen(open: boolean) {
  try {
    localStorage.setItem(OPEN_KEY, open ? '1' : '0')
  } catch {
    // Private mode / blocked storage: the list just starts closed next time.
  }
}

const linkButton =
  'rounded px-1 text-[11px] font-medium text-sidebar-muted transition-colors hover:text-gold disabled:pointer-events-none disabled:opacity-40'

// Collapsed by default: a one-line summary that opens the full list, grouped by region.
export function SourceManager({ builtInSources, regions, disabledSources, onToggleBuiltIn, onSetAll }: Props) {
  const [open, setOpen] = useState(loadOpen)
  const enabledCount = builtInSources.filter((s) => !disabledSources.has(s.id)).length
  const total = builtInSources.length

  function toggleOpen() {
    setOpen((prev) => {
      saveOpen(!prev)
      return !prev
    })
  }

  return (
    <div className="rounded-xl border border-white/8 bg-white/3">
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={open}
        aria-controls="source-list"
        className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition-colors duration-150 hover:bg-white/4 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-gold/25"
      >
        <span className="text-xs text-white/85">
          <b className="font-semibold text-gold tabular-nums">{enabledCount}</b>
          <span className="text-sidebar-muted"> de {total} fontes ativas</span>
        </span>
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-sidebar-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div id="source-list" className="border-t border-white/6 px-3 pb-3 pt-2">
          <div className="mb-1 flex justify-end gap-1">
            <button type="button" className={linkButton} disabled={enabledCount === total} onClick={() => onSetAll(true)}>
              Todas
            </button>
            <span className="text-[11px] text-sidebar-faint">·</span>
            <button type="button" className={linkButton} disabled={enabledCount === 0} onClick={() => onSetAll(false)}>
              Nenhuma
            </button>
          </div>
          {regions.map((region) => {
            const sources = builtInSources.filter((s) => s.region === region.id)
            if (sources.length === 0) return null
            return (
              <div key={region.id} className="mt-2 first:mt-0">
                <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-sidebar-faint">{region.name}</p>
                <ul className="flex flex-col">
                  {sources.map((s) => {
                    const enabled = !disabledSources.has(s.id)
                    return (
                      <li key={s.id} className="-mx-1.5 rounded-md px-1.5 py-1 transition-colors duration-150 hover:bg-white/4">
                        <Toggle
                          checked={enabled}
                          onChange={() => onToggleBuiltIn(s.id)}
                          label={s.name}
                          labelClassName={`truncate text-xs transition-colors ${enabled ? 'text-white/85' : 'text-sidebar-muted'}`}
                          tone="dark"
                          size="sm"
                        />
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
