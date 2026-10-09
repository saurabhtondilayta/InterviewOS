import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { History as HistoryIcon, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, Badge, EmptyState, PageHeader, PageLoader, ScorePill } from '@/components/ui/misc'
import { api, errorMessage } from '@/lib/api'
import { formatDate, formatDateTime, INTERVIEW_TYPE_LABELS, titleCase } from '@/lib/utils'
import type { InterviewSession } from '@/types'

type Row = InterviewSession & { companies: { name: string } | null; interview_reports: { overall_score: number | null } | { overall_score: number | null }[] | null }
interface Trends {
  current_rubric: string
  groups: { interview_type: string; rubric_version: string; points: { session_id: string; date: string; overall: number | null }[] }[]
}

const reportOf = (r: Row) => (Array.isArray(r.interview_reports) ? r.interview_reports[0] : r.interview_reports)

export default function History() {
  const qc = useQueryClient()
  const rows = useQuery({ queryKey: ['history'], queryFn: () => api.get<Row[]>('/api/interviews?limit=100') })
  const trends = useQuery({ queryKey: ['trends'], queryFn: () => api.get<Trends>('/api/interviews/trends') })
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/interviews/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['history'] })
      qc.invalidateQueries({ queryKey: ['trends'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Interview deleted')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  if (rows.isPending) return <PageLoader />
  if (rows.isError) return <Alert tone="error">{errorMessage(rows.error)}</Alert>

  const comparable = trends.data?.groups.filter((g) => g.points.length >= 2) ?? []

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Interview history" description="Every mock interview you have taken, with reports and progress over time." actions={<Button asChild><Link to="/interview/new">New interview</Link></Button>} />

      {rows.data.length === 0 ? (
        <EmptyState icon={HistoryIcon} title="Complete your first mock interview to see your progress." action={<Button asChild><Link to="/interview/new">Start an interview</Link></Button>} />
      ) : (
        <>
          {comparable.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-2">
              {comparable.map((g) => (
                <Card key={`${g.interview_type}-${g.rubric_version}`}>
                  <CardHeader>
                    <div>
                      <CardTitle>{INTERVIEW_TYPE_LABELS[g.interview_type]} interviews</CardTitle>
                      <CardDescription>
                        Rubric {g.rubric_version} · {g.points.length} sessions. Only interviews of the same type and rubric are compared.
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={g.points.map((p) => ({ date: formatDate(p.date, { month: 'short', day: 'numeric' }), score: p.overall }))} margin={{ left: -20, right: 12 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <ChartTooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
                        <Line type="monotone" dataKey="score" stroke="#4f46e5" strokeWidth={2} dot={{ r: 3, fill: '#4f46e5' }} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {trends.data && comparable.length === 0 && <p className="text-sm text-ink-500">Progress charts appear once you complete at least two interviews of the same type.</p>}

          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-line bg-slate-50 text-left text-xs uppercase tracking-wide text-ink-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Interview</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Score</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.data.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link to={r.status === 'completed' || r.status === 'abandoned' ? `/interview/${r.id}/results` : `/interview/${r.id}`} className="font-medium hover:text-brand-700">
                          {r.role_title}
                        </Link>
                        <p className="text-xs text-ink-500">
                          {r.companies?.name ?? 'No company'}
                          {r.is_practice && ' · coding practice'}
                        </p>
                      </td>
                      <td className="px-4 py-3">{INTERVIEW_TYPE_LABELS[r.interview_type]}</td>
                      <td className="px-4 py-3 text-ink-500">{formatDateTime(r.created_at)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={r.status === 'completed' ? 'success' : r.status === 'in_progress' ? 'brand' : 'neutral'}>{titleCase(r.status)}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <ScorePill score={reportOf(r)?.overall_score} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete interview ${r.role_title}`}
                          onClick={() => {
                            if (confirm('Delete this interview and its report permanently?')) remove.mutate(r.id)
                          }}
                        >
                          <Trash2 />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
