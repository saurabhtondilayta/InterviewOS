import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, Mic, RotateCcw, XCircle } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts'
import { EvaluationCard } from '@/components/interview/EvaluationCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AIDisclaimer, Alert, Badge, EmptyState, PageLoader, ScorePill, Spinner } from '@/components/ui/misc'
import { api, errorMessage } from '@/lib/api'
import { formatDateTime, INTERVIEW_TYPE_LABELS, titleCase } from '@/lib/utils'
import type { SessionDetail } from '@/types'

const DIMS = ['relevance', 'correctness', 'depth', 'communication', 'problem_solving']

export default function InterviewResults() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { data, isPending, isError, error } = useQuery({ queryKey: ['interview', id], queryFn: () => api.get<SessionDetail>(`/api/interviews/${id}`) })
  const generate = useMutation({
    mutationFn: () => api.post(`/api/interviews/${id}/end`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['interview', id] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  // If the interview ended but its report wasn't created (e.g. the AI was busy), try once automatically.
  const autoTried = useRef(false)
  const needsReport = Boolean(data && !data.report && data.session.ended_at && data.session.status === 'in_progress' && data.questions.some((q) => q.evaluation))
  useEffect(() => {
    if (needsReport && !autoTried.current) {
      autoTried.current = true
      generate.mutate()
    }
  }, [needsReport, generate])

  if (isPending) return <PageLoader label="Loading results" />
  if (isError) return <Alert tone="error">{errorMessage(error)}</Alert>
  const { session: s, report, questions } = data

  // Company assessment whose results go only to the company.
  if (data.results_hidden) {
    const company = data.assessment?.company ?? 'The company'
    const submitted = s.status === 'completed'
    return (
      <div className="mx-auto max-w-xl space-y-4 animate-fade-in">
        <Link to="/invitations" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
          <ArrowLeft className="size-4" /> Company invitations
        </Link>
        <Card>
          <CardContent className="space-y-3 pt-6 text-center">
            <CheckCircle2 className="mx-auto size-10 text-emerald-600" aria-hidden />
            <h1 className="text-xl font-semibold tracking-tight">{submitted ? 'Interview submitted' : 'Interview not submitted yet'}</h1>
            <p className="text-sm text-ink-600">
              {submitted
                ? `${company} will review your answers and contact you about next steps. Scores for this assessment are shared only with the company.`
                : `Your answers are saved. Submit them to ${company} to finish.`}
            </p>
            {!submitted && (
              <>
                {generate.isError && <Alert tone="error">{errorMessage(generate.error)}</Alert>}
                <div className="flex justify-center gap-2">
                  <Button variant="secondary" asChild>
                    <Link to={`/interview/${id}`}>Resume</Link>
                  </Button>
                  <Button onClick={() => generate.mutate()} loading={generate.isPending}>
                    Submit interview
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  const header = (
    <div>
      <Link to="/history" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft className="size-4" /> Interview history
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Interview report</h1>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-500">
        <span>{s.role_title}</span>·<span>{INTERVIEW_TYPE_LABELS[s.interview_type]}</span>·<span>{formatDateTime(s.started_at ?? s.created_at)}</span>
        {data.company && <Badge>{data.company.name}</Badge>}
        <Badge tone={s.is_company_specific ? 'success' : 'neutral'}>{s.is_company_specific ? 'Verified listing' : 'General role practice'}</Badge>
        <Badge tone="neutral">Rubric {s.rubric_version}</Badge>
      </div>
    </div>
  )

  if (s.status === 'abandoned' || (!report && !questions.some((q) => q.evaluation))) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState icon={Mic} title="No answers were submitted in this interview" description="There is nothing to score. Start a new interview when you're ready." action={<Button asChild><Link to="/interview/new">New interview</Link></Button>} />
      </div>
    )
  }

  if (!report) {
    return (
      <div className="space-y-6">
        {header}
        {s.status === 'in_progress' && !s.ended_at && (
          <Alert tone="info" title="This interview is still in progress" action={<Button asChild size="sm" variant="secondary"><Link to={`/interview/${id}`}>Resume</Link></Button>}>
            You can resume it, or generate a report from the answers submitted so far.
          </Alert>
        )}
        {generate.isPending && <Spinner label="Generating your report (this can take up to a minute)" />}
        {generate.isError && (
          <Alert tone="error" title="The report could not be generated yet">
            {errorMessage(generate.error)} Your answers and scores are saved — try again in a minute.
          </Alert>
        )}
        {!generate.isPending && (
          <Button onClick={() => generate.mutate()}>
            <RotateCcw /> {generate.isError ? 'Try again' : 'Generate report'}
          </Button>
        )}
      </div>
    )
  }

  const chartData = DIMS.map((d) => ({ name: titleCase(d), score: report.dimension_averages[d] ?? 0 }))
  const topics = Object.entries(report.topic_scores).sort((a, b) => a[1].average - b[1].average)
  const sum = report.summary

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        {header}
        <Button asChild>
          <Link to={`/interview/new?type=${s.interview_type}&role=${encodeURIComponent(s.role_title)}`}>
            <Mic /> Practise again
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Overall practice score</p>
            <p className="mt-2 text-4xl font-semibold tabular-nums">
              {report.overall_score?.toFixed(1) ?? '—'}
              <span className="text-lg text-ink-400">/10</span>
            </p>
            <p className="mt-2 text-xs text-ink-500">Average of {questions.filter((q) => q.evaluation).length} answered question scores (rubric {report.rubric_version}).</p>
            {report.suggested_next_difficulty && (
              <p className="mt-4 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
                Suggested next difficulty: <span className="font-semibold">{report.suggested_next_difficulty}/5</span> (started at {s.start_difficulty}/5)
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Rubric dimensions</CardTitle>
              <CardDescription>Average across all answers (0–10).</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <ChartTooltip cursor={{ fill: '#eef2ff' }} contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Bar dataKey="score" fill="#4f46e5" radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {report.technical_averages && Object.keys(report.technical_averages).length > 0 && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Technical track scores</CardTitle>
              <CardDescription>Coding and system design answers are scored on their own criteria, separately from communication.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {Object.entries(report.technical_averages).map(([track, crit]) => (
              <div key={track}>
                <p className="mb-2 text-sm font-semibold">{titleCase(track)}</p>
                <ul className="space-y-1.5 text-sm">
                  {Object.entries(crit).map(([k, v]) => (
                    <li key={k} className="flex justify-between">
                      <span>{titleCase(k)}</span>
                      <ScorePill score={v} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Overall assessment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-relaxed">
            <p>{sum.overall_assessment}</p>
            <div>
              <p className="font-semibold">Communication</p>
              <p className="text-ink-700">{sum.communication_feedback}</p>
            </div>
            <div>
              <p className="font-semibold">Problem solving</p>
              <p className="text-ink-700">{sum.problem_solving_observations}</p>
            </div>
            <AIDisclaimer text={data.disclaimer} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Scores by topic</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {topics.map(([t, v]) => (
                <li key={t} className="flex items-center justify-between text-sm">
                  <span>
                    {t} <span className="text-xs text-ink-400">({v.questions} q)</span>
                  </span>
                  <ScorePill score={v.average} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Strengths</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {sum.strengths.map((x, i) => (
                <li key={i} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                  {x}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Weaknesses</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {sum.weaknesses.map((x, i) => (
                <li key={i} className="flex gap-2">
                  <XCircle className="mt-0.5 size-4 shrink-0 text-rose-500" aria-hidden />
                  {x}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Topics to revise</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {sum.topics_to_revise.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ol>
            <p className="mb-1 mt-4 text-sm font-semibold">Next steps</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {sum.next_steps.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <Button asChild variant="subtle" size="sm" className="mt-4">
              <Link to="/learning">Build a learning plan from this</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recommended practice questions</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              {sum.recommended_practice.map((q) => (
                <li key={q.question}>
                  {q.question} <span className="text-xs text-ink-400">({q.topic})</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Question-by-question review</h2>
        <div className="space-y-4">
          {questions.map((q) => (
            <details key={q.id} className="group rounded-xl border border-line bg-white shadow-card">
              <summary className="flex cursor-pointer items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-xs text-ink-500">
                    Q{q.sequence_no} · {q.topic} · difficulty {q.difficulty}/5 {q.is_follow_up && '· follow-up'}
                  </p>
                  <p className="mt-1 text-sm font-medium">{q.question_text}</p>
                </div>
                <ScorePill score={q.evaluation?.question_score} />
              </summary>
              <div className="space-y-4 border-t border-line p-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Your answer {q.response?.answer_mode === 'voice' && '(voice transcript)'}</p>
                  <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-sm text-ink-700">{q.response?.answer_text ?? 'Not answered'}</pre>
                </div>
                {q.evaluation && <EvaluationCard ev={q.evaluation} compact />}
                {q.expected_points && q.expected_points.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Grading guide used</p>
                    <ul className="mt-1 list-disc pl-5 text-sm text-ink-700">
                      {q.expected_points.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}
