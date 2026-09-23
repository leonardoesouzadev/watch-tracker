const KEYWORDS_KEY = 'watch-tracker:keywords'
const SEEN_PREFIX = 'watch-tracker:seen:'
const DISABLED_SOURCES_KEY = 'watch-tracker:disabledSources'

export function loadKeywords(): string[] {
  try {
    const raw = localStorage.getItem(KEYWORDS_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function saveKeywords(keywords: string[]): void {
  localStorage.setItem(KEYWORDS_KEY, JSON.stringify(keywords))
}

export function loadSeenIds(keyword: string): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_PREFIX + keyword)
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

export function saveSeenIds(keyword: string, ids: Set<string>): void {
  localStorage.setItem(SEEN_PREFIX + keyword, JSON.stringify(Array.from(ids)))
}

export function clearSeenIds(keyword: string): void {
  localStorage.removeItem(SEEN_PREFIX + keyword)
}

// Stores *disabled* built-in source ids (rather than enabled ones) so a new
// built-in source added later shows up enabled by default for everyone.
export function loadDisabledSources(): Set<string> {
  try {
    const raw = localStorage.getItem(DISABLED_SOURCES_KEY)
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

export function saveDisabledSources(ids: Set<string>): void {
  localStorage.setItem(DISABLED_SOURCES_KEY, JSON.stringify(Array.from(ids)))
}
