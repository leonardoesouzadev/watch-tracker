export type ListingSource = string

export interface Listing {
  id: string
  title: string
  price: { value: string; currency: string } | null
  image: string | null
  condition: string | null
  itemUrl: string
  seller: string | null
  location: string | null
  buyingOptions: string[]
  source: ListingSource
}

export interface SourceStatus {
  total: number
  error: string | null
}

export interface SearchResult {
  query: string
  sources: Partial<Record<ListingSource, SourceStatus>>
  items: Listing[]
}

export interface KeywordState {
  loading: boolean
  error: string | null
  data: SearchResult | null
  newIds: Set<string>
  lastFetchedAt: number | null
}

export interface Alert {
  id: number
  name: string
  query: string
  minPrice: number | null
  maxPrice: number | null
  /** null = every source, including ones added later. */
  sources: string[] | null
  onlyWatches: boolean
  includeTerms: string[]
  excludeTerms: string[]
  notifyEmail: boolean
  notifyTelegram: boolean
  active: boolean
  createdAt: string
  lastCheckedAt: string | null
  lastError: string | null
  lastNewCount: number
  findsCount?: number
}

export type AlertInput = Pick<
  Alert,
  | 'name'
  | 'query'
  | 'minPrice'
  | 'maxPrice'
  | 'sources'
  | 'onlyWatches'
  | 'includeTerms'
  | 'excludeTerms'
  | 'notifyEmail'
  | 'notifyTelegram'
  | 'active'
>

export interface AlertFind {
  alertId: number
  alertName: string
  firstSeenAt: string
  listing: Listing
}

export interface AlertsConfig {
  database: boolean
  email: boolean
  telegram: boolean
}
