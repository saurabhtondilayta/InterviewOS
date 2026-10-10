import { useMutation } from '@tanstack/react-query'
import { Mic, ScanFace, Video } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { Alert, PageHeader } from '@/components/ui/misc'
import { TagInput } from '@/components/ui/tag-input'
import { useJobRoles } from '@/hooks/queries'
import { api, errorMessage } from '@/lib/api'
import { cn, INTERVIEW_TYPE_LABELS } from '@/lib/utils'
import type { Assessment, InterviewType } from '@/types'

export default function AssessmentNew() {
  const navigate = useNavigate()
  const roles = useJobRoles()
  const [mode, setMode] = useState<'ai' | 'live'>('ai')
  const [title, setTitle] = useState('')
  const [roleId, setRoleId] = useState('')
  const [roleTitle, setRoleTitle] = useState('')
  const [type, setType] = useState<InterviewType>('technical')
  const [level, setLevel] = useState('fresher')
  const [difficulty, setDifficulty] = useState(3)
  const [duration, setDuration] = useState(20)
  const [topics, setTopics] = useState<string[]>([])
  const [description, setDescription] = useState('')
  const [proctoring, setProctoring] = useState(true)
  const [showResults, setShowResults] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const role = roles.data?.find((r) => r.id === roleId)
  const create = useMutation({
    mutationFn: () =>
      api.post<Assessment>('/api/org/assessments', {
        title: title.trim(),
        role_title: (roleTitle.trim() || role?.title || '').trim(),
        job_role_id: roleId || null,
        description: description.trim() || null,
        mode,
        interview_type: type,
        experience_level: level,
        difficulty,
        duration_minutes: duration,
        topics,
        proctoring_enabled: proctoring,
        show_results_to_candidate: showResults,
      }),
    onSuccess: (a) => navigate(`/hr/assessments/${a.id}`),
    onError: (e) => setError(errorMessage(e)),
  })

  return (
    <div className="animate-fade-in">
      <PageHeader title="New assessment" description="One interview round for a role. You'll invite candidates on the next page." />
      <form
        className="grid gap-6 lg:grid-cols-[1.4fr_1fr]"
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          if (title.trim().length < 3) return setError('Give the assessment a title.')
          if (!roleId && roleTitle.trim().length < 2) return setError('Choose a role framework or type the role title.')
          create.mutate()
        }}
      >
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Interview format</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  { m: 'ai', icon: Mic, name: 'AI interview', text: 'Candidates take an adaptive AI-led interview (voice or text) at a time that suits them. You review scores, transcript and proctoring.' },
                  { m: 'live', icon: Video, name: 'Live 1-on-1 video', text: 'You interview the candidate face to face in the browser at a scheduled time, with AI-suggested questions and a scorecard.' },
                ] as const
              ).map((o) => (
                <button key={o.m} type="button" aria-pressed={mode === o.m} onClick={() => setMode(o.m)} className={cn('rounded-lg border p-4 text-left', mode === o.m ? 'border-brand-400 bg-brand-50 ring-1 ring-brand-200' : 'border-line hover:bg-slate-50')}>
                  <p className="flex items-center gap-2 font-medium">
                    <o.icon className="size-4" aria-hidden /> {o.name}
                  </p>
                  <p className="mt-1 text-xs text-ink-500">{o.text}</p>
                </button>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Role</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Assessment title" htmlFor="title" required className="sm:col-span-2">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Graduate Cloud Engineer – Round 1" maxLength={160} />
              </Field>
              <Field label="Role framework" htmlFor="role">
                <Select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                  <option value="">None — type a title</option>
                  {roles.data?.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Role title" htmlFor="role_title" hint={roleId ? 'Optional override' : 'Required'}>
                <Input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder={role?.title ?? 'e.g. Software Engineer'} maxLength={120} />
              </Field>
              <Field label="Instructions for candidates (optional)" htmlFor="desc" className="sm:col-span-2">
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={4000} />
              </Field>
              {mode === 'ai' && (
                <Field label="Topics (optional)" htmlFor="topics" className="sm:col-span-2" hint="Leave empty to follow the role framework.">
                  <TagInput value={topics} onChange={setTopics} suggestions={role?.competencies.map((c) => c.topic) ?? []} max={12} />
                </Field>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {mode === 'ai' && (
                <Field label="Interview type" htmlFor="type">
                  <Select value={type} onChange={(e) => setType(e.target.value as InterviewType)}>
                    {(['technical', 'full', 'behavioral', 'hr', 'resume', 'system_design', 'coding'] as InterviewType[]).map((t) => (
                      <option key={t} value={t}>
                        {INTERVIEW_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label="Experience level" htmlFor="level">
                <Select value={level} onChange={(e) => setLevel(e.target.value)}>
                  <option value="fresher">Fresher / student</option>
                  <option value="junior">Junior (0–2 years)</option>
                  <option value="mid">Mid (3–5 years)</option>
                  <option value="senior">Senior (6+ years)</option>
                </Select>
              </Field>
              {mode === 'ai' && (
                <Field label={`Starting difficulty: ${difficulty}/5`} htmlFor="diff">
                  <input id="diff" type="range" min={1} max={5} value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))} className="w-full accent-brand-600" />
                </Field>
              )}
              <Field label="Duration" htmlFor="duration">
                <Select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                  {[10, 15, 20, 30, 45, 60].map((m) => (
                    <option key={m} value={m}>
                      {m} minutes
                    </option>
                  ))}
                </Select>
              </Field>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ScanFace className="size-4" aria-hidden /> AI proctoring
                </CardTitle>
                <CardDescription>Runs in the candidate’s browser: face presence, extra people, looking away, phones, tab switching. Visible to your company only; candidates consent first.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={proctoring} onChange={(e) => setProctoring(e.target.checked)} /> Enable camera proctoring
              </label>
              {mode === 'ai' && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={showResults} onChange={(e) => setShowResults(e.target.checked)} /> Show AI scores to candidates
                </label>
              )}
            </CardContent>
          </Card>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" size="lg" className="w-full" loading={create.isPending}>
            Create assessment
          </Button>
        </div>
      </form>
    </div>
  )
}
