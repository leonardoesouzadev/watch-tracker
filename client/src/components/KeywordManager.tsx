import { WATCH_BRANDS } from '../watchFilter'
import { Combobox } from './Combobox'

const SORTED_BRANDS = [...WATCH_BRANDS].sort((a, b) => a.localeCompare(b, 'pt-BR'))

/** Brand/model search field; picking or typing a term adds it to the saved searches. */
export function KeywordSearch({ onAdd }: { onAdd: (keyword: string) => void }) {
  return <Combobox options={SORTED_BRANDS} placeholder="Buscar marca ou digitar modelo…" onSelect={onAdd} allowFreeText />
}

interface ChipsProps {
  keywords: string[]
  selected: string | null
  onRemove: (keyword: string) => void
  onSelect: (keyword: string) => void
}

/** The user's saved searches: click one to see its results, × to drop it. */
export function KeywordChips({ keywords, selected, onRemove, onSelect }: ChipsProps) {
  if (keywords.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="field-label mr-1">
        Suas buscas <span className="font-normal text-fg-muted">· clique para ver os resultados</span>
      </span>
      <ul className="flex flex-wrap gap-2">
        {keywords.map((kw) => {
          const isActive = kw === selected
          return (
            <li
              key={kw}
              className={`flex items-center gap-1 rounded-full border py-0.5 pl-3 pr-1 transition-colors duration-150 ${
                isActive ? 'border-ink bg-ink' : 'border-border bg-surface hover:border-gold-soft hover:bg-gold-tint'
              }`}
            >
              {isActive && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden />}
              <button
                onClick={() => onSelect(kw)}
                title={isActive ? `Buscar “${kw}” de novo` : `Ver resultados de “${kw}”`}
                aria-pressed={isActive}
                className={`max-w-48 truncate text-[13px] ${isActive ? 'font-medium text-white' : 'text-fg-secondary'}`}
              >
                {kw}
              </button>
              <button
                onClick={() => onRemove(kw)}
                title="Remover"
                aria-label={`Remover ${kw}`}
                className={`rounded-full p-1 text-base leading-none transition-colors duration-150 ${
                  isActive ? 'text-white/45 hover:bg-white/10 hover:text-white' : 'text-fg-muted hover:bg-surface-muted hover:text-fg'
                }`}
              >
                ×
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
