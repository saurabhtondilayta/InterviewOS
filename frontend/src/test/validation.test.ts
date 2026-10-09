import { describe, expect, it } from 'vitest'
import { authErrorMessage, loginSchema, newPasswordSchema, otpSchema, registerSchema, validateResumeFile } from '@/lib/validation'

const year = new Date().getFullYear()
const valid = {
  full_name: "Ananya D'Souza",
  email: '  Ananya@Example.COM ',
  password: 'Str0ngPass',
  confirm_password: 'Str0ngPass',
  college: 'Some University',
  degree: 'B.Tech',
  branch: 'Computer Science',
  current_year: '3',
  graduation_year: String(year + 1),
  preferred_role: 'Cloud Engineer',
  skills: ['Python', 'AWS'],
  years_experience: '0',
}

describe('registerSchema', () => {
  it('accepts a complete registration and normalises values', () => {
    const r = registerSchema.safeParse(valid)
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.email).toBe('ananya@example.com')
      expect(r.data.current_year).toBe(3)
      expect(r.data.years_experience).toBe(0)
    }
  })

  it.each([
    ['password too short', { password: 'Ab1', confirm_password: 'Ab1' }, 'password'],
    ['password without number', { password: 'NoNumbersHere', confirm_password: 'NoNumbersHere' }, 'password'],
    ['mismatched confirmation', { confirm_password: 'Different1A' }, 'confirm_password'],
    ['invalid email', { email: 'not-an-email' }, 'email'],
    ['no skills', { skills: [] }, 'skills'],
    ['unrealistic graduation year', { graduation_year: '1975' }, 'graduation_year'],
    ['name with digits', { full_name: 'R2D2' }, 'full_name'],
    ['missing college', { college: '  ' }, 'college'],
    ['negative experience', { years_experience: '-1' }, 'years_experience'],
  ])('rejects %s', (_, patch, field) => {
    const r = registerSchema.safeParse({ ...valid, ...patch })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.map((i) => i.path[0])).toContain(field)
  })
})

describe('otpSchema', () => {
  it.each(['123456', '12345678', '0000001234'])('accepts %s', (code) => expect(otpSchema.safeParse(code).success).toBe(true))
  it.each(['12345', 'abcdef', '12 3456', '12345678901'])('rejects %s', (code) => expect(otpSchema.safeParse(code).success).toBe(false))
})

describe('loginSchema / newPasswordSchema', () => {
  it('requires a password on login', () => expect(loginSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false))
  it('enforces matching new passwords', () => {
    expect(newPasswordSchema.safeParse({ password: 'Abcdefg1', confirm_password: 'Abcdefg1' }).success).toBe(true)
    expect(newPasswordSchema.safeParse({ password: 'Abcdefg1', confirm_password: 'Abcdefg2' }).success).toBe(false)
  })
})

describe('validateResumeFile', () => {
  const file = (name: string, type: string, size = 1000) => new File([new Uint8Array(size)], name, { type })
  it('accepts PDF and DOCX', () => {
    expect(validateResumeFile(file('cv.pdf', 'application/pdf'))).toBeNull()
    expect(validateResumeFile(file('cv.DOCX', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))).toBeNull()
  })
  it('rejects other types, empty and oversized files', () => {
    expect(validateResumeFile(file('cv.doc', 'application/msword'))).toMatch(/PDF and DOCX/)
    expect(validateResumeFile(file('cv.pdf', 'image/png'))).toMatch(/PDF and DOCX/)
    expect(validateResumeFile(file('cv.pdf', 'application/pdf', 0))).toMatch(/empty/)
    expect(validateResumeFile(file('cv.pdf', 'application/pdf', 6 * 1024 * 1024))).toMatch(/5 MB/)
  })
})

describe('authErrorMessage', () => {
  it('explains expired OTPs', () => expect(authErrorMessage({ code: 'otp_expired' })).toMatch(/expired/))
  it('explains rate limits', () => expect(authErrorMessage({ code: 'over_email_send_rate_limit' })).toMatch(/wait/))
  it('explains invalid codes from message text', () => expect(authErrorMessage({ message: 'Token has expired or is invalid' })).toMatch(/Incorrect or expired/))
})
