import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Bookmark, Building2, CalendarCheck, FileText, Mic, Sparkles, Target, TrendingDown, TrendingUp } from 'lucide-react'
import { Link } from 'react-router'
import { TaskCheckbox } from '@/components/TaskCheckbox'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, Badge, EmptyState, PageLoader, Progress, ScorePill } from '@/components/ui/misc'
import { useProfile } from '@/hooks/queries'
import { api, errorMessage } from '@/lib/api'
import { formatDate, INTERVIEW_TYPE_LABELS, relativeTime, titleCase } from '@/lib/utils'
import type { DashboardData } from '@/types'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function Dashboard() {
  const { data: profileData } = useProfile()
  const { data, isPending, isError, error, refetch } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<DashboardData>('/api/dashboard') })

  if (!profileData) return <PageLoader />
  const p = profileData.profile
  const target = p.target_roles[0] ?? p.preferred_role

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting()}, {p.full_name.split(' ')[0]}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {[p.degree, p.branch].filter(Boolean).join(' · ')}
            {p.graduation_year ? ` · Class of ${p.graduation_year}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="secondary">
            <Link to="/resume">
              <FileText /> Analyse resume
            </Link>
          </Button>
          <Button asChild>
            <Link to="/interview/new">
              <Mic /> Start mock interview
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Profile completion</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{profileData.completion.percent}%</p>
            <Progress value={profileData.completion.percent} className="mt-3" label="Profile completion" />
            {profileData.completion.percent < 100 && (
              <Link to="/settings" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                Add {profileData.completion.missing.slice(0, 2).map(titleCase).join(', ').toLowerCase()} <ArrowRight className="size-3" />
              </Link>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Current target role</p>
            {target ? (
              <>
                <p className="mt-2 flex items-center gap-2 text-lg font-semibold">
                  <Target className="size-5 text-brand-600" aria-hidden /> {target}
                </p>
                <p className="mt-2 text-xs text-ink-500">{p.preferred_companies.length ? `Interested in ${p.preferred_companies.slice(0, 3).join(', ')}` : 'No preferred companies yet'}</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-500">
                No target role yet.{' '}
                <Link to="/settings" className="font-medium text-brand-600 hover:underline">
                  Add one
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Mock interviews completed</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{data ? data.interviews_completed : '—'}</p>
            <Link to="/history" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
              View history <ArrowRight className="size-3" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {isPending && <PageLoader label="Loading your progress" />}
      {isError && (
        <Alert tone="error" title="Could not load your dashboard" action={<Button size="sm" variant="secondary" onClick={() => refetch()}>Retry</Button>}>
          {errorMessage(error)}
        </Alert>
      )}

      {data && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Recent interview scores</CardTitle>
                  <CardDescription>Practice scores on a 0–10 rubric. Compare only interviews of the same type.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {data.recent_scores.length === 0 ? (
                  <EmptyState icon={Mic} title="Complete your first mock interview to see your progress." action={<Button asChild size="sm"><Link to="/interview/new">Start an interview</Link></Button>} />
                ) : (
                  <ul className="divide-y divide-line">
                    {data.recent_scores.slice(0, 6).map((r) => (
                      <li key={r.session_id}>
                        <Link to={`/interview/${r.session_id}/results`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{r.role_title}</p>
                            <p className="text-xs text-ink-500">
                              {INTERVIEW_TYPE_LABELS[r.interview_type]} · {formatDate(r.created_at)}
                            </p>
                          </div>
                          <ScorePill score={r.overall_score} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-6 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="size-4 text-emerald-600" aria-hidden /> Strongest topics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.strongest_topics.length ? (
                    <ul className="space-y-2">
                      {data.strongest_topics.map((t) => (
                        <li key={t.topic} className="flex items-center justify-between text-sm">
                          <span>{t.topic}</span>
                          <ScorePill score={t.average} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-ink-500">Topics where you average 7/10 or more will appear here.</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingDown className="size-4 text-rose-600" aria-hidden /> Topics to strengthen
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.weakest_topics.length ? (
                    <ul className="space-y-2">
                      {data.weakest_topics.map((t) => (
                        <li key={t.topic} className="flex items-center justify-between text-sm">
                          <span>{t.topic}</span>
                          <ScorePill score={t.average} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-ink-500">Topics where you average below 6/10 will appear here.</p>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarCheck className="size-4 text-brand-600" aria-hidden /> Learning plan
                </CardTitle>
                {data.learning_plan && (
                  <Button asChild variant="link" size="sm">
                    <Link to="/learning">Open plan</Link>
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {!data.learning_plan ? (
                  <EmptyState
                    icon={CalendarCheck}
                    title="No active learning plan"
                    description="Generate a 7- or 30-day plan from your goals, weak topics and available study time."
                    action={<Button asChild size="sm"><Link to="/learning">Create a plan</Link></Button>}
                  />
                ) : (
                  <div className="space-y-5">
                    <div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{data.learning_plan.title}</span>
                        <span className="tabular-nums text-ink-500">
                          {data.learning_plan.progress.completed}/{data.learning_plan.progress.total} tasks
                        </span>
                      </div>
                      <Progress value={(data.learning_plan.progress.completed / Math.max(1, data.learning_plan.progress.total)) * 100} className="mt-2" label="Plan progress" />
                    </div>
                    <div className="grid grid-cols-7 gap-1.5" aria-label="This week">
                      {data.learning_plan.week.map((d) => (
                        <div key={d.day} className="rounded-md border border-line p-2 text-center">
                          <p className="text-[0.65rem] uppercase text-ink-400">Day {d.day}</p>
                          <p className="text-sm font-semibold tabular-nums">
                            {d.completed}/{d.total}
                          </p>
                          <p className="text-[0.65rem] text-ink-400">{d.minutes}m</p>
                        </div>
                      ))}
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">Upcoming tasks</p>
                      {data.learning_plan.upcoming.length ? (
                        <ul className="space-y-1">
                          {data.learning_plan.upcoming.map((t) => (
                            <li key={t.id}>
                              <TaskCheckbox task={t} />
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-emerald-700">All tasks completed. Great work!</p>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Resume analysis</CardTitle>
              </CardHeader>
              <CardContent>
                {data.latest_resume_analysis ? (
                  <Link to={`/resume/analysis/${data.latest_resume_analysis.id}`} className="block rounded-lg border border-line p-3 hover:bg-slate-50">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{data.latest_resume_analysis.target_role}</span>
                      <ScorePill score={data.latest_resume_analysis.overall_score} max={100} />
                    </div>
                    <p className="mt-1 text-xs text-ink-500">Analysed {relativeTime(data.latest_resume_analysis.created_at)}</p>
                  </Link>
                ) : (
                  <EmptyState icon={FileText} title="No resume analysed yet" action={<Button asChild size="sm" variant="secondary"><Link to="/resume">Upload resume</Link></Button>} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="size-4 text-accent-500" aria-hidden /> Recommended practice
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.recommended_topics.length ? (
                  <ul className="space-y-2.5">
                    {data.recommended_topics.map((r) => (
                      <li key={r.topic}>
                        <Link to={`/interview/new?topic=${encodeURIComponent(r.topic)}`} className="group block">
                          <p className="text-sm font-medium group-hover:text-brand-700">{r.topic}</p>
                          <p className="text-xs text-ink-500">{r.reason}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-ink-500">Recommendations appear after a resume analysis or a mock interview.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bookmark className="size-4 text-brand-600" aria-hidden /> Saved targets
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.saved_jobs.length ? (
                  <ul className="space-y-2">
                    {data.saved_jobs.map((s) => (
                      <li key={s.id} className="text-sm">
                        <p className="font-medium">{s.job_listings?.title ?? s.job_roles?.title ?? 'Company'}</p>
                        {s.companies && (
                          <Link to={`/companies/${s.companies.slug}`} className="text-xs text-brand-600 hover:underline">
                            {s.companies.name}
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState icon={Building2} title="Nothing saved yet" action={<Button asChild size="sm" variant="secondary"><Link to="/companies">Explore companies</Link></Button>} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent activity</CardTitle>
              </CardHeader>
              <CardContent>
                {data.recent_activity.length ? (
                  <ul className="space-y-3">
                    {data.recent_activity.map((a) => (
                      <li key={`${a.type}-${a.id}`} className="flex items-start justify-between gap-2 text-sm">
                        <Link to={a.type === 'interview' ? (a.status === 'completed' ? `/interview/${a.id}/results` : `/interview/${a.id}`) : `/resume/analysis/${a.id}`} className="min-w-0 hover:text-brand-700">
                          <p className="truncate">{a.label}</p>
                          <p className="text-xs text-ink-400">{relativeTime(a.at)}</p>
                        </Link>
                        <Badge tone={a.status === 'completed' ? 'success' : a.status === 'in_progress' ? 'brand' : 'neutral'}>{titleCase(a.status)}</Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-ink-500">Your activity will show up here.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
