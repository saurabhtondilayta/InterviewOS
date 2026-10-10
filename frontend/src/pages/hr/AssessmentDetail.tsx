import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, Copy, Send, UserPlus, Video } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Textarea } from '@/components/ui/form'
import { Alert, Badge, EmptyState, PageLoader, ScorePill } from '@/components/ui/misc'
import { api, errorMessage } from '@/lib/api'
import { cn, formatDateTime, INTERVIEW_TYPE_LABELS, titleCase } from '@/lib/utils'
import type { Assessment, InvitationRow } from '@/types'

const STATUS_TONE: Record<string, 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'violet'> = {
  invited: 'neutral',
  accepted: 'brand',
  in_progress: 'violet',
  completed: 'success',
  declined: 'danger',
  cancelled: 'neutral',
}
const DECISION_TONE: Record<string, 'neutral' | 'brand' | 'success' | 'danger'> = { pending: 'neutral', shortlisted: 'brand', hired: 'success', rejected: 'danger' }

function CopyLink({ value }: { value: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setDone(true)
        setTimeout(() => setDone(false), 1500)
      }}
      className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs hover:bg-slate-50"
    >
      {done ? <Check className="size-3" /> : <Copy className="size-3" />} {done ? 'Copied' : 'Copy link'}
    </button>
  )
}

