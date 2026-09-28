interface Props {
  page: number
  totalPages: number
  total: number
  /** "anúncios", "lotes"… */
  noun: string
  onChange: (page: number) => void
}

export function Pagination({ page, totalPages, total, noun, onChange }: Props) {
  if (totalPages <= 1) return null
  return (
    <nav className="mt-2 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
      <button type="button" disabled={page <= 1} onClick={() => onChange(Math.max(1, page - 1))} className="btn btn-secondary">
        ← Anterior
      </button>
      <span className="text-sm text-fg-secondary">
        Página <span className="font-medium text-fg tabular-nums">{page}</span> de <span className="tabular-nums">{totalPages}</span>
        <span className="mx-2 text-border-strong">·</span>
        <span className="tabular-nums">{total}</span> {noun}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        className="btn btn-primary"
      >
        Próxima →
      </button>
    </nav>
  )
}
