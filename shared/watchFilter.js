// Shared by the client (via re-export) and the server alert checker.

import { normalize } from './normalize.js'

// Generic terms that identify an item as a watch regardless of brand.
const GENERIC_TERMS = ['relogio', 'relógio', 'watch', 'wristwatch', 'cronografo', 'cronógrafo']

// Known watch brands seen in Brazilian auction listings, in the casing shown
// in the brand picker. Best-effort list — items from brands not on it (or
// with brand names misspelled) won't match a generic term either and will
// be filtered out as false negatives.
export const WATCH_BRANDS = [
  'Rolex',
  'Omega',
  'Tissot',
  'Seiko',
  'Grand Seiko',
  'Citizen',
  'Casio',
  'G-Shock',
  'TAG Heuer',
  'Cartier',
  'Breitling',
  'IWC',
  'Panerai',
  'Hublot',
  'Patek Philippe',
  'Audemars Piguet',
  'Longines',
  'Mido',
  'Certina',
  'Hamilton',
  'Swatch',
  'Fossil',
  'Invicta',
  'Bulova',
  'Orient',
  'Mondaine',
  'Vacheron Constantin',
  'Jaeger-LeCoultre',
  'Zenith',
  'Chopard',
  'Montblanc',
  'Baume & Mercier',
  'Tudor',
  'Movado',
  'Rado',
  'Oris',
  'Frédérique Constant',
  'Maurice Lacroix',
  'Raymond Weil',
  'Ebel',
  'Girard-Perregaux',
  'Piaget',
  'Breguet',
  'Glashütte Original',
  'A. Lange & Söhne',
  'Ulysse Nardin',
  'Corum',
  'Blancpain',
  'Technos',
  'Dumont',
  'Champion',
  'Atlantis',
  'Lince',
  'Euro',
  'Speedo',
  'Guess',
  'Michael Kors',
  'Emporio Armani',
  'Diesel',
  'Timex',
  'Skagen',
  'Nixon',
  'Luminox',
  'Victorinox',
  'Garmin',
  'Apple Watch',
  'Galaxy Watch',
]

// Alternate spellings that won't be caught by normalizing WATCH_BRANDS
// (different words, not just accents/punctuation).
const BRAND_ALIASES = ['jaeger lecoultre', 'baume et mercier', 'lange e sohne', 'lange & sohne']

const NORMALIZED_TERMS = [...GENERIC_TERMS, ...WATCH_BRANDS, ...BRAND_ALIASES].map(normalize)

/** @param {string} title */
export function isLikelyWatch(title) {
  const normalized = normalize(title)
  return NORMALIZED_TERMS.some((term) => normalized.includes(term))
}
