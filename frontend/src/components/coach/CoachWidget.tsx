import { Bot, Maximize2, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { CoachChat } from './CoachChat'

/** Floating coach panel available on the dashboard and preparation pages. */
export function CoachWidget() {
  const [open, setOpen] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-4 z-40 flex h-[min(560px,calc(100dvh-7rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-pop animate-fade-in" role="dialog" aria-label="AI career coach">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Bot className="size-4 text-brand-600" aria-hidden /> AI career coach
            </p>
            <div className="flex gap-1">
              <Link to={conversationId ? `/coach?c=${conversationId}` : '/coach'} className="rounded p-1.5 text-ink-400 hover:bg-slate-100 hover:text-ink-700" aria-label="Open full coach page">
                <Maximize2 className="size-4" />
              </Link>
              <button onClick={() => setOpen(false)} className="rounded p-1.5 text-ink-400 hover:bg-slate-100 hover:text-ink-700" aria-label="Close coach">
                <X className="size-4" />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 bg-surface">
            <CoachChat conversationId={conversationId} onConversationCreated={(c) => setConversationId(c.id)} compact />
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-4 right-4 z-40 grid size-13 place-items-center rounded-full bg-gradient-to-br from-brand-600 to-accent-500 text-white shadow-pop transition-transform hover:scale-105"
        aria-label={open ? 'Close AI career coach' : 'Open AI career coach'}
        aria-expanded={open}
      >
        {open ? <X className="size-5" /> : <Bot className="size-6" />}
      </button>
    </>
  )
}
