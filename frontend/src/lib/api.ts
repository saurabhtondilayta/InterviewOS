import { supabase } from './supabase'

export const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8000').replace(/\/$/, '')

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function parseError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json()
    const err = body?.error
    if (err?.message) return new ApiError(res.status, err.code ?? 'error', err.message, err.details)
  } catch {
    /* non-JSON error body */
  }
  const fallback =
    res.status === 413 ? 'The file is too large.' : res.status >= 500 ? 'The server had a problem. Please try again.' : 'Request failed.'
  return new ApiError(res.status, 'http_error', fallback)
}

let onUnauthorized: (() => void) | null = null
/** Registered by the auth provider to sign out when the backend reports an expired session. */
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

export async function request<T>(method: Method, path: string, body?: unknown, init?: { raw?: boolean }): Promise<T> {
  const headers: Record<string, string> = await authHeader()
  let payload: BodyInit | undefined
  if (body instanceof FormData) {
    payload = body
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, { method, headers, body: payload })
  } catch {
    throw new ApiError(0, 'network_error', 'Could not reach the InterviewOS server. Check your connection or that the backend is running.')
  }

  if (!res.ok) {
    const err = await parseError(res)
    if (res.status === 401 && onUnauthorized) onUnauthorized()
    throw err
  }
  if (res.status === 204) return undefined as T
  if (init?.raw) return (await res.text()) as T
  return (await res.json()) as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  del: (path: string) => request<void>('DELETE', path),
  text: (path: string) => request<string>('GET', path, undefined, { raw: true }),
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, form),
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return 'Something went wrong.'
}

export function downloadText(filename: string, content: string, type = 'text/plain') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
