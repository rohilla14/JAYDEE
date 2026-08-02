import { apiRequest, setStoredToken } from './client'

export type TokenResponse = {
  access_token: string
  token_type: string
}

export async function login(phone: string, password: string): Promise<TokenResponse> {
  const token = await apiRequest<TokenResponse>('/auth/login', {
    method: 'POST',
    auth: false,
    body: { phone, password },
  })
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
    if (typeof detail === 'object' && detail !== null) {
      const obj = detail as { message?: unknown; shortages?: unknown }
      if (typeof obj.message === 'string') {
        const shortages = Array.isArray(obj.shortages)
          ? ` ${obj.shortages.join('; ')}`
          : ''
        return `${obj.message}${shortages}`
      }
      return JSON.stringify(detail)
    }
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Something went wrong'
}
