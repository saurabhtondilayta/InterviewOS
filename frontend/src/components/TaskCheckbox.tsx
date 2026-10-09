import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api, errorMessage } from '@/lib/api'
import { cn, titleCase } from '@/lib/utils'
import type { PlanTask } from '@/types'

export function TaskCheckbox({ task, showDescription = false }: { task: PlanTask; showDescription?: boolean }) {
  const qc = useQueryClient()
  // Optimistic state: the box ticks immediately and reverts if saving fails.
  const [optimistic, setOptimistic] = useState<boolean | null>(null)
  const done = optimistic ?? Boolean(task.completed_at)
  const toggle = useMutation({
    mutationFn: (completed: boolean) => api.patch<PlanTask>(`/api/learning-plans/tasks/${task.id}`, { completed }),
    onMutate: (completed) => setOptimistic(completed),
    onError: (e) => {
      setOptimistic(null)
      toast.error(errorMessage(e))
    },
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: ['dashboard'] }), qc.invalidateQueries({ queryKey: ['learning-plan'] })])
      setOptimistic(null)
    },
  })

  return (
    <label className={cn('flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-slate-50', toggle.isPending && 'opacity-80')}>
      <input type="checkbox" className="peer sr-only" checked={done} onChange={() => toggle.mutate(!done)} disabled={toggle.isPending} />
      <span
        className={cn(
          'mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-300',
          done ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white',
        )}
        aria-hidden
      >
        {done && <Check className="size-3.5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm font-medium', done && 'text-ink-400 line-through')}>{task.title}</span>
        <span className="block text-xs text-ink-500">
          {titleCase(task.task_type)}
          {task.topic ? ` · ${task.topic}` : ''}
          {task.estimated_minutes ? ` · ${task.estimated_minutes} min` : ''}
        </span>
        {showDescription && task.description && <span className="mt-1 block text-sm text-ink-700">{task.description}</span>}
      </span>
    </label>
  )
}
