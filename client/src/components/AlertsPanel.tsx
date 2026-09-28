import { useCallback, useEffect, useState } from 'react'
import type { Alert, AlertInput, AlertsConfig } from '../types'
import {
  checkAlertNow,
  createAlert,
  deleteAlert,
  fetchAlerts,
  fetchFinds,
  sendTestNotification,
  updateAlert,
  type FindsPage,
} from '../alertsApi'
import { SOURCE_LABEL } from '../sourceLabels'
import { Combobox } from './Combobox'
import { MultiSelect } from './MultiSelect'
import { Pagination } from './Pagination'
import { AlertCard } from './AlertCard'
import { AlertForm } from './AlertForm'
import { ListingCard } from './ListingCard'
import { toggleWatch, useWatchlist } from '../watchlist'
import { BellIcon, MailIcon, PlusIcon, SearchIcon, SendIcon } from './icons'

// Keep in sync with .github/workflows/check-alerts.yml.
const CHECK_EVERY_HOURS = 2
const FINDS_PAGE_SIZE = 20
const ALL_ALERTS = 'Todos os alertas'

type FormState = { mode: 'create' } | { mode: 'edit'; alert: Alert } | null
type Notice = { tone: 'ok' | 'error'; text: string } | null

function ChannelStatus({ configured, icon, label }: { configured: boolean; icon: React.ReactNode; label: string }) {
  return (
    <span className={`badge py-1 ${configured ? 'badge-gold' : ''}`}>
      {icon}
      {label}
      <span className={configured ? 'text-gold-deep' : 'text-fg-muted'}>
        · {configured ? 'configurado' : 'não configurado'}
      </span>
    </span>
  )
}

function SetupNotice() {
  return (
    <div className="card flex flex-col gap-3 p-6">
      <span className="eyebrow text-gold-deep">Configuração necessária</span>
      <h3 className="text-base font-medium text-fg">Conecte um banco de dados para salvar alertas</h3>
      <p className="max-w-2xl text-sm leading-relaxed text-fg-secondary">
        Os alertas ficam no servidor para o robô poder verificá-los com o navegador fechado. Crie um Postgres
        gratuito (Neon, Supabase ou Vercel Postgres) e defina <code className="rounded bg-surface-muted px-1.5 py-0.5 text-xs text-fg">DATABASE_URL</code>{' '}
        nas variáveis de ambiente do servidor. As tabelas são criadas automaticamente. Depois, o instalador configura
        o Telegram e o e-mail.
      </p>
      <div>
        <a href="/install" className="btn btn-primary">
          Abrir o instalador
        </a>
      </div>
    </div>
  )
}

