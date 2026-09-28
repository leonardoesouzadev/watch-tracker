import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { CheckIcon, MailIcon, SendIcon, WatchIcon } from './icons'
import {
  checkBot,
  fetchInstallStatus,
  findChat,
  finishInstall,
  requestUnlockCode,
  setUnlockCode,
  testAnthropic,
  testEbay,
  testEmail,
  verifyUnlockCode,
  type FoundChat,
  type InstallStatus,
} from '../installApi'

// Setup wizard at /install: fills the Telegram and e-mail settings and points
// the bot at this deployment. Only DATABASE_URL has to be set on the server.

type Step = 'bot' | 'chat' | 'email' | 'integrations' | 'review' | 'done'

const STEPS: { step: Step; label: string }[] = [
  { step: 'bot', label: 'Bot' },
  { step: 'chat', label: 'Chat' },
  { step: 'email', label: 'E-mail' },
  { step: 'integrations', label: 'Integrações' },
  { step: 'review', label: 'Concluir' },
]

const CHAT_POLL_MS = 3000

function errorText(err: unknown) {
  return err instanceof Error ? err.message : String(err)
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-surface-muted px-1.5 py-0.5 text-xs text-fg">{children}</code>
}

function ErrorNote({ text }: { text: string | null }) {
  if (!text) return null
  return <p className="rounded-xl border border-danger-border bg-danger-soft px-4 py-3 text-sm text-danger">{text}</p>
}

function OkNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 rounded-xl border border-success/20 bg-success-soft px-4 py-3 text-sm text-success">
      <CheckIcon className="h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

function Card({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section className="card flex flex-col gap-5 p-6 sm:p-8">
      <div className="flex flex-col gap-2">
        <span className="eyebrow text-gold-deep">{eyebrow}</span>
        <h2 className="text-lg font-semibold tracking-tight text-fg">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function Field(props: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  hint?: ReactNode
  type?: string
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="field-label">{props.label}</span>
      <input
        className="field"
        type={props.type ?? 'text'}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      {props.hint && <span className="text-xs text-fg-muted">{props.hint}</span>}
    </label>
  )
}

function Progress({ step }: { step: Step }) {
  const current = STEPS.findIndex((s) => s.step === step)
  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((s, i) => {
        const done = i < current || step === 'done'
        const active = i === current
        return (
          <li key={s.step} className="flex flex-1 flex-col gap-1.5">
            <span className={`h-1 rounded-full ${done || active ? 'bg-gold' : 'bg-border-strong'}`} />
            <span className={`text-[11px] font-medium ${active ? 'text-fg' : 'text-fg-muted'}`}>{s.label}</span>
          </li>
        )
      })}
    </ol>
  )
}

function DatabaseMissing({ status, onRetry }: { status: InstallStatus; onRetry: () => void }) {
  return (
    <Card eyebrow="Passo 0" title="Conecte o banco de dados">
      <p className="text-sm leading-relaxed text-fg-secondary">
        As configurações e os alertas ficam num Postgres. Esse é o único item que precisa ser definido fora do
        instalador, porque é onde ele salva todo o resto.
      </p>
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed text-fg-secondary">
        <li>
          No projeto do Vercel, abra <b>Storage</b> e conecte um banco <b>Neon</b> ou <b>Supabase</b> (gratuito). O
          Vercel cria a variável <Code>DATABASE_URL</Code> (ou <Code>POSTGRES_URL</Code>) sozinho.
        </li>
        <li>
          Ou, em <b>Settings → Environment Variables</b>, cadastre <Code>DATABASE_URL</Code> com a connection string
          de qualquer Postgres.
        </li>
        <li>Faça um novo deploy (Deployments → Redeploy) e volte para esta página.</li>
      </ol>
      <ErrorNote text={status.databaseError && `Não consegui conectar: ${status.databaseError}`} />
      <div>
        <button type="button" className="btn btn-primary" onClick={onRetry}>
          Verificar de novo
        </button>
      </div>
    </Card>
  )
}

