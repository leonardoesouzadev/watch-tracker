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
  /** What `price` is: current bid, estimate, asking price or valuation. */
  priceType?: 'bid' | 'estimate' | 'fixed' | 'appraisal' | null
  /** When bidding closes (ISO). */
  endsAt?: string | null
  /** Portuguese title of Japanese listings. */
  titlePt?: string | null
  priceBRL?: number | null
  landedCost?: LandedCost | null
  references?: string[]
  /** Why it looks like a replica ([] = nothing found). */
  suspicious?: string[]
}

export interface LandedCost {
  kind?: 'commission' | 'import'
  premiumRate?: number
  total: number
  lines: { label: string; value: number }[]
  notes: string[]
}

export interface WatchedLot {
  id: number
  listing: Listing
  lastPrice: Listing['price']
  endsAt: string | null
  ended: boolean
  createdAt: string
  lastCheckedAt: string | null
  lastError: string | null
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
  /** Exact reference to match, e.g. 116610LN. */
  reference: string | null
  hideSuspicious: boolean
  /** One summary a day instead of a message per lot. */
  digest: boolean
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
  | 'reference'
  | 'hideSuspicious'
  | 'digest'
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
