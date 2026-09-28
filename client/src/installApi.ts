export interface InstallStatus {
  database: boolean
  databaseError: string | null
  installed: boolean
  /** 'env' = configured by environment variables before the wizard existed. */
  configuredBy: 'install' | 'env' | null
  installedAt?: string | null
}

export interface FoundChat {
  id: string
  name: string
  type: string
}

export interface InstallInput {
  token: string
  chatId: string
  resendKey: string
  emailTo: string
  emailFrom: string
  ebayClientId: string
  ebayClientSecret: string
  anthropicKey: string
  appUrl: string
}

// After the first install, changes need the code sent to the owner's Telegram.
let unlockCode = ''

export function setUnlockCode(code: string) {
  unlockCode = code
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/install${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(unlockCode ? { 'x-install-code': unlockCode } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Falha na requisição (${res.status})`)
  return data as T
}

export const fetchInstallStatus = () => request<InstallStatus>('/status')
export const requestUnlockCode = () => request<{ ok: true }>('/unlock', {})
export const verifyUnlockCode = () => request<{ ok: true }>('/verify', {})
export const checkBot = (token: string) => request<{ username: string; name: string }>('/telegram/bot', { token })
export const findChat = (token: string) => request<{ chat: FoundChat | null }>('/telegram/chat', { token })
export const testEmail = (input: Pick<InstallInput, 'resendKey' | 'emailTo' | 'emailFrom'>) =>
  request<{ ok: true }>('/email/test', input)
export const testEbay = (input: Pick<InstallInput, 'ebayClientId' | 'ebayClientSecret'>) =>
  request<{ ok: true }>('/ebay/test', input)
export const testAnthropic = (anthropicKey: string) =>
  request<{ ok: true; sample: string }>('/anthropic/test', { anthropicKey })
export const finishInstall = (input: InstallInput) =>
  request<{ ok: true; botUsername: string; webhook: boolean }>('/finish', input)
