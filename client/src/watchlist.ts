import { useEffect, useSyncExternalStore } from 'react'
import type { Listing, WatchedLot } from './types'

// Followed lots, shared by every screen (search, alert finds, "Acompanhando")
// so a star toggled in one shows up in the others.

interface State {
  lots: WatchedLot[]
  loaded: boolean
  error: string | null
}

let state: State = { lots: [], loaded: false, error: null }
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

function setState(next: Partial<State>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Falha na requisição (${res.status})`)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

export function reloadWatchlist() {
  loading ??= request<{ lots: WatchedLot[] }>('/watchlist')
    .then(({ lots }) => setState({ lots, loaded: true, error: null }))
    .catch((err: Error) => setState({ loaded: true, error: err.message }))
    .finally(() => {
      loading = null
    })
  return loading
}

export async function toggleWatch(listing: Listing) {
  const current = state.lots.find((l) => l.listing.id === listing.id && !l.ended)
  if (current) {
    await request<void>(`/watchlist/${current.id}`, { method: 'DELETE' })
    setState({ lots: state.lots.filter((l) => l.id !== current.id) })
  } else {
    const lot = await request<WatchedLot>('/watchlist', { method: 'POST', body: JSON.stringify({ listing }) })
    setState({ lots: [lot, ...state.lots.filter((l) => l.id !== lot.id)] })
  }
}

export async function unwatchLot(id: number) {
  await request<void>(`/watchlist/${id}`, { method: 'DELETE' })
  setState({ lots: state.lots.filter((l) => l.id !== id) })
}

export function useWatchlist() {
  const snapshot = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state
  )
  useEffect(() => {
    if (!state.loaded) reloadWatchlist()
  }, [])
  const watchedIds = new Set(snapshot.lots.filter((l) => !l.ended).map((l) => l.listing.id))
  return { ...snapshot, watchedIds }
}
