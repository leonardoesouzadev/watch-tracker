import type { Alert, AlertsConfig } from '../types'
import { SOURCE_LABEL } from '../sourceLabels'
import { Toggle } from './Toggle'
import { MailIcon, PencilIcon, RefreshIcon, SendIcon, TrashIcon } from './icons'

interface Props {
  alert: Alert
  config: AlertsConfig
  checking: boolean
  selected: boolean
  onToggleActive: () => void
  onCheck: () => void
  onEdit: () => void
  onDelete: () => void
  onShowFinds: () => void
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const relative = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

function formatRelative(iso: string): string {
  const diffSec = (new Date(iso).getTime() - Date.now()) / 1000
  const abs = Math.abs(diffSec)
  if (abs < 60) return 'agora mesmo'
  if (abs < 3600) return relative.format(Math.round(diffSec / 60), 'minute')
  if (abs < 86400) return relative.format(Math.round(diffSec / 3600), 'hour')
  return relative.format(Math.round(diffSec / 86400), 'day')
}

function priceRange(alert: Alert): string | null {
  const { minPrice: min, maxPrice: max } = alert
  if (min === null && max === null) return null
  if (min !== null && max !== null) return `${brl.format(min)} – ${brl.format(max)}`
  return min !== null ? `a partir de ${brl.format(min)}` : `até ${brl.format(max!)}`
}

function ChannelBadge({ on, configured, icon, label }: { on: boolean; configured: boolean; icon: React.ReactNode; label: string }) {
  const title = !on ? `${label}: desativado` : configured ? `${label}: ativo` : `${label}: não configurado no servidor`
  return (
    <span
      title={title}
      className={`flex h-7 w-7 items-center justify-center rounded-lg border ${
        on && configured
          ? 'border-gold-soft bg-gold-tint text-gold-text'
          : on
            ? 'border-danger-border bg-danger-soft text-danger'
            : 'border-border bg-surface-muted text-fg-muted'
      }`}
    >
      {icon}
    </span>
  )
}

export function AlertCard({ alert, config, checking, selected, onToggleActive, onCheck, onEdit, onDelete, onShowFinds }: Props) {
  const range = priceRange(alert)
  const sources = alert.sources ? alert.sources.map((s) => SOURCE_LABEL[s] ?? s).join(', ') : 'Todas as fontes'

  return (
    <article
      className={`card flex flex-col gap-4 p-5 transition-[border-color,box-shadow] duration-200 ${
        selected ? 'border-gold-light shadow-soft-md' : ''
      } ${alert.active ? '' : 'bg-surface-soft'}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${alert.active ? 'bg-gold' : 'bg-border-strong'}`}
              aria-hidden
            />
            <h3 className={`truncate text-base font-medium ${alert.active ? 'text-fg' : 'text-fg-secondary'}`}>
              {alert.name}
            </h3>
          </div>
          {alert.name !== alert.query && (
            <p className="mt-1 truncate pl-4 text-sm text-fg-secondary">“{alert.query}”</p>
          )}
        </div>
        <Toggle
          checked={alert.active}
          onChange={onToggleActive}
          label={alert.active ? 'Ativo' : 'Pausado'}
          labelClassName="text-xs font-medium text-fg-secondary"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {range && <span className="badge tabular-nums">{range}</span>}
        <span className="badge">{sources}</span>
        {alert.onlyWatches && <span className="badge">Somente relógios</span>}
        {alert.includeTerms.map((t) => (
          <span key={`+${t}`} className="badge">
            + {t}
          </span>
        ))}
        {alert.excludeTerms.map((t) => (
          <span key={`-${t}`} className="badge">
            − {t}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <ChannelBadge on={alert.notifyEmail} configured={config.email} icon={<MailIcon className="h-3.5 w-3.5" />} label="E-mail" />
            <ChannelBadge on={alert.notifyTelegram} configured={config.telegram} icon={<SendIcon className="h-3.5 w-3.5" />} label="Telegram" />
          </div>
          <div className="text-xs leading-snug text-fg-meta">
            <p>
              {alert.lastCheckedAt ? `Verificado ${formatRelative(alert.lastCheckedAt)}` : 'Aguardando primeira verificação'}
            </p>
            <button
              type="button"
              onClick={onShowFinds}
              className={`font-medium transition-colors hover:text-fg ${selected ? 'text-gold-text' : 'text-fg-secondary'}`}
            >
              {alert.findsCount ?? 0} encontrado(s)
              {alert.lastNewCount > 0 && <span className="text-gold-deep"> · {alert.lastNewCount} na última</span>}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button type="button" onClick={onCheck} disabled={checking} className="btn btn-secondary px-3 py-1.5 text-xs">
            <RefreshIcon className={`h-3.5 w-3.5 ${checking ? 'animate-spin text-gold' : 'text-icon'}`} />
            {checking ? 'Verificando…' : 'Verificar agora'}
          </button>
          <button
            type="button"
            onClick={onEdit}
            title="Editar"
            className="rounded-lg p-2 text-icon transition-colors hover:bg-surface-muted hover:text-fg"
          >
            <PencilIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Excluir"
            className="rounded-lg p-2 text-icon transition-colors hover:bg-danger-soft hover:text-danger"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {alert.lastError && (
        <p className="rounded-lg border border-danger-border bg-danger-soft px-3 py-2 text-xs leading-relaxed text-danger">
          {alert.lastError}
        </p>
      )}
    </article>
  )
}
