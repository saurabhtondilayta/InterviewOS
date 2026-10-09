import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eraser, MessageSquare, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { CoachChat } from '@/components/coach/CoachChat'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/misc'
import { api, errorMessage } from '@/lib/api'
import { cn, relativeTime } from '@/lib/utils'
import type { ChatConversation } from '@/types'

export default function Coach() {
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const active = params.get('c')
  const [showList, setShowList] = useState(false)
  const conversations = useQuery({ queryKey: ['conversations'], queryFn: () => api.get<ChatConversation[]>('/api/chat/conversations') })

  const select = (id: string | null) => {
    setParams(id ? { c: id } : {})
    setShowList(false)
  }

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/chat/conversations/${id}`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['conversations'] })
      qc.removeQueries({ queryKey: ['conversation', id] })
      if (id === active) select(null)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const clear = useMutation({
    mutationFn: (id: string) => api.del(`/api/chat/conversations/${id}/messages`),
    onSuccess: (_, id) => qc.invalidateQueries({ queryKey: ['conversation', id] }),
    onError: (e) => toast.error(errorMessage(e)),
  })

  const list = (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <Button className="w-full" onClick={() => select(null)}>
          <Plus /> New conversation
        </Button>
      </div>
      <nav aria-label="Conversations" className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {conversations.isPending && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="m-1 h-10" />)}
        {conversations.data?.length === 0 && <p className="px-2 py-4 text-sm text-ink-500">No conversations yet.</p>}
        {conversations.data?.map((c) => (
          <div key={c.id} className={cn('group flex items-center rounded-lg', c.id === active ? 'bg-brand-50' : 'hover:bg-slate-50')}>
            <button onClick={() => select(c.id)} className="min-w-0 flex-1 px-3 py-2 text-left">
              <p className={cn('truncate text-sm', c.id === active ? 'font-medium text-brand-800' : 'text-ink-700')}>{c.title}</p>
              <p className="text-xs text-ink-400">{relativeTime(c.updated_at)}</p>
            </button>
            <button onClick={() => remove.mutate(c.id)} className="mr-1 rounded p-1.5 text-ink-400 opacity-0 hover:bg-rose-50 hover:text-rose-600 focus:opacity-100 group-hover:opacity-100" aria-label={`Delete conversation ${c.title}`}>
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
      </nav>
    </div>
  )

  return (
    <div className="-mx-4 -my-6 flex h-[calc(100dvh-3.5rem)] sm:-mx-6 lg:-my-8">
      <aside className="hidden w-72 shrink-0 border-r border-line bg-white md:block">{list}</aside>
      {showList && (
        <div className="fixed inset-0 z-30 md:hidden">
          <div className="absolute inset-0 bg-ink-900/40" onClick={() => setShowList(false)} />
          <div className="absolute inset-y-0 left-0 w-72 bg-white shadow-pop">{list}</div>
        </div>
      )}
      <section className="flex min-w-0 flex-1 flex-col bg-surface">
        <div className="flex items-center justify-between border-b border-line bg-white px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setShowList(true)} aria-label="Show conversations">
              <MessageSquare />
            </Button>
            <h1 className="truncate text-sm font-semibold">{conversations.data?.find((c) => c.id === active)?.title ?? 'AI career coach'}</h1>
          </div>
          {active && (
            <Button variant="ghost" size="sm" onClick={() => clear.mutate(active)} loading={clear.isPending}>
              <Eraser /> Clear messages
            </Button>
          )}
        </div>
        <div className="min-h-0 flex-1">
          <CoachChat key={active ?? 'new'} conversationId={active} onConversationCreated={(c) => select(c.id)} />
        </div>
      </section>
    </div>
  )
}
