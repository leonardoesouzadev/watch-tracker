// Watch reference numbers ("116610LN", "311.30.42.30.01.005", "5711/1A-010",
// "SBGA211") found in listing titles. Best-effort: each pattern covers the
// numbering style of a group of brands, so unusual formats may be missed.

import { normalize } from './normalize.js'

const PATTERNS = [
  // Omega modern (311.30.42.30.01.005) and vintage (145.022-69, ST 105.012).
  /\b\d{3}\.\d{2}\.\d{2}\.\d{2}\.\d{2}\.\d{3}\b/g,
  /\b\d{3}\.\d{3}(?:-\d{2})?\b/g,
  // Patek Philippe (5711/1A-010, 5167A-001).
  /\b\d{4}\/\d{1,4}[A-Z]{0,3}(?:-\d{3})?\b/g,
  /\b\d{4}[A-Z]{1,2}-\d{3}\b/g,
  // Audemars Piguet (15500ST.OO.1220ST.01, 15202ST).
  /\b\d{5}[A-Z]{2}(?:\.[A-Z0-9]{2,6}){0,3}\b/g,
  // Rolex / Tudor: 5–6 digits with an optional letter suffix (116610LN, 126710BLRO, 16610, M79230N-0001).
  /\bM?\d{5,6}[A-Z]{0,4}(?:-\d{4})?\b/g,
  // Letter + digit models (Seiko SBGA211, SKX007, Casio GA-2100, Tissot T120.407).
  /\b[A-Z]{2,4}-?\d{3,4}[A-Z]{0,2}\d?\b/g,
  /\bT\d{3}\.\d{3}(?:\.\d{2}\.\d{3}\.\d{2})?\b/g,
]

// Omega 1990s–2000s (2254.50, 3570.50.00): only in Omega titles, since the
// same shape shows up as dimensions or codes elsewhere.
const OMEGA = /OMEGA|オメガ/
const OMEGA_PATTERN = /\b\d{4}\.\d{2}(?:\.\d{2})?\b/g

// Written right before a reference number in many listings.
const PREFIXED = /\b(?:ref(?:erencia|erence)?\.?|mod(?:elo|el)?\.?)\s*:?\s*([A-Z0-9][A-Z0-9./-]{2,})/gi

// Things the patterns above catch that aren't references: sizes, gold
// purity, water resistance ("300M"), and bare 4-digit numbers (usually years
// or lot numbers — kept only when written after "Ref.").
const NOT_REFERENCE = /^(?:\d{1,3}MM|\d{1,2}K|\d{1,4}ATM|\d{1,4}M)$/

/** Uppercase, only letters and digits: "116610 ln" → "116610LN". */
export function compactReference(text) {
  return normalize(String(text)).toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Distinct references in a title, as written (uppercased). */
export function extractReferences(title) {
  const text = String(title ?? '').toUpperCase()
  const found = new Map()
  const add = (ref, explicit = false) => {
    const clean = ref.replace(/[.\-/]+$/, '')
    const key = compactReference(clean)
    if (key.length < 4 || NOT_REFERENCE.test(key) || /^(19|20)\d{2}$/.test(key)) return
    if (!explicit && /^\d{4}$/.test(key)) return
    if (!/\d/.test(key)) return
    if (![...found.keys()].some((k) => k.includes(key))) found.set(key, clean)
  }
  for (const match of text.matchAll(PREFIXED)) add(match[1], true)
  const patterns = OMEGA.test(text) ? [...PATTERNS, OMEGA_PATTERN] : PATTERNS
  for (const pattern of patterns) for (const match of text.matchAll(pattern)) add(match[0])
  return [...found.values()]
}

/**
 * True when the title mentions `reference`, ignoring spaces and punctuation.
 * "116610" also matches "116610LN" (same model, any bezel), but not "1166100".
 */
export function matchesReference(title, reference) {
  const ref = compactReference(reference)
  if (!ref) return true
  const tokens = String(title ?? '').split(/[\s,;()[\]]+/)
  // References are sometimes split by a space ("116610 LN"), so pairs of tokens count too.
  const candidates = tokens.flatMap((t, i) => [t, `${t}${tokens[i + 1] ?? ''}`]).map(compactReference)
  return candidates.some((c) => c.startsWith(ref) && !/^\d/.test(c.slice(ref.length)))
}
