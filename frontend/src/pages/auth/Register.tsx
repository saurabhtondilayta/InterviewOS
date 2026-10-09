import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/form'
import { Alert } from '@/components/ui/misc'
import { TagInput } from '@/components/ui/tag-input'
import { supabase } from '@/lib/supabase'
import { authErrorMessage, registerSchema, type RegisterInput, type RegisterValues } from '@/lib/validation'
import { AuthLayout } from './AuthLayout'
import { startResendCooldown } from './otp'

const SKILL_SUGGESTIONS = ['Python', 'Java', 'C++', 'JavaScript', 'SQL', 'React', 'Data Structures', 'Git', 'AWS', 'Linux']

export default function Register() {
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput, unknown, RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { skills: [], years_experience: 0 },
    mode: 'onTouched',
  })

  const onSubmit = async (v: RegisterValues) => {
    setServerError(null)
    const { data, error } = await supabase.auth.signUp({
      email: v.email,
      password: v.password,
      options: {
        // Stored as user metadata; a database trigger copies it into the profile once the email is verified.
        data: {
          full_name: v.full_name,
          college: v.college,
          degree: v.degree,
          branch: v.branch,
          current_year: String(v.current_year),
          graduation_year: String(v.graduation_year),
          preferred_role: v.preferred_role,
          skills: v.skills,
          years_experience: String(v.years_experience),
        },
      },
    })
    if (error) {
      setServerError(authErrorMessage(error))
      return
    }
    // Supabase hides whether an address is registered; an empty identities list means it already exists.
    if (data.user && data.user.identities?.length === 0) {
      setServerError('An account with this email already exists. Log in instead, or reset your password.')
      return
    }
    startResendCooldown(v.email)
    navigate(`/verify-email?email=${encodeURIComponent(v.email)}`)
  }

  const year = new Date().getFullYear()

  return (
    <AuthLayout title="Create your account" subtitle="We'll send a verification code to your email." wide>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {serverError && <Alert tone="error">{serverError}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="full_name" error={errors.full_name?.message} required className="sm:col-span-2">
            <Input autoComplete="name" {...register('full_name')} />
          </Field>
          <Field label="Email address" htmlFor="email" error={errors.email?.message} required className="sm:col-span-2">
            <Input type="email" autoComplete="email" {...register('email')} />
          </Field>
          <Field label="Password" htmlFor="password" error={errors.password?.message} hint="At least 8 characters with upper- and lowercase letters and a number." required>
            <Input type="password" autoComplete="new-password" {...register('password')} />
          </Field>
          <Field label="Confirm password" htmlFor="confirm_password" error={errors.confirm_password?.message} required>
            <Input type="password" autoComplete="new-password" {...register('confirm_password')} />
          </Field>
        </div>

        <fieldset className="grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-semibold text-ink-900">Education</legend>
          <Field label="College or university" htmlFor="college" error={errors.college?.message} required className="sm:col-span-2">
            <Input autoComplete="organization" {...register('college')} />
          </Field>
          <Field label="Degree" htmlFor="degree" error={errors.degree?.message} required>
            <Input placeholder="e.g. B.Tech, B.E., BCA" {...register('degree')} />
          </Field>
          <Field label="Branch" htmlFor="branch" error={errors.branch?.message} required>
            <Input placeholder="e.g. Computer Science, Cloud Computing" {...register('branch')} />
          </Field>
          <Field label="Current year of study" htmlFor="current_year" error={errors.current_year?.message} required>
            <Select defaultValue="" {...register('current_year')}>
              <option value="" disabled>
                Select
              </option>
              {[1, 2, 3, 4, 5, 6].map((y) => (
                <option key={y} value={y}>
                  Year {y}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Graduation year" htmlFor="graduation_year" error={errors.graduation_year?.message} required>
            <Input type="number" inputMode="numeric" min={year - 10} max={year + 8} {...register('graduation_year')} />
          </Field>
        </fieldset>

        <fieldset className="grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-semibold text-ink-900">Career goals</legend>
          <Field label="Preferred job role" htmlFor="preferred_role" error={errors.preferred_role?.message} required>
            <Input placeholder="e.g. Software Engineer" {...register('preferred_role')} />
          </Field>
          <Field label="Years of experience" htmlFor="years_experience" error={errors.years_experience?.message} hint="Internships count; enter 0 if none.">
            <Input type="number" step="0.5" min={0} max={50} {...register('years_experience')} />
          </Field>
          <Field label="Skills" htmlFor="skills" error={errors.skills?.message} hint="Press Enter after each skill." required className="sm:col-span-2">
            <Controller control={control} name="skills" render={({ field }) => <TagInput value={field.value ?? []} onChange={field.onChange} placeholder="Add a skill" suggestions={SKILL_SUGGESTIONS} />} />
          </Field>
        </fieldset>

        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
          Create account
        </Button>
        <p className="text-center text-sm text-ink-500">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-600 hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
