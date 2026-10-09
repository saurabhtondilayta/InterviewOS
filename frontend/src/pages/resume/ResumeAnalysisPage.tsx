import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, Download, Info, Mic, Plus, XCircle } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AIDisclaimer, Alert, Badge, PageLoader, Progress, ScorePill, Tooltip } from '@/components/ui/misc'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useProfile } from '@/hooks/queries'
import { api, downloadText, errorMessage } from '@/lib/api'
import { formatDateTime, titleCase } from '@/lib/utils'
import type { ProfilePayload, ResumeAnalysis } from '@/types'

function List({ items, icon: Icon, tone }: { items: string[]; icon: React.ElementType; tone: string }) {
  if (!items.length) return <p className="text-sm text-ink-500">None identified.</p>
  return (
    <ul className="space-y-2">
      {items.map((s, i) => (
        <li key={i} className="flex gap-2 text-sm leading-relaxed">
          <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} aria-hidden />
          {s}
        </li>
      ))}
    </ul>
  )
}

export default function ResumeAnalysisPage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { data: profile } = useProfile()
  const { data: a, isPending, isError, error } = useQuery({ queryKey: ['resume-analysis', id], queryFn: () => api.get<ResumeAnalysis>(`/api/resume-analyses/${id}`) })

  const addSkills = useMutation({
    mutationFn: (skills: string[]) => api.put<ProfilePayload>('/api/profile/skills', { skills }),
    onSuccess: (d) => {
      qc.setQueryData(['profile'], d)
      toast.success('Skills added to your profile')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  if (isPending) return <PageLoader label="Loading analysis" />
  if (isError) return <Alert tone="error">{errorMessage(error)}</Alert>
  const r = a.result
  const newSkills = r.detected_skills.filter((s) => !profile?.skills.some((k) => k.toLowerCase() === s.toLowerCase()))

  const download = async () => {
    try {
      downloadText(`resume-analysis-${a.id.slice(0, 8)}.md`, await api.text(`/api/resume-analyses/${a.id}/report.md`), 'text/markdown')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link to="/resume" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
            <ArrowLeft className="size-4" /> Resume analyzer
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Analysis for {a.target_role}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {a.resumes?.original_filename} · {formatDateTime(a.created_at)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={download}>
            <Download /> Download report
          </Button>
          <Button asChild>
            <Link to={`/interview/new?type=resume&role=${encodeURIComponent(a.target_role)}`}>
              <Mic /> Practise resume interview
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="pt-5">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Practice score</p>
              <Tooltip content={a.score_explanation}>
                <button className="text-ink-400 hover:text-ink-700" aria-label="How is this score calculated?">
                  <Info className="size-3.5" />
                </button>
              </Tooltip>
            </div>
            <p className="mt-2 text-4xl font-semibold tabular-nums">
              {Math.round(a.overall_score)}
              <span className="text-lg text-ink-400">/100</span>
            </p>
            <p className="mt-2 text-xs leading-relaxed text-ink-500">{a.score_explanation}</p>
            <div className="mt-5 space-y-3">
              {r.section_scores.map((s) => (
                <div key={s.section}>
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-ink-700">
                      {titleCase(s.section)} <span className="font-normal text-ink-400">({Math.round((a.score_breakdown[s.section]?.weight ?? 0) * 100)}%)</span>
                    </span>
                    <span className="tabular-nums text-ink-500">{s.score}/10</span>
                  </div>
                  <Progress value={s.score * 10} className="mt-1 h-1.5" label={`${s.section} score`} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Overall assessment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-relaxed text-ink-700">{r.overall_assessment}</p>
              <AIDisclaimer text={a.disclaimer} />
            </CardContent>
          </Card>
          <div className="grid gap-6 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Strengths</CardTitle>
              </CardHeader>
              <CardContent>
                <List items={r.strengths} icon={CheckCircle2} tone="text-emerald-600" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Weaknesses</CardTitle>
              </CardHeader>
              <CardContent>
                <List items={r.weaknesses} icon={XCircle} tone="text-rose-500" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Tabs defaultValue="sections">
        <TabsList>
          <TabsTrigger value="sections">Section suggestions</TabsTrigger>
          <TabsTrigger value="skills">Skills & keywords</TabsTrigger>
          <TabsTrigger value="bullets">Bullet improvements</TabsTrigger>
          <TabsTrigger value="jd">Job description match</TabsTrigger>
          <TabsTrigger value="next">Projects & certifications</TabsTrigger>
          <TabsTrigger value="questions">Interview questions</TabsTrigger>
        </TabsList>

        <TabsContent value="sections">
          <div className="grid gap-4 md:grid-cols-2">
            {r.section_suggestions.map((s) => (
              <Card key={s.section}>
                <CardHeader>
                  <CardTitle>{titleCase(s.section)}</CardTitle>
                  <ScorePill score={r.section_scores.find((x) => x.section === s.section)?.score} />
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-ink-500">{r.section_scores.find((x) => x.section === s.section)?.rationale}</p>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {s.suggestions.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
            {r.ats_issues.length > 0 && (
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>ATS-related formatting</CardTitle>
                    <CardDescription>Based on the extracted text only; visual layout is not visible to the analysis.</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {r.ats_issues.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="skills">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Missing or underrepresented skills</CardTitle>
              </CardHeader>
              <CardContent>
                {r.missing_skills.length ? (
                  <ul className="space-y-3">
                    {r.missing_skills.map((m) => (
                      <li key={m.skill} className="text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{m.skill}</span>
                          <Badge tone={m.importance === 'high' ? 'danger' : m.importance === 'medium' ? 'warning' : 'neutral'}>{m.importance}</Badge>
                        </div>
                        <p className="mt-0.5 text-ink-500">{m.reason}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-ink-500">No major gaps identified for this role.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Skills found in your resume</CardTitle>
                  <CardDescription>Add any that are missing from your profile so interviews can use them.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {r.detected_skills.map((s) => (
                    <Badge key={s} tone={newSkills.includes(s) ? 'violet' : 'neutral'}>
                      {s}
                    </Badge>
                  ))}
                </div>
                {newSkills.length > 0 && profile && (
                  <Button size="sm" variant="subtle" className="mt-4" loading={addSkills.isPending} onClick={() => addSkills.mutate([...profile.skills, ...newSkills])}>
                    <Plus /> Add {newSkills.length} new skill{newSkills.length > 1 ? 's' : ''} to profile
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="bullets">
          <div className="space-y-4">
            {r.bullet_rewrites.length === 0 && <p className="text-sm text-ink-500">No bullet suggestions.</p>}
            {r.bullet_rewrites.map((b, i) => (
              <Card key={i}>
                <CardContent className="grid gap-4 pt-5 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Original</p>
                    <p className="mt-1 text-sm text-ink-700">{b.original}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Suggested</p>
                    <p className="mt-1 text-sm font-medium text-ink-900">{b.improved}</p>
                    <p className="mt-2 text-xs text-ink-500">{b.why}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
            <p className="text-xs text-ink-500">Placeholders like [X%] mark where you should add your real numbers. Never add metrics you can’t back up.</p>
          </div>
        </TabsContent>

        <TabsContent value="jd">
          <Card>
            <CardContent className="pt-5">
              {r.jd_comparison.provided ? (
                <div className="space-y-5">
                  <p className="text-sm leading-relaxed">{r.jd_comparison.summary}</p>
                  <div className="grid gap-6 md:grid-cols-2">
                    <div>
                      <p className="mb-2 text-sm font-semibold">Requirements you meet</p>
                      <List items={r.jd_comparison.matched_requirements} icon={CheckCircle2} tone="text-emerald-600" />
                    </div>
                    <div>
                      <p className="mb-2 text-sm font-semibold">Requirements not shown on your resume</p>
                      <List items={r.jd_comparison.missing_requirements} icon={XCircle} tone="text-rose-500" />
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-ink-500">
                  No job description was used for this analysis. Run a new analysis with a pasted job description, or pick a verified listing from the{' '}
                  <Link to="/companies" className="font-medium text-brand-600 hover:underline">
                    company explorer
                  </Link>
                  .
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="next">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Recommended projects</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {r.recommended_projects.map((p) => (
                  <div key={p.title}>
                    <p className="text-sm font-medium">{p.title}</p>
                    <p className="mt-0.5 text-sm text-ink-500">{p.description}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {p.skills.map((s) => (
                        <Badge key={s}>{s}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Recommended certifications</CardTitle>
                  <CardDescription>Verify details on the provider’s official website before enrolling.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {r.recommended_certifications.map((c) => (
                  <div key={c.name}>
                    <p className="text-sm font-medium">
                      {c.name} <span className="font-normal text-ink-500">· {c.provider}</span>
                    </p>
                    <p className="text-sm text-ink-500">{c.reason}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="questions">
          <Card>
            <CardContent className="pt-5">
              <ol className="space-y-3">
                {r.interview_questions.map((q, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">{i + 1}</span>
                    <div>
                      <p className="font-medium">{q.question}</p>
                      <p className="text-xs text-ink-500">
                        {q.topic} · based on: {q.based_on}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