export default function AssessmentDetail() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['assessment', id],
    queryFn: () => api.get<{ assessment: Assessment; invitations: InvitationRow[] }>(`/api/org/assessments/${id}`),
    refetchInterval: 20000,
  })
  const [emails, setEmails] = useState('')
  const [when, setWhen] = useState('')
  const [inviteResult, setInviteResult] = useState<{ created: number; emails_sent: number; email_configured: boolean; links: { email: string; link: string }[] } | null>(null)

  const invite = useMutation({
    mutationFn: () =>
      api.post<typeof inviteResult>(`/api/org/assessments/${id}/invitations`, {
        emails: emails.split(/[\s,;]+/).filter(Boolean),
        scheduled_at: when ? new Date(when).toISOString() : null,
      }),
    onSuccess: (r) => {
      setInviteResult(r)
      setEmails('')
      qc.invalidateQueries({ queryKey: ['assessment', id] })
      toast.success(`${r?.created ?? 0} candidate(s) invited`)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const update = useMutation({
    mutationFn: (changes: Partial<Assessment>) => api.patch(`/api/org/assessments/${id}`, changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessment', id] }),
    onError: (e) => toast.error(errorMessage(e)),
  })

  if (isPending) return <PageLoader />
  if (isError) return <Alert tone="error">{errorMessage(error)}</Alert>
  const { assessment: a, invitations } = data

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link to="/hr" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
            <ArrowLeft className="size-4" /> Hiring dashboard
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{a.title}</h1>
          <div className="mt-1 flex flex-wrap gap-2 text-xs">
            <Badge tone="brand">{a.mode === 'live' ? 'Live 1-on-1 video' : `AI interview · ${INTERVIEW_TYPE_LABELS[a.interview_type]}`}</Badge>
            <Badge>{a.role_title}</Badge>
            <Badge>{a.duration_minutes} min</Badge>
            {a.proctoring_enabled && <Badge tone="violet">Proctoring on</Badge>}
            <Badge tone={a.status === 'open' ? 'success' : 'neutral'}>{a.status === 'open' ? 'Open' : 'Closed'}</Badge>
          </div>
        </div>
        <Button variant="secondary" onClick={() => update.mutate({ status: a.status === 'open' ? 'closed' : 'open' })} loading={update.isPending}>
          {a.status === 'open' ? 'Close assessment' : 'Reopen assessment'}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="size-4" aria-hidden /> Invite candidates
                </CardTitle>
                <CardDescription>Candidates sign in (or sign up as students) with the invited email to open the invitation.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  invite.mutate()
                }}
              >
                <Field label="Email addresses" htmlFor="emails" hint="One per line, or separated by commas.">
                  <Textarea value={emails} onChange={(e) => setEmails(e.target.value)} rows={4} placeholder={'priya@college.edu\nrahul@gmail.com'} />
                </Field>
                {a.mode === 'live' && (
                  <Field label="Interview date and time" htmlFor="when" hint="In your local time zone.">
                    <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
                  </Field>
                )}
                <Button type="submit" loading={invite.isPending} disabled={!emails.trim() || a.status !== 'open'}>
                  <Send /> Send invitations
                </Button>
              </form>
              {inviteResult && (
                <Alert tone={inviteResult.emails_sent ? 'success' : 'info'} className="mt-4" title={`${inviteResult.created} invited · ${inviteResult.emails_sent} emails sent`}>
                  {!inviteResult.email_configured && <p className="mb-2">Email sending isn’t configured, so share these links (candidates also see invitations in their dashboard):</p>}
                  <ul className="space-y-1">
                    {inviteResult.links.map((l) => (
                      <li key={l.email} className="flex items-center justify-between gap-2">
                        <span className="truncate">{l.email}</span> <CopyLink value={l.link} />
                      </li>
                    ))}
                  </ul>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Open application link</CardTitle>
                <CardDescription>For campus drives: anyone with the link can apply after signing in as a student.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={a.accepting_applications} onChange={(e) => update.mutate({ accepting_applications: e.target.checked })} /> Accept applications through a link
              </label>
              {a.accepting_applications && a.apply_link && (
                <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-2">
                  <code className="min-w-0 flex-1 truncate text-xs">{a.apply_link}</code>
                  <CopyLink value={a.apply_link} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Candidates ({invitations.length})</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0 pb-2">
            {invitations.length === 0 ? (
              <div className="p-5">
                <EmptyState icon={UserPlus} title="No candidates yet" description="Invite candidates by email or turn on the application link." />
              </div>
            ) : (
              <table className="w-full min-w-[600px] text-sm">
                <thead className="border-b border-line bg-slate-50 text-left text-xs uppercase tracking-wide text-ink-400">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Candidate</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    {a.mode === 'ai' && <th className="px-4 py-2.5 font-medium">AI score</th>}
                    {a.proctoring_enabled && <th className="px-4 py-2.5 font-medium">Integrity</th>}
                    <th className="px-4 py-2.5 font-medium">Decision</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {invitations.map((i) => (
                    <tr key={i.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <Link to={`/hr/candidates/${i.id}`} className="font-medium hover:text-brand-700">
                          {i.candidate_name ?? i.candidate_email}
                        </Link>
                        <p className="text-xs text-ink-500">{i.candidate_name ? i.candidate_email : 'No account yet'}{i.scheduled_at ? ` · ${formatDateTime(i.scheduled_at)}` : ''}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={STATUS_TONE[i.status]}>{titleCase(i.status)}</Badge>
                      </td>
                      {a.mode === 'ai' && (
                        <td className="px-4 py-2.5">
                          <ScorePill score={i.ai_score} />
                        </td>
                      )}
                      {a.proctoring_enabled && (
                        <td className="px-4 py-2.5">
                          {i.integrity_score == null ? <span className="text-ink-400">—</span> : <span className={cn('font-semibold tabular-nums', i.integrity_score >= 85 ? 'text-emerald-600' : i.integrity_score >= 60 ? 'text-amber-600' : 'text-rose-600')}>{Math.round(i.integrity_score)}/100</span>}
                        </td>
                      )}
                      <td className="px-4 py-2.5">
                        <Badge tone={DECISION_TONE[i.decision]}>{titleCase(i.decision)}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {a.mode === 'live' && ['accepted', 'in_progress'].includes(i.status) ? (
                          <Button asChild size="sm">
                            <Link to={`/hr/live/${i.id}`}>
                              <Video /> Join
                            </Link>
                          </Button>
                        ) : (
                          <Button asChild size="sm" variant="ghost">
                            <Link to={`/hr/candidates/${i.id}`}>Review</Link>
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
