import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Bookmark, Briefcase, ExternalLink, FileText, Mic, ShieldAlert, ShieldCheck, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Select } from '@/components/ui/form'
import { AIDisclaimer, Alert, Badge, EmptyState, PageLoader } from '@/components/ui/misc'
import { useJobRoles } from '@/hooks/queries'
import { api, errorMessage } from '@/lib/api'
import { formatDate, titleCase } from '@/lib/utils'
import type { Company, JobListing, RolePrep } from '@/types'

export default function CompanyDetail() {
  const { slug } = useParams()
  const qc = useQueryClient()
  const roles = useJobRoles()
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['company', slug],
    queryFn: () => api.get<{ company: Company; listings: JobListing[] }>(`/api/companies/${slug}`),
  })
  const [roleId, setRoleId] = useState('')
  const [listingId, setListingId] = useState('')

  const prep = useMutation({
    mutationFn: () => api.post<RolePrep>('/api/role-prep', { job_role_id: roleId, company_id: data!.company.id, job_listing_id: listingId || null }),
    onError: (e) => toast.error(errorMessage(e)),
  })
  const save = useMutation({
    mutationFn: () => api.post('/api/saved-jobs', { company_id: data!.company.id, job_role_id: roleId || null, job_listing_id: listingId || null }),
    onSuccess: () => {
      toast.success('Saved to your preparation targets')
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  if (isPending) return <PageLoader />
  if (isError) return <Alert tone="error">{errorMessage(error)}</Alert>
  const { company: c, listings } = data
  const selectedListing = listings.find((l) => l.id === listingId)

  const chooseListing = (id: string) => {
    setListingId(id)
    const l = listings.find((x) => x.id === id)
    if (l?.job_role_id) setRoleId(l.job_role_id)
  }

  const interviewLink = `/interview/new?company=${c.id}${roleId ? `&role_id=${roleId}` : ''}${listingId ? `&listing=${listingId}` : ''}`

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Link to="/companies" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
          <ArrowLeft className="size-4" /> Companies
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{c.name}</h1>
          {c.last_verified_at ? (
            <Badge tone="success">
              <ShieldCheck className="size-3" aria-hidden /> Record verified {formatDate(c.last_verified_at)}
            </Badge>
          ) : (
            <Badge tone="warning">
              <ShieldAlert className="size-3" aria-hidden /> Not yet verified
            </Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-ink-500">{[c.industry, c.headquarters].filter(Boolean).join(' · ')}</p>
        {c.description && <p className="mt-3 max-w-3xl text-sm text-ink-700">{c.description}</p>}
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <a href={c.official_website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
            Official website <ExternalLink className="size-3.5" />
          </a>
          {c.careers_url && (
            <a href={c.careers_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
              Official careers page <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Job listings from official sources</CardTitle>
                <CardDescription>Select a listing to tailor preparation. Always confirm details on the official page before applying.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {listings.length === 0 ? (
                <EmptyState
                  icon={Briefcase}
                  title="No verified listings stored for this company yet"
                  description="You can still prepare with general role-based practice below. These questions will not be presented as official company questions."
                />
              ) : (
                <ul className="space-y-2">
                  {listings.map((l) => (
                    <li key={l.id}>
                      <label className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${listingId === l.id ? 'border-brand-300 bg-brand-50/50' : 'border-line hover:bg-slate-50'}`}>
                        <input type="radio" name="listing" className="mt-1" checked={listingId === l.id} onChange={() => chooseListing(l.id)} />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                            {l.title}
                            {l.status === 'stale' && <Badge tone="warning">May be outdated</Badge>}
                          </span>
                          <span className="block text-xs text-ink-500">
                            {[l.location, l.employment_type, l.experience_min != null ? `${l.experience_min}${l.experience_max ? `–${l.experience_max}` : '+'} yrs` : null].filter(Boolean).join(' · ')}
                          </span>
                          {l.required_skills.length > 0 && (
                            <span className="mt-1.5 flex flex-wrap gap-1">
                              {l.required_skills.slice(0, 8).map((s) => (
                                <Badge key={s}>{s}</Badge>
                              ))}
                            </span>
                          )}
                          <span className="mt-1.5 flex flex-wrap gap-3 text-xs text-ink-400">
                            <span>Last verified {formatDate(l.last_verified_at)}</span>
                            <a href={l.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline" onClick={(e) => e.stopPropagation()}>
                              Source <ExternalLink className="size-3" />
                            </a>
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {listingId && (
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => setListingId('')}>
                  Clear selection
                </Button>
              )}
            </CardContent>
          </Card>

          {prep.data && (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="size-4 text-accent-500" aria-hidden /> Your preparation brief
                  </CardTitle>
                  <CardDescription>{prep.data.basis_note}</CardDescription>
                </div>
                <Badge tone={prep.data.basis === 'verified_listing' ? 'success' : 'neutral'}>{prep.data.basis === 'verified_listing' ? 'Listing-specific' : 'General role practice'}</Badge>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <p className="mb-1.5 text-sm font-semibold">Focus areas</p>
                    <ul className="list-disc space-y-1 pl-5 text-sm">{prep.data.focus_areas.map((x) => <li key={x}>{x}</li>)}</ul>
                  </div>
                  <div>
                    <p className="mb-1.5 text-sm font-semibold">Skill gaps</p>
                    {prep.data.skill_gaps.length ? <ul className="list-disc space-y-1 pl-5 text-sm">{prep.data.skill_gaps.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="text-sm text-ink-500">None identified.</p>}
                    <p className="mb-1.5 mt-4 text-sm font-semibold">Matching strengths</p>
                    <ul className="list-disc space-y-1 pl-5 text-sm">{prep.data.matched_strengths.map((x) => <li key={x}>{x}</li>)}</ul>
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold">Practice questions</p>
                  <ol className="list-decimal space-y-1.5 pl-5 text-sm">
                    {prep.data.practice_questions.map((q) => (
                      <li key={q.question}>
                        {q.question} <span className="text-xs text-ink-400">({q.topic} · {titleCase(q.kind)})</span>
                      </li>
                    ))}
                  </ol>
                </div>
                <div>
                  <p className="mb-1.5 text-sm font-semibold">Tips</p>
                  <ul className="list-disc space-y-1 pl-5 text-sm">{prep.data.preparation_tips.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
                <AIDisclaimer text={prep.data.disclaimer} />
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Prepare for a role</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Role framework" htmlFor="role" hint="Competencies are a general industry framework, not this company’s official criteria.">
                <Select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                  <option value="">Select a role</option>
                  {roles.data?.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </Select>
              </Field>
              {selectedListing && (
                <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
                  Using listing: <span className="font-medium">{selectedListing.title}</span>
                </p>
              )}
              <div className="grid gap-2">
                <Button onClick={() => prep.mutate()} loading={prep.isPending} disabled={!roleId}>
                  <Sparkles /> Generate preparation brief
                </Button>
                <Button asChild variant="secondary" disabled={!roleId}>
                  <Link to={interviewLink} aria-disabled={!roleId} onClick={(e) => !roleId && e.preventDefault()}>
                    <Mic /> Start mock interview
                  </Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link to={listingId ? `/resume?listing=${listingId}` : '/resume'}>
                    <FileText /> Compare my resume
                  </Link>
                </Button>
                <Button variant="ghost" onClick={() => save.mutate()} loading={save.isPending}>
                  <Bookmark /> Save to my targets
                </Button>
              </div>
              {!roleId && <p className="text-xs text-ink-500">Choose a role to generate a brief or start an interview.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sources</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm">
                {(c.company_sources ?? []).map((s) => (
                  <li key={s.id}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline">
                      {s.title ?? titleCase(s.source_type)} <ExternalLink className="size-3" />
                    </a>
                    <p className="text-xs text-ink-500">
                      {titleCase(s.source_type)} · {s.last_checked_at ? `checked ${formatDate(s.last_checked_at)}` : 'not yet checked'}
                    </p>
                    {s.notes && <p className="text-xs text-amber-700">{s.notes}</p>}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-ink-500">InterviewOS does not store any company’s internal interview questions or candidate data.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
