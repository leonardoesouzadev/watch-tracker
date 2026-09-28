import { useEffect, useId, useRef, useState } from 'react'
import type { LandedCost, Listing } from '../types'
import { SOURCE_LABEL } from '../sourceLabels'
import { landedCostText } from '../../../shared/landedCost.js'
import { BellIcon, GavelIcon, StarIcon, XIcon } from './icons'

interface Props {
  listing: Listing
  isNew: boolean
  /** Set when shown as an alert find: when the robot first saw the listing. */
  foundAt?: string
  /** Name of the alert that found it. */
  foundBy?: string
  /** Shows a bell button that opens an alert prefilled from this listing. */
  onCreateAlert?: (listing: Listing) => void
  /** Shows a star button to follow (or stop following) the lot. */
  onToggleWatch?: (listing: Listing) => void
  watched?: boolean
}

const PRICE_TYPE_LABEL: Record<string, string> = {
  bid: 'Lance',
  estimate: 'Estimativa',
  fixed: 'Preço',
  appraisal: 'Avaliação',
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

const brl = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)

/** "termina em 3 h" / "termina em 2 dias" / "encerrado", plus the date. */
function describeEnd(iso: string): { text: string; soon: boolean } | null {
  const end = new Date(iso)
  if (Number.isNaN(end.getTime())) return null
  const hours = (end.getTime() - Date.now()) / 3_600_000
  const date = end.toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  if (hours <= 0) return { text: `Encerrado · ${date}`, soon: false }
  const left = hours < 1 ? 'menos de 1 h' : hours < 48 ? `${Math.round(hours)} h` : `${Math.round(hours / 24)} dias`
  return { text: `Termina em ${left} · ${date}`, soon: hours < 24 }
}

/**
 * Cost breakdown opened over the bottom of the card, so the card keeps its
 * height. Closes on ×, a click outside or Esc.
 */
