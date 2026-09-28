import { useCallback, useEffect, useRef, useState } from 'react'
import { KeywordChips, KeywordSearch } from './components/KeywordManager'
import { ResultsPanel } from './components/ResultsPanel'
import { AlertsPanel } from './components/AlertsPanel'
import { WatchlistPanel } from './components/WatchlistPanel'
import { SourceManager } from './components/SourceManager'
import { SidebarSection } from './components/SidebarSection'
import { Toggle } from './components/Toggle'
import { WatchIcon, SearchIcon, GlobeIcon, RefreshIcon, BellIcon, StarIcon } from './components/icons'
import { searchKeyword } from './api'
import {
  loadKeywords,
  saveKeywords,
  loadSeenIds,
  saveSeenIds,
  clearSeenIds,
  loadDisabledSources,
  saveDisabledSources,
} from './storage'
import { BUILT_IN_SOURCES, REGIONS } from './sourceLabels'
import type { KeywordState } from './types'

const AUTO_REFRESH_MINUTES = 10

type View = 'search' | 'alerts' | 'watchlist'

const VIEW_HASH: Record<View, string> = { search: '', alerts: 'alertas', watchlist: 'acompanhando' }

function viewFromHash(): View {
  const hash = window.location.hash.replace('#', '')
  return (Object.keys(VIEW_HASH) as View[]).find((v) => VIEW_HASH[v] === hash && hash) ?? 'search'
}

const NAV_ITEMS: { view: View; label: string; icon: typeof SearchIcon }[] = [
  { view: 'search', label: 'Busca', icon: SearchIcon },
  { view: 'alerts', label: 'Alertas', icon: BellIcon },
  { view: 'watchlist', label: 'Acompanhando', icon: StarIcon },
]

function stripSourceFromResults(
  results: Record<string, KeywordState>,
  sourceId: string
): Record<string, KeywordState> {
  const next: Record<string, KeywordState> = {}
  for (const [keyword, keywordState] of Object.entries(results)) {
    if (!keywordState.data) {
      next[keyword] = keywordState
      continue
    }
    const { [sourceId]: _removed, ...remainingSources } = keywordState.data.sources
    next[keyword] = {
      ...keywordState,
      data: {
        ...keywordState.data,
        items: keywordState.data.items.filter((item) => item.source !== sourceId),
        sources: remainingSources,
      },
    }
  }
  return next
}

