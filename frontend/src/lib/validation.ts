import { z } from 'zod'

const thisYear = new Date().getFullYear()

export const passwordSchema = z
  .string()
  .min(8, { error: 'Use at least 8 characters.' })
  .max(72, { error: 'Use at most 72 characters.' })
  .regex(/[a-z]/, { error: 'Include a lowercase letter.' })
  .regex(/[A-Z]/, { error: 'Include an uppercase letter.' })
  .regex(/\d/, { error: 'Include a number.' })

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email({ error: 'Enter a valid email address.' }))

const requiredText = (label: string, max = 120) =>
  z.string().trim().min(1, { error: `${label} is required.` }).max(max, { error: `${label} is too long.` })

export const registerSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .min(2, { error: 'Enter your full name.' })
      .max(120)
      .regex(/^[\p{L}\p{M}' .-]+$/u, { error: 'Use letters, spaces, apostrophes or hyphens only.' }),
    email: emailSchema,
    password: passwordSchema,
    confirm_password: z.string(),
    college: requiredText('College or university', 200),
    degree: requiredText('Degree'),
    branch: requiredText('Branch'),
    current_year: z.coerce.number({ error: 'Select your year.' }).int().min(1, { error: 'Select your year.' }).max(6),
    graduation_year: z.coerce
      .number({ error: 'Enter a graduation year.' })
      .int()
      .min(thisYear - 10, { error: 'Enter a realistic graduation year.' })
      .max(thisYear + 8, { error: 'Enter a realistic graduation year.' }),
    preferred_role: requiredText('Preferred job role'),
    skills: z.array(z.string().trim().min(1).max(60)).min(1, { error: 'Add at least one skill.' }).max(40),
    years_experience: z.coerce.number().min(0, { error: 'Cannot be negative.' }).max(50),
  })
  .refine((d) => d.password === d.confirm_password, { path: ['confirm_password'], error: 'Passwords do not match.' })

export type RegisterInput = z.input<typeof registerSchema>
export type RegisterValues = z.output<typeof registerSchema>

/** Company HR sign-up: creates a company account; the recruiter becomes its owner. */
export const recruiterRegisterSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .min(2, { error: 'Enter your full name.' })
      .max(120)
      .regex(/^[\p{L}\p{M}' .-]+$/u, { error: 'Use letters, spaces, apostrophes or hyphens only.' }),
    email: emailSchema,
    password: passwordSchema,
    confirm_password: z.string(),
    company_name: requiredText('Company name', 160).pipe(z.string().min(2, { error: 'Enter the company name.' })),
    company_website: z
      .string()
      .trim()
      .max(200)
      .refine((v) => v === '' || /^https?:\/\/\S+\.\S+/.test(v), { error: 'Use a full address like https://company.com' }),
    designation: requiredText('Your role', 120),
  })
  .refine((d) => d.password === d.confirm_password, { path: ['confirm_password'], error: 'Passwords do not match.' })

export type RecruiterRegisterValues = z.infer<typeof recruiterRegisterSchema>

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: 'Enter your password.' }),
})
export type LoginValues = z.infer<typeof loginSchema>

/** Supabase email OTPs are numeric; projects can configure 6-10 digits. */
export const otpSchema = z
  .string()
  .trim()
  .regex(/^\d{6,10}$/, { error: 'Enter the numeric code from your email.' })

export const newPasswordSchema = z
  .object({ password: passwordSchema, confirm_password: z.string() })
  .refine((d) => d.password === d.confirm_password, { path: ['confirm_password'], error: 'Passwords do not match.' })

export const RESUME_MAX_BYTES = 4 * 1024 * 1024
export const RESUME_TYPES: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
}

export function validateResumeFile(file: File): string | null {
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'))
  if (!['.pdf', '.docx'].includes(ext)) return 'Only PDF and DOCX files are supported.'
  if (file.type && !RESUME_TYPES[file.type]) return 'Only PDF and DOCX files are supported.'
  if (file.size === 0) return 'The file is empty.'
  if (file.size > RESUME_MAX_BYTES) return 'Files must be 4 MB or smaller.'
  return null
}

/** Map Supabase Auth errors to clear, user-facing messages. */
export function authErrorMessage(err: { code?: string; message?: string; status?: number } | null | undefined): string {
  if (!err) return 'Something went wrong.'
  switch (err.code) {
    case 'otp_expired':
      return 'This code has expired or was already used. Request a new code.'
    case 'invalid_credentials':
      return 'Incorrect email or password.'
    case 'email_not_confirmed':
      return 'Please verify your email address before logging in.'
    case 'user_already_exists':
    case 'email_exists':
      return 'An account with this email already exists. Try logging in instead.'
    case 'weak_password':
      return 'This password is too weak. Choose a stronger one.'
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Too many requests. Please wait a minute before trying again.'
    case 'same_password':
      return 'Your new password must be different from the old one.'
    case 'signup_disabled':
      return 'New sign-ups are currently disabled.'
  }
  if (err.status === 429) return 'Too many attempts. Please wait a minute before trying again.'
  if (/token has expired or is invalid/i.test(err.message ?? '')) return 'Incorrect or expired code. Check the email or request a new code.'
  return err.message || 'Something went wrong.'
}
