import { ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, CircleAlert, MessageSquareQuote } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge, Progress, ScorePill } from '@/components/ui/misc'
import { titleCase } from '@/lib/utils'
import type { Evaluation } from '@/types'

const DIM_LABELS: Record<string, string> = {
  relevance: 'Relevance',
  correctness: 'Correctness',
  depth: 'Depth',
  communication: 'Communication',
  problem_solving: 'Problem solving',
}

export function EvaluationCard({ ev, compact = false }: { ev: Evaluation; compact?: boolean }) {
  const DiffIcon = ev.difficulty_after > ev.difficulty_before ? ArrowUpRight : ev.difficulty_after < ev.difficulty_before ? ArrowDownRight : ArrowRight
  return (
    <Card className="animate-fade-in">
      <CardContent className="space-y-5 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ScorePill score={ev.question_score} className="text-lg" />
            <div>
              <p className="text-sm font-semibold">{ev.technical_track ? `${titleCase(ev.technical_track)} score` : 'Answer score'}</p>
              {ev.technical_track && ev.communication_score != null && <p className="text-xs text-ink-500">Communication rated separately: {ev.communication_score}/10</p>}
            </div>
          </div>
          {!compact && (
            <Badge tone="brand">
              <DiffIcon className="size-3" aria-hidden /> Difficulty {ev.difficulty_before} → {ev.difficulty_after}
            </Badge>
          )}
        </div>

        <p className="text-sm leading-relaxed text-ink-700">{ev.feedback}</p>

        <div className={`grid gap-x-6 gap-y-3 ${ev.technical_scores ? 'md:grid-cols-2' : ''}`}>
          <div className="space-y-2">
            {Object.entries(DIM_LABELS).map(([k, label]) => (
              <div key={k}>
                <div className="flex justify-between text-xs">
                  <span className="text-ink-700">{label}</span>
                  <span className="tabular-nums text-ink-500">{ev.dimension_scores[k] ?? 0}/10</span>
                </div>
                <Progress value={(ev.dimension_scores[k] ?? 0) * 10} className="mt-1 h-1.5" label={label} />
              </div>
            ))}
          </div>
          {ev.technical_scores && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{titleCase(ev.technical_track ?? '')} track</p>
              {Object.entries(ev.technical_scores).map(([k, v]) => (
                <div key={k}>
                  <div className="flex justify-between text-xs">
                    <span className="text-ink-700">{titleCase(k)}</span>
                    <span className="tabular-nums text-ink-500">{v}/10</span>
                  </div>
                  <Progress value={v * 10} className="mt-1 h-1.5" label={k} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {ev.strengths.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">What went well</p>
              <ul className="space-y-1 text-sm">
                {ev.strengths.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(ev.missing_concepts.length > 0 || ev.incorrect_statements.length > 0) && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-rose-700">Gaps</p>
              <ul className="space-y-1 text-sm">
                {ev.incorrect_statements.map((s, i) => (
                  <li key={`i${i}`} className="flex gap-2">
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-rose-600" aria-hidden />
                    <span>
                      <span className="font-medium">Incorrect:</span> {s}
                    </span>
                  </li>
                ))}
                {ev.missing_concepts.map((s, i) => (
                  <li key={`m${i}`} className="flex gap-2">
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden />
                    <span>
                      <span className="font-medium">Missing:</span> {s}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {ev.model_answer_outline?.length > 0 && (
          <details className="rounded-lg bg-slate-50 p-3 text-sm">
            <summary className="flex cursor-pointer items-center gap-2 font-medium text-ink-700">
              <MessageSquareQuote className="size-4" aria-hidden /> What a strong answer would cover
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-6 text-ink-700">
              {ev.model_answer_outline.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </details>
        )}

        {!compact && (
          <p className="text-xs text-ink-500">
            <span className="font-medium">Adaptive engine:</span> {ev.adjustment_reason}
            {ev.needs_follow_up && ' A follow-up question will clarify one point from this answer.'}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
