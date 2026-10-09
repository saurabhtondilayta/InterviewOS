import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { Alert } from '@/components/ui/misc'
import { supabase } from '@/lib/supabase'
import { authErrorMessage, emailSchema, newPasswordSchema, otpSchema } from '@/lib/validation'
import { AuthLayout } from './AuthLayout'
import { useResendCooldown } from './otp'

type Step = 'email' | 'code' | 'password'

/** Password reset with an emailed one-time code (Supabase "recovery" OTP). */
export default function ForgotPassword() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const cooldown = useResendCooldown(`reset:${email}`)

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setError(null)
    const em = emailSchema.safeParse(email)
    if (!em.success) return setError(em.error.issues[0].message)
    setBusy(true)
    const { error: err } = await supabase.auth.resetPasswordForEmail(em.data)
    setBusy(false)
    if (err) return setError(authErrorMessage(err))
    cooldown.restart()
    setStep('code')
  }

  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const otp = otpSchema.safeParse(code)
    if (!otp.success) return setError(otp.error.issues[0].message)
    setBusy(true)
    const { error: err } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: otp.data, type: 'recovery' })
    setBusy(false)
    if (err) return setError(authErrorMessage(err))
    setStep('password')
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const parsed = newPasswordSchema.safeParse({ password, confirm_password: confirm })
    if (!parsed.success) return setError(parsed.error.issues[0].message)
    setBusy(true)
    const { error: err } = await supabase.auth.updateUser({ password: parsed.data.password })
    setBusy(false)
    if (err) return setError(authErrorMessage(err))
    navigate('/dashboard', { replace: true })
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle={
        step === 'email'
          ? "Enter your account's email address and we'll send you a reset code."
          : step === 'code'
            ? `If an account exists for ${email}, a reset code is on its way.`
            : 'Choose a new password.'
      }
    >
      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}
      {step === 'email' && (
        <form onSubmit={sendCode} noValidate className="space-y-4">
          <Field label="Email address" htmlFor="email">
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" size="lg" loading={busy}>
            Send reset code
          </Button>
        </form>
      )}
      {step === 'code' && (
        <form onSubmit={verify} noValidate className="space-y-4">
          <Field label="Reset code" htmlFor="code">
            <Input inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="text-center font-mono text-lg tracking-[0.4em]" />
          </Field>
          <Button type="submit" className="w-full" size="lg" loading={busy}>
            Verify code
          </Button>
          <div className="flex justify-between text-sm">
            <button type="button" className="text-ink-500 hover:text-ink-900" onClick={() => setStep('email')}>
              Use a different email
            </button>
            <Button type="button" variant="link" disabled={cooldown.remaining > 0 || busy} onClick={() => sendCode()}>
              {cooldown.remaining > 0 ? `Resend in ${cooldown.remaining}s` : 'Resend code'}
            </Button>
          </div>
        </form>
      )}
      {step === 'password' && (
        <form onSubmit={save} noValidate className="space-y-4">
          <Field label="New password" htmlFor="password" hint="At least 8 characters with upper- and lowercase letters and a number.">
            <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Confirm new password" htmlFor="confirm">
            <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" size="lg" loading={busy}>
            Save password
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link to="/login" className="text-ink-500 hover:text-ink-900">
          Back to log in
        </Link>
      </p>
    </AuthLayout>
  )
}
