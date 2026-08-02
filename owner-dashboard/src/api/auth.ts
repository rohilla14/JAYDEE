import { apiRequest, clearStoredToken, setStoredToken } from './client'

export type TokenResponse = {
  access_token: string
  token_type: string
}

export type JwtPayload = {
  sub: string
  role: string
  exp: number
}

export function decodeTokenPayload(token: string): JwtPayload | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) {
      return null
    }
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(normalized)
    return JSON.parse(json) as JwtPayload
  } catch {
    return null
  }
}

export function getStoredRole(): string | null {
  const token = localStorage.getItem('access_token')
  if (!token) {
    return null
  }
  return decodeTokenPayload(token)?.role ?? null
}

export async function login(phone: string, password: string): Promise<TokenResponse> {
  const token = await apiRequest<TokenResponse>('/auth/login', {
    method: 'POST',
    auth: false,
    body: { phone, password },
  })

  const payload = decodeTokenPayload(token.access_token)
  if (payload?.role !== 'owner') {
    clearStoredToken()
    throw new Error('Owner access only — this account cannot open the dashboard')
  }

  setStoredToken(token.access_token)
  return token
}

export function getApiErrorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: unknown }).name === 'NetworkError' &&
    error instanceof Error
  ) {
    return error.message
  }
  if (
    error instanceof TypeError ||
    (error instanceof Error &&
      (/failed to fetch|networkerror|load failed/i.test(error.message) ||
        error.message === 'NetworkError when attempting to fetch resource.'))
  ) {
    return "Can't reach server, check your connection"
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'body' in error &&
    typeof (error as { body: unknown }).body === 'object' &&
    (error as { body: unknown }).body !== null
  ) {
    const body = (error as { body: { detail?: unknown } }).body
    const detail = body.detail
    if (typeof detail === 'string') {
      return detail
    }
    if (Array.isArray(detail)) {
      return detail
        .map((item) => {
          if (typeof item === 'object' && item !== null && 'msg' in item) {
            return String((item as { msg: unknown }).msg)
          }
          return JSON.stringify(item)
        })
        .join(', ')
    }
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Something went wrong'
}
