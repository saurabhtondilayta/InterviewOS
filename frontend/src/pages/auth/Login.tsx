import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { Alert } from '@/components/ui/misc'
import { supabase } from '@/lib/supabase'
import { authErrorMessage, loginSchema, type LoginValues } from '@/lib/validation'
import { AuthLayout } from './AuthLayout'

export default function Login() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [error, setError] = useState<{ message: string; unverified?: string } | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  const onSubmit = async (v: LoginValues) => {
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({ email: v.email, password: v.password })
    if (err) {
      setError({ message: authErrorMessage(err), unverified: err.code === 'email_not_confirmed' ? v.email : undefined })
      return
    }
    const next = params.get('next')
    navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard', { replace: true })
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Log in to continue your interview preparation.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {error && (
          <Alert tone="error">
            {error.message}{' '}
            {error.unverified && (
              <Link className="font-medium underline" to={`/verify-email?email=${encodeURIComponent(error.unverified)}`}>
                Enter your code
              </Link>
            )}
          </Alert>
        )}
        <Field label="Email address" htmlFor="email" error={errors.email?.message}>
          <Input type="email" autoComplete="email" {...register('email')} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <Input type="password" autoComplete="current-password" {...register('password')} />
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-medium text-brand-600 hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
          Log in
        </Button>
        <p className="text-center text-sm text-ink-500">
          New to InterviewOS?{' '}
          <Link to="/register" className="font-medium text-brand-600 hover:underline">
            Create an account
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
