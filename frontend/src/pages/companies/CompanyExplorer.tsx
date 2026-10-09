import { Building2, ExternalLink, Search, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { Link } from 'react-router'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/form'
import { Alert, Badge, EmptyState, PageHeader, Skeleton } from '@/components/ui/misc'
import { useCompanies } from '@/hooks/queries'
import { errorMessage } from '@/lib/api'
import { formatDate } from '@/lib/utils'

export default function CompanyExplorer() {
  const [q, setQ] = useState('')
  const deferred = useDeferredValue(q.trim())
  const { data, isPending, isError, error } = useCompanies(deferred)

  return (
    <div className="animate-fade-in">
      <PageHeader title="Company explorer" description="Real employers with official sources. Each record shows when it was last verified." />
      <div className="relative mb-6 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search companies" className="pl-9" aria-label="Search companies" />
      </div>

      {isError && <Alert tone="error">{errorMessage(error)}</Alert>}
      {isPending && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      )}
      {data && data.length === 0 && <EmptyState icon={Building2} title="No companies match your search" description="The company list is maintained from official sources by administrators." />}
      {data && data.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((c) => {
            const listings = c.job_listings?.[0]?.count ?? 0
            return (
              <Card key={c.id} className="transition-shadow hover:shadow-pop">
                <CardContent className="flex h-full flex-col pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="grid size-10 place-items-center rounded-lg bg-slate-100 text-sm font-semibold text-ink-700">{c.name.slice(0, 2)}</div>
                    {c.last_verified_at ? (
                      <Badge tone="success">
                        <ShieldCheck className="size-3" aria-hidden /> Verified {formatDate(c.last_verified_at)}
                      </Badge>
                    ) : (
                      <Badge tone="warning">
                        <ShieldAlert className="size-3" aria-hidden /> Not yet verified
                      </Badge>
                    )}
                  </div>
                  <Link to={`/companies/${c.slug}`} className="mt-3 font-semibold hover:text-brand-700">
                    {c.name}
                  </Link>
                  <p className="text-sm text-ink-500">{c.industry ?? '—'}</p>
                  <div className="mt-auto flex items-center justify-between pt-4 text-xs">
                    <span className="text-ink-500">{listings ? `${listings} verified listing${listings > 1 ? 's' : ''}` : 'General role practice'}</span>
                    {c.careers_url && (
                      <a href={c.careers_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                        Careers <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
