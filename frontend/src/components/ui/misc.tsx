import * as ProgressPrimitive from '@radix-ui/react-progress'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { AlertCircle, CheckCircle2, Info, Loader2, TriangleAlert } from 'lucide-react'
import type * as React from 'react'
import { cn } from '@/lib/utils'

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-sm text-ink-500', className)}>
      <Loader2 className="size-4 animate-spin" aria-hidden />
      <span>{label}…</span>
    </span>
  )
}

export function PageLoader({ label }: { label?: string }) {
  return (
    <div className="flex min-h-64 items-center justify-center">
      <Spinner label={label} />
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200/70', className)} aria-hidden />
}

const badgeTones = {
  neutral: 'bg-slate-100 text-ink-700',
  brand: 'bg-brand-50 text-brand-700 ring-1 ring-brand-100',
  success: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
  warning: 'bg-amber-50 text-amber-800 ring-1 ring-amber-100',
  danger: 'bg-rose-50 text-rose-700 ring-1 ring-rose-100',
  violet: 'bg-violet-50 text-violet-700 ring-1 ring-violet-100',
}

export function Badge({ tone = 'neutral', className, children }: { tone?: keyof typeof badgeTones; className?: string; children: React.ReactNode }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', badgeTones[tone], className)}>{children}</span>
}

export function Progress({ value, className, label }: { value: number; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <ProgressPrimitive.Root value={v} aria-label={label} className={cn('relative h-2 w-full overflow-hidden rounded-full bg-slate-100', className)}>
      <ProgressPrimitive.Indicator className="h-full rounded-full bg-gradient-to-r from-brand-600 to-accent-500 transition-transform duration-500" style={{ transform: `translateX(-${100 - v}%)` }} />
    </ProgressPrimitive.Root>
  )
}

const alertTones = {
  info: { cls: 'border-brand-100 bg-brand-50 text-brand-800', icon: Info },
  success: { cls: 'border-emerald-100 bg-emerald-50 text-emerald-800', icon: CheckCircle2 },
  warning: { cls: 'border-amber-200 bg-amber-50 text-amber-900', icon: TriangleAlert },
  error: { cls: 'border-rose-200 bg-rose-50 text-rose-800', icon: AlertCircle },
}

export function Alert({ tone = 'info', title, children, className, action }: { tone?: keyof typeof alertTones; title?: string; children?: React.ReactNode; className?: string; action?: React.ReactNode }) {
  const { cls, icon: Icon } = alertTones[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-lg border px-4 py-3 text-sm', cls, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
      {action}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, description, action, className }: { icon: React.ElementType; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-white px-6 py-10 text-center', className)}>
      <div className="mb-3 grid size-11 place-items-center rounded-full bg-brand-50 text-brand-600">
        <Icon className="size-5" aria-hidden />
      </div>
      <p className="font-medium text-ink-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Tooltip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Root delayDuration={200}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content sideOffset={6} className="z-50 max-w-xs rounded-md bg-ink-900 px-2.5 py-1.5 text-xs leading-relaxed text-white shadow-pop animate-fade-in">
          {content}
          <TooltipPrimitive.Arrow className="fill-ink-900" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

export function ScorePill({ score, max = 10, className }: { score: number | null | undefined; max?: number; className?: string }) {
  if (score == null) return <span className={cn('text-sm text-ink-400', className)}>—</span>
  const pct = score / max
  const tone = pct >= 0.75 ? 'bg-emerald-50 text-emerald-700' : pct >= 0.5 ? 'bg-amber-50 text-amber-800' : 'bg-rose-50 text-rose-700'
  return (
    <span className={cn('inline-flex items-baseline gap-0.5 rounded-md px-2 py-0.5 font-semibold tabular-nums', tone, className)}>
      {Number(score).toFixed(max === 100 ? 0 : 1)}
      <span className="text-[0.7em] font-medium opacity-70">/{max}</span>
    </span>
  )
}

export function AIDisclaimer({ text, className }: { text?: string; className?: string }) {
  return (
    <p className={cn('flex items-start gap-1.5 text-xs text-ink-500', className)}>
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      {text ?? 'AI-generated practice feedback. It may contain mistakes and is not an assessment of employability.'}
    </p>
  )
}
