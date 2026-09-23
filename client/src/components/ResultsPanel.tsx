import { useEffect, useState } from 'react'
import type { KeywordState } from '../types'
import { ListingCard } from './ListingCard'
import { SOURCE_LABEL } from '../sourceLabels'
import { isLikelyWatch } from '../watchFilter'
import { normalize } from '../normalize'
import { Toggle } from './Toggle'
import { SearchIcon, CheckIcon, WatchIcon } from './icons'
import { Combobox } from './Combobox'

interface Props {
  keyword: string | null
  state: KeywordState | undefined
}

const PAGE_SIZE = 20

type SortOrder = 'none' | 'price-asc' | 'price-desc'

const SORT_OPTIONS: Record<SortOrder, string> = {
  none: 'Relevância',
  'price-asc': 'Menor preço',
  'price-desc': 'Maior preço',
}
const SORT_LABEL_TO_ORDER: Record<string, SortOrder> = {
  Relevância: 'none',
  'Menor preço': 'price-asc',
  'Maior preço': 'price-desc',
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border-strong bg-surface-soft px-6 py-16 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-fg-muted shadow-soft-sm">
        <WatchIcon className="h-5 w-5" />
      </span>
      <p className="max-w-sm text-sm leading-relaxed text-fg-secondary">{children}</p>
    </div>
  )
}

function ErrorNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 rounded-xl border border-danger-border bg-danger-soft px-4 py-3 text-sm text-danger">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-danger" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

