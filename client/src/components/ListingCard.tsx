import type { Listing } from '../types'
import { SOURCE_LABEL } from '../sourceLabels'
import { GavelIcon } from './icons'

interface Props {
  listing: Listing
  isNew: boolean
  /** Set when shown as an alert find: when the robot first saw the listing. */
  foundAt?: string
  /** Name of the alert that found it. */
  foundBy?: string
}

function formatPrice(price: Listing['price']): string {
  if (!price) return 'Sem lance/preço'
  const amount = Number(price.value)
  if (Number.isNaN(amount)) return `${price.value} ${price.currency}`
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: price.currency }).format(amount)
  } catch {
    return `${price.value} ${price.currency}`
  }
}

export function ListingCard({ listing, isNew, foundAt, foundBy }: Props) {
  const price = formatPrice(listing.price)

  return (
    <a
      href={listing.itemUrl}
      target="_blank"
      rel="noreferrer"
      className="group card relative flex flex-col p-2.5 transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-px hover:border-border-strong hover:shadow-soft-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-gold/25"
    >
      <div className="relative flex h-56 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-muted">
        {listing.image ? (
          <img
            src={listing.image}
            alt={listing.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.02]"
          />
        ) : (
          <span className="text-xs text-fg-muted">Sem imagem</span>
        )}

        {isNew && (
          <span className="eyebrow absolute left-2.5 top-2.5 rounded-full bg-ink px-2 py-0.5 text-[10px] text-gold-light">
            Novo
          </span>
        )}
        <span className="absolute right-2.5 top-2.5 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-fg-secondary shadow-soft-sm backdrop-blur-sm">
          {SOURCE_LABEL[listing.source] ?? listing.source}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 px-1.5 pb-1.5 pt-4">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-fg">{listing.title}</p>
        <p className={`tabular-nums tracking-tight ${listing.price ? 'text-xl font-semibold text-fg' : 'text-sm text-fg-muted'}`}>
          {price}
        </p>
        {(listing.location || listing.seller) && (
          <div className="mt-auto flex flex-col gap-2 pt-1">
            {listing.location && <p className="text-xs text-fg-meta">{listing.location}</p>}
            {listing.seller && (
              <p className="badge badge-gold w-fit max-w-full">
                <GavelIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{listing.seller}</span>
              </p>
            )}
          </div>
        )}
        {foundAt && (
          <p className="mt-1 flex items-center gap-1.5 border-t border-border pt-2.5 text-[11px] text-fg-meta">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden />
            <span className="truncate">
              Encontrado {new Date(foundAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
              {foundBy && <> · {foundBy}</>}
            </span>
          </p>
        )}
      </div>
    </a>
  )
}
