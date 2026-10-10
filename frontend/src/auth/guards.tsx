import { Navigate, Outlet, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { Alert, PageLoader } from '@/components/ui/misc'
import { useProfile } from '@/hooks/queries'
import { ApiError, errorMessage } from '@/lib/api'
import { useAuth } from './AuthProvider'

export const ONBOARDING_SKIP_KEY = 'interviewos:onboarding-skipped'

/** Protects authenticated pages: requires a session and a loaded profile. Sends first-time users to onboarding. */
export function RequireAuth() {
  const { session, loading, signOut } = useAuth()
  const location = useLocation()
  const profile = useProfile(Boolean(session))

  if (loading) return <PageLoader label="Checking your session" />
  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  if (profile.isPending) return <PageLoader label="Loading your profile" />
  if (profile.isError) {
    const missing = profile.error instanceof ApiError && profile.error.code === 'profile_missing'
    return (
      <div className="mx-auto max-w-lg p-6">
        <Alert tone="error" title={missing ? 'Profile not found' : 'Could not load your profile'}>
          {missing
            ? 'Your account exists but its profile has not been created. This usually means the email address has not been verified yet.'
            : errorMessage(profile.error)}
        </Alert>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" onClick={() => profile.refetch()}>
            Try again
          </Button>
          <Button variant="ghost" onClick={() => void signOut()}>
            Log out
          </Button>
        </div>
      </div>
    )
  }

  const skipped = sessionStorage.getItem(ONBOARDING_SKIP_KEY) === '1'
  const isStudent = profile.data.profile.account_type !== 'recruiter'
  const exempt = ['/onboarding', '/invite/', '/apply/', '/invitations', '/assessment/', '/live/'].some((p) => location.pathname.startsWith(p))
  if (isStudent && !profile.data.profile.onboarding_completed && !skipped && !exempt) {
    return <Navigate to="/onboarding" replace />
  }
  return <Outlet />
}

/** Redirect signed-in users away from login/registration pages. */
export function GuestOnly() {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return <PageLoader />
  if (session) {
    const next = new URLSearchParams(location.search).get('next')
    return <Navigate to={next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'} replace />
  }
  return <Outlet />
}
