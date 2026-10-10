import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink, FileText, ScanFace, Video } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { PROCTOR_LABELS } from '@/components/hiring/media'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/form'
import { Alert, Badge, EmptyState, PageLoader, ScorePill } from '@/components/ui/misc'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api, errorMessage } from '@/lib/api'
import { cn, formatDateTime, titleCase } from '@/lib/utils'
import type { CandidateReport as Report, Decision } from '@/types'

const DECISIONS: { value: Decision; label: string; tone: string }[] = [
  { value: 'pending', label: 'Pending', tone: 'border-line' },
  { value: 'shortlisted', label: 'Shortlist', tone: 'border-brand-400 bg-brand-50 text-brand-700' },
  { value: 'hired', label: 'Hire', tone: 'border-emerald-400 bg-emerald-50 text-emerald-700' },
  { value: 'rejected', label: 'Reject', tone: 'border-rose-300 bg-rose-50 text-rose-700' },
]

function IntegrityCard({ r }: { r: Report }) {
  const p = r.proctoring
  if (!p.enabled) return <p className="text-sm text-ink-500">Proctoring was off for this assessment.</p>
  if (p.integrity_score == null) return <p className="text-sm text-ink-500">No proctoring data yet — the candidate hasn’t started.</p>
  const s = p.integrity_score
  return (
    <div>
      <p className={cn('text-4xl font-semibold tabular-nums', s >= 85 ? 'text-emerald-600' : s >= 60 ? 'text-amber-600' : 'text-rose-600')}>
        {Math.round(s)}
        <span className="text-lg text-ink-400">/100</span>
      </p>
      <p className="mt-1 text-sm font-medium">{p.summary.verdict}</p>
      <p className="mt-1 text-xs text-ink-500">{p.summary.note ?? 'Automated signals for human review. They are not proof of misconduct.'}</p>
    </div>
  )
}

