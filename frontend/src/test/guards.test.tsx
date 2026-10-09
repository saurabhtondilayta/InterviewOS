import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const authState = { session: null as null | { access_token: string }, loading: false, signOut: vi.fn() }
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => authState }))

const profileState: { data?: unknown; isPending: boolean; isError: boolean; error?: unknown; refetch: () => void } = { isPending: false, isError: false, refetch: vi.fn() }
vi.mock('@/hooks/queries', () => ({ useProfile: () => profileState }))

import { GuestOnly, RequireAuth } from '@/auth/guards'

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<GuestOnly />}>
            <Route path="/login" element={<p>login page</p>} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route path="/dashboard" element={<p>dashboard page</p>} />
            <Route path="/onboarding" element={<p>onboarding page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const profile = (onboarding_completed: boolean) => ({ profile: { onboarding_completed, full_name: 'Test User' }, skills: [], completion: { percent: 50, missing: [] }, is_admin: false })

describe('route guards', () => {
  beforeEach(() => {
    sessionStorage.clear()
    authState.session = null
    authState.loading = false
    Object.assign(profileState, { data: undefined, isPending: false, isError: false })
  })

  it('redirects anonymous users from protected pages to login', () => {
    renderAt('/dashboard')
    expect(screen.getByText('login page')).toBeInTheDocument()
  })

  it('shows protected pages to signed-in users who finished onboarding', () => {
    authState.session = { access_token: 't' }
    profileState.data = profile(true)
    renderAt('/dashboard')
    expect(screen.getByText('dashboard page')).toBeInTheDocument()
  })

  it('sends first-time users to onboarding', () => {
    authState.session = { access_token: 't' }
    profileState.data = profile(false)
    renderAt('/dashboard')
    expect(screen.getByText('onboarding page')).toBeInTheDocument()
  })

  it('lets users who skipped onboarding reach the dashboard', () => {
    sessionStorage.setItem('interviewos:onboarding-skipped', '1')
    authState.session = { access_token: 't' }
    profileState.data = profile(false)
    renderAt('/dashboard')
    expect(screen.getByText('dashboard page')).toBeInTheDocument()
  })

  it('redirects signed-in users away from login', () => {
    authState.session = { access_token: 't' }
    profileState.data = profile(true)
    renderAt('/login')
    expect(screen.getByText('dashboard page')).toBeInTheDocument()
  })

  it('shows a clear message when the profile is missing', async () => {
    const { ApiError } = await import('@/lib/api')
    authState.session = { access_token: 't' }
    Object.assign(profileState, { isError: true, error: new ApiError(404, 'profile_missing', 'missing') })
    renderAt('/dashboard')
    expect(screen.getByText('Profile not found')).toBeInTheDocument()
  })
})