export function ResultsPanel({ keyword, state }: Props) {
  const allItems = state?.data?.items ?? []
  const [page, setPage] = useState(1)
  const [sortOrder, setSortOrder] = useState<SortOrder>('none')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [onlyWatches, setOnlyWatches] = useState(true)
  const [onlyNew, setOnlyNew] = useState(false)
  const [titleQuery, setTitleQuery] = useState('')
  const [hiddenSources, setHiddenSources] = useState<Set<string>>(new Set())

  useEffect(() => {
    setPage(1)
  }, [keyword, state?.data])

  useEffect(() => {
    setPage(1)
  }, [sortOrder, minPrice, maxPrice, onlyWatches, onlyNew, titleQuery, hiddenSources])

  const min = minPrice.trim() === '' ? null : Number(minPrice)
  const max = maxPrice.trim() === '' ? null : Number(maxPrice)
  const normalizedTitleQuery = normalize(titleQuery.trim())

  const watchFilteredItems = onlyWatches ? allItems.filter((item) => isLikelyWatch(item.title)) : allItems

  const items = watchFilteredItems
    .filter((item) => !normalizedTitleQuery || normalize(item.title).includes(normalizedTitleQuery))
    .filter((item) => !hiddenSources.has(item.source))
    .filter((item) => !onlyNew || (state?.newIds.has(item.id) ?? false))
    .filter((item) => {
      if (min === null && max === null) return true
      const value = item.price ? Number(item.price.value) : NaN
      if (Number.isNaN(value)) return false
      if (min !== null && value < min) return false
      if (max !== null && value > max) return false
      return true
    })
    .sort((a, b) => {
      if (sortOrder === 'none') return 0
      const av = a.price ? Number(a.price.value) : NaN
      const bv = b.price ? Number(b.price.value) : NaN
      if (Number.isNaN(av) && Number.isNaN(bv)) return 0
      if (Number.isNaN(av)) return 1
      if (Number.isNaN(bv)) return -1
      return sortOrder === 'price-asc' ? av - bv : bv - av
    })

  if (!keyword) {
    return (
      <EmptyState>Adicione uma palavra-chave e selecione-a para ver os lotes de leilão encontrados.</EmptyState>
    )
  }

  const availableSources = state?.data ? Object.keys(state.data.sources) : []
  const hasActiveFilters =
    !onlyWatches || onlyNew || minPrice !== '' || maxPrice !== '' || sortOrder !== 'none' || titleQuery !== '' || hiddenSources.size > 0

  function toggleSource(name: string) {
    setHiddenSources((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function clearFilters() {
    setOnlyWatches(true)
    setOnlyNew(false)
    setMinPrice('')
    setMaxPrice('')
    setSortOrder('none')
    setTitleQuery('')
    setHiddenSources(new Set())
  }

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = items.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-2">
        <span className="eyebrow text-fg-muted">Palavra-chave</span>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-[28px]">{keyword}</h2>
          {state?.loading && (
            <span className="badge badge-gold">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold" aria-hidden />
              Buscando…
            </span>
          )}
        </div>
        {state?.lastFetchedAt && (
          <p className="text-sm text-fg-secondary">
            Atualizado às {new Date(state.lastFetchedAt).toLocaleTimeString()}
          </p>
        )}
      </header>

      {allItems.length > 0 && (
        <div className="card flex flex-col gap-5 p-5">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-48 flex-1">
              <label className="field-label mb-1.5 block">Buscar no título</label>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-icon" />
                <input
                  type="text"
                  value={titleQuery}
                  onChange={(e) => setTitleQuery(e.target.value)}
                  placeholder="ex: automático, dourado…"
                  className="field w-full pl-9"
                />
              </div>
            </div>

            <label className="field-label flex flex-col gap-1.5">
              Preço mín. (R$)
              <input
                type="number"
                min={0}
                inputMode="decimal"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder="0"
                className="field w-28 tabular-nums"
              />
            </label>
            <label className="field-label flex flex-col gap-1.5">
              Preço máx. (R$)
              <input
                type="number"
                min={0}
                inputMode="decimal"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="Sem limite"
                className="field w-28 tabular-nums"
              />
            </label>
            <div className="w-40">
              <label className="field-label mb-1.5 block">Ordenar por</label>
              <Combobox
                options={Object.values(SORT_OPTIONS)}
                value={SORT_OPTIONS[sortOrder]}
                onSelect={(label) => setSortOrder(SORT_LABEL_TO_ORDER[label] ?? 'none')}
                selectOnly
              />
            </div>

            {hasActiveFilters && (
              <button type="button" onClick={clearFilters} className="btn btn-secondary">
                Limpar filtros
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-4">
            <Toggle checked={onlyWatches} onChange={() => setOnlyWatches((prev) => !prev)} label="Somente relógios" />
            <Toggle checked={onlyNew} onChange={() => setOnlyNew((prev) => !prev)} label="Somente novos" />

            {availableSources.length > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="field-label mr-1">Fonte</span>
                {availableSources.map((name) => {
                  const visible = !hiddenSources.has(name)
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggleSource(name)}
                      aria-pressed={visible}
                      className={`chip ${visible ? 'chip-active' : 'text-fg-muted'}`}
                    >
                      {visible && <CheckIcon className="h-3 w-3 text-gold" />}
                      {SOURCE_LABEL[name] ?? name}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {state?.error && <ErrorNotice>Erro: {state.error}</ErrorNotice>}
      {state?.data &&
        Object.entries(state.data.sources)
          .filter(([, s]) => s?.error)
          .map(([name, s]) => (
            <ErrorNotice key={name}>
              {SOURCE_LABEL[name] ?? name}: {s?.error}
            </ErrorNotice>
          ))}

      {!state?.loading && items.length === 0 && !state?.error && (
        <EmptyState>
          {allItems.length === 0
            ? 'Nenhum anúncio encontrado para essa palavra-chave ainda.'
            : 'Nenhum anúncio encontrado com os filtros atuais. Tente ajustar ou limpar os filtros.'}
        </EmptyState>
      )}

      <div className="grid grid-cols-1 gap-5 min-[420px]:grid-cols-2 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4 2xl:grid-cols-5">
        {pageItems.map((item) => (
          <ListingCard key={item.id} listing={item} isNew={state?.newIds.has(item.id) ?? false} />
        ))}
      </div>

      {totalPages > 1 && (
        <nav className="mt-2 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="btn btn-secondary"
          >
            ← Anterior
          </button>
          <span className="text-sm text-fg-secondary">
            Página <span className="font-medium text-fg tabular-nums">{currentPage}</span> de{' '}
            <span className="tabular-nums">{totalPages}</span>
            <span className="mx-2 text-border-strong">·</span>
            <span className="tabular-nums">{items.length}</span> anúncios
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="btn btn-primary"
          >
            Próxima →
          </button>
        </nav>
      )}
    </div>
  )
}
