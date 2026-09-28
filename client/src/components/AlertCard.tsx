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
const relative = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto', style: 'short' })

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

function ChannelIcon({ on, configured, icon, label }: { on: boolean; configured: boolean; icon: React.ReactNode; label: string }) {
  const title = !on ? `${label}: desativado` : configured ? `${label}: ativo` : `${label}: não configurado no servidor`
  const color = on && configured ? 'text-gold-deep' : on ? 'text-danger' : 'text-fg-muted/60'
  return (
    <span title={title} aria-label={title} className={color}>
      {icon}
    </span>
  )
}

const iconButton = 'rounded-lg p-1.5 text-icon transition-colors disabled:pointer-events-none'

export function AlertCard({ alert, config, checking, selected, onToggleActive, onCheck, onEdit, onDelete, onShowFinds }: Props) {
  const range = priceRange(alert)
  // Only what differs from the defaults (every source, only watches) gets a tag.
  const tags = [
    range && { key: 'price', text: range },
    alert.reference && { key: 'ref', text: `Ref. ${alert.reference}` },
    alert.sources && {
      key: 'sources',
      text: alert.sources.length === 1 ? (SOURCE_LABEL[alert.sources[0]] ?? alert.sources[0]) : `${alert.sources.length} fontes`,
      title: alert.sources.map((s) => SOURCE_LABEL[s] ?? s).join(', '),
    },
    !alert.onlyWatches && { key: 'all', text: 'Inclui não relógios' },
    alert.digest && { key: 'digest', text: 'Resumo diário' },
    alert.hideSuspicious && { key: 'susp', text: 'Sem réplicas' },
    ...alert.includeTerms.map((t) => ({ key: `+${t}`, text: `+ ${t}` })),
    ...alert.excludeTerms.map((t) => ({ key: `-${t}`, text: `− ${t}` })),
  ].filter(Boolean) as { key: string; text: string; title?: string }[]

  return (
    <article
      className={`card flex flex-col gap-2.5 p-4 transition-[border-color,box-shadow] duration-200 ${
        selected ? 'border-gold-light shadow-soft-md' : ''
      } ${alert.active ? '' : 'bg-surface-soft'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${alert.active ? 'bg-gold' : 'bg-border-strong'}`} aria-hidden />
            <h3
              title={alert.name}
              className={`truncate text-sm font-medium ${alert.active ? 'text-fg' : 'text-fg-secondary'}`}
            >
              {alert.name}
            </h3>
          </div>
          {alert.name !== alert.query && <p className="mt-0.5 truncate pl-3.5 text-xs text-fg-muted">“{alert.query}”</p>}
        </div>
        <span title={alert.active ? 'Ativo: clique para pausar' : 'Pausado: clique para ativar'} className="pt-0.5">
          <Toggle
            checked={alert.active}
            onChange={onToggleActive}
            label={<span className="sr-only">{alert.active ? 'Ativo' : 'Pausado'}</span>}
            size="sm"
          />
        </span>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 pl-3.5">
          {tags.map((t) => (
            <span key={t.key} title={t.title} className="badge tabular-nums">
              {t.text}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2.5">
        <div className="flex min-w-0 items-center gap-2.5 text-xs text-fg-meta">
          <span className="flex shrink-0 items-center gap-1.5">
            <ChannelIcon on={alert.notifyEmail} configured={config.email} icon={<MailIcon className="h-3.5 w-3.5" />} label="E-mail" />
            <ChannelIcon on={alert.notifyTelegram} configured={config.telegram} icon={<SendIcon className="h-3.5 w-3.5" />} label="Telegram" />
          </span>
          <span className="truncate">
            {alert.lastCheckedAt ? formatRelative(alert.lastCheckedAt) : 'Aguardando'}
            {' · '}
            <button
              type="button"
              onClick={onShowFinds}
              title="Ver os lotes encontrados por este alerta"
              className={`font-medium underline-offset-2 transition-colors hover:text-fg hover:underline ${
                selected ? 'text-gold-text' : 'text-fg-secondary'
              }`}
            >
              {alert.findsCount ?? 0} encontrado(s)
              {alert.lastNewCount > 0 && <span className="text-gold-deep"> (+{alert.lastNewCount})</span>}
            </button>
          </span>
        </div>

        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={onCheck}
            disabled={checking}
            title={checking ? 'Verificando…' : 'Verificar agora'}
            aria-label="Verificar agora"
            className={`${iconButton} hover:bg-surface-muted hover:text-fg`}
          >
            <RefreshIcon className={`h-4 w-4 ${checking ? 'animate-spin text-gold' : ''}`} />
          </button>
          <button type="button" onClick={onEdit} title="Editar" aria-label="Editar" className={`${iconButton} hover:bg-surface-muted hover:text-fg`}>
            <PencilIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Excluir"
            aria-label="Excluir"
            className={`${iconButton} hover:bg-danger-soft hover:text-danger`}
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {alert.lastError && (
        <p
          title={alert.lastError}
          className="line-clamp-2 rounded-lg border border-danger-border bg-danger-soft px-2.5 py-1.5 text-[11px] leading-snug text-danger"
        >
          {alert.lastError}
        </p>
      )}
    </article>
  )
}
