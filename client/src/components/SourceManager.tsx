import { Toggle } from './Toggle'

interface BuiltInSource {
  id: string
  name: string
}

interface Props {
  builtInSources: BuiltInSource[]
  disabledSources: Set<string>
  onToggleBuiltIn: (id: string) => void
}

export function SourceManager({ builtInSources, disabledSources, onToggleBuiltIn }: Props) {
  return (
    <ul className="flex flex-col gap-1">
      {builtInSources.map((s) => {
        const enabled = !disabledSources.has(s.id)
        return (
          <li
            key={s.id}
            className="-mx-2 flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-white/4"
          >
            <Toggle
              checked={enabled}
              onChange={() => onToggleBuiltIn(s.id)}
              label={s.name}
              labelClassName={`max-w-44 truncate text-sm transition-colors ${enabled ? 'text-white/85' : 'text-sidebar-muted'}`}
              tone="dark"
            />
          </li>
        )
      })}
    </ul>
  )
}
