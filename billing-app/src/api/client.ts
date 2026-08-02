const TOKEN_KEY = 'access_token'

function getBaseUrl(): string {
  const base = import.meta.env.VITE_API_URL
  if (!base) {
    throw new Error('VITE_API_URL is not set')
  }
  return base.replace(/\/$/, '')
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(status: number, body: unknown) {
    super(`API request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

export class NetworkError extends Error {
  constructor(message = "Can't reach server, check your connection") {
    super(message)
    this.name = 'NetworkError'
  }
}

export const SESSION_EXPIRED_MESSAGE = 'Session expired, please log in again'
export const LOGIN_FLASH_KEY = 'login_flash_message'

export function setLoginFlashMessage(message: string): void {
  sessionStorage.setItem(LOGIN_FLASH_KEY, message)
}

export function consumeLoginFlashMessage(): string | null {
  const message = sessionStorage.getItem(LOGIN_FLASH_KEY)
  if (message) {
    sessionStorage.removeItem(LOGIN_FLASH_KEY)
  }
  return message
}

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown
  auth?: boolean
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, auth = true, headers: extraHeaders, ...rest } = options
  const headers = new Headers(extraHeaders)

  if (body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (auth) {
    const token = getStoredToken()
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
  }

  let response: Response
  try {
    response = await fetch(`${getBaseUrl()}${path}`, {
      ...rest,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new NetworkError()
  }

  if (!response.ok) {
    let errorBody: unknown = null
    try {
      errorBody = await response.json()
    } catch {
      errorBody = await response.text()
    }
    throw new ApiError(response.status, errorBody)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}
