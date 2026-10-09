import { useEffect, useState } from 'react'

/** Matches Supabase's default email rate limit of one OTP per 60 seconds per address. */
export const RESEND_COOLDOWN_SECONDS = 60
const key = (email: string) => `interviewos:otp-sent:${email.toLowerCase()}`

export function startResendCooldown(email: string) {
  try {
    sessionStorage.setItem(key(email), String(Date.now()))
  } catch {
    /* storage unavailable */
  }
}

export function secondsUntilResend(email: string, now = Date.now()): number {
  try {
    const sent = Number(sessionStorage.getItem(key(email)) || 0)
    return Math.max(0, Math.ceil((sent + RESEND_COOLDOWN_SECONDS * 1000 - now) / 1000))
  } catch {
    return 0
  }
}

export function useResendCooldown(email: string) {
  const [remaining, setRemaining] = useState(() => secondsUntilResend(email))
  useEffect(() => {
    setRemaining(secondsUntilResend(email))
    const t = setInterval(() => setRemaining(secondsUntilResend(email)), 1000)
    return () => clearInterval(t)
  }, [email])
  return {
    remaining,
    restart: () => {
      startResendCooldown(email)
      setRemaining(RESEND_COOLDOWN_SECONDS)
    },
  }
}
