// Flags listings that look like replicas or scams. It's a warning shown next
// to the lot, not proof: a real watch can trip it, and a good fake may not.

import { normalize } from './normalize.js'

// Words sellers use for replicas (normalized: lowercase, no accents).
const REPLICA_TERMS = [
  'replica',
  'super clone',
  'clone',
  'aaa',
  '1:1',
  'similar',
  'inspired',
  'inspirado',
  'homage',
  'hommage',
  'estilo rolex',
  'tipo rolex',
  'linha premium',
  'primeira linha',
  'nao original',
  'not original',
  'no original',
  'fake',
  'copia',
  'imitacao',
  'レプリカ',
  'コピー',
]

// Below this (in BRL), a fixed-price listing of the brand is suspicious. Only
// asking prices are checked: auction bids start low on purpose.
const BRAND_FLOOR_BRL = {
  rolex: 15000,
  'patek philippe': 60000,
  'audemars piguet': 60000,
  'richard mille': 300000,
  'vacheron constantin': 40000,
  'a. lange': 60000,
  omega: 3000,
  cartier: 4000,
  breitling: 4000,
  'iwc': 5000,
  panerai: 6000,
  hublot: 10000,
  tudor: 5000,
  'jaeger-lecoultre': 8000,
}

function hasTerm(title, term) {
  // Latin terms must be whole words, so "aaa" or "copia" don't match inside
  // other words (e.g. "copiadora").
  if (/^[a-z0-9: ]+$/.test(term)) return new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(title)
  return title.includes(term)
}

/**
 * Reasons the listing looks suspicious ([] = nothing found). `toBRL(price)`
 * converts a { value, currency } price to reais, or returns null.
 */
export function suspiciousReasons(item, toBRL) {
  const title = normalize(item.title ?? '')
  const reasons = []

  const term = REPLICA_TERMS.find((t) => hasTerm(title, t))
  if (term) reasons.push(`título menciona "${term}"`)

  const asking = item.priceType === 'fixed' || (!item.priceType && item.buyingOptions?.includes('FIXED_PRICE'))
  if (asking && item.price && toBRL) {
    const brl = toBRL(item.price)
    const brand = Object.keys(BRAND_FLOOR_BRL).find((b) => title.includes(b))
    if (brand && brl !== null && brl > 0 && brl < BRAND_FLOOR_BRL[brand]) {
      reasons.push(`preço muito abaixo do normal para ${brand.replace(/\b\w/g, (c) => c.toUpperCase())}`)
    }
  }
  return reasons
}