export function AlertsPanel() {
  const { watchedIds } = useWatchlist()
  const [config, setConfig] = useState<AlertsConfig | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [findsPage, setFindsPage] = useState<FindsPage | null>(null)
  const [findsFilter, setFindsFilter] = useState<number | null>(null)
  // Sources the user unchecked (empty = every source), title search and page.
  const [hiddenSources, setHiddenSources] = useState<Set<string>>(new Set())
  const [titleQuery, setTitleQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(null)
  const [checking, setChecking] = useState<Set<number>>(new Set())
  const [testing, setTesting] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)

  const loadAlerts = useCallback(async () => {
    try {
      const data = await fetchAlerts()
      setConfig(data.configured)
      setAlerts(data.alerts)
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Erro ao carregar alertas')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadFinds = useCallback(async () => {
    try {
      const known = findsPage ? Object.keys(findsPage.sources) : []
      const sources = hiddenSources.size ? known.filter((s) => !hiddenSources.has(s)) : null
      setFindsPage(await fetchFinds({ alertId: findsFilter, sources, q: debouncedQuery, page, pageSize: FINDS_PAGE_SIZE }))
    } catch {
      setFindsPage(null)
    }
    // findsPage is read only for the known sources; refetching on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findsFilter, hiddenSources, debouncedQuery, page])

  // Typing in the title search waits a moment before hitting the server.
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedQuery(titleQuery)
      setPage(1)
    }, 300)
    return () => clearTimeout(id)
  }, [titleQuery])

  // A different alert has different sources: start from all of them, page 1.
  useEffect(() => {
    setHiddenSources(new Set())
    setPage(1)
  }, [findsFilter])

  useEffect(() => {
    void loadAlerts()
  }, [loadAlerts])

  useEffect(() => {
    if (config?.database) void loadFinds()
  }, [config?.database, loadFinds])

  useEffect(() => {
    if (!notice) return
    const id = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(id)
  }, [notice])

  function replaceAlert(updated: Alert) {
    setAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
  }

  async function handleSubmit(input: AlertInput) {
    if (form?.mode === 'edit') {
      replaceAlert(await updateAlert(form.alert.id, input))
      setNotice({ tone: 'ok', text: 'Alerta atualizado.' })
    } else {
      const created = await createAlert(input)
      setAlerts((prev) => [created, ...prev])
      setNotice({ tone: 'ok', text: `Alerta criado. O robô passa a avisar sobre lotes novos de “${created.name}”.` })
    }
    setForm(null)
  }

  async function handleToggleActive(alert: Alert) {
    try {
      replaceAlert(await updateAlert(alert.id, { active: !alert.active }))
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Erro ao atualizar' })
    }
  }

  async function handleCheck(alert: Alert) {
    setChecking((prev) => new Set(prev).add(alert.id))
    try {
      const result = await checkAlertNow(alert.id)
      replaceAlert(result.alert)
      setNotice({
        tone: 'ok',
        text:
          result.newCount > 0
            ? `${result.newCount} lote(s) novo(s) em “${alert.name}”. Aviso enviado.`
            : `Nenhum lote novo em “${alert.name}”.`,
      })
      if (result.newCount > 0) void loadFinds()
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Erro ao verificar' })
    } finally {
      setChecking((prev) => {
        const next = new Set(prev)
        next.delete(alert.id)
        return next
      })
    }
  }

  async function handleDelete(alert: Alert) {
    if (!window.confirm(`Excluir o alerta “${alert.name}” e seu histórico?`)) return
    try {
      await deleteAlert(alert.id)
      setAlerts((prev) => prev.filter((a) => a.id !== alert.id))
      if (findsFilter === alert.id) setFindsFilter(null)
      else void loadFinds()
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Erro ao excluir' })
    }
  }

  async function handleTest() {
    setTesting(true)
    try {
      const result = await sendTestNotification()
      const parts = Object.entries(result).map(([channel, error]) =>
        error ? `${channel === 'email' ? 'E-mail' : 'Telegram'}: ${error}` : `${channel === 'email' ? 'E-mail' : 'Telegram'} enviado`
      )
      const failed = Object.values(result).some(Boolean)
      setNotice({
        tone: failed ? 'error' : 'ok',
        text: parts.length ? parts.join(' · ') : 'Nenhum canal configurado no servidor.',
      })
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Erro ao enviar teste' })
    } finally {
      setTesting(false)
    }
  }

  const activeCount = alerts.filter((a) => a.active).length
  const filterAlert = findsFilter ? alerts.find((a) => a.id === findsFilter) : undefined
  const finds = findsPage?.finds ?? []
  const findSources = Object.entries(findsPage?.sources ?? {}).sort((a, b) => b[1] - a[1])
  const totalPages = findsPage ? Math.max(1, Math.ceil(findsPage.total / FINDS_PAGE_SIZE)) : 1
  const findsFiltered = Boolean(findsFilter || hiddenSources.size || debouncedQuery)

  function changePage(next: number) {
    setPage(next)
    document.getElementById('finds')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex flex-col gap-2">
          <span className="eyebrow text-fg-muted">Monitoramento</span>
          <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-[28px]">Alertas</h2>
          <p className="max-w-xl text-sm text-fg-secondary">
            O robô verifica os alertas ativos a cada {CHECK_EVERY_HOURS} horas e avisa por e-mail e Telegram quando um
            lote novo aparece.
          </p>
        </div>
        {config?.database && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || (!config.email && !config.telegram)}
              className="btn btn-secondary"
            >
              {testing ? 'Enviando…' : 'Enviar teste'}
            </button>
            <button type="button" onClick={() => setForm({ mode: 'create' })} className="btn btn-primary">
              <PlusIcon className="h-4 w-4 text-gold" />
              Novo alerta
            </button>
          </div>
        )}
      </header>

      {config?.database && (
        <div className="flex flex-wrap items-center gap-2">
          <ChannelStatus configured={config.email} icon={<MailIcon className="h-3.5 w-3.5" />} label="E-mail" />
          <ChannelStatus configured={config.telegram} icon={<SendIcon className="h-3.5 w-3.5" />} label="Telegram" />
          <span className="badge py-1">
            {activeCount} de {alerts.length} ativo(s)
          </span>
        </div>
      )}

      {notice && (
        <p
          role="status"
          className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${
            notice.tone === 'ok'
              ? 'border-success/20 bg-success-soft text-success'
              : 'border-danger-border bg-danger-soft text-danger'
          }`}
        >
          <span
            className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${notice.tone === 'ok' ? 'bg-success' : 'bg-danger'}`}
            aria-hidden
          />
          {notice.text}
        </p>
      )}

      {loading && <p className="text-sm text-fg-muted">Carregando alertas…</p>}
      {loadError && (
        <p className="rounded-xl border border-danger-border bg-danger-soft px-4 py-3 text-sm text-danger">{loadError}</p>
      )}
      {config && !config.database && <SetupNotice />}

      {config?.database && !loading && alerts.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border-strong bg-surface-soft px-6 py-16 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-gold-soft bg-gold-tint text-gold-text">
            <BellIcon className="h-5 w-5" />
          </span>
          <p className="max-w-sm text-sm leading-relaxed text-fg-secondary">
            Nenhum alerta ainda. Crie um com o modelo, a faixa de preço e as fontes que você quer acompanhar.
          </p>
          <button type="button" onClick={() => setForm({ mode: 'create' })} className="btn btn-primary">
            <PlusIcon className="h-4 w-4 text-gold" />
            Criar primeiro alerta
          </button>
        </div>
      )}

      {alerts.length > 0 && config && (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {alerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              config={config}
              checking={checking.has(alert.id)}
              selected={findsFilter === alert.id}
              onToggleActive={() => handleToggleActive(alert)}
              onCheck={() => handleCheck(alert)}
              onEdit={() => setForm({ mode: 'edit', alert })}
              onDelete={() => handleDelete(alert)}
              onShowFinds={() => setFindsFilter((prev) => (prev === alert.id ? null : alert.id))}
            />
          ))}
        </div>
      )}

      {config?.database && alerts.length > 0 && (
        <section id="finds" className="flex scroll-mt-6 flex-col gap-5 border-t border-border pt-8">
          <div>
            <span className="eyebrow text-fg-muted">Histórico</span>
            <h3 className="mt-1 text-lg font-semibold tracking-tight text-fg">
              Lotes novos encontrados
              {findsPage && <span className="ml-2 text-sm font-normal text-fg-muted tabular-nums">{findsPage.total}</span>}
            </h3>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div className="w-56">
              <span className="field-label mb-1.5 block">Alerta</span>
              <Combobox
                options={[ALL_ALERTS, ...alerts.map((a) => a.name)]}
                value={filterAlert?.name ?? ALL_ALERTS}
                onSelect={(name) => setFindsFilter(alerts.find((a) => a.name === name)?.id ?? null)}
                maxResults={alerts.length + 1}
                selectOnly
              />
            </div>
            {findSources.length > 1 && (
              <div className="w-52">
                <span className="field-label mb-1.5 block">Fontes</span>
                <MultiSelect
                  options={findSources.map(([id, count]) => ({ id, label: SOURCE_LABEL[id] ?? id, count }))}
                  selected={new Set(findSources.map(([id]) => id).filter((id) => !hiddenSources.has(id)))}
                  onToggle={(id) => {
                    setHiddenSources((prev) => {
                      const next = new Set(prev)
                      if (next.has(id)) next.delete(id)
                      else next.add(id)
                      return next
                    })
                    setPage(1)
                  }}
                  onSetAll={(checked) => {
                    setHiddenSources(checked ? new Set() : new Set(findSources.map(([id]) => id)))
                    setPage(1)
                  }}
                  noun={{ singular: 'fonte', plural: 'fontes', all: 'Todas as fontes', none: 'Nenhuma fonte' }}
                />
              </div>
            )}
            <div className="min-w-48 flex-1 sm:max-w-sm">
              <label className="field-label mb-1.5 block" htmlFor="finds-q">
                Buscar no título
              </label>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-icon" />
                <input
                  id="finds-q"
                  type="text"
                  value={titleQuery}
                  onChange={(e) => setTitleQuery(e.target.value)}
                  placeholder="ex: submariner, ouro…"
                  className="field w-full pl-9"
                />
              </div>
            </div>
            {findsFiltered && (
              <button
                type="button"
                onClick={() => {
                  setFindsFilter(null)
                  setHiddenSources(new Set())
                  setTitleQuery('')
                }}
                className="btn btn-secondary"
              >
                Limpar filtros
              </button>
            )}
          </div>

          {finds.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border-strong bg-surface-soft px-6 py-10 text-center text-sm text-fg-secondary">
              {findsFiltered
                ? 'Nenhum lote com esses filtros.'
                : 'Nada novo por enquanto. Os lotes aparecem aqui assim que o robô encontrar algo adicionado depois da criação do alerta.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-5 min-[420px]:grid-cols-2 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4 2xl:grid-cols-5">
              {finds.map((find) => (
                <ListingCard
                  key={`${find.alertId}:${find.listing.id}`}
                  listing={find.listing}
                  isNew={false}
                  foundAt={find.firstSeenAt}
                  foundBy={findsFilter ? undefined : find.alertName}
                  watched={watchedIds.has(find.listing.id)}
                  onToggleWatch={(listing) =>
                    toggleWatch(listing).catch((err) => setNotice({ tone: 'error', text: err.message }))
                  }
                />
              ))}
            </div>
          )}

          {findsPage && (
            <Pagination
              page={findsPage.page}
              totalPages={totalPages}
              total={findsPage.total}
              noun="lotes"
              onChange={changePage}
            />
          )}
        </section>
      )}

      {form && (
        <AlertForm
          alert={form.mode === 'edit' ? form.alert : undefined}
          onSubmit={handleSubmit}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  )
}
