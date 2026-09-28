// Built-in auction sources. Ids must match the scrapers registered in
// server/src/search.js. `region` groups them in the source picker.
export const BUILT_IN_SOURCES = [
  { id: 'leiloesbr', name: 'LeilõesBR', region: 'br' },
  { id: 'receitafederal', name: 'Receita Federal', region: 'br' },
  { id: 'miltonsayegh', name: 'Milton Sayegh Leilões', region: 'br' },
  { id: 'sothebys', name: "Sotheby's", region: 'intl' },
  { id: 'christies', name: "Christie's", region: 'intl' },
  { id: 'phillips', name: 'Phillips', region: 'intl' },
  { id: 'mercari', name: 'Mercari Japão', region: 'jp' },
  { id: 'catawiki', name: 'Catawiki', region: 'intl' },
  { id: 'yahooauctions', name: 'Yahoo Leilões Japão', region: 'jp' },
  { id: 'ebay', name: 'eBay', region: 'intl' },
  { id: 'caixa', name: 'Caixa (Leilão de Joias)', region: 'br' },
  { id: 'bonhams', name: 'Bonhams', region: 'intl' },
  { id: 'antiquorum', name: 'Antiquorum', region: 'intl' },
  { id: 'megaleiloes', name: 'Mega Leilões', region: 'br' },
  { id: 'zukerman', name: 'Zukerman', region: 'br' },
  { id: 'sodresantoro', name: 'Sodré Santoro', region: 'br' },
]

export const SOURCE_LABEL = Object.fromEntries(BUILT_IN_SOURCES.map((s) => [s.id, s.name]))

export const REGIONS = [
  { id: 'br', name: 'Brasil' },
  { id: 'intl', name: 'Internacional' },
  { id: 'jp', name: 'Japão' },
]
