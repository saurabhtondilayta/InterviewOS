import { Link } from 'react-router'
import { cn } from '@/lib/utils'

export function Logo({ to = '/', className }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={cn('inline-flex items-center gap-2 font-semibold tracking-tight text-ink-900', className)} aria-label="InterviewOS home">
      <span className="grid size-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white shadow-sm">IO</span>
      <span>
        Interview<span className="text-brand-600">OS</span>
      </span>
    </Link>
  )
}
