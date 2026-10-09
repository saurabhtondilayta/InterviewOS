import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 'user-token' } } })) } },
}))

import { api, ApiError, setUnauthorizedHandler } from '@/lib/api'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('api client', () => {
  const fetchMock = vi.fn()
  beforeEach(() => vi.stubGlobal('fetch', fetchMock))
  afterEach(() => {
    fetchMock.mockReset()
    vi.unstubAllGlobals()
  })

  it('sends the Supabase access token as a bearer token', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }))
    await api.get('/api/profile')
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer user-token')
  })

  it('surfaces structured backend errors', async () => {
    fetchMock.mockResolvedValueOnce(json(429, { error: { code: 'rate_limited', message: 'Slow down' } }))
    await expect(api.post('/api/chat/messages', { content: 'hi' })).rejects.toMatchObject({ status: 429, code: 'rate_limited', message: 'Slow down' })
  })

  it('calls the unauthorized handler on 401', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    fetchMock.mockResolvedValueOnce(json(401, { error: { code: 'session_expired', message: 'expired' } }))
    await expect(api.get('/api/dashboard')).rejects.toBeInstanceOf(ApiError)
    expect(handler).toHaveBeenCalledOnce()
  })

  it('reports network failures clearly', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(api.get('/api/dashboard')).rejects.toMatchObject({ code: 'network_error' })
  })

  it('does not set JSON content type for uploads', async () => {
    fetchMock.mockResolvedValueOnce(json(201, { id: 'r1' }))
    const form = new FormData()
    form.append('file', new Blob(['x']), 'cv.pdf')
    await api.upload('/api/resumes', form)
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers['Content-Type']).toBeUndefined()
    expect(init.body).toBe(form)
  })

  it('handles 204 responses', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await expect(api.del('/api/resumes/1')).resolves.toBeUndefined()
  })
})
