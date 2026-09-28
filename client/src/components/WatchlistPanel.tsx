import { useState } from 'react'
import type { WatchedLot } from '../types'
import { ListingCard } from './ListingCard'
import { StarIcon } from './icons'
import { toggleWatch, useWatchlist } from '../watchlist'

// Current bid and end time come from the robot's last check, not the snapshot
// taken when the lot was followed.
function currentListing(lot: WatchedLot) {
  return { ...lot.listing, price: lot.lastPrice ?? lot.listing.price, endsAt: lot.endsAt ?? lot.listing.endsAt }
}

export function WatchlistPanel() {
  const { lots, loaded, error } = useWatchlist()
  const [actionError, setActionError] = useState<string | null>(null)
  const open = lots.filter((l) => !l.ended)
  const ended = lots.filter((l) => l.ended)

  async function handleToggle(lot: WatchedLot) {
    setActionError(null)
    try {
      await toggleWatch(lot.listing)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <span className="eyebrow text-fg-muted">Monitoramento</span>
        <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-[28px]">Acompanhando</h2>
        <p className="max-w-xl text-sm text-fg-secondary">
          Lotes marcados com a estrela. O robô avisa no Telegram quando entra um lance novo, 24 horas e 3 horas antes do
          fim, e quando o leilão encerra.
        </p>
      </header>

      {!loaded && <p className="text-sm text-fg-muted">Carregando…</p>}
      {(error || actionError) && (
        <p className="rounded-xl border border-danger-border bg-danger-soft px-4 py-3 text-sm text-danger">
          {error || actionError}
        </p>
      )}

      {loaded && !error && open.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border-strong bg-surface-soft px-6 py-16 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-gold-soft bg-gold-tint text-gold-text">
            <StarIcon className="h-5 w-5" />
          </span>
          <p className="max-w-sm text-sm leading-relaxed text-fg-secondary">
            Nenhum lote acompanhado. Na busca ou nos achados dos alertas, toque na estrela de um lote para acompanhar os
            lances e o fim do leilão.
          </p>
        </div>
      )}

      {open.length > 0 && (
        <div className="grid grid-cols-1 gap-5 min-[420px]:grid-cols-2 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4 2xl:grid-cols-5">
          {open.map((lot) => (
            <ListingCard key={lot.id} listing={currentListing(lot)} isNew={false} watched onToggleWatch={() => handleToggle(lot)} />
          ))}
        </div>
      )}

      {ended.length > 0 && (
        <section className="flex flex-col gap-4">
          <h3 className="text-sm font-medium text-fg-secondary">Encerrados</h3>
          <div className="grid grid-cols-1 gap-5 opacity-70 min-[420px]:grid-cols-2 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4 2xl:grid-cols-5">
            {ended.map((lot) => (
              <ListingCard key={lot.id} listing={currentListing(lot)} isNew={false} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
