import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ONBOARDING_SKIP_KEY } from '@/auth/guards'
import { Logo } from '@/components/layout/Logo'
import { SECTIONS, SectionForm } from '@/components/profile/ProfileSections'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageLoader, Progress } from '@/components/ui/misc'
import { useProfile } from '@/hooks/queries'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { ProfilePayload } from '@/types'

export default function Onboarding() {
  const { data } = useProfile()
  const [step, setStep] = useState(0)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const finish = useMutation({
    mutationFn: () => api.patch<ProfilePayload>('/api/profile', { onboarding_completed: true }),
    onSuccess: (d) => {
      qc.setQueryData(['profile'], d)
      navigate('/dashboard', { replace: true })
    },
  })

  if (!data) return <PageLoader />
  const section = SECTIONS[step]
  const last = step === SECTIONS.length - 1

  return (
    <div className="min-h-dvh bg-surface">
      <header className="flex items-center justify-between border-b border-line bg-white px-6 py-4">
        <Logo to="/onboarding" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            sessionStorage.setItem(ONBOARDING_SKIP_KEY, '1')
            navigate('/dashboard')
          }}
        >
          Finish later
        </Button>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, {data.profile.full_name.split(' ')[0]}. Let’s personalise your preparation.</h1>
        <p className="mt-1 text-sm text-ink-500">Your answers shape the questions you get, your resume feedback and your learning plan. Nothing is guessed — anything you skip simply won’t be used.</p>

        <div className="mt-6">
          <Progress value={((step + 1) / SECTIONS.length) * 100} label="Onboarding progress" />
          <ol className="mt-4 flex flex-wrap gap-2">
            {SECTIONS.map((s, i) => (
              <li key={s.key}>
                <button
                  onClick={() => setStep(i)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
                    i === step ? 'bg-brand-600 text-white' : i < step ? 'bg-brand-50 text-brand-700' : 'bg-white text-ink-500 ring-1 ring-line',
                  )}
                  aria-current={i === step ? 'step' : undefined}
                >
                  {i < step && <Check className="size-3" aria-hidden />}
                  {s.label}
                </button>
              </li>
            ))}
          </ol>
        </div>

        <Card className="mt-6">
          <CardContent className="pt-5">
            <h2 className="font-semibold">{section.label}</h2>
            <p className="mb-5 mt-0.5 text-sm text-ink-500">{section.description}</p>
            <SectionForm key={section.key} section={section.key} data={data} submitLabel={last ? 'Save' : 'Save and continue'} onSaved={() => !last && setStep(step + 1)} />
          </CardContent>
        </Card>

        <div className="mt-6 flex justify-between">
          <Button variant="ghost" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
            Back
          </Button>
          {last ? (
            <Button onClick={() => finish.mutate()} loading={finish.isPending}>
              Finish setup
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setStep(step + 1)}>
              Skip this step
            </Button>
          )}
        </div>
      </main>
    </div>
  )
}
