import { useMutation, useQueryClient } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/form'
import { Alert, Badge, PageHeader, PageLoader } from '@/components/ui/misc'
import { api, errorMessage } from '@/lib/api'
import { titleCase } from '@/lib/utils'
import type { OrgOverview } from '@/types'
import { useOrg } from './HrHome'

export default function Team() {
  const org = useOrg()
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'recruiter' | 'admin'>('recruiter')
  const add = useMutation({
    mutationFn: () => api.post<OrgOverview>('/api/org/members', { email: email.trim(), role }),
    onSuccess: (d) => {
      qc.setQueryData(['org'], d)
      setEmail('')
      toast.success('Team member added')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  if (org.isPending) return <PageLoader />
  if (org.isError) return <Alert tone="error">{errorMessage(org.error)}</Alert>
  const canManage = org.data.role === 'owner' || org.data.role === 'admin'

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Company & team" description={org.data.org.name} />
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Members ({org.data.members.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-line">
              {org.data.members.map((m) => (
                <li key={m.user_id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <p className="font-medium">{m.profiles?.full_name}</p>
                    <p className="text-xs text-ink-500">
                      {m.profiles?.email}
                      {m.profiles?.designation ? ` · ${m.profiles.designation}` : ''}
                    </p>
                  </div>
                  <Badge tone={m.role === 'owner' ? 'brand' : 'neutral'}>{titleCase(m.role)}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        {canManage && (
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="size-4" aria-hidden /> Add a teammate
                </CardTitle>
                <CardDescription>They need an InterviewOS account (sign up as Company HR) first.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  add.mutate()
                }}
              >
                <Field label="Email" htmlFor="member-email">
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Field label="Role" htmlFor="member-role">
                  <Select value={role} onChange={(e) => setRole(e.target.value as 'recruiter' | 'admin')}>
                    <option value="recruiter">Recruiter</option>
                    <option value="admin">Admin</option>
                  </Select>
                </Field>
                <Button type="submit" loading={add.isPending} disabled={!email.includes('@')}>
                  Add to company
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
