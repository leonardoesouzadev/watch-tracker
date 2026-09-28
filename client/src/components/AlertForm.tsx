import { useEffect, useRef, useState } from 'react'
import type { Alert, AlertInput } from '../types'
import { BUILT_IN_SOURCES } from '../sourceLabels'
import { WATCH_BRANDS } from '../watchFilter'
import { Toggle } from './Toggle'
import { CurrencyInput } from './CurrencyInput'
import { CheckIcon, XIcon } from './icons'

interface Props {
  /** Alert being edited; omit to create a new one. */
  alert?: Alert
  /** Prefilled values for a new alert (e.g. from the current search). */
  initial?: Partial<AlertInput>
  onSubmit: (input: AlertInput) => Promise<void>
  onClose: () => void
}

function splitTerms(text: string): string[] {
  return text
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

export function AlertForm({ alert, initial, onSubmit, onClose }: Props) {
  const values = alert ?? initial
  const [query, setQuery] = useState(values?.query ?? '')
  const [name, setName] = useState(alert && alert.name !== alert.query ? alert.name : '')
  const [minPrice, setMinPrice] = useState(values?.minPrice != null ? String(Math.round(values.minPrice)) : '')
  const [maxPrice, setMaxPrice] = useState(values?.maxPrice != null ? String(Math.round(values.maxPrice)) : '')
  const [includeTerms, setIncludeTerms] = useState(values?.includeTerms?.join(', ') ?? '')
  const [excludeTerms, setExcludeTerms] = useState(values?.excludeTerms?.join(', ') ?? '')
  const [sources, setSources] = useState<Set<string>>(
    () => new Set(values?.sources ?? BUILT_IN_SOURCES.map((s) => s.id))
  )
  const [onlyWatches, setOnlyWatches] = useState(values?.onlyWatches ?? true)
  const [notifyEmail, setNotifyEmail] = useState(alert?.notifyEmail ?? true)
  const [notifyTelegram, setNotifyTelegram] = useState(alert?.notifyTelegram ?? true)
  const [active, setActive] = useState(alert?.active ?? true)
  const [reference, setReference] = useState(values?.reference ?? '')
  const [hideSuspicious, setHideSuspicious] = useState(values?.hideSuspicious ?? false)
  const [digest, setDigest] = useState(values?.digest ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const queryRef = useRef<HTMLInputElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    queryRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function toggleSource(id: string) {
    setSources((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return setError('Informe o termo de busca.')
    if (sources.size === 0) return setError('Selecione pelo menos uma fonte.')
    setSaving(true)
    setError(null)
    try {
      await onSubmit({
        name: name.trim() || query.trim(),
        query: query.trim(),
        minPrice: minPrice.trim() === '' ? null : Number(minPrice),
        maxPrice: maxPrice.trim() === '' ? null : Number(maxPrice),
        sources: sources.size === BUILT_IN_SOURCES.length ? null : [...sources],
        onlyWatches,
        includeTerms: splitTerms(includeTerms),
        excludeTerms: splitTerms(excludeTerms),
        notifyEmail,
        notifyTelegram,
        active,
        reference: reference.trim() || null,
        hideSuspicious,
        digest,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
      setSaving(false)
    }
  }

  const queryChanged = alert && query.trim() !== alert.query

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-soft-lg sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="alert-form-title"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div>
            <span className="eyebrow text-fg-muted">{alert ? 'Editar alerta' : 'Novo alerta'}</span>
            <h3 id="alert-form-title" className="mt-1 text-lg font-semibold tracking-tight text-fg">
              Parâmetros de monitoramento
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Fechar"
            className="rounded-lg p-1.5 text-icon transition-colors hover:bg-surface-muted hover:text-fg"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </header>

        <div className="flex flex-col gap-6 overflow-y-auto px-6 py-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field-label flex flex-col gap-1.5">
              Termo de busca *
              <input
                ref={queryRef}
                list="alert-brand-options"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ex: Rolex Submariner"
                className="field"
              />
              <datalist id="alert-brand-options">
                {WATCH_BRANDS.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </label>
            <label className="field-label flex flex-col gap-1.5">
              Nome do alerta
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Opcional — usa o termo"
                className="field"
              />
            </label>
          </div>
          {queryChanged && (
            <p className="-mt-3 text-xs text-gold-text">
              Mudar o termo reinicia o histórico: os lotes atuais serão registrados de novo, sem aviso.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field-label flex flex-col gap-1.5">
              Preço mín.
              <CurrencyInput value={minPrice} onChange={setMinPrice} placeholder="R$ 0" />
            </label>
            <label className="field-label flex flex-col gap-1.5">
              Preço máx.
              <CurrencyInput value={maxPrice} onChange={setMaxPrice} placeholder="Sem limite" />
            </label>
            <label className="field-label flex flex-col gap-1.5 sm:col-span-2">
              Referência exata
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="ex: 116610LN, 5711/1A, SBGA211"
                className="field font-mono"
              />
              <span className="font-normal text-fg-muted">
                Ignora espaços e pontuação. "116610" também pega "116610LN", mas não "1166100".
              </span>
            </label>
            <label className="field-label flex flex-col gap-1.5">
              Deve conter no título
              <input
                value={includeTerms}
                onChange={(e) => setIncludeTerms(e.target.value)}
                placeholder="ex: 116610, automático"
                className="field"
              />
              <span className="font-normal text-fg-muted">Separe por vírgula. Todos precisam aparecer.</span>
            </label>
            <label className="field-label flex flex-col gap-1.5">
              Não pode conter
              <input
                value={excludeTerms}
                onChange={(e) => setExcludeTerms(e.target.value)}
                placeholder="ex: réplica, pulseira"
                className="field"
              />
              <span className="font-normal text-fg-muted">Separe por vírgula. Qualquer um exclui o lote.</span>
            </label>
          </div>

          <div className="flex flex-col gap-2.5">
            <span className="field-label">Fontes</span>
            <div className="flex flex-wrap gap-2">
              {BUILT_IN_SOURCES.map((s) => {
                const on = sources.has(s.id)
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSource(s.id)}
                    aria-pressed={on}
                    className={`chip ${on ? 'chip-active' : 'text-fg-muted'}`}
                  >
                    {on && <CheckIcon className="h-3 w-3 text-gold" />}
                    {s.name}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid gap-x-6 gap-y-4 rounded-xl border border-border bg-surface-soft p-4 sm:grid-cols-2">
            <Toggle checked={onlyWatches} onChange={() => setOnlyWatches((v) => !v)} label="Somente relógios" />
            <Toggle checked={active} onChange={() => setActive((v) => !v)} label="Alerta ativo" />
            <Toggle checked={notifyEmail} onChange={() => setNotifyEmail((v) => !v)} label="Avisar por e-mail" />
            <Toggle checked={notifyTelegram} onChange={() => setNotifyTelegram((v) => !v)} label="Avisar no Telegram" />
            <Toggle
              checked={hideSuspicious}
              onChange={() => setHideSuspicious((v) => !v)}
              label="Ignorar possíveis réplicas"
            />
            <Toggle checked={digest} onChange={() => setDigest((v) => !v)} label="Resumo diário (8h)" />
          </div>
          <p className="-mt-3 text-xs leading-relaxed text-fg-muted">
            Os preços em outras moedas são convertidos para reais pela cotação do dia antes de comparar com a faixa de
            preço. No resumo diário, os lotes novos chegam juntos numa só mensagem às 8h, em vez de um aviso por lote.
          </p>

          {!alert && (
            <p className="text-xs leading-relaxed text-fg-secondary">
              Ao criar, o robô registra os lotes que já estão em leilão sem enviar aviso. A partir daí você recebe
              só o que for adicionado depois.
            </p>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <footer className="flex justify-end gap-3 border-t border-border bg-surface-soft px-6 py-4">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? (alert ? 'Salvando…' : 'Criando e registrando lotes…') : alert ? 'Salvar alterações' : 'Criar alerta'}
          </button>
        </footer>
      </form>
    </div>
  )
}
