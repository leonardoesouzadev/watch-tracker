// Estimated total cost of a lot delivered in Brazil: price converted to BRL,
// plus the auction house's buyer's premium, shipping and import taxes. The
// numbers are averages — each house has tiers, and taxes depend on the state
// and on how the package is declared — so the result is always "about".

// Buyer's premium over the hammer price, lowest tier (the one most watches fall in).
export const BUYER_PREMIUM = {
  leiloesbr: 0.05,
  miltonsayegh: 0.05,
  megaleiloes: 0.05,
  zukerman: 0.05,
  sodresantoro: 0.05,
  sothebys: 0.27,
  christies: 0.27,
  phillips: 0.27,
  bonhams: 0.28,
  antiquorum: 0.25,
  catawiki: 0.09,
}

// Buying on Mercari/Yahoo Japan needs a proxy service (Buyee, ZenMarket):
// service fee plus shipping inside Japan, in JPY.
const JAPAN_PROXY_FEE_JPY = 1500
const JAPAN_SOURCES = new Set(['mercari', 'yahooauctions'])

// Courier shipping for one watch, in USD.
const SHIPPING_USD = 60
// Simplified import regime (RTS): 60% import duty over goods + shipping,
// then ICMS "por dentro" (most states charge 17–20% on imports; 20% is the
// safe side).
const IMPORT_DUTY = 0.6
const ICMS = 0.2
// Above this the package can't use the simplified regime.
const RTS_LIMIT_USD = 3000

/** { value, currency } → BRL, or null when there's no rate for the currency. */
export function toBRL(price, rates) {
  if (!price) return null
  const value = Number(price.value)
  if (Number.isNaN(value)) return null
  if (price.currency === 'BRL') return value
  const rate = rates?.[price.currency]
  return rate ? value * rate : null
}

const round = (n) => Math.round(n * 100) / 100

/**
 * Cost breakdown in BRL: { kind, premiumRate, total, lines: [{ label, value }], notes: [] }.
 * kind: "commission" for a lot in Brazil (price + auctioneer's commission),
 * "import" for a lot abroad (conversion, commission, shipping and taxes).
 * null when there's no price, no exchange rate, or nothing to add (a BRL lot
 * without commission).
 */
export function landedCost(item, rates) {
  const base = toBRL(item.price, rates)
  if (base === null || base <= 0) return null

  const lines = [{ label: item.price.currency === 'BRL' ? 'Preço' : `Preço (${item.price.currency} → BRL)`, value: base }]
  const notes = []
  const premiumRate = BUYER_PREMIUM[item.source] ?? 0
  // Premiums apply to the hammer price: over a fixed price or a valuation they don't.
  if (premiumRate && item.priceType !== 'fixed') {
    lines.push({ label: `Comissão do leiloeiro (${Math.round(premiumRate * 100)}%)`, value: base * premiumRate })
  }

  if (item.price.currency !== 'BRL') {
    if (!rates?.USD) return null
    if (JAPAN_SOURCES.has(item.source) && rates.JPY) {
      lines.push({ label: 'Intermediário no Japão (serviço + frete local)', value: JAPAN_PROXY_FEE_JPY * rates.JPY })
    }
    lines.push({ label: 'Frete internacional', value: SHIPPING_USD * rates.USD })

    const customsValue = lines.reduce((sum, l) => sum + l.value, 0)
    const duty = customsValue * IMPORT_DUTY
    const icms = ((customsValue + duty) / (1 - ICMS)) * ICMS
    lines.push({ label: `Imposto de importação (${IMPORT_DUTY * 100}%)`, value: duty })
    lines.push({ label: `ICMS (${ICMS * 100}%)`, value: icms })
    if (customsValue / rates.USD > RTS_LIMIT_USD) {
      notes.push('Acima de US$ 3.000 a remessa vai para importação formal: despachante e custos extras.')
    }
  }

  if (lines.length === 1) return null
  const total = lines.reduce((sum, l) => sum + l.value, 0)
  return {
    kind: item.price.currency === 'BRL' ? 'commission' : 'import',
    premiumRate: item.priceType !== 'fixed' ? premiumRate : 0,
    total: round(total),
    lines: lines.map((l) => ({ ...l, value: round(l.value) })),
    notes,
  }
}

/**
 * Wording for a cost breakdown: `suffix` goes after the amount ("≈ R$ 87.150
 * com comissão (5%)"), `heading` titles the breakdown, `disclaimer` explains
 * what it leaves out. Lots saved before `kind` existed are told apart by
 * their lines (a Brazilian lot only has price + commission).
 */
export function landedCostText(cost) {
  const kind = cost.kind ?? (cost.lines.length <= 2 ? 'commission' : 'import')
  if (kind === 'commission') {
    const rate = cost.premiumRate ?? (cost.lines[1] ? cost.lines[1].value / cost.lines[0].value : 0)
    return {
      suffix: `com comissão (${Math.round(rate * 100)}%)`,
      heading: 'Valor com a comissão do leiloeiro',
      disclaimer: 'Estimativa: alguns leiloeiros cobram comissão diferente ou taxas extras. Não inclui frete.',
    }
  }
  return {
    suffix: 'no Brasil, com impostos',
    heading: 'Custo estimado para trazer ao Brasil',
    disclaimer: 'Estimativa: a comissão varia por faixa de valor, e o ICMS, por estado.',
  }
}
