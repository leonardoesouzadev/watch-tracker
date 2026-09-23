import type { Alert, AlertFind, AlertInput, AlertsConfig } from './types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Falha na requisição (${res.status})`)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

export function fetchAlerts() {
  return request<{ configured: AlertsConfig; alerts: Alert[] }>('/alerts')
}

export function createAlert(input: AlertInput) {
  return request<Alert>('/alerts', { method: 'POST', body: JSON.stringify(input) })
}

export function updateAlert(id: number, input: Partial<AlertInput>) {
  return request<Alert>(`/alerts/${id}`, { method: 'PUT', body: JSON.stringify(input) })
}

export function deleteAlert(id: number) {
  return request<void>(`/alerts/${id}`, { method: 'DELETE' })
}

export function checkAlertNow(id: number) {
  return request<{ newCount: number; errors: string[]; alert: Alert }>(`/alerts/${id}/check`, { method: 'POST' })
}

export function fetchFinds(alertId?: number) {
  const qs = alertId ? `?alertId=${alertId}` : ''
  return request<{ finds: AlertFind[] }>(`/alerts/finds${qs}`)
}

export function sendTestNotification() {
  return request<{ email?: string | null; telegram?: string | null }>('/notifications/test', { method: 'POST' })
}
