import { ArrowRight, Bot, Building2, CheckCircle2, Code2, FileText, Gauge, LineChart, Mic, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router'
import { useAuth } from '@/auth/AuthProvider'
import { Logo } from '@/components/layout/Logo'
import { Button } from '@/components/ui/button'

const FEATURES = [
  { icon: FileText, title: 'Resume analysis', text: 'Upload a PDF or DOCX and get section-by-section feedback, missing skills for your target role, and stronger bullet points.' },
  { icon: Gauge, title: 'Adaptive mock interviews', text: 'Questions adapt to your answers: difficulty moves up or down and topics shift toward the areas you need most.' },
  { icon: Mic, title: 'Voice interview room', text: 'Hear each question read aloud and answer by speaking. Review your transcript before submitting, or type instead.' },
  { icon: Code2, title: 'Coding practice', text: 'Solve generated problems and get feedback on correctness, efficiency, code quality and edge cases.' },
  { icon: Building2, title: 'Company preparation', text: 'Explore real companies and roles with source links and verification dates, clearly separated from general practice.' },
  { icon: Bot, title: 'AI career coach', text: 'Ask about DSA, projects, HR rounds or anxiety, with answers grounded in your own profile and past interviews.' },
]

const STEPS = [
  { title: 'Tell us about you', text: 'Your education, skills, projects and target roles shape everything that follows.' },
  { title: 'Analyse your resume', text: 'See what to fix before a recruiter or interviewer reads it.' },
  { title: 'Practise interviews', text: 'Answer by voice or text and get rubric-based feedback after every answer.' },
  { title: 'Follow your plan', text: 'A 7- or 30-day plan built from your weak topics, with progress you can track.' },
]

export default function Landing() {
  const { session } = useAuth()
  return (
    <div className="min-h-dvh bg-white">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-2">
            {session ? (
              <Button asChild>
                <Link to="/dashboard">Open dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost">
                  <Link to="/login">Log in</Link>
                </Button>
                <Button asChild>
                  <Link to="/register">Get started</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 -z-10 h-[480px] bg-gradient-to-b from-brand-50 to-white" aria-hidden />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-white px-3 py-1 text-xs font-medium text-brand-700">
              <ShieldCheck className="size-3.5" aria-hidden /> Built for campus placements and early-career roles
            </p>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight text-ink-900 sm:text-5xl">
              Practise the interview <span className="text-brand-600">before</span> the interview.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-500">
              InterviewOS analyses your resume, runs adaptive mock interviews by voice or text, and turns every answer into a focused learning plan.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to={session ? '/dashboard' : '/register'}>
                  Start preparing <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <a href="#how-it-works">How it works</a>
              </Button>
            </div>
          </div>

          {/* Product illustration (static UI sketch, not real data) */}
          <div className="relative" aria-hidden>
            <div className="rounded-2xl border border-line bg-white p-5 shadow-pop">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-ink-400">Mock interview · Technical</span>
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">Question 3 of 8</span>
              </div>
              <p className="mt-4 text-[0.95rem] font-medium leading-relaxed text-ink-900">Explain how a database index speeds up reads, and when adding one can hurt performance.</p>
              <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-ink-500">
                <span className="mr-1 inline-block size-2 animate-pulse rounded-full bg-rose-500" />
                Your transcript appears here as you speak…
              </div>
              <div className="mt-4 grid grid-cols-5 gap-2">
                {['Relevance', 'Correctness', 'Depth', 'Clarity', 'Approach'].map((d, i) => (
                  <div key={d}>
                    <div className="h-16 rounded-md bg-slate-100">
                      <div className="h-full origin-bottom rounded-md bg-gradient-to-t from-brand-600 to-accent-500" style={{ transform: `scaleY(${[0.8, 0.65, 0.55, 0.75, 0.6][i]})` }} />
                    </div>
                    <p className="mt-1 text-center text-[0.65rem] text-ink-400">{d}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute -bottom-6 -left-6 hidden rounded-xl border border-line bg-white px-4 py-3 shadow-pop sm:block">
              <p className="text-xs text-ink-400">Next question</p>
              <p className="text-sm font-medium text-ink-900">Difficulty adjusted to 4/5</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">Everything you need to prepare, in one place</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-xl border border-line bg-white p-5 transition-shadow hover:shadow-card">
              <div className="grid size-10 place-items-center rounded-lg bg-brand-50 text-brand-600">
                <Icon className="size-5" aria-hidden />
              </div>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="grid size-8 place-items-center rounded-full bg-brand-600 text-sm font-semibold text-white">{i + 1}</span>
                <h3 className="mt-3 font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-ink-500">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Honest by design</h2>
            <p className="mt-3 text-ink-500">Feedback is only useful if you can trust where it comes from.</p>
          </div>
          <ul className="space-y-3 text-sm text-ink-700">
            {[
              'Scores come from a published rubric and are practice feedback, not a prediction of hiring outcomes.',
              'Company information shows its official source and the date it was last verified.',
              'Questions are never presented as "real" company questions unless they come from a verified source.',
              'Your data is private to your account and you can export or delete it at any time.',
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-14 flex flex-col items-center justify-between gap-4 rounded-2xl bg-ink-900 px-6 py-10 text-center sm:flex-row sm:text-left">
          <div>
            <p className="text-lg font-semibold text-white">Ready for your first mock interview?</p>
            <p className="mt-1 text-sm text-slate-300">Create an account and set up your profile in a few minutes.</p>
          </div>
          <Button asChild size="lg" variant="secondary">
            <Link to={session ? '/interview/new' : '/register'}>
              <LineChart /> Get started
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-line py-8 text-center text-xs text-ink-400">
        InterviewOS · AI-generated feedback can be wrong; always verify important information.
      </footer>
    </div>
  )
}
