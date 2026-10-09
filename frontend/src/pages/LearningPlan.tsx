import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarCheck, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { TaskCheckbox } from '@/components/TaskCheckbox'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Select, Textarea } from '@/components/ui/form'
import { AIDisclaimer, Alert, EmptyState, PageHeader, PageLoader, Progress } from '@/components/ui/misc'
import { useProfile } from '@/hooks/queries'
import { api, errorMessage } from '@/lib/api'
import { cn, formatDate } from '@/lib/utils'
import type { LearningPlan as Plan } from '@/types'

function GenerateForm({ onDone, hasPlan }: { onDone: () => void; hasPlan: boolean }) {
  const { data: profile } = useProfile()
  const defaultMinutes = profile?.profile.weekly_study_hours ? Math.max(15, Math.min(600, Math.round((profile.profile.weekly_study_hours * 60) / 7 / 15) * 15)) : 60
  const [days, setDays] = useState<7 | 30>(7)
  const [minutes, setMinutes] = useState(defaultMinutes)
  const [goals, setGoals] = useState('')
  const qc = useQueryClient()
  const gen = useMutation({
    mutationFn: () => api.post<Plan>('/api/learning-plans', { duration_days: days, daily_minutes: minutes, goals: goals.trim() || null }),
    onSuccess: (p) => {
      qc.setQueryData(['learning-plan'], p)
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      onDone()
    },
  })
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{hasPlan ? 'Generate a new plan' : 'Create your learning plan'}</CardTitle>
          <CardDescription>Built from your target roles, weak interview topics, resume gaps and available time.{hasPlan && ' Your current plan will be archived.'}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault()
            gen.mutate()
          }}
        >
          {gen.isError && <Alert tone="error" className="sm:col-span-3">{errorMessage(gen.error)}</Alert>}
          <Field label="Length" htmlFor="days">
            <Select value={days} onChange={(e) => setDays(Number(e.target.value) as 7 | 30)}>
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
            </Select>
          </Field>
          <Field label="Study time per day" htmlFor="minutes">
            <Select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              {[15, 30, 45, 60, 90, 120, 180, 240].map((m) => (
                <option key={m} value={m}>
                  {m >= 60 ? `${m / 60} hour${m > 60 ? 's' : ''}` : `${m} minutes`}
                </option>
              ))}
              {![15, 30, 45, 60, 90, 120, 180, 240].includes(minutes) && <option value={minutes}>{minutes} minutes</option>}
            </Select>
          </Field>
          <div className="flex items-end">
            <Button type="submit" className="w-full" loading={gen.isPending}>
              <Sparkles /> {gen.isPending ? 'Generating…' : 'Generate plan'}
            </Button>
          </div>
          <Field label="Goals (optional)" htmlFor="goals" hint="e.g. Clear Infosys and Accenture campus rounds in November; get comfortable with SQL joins." className="sm:col-span-3">
            <Textarea value={goals} onChange={(e) => setGoals(e.target.value)} rows={2} maxLength={1000} />
          </Field>
        </form>
      </CardContent>
    </Card>
  )
}

export default function LearningPlan() {
  const { data: plan, isPending, isError, error } = useQuery({ queryKey: ['learning-plan'], queryFn: () => api.get<Plan | null>('/api/learning-plans/active') })
  const [showForm, setShowForm] = useState(false)

  if (isPending) return <PageLoader />
  const byDay = new Map<number, Plan['learning_plan_tasks']>()
  plan?.learning_plan_tasks.forEach((t) => byDay.set(t.day_number, [...(byDay.get(t.day_number) ?? []), t]))
  const today = plan ? Math.floor((Date.now() - new Date(plan.start_date).getTime()) / 86400000) + 1 : 0

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Learning plan"
        description="A day-by-day preparation plan. Tick tasks off as you go."
        actions={plan && !showForm ? <Button variant="secondary" onClick={() => setShowForm(true)}>New plan</Button> : undefined}
      />
      {isError && <Alert tone="error">{errorMessage(error)}</Alert>}
      {(!plan || showForm) && <GenerateForm hasPlan={Boolean(plan)} onDone={() => setShowForm(false)} />}
      {!plan && !isError && <EmptyState icon={CalendarCheck} title="No active plan yet" description="Generate a plan above. Completing a mock interview first makes it more personalised." />}

      {plan && (
        <>
          <Card>
            <CardContent className="pt-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{plan.title}</h2>
                  <p className="text-sm text-ink-500">
                    {plan.duration_days} days · {plan.daily_minutes} min/day · started {formatDate(plan.start_date)}
                  </p>
                </div>
                <div className="w-full sm:w-64">
                  <div className="flex justify-between text-sm">
                    <span>Progress</span>
                    <span className="tabular-nums">
                      {plan.progress.completed}/{plan.progress.total} · {plan.progress.percent}%
                    </span>
                  </div>
                  <Progress value={plan.progress.percent} className="mt-1.5" label="Plan progress" />
                </div>
              </div>
              {plan.overview && <p className="mt-4 text-sm leading-relaxed text-ink-700">{plan.overview}</p>}
              <AIDisclaimer className="mt-3" text="AI-generated plan. Adjust it to your own schedule and verify any resources before using them." />
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[...byDay.entries()].map(([day, tasks]) => {
              const done = tasks.every((t) => t.completed_at)
              return (
                <Card key={day} className={cn(day === today && 'ring-2 ring-brand-300')}>
                  <CardHeader className="pb-0">
                    <CardTitle className="flex items-center gap-2">
                      Day {day}
                      {day === today && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[0.65rem] font-medium text-white">Today</span>}
                      {done && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[0.65rem] font-medium text-emerald-700">Done</span>}
                    </CardTitle>
                    <span className="text-xs text-ink-400">{tasks.reduce((s, t) => s + (t.estimated_minutes ?? 0), 0)} min</span>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <ul>
                      {tasks.map((t) => (
                        <li key={t.id}>
                          <TaskCheckbox task={t} showDescription />
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
