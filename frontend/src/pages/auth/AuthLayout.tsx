import { Logo } from '@/components/layout/Logo'
import { Alert } from '@/components/ui/misc'
import { supabaseConfigured } from '@/lib/supabase'

export function AuthLayout({ title, subtitle, children, wide = false }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-brand-50/60 via-surface to-surface">
      <header className="px-6 py-5">
        <Logo />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-4 sm:pt-10">
        <div className={wide ? 'w-full max-w-2xl' : 'w-full max-w-md'}>
          <div className="rounded-2xl border border-line bg-white p-6 shadow-card sm:p-8">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-ink-500">{subtitle}</p>}
            {!supabaseConfigured && (
              <Alert tone="warning" title="Authentication is not configured" className="mt-4">
                Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local, then restart the dev server.
              </Alert>
            )}
            <div className="mt-6">{children}</div>
          </div>
        </div>
      </main>
    </div>
  )
}