function Unlock({ status, onUnlocked }: { status: InstallStatus; onUnlocked: () => void }) {
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    setBusy(true)
    setError(null)
    try {
      await requestUnlockCode()
      setSent(true)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function verify() {
    setBusy(true)
    setError(null)
    setUnlockCode(code.trim())
    try {
      await verifyUnlockCode()
      onUnlocked()
    } catch (err) {
      setUnlockCode('')
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const when = status.installedAt ? new Date(status.installedAt).toLocaleString('pt-BR') : null
  return (
    <Card eyebrow="Já instalado" title="Este app já está configurado">
      <p className="text-sm leading-relaxed text-fg-secondary">
        {status.configuredBy === 'env'
          ? 'A configuração atual vem das variáveis de ambiente do servidor.'
          : `Instalado em ${when}.`}{' '}
        Para alterar, confirme que é você: envio um código para o chat do Telegram configurado.
      </p>
      <ErrorNote text={error} />
      {!sent ? (
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn btn-primary" onClick={send} disabled={busy}>
            <SendIcon className="h-4 w-4 text-gold" />
            {busy ? 'Enviando…' : 'Enviar código pelo Telegram'}
          </button>
          <a href="/" className="btn btn-secondary">
            Voltar ao app
          </a>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Field label="Código recebido no Telegram" value={code} onChange={setCode} placeholder="123456" />
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn btn-primary" onClick={verify} disabled={busy || code.trim().length < 6}>
              {busy ? 'Verificando…' : 'Continuar'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={send} disabled={busy}>
              Reenviar código
            </button>
          </div>
        </div>
      )}
    </Card>
  )
}

function Wizard() {
  const [step, setStep] = useState<Step>('bot')
  const [token, setToken] = useState('')
  const [bot, setBot] = useState<{ username: string; name: string } | null>(null)
  const [chat, setChat] = useState<FoundChat | null>(null)
  const [resendKey, setResendKey] = useState('')
  const [emailTo, setEmailTo] = useState('')
  const [emailFrom, setEmailFrom] = useState('')
  const [emailTested, setEmailTested] = useState(false)
  const [ebayClientId, setEbayClientId] = useState('')
  const [ebayClientSecret, setEbayClientSecret] = useState('')
  const [ebayTested, setEbayTested] = useState(false)
  const [anthropicKey, setAnthropicKey] = useState('')
  const [translationSample, setTranslationSample] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ botUsername: string; webhook: boolean } | null>(null)
  // Bumped by "Tentar de novo" to restart the chat polling after an error.
  const [pollRound, setPollRound] = useState(0)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  function go(next: Step) {
    setError(null)
    setStep(next)
  }

  // Waits for the owner to message the bot, then shows whose chat it is.
  useEffect(() => {
    if (step !== 'chat' || chat) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const found = await findChat(token.trim())
        if (stopped) return
        if (found.chat) setChat(found.chat)
        else timer = setTimeout(poll, CHAT_POLL_MS)
      } catch (err) {
        if (!stopped) setError(errorText(err))
      }
    }
    poll()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [step, chat, token, pollRound])

  const botLink = bot ? `https://t.me/${bot.username}` : ''

  return (
    <div className="flex flex-col gap-6">
      {step !== 'done' && <Progress step={step} />}

      {step === 'bot' && (
        <Card eyebrow="Passo 1 de 5" title="Crie o bot do Telegram">
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed text-fg-secondary">
            <li>
              No Telegram, abra o{' '}
              <a className="font-medium text-gold-text underline" href="https://t.me/BotFather" target="_blank" rel="noreferrer">
                @BotFather
              </a>{' '}
              e mande <Code>/newbot</Code>.
            </li>
            <li>Escolha um nome e um usuário terminado em "bot" (ex: <Code>relogios_joao_bot</Code>).</li>
            <li>Copie o token que ele responde e cole abaixo.</li>
          </ol>
          <Field
            label="Token do bot"
            value={token}
            onChange={(v) => {
              setToken(v)
              setBot(null)
              setChat(null)
            }}
            placeholder="123456789:AAH..."
          />
          <ErrorNote text={error} />
          {bot && (
            <OkNote>
              Bot encontrado: <b>@{bot.username}</b>
            </OkNote>
          )}
          <div className="flex gap-3">
            {!bot ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !token.trim()}
                onClick={() => run(async () => setBot(await checkBot(token.trim())))}
              >
                {busy ? 'Validando…' : 'Validar token'}
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => go('chat')}>
                Continuar
              </button>
            )}
          </div>
        </Card>
      )}

      {step === 'chat' && bot && (
        <Card eyebrow="Passo 2 de 5" title="Conecte o chat que recebe os alertas">
          <p className="text-sm leading-relaxed text-fg-secondary">
            Abra o bot no celular do dono do app e mande <Code>/start</Code>. Esta página detecta a mensagem sozinha.
            Para receber num grupo, adicione o bot ao grupo e mande uma mensagem lá.
          </p>
          <div>
            <a href={botLink} target="_blank" rel="noreferrer" className="btn btn-gold">
              <SendIcon className="h-4 w-4" />
              Abrir @{bot.username}
            </a>
          </div>
          <ErrorNote text={error} />
          {chat ? (
            <OkNote>
              Chat detectado: <b>{chat.name || chat.id}</b> {chat.type !== 'private' && '(grupo)'}
            </OkNote>
          ) : (
            !error && <p className="text-sm text-fg-muted">Aguardando a mensagem…</p>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn btn-secondary" onClick={() => go('bot')}>
              Voltar
            </button>
            {chat && (
              <>
                <button type="button" className="btn btn-primary" onClick={() => go('email')}>
                  Continuar
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setChat(null)}>
                  Usar outro chat
                </button>
              </>
            )}
            {error && (
              <button type="button" className="btn btn-primary" onClick={() => {
                  setError(null)
                  setPollRound((n) => n + 1)
                }}>
                Tentar de novo
              </button>
            )}
          </div>
        </Card>
      )}

      {step === 'email' && (
        <Card eyebrow="Passo 3 de 5 · opcional" title="Alertas por e-mail">
          <p className="text-sm leading-relaxed text-fg-secondary">
            Além do Telegram, os alertas podem chegar por e-mail. Crie uma conta grátis no{' '}
            <a className="font-medium text-gold-text underline" href="https://resend.com" target="_blank" rel="noreferrer">
              Resend
            </a>{' '}
            e gere uma API key. Sem domínio verificado no Resend, o e-mail só chega no endereço da própria conta.
          </p>
          <Field
            label="API key do Resend"
            value={resendKey}
            onChange={(v) => {
              setResendKey(v)
              setEmailTested(false)
            }}
            placeholder="re_..."
          />
          <Field
            label="Enviar alertas para"
            value={emailTo}
            onChange={(v) => {
              setEmailTo(v)
              setEmailTested(false)
            }}
            placeholder="voce@exemplo.com"
            hint="Vários endereços: separe por vírgula."
          />
          <Field
            label="Remetente (opcional)"
            value={emailFrom}
            onChange={(v) => {
              setEmailFrom(v)
              setEmailTested(false)
            }}
            placeholder="Watch Tracker <onboarding@resend.dev>"
          />
          <ErrorNote text={error} />
          {emailTested && <OkNote>E-mail de teste enviado. Confira a caixa de entrada.</OkNote>}
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn btn-secondary" onClick={() => go('chat')}>
              Voltar
            </button>
            {resendKey.trim() ? (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy || !emailTo.trim()}
                  onClick={() =>
                    run(async () => {
                      await testEmail({ resendKey: resendKey.trim(), emailTo, emailFrom })
                      setEmailTested(true)
                    })
                  }
                >
                  <MailIcon className="h-4 w-4" />
                  {busy ? 'Enviando…' : 'Enviar teste'}
                </button>
                <button type="button" className="btn btn-primary" disabled={!emailTo.trim()} onClick={() => go('integrations')}>
                  Continuar
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => go('integrations')}>
                Pular
              </button>
            )}
          </div>
        </Card>
      )}

      {step === 'integrations' && (
        <Card eyebrow="Passo 4 de 5 · opcional" title="eBay e tradução">
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-fg-secondary">
              <b className="text-fg">eBay:</b> a busca usa a API oficial, que pede chaves grátis. Crie uma conta em{' '}
              <a className="font-medium text-gold-text underline" href="https://developer.ebay.com" target="_blank" rel="noreferrer">
                developer.ebay.com
              </a>
              , gere um keyset de <b>Production</b> e copie o App ID e o Cert ID. Sem as chaves, o eBay fica fora das
              buscas.
            </p>
            <Field
              label="App ID (Client ID)"
              value={ebayClientId}
              onChange={(v) => {
                setEbayClientId(v)
                setEbayTested(false)
              }}
              placeholder="SeuNome-WatchTra-PRD-..."
            />
            <Field
              label="Cert ID (Client Secret)"
              value={ebayClientSecret}
              onChange={(v) => {
                setEbayClientSecret(v)
                setEbayTested(false)
              }}
              placeholder="PRD-..."
            />
            {ebayTested && <OkNote>Chaves do eBay aceitas.</OkNote>}
            <div>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy || !ebayClientId.trim() || !ebayClientSecret.trim()}
                onClick={() =>
                  run(async () => {
                    await testEbay({ ebayClientId: ebayClientId.trim(), ebayClientSecret: ebayClientSecret.trim() })
                    setEbayTested(true)
                  })
                }
              >
                Testar chaves do eBay
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-4 border-t border-border pt-5">
            <p className="text-sm leading-relaxed text-fg-secondary">
              <b className="text-fg">Tradução:</b> os títulos do Mercari e do Yahoo Japão vêm em japonês. Com uma chave da
              API da{' '}
              <a className="font-medium text-gold-text underline" href="https://console.anthropic.com" target="_blank" rel="noreferrer">
                Anthropic
              </a>
              , eles aparecem traduzidos para o português. Cada título é traduzido uma vez só e fica guardado.
            </p>
            <Field
              label="Chave da API da Anthropic"
              value={anthropicKey}
              onChange={(v) => {
                setAnthropicKey(v)
                setTranslationSample(null)
              }}
              placeholder="sk-ant-..."
            />
            {translationSample && (
              <OkNote>
                Chave aceita. Teste: ロレックス 腕時計 → <b>{translationSample}</b>
              </OkNote>
            )}
            <div>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy || !anthropicKey.trim()}
                onClick={() =>
                  run(async () => {
                    setTranslationSample((await testAnthropic(anthropicKey.trim())).sample)
                  })
                }
              >
                Testar tradução
              </button>
            </div>
          </div>

          <ErrorNote text={error} />
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn btn-secondary" onClick={() => go('email')}>
              Voltar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={Boolean(ebayClientId.trim()) !== Boolean(ebayClientSecret.trim())}
              onClick={() => go('review')}
            >
              {ebayClientId.trim() || anthropicKey.trim() ? 'Continuar' : 'Pular'}
            </button>
          </div>
        </Card>
      )}

      {step === 'review' && bot && chat && (
        <Card eyebrow="Passo 5 de 5" title="Revise e conclua">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-fg-muted">Bot</dt>
            <dd className="text-fg">@{bot.username}</dd>
            <dt className="text-fg-muted">Chat</dt>
            <dd className="text-fg">{chat.name || chat.id}</dd>
            <dt className="text-fg-muted">E-mail</dt>
            <dd className="text-fg">{resendKey.trim() ? emailTo : 'Não usar'}</dd>
            <dt className="text-fg-muted">eBay</dt>
            <dd className="text-fg">{ebayClientId.trim() ? 'Ativado' : 'Não usar'}</dd>
            <dt className="text-fg-muted">Tradução</dt>
            <dd className="text-fg">{anthropicKey.trim() ? 'Ativada' : 'Não usar'}</dd>
            <dt className="text-fg-muted">Endereço do app</dt>
            <dd className="break-all text-fg">{window.location.origin}</dd>
          </dl>
          <p className="text-sm leading-relaxed text-fg-secondary">
            Ao concluir, salvo tudo, configuro o nome, a descrição e os comandos do bot, conecto o bot a este endereço e
            mando uma mensagem de boas-vindas no chat.
          </p>
          <ErrorNote text={error} />
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn btn-secondary" onClick={() => go('integrations')}>
              Voltar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const done = await finishInstall({
                    token: token.trim(),
                    chatId: chat.id,
                    resendKey: resendKey.trim(),
                    emailTo,
                    emailFrom,
                    ebayClientId: ebayClientId.trim(),
                    ebayClientSecret: ebayClientSecret.trim(),
                    anthropicKey: anthropicKey.trim(),
                    appUrl: window.location.origin,
                  })
                  setUnlockCode('')
                  setResult(done)
                  setStep('done')
                })
              }
            >
              {busy ? 'Instalando…' : 'Concluir instalação'}
            </button>
          </div>
        </Card>
      )}

      {step === 'done' && result && (
        <Card eyebrow="Pronto" title="Watch Tracker instalado">
          <OkNote>
            Configuração salva. Uma mensagem de boas-vindas foi enviada para <b>@{result.botUsername}</b>.
          </OkNote>
          {!result.webhook && (
            <p className="rounded-xl border border-gold-soft bg-gold-tint px-4 py-3 text-sm text-gold-text">
              Este endereço não é HTTPS, então o bot envia os alertas mas não responde comandos. Rode o instalador de
              novo no endereço publicado para ativar a busca pelo chat.
            </p>
          )}
          <div className="flex flex-col gap-2 text-sm leading-relaxed text-fg-secondary">
            <span className="font-medium text-fg">Falta um passo: o robô de alertas</span>
            <p>
              A verificação automática roda no GitHub Actions. No repositório, em{' '}
              <b>Settings → Secrets and variables → Actions</b>, cadastre só o secret <Code>DATABASE_URL</Code> (o
              mesmo do Vercel). O resto o robô lê do banco.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href="/#alertas" className="btn btn-primary">
              Abrir o app
            </a>
            <a href={`https://t.me/${result.botUsername}`} target="_blank" rel="noreferrer" className="btn btn-secondary">
              <SendIcon className="h-4 w-4" />
              Abrir o bot
            </a>
          </div>
        </Card>
      )}
    </div>
  )
}

export function InstallPage() {
  const [status, setStatus] = useState<InstallStatus | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [unlocked, setUnlocked] = useState(false)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      setStatus(await fetchInstallStatus())
    } catch (err) {
      setLoadError(errorText(err))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="min-h-full bg-background px-4 py-10 sm:py-16">
      <div className="mx-auto flex max-w-xl flex-col gap-8">
        <header className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-gold">
            <WatchIcon className="h-5 w-5" />
          </span>
          <div className="flex flex-col">
            <span className="eyebrow text-fg-muted">Watch Tracker</span>
            <h1 className="text-xl font-semibold tracking-tight text-fg">Instalação</h1>
          </div>
        </header>

        {!status && !loadError && <p className="text-sm text-fg-muted">Verificando o servidor…</p>}
        <ErrorNote text={loadError && `Não consegui falar com o servidor: ${loadError}`} />
        {status && !status.database && <DatabaseMissing status={status} onRetry={load} />}
        {status?.database && status.installed && !unlocked && (
          <Unlock status={status} onUnlocked={() => setUnlocked(true)} />
        )}
        {status?.database && (!status.installed || unlocked) && <Wizard />}
      </div>
    </div>
  )
}
