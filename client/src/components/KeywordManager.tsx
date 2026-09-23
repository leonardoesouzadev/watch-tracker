import { WATCH_BRANDS } from '../watchFilter'
import { Combobox } from './Combobox'

interface Props {
  keywords: string[]
  selected: string | null
  onAdd: (keyword: string) => void
  onRemove: (keyword: string) => void
  onSelect: (keyword: string) => void
}

const SORTED_BRANDS = [...WATCH_BRANDS].sort((a, b) => a.localeCompare(b, 'pt-BR'))

export function KeywordManager({ keywords, selected, onAdd, onRemove, onSelect }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <Combobox
        options={SORTED_BRANDS}
        placeholder="Buscar marca ou digitar modelo…"
        onSelect={onAdd}
        allowFreeText
        tone="dark"
      />

      <ul className="flex flex-wrap gap-2">
        {keywords.length === 0 && <li className="text-sm text-sidebar-muted">Nenhuma palavra-chave ainda</li>}
        {keywords.map((kw) => {
          const isActive = kw === selected
          return (
            <li
              key={kw}
              className={`flex items-center gap-1 rounded-full border py-1 pl-3 pr-1 transition-colors duration-150 ${
                isActive
                  ? 'border-gold/40 bg-gold/10'
                  : 'border-white/10 bg-transparent hover:border-white/20 hover:bg-white/4'
              }`}
            >
              {isActive && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden />}
              <button
                onClick={() => onSelect(kw)}
                title={kw}
                className={`max-w-40 truncate text-sm ${isActive ? 'font-medium text-gold-light' : 'text-white/75'}`}
              >
                {kw}
              </button>
              <button
                onClick={() => onRemove(kw)}
                title="Remover"
                className="rounded-full p-1 text-base leading-none text-white/35 transition-colors duration-150 hover:bg-white/10 hover:text-white"
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
