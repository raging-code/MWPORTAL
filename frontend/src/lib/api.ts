// ─── API Client ───────────────────────────────────────────────────────────────

const BASE = '/api'

function getToken(): string | null {
  return localStorage.getItem('mw_token')
}

export function setToken(token: string) {
  localStorage.setItem('mw_token', token)
}

export function clearToken() {
  localStorage.removeItem('mw_token')
  localStorage.removeItem('mw_user')
}

export function getUser(): {
  id: number
  name: string
  role: 'crew' | 'admin'
  mustChangePin: boolean
} | null {
  try {
    const raw = localStorage.getItem('mw_user')
    if (!raw) return null
    const u = JSON.parse(raw)
    if (!u || typeof u.id !== 'number' || !u.role || !u.name) return null

    // Client-side token expiry check — server always re-validates too
    const token = getToken()
    if (token) {
      try {
        const parts = token.split('.')
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]))
          if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
            clearToken()
            return null
          }
        }
      } catch { /* malformed token — will fail on next request */ }
    }
    return u
  } catch {
    return null
  }
}

export function setUser(user: {
  id: number; name: string; role: 'crew' | 'admin'; mustChangePin: boolean
}) {
  localStorage.setItem('mw_user', JSON.stringify(user))
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    clearToken()
    window.location.href = '/login'
    throw new Error('Session expired — please log in again')
  }

  let data: any
  try { data = await res.json() } catch { throw new Error('Unexpected server response') }

  if (!res.ok) throw new Error(data?.error || 'Request failed')
  return data as T
}

export const api = {
  login: (name: string, pin: string) =>
    request<{ token: string; user: { id: number; name: string; role: 'crew' | 'admin'; mustChangePin: boolean } }>(
      'POST', '/auth/login', { name, pin }
    ),

  changePin: (currentPin: string, newPin: string) =>
    request<{ success: boolean }>('POST', '/auth/change-pin', { currentPin, newPin }),

  punchStatus: () =>
    request<{ clockedIn: boolean; entryId: number | null; since: string | null }>('GET', '/punch/status'),

  punchIn: () =>
    request<{ success: boolean; clockIn: string; entryId: number }>('POST', '/punch/in'),

  punchOut: () =>
    request<{ success: boolean; clockOut: string }>('POST', '/punch/out'),

  myHours: () =>
    request<{ today: number; week: number; month: number; entries: any[] }>('GET', '/hours/my'),

  exportHours: (start: string, end: string, accountId?: string) => {
    const params = new URLSearchParams({ start, end })
    if (accountId) params.set('accountId', accountId)
    return request<{ entries: any[] }>('GET', `/hours/export?${params}`)
  },

  adminGetAccounts: () =>
    request<{ accounts: any[] }>('GET', '/admin/accounts'),

  adminCreateAccount: (name: string, pin: string, role: string) =>
    request<{ success: boolean; id: number }>('POST', '/admin/accounts', { name, pin, role }),

  adminUpdateAccount: (id: number, data: Partial<{ name: string; role: string; active: boolean }>) =>
    request<{ success: boolean }>('PATCH', `/admin/accounts/${id}`, data),

  adminResetPin: (id: number, newPin: string) =>
    request<{ success: boolean }>('POST', `/admin/accounts/${id}/reset-pin`, { newPin }),

  adminAllHours: () =>
    request<{ summary: any[] }>('GET', '/admin/hours'),

  adminCrewHours: (id: number) =>
    request<{ account: any; entries: any[] }>('GET', `/admin/hours/${id}`),

  adminInsertPunch: (accountId: number, clockIn: string, clockOut?: string) =>
    request<{ success: boolean; id: number }>('POST', '/admin/punch', { accountId, clockIn, clockOut }),

  adminEditPunch: (id: number, clockIn?: string, clockOut?: string) =>
    request<{ success: boolean }>('PATCH', `/admin/punch/${id}`, { clockIn, clockOut }),

  adminDeletePunch: (id: number) =>
    request<{ success: boolean }>('DELETE', `/admin/punch/${id}`),

  adminAuditLog: () =>
    request<{ logs: any[] }>('GET', '/admin/audit'),
}