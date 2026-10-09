import { MailCheck } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { Alert } from '@/components/ui/misc'
import { supabase } from '@/lib/supabase'
import { authErrorMessage, emailSchema, otpSchema } from '@/lib/validation'
import { AuthLayout } from './AuthLayout'
import { useResendCooldown } from './otp'

export default function VerifyEmail() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)
  const cooldown = useResendCooldown(email)

  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    const em = emailSchema.safeParse(email)
    const otp = otpSchema.safeParse(code)
    if (!em.success) return setError(em.error.issues[0].message)
    if (!otp.success) return setError(otp.error.issues[0].message)
    setVerifying(true)
    const { data, error: err } = await supabase.auth.verifyOtp({ email: em.data, token: otp.data, type: 'signup' })
    setVerifying(false)
    if (err || !data.session) {
      setError(err ? authErrorMessage(err) : 'Verification did not complete. Please try again.')
      return
    }
    navigate('/onboarding', { replace: true })
  }

  const resend = async () => {
    setError(null)
    setInfo(null)
    const em = emailSchema.safeParse(email)
    if (!em.success) return setError(em.error.issues[0].message)
    setResending(true)
    const { error: err } = await supabase.auth.resend({ type: 'signup', email: em.data })
    setResending(false)
    if (err) return setError(authErrorMessage(err))
    cooldown.restart()
    setInfo('A new code has been sent. It may take a minute to arrive. Check your spam folder too.')
  }

  return (
    <AuthLayout
      title="Verify your email"
      subtitle={
        <>
          Enter the verification code we sent to <span className="font-medium text-ink-700">{email || 'your email'}</span>.
        </>
      }
    >
      <form onSubmit={verify} noValidate className="space-y-4">
        <div className="flex justify-center">
          <div className="grid size-12 place-items-center rounded-full bg-brand-50 text-brand-600">
            <MailCheck className="size-6" aria-hidden />
          </div>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        {info && <Alert tone="success">{info}</Alert>}
        {!params.get('email') && (
          <Field label="Email address" htmlFor="email">
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        )}
        <Field label="Verification code" htmlFor="code" hint="Codes expire after a limited time. You can request a new one below.">
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={10}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="text-center font-mono text-lg tracking-[0.4em]"
            placeholder="••••••"
          />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={verifying}>
          Verify and continue
        </Button>
        <div className="flex items-center justify-between text-sm">
          <Link to="/login" className="text-ink-500 hover:text-ink-900">
            Back to log in
          </Link>
          <Button type="button" variant="link" onClick={resend} disabled={cooldown.remaining > 0 || resending}>
            {cooldown.remaining > 0 ? `Resend code in ${cooldown.remaining}s` : resending ? 'Sending…' : 'Resend code'}
          </Button>
        </div>
      </form>
    </AuthLayout>
  )
}
