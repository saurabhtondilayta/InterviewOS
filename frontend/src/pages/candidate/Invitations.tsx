import { useMutation, useQuery } from '@tanstack/react-query'
import { Building2, Mail, Mic, Video } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, Badge, EmptyState, PageHeader, PageLoader } from '@/components/ui/misc'
import { api, errorMessage } from '@/lib/api'
import { formatDateTime, INTERVIEW_TYPE_LABELS, titleCase } from '@/lib/utils'
import type { CandidateInvitation } from '@/types'

const TONE: Record<string, 'neutral' | 'brand' | 'success' | 'danger' | 'violet'> = { invited: 'brand', accepted: 'violet', in_progress: 'violet', completed: 'success', declined: 'danger', cancelled: 'neutral' }

export function InvitationCard({ inv }: { inv: CandidateInvitation }) {
  const live = inv.assessment.mode === 'live'
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">{live ? <Video className="size-5" /> : <Mic className="size-5" />}</div>
          <div className="min-w-0">
            <p className="font-semibold">{inv.assessment.title}</p>
            <p className="text-sm text-ink-500">
              <Building2 className="mr-1 inline size-3.5" aria-hidden />
              {inv.company.name} · {inv.assessment.role_title} · {live ? 'Live video interview' : `AI interview (${INTERVIEW_TYPE_LABELS[inv.assessment.interview_type]})`} · {inv.assessment.duration_minutes} min
            </p>
            {inv.scheduled_at && <p className="text-sm font-medium text-brand-700">Scheduled: {formatDateTime(inv.scheduled_at)}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={TONE[inv.status]}>{titleCase(inv.status)}</Badge>
          {!['declined', 'cancelled'].includes(inv.status) && (
            <Button asChild size="sm">
              <Link to={`/assessment/${inv.id}`}>{inv.status === 'completed' ? 'View' : inv.status === 'invited' ? 'Open invitation' : live ? 'Go to interview' : 'Continue'}</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function Invitations() {
  const { data, isPending, isError, error } = useQuery({ queryKey: ['my-invitations'], queryFn: () => api.get<CandidateInvitation[]>('/api/invitations') })
  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader title="Company invitations" description="Interviews companies have invited you to, or that you applied for through a link." />
      {isPending && <PageLoader />}
      {isError && <Alert tone="error">{errorMessage(error)}</Alert>}
      {data && data.length === 0 && <EmptyState icon={Mail} title="No invitations yet" description="When a company invites your email address to an interview, it appears here." />}
      {data?.map((inv) => <InvitationCard key={inv.id} inv={inv} />)}
    </div>
  )
}

/** /invite/:token — opened from the invitation email. */
export function InviteClaim() {
  const { token } = useParams()
  const navigate = useNavigate()
  const claim = useMutation({
    mutationFn: () => api.post<CandidateInvitation>('/api/invitations/claim', { token }),
    onSuccess: (inv) => navigate(`/assessment/${inv.id}`, { replace: true }),
  })
  useEffect(() => {
    claim.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])
  if (claim.isError)
    return (
      <div className="mx-auto max-w-lg">
        <Alert tone="error" title="Can’t open this invitation">
          {errorMessage(claim.error)}
        </Alert>
      </div>
    )
  return <PageLoader label="Opening your invitation" />
}

/** /apply/:token — open application link shared by a company. */
export function Apply() {
  const { token } = useParams()
  const navigate = useNavigate()
  const preview = useQuery({ queryKey: ['apply', token], queryFn: () => api.get<{ assessment: CandidateInvitation['assessment']; company: { name: string } }>(`/api/apply/${token}`) })
  const apply = useMutation({ mutationFn: () => api.post<CandidateInvitation>(`/api/apply/${token}`), onSuccess: (inv) => navigate(`/assessment/${inv.id}`) })
  if (preview.isPending) return <PageLoader />
  if (preview.isError) return <Alert tone="error">{errorMessage(preview.error)}</Alert>
  const a = preview.data.assessment
  return (
    <Card className="mx-auto max-w-xl">
      <CardContent className="space-y-4 pt-6">
        <p className="text-sm text-ink-500">{preview.data.company.name} is hiring</p>
        <h1 className="text-2xl font-semibold tracking-tight">{a.title}</h1>
        <p className="text-sm">
          {a.role_title} · {a.mode === 'live' ? 'Live video interview' : 'AI interview'} · {a.duration_minutes} minutes
        </p>
        {a.description && <p className="whitespace-pre-wrap text-sm text-ink-700">{a.description}</p>}
        {apply.isError && <Alert tone="error">{errorMessage(apply.error)}</Alert>}
        <Button onClick={() => apply.mutate()} loading={apply.isPending}>
          Apply and continue
        </Button>
      </CardContent>
    </Card>
  )
}
