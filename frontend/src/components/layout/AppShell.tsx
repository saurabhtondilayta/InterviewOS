import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  Bot,
  Building2,
  ChevronDown,
  Code2,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Menu,
  Mic,
  Settings,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router'
import { useAuth } from '@/auth/AuthProvider'
import { useProfile } from '@/hooks/queries'
import { cn } from '@/lib/utils'
import { Logo } from './Logo'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/resume', label: 'Resume analyzer', icon: FileText },
  { to: '/companies', label: 'Companies', icon: Building2 },
  { to: '/interview/new', label: 'Mock interview', icon: Mic },
  { to: '/coding', label: 'Coding practice', icon: Code2 },
  { to: '/coach', label: 'AI career coach', icon: Bot },
  { to: '/learning', label: 'Learning plan', icon: MapIcon },
  { to: '/history', label: 'Interview history', icon: History },
]

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-500 hover:bg-slate-100 hover:text-ink-900',
            )
          }
        >
          <Icon className="size-4" aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

function UserMenu() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const { data } = useProfile()
  const name = data?.profile.full_name ?? ''
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-100" aria-label="Account menu">
        <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500 text-xs font-semibold text-white">{initials || '?'}</span>
        <span className="hidden max-w-40 truncate font-medium text-ink-700 sm:block">{name}</span>
        <ChevronDown className="size-4 text-ink-400" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-48 rounded-lg border border-line bg-white p-1 shadow-pop animate-fade-in">
          <div className="px-2 py-1.5 text-xs text-ink-500">{data?.profile.email}</div>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item onSelect={() => navigate('/settings')} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-slate-100">
            <Settings className="size-4" aria-hidden /> Profile & settings
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={async () => {
              await signOut()
              navigate('/login')
            }}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-rose-600 outline-none data-[highlighted]:bg-rose-50"
          >
            <LogOut className="size-4" aria-hidden /> Log out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export function AppShell() {
  // The mobile drawer closes itself when a nav link is clicked (onNavigate).
  const [open, setOpen] = useState(false)

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:shadow-pop">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-white px-4 py-5 lg:flex">
        <Logo to="/dashboard" className="px-2" />
        <div className="mt-8 flex-1">
          <NavItems />
        </div>
        <NavLink to="/settings" className={({ isActive }) => cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium', isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-500 hover:bg-slate-100')}>
          <Settings className="size-4" aria-hidden /> Settings
        </NavLink>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-ink-900/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white px-4 py-5 shadow-pop animate-fade-in">
            <div className="flex items-center justify-between">
              <Logo to="/dashboard" className="px-2" />
              <button onClick={() => setOpen(false)} className="rounded-md p-2 hover:bg-slate-100" aria-label="Close navigation">
                <X className="size-5" />
              </button>
            </div>
            <div className="mt-6">
              <NavItems onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-white/90 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2 lg:hidden">
            <button onClick={() => setOpen(true)} className="rounded-md p-2 hover:bg-slate-100" aria-label="Open navigation">
              <Menu className="size-5" />
            </button>
            <Logo to="/dashboard" />
          </div>
          <div className="hidden lg:block" />
          <UserMenu />
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
