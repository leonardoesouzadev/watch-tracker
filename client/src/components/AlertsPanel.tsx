import { useCallback, useEffect, useState } from 'react'
import type { Alert, AlertFind, AlertInput, AlertsConfig } from '../types'
import {
  checkAlertNow,
  createAlert,
  deleteAlert,
  fetchAlerts,
  fetchFinds,
  sendTestNotification,
  updateAlert,
} from '../alertsApi'
import { AlertCard } from './AlertCard'
import { AlertForm } from './AlertForm'
import { ListingCard } from './ListingCard'
import { BellIcon, MailIcon, PlusIcon, SendIcon, XIcon } from './icons'

// Keep in sync with .github/workflows/check-alerts.yml.
const CHECK_EVERY_HOURS = 2

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
        nas variáveis de ambiente do servidor. As tabelas são criadas automaticamente. Veja o README para os demais
        passos (e-mail, Telegram e agendamento).
      </p>
    </div>
  )
}

export function AlertsPanel() {
  const [config, setConfig] = useState<AlertsConfig | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [finds, setFinds] = useState<AlertFind[]>([])
  const [findsFilter, setFindsFilter] = useState<number | null>(null)
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

  const loadFinds = useCallback(async (alertId: number | null) => {
    try {
      const data = await fetchFinds(alertId ?? undefined)
      setFinds(data.finds)
    } catch {
      setFinds([])
    }
  }, [])

  useEffect(() => {
    void loadAlerts()
  }, [loadAlerts])

  useEffect(() => {
    if (config?.database) void loadFinds(findsFilter)
  }, [config?.database, findsFilter, loadFinds])

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
      if (result.newCount > 0) void loadFinds(findsFilter)
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
      else void loadFinds(findsFilter)
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
        <div className="grid gap-5 xl:grid-cols-2">
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
        <section className="flex flex-col gap-5 border-t border-border pt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="eyebrow text-fg-muted">Histórico</span>
              <h3 className="mt-1 text-lg font-semibold tracking-tight text-fg">Lotes novos encontrados</h3>
            </div>
            {filterAlert && (
              <button type="button" onClick={() => setFindsFilter(null)} className="chip chip-active">
                {filterAlert.name}
                <XIcon className="h-3 w-3 text-gold" />
              </button>
            )}
          </div>

          {finds.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border-strong bg-surface-soft px-6 py-10 text-center text-sm text-fg-secondary">
              Nada novo por enquanto. Os lotes aparecem aqui assim que o robô encontrar algo adicionado depois da
              criação do alerta.
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
                />
              ))}
            </div>
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
