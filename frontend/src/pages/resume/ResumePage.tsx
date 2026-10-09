import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileText, Star, Trash2, UploadCloud } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { AIDisclaimer, Alert, Badge, EmptyState, PageHeader, PageLoader, ScorePill } from '@/components/ui/misc'
import { useProfile, useResumes } from '@/hooks/queries'
import { api, errorMessage } from '@/lib/api'
import { formatDate, relativeTime } from '@/lib/utils'
import { validateResumeFile } from '@/lib/validation'
import type { JobListing, ResumeAnalysis, ResumeSummary } from '@/types'

function UploadCard() {
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return api.upload<ResumeSummary>('/api/resumes', form)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resumes'] })
      toast.success('Resume uploaded and text extracted')
    },
    onError: (e) => setError(errorMessage(e)),
  })

  const pick = (file: File | undefined) => {
    setError(null)
    if (!file) return
    const problem = validateResumeFile(file)
    if (problem) return setError(problem)
    upload.mutate(file)
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            pick(e.dataTransfer.files[0])
          }}
          className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${dragging ? 'border-brand-400 bg-brand-50' : 'border-line'}`}
        >
          <div className="grid size-12 place-items-center rounded-full bg-brand-50 text-brand-600">
            <UploadCloud className="size-6" aria-hidden />
          </div>
          <p className="mt-3 font-medium">Drop your resume here, or browse</p>
          <p className="mt-1 text-sm text-ink-500">PDF or DOCX, up to 4 MB. Text-based files work best — scanned images can’t be read.</p>
          <input ref={inputRef} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" onChange={(e) => pick(e.target.files?.[0] ?? undefined)} aria-label="Choose resume file" />
          <Button className="mt-4" onClick={() => inputRef.current?.click()} loading={upload.isPending}>
            {upload.isPending ? 'Uploading and reading…' : 'Choose file'}
          </Button>
        </div>
        {error && (
          <Alert tone="error" className="mt-4">
            {error}
          </Alert>
        )}
        <p className="mt-3 text-xs text-ink-500">Files are stored privately in your account. Each upload is kept as a separate version; nothing is overwritten.</p>
      </CardContent>
    </Card>
  )
}

function AnalyzeForm({ resumes }: { resumes: ResumeSummary[] }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { data: profile } = useProfile()
  const listingId = params.get('listing')
  const listing = useQuery({ queryKey: ['listing', listingId], queryFn: () => api.get<JobListing & { companies: { name: string } }>(`/api/job-listings/${listingId}`), enabled: Boolean(listingId) })

  const primary = resumes.find((r) => r.is_primary) ?? resumes[0]
  const [resumeId, setResumeId] = useState(primary?.id ?? '')
  const [role, setRole] = useState(profile?.profile.target_roles[0] ?? profile?.profile.preferred_role ?? '')
  const [jd, setJd] = useState('')
  const [useListing, setUseListing] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const analyze = useMutation({
    mutationFn: () =>
      api.post<ResumeAnalysis>(`/api/resumes/${resumeId}/analyses`, {
        target_role: role.trim() || listing.data?.title,
        job_listing_id: useListing && listingId ? listingId : null,
        job_description: !(useListing && listingId) && jd.trim() ? jd.trim() : null,
      }),
    onSuccess: (a) => navigate(`/resume/analysis/${a.id}`),
    onError: (e) => setError(errorMessage(e)),
  })

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Analyse a resume</CardTitle>
          <CardDescription>Get feedback for a target role, optionally compared with a job description.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            setError(null)
            if (!resumeId) return setError('Upload a resume first.')
            if (!role.trim() && !listing.data) return setError('Enter the role you are targeting.')
            analyze.mutate()
          }}
        >
          {error && <Alert tone="error">{error}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Resume" htmlFor="resume">
              <Select value={resumeId} onChange={(e) => setResumeId(e.target.value)}>
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.original_filename} ({formatDate(r.created_at)})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Target role" htmlFor="role">
              <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Cloud Engineer" maxLength={120} />
            </Field>
          </div>
          {listingId && listing.data ? (
            <label className="flex items-start gap-2 rounded-lg border border-line p-3 text-sm">
              <input type="checkbox" className="mt-1" checked={useListing} onChange={(e) => setUseListing(e.target.checked)} />
              <span>
                Compare with <span className="font-medium">{listing.data.title}</span> at {listing.data.companies.name}
                <span className="block text-xs text-ink-500">Job description from the official source, last verified {formatDate(listing.data.last_verified_at)}.</span>
              </span>
            </label>
          ) : null}
          {!(useListing && listingId) && (
            <Field label="Job description (optional)" htmlFor="jd" hint="Paste a job description to get a requirement-by-requirement comparison.">
              <Textarea value={jd} onChange={(e) => setJd(e.target.value)} rows={5} maxLength={20000} />
            </Field>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={analyze.isPending} disabled={!resumes.length}>
              {analyze.isPending ? 'Analysing (this can take up to a minute)…' : 'Analyse resume'}
            </Button>
            <AIDisclaimer text="Your contact details (email, phone, profile links) are removed before the text is sent to the AI." />
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function ResumeRow({ r }: { r: ResumeSummary }) {
  const qc = useQueryClient()
  const remove = useMutation({
    mutationFn: () => api.del(`/api/resumes/${r.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resumes'] })
      toast.success('Resume deleted')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const primary = useMutation({
    mutationFn: () => api.post(`/api/resumes/${r.id}/primary`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['resumes'] }),
    onError: (e) => toast.error(errorMessage(e)),
  })
  const download = async () => {
    try {
      const { url } = await api.get<{ url: string }>(`/api/resumes/${r.id}/download-url`)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-center gap-3">
        <FileText className="size-5 text-ink-400" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate text-sm font-medium">
            {r.original_filename} {r.is_primary && <Badge tone="brand">Primary</Badge>}
          </p>
          <p className="text-xs text-ink-500">
            {(r.size_bytes / 1024).toFixed(0)} KB · uploaded {relativeTime(r.created_at)}
            {r.page_count ? ` · ${r.page_count} page${r.page_count > 1 ? 's' : ''}` : ''}
          </p>
        </div>
        <div className="flex gap-1">
          {!r.is_primary && (
            <Button variant="ghost" size="sm" onClick={() => primary.mutate()} loading={primary.isPending}>
              <Star /> Make primary
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={download} aria-label={`Download ${r.original_filename}`}>
            <Download />
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`Delete ${r.original_filename}`}>
                <Trash2 />
              </Button>
            </DialogTrigger>
            <DialogContent title="Delete this resume?" description="The file and all of its analyses will be permanently deleted.">
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button variant="secondary">Cancel</Button>
                </DialogClose>
                <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
                  Delete
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      {r.resume_analyses.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2 pl-8">
          {r.resume_analyses.map((a) => (
            <li key={a.id}>
              <Link to={`/resume/analysis/${a.id}`} className="inline-flex items-center gap-2 rounded-lg border border-line px-2.5 py-1 text-xs hover:border-brand-200 hover:bg-brand-50">
                {a.target_role} <ScorePill score={a.overall_score} max={100} className="text-xs" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

export default function ResumePage() {
  const { data, isPending, isError, error } = useResumes()
  return (
    <div className="animate-fade-in">
      <PageHeader title="Resume analyzer" description="Upload your resume and get structured, role-specific feedback." />
      {isPending ? (
        <PageLoader />
      ) : isError ? (
        <Alert tone="error">{errorMessage(error)}</Alert>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-6">
            <UploadCard />
            <Card>
              <CardHeader>
                <CardTitle>Your resumes</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {data.length === 0 ? <EmptyState icon={FileText} title="No resumes uploaded yet" className="mt-4" /> : <ul className="divide-y divide-line">{data.map((r) => <ResumeRow key={r.id} r={r} />)}</ul>}
              </CardContent>
            </Card>
          </div>
          <div>{data.length > 0 ? <AnalyzeForm resumes={data} /> : <EmptyState icon={UploadCloud} title="Upload a resume to start" description="Once uploaded, you can analyse it for any target role or job description." />}</div>
        </div>
      )}
    </div>
  )
}
