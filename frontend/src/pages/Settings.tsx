import { useMutation } from '@tanstack/react-query'
import { Download, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { SECTIONS, SectionForm } from '@/components/profile/ProfileSections'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/form'
import { Alert, PageHeader, PageLoader, Progress } from '@/components/ui/misc'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useProfile } from '@/hooks/queries'
import { api, downloadText, errorMessage } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { authErrorMessage, newPasswordSchema } from '@/lib/validation'

function PasswordCard() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid max-w-md gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            setError(null)
            const parsed = newPasswordSchema.safeParse({ password, confirm_password: confirm })
            if (!parsed.success) return setError(parsed.error.issues[0].message)
            setBusy(true)
            const { error: err } = await supabase.auth.updateUser({ password: parsed.data.password })
            setBusy(false)
            if (err) return setError(authErrorMessage(err))
            setPassword('')
            setConfirm('')
            toast.success('Password updated')
          }}
        >
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="New password" htmlFor="new-password">
            <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Confirm new password" htmlFor="confirm-password">
            <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <div>
            <Button type="submit" loading={busy}>
              Update password
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function DataCard() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [confirmText, setConfirmText] = useState('')
  const exportData = useMutation({
    mutationFn: () => api.get<unknown>('/api/account/export'),
    onSuccess: (d) => downloadText(`interviewos-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(d, null, 2), 'application/json'),
    onError: (e) => toast.error(errorMessage(e)),
  })
  const del = useMutation({
    mutationFn: () => api.del('/api/account'),
    onSuccess: async () => {
      await signOut()
      navigate('/', { replace: true })
      toast.success('Your account and data have been deleted')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Your data</CardTitle>
          <CardDescription>Download everything stored about you, or permanently delete your account.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => exportData.mutate()} loading={exportData.isPending}>
          <Download /> Export my data (JSON)
        </Button>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="danger">
              <ShieldAlert /> Delete account
            </Button>
          </DialogTrigger>
          <DialogContent title="Delete your account permanently?" description="This deletes your profile, resumes and files, analyses, interviews, reports, plans and chats. It cannot be undone.">
            <Field label='Type "DELETE" to confirm' htmlFor="confirm-delete">
              <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
            </Field>
            <div className="mt-4 flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="secondary">Cancel</Button>
              </DialogClose>
              <Button variant="danger" disabled={confirmText !== 'DELETE'} loading={del.isPending} onClick={() => del.mutate()}>
                Delete everything
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}

export default function Settings() {
  const { data } = useProfile()
  if (!data) return <PageLoader />
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Profile & settings" description={`Signed in as ${data.profile.email}`} />
      <Card>
        <CardContent className="pt-5">
          <div className="flex justify-between text-sm">
            <span className="font-medium">Profile completion</span>
            <span className="tabular-nums">{data.completion.percent}%</span>
          </div>
          <Progress value={data.completion.percent} className="mt-2" label="Profile completion" />
          <p className="mt-2 text-xs text-ink-500">A complete profile gives more relevant questions, analyses and plans. Nothing missing is ever guessed.</p>
        </CardContent>
      </Card>
      <Tabs defaultValue="education">
        <TabsList>
          {SECTIONS.map((s) => (
            <TabsTrigger key={s.key} value={s.key}>
              {s.label}
            </TabsTrigger>
          ))}
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>
        {SECTIONS.map((s) => (
          <TabsContent key={s.key} value={s.key}>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>{s.label}</CardTitle>
                  <CardDescription>{s.description}</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <SectionForm section={s.key} data={data} />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
        <TabsContent value="account" className="space-y-6">
          <PasswordCard />
          <DataCard />
        </TabsContent>
      </Tabs>
    </div>
  )
}
