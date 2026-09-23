// Built-in auction sources. Ids must match the scrapers registered in
// server/src/search.js.
export const BUILT_IN_SOURCES = [
  { id: 'leiloesbr', name: 'LeilõesBR' },
  { id: 'receitafederal', name: 'Receita Federal' },
  { id: 'miltonsayegh', name: 'Milton Sayegh Leilões' },
  { id: 'sothebys', name: "Sotheby's" },
]

export const SOURCE_LABEL = Object.fromEntries(BUILT_IN_SOURCES.map((s) => [s.id, s.name]))