export default function CandidateReport() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { data: r, isPending, isError, error } = useQuery({ queryKey: ['candidate', id], queryFn: () => api.get<Report>(`/api/org/invitations/${id}`) })
  const [notes, setNotes] = useState('')
  useEffect(() => setNotes(r?.invitation.hr_notes ?? ''), [r?.invitation.hr_notes])

  const save = useMutation({
    mutationFn: (changes: { decision?: Decision; hr_notes?: string }) => api.patch<Report>(`/api/org/invitations/${id}`, changes),
    onSuccess: (d) => {
      qc.setQueryData(['candidate', id], d)
      qc.invalidateQueries({ queryKey: ['assessment'] })
      toast.success('Saved')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  if (isPending) return <PageLoader />
  if (isError) return <Alert tone="error">{errorMessage(error)}</Alert>
  const inv = r.invitation
  const name = r.candidate?.full_name ?? inv.candidate_email
  const visualEvents = r.proctoring.events.filter((e) => e.snapshot_url)
  const flags = r.proctoring.events.filter((e) => e.severity > 0)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link to={`/hr/assessments/${r.assessment.id}`} className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
            <ArrowLeft className="size-4" /> {r.assessment.title}
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{name}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {inv.candidate_email} · {titleCase(inv.status)}
            {inv.completed_at ? ` · completed ${formatDateTime(inv.completed_at)}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {r.assessment.mode === 'live' && ['accepted', 'in_progress'].includes(inv.status) && (
            <Button asChild>
              <Link to={`/hr/live/${inv.id}`}>
                <Video /> Join live interview
              </Link>
            </Button>
          )}
          <div className="flex gap-1 rounded-lg border border-line bg-white p-1" role="radiogroup" aria-label="Decision">
            {DECISIONS.map((d) => (
              <button key={d.value} role="radio" aria-checked={inv.decision === d.value} onClick={() => save.mutate({ decision: d.value })} className={cn('rounded-md border px-3 py-1.5 text-xs font-medium', inv.decision === d.value ? d.tone : 'border-transparent text-ink-500 hover:bg-slate-50')}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {r.assessment.mode === 'ai' && <TabsTrigger value="interview">AI interview</TabsTrigger>}
          {r.assessment.mode === 'live' && <TabsTrigger value="live">Live interview</TabsTrigger>}
          {r.proctoring.enabled && <TabsTrigger value="proctoring">Proctoring ({flags.length})</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Candidate</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {r.candidate ? (
                  <>
                    <p>{[r.candidate.degree, r.candidate.branch].filter(Boolean).join(', ') || '—'}</p>
                    <p className="text-ink-500">{r.candidate.college ?? ''}{r.candidate.graduation_year ? ` · class of ${r.candidate.graduation_year}` : ''}</p>
                    {r.candidate.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {r.candidate.skills.slice(0, 16).map((s) => (
                          <Badge key={s}>{s}</Badge>
                        ))}
                      </div>
                    )}
                    {r.resume ? (
                      r.resume.url ? (
                        <a href={r.resume.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 pt-2 font-medium text-brand-600 hover:underline">
                          <FileText className="size-4" /> {r.resume.filename} <ExternalLink className="size-3" />
                        </a>
                      ) : null
                    ) : (
                      <p className="pt-2 text-xs text-ink-500">{inv.share_resume ? 'No resume uploaded.' : 'The candidate did not share their resume.'}</p>
                    )}
                  </>
                ) : (
                  <p className="text-ink-500">This candidate hasn’t created an account yet.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{r.assessment.mode === 'ai' ? 'AI interview score' : 'Live interview'}</CardTitle>
              </CardHeader>
              <CardContent>
                {r.assessment.mode === 'ai' ? (
                  r.interview?.report ? (
                    <>
                      <ScorePill score={r.interview.report.overall_score} className="text-2xl" />
                      <p className="mt-3 text-sm text-ink-700">{r.interview.report.summary.overall_assessment}</p>
                    </>
                  ) : (
                    <p className="text-sm text-ink-500">{inv.status === 'in_progress' ? 'Interview in progress.' : 'Not completed yet.'}</p>
                  )
                ) : inv.hr_feedback?.recommendation ? (
                  <>
                    <Badge tone="brand">{titleCase(inv.hr_feedback.recommendation)}</Badge>
                    <p className="mt-2 text-sm text-ink-700">{inv.hr_feedback.notes}</p>
                  </>
                ) : (
                  <p className="text-sm text-ink-500">{inv.scheduled_at ? `Scheduled for ${formatDateTime(inv.scheduled_at)}` : 'Not held yet.'}</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ScanFace className="size-4" aria-hidden /> Integrity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <IntegrityCard r={r} />
              </CardContent>
            </Card>
          </div>
          <Card className="mt-6">
            <CardHeader>
              <div>
                <CardTitle>Private notes</CardTitle>
                <CardDescription>Visible only to your company.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} maxLength={8000} aria-label="Notes" />
              <Button size="sm" onClick={() => save.mutate({ hr_notes: notes })} loading={save.isPending} disabled={notes === (inv.hr_notes ?? '')}>
                Save notes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="interview">
          {!r.interview || r.interview.questions.length === 0 ? (
            <EmptyState icon={FileText} title="No answers yet" />
          ) : (
            <div className="space-y-4">
              {r.interview.report && (
                <Card>
                  <CardContent className="grid gap-4 pt-5 md:grid-cols-3">
                    <div>
                      <p className="text-xs font-medium uppercase text-ink-400">Strengths</p>
                      <ul className="mt-1 list-disc pl-5 text-sm">{r.interview.report.summary.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase text-ink-400">Weaknesses</p>
                      <ul className="mt-1 list-disc pl-5 text-sm">{r.interview.report.summary.weaknesses.map((s) => <li key={s}>{s}</li>)}</ul>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase text-ink-400">Communication</p>
                      <p className="mt-1 text-sm">{r.interview.report.summary.communication_feedback}</p>
                    </div>
                  </CardContent>
                </Card>
              )}
              {r.interview.questions.map((q) => (
                <Card key={q.sequence_no}>
                  <CardContent className="space-y-3 pt-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs text-ink-500">
                          Q{q.sequence_no} · {q.topic} · difficulty {q.difficulty}/5{q.is_follow_up ? ' · follow-up' : ''}
                        </p>
                        <p className="mt-1 font-medium">{q.question_text}</p>
                      </div>
                      <ScorePill score={q.evaluation?.question_score ?? null} />
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3 text-sm">
                      <p className="mb-1 text-xs font-medium uppercase text-ink-400">Answer {q.response?.answer_mode === 'voice' ? '(spoken)' : ''}</p>
                      <p className="whitespace-pre-wrap">{q.response?.answer_text ?? '—'}</p>
                    </div>
                    {q.evaluation?.feedback && <p className="text-sm text-ink-700">{q.evaluation.feedback}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="live">
          <Card>
            <CardContent className="space-y-3 pt-5 text-sm">
              {inv.live_started_at ? (
                <p className="text-ink-500">
                  Held {formatDateTime(inv.live_started_at)}
                  {inv.live_ended_at ? ` – ${formatDateTime(inv.live_ended_at)}` : ' (in progress)'}
                </p>
              ) : (
                <p className="text-ink-500">Not held yet.</p>
              )}
              {inv.hr_feedback?.ratings && Object.keys(inv.hr_feedback.ratings).length > 0 && (
                <table className="text-sm">
                  <tbody>
                    {Object.entries(inv.hr_feedback.ratings).map(([k, v]) => (
                      <tr key={k}>
                        <td className="pr-6 py-1">{k}</td>
                        <td className="font-semibold tabular-nums">{v}/5</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {inv.hr_feedback?.recommendation && <Badge tone="brand">{titleCase(inv.hr_feedback.recommendation)}</Badge>}
              {inv.hr_feedback?.notes && <p className="whitespace-pre-wrap">{inv.hr_feedback.notes}</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="proctoring">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
            <div className="space-y-6">
              <Card>
                <CardContent className="pt-5">
                  <IntegrityCard r={r} />
                </CardContent>
              </Card>
              {r.proctoring.summary.flags && r.proctoring.summary.flags.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Flags</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-line">
                        {r.proctoring.summary.flags.map((f) => (
                          <tr key={f.kind}>
                            <td className="py-1.5">{f.label}</td>
                            <td className="py-1.5 text-right tabular-nums">×{f.count}</td>
                            <td className="py-1.5 pl-3 text-right tabular-nums text-ink-500">−{f.penalty}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}
            </div>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Timeline</CardTitle>
                  <CardDescription>Detected in the candidate’s browser. Snapshots are low-resolution and captured only at visual flags.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {r.proctoring.events.length === 0 ? (
                  <p className="text-sm text-ink-500">No events recorded.</p>
                ) : (
                  <ol className="space-y-2">
                    {r.proctoring.events.map((e) => (
                      <li key={e.id} className="flex items-start gap-3 text-sm">
                        <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', e.severity >= 3 ? 'bg-rose-500' : e.severity === 2 ? 'bg-amber-500' : e.severity === 1 ? 'bg-sky-500' : 'bg-slate-300')} aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{PROCTOR_LABELS[e.kind] ?? e.kind}</p>
                          <p className="text-xs text-ink-500">{formatDateTime(e.occurred_at)}</p>
                        </div>
                        {e.snapshot_url && (
                          <a href={e.snapshot_url} target="_blank" rel="noopener noreferrer">
                            <img src={e.snapshot_url} alt={`Snapshot: ${PROCTOR_LABELS[e.kind] ?? e.kind}`} className="h-14 w-20 rounded-md border border-line object-cover" />
                          </a>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
                {visualEvents.length > 0 && <p className="mt-3 text-xs text-ink-500">{visualEvents.length} snapshot(s). Links expire after 10 minutes; reload to refresh.</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
