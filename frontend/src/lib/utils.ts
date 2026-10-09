import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(value: string | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, opts).format(new Date(value))
}

export function formatDateTime(value: string | null | undefined) {
  return formatDate(value, { dateStyle: 'medium', timeStyle: 'short' })
}

export function relativeTime(value: string) {
  const diff = (Date.now() - new Date(value).getTime()) / 1000
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  if (diff < 60) return 'just now'
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), 'minute')
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour')
  if (diff < 86400 * 30) return rtf.format(-Math.round(diff / 86400), 'day')
  return formatDate(value)
}

export function titleCase(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export const INTERVIEW_TYPE_LABELS: Record<string, string> = {
  hr: 'HR',
  technical: 'Technical',
  resume: 'Resume-based',
  coding: 'Coding',
  behavioral: 'Behavioral',
  system_design: 'System design',
  company: 'Company-specific mock',
  full: 'Complete mock',
}

export function scoreTone(score: number | null | undefined, max = 10) {
  if (score == null) return 'text-ink-500'
  const pct = score / max
  if (pct >= 0.75) return 'text-emerald-600'
  if (pct >= 0.5) return 'text-amber-600'
  return 'text-rose-600'
}