function CostBreakdown({ cost, onClose }: { cost: LandedCost; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const text = landedCostText(cost)

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    ref.current?.focus()
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={text.heading}
      tabIndex={-1}
      className="absolute inset-x-2.5 bottom-2.5 z-10 max-h-[calc(100%-1.25rem)] overflow-y-auto rounded-xl border border-gold-soft bg-surface p-3 text-xs text-fg-secondary shadow-soft-lg focus:outline-none"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] text-fg-muted">{text.heading}</p>
          <p className="text-base font-semibold tabular-nums text-fg">{brl(cost.total)}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="rounded-md p-1 text-icon transition-colors hover:bg-surface-muted hover:text-fg"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      <dl className="mt-2.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-border pt-2.5 text-[11px]">
        {cost.lines.map((line) => (
          <div key={line.label} className="contents">
            <dt>{line.label}</dt>
            <dd className="text-right tabular-nums text-fg">{brl(line.value)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2.5 text-[10px] leading-snug text-fg-muted">{text.disclaimer}</p>
      {cost.notes.map((note) => (
        <p key={note} className="mt-1 text-[10px] leading-snug text-gold-text">
          {note}
        </p>
      ))}
    </div>
  )
}

const cornerButton =
  'absolute top-48.5 flex h-8 w-8 items-center justify-center rounded-full shadow-soft-sm backdrop-blur-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-gold/40'

export function ListingCard({ listing, isNew, foundAt, foundBy, onCreateAlert, onToggleWatch, watched }: Props) {
  const price = formatPrice(listing.price)
  const foreign = listing.price && listing.price.currency !== 'BRL' && listing.priceBRL != null
  const end = listing.endsAt ? describeEnd(listing.endsAt) : null
  const title = listing.titlePt || listing.title
  const [costOpen, setCostOpen] = useState(false)
  const costId = useId()

  return (
    // Buttons are siblings of the link, not children: a button nested in <a>
    // is invalid HTML and would also open the listing when clicked.
    <div className="card group relative flex w-full flex-col p-2.5 transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-px hover:border-border-strong hover:shadow-soft-md">
      <a
        href={listing.itemUrl}
        target="_blank"
        rel="noreferrer"
        className="flex flex-col rounded-xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-gold/25"
      >
        <div className="relative flex h-56 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-muted">
          {listing.image ? (
            <img
              src={listing.image}
              alt={title}
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

        <div className="flex flex-col gap-1.5 px-1.5 pt-4">
          <p className="line-clamp-2 text-sm font-medium leading-snug text-fg">{title}</p>
          {listing.titlePt && <p className="line-clamp-1 text-[11px] text-fg-muted">{listing.title}</p>}
          <div className="flex flex-col gap-0.5">
            {listing.price && listing.priceType && (
              <span className="text-[11px] text-fg-muted">{PRICE_TYPE_LABEL[listing.priceType]}</span>
            )}
            <p className={`tabular-nums tracking-tight ${listing.price ? 'text-xl font-semibold text-fg' : 'text-sm text-fg-muted'}`}>
              {price}
            </p>
            {foreign && <p className="text-xs tabular-nums text-fg-secondary">≈ {brl(listing.priceBRL!)}</p>}
          </div>
        </div>
      </a>

      <div className="flex flex-1 flex-col gap-2 px-1.5 pb-1.5 pt-2">
        {listing.landedCost && (
          <button
            type="button"
            onClick={() => setCostOpen((v) => !v)}
            // Keeps the panel's "click outside" from closing it just before this toggles it.
            onPointerDown={(e) => e.stopPropagation()}
            aria-expanded={costOpen}
            aria-controls={costId}
            className="flex w-full items-center justify-between gap-2 rounded-lg bg-gold-tint px-2.5 py-1.5 text-left text-xs text-gold-text transition-colors hover:bg-gold-soft/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-gold/25"
          >
            <span>
              ≈ <b className="tabular-nums">{brl(listing.landedCost.total)}</b> {landedCostText(listing.landedCost).suffix}
            </span>
            <span className="text-[10px] underline decoration-dotted">detalhes</span>
          </button>
        )}

        {listing.suspicious && listing.suspicious.length > 0 && (
          <p className="rounded-lg border border-danger-border bg-danger-soft px-2.5 py-1.5 text-[11px] leading-snug text-danger">
            ⚠️ Atenção: {listing.suspicious.join('; ')}
          </p>
        )}

        {end && <p className={`text-xs ${end.soon ? 'font-medium text-danger' : 'text-fg-meta'}`}>{end.text}</p>}

        {listing.references && listing.references.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {listing.references.map((ref) => (
              <span key={ref} className="badge font-mono">
                Ref. {ref}
              </span>
            ))}
          </div>
        )}

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

      {costOpen && listing.landedCost && (
        <div id={costId}>
          <CostBreakdown cost={listing.landedCost} onClose={() => setCostOpen(false)} />
        </div>
      )}

      {/* Both sit on the image's bottom-right corner (card padding 10px + image 224px). */}
      {onToggleWatch && (
        <button
          type="button"
          onClick={() => onToggleWatch(listing)}
          title={watched ? 'Parar de acompanhar' : 'Acompanhar lances e fim do leilão'}
          aria-pressed={watched}
          aria-label={`${watched ? 'Parar de acompanhar' : 'Acompanhar'} ${title}`}
          className={`${cornerButton} ${onCreateAlert ? 'right-14' : 'right-4.5'} ${
            watched ? 'bg-ink text-gold hover:bg-ink-muted' : 'bg-white/90 text-fg-secondary hover:bg-ink hover:text-gold'
          }`}
        >
          <StarIcon className="h-4 w-4" filled={watched} />
        </button>
      )}
      {onCreateAlert && (
        <button
          type="button"
          onClick={() => onCreateAlert(listing)}
          title="Criar alerta para este relógio"
          aria-label={`Criar alerta para ${title}`}
          className={`${cornerButton} right-4.5 bg-white/90 text-fg-secondary hover:bg-ink hover:text-gold`}
        >
          <BellIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
