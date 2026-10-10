import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Briefcase, ClipboardPlus, Mic, Users, Video } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/form'
import { Alert, Badge, EmptyState, PageHeader, PageLoader } from '@/components/ui/misc'
import { ApiError, api, errorMessage } from '@/lib/api'
import { formatDate, INTERVIEW_TYPE_LABELS } from '@/lib/utils'
import type { Assessment, OrgOverview } from '@/types'

export function useOrg() {
  return useQuery({ queryKey: ['org'], queryFn: () => api.get<OrgOverview>('/api/org'), retry: false })
}

function CreateCompany() {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [website, setWebsite] = useState('')
  const create = useMutation({
    mutationFn: () => api.post<OrgOverview>('/api/org', { name: name.trim(), website: website.trim() || null }),
    onSuccess: (d) => {
      qc.setQueryData(['org'], d)
      qc.invalidateQueries({ queryKey: ['profile'] })
    },
  })
  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle>Set up your company</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate()
          }}
        >
          {create.isError && <Alert tone="error">{errorMessage(create.error)}</Alert>}
          <Field label="Company name" htmlFor="org-name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={160} />
          </Field>
          <Field label="Website (optional)" htmlFor="org-web">
            <Input type="url" placeholder="https://" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </Field>
          <Button type="submit" loading={create.isPending} disabled={name.trim().length < 2}>
            Create company
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export default function HrHome() {
  const org = useOrg()
  const assessments = useQuery({ queryKey: ['assessments'], queryFn: () => api.get<Assessment[]>('/api/org/assessments'), enabled: org.isSuccess })

  if (org.isPending) return <PageLoader />
  if (org.isError) {
    if (org.error instanceof ApiError && org.error.code === 'not_company_member') return <CreateCompany />
    return <Alert tone="error">{errorMessage(org.error)}</Alert>
  }
  const list = assessments.data ?? []
  const totals = list.reduce((t, a) => ({ total: t.total + (a.counts?.total ?? 0), completed: t.completed + (a.counts?.completed ?? 0), pending: t.pending + (a.counts?.pending ?? 0) }), { total: 0, completed: 0, pending: 0 })

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={org.data.org.name}
        description="Create interview rounds, invite candidates, and review AI interview results and proctoring reports."
        actions={
          <Button asChild>
            <Link to="/hr/assessments/new">
              <ClipboardPlus /> New assessment
            </Link>
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Candidates invited', value: totals.total, icon: Users },
          { label: 'Interviews completed', value: totals.completed, icon: Briefcase },
          { label: 'Awaiting candidate', value: totals.pending, icon: Mic },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 pt-5">
              <div className="grid size-10 place-items-center rounded-lg bg-brand-50 text-brand-600">
                <s.icon className="size-5" aria-hidden />
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
                <p className="text-xs text-ink-500">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assessments</CardTitle>
        </CardHeader>
        <CardContent>
          {assessments.isPending ? (
            <PageLoader />
          ) : list.length === 0 ? (
            <EmptyState icon={ClipboardPlus} title="No assessments yet" description="Create an AI-led interview or schedule live 1-on-1 video interviews, then invite candidates." action={<Button asChild size="sm"><Link to="/hr/assessments/new">Create assessment</Link></Button>} />
          ) : (
            <ul className="divide-y divide-line">
              {list.map((a) => (
                <li key={a.id}>
                  <Link to={`/hr/assessments/${a.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-medium">
                        {a.mode === 'live' ? <Video className="size-4 text-accent-600" aria-label="Live" /> : <Mic className="size-4 text-brand-600" aria-label="AI" />}
                        {a.title}
                      </p>
                      <p className="text-xs text-ink-500">
                        {a.role_title} · {a.mode === 'live' ? 'Live 1-on-1 video' : `AI interview · ${INTERVIEW_TYPE_LABELS[a.interview_type]}`} · created {formatDate(a.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Badge>{a.counts?.total ?? 0} invited</Badge>
                      <Badge tone="success">{a.counts?.completed ?? 0} completed</Badge>
                      <Badge tone={a.status === 'open' ? 'brand' : 'neutral'}>{a.status === 'open' ? 'Open' : 'Closed'}</Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
