import { useMutation, useQuery } from '@tanstack/react-query'
import { Keyboard, Mic } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/form'
import { Alert, Badge, PageHeader, PageLoader } from '@/components/ui/misc'
import { TagInput } from '@/components/ui/tag-input'
import { useCompanies, useJobRoles, useProfile, useResumes } from '@/hooks/queries'
import { api, errorMessage } from '@/lib/api'
import { recordingSupported } from '@/lib/speech'
import { cn, INTERVIEW_TYPE_LABELS } from '@/lib/utils'
import type { Company, InterviewSession, InterviewType, JobListing } from '@/types'

const TYPE_INFO: Record<InterviewType, string> = {
  technical: 'Core CS and role-specific concepts',
  coding: 'Problem solving with code (not executed)',
  system_design: 'Architecture, scalability and trade-offs',
  resume: 'Deep-dive into your own projects and experience',
  behavioral: 'STAR-style stories about teamwork and ownership',
  hr: 'Motivation, goals and fit',
  company: 'Role competencies with a chosen company and listing',
  full: 'A mix of everything the role requires',
}

const KIND_FOR_TYPE: Partial<Record<InterviewType, string[]>> = {
  technical: ['technical'],
  coding: ['coding'],
  system_design: ['system_design'],
  resume: ['resume'],
  behavioral: ['behavioral'],
  hr: ['hr'],
}

const DIFFICULTY_LABELS = ['', 'Very easy', 'Easy', 'Medium', 'Hard', 'Very hard']