function App() {
  const [keywords, setKeywords] = useState<string[]>(() => loadKeywords())
  const [selected, setSelected] = useState<string | null>(() => loadKeywords()[0] ?? null)
  const [results, setResults] = useState<Record<string, KeywordState>>({})
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [disabledSources, setDisabledSources] = useState<Set<string>>(() => loadDisabledSources())
  const [view, setView] = useState<View>(viewFromHash)

  useEffect(() => {
    const onHashChange = () => setView(viewFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  function navigate(next: View) {
    window.location.hash = VIEW_HASH[next]
    setView(next)
  }

  const keywordsRef = useRef(keywords)
  keywordsRef.current = keywords
  const disabledSourcesRef = useRef(disabledSources)
  disabledSourcesRef.current = disabledSources

  const runSearch = useCallback(async (keyword: string) => {
    setResults((prev) => ({
      ...prev,
      [keyword]: {
        loading: true,
        error: null,
        data: prev[keyword]?.data ?? null,
        newIds: prev[keyword]?.newIds ?? new Set(),
        lastFetchedAt: prev[keyword]?.lastFetchedAt ?? null,
      },
    }))

    try {
      const enabledBuiltIn = BUILT_IN_SOURCES.filter((s) => !disabledSourcesRef.current.has(s.id)).map((s) => s.id)
      const data = await searchKeyword(keyword, { sources: enabledBuiltIn })

      const seen = loadSeenIds(keyword)
      const isFirstFetch = seen.size === 0
      const currentIds = data.items.map((item) => item.id)
      const newIds = isFirstFetch ? new Set<string>() : new Set(currentIds.filter((id) => !seen.has(id)))

      const updatedSeen = new Set(seen)
      currentIds.forEach((id) => updatedSeen.add(id))
      saveSeenIds(keyword, updatedSeen)

      setResults((prev) => ({
        ...prev,
        [keyword]: { loading: false, error: null, data, newIds, lastFetchedAt: Date.now() },
      }))
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [keyword]: {
          loading: false,
          error: err instanceof Error ? err.message : 'Erro desconhecido',
          data: prev[keyword]?.data ?? null,
          newIds: prev[keyword]?.newIds ?? new Set(),
          lastFetchedAt: prev[keyword]?.lastFetchedAt ?? null,
        },
      }))
    }
  }, [])

  function handleAdd(keyword: string) {
    setKeywords((prev) => {
      if (prev.includes(keyword)) return prev
      const next = [...prev, keyword]
      saveKeywords(next)
      return next
    })
    setSelected(keyword)
    void runSearch(keyword)
  }

  function handleSelect(keyword: string) {
    setSelected(keyword)
    void runSearch(keyword)
  }

  function handleRemove(keyword: string) {
    setKeywords((prev) => {
      const next = prev.filter((k) => k !== keyword)
      saveKeywords(next)
      return next
    })
    clearSeenIds(keyword)
    setResults((prev) => {
      const next = { ...prev }
      delete next[keyword]
      return next
    })
    setSelected((prev) => (prev === keyword ? null : prev))
  }

  function refreshSelected() {
    if (selected) void runSearch(selected)
  }

  // The ref is updated right away (not on the next render) so the refresh
  // below already searches the source that was just turned back on.
  function applyDisabledSources(next: Set<string>) {
    disabledSourcesRef.current = next
    setDisabledSources(next)
    saveDisabledSources(next)
  }

  function handleToggleBuiltIn(id: string) {
    const turningOff = !disabledSources.has(id)
    const next = new Set(disabledSources)
    if (turningOff) next.add(id)
    else next.delete(id)
    applyDisabledSources(next)
    if (turningOff) {
      setResults((prev) => stripSourceFromResults(prev, id))
    } else {
      refreshSelected()
    }
  }

  function handleSetAllSources(enabled: boolean) {
    const next = enabled ? new Set<string>() : new Set(BUILT_IN_SOURCES.map((s) => s.id))
    const turnedOff = [...next].filter((id) => !disabledSources.has(id))
    applyDisabledSources(next)
    if (enabled) refreshSelected()
    else setResults((prev) => turnedOff.reduce((acc, id) => stripSourceFromResults(acc, id), prev))
  }

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(() => {
      keywordsRef.current.forEach((kw) => void runSearch(kw))
    }, AUTO_REFRESH_MINUTES * 60 * 1000)
    return () => clearInterval(id)
  }, [autoRefresh, runSearch])

  return (
    <div className="grid min-h-screen grid-cols-1 bg-background md:grid-cols-[300px_1fr] lg:grid-cols-[320px_1fr]">
      <aside className="scroll-dark flex flex-col bg-ink text-sidebar-fg md:sticky md:top-0 md:h-screen md:overflow-y-auto">
        <div className="px-6 pb-6 pt-7">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-gold/30 bg-gold/10 text-gold">
              <WatchIcon className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-[15px] font-semibold tracking-tight text-white">Watch Tracker</h1>
              <p className="mt-0.5 text-xs text-sidebar-muted">Monitor de leilões de relógios no Brasil</p>
            </div>
          </div>
        </div>

        <nav className="flex gap-1 px-4 pb-6 md:flex-col">
          {NAV_ITEMS.map(({ view: itemView, label, icon: Icon }) => {
            const isActive = view === itemView
            return (
              <button
                key={itemView}
                type="button"
                onClick={() => navigate(itemView)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative flex flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-150 md:flex-none ${
                  isActive ? 'bg-gold/10 font-medium text-white' : 'text-sidebar-muted hover:bg-white/4 hover:text-white'
                }`}
              >
                {isActive && (
                  <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-gold" aria-hidden />
                )}
                <Icon className={`h-4 w-4 ${isActive ? 'text-gold' : ''}`} />
                {label}
              </button>
            )
          })}
        </nav>

        <div className={`flex-1 flex-col gap-6 px-6 pb-6 ${view === 'search' ? 'flex' : 'hidden'}`}>
          <SidebarSection title="Fontes" icon={<GlobeIcon className="h-4 w-4" />}>
            <SourceManager
              builtInSources={BUILT_IN_SOURCES}
              disabledSources={disabledSources}
              regions={REGIONS}
              onToggleBuiltIn={handleToggleBuiltIn}
              onSetAll={handleSetAllSources}
            />
          </SidebarSection>

          <div className="mt-auto flex items-center gap-3 rounded-xl border border-white/8 bg-white/3 p-4">
            <RefreshIcon className={`h-4 w-4 shrink-0 ${autoRefresh ? 'text-gold' : 'text-sidebar-muted'}`} />
            <Toggle
              checked={autoRefresh}
              onChange={() => setAutoRefresh((prev) => !prev)}
              label={`Atualizar automaticamente a cada ${AUTO_REFRESH_MINUTES} min`}
              labelClassName="text-xs leading-snug text-sidebar-muted"
              tone="dark"
            />
          </div>
        </div>
      </aside>

      <main className="min-w-0 px-4 py-8 sm:px-8 md:px-10 md:py-10 xl:px-14 xl:py-12">
        {/* Kept mounted while hidden so its filters survive switching views. */}
        <div className={view === 'search' ? '' : 'hidden'}>
          <ResultsPanel
            keyword={selected}
            state={selected ? results[selected] : undefined}
            searchBar={<KeywordSearch onAdd={handleAdd} />}
            onRefresh={refreshSelected}
            onSearch={handleAdd}
            savedSearches={
              <KeywordChips keywords={keywords} selected={selected} onRemove={handleRemove} onSelect={handleSelect} />
            }
          />
        </div>
        {view === 'alerts' && <AlertsPanel />}
        {view === 'watchlist' && <WatchlistPanel />}
      </main>
    </div>
  )
}

export default App
