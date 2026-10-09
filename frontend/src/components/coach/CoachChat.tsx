import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, Check, Copy, Send } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Markdown } from '@/components/Markdown'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/form'
import { AIDisclaimer, Alert, Spinner } from '@/components/ui/misc'
import { api, errorMessage } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { ChatConversation, ChatMessage } from '@/types'

export const SUGGESTED_PROMPTS = [
  'Review my weakest topics and tell me what to study this week',
  'How should I explain my best project in an interview?',
  'Give me a 4-week DSA roadmap for campus placements',
  'How do I answer "Tell me about yourself"?',
  'I get nervous in interviews. What can I practise?',
  'Explain the difference between processes and threads',
]

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-ink-400 hover:bg-slate-100 hover:text-ink-700"
      aria-label="Copy response"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />} {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

interface Props {
  conversationId: string | null
  onConversationCreated?: (c: ChatConversation) => void
  compact?: boolean
}

export function CoachChat({ conversationId, onConversationCreated, compact = false }: Props) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const convo = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => api.get<{ conversation: ChatConversation; messages: ChatMessage[] }>(`/api/chat/conversations/${conversationId}`),
    enabled: Boolean(conversationId),
  })
  const messages = conversationId ? (convo.data?.messages ?? []) : []

  const send = useMutation({
    mutationFn: (content: string) => api.post<{ conversation: ChatConversation; messages: ChatMessage[] }>('/api/chat/messages', { conversation_id: conversationId, content }),
    onMutate: (content) => setPending(content),
    onSuccess: (r) => {
      setPending(null)
      setDraft('')
      qc.setQueryData(['conversation', r.conversation.id], (old: { conversation: ChatConversation; messages: ChatMessage[] } | undefined) => ({
        conversation: r.conversation,
        messages: [...(old?.messages ?? []), ...r.messages],
      }))
      qc.invalidateQueries({ queryKey: ['conversations'] })
      if (!conversationId) onConversationCreated?.(r.conversation)
    },
    onError: (e) => {
      setPending(null)
      toast.error(errorMessage(e))
    },
  })

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, pending])

  const submit = (text = draft) => {
    const t = text.trim()
    if (!t || send.isPending) return
    send.mutate(t)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn('flex-1 space-y-4 overflow-y-auto', compact ? 'p-3' : 'p-4 sm:p-6')} aria-live="polite">
        {convo.isError && <Alert tone="error">{errorMessage(convo.error)}</Alert>}
        {messages.length === 0 && !pending && (
          <div className="mx-auto max-w-lg py-6 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-gradient-to-br from-brand-600 to-accent-500 text-white">
              <Bot className="size-6" aria-hidden />
            </div>
            <p className="mt-3 font-semibold">Your AI career coach</p>
            <p className="mt-1 text-sm text-ink-500">Answers use your profile, resume analysis and past interviews. Ask anything about preparation.</p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {SUGGESTED_PROMPTS.slice(0, compact ? 3 : 6).map((p) => (
                <button key={p} onClick={() => submit(p)} className="rounded-lg border border-line bg-white px-3 py-2 text-left text-sm text-ink-700 hover:border-brand-200 hover:bg-brand-50">
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            {m.role === 'user' ? (
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand-600 px-4 py-2.5 text-sm text-white">{m.content}</div>
            ) : (
              <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-line bg-white px-4 py-3 shadow-card">
                <Markdown>{m.content}</Markdown>
                <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-1.5">
                  <span className="text-[0.7rem] text-ink-400">AI-generated</span>
                  <CopyButton text={m.content} />
                </div>
              </div>
            )}
          </div>
        ))}
        {pending && (
          <>
            <div className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand-600/80 px-4 py-2.5 text-sm text-white">{pending}</div>
            </div>
            <Spinner label="Coach is thinking" />
          </>
        )}
        <div ref={endRef} />
      </div>
      <form
        className={cn('border-t border-line bg-white', compact ? 'p-2' : 'p-3 sm:p-4')}
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            rows={compact ? 1 : 2}
            maxLength={4000}
            placeholder="Ask your coach… (Enter to send, Shift+Enter for a new line)"
            aria-label="Message"
            className="min-h-11 resize-none"
          />
          <Button type="submit" size="icon" className="size-11 shrink-0" loading={send.isPending} aria-label="Send">
            {!send.isPending && <Send />}
          </Button>
        </div>
        {!compact && <AIDisclaimer className="mt-2" text="Coach answers are AI-generated and may be wrong. Company-specific facts are only stated when verified." />}
      </form>
    </div>
  )
}