export default function InterviewSetup() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { data: profile } = useProfile()
  const roles = useJobRoles()
  const companies = useCompanies()
  const resumes = useResumes()

  const years = profile?.profile.years_experience ?? 0
  const [companyId, setCompanyId] = useState(params.get('company') ?? '')
  const [listingId, setListingId] = useState(params.get('listing') ?? '')
  const [roleId, setRoleId] = useState(params.get('role_id') ?? '')
  const [roleTitle, setRoleTitle] = useState(params.get('role') ?? '')
  const [type, setType] = useState<InterviewType>((params.get('type') as InterviewType) || (params.get('company') ? 'company' : 'technical'))
  const [level, setLevel] = useState(years < 1 ? 'fresher' : years < 3 ? 'junior' : years < 6 ? 'mid' : 'senior')
  const [difficulty, setDifficulty] = useState(3)
  const [duration, setDuration] = useState(20)
  const [topics, setTopics] = useState<string[]>(params.get('topic') ? [params.get('topic')!] : [])
  const [mode, setMode] = useState<'voice' | 'text'>(recordingSupported() ? 'voice' : 'text')
  const [resumeId, setResumeId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const company = useQuery({
    queryKey: ['company-by-id', companyId],
    queryFn: async () => {
      const slug = companies.data?.find((c) => c.id === companyId)?.slug
      return api.get<{ company: Company; listings: JobListing[] }>(`/api/companies/${slug}`)
    },
    enabled: Boolean(companyId && companies.data),
  })

  const role = roles.data?.find((r) => r.id === roleId)
  const suggestedTopics = useMemo(() => {
    if (!role) return []
    const kinds = KIND_FOR_TYPE[type]
    return role.competencies.filter((c) => !kinds || kinds.includes(c.kind)).map((c) => c.topic)
  }, [role, type])

  const create = useMutation({
    mutationFn: () =>
      api.post<InterviewSession>('/api/interviews', {
        company_id: companyId || null,
        job_listing_id: companyId && listingId ? listingId : null,
        job_role_id: roleId || null,
        role_title: roleTitle.trim() || null,
        resume_id: resumeId || null,
        interview_type: type,
        experience_level: level,
        difficulty,
        duration_minutes: duration,
        topics,
        answer_mode: mode,
      }),
    onSuccess: (s) => navigate(`/interview/${s.id}`),
    onError: (e) => setError(errorMessage(e)),
  })

  if (!profile || roles.isPending) return <PageLoader />

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!roleId && !roleTitle.trim()) return setError('Choose a role framework or type a role title.')
    if (type === 'resume' && !resumes.data?.length) return setError('Upload a resume before starting a resume-based interview.')
    create.mutate()
  }

  return (
    <div className="animate-fade-in">
      <PageHeader title="Set up a mock interview" description="Questions are generated for you and adapt to your answers as you go." />
      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Interview type</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Interview type">
                {(Object.keys(TYPE_INFO) as InterviewType[]).map((t) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={type === t}
                    key={t}
                    onClick={() => setType(t)}
                    className={cn('rounded-lg border p-3 text-left transition-colors', type === t ? 'border-brand-400 bg-brand-50 ring-1 ring-brand-200' : 'border-line hover:bg-slate-50')}
                  >
                    <p className="text-sm font-medium">{INTERVIEW_TYPE_LABELS[t]}</p>
                    <p className="mt-0.5 text-xs text-ink-500">{TYPE_INFO[t]}</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Role & company</CardTitle>
                <CardDescription>Choosing a company is optional. Without a verified listing, questions are general role-based practice.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Role framework" htmlFor="role">
                <Select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                  <option value="">None — use my own title</option>
                  {roles.data?.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Role title" htmlFor="role_title" hint={roleId ? 'Optional override' : 'Required without a framework'}>
                <Input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder={role?.title ?? profile.profile.target_roles[0] ?? 'e.g. Software Engineer'} maxLength={120} />
              </Field>
              <Field label="Target company (optional)" htmlFor="company">
                <Select
                  value={companyId}
                  onChange={(e) => {
                    setCompanyId(e.target.value)
                    setListingId('')
                  }}
                >
                  <option value="">No specific company</option>
                  {companies.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Job listing" htmlFor="listing" hint={companyId && company.data && !company.data.listings.length ? 'No verified listings for this company.' : undefined}>
                <Select value={listingId} onChange={(e) => setListingId(e.target.value)} disabled={!companyId || !company.data?.listings.length}>
                  <option value="">None</option>
                  {company.data?.listings.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title}
                    </option>
                  ))}
                </Select>
              </Field>
              {companyId && (
                <div className="sm:col-span-2">
                  {listingId ? (
                    <Badge tone="success">Company-specific: uses a verified job listing</Badge>
                  ) : (
                    <Badge tone="neutral">General role-based practice (no verified listing selected)</Badge>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Topics to practise</CardTitle>
                <CardDescription>Leave empty to follow the role framework. Topics you struggled with before are prioritised automatically.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <TagInput value={topics} onChange={setTopics} suggestions={suggestedTopics} placeholder="Add a topic (e.g. Operating Systems)" max={12} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Experience level" htmlFor="level">
                <Select value={level} onChange={(e) => setLevel(e.target.value)}>
                  <option value="fresher">Fresher / student</option>
                  <option value="junior">Junior (0–2 years)</option>
                  <option value="mid">Mid (3–5 years)</option>
                  <option value="senior">Senior (6+ years)</option>
                </Select>
              </Field>
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-ink-700" id="difficulty-label">
                  Starting difficulty: <span className="text-brand-700">{DIFFICULTY_LABELS[difficulty]}</span>
                </p>
                <div className="grid grid-cols-5 gap-1" role="radiogroup" aria-labelledby="difficulty-label">
                  {[1, 2, 3, 4, 5].map((d) => (
                    <button type="button" key={d} role="radio" aria-checked={difficulty === d} onClick={() => setDifficulty(d)} className={cn('h-9 rounded-md border text-sm font-medium', difficulty === d ? 'border-brand-500 bg-brand-600 text-white' : 'border-line hover:bg-slate-50')}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Duration" htmlFor="duration">
                <Select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                  {[10, 15, 20, 30, 45, 60].map((m) => (
                    <option key={m} value={m}>
                      {m} minutes
                    </option>
                  ))}
                </Select>
              </Field>
              {(type === 'resume' || type === 'full' || type === 'company') && (resumes.data?.length ?? 0) > 0 && (
                <Field label="Resume" htmlFor="resume">
                  <Select value={resumeId} onChange={(e) => setResumeId(e.target.value)}>
                    <option value="">Primary resume</option>
                    {resumes.data?.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.original_filename}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-ink-700">Answer mode</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['voice', 'text'] as const).map((m) => (
                    <button
                      type="button"
                      key={m}
                      onClick={() => setMode(m)}
                      aria-pressed={mode === m}
                      disabled={m === 'voice' && !recordingSupported()}
                      className={cn('flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium disabled:opacity-50', mode === m ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-line hover:bg-slate-50')}
                    >
                      {m === 'voice' ? <Mic className="size-4" /> : <Keyboard className="size-4" />}
                      {m === 'voice' ? 'Voice' : 'Text'}
                    </button>
                  ))}
                </div>
                {!recordingSupported() && <p className="text-xs text-ink-500">Audio recording isn’t available in this browser. Use a recent Chrome, Edge, Firefox or Safari for voice answers.</p>}
              </div>
            </CardContent>
          </Card>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" size="lg" className="w-full" loading={create.isPending}>
            Create interview
          </Button>
        </div>
      </form>
    </div>
  )
}
