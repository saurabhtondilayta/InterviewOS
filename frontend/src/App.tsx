import { lazy, Suspense } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router'
import { GuestOnly, RequireAuth } from '@/auth/guards'
import { CoachWidget } from '@/components/coach/CoachWidget'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { PageLoader } from '@/components/ui/misc'
import Landing from '@/pages/Landing'

const Register = lazy(() => import('@/pages/auth/Register'))
const VerifyEmail = lazy(() => import('@/pages/auth/VerifyEmail'))
const Login = lazy(() => import('@/pages/auth/Login'))
const ForgotPassword = lazy(() => import('@/pages/auth/ForgotPassword'))
const Onboarding = lazy(() => import('@/pages/Onboarding'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const ResumePage = lazy(() => import('@/pages/resume/ResumePage'))
const ResumeAnalysisPage = lazy(() => import('@/pages/resume/ResumeAnalysisPage'))
const CompanyExplorer = lazy(() => import('@/pages/companies/CompanyExplorer'))
const CompanyDetail = lazy(() => import('@/pages/companies/CompanyDetail'))
const InterviewSetup = lazy(() => import('@/pages/interview/InterviewSetup'))
const InterviewRoom = lazy(() => import('@/pages/interview/InterviewRoom'))
const InterviewResults = lazy(() => import('@/pages/interview/InterviewResults'))
const CodingPractice = lazy(() => import('@/pages/CodingPractice'))
const Coach = lazy(() => import('@/pages/Coach'))
const LearningPlan = lazy(() => import('@/pages/LearningPlan'))
const History = lazy(() => import('@/pages/History'))
const Settings = lazy(() => import('@/pages/Settings'))

/** Floating coach on the dashboard and preparation pages (not inside the interview room or the coach page itself). */
function CoachWidgetHost() {
  const { pathname } = useLocation()
  const show = ['/dashboard', '/interview/new', '/companies', '/resume', '/learning', '/history'].some((p) => pathname.startsWith(p))
  return show ? <CoachWidget /> : null
}

function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="text-sm font-medium text-brand-600">404</p>
      <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
      <p className="mt-1 text-sm text-ink-500">The page you’re looking for doesn’t exist or has moved.</p>
      <Button asChild className="mt-6">
        <Link to="/">Go home</Link>
      </Button>
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route element={<GuestOnly />}>
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
        </Route>
        {/* Not guest-only: verifying a code creates a session mid-flow. */}
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        <Route element={<RequireAuth />}>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route
            element={
              <>
                <AppShell />
                <CoachWidgetHost />
              </>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/resume" element={<ResumePage />} />
            <Route path="/resume/analysis/:id" element={<ResumeAnalysisPage />} />
            <Route path="/companies" element={<CompanyExplorer />} />
            <Route path="/companies/:slug" element={<CompanyDetail />} />
            <Route path="/interview/new" element={<InterviewSetup />} />
            <Route path="/interview/:id" element={<InterviewRoom />} />
            <Route path="/interview/:id/results" element={<InterviewResults />} />
            <Route path="/coding" element={<CodingPractice />} />
            <Route path="/coach" element={<Coach />} />
            <Route path="/learning" element={<LearningPlan />} />
            <Route path="/history" element={<History />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}
