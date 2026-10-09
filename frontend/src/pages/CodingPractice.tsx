import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Code2, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { CodeEditor } from '@/components/interview/CodeEditor'
import { EvaluationCard } from '@/components/interview/EvaluationCard'
import { QuestionCard } from '@/components/interview/QuestionCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { AIDisclaimer, Alert, EmptyState, PageHeader, ScorePill } from '@/components/ui/misc'
import { useJobRoles } from '@/hooks/queries'
import { api, errorMessage } from '@/lib/api'
import { cn, relativeTime } from '@/lib/utils'
import type { Evaluation, PublicQuestion } from '@/types'

const TOPICS = ['Arrays & Strings', 'Hashing', 'Two Pointers & Sliding Window', 'Linked Lists', 'Stacks & Queues', 'Trees', 'Graphs', 'Dynamic Programming', 'Recursion & Backtracking', 'Sorting & Searching', 'Greedy', 'SQL Queries']

interface PracticeHistoryItem {
  id: string
  created_at: string
  status: string
  topics?: string[]
  interview_reports: { overall_score: number | null }[] | { overall_score: number | null } | null
}

export default function CodingPractice() {
  const qc = useQueryClient()
  const roles = useJobRoles()
  const [topic, setTopic] = useState(TOPICS[0])
  const [customTopic, setCustomTopic] = useState('')
  const [difficulty, setDifficulty] = useState(2)
  const [roleId, setRoleId] = useState('')
  const [session, setSession] = useState<{ id: string; question: PublicQuestion } | null>(null)
  const [code, setCode] = useState('')
  const [lang, setLang] = useState('python')
  const [explanation, setExplanation] = useState('')
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [followUp, setFollowUp] = useState<PublicQuestion | null>(null)
  const [followAnswer, setFollowAnswer] = useState('')
  const [followEval, setFollowEval] = useState<Evaluation | null>(null)

  const history = useQuery({ queryKey: ['coding-history'], queryFn: () => api.get<PracticeHistoryItem[]>('/api/interviews?practice=true&limit=10') })

  const start = useMutation({
    mutationFn: () => api.post<{ session_id: string; question: PublicQuestion }>('/api/coding/practice', { topic: customTopic.trim() || topic, difficulty, job_role_id: roleId || null }),
    onSuccess: (r) => {
      setSession({ id: r.session_id, question: r.question })
      setCode('')
      setExplanation('')
      setEvaluation(null)
      setFollowUp(null)
      setFollowEval(null)
      setFollowAnswer('')
    },
  })

  const submit = useMutation({
    mutationFn: () =>
      api.post<{ evaluation: Evaluation }>(`/api/interviews/${session!.id}/questions/${session!.question.id}/answer`, {
        answer_text: code + (explanation.trim() ? `\n\n/* Explanation:\n${explanation.trim()}\n*/` : ''),
        answer_mode: 'text',
        code_language: lang,
      }),
    onSuccess: (r) => setEvaluation(r.evaluation),
  })

  const nextStep = useMutation({
    mutationFn: () => api.post<{ done: boolean; question: PublicQuestion | null }>(`/api/interviews/${session!.id}/next`),
    onSuccess: async (r) => {
      if (r.done || !r.question) {
        await api.post(`/api/interviews/${session!.id}/end`)
        qc.invalidateQueries({ queryKey: ['coding-history'] })
        qc.invalidateQueries({ queryKey: ['dashboard'] })
      } else setFollowUp(r.question)
    },
  })

  const submitFollow = useMutation({
    mutationFn: () => api.post<{ evaluation: Evaluation }>(`/api/interviews/${session!.id}/questions/${followUp!.id}/answer`, { answer_text: followAnswer, answer_mode: 'text' }),
    onSuccess: async (r) => {
      setFollowEval(r.evaluation)
      await api.post(`/api/interviews/${session!.id}/end`)
      qc.invalidateQueries({ queryKey: ['coding-history'] })
    },
  })

  const err = start.error ?? submit.error ?? nextStep.error ?? submitFollow.error

  return (
    <div className="animate-fade-in">
      <PageHeader title="Coding practice" description="Generated problems with AI review of correctness, efficiency, code quality and edge cases." />
      <Alert tone="info" className="mb-6">
        Your code is <strong>not executed</strong>. The AI reviews it by reading it, which can miss bugs that running tests would catch — treat the feedback as a code review, not a test result.
      </Alert>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>New problem</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Topic" htmlFor="topic">
                <Select value={topic} onChange={(e) => setTopic(e.target.value)}>
                  {TOPICS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Or a custom topic" htmlFor="custom" hint="e.g. Tries, Bit manipulation">
                <Input value={customTopic} onChange={(e) => setCustomTopic(e.target.value)} maxLength={80} />
              </Field>
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-ink-700">Difficulty</p>
                <div className="grid grid-cols-5 gap-1">
                  {[1, 2, 3, 4, 5].map((d) => (
                    <button key={d} type="button" aria-pressed={difficulty === d} onClick={() => setDifficulty(d)} className={cn('h-9 rounded-md border text-sm font-medium', difficulty === d ? 'border-brand-500 bg-brand-600 text-white' : 'border-line hover:bg-slate-50')}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Role context (optional)" htmlFor="role">
                <Select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                  <option value="">General</option>
                  {roles.data?.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button className="w-full" onClick={() => start.mutate()} loading={start.isPending}>
                <Code2 /> {session ? 'New problem' : 'Generate problem'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent practice</CardTitle>
            </CardHeader>
            <CardContent>
              {history.data?.length ? (
                <ul className="space-y-2 text-sm">
                  {history.data.map((h) => {
                    const rep = Array.isArray(h.interview_reports) ? h.interview_reports[0] : h.interview_reports
                    return (
                      <li key={h.id}>
                        <Link to={`/interview/${h.id}/results`} className="flex items-center justify-between hover:text-brand-700">
                          <span>{relativeTime(h.created_at)}</span>
                          <ScorePill score={rep?.overall_score} />
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="text-sm text-ink-500">Your practice sessions will appear here.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          {err && <Alert tone="error">{errorMessage(err)}</Alert>}
          {!session ? (
            <EmptyState icon={Code2} title="Pick a topic and difficulty to get a problem" description="Problems are original and generated for practice." />
          ) : (
            <>
              <QuestionCard q={session.question} />
              {!evaluation ? (
                <Card>
                  <CardContent className="space-y-4 pt-5">
                    <CodeEditor value={code} onChange={setCode} language={lang} onLanguage={setLang} />
                    <Field label="Explain your approach and complexity (optional)" htmlFor="explain">
                      <Textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={3} />
                    </Field>
                    <div className="flex justify-end">
                      <Button onClick={() => submit.mutate()} loading={submit.isPending} disabled={!code.trim()}>
                        {submit.isPending ? 'Reviewing…' : 'Submit for review'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <EvaluationCard ev={evaluation} compact />
                  {!followUp && !nextStep.isSuccess && (
                    <div className="flex justify-end">
                      <Button onClick={() => nextStep.mutate()} loading={nextStep.isPending}>
                        {evaluation.needs_follow_up ? 'Answer follow-up question' : 'Finish and save'}
                      </Button>
                    </div>
                  )}
                  {nextStep.isSuccess && !followUp && (
                    <Alert tone="success" title="Saved">
                      This problem is saved to your history.{' '}
                      <Button variant="link" onClick={() => start.mutate()}>
                        <RotateCcw className="size-3.5" /> Try another
                      </Button>
                    </Alert>
                  )}
                  {followUp && (
                    <>
                      <QuestionCard q={followUp} />
                      {!followEval ? (
                        <Card>
                          <CardContent className="space-y-3 pt-5">
                            <Textarea value={followAnswer} onChange={(e) => setFollowAnswer(e.target.value)} rows={5} aria-label="Follow-up answer" />
                            <div className="flex justify-end">
                              <Button onClick={() => submitFollow.mutate()} loading={submitFollow.isPending} disabled={!followAnswer.trim()}>
                                Submit
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ) : (
                        <EvaluationCard ev={followEval} compact />
                      )}
                    </>
                  )}
                  <AIDisclaimer />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
