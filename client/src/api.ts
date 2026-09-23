import type { SearchResult } from './types'

interface SearchOptions {
  limit?: number
  sources?: string[]
}

export async function searchKeyword(query: string, options: SearchOptions = {}): Promise<SearchResult> {
  const { limit = 30, sources } = options

  const res = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, limit, sources }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Search failed (${res.status})`)
  }
  return res.json()
}
