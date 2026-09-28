import { useEffect, useState } from 'react'
import type { AlertInput, KeywordState, Listing } from '../types'
import { ListingCard } from './ListingCard'
import { BUILT_IN_SOURCES, REGIONS, SOURCE_LABEL } from '../sourceLabels'
import { isLikelyWatch } from '../watchFilter'
import { normalize } from '../normalize'
import { createAlert } from '../alertsApi'
import { toggleWatch, useWatchlist } from '../watchlist'
import { Toggle } from './Toggle'
import { AlertForm } from './AlertForm'
import { BellIcon, GlobeIcon, RefreshIcon, SearchIcon, StarIcon, WatchIcon } from './icons'
import { Combobox } from './Combobox'
import { CurrencyInput } from './CurrencyInput'
import { MultiSelect } from './MultiSelect'
import { Pagination } from './Pagination'

interface Props {
  keyword: string | null
  state: KeywordState | undefined
  /** Search field, shown at the right of the header. */
  searchBar: React.ReactNode
  /** Saved searches, shown under the header. */
  savedSearches: React.ReactNode
  /** Runs the selected keyword's search again. */
  onRefresh: () => void
  /** Starts a search for a suggested term. */
  onSearch: (keyword: string) => void
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

// Listing titles are long ("Lote 12 - Relógio Rolex Submariner Date 116610LN
// em aço, caixa 40mm..."): the alert search term keeps only the first few
// words after dropping auction and generic watch words, so it still matches
// other listings of the same model. The user can edit it in the form.
const ALERT_QUERY_MAX_WORDS = 5
const ALERT_QUERY_NOISE = /\b(lote|lot)\s*(n[º°o.]?\s*)?\d*\b|\b(rel[oó]gios?|watch|de pulso)\b|[-–—:|,;()]/gi

const TRAILING_STOPWORDS = new Set(['em', 'de', 'do', 'da', 'com', 'e', 'para', 'a', 'o'])

function alertQueryFromTitle(title: string): string {
  const words = title.replace(ALERT_QUERY_NOISE, ' ').split(/\s+/).filter(Boolean).slice(0, ALERT_QUERY_MAX_WORDS)
  while (words.length > 1 && TRAILING_STOPWORDS.has(words[words.length - 1].toLowerCase())) words.pop()
  return words.join(' ')
}

/** Price in reais (foreign prices already converted by the server); NaN when unknown. */
function priceInBRL(item: Listing): number {
  if (item.priceBRL != null) return item.priceBRL
  return item.price?.currency === 'BRL' ? Number(item.price.value) : NaN
}

const SUGGESTIONS = ['Rolex Submariner', 'Omega Speedmaster', 'Cartier Santos', 'Patek Philippe', 'Grand Seiko', 'Tudor Black Bay']

const HIGHLIGHTS = [
  {
    icon: GlobeIcon,
    title: 'Custo total no Brasil',
    text: 'Lotes de fora já vêm em reais, com comissão, frete e impostos estimados.',
  },
  { icon: BellIcon, title: 'Alertas', text: 'Transforme uma busca em alerta e receba os lotes novos no Telegram.' },
  { icon: StarIcon, title: 'Acompanhe lances', text: 'Marque um lote e seja avisado de lances novos e do fim do leilão.' },
]

/** Before the first search: what the tool does, and one-click starting points. */
function NoSearchState({ onSearch }: { onSearch: (keyword: string) => void }) {
  const regions = REGIONS.filter((r) => BUILT_IN_SOURCES.some((s) => s.region === r.id))
    .map((r) => r.name.toLowerCase())
    .join(', ')
    .replace(/, ([^,]*)$/, ' e $1')
  return (
    <div className="card flex flex-col items-center gap-8 px-6 py-12 text-center sm:px-10 sm:py-14">
      <div className="flex flex-col items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-gold-soft bg-gold-tint text-gold-text">
          <WatchIcon className="h-7 w-7" />
        </span>
        <div className="flex flex-col gap-2">
          <h3 className="text-xl font-semibold tracking-tight text-fg">Comece sua busca</h3>
          <p className="max-w-md text-sm leading-relaxed text-fg-secondary">
            Pesquise uma marca ou modelo e veja de uma vez os lotes de {BUILT_IN_SOURCES.length} leilões e lojas ({regions}).
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <span className="field-label">Experimente</span>
        <div className="flex max-w-xl flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((term) => (
            <button
              key={term}
              type="button"
              onClick={() => onSearch(term)}
              className="chip hover:border-gold-soft hover:bg-gold-tint hover:text-gold-text"
            >
              <SearchIcon className="h-3 w-3" />
              {term}
            </button>
          ))}
        </div>
      </div>

      <ul className="grid w-full max-w-3xl gap-3 border-t border-border pt-8 text-left sm:grid-cols-3">
        {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex gap-3 rounded-xl bg-surface-soft p-4">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gold-deep" />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-fg">{title}</span>
              <span className="text-xs leading-relaxed text-fg-secondary">{text}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
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

export function ResultsPanel({ keyword, state, searchBar, savedSearches, onRefresh, onSearch }: Props) {
  const { watchedIds } = useWatchlist()
  const [watchError, setWatchError] = useState<string | null>(null)
  const allItems = state?.data?.items ?? []
  const [page, setPage] = useState(1)
  const [sortOrder, setSortOrder] = useState<SortOrder>('none')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [onlyWatches, setOnlyWatches] = useState(true)
  const [onlyNew, setOnlyNew] = useState(false)
  const [titleQuery, setTitleQuery] = useState('')
  const [hiddenSources, setHiddenSources] = useState<Set<string>>(new Set())
  const [alertDraft, setAlertDraft] = useState<Partial<AlertInput> | null>(null)
  const [createdAlert, setCreatedAlert] = useState<string | null>(null)

  useEffect(() => {
    setPage(1)
  }, [keyword, state?.data])

  useEffect(() => {
    if (!createdAlert) return
    const id = setTimeout(() => setCreatedAlert(null), 8000)
    return () => clearTimeout(id)
  }, [createdAlert])

  useEffect(() => {
    setPage(1)
  }, [sortOrder, minPrice, maxPrice, onlyWatches, onlyNew, titleQuery, hiddenSources])

  const min = minPrice.trim() === '' ? null : Number(minPrice)
  const max = maxPrice.trim() === '' ? null : Number(maxPrice)
  const normalizedTitleQuery = normalize(titleQuery.trim())

  const fullTitle = (item: Listing) => (item.titlePt ? `${item.title} ${item.titlePt}` : item.title)
  const watchFilteredItems = onlyWatches ? allItems.filter((item) => isLikelyWatch(fullTitle(item))) : allItems

  const items = watchFilteredItems
    .filter((item) => !normalizedTitleQuery || normalize(fullTitle(item)).includes(normalizedTitleQuery))
    .filter((item) => !hiddenSources.has(item.source))
    .filter((item) => !onlyNew || (state?.newIds.has(item.id) ?? false))
    .filter((item) => {
      if (min === null && max === null) return true
      const value = priceInBRL(item)
      if (Number.isNaN(value)) return false
      if (min !== null && value < min) return false
      if (max !== null && value > max) return false
      return true
    })
    .sort((a, b) => {
      if (sortOrder === 'none') return 0
      const av = priceInBRL(a)
      const bv = priceInBRL(b)
      if (Number.isNaN(av) && Number.isNaN(bv)) return 0
      if (Number.isNaN(av)) return 1
      if (Number.isNaN(bv)) return -1
      return sortOrder === 'price-asc' ? av - bv : bv - av
    })

  const header = (
    <header className="flex flex-col gap-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="eyebrow text-fg-muted">Busca</span>
          <h2 className="truncate text-2xl font-semibold tracking-tight text-fg sm:text-[28px]">{keyword ?? 'Buscar lotes'}</h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-secondary">
            <span>
              {!keyword
                ? 'Busque uma marca ou modelo em todos os leilões de uma vez.'
                : state?.lastFetchedAt
                  ? `${allItems.length} lote(s) · atualizado às ${new Date(state.lastFetchedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                  : 'Consultando as fontes…'}
            </span>
            {/* The first load has the centered spinner below; this is for searching again. */}
            {keyword && state?.lastFetchedAt && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={state.loading}
                title="Consultar todas as fontes de novo"
                className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-medium text-gold-deep transition-colors hover:bg-gold-tint hover:text-gold-text disabled:pointer-events-none disabled:text-fg-muted"
              >
                <RefreshIcon className={`h-3.5 w-3.5 ${state.loading ? 'animate-spin' : ''}`} />
                {state.loading ? 'Atualizando…' : 'Buscar de novo'}
              </button>
            )}
          </div>
        </div>
        <div className="w-full lg:w-md lg:shrink-0">{searchBar}</div>
      </div>
      {savedSearches}
    </header>
  )

  if (!keyword) {
    return (
      <div className="flex flex-col gap-7">
        {header}
        <NoSearchState onSearch={onSearch} />
      </div>
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

  function openAlertDraft(listing: Listing) {
    setAlertDraft({
      query: alertQueryFromTitle(listing.titlePt || listing.title) || (keyword ?? ''),
      reference: listing.references?.[0] ?? null,
      onlyWatches: true,
      sources: null,
    })
  }

  async function handleCreateAlert(input: AlertInput) {
    const created = await createAlert(input)
    setAlertDraft(null)
    setCreatedAlert(created.name)
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
      {header}

      {createdAlert && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl border border-success/20 bg-success-soft px-4 py-3 text-sm text-success"
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" aria-hidden />
          Alerta “{createdAlert}” criado. O robô passa a avisar sobre lotes novos.
          <a href="#alertas" className="font-medium underline underline-offset-2">
            Ver alertas
          </a>
        </p>
      )}

      {state?.loading && allItems.length === 0 && (
        <div role="status" aria-live="polite" className="flex flex-col items-center justify-center gap-5 py-24 text-center">
          <span
            className="h-11 w-11 animate-spin rounded-full border-[3px] border-gold-soft border-t-gold motion-reduce:animate-[spin_1.6s_linear_infinite]"
            aria-hidden
          />
          <div className="flex flex-col gap-1.5">
            <p className="text-base text-fg">
              Buscando resultados de <b className="font-semibold">{keyword}</b>…
            </p>
            <p className="text-sm text-fg-muted">Consultando todas as fontes. Algumas demoram até 1 minuto.</p>
          </div>
        </div>
      )}

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
              Preço mín.
              <CurrencyInput value={minPrice} onChange={setMinPrice} placeholder="R$ 0" className="w-40" />
            </label>
            <label className="field-label flex flex-col gap-1.5">
              Preço máx.
              <CurrencyInput value={maxPrice} onChange={setMaxPrice} placeholder="Sem limite" className="w-40" />
            </label>
            {availableSources.length > 1 && (
              <div className="w-52">
                <span className="field-label mb-1.5 block">Fontes</span>
                <MultiSelect
                  options={availableSources.map((id) => ({
                    id,
                    label: SOURCE_LABEL[id] ?? id,
                    count: allItems.filter((item) => item.source === id).length,
                  }))}
                  selected={new Set(availableSources.filter((id) => !hiddenSources.has(id)))}
                  onToggle={toggleSource}
                  onSetAll={(checked) => setHiddenSources(checked ? new Set() : new Set(availableSources))}
                  noun={{ singular: 'fonte', plural: 'fontes', all: 'Todas as fontes', none: 'Nenhuma fonte' }}
                />
              </div>
            )}
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

      {watchError && <ErrorNotice>Acompanhar: {watchError}</ErrorNotice>}

      <div className="grid grid-cols-1 gap-5 min-[420px]:grid-cols-2 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4 2xl:grid-cols-5">
        {pageItems.map((item) => (
          <ListingCard
            key={item.id}
            listing={item}
            isNew={state?.newIds.has(item.id) ?? false}
            onCreateAlert={openAlertDraft}
            watched={watchedIds.has(item.id)}
            onToggleWatch={(listing) => {
              setWatchError(null)
              toggleWatch(listing).catch((err) => setWatchError(err.message))
            }}
          />
        ))}
      </div>

      <Pagination page={currentPage} totalPages={totalPages} total={items.length} noun="anúncios" onChange={setPage} />

      {alertDraft && (
        <AlertForm initial={alertDraft} onSubmit={handleCreateAlert} onClose={() => setAlertDraft(null)} />
      )}
    </div>
  )
}
