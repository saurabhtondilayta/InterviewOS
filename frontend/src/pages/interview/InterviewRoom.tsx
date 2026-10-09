import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock, Keyboard, Mic, MicOff, Square, Volume2, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { CodeEditor } from '@/components/interview/CodeEditor'
import { EvaluationCard } from '@/components/interview/EvaluationCard'
import { QuestionCard } from '@/components/interview/QuestionCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Label, Select, Textarea } from '@/components/ui/form'
import { AIDisclaimer, Alert, Badge, PageLoader, Progress } from '@/components/ui/misc'
import { ApiError, api, errorMessage } from '@/lib/api'
import { type MicPermission, queryMicPermission, requestMicPermission, speak, stopSpeaking, ttsSupported, useSpeechRecognition } from '@/lib/speech'
import { cn, INTERVIEW_TYPE_LABELS } from '@/lib/utils'
import type { Evaluation, PublicQuestion, SessionDetail } from '@/types'

type Phase = 'ready' | 'answering' | 'evaluated'

function useCountdown(startedAt: string | null, minutes: number) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  if (!startedAt) return { remaining: minutes * 60, expired: false }
  const remaining = Math.round(minutes * 60 - (now - new Date(startedAt).getTime()) / 1000)
  return { remaining, expired: remaining <= 0 }
}

const fmt = (s: number) => `${s < 0 ? '-' : ''}${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(s) % 60).padStart(2, '0')}`

const MIC_LABEL: Record<MicPermission, string> = {
  unknown: 'Not checked',
  prompt: 'Permission needed',
  granted: 'Allowed',
  denied: 'Blocked',
  unsupported: 'Not supported',
}

export default function InterviewRoom() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const detail = useQuery({ queryKey: ['interview', id], queryFn: () => api.get<SessionDetail>(`/api/interviews/${id}`), refetchOnWindowFocus: false })

  const [phase, setPhase] = useState<Phase>('ready')
  const [question, setQuestion] = useState<PublicQuestion | null>(null)
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [mode, setMode] = useState<'voice' | 'text'>('text')
  const [muted, setMuted] = useState(false)
  const [lang, setLang] = useState('en-IN')
  const [answer, setAnswer] = useState('')
  const [code, setCode] = useState('')
  const [codeLang, setCodeLang] = useState('python')
  const [speaking, setSpeaking] = useState(false)
  const [mic, setMic] = useState<MicPermission>('unknown')
  const [error, setError] = useState<string | null>(null)
  const [voiceUsed, setVoiceUsed] = useState(false)
  const questionShownAt = useRef<number>(Date.now())
  const initialised = useRef(false)

  const speech = useSpeechRecognition(lang)
  const session = detail.data?.session
  const countdown = useCountdown(session?.started_at ?? null, session?.duration_minutes ?? 0)

  // Restore state when resuming an interview in progress.
  useEffect(() => {
    if (!detail.data || initialised.current) return
    initialised.current = true
    const s = detail.data.session
    setMode(s.answer_mode)
    const last = detail.data.questions.at(-1)
    if (s.status === 'in_progress' && last) {
      setQuestion(last)
      if (!last.response || !last.evaluation) {
        setPhase('answering')
        if (last.response) setAnswer(last.response.answer_text)
      } else {
        setEvaluation(last.evaluation)
        setPhase('evaluated')
      }
    }
    queryMicPermission().then(setMic)
  }, [detail.data])

  // Stop audio when leaving the page.
  useEffect(() => () => stopSpeaking(), [])

  // Keep the transcript in the editable answer box while dictating.
  useEffect(() => {
    if (speech.listening) setAnswer(speech.finalText)
  }, [speech.finalText, speech.listening])

  const say = useCallback(
    (text: string) => {
      if (muted || !ttsSupported()) return
      setSpeaking(true)
      speak(text, { lang, onEnd: () => setSpeaking(false) })
    },
    [muted, lang],
  )

  const showQuestion = (q: PublicQuestion) => {
    setQuestion(q)
    setEvaluation(null)
    setAnswer('')
    setCode('')
    setVoiceUsed(false)
    setPhase('answering')
    questionShownAt.current = Date.now()
    if (mode === 'voice') say(q.question_text)
  }

  const finish = useMutation({
    mutationFn: () => api.post(`/api/interviews/${id}/end`),
    onSettled: () => {
      stopSpeaking()
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['interview', id] })
      navigate(`/interview/${id}/results`)
    },
  })

  const next = useMutation({
    mutationFn: () => api.post<{ done: boolean; question: PublicQuestion | null }>(`/api/interviews/${id}/next`),
    onSuccess: (r) => {
      setError(null)
      if (r.done || !r.question) finish.mutate()
      else {
        showQuestion(r.question)
        qc.invalidateQueries({ queryKey: ['interview', id] })
      }
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'evaluation_pending') setPhase('answering')
      setError(errorMessage(e))
    },
  })

  const submit = useMutation({
    mutationFn: () => {
      const isCode = question?.kind === 'coding'
      const text = isCode ? [code.trim(), answer.trim() ? `\n\n/* Explanation:\n${answer.trim()}\n*/` : ''].join('') : answer.trim()
      return api.post<{ evaluation: Evaluation }>(`/api/interviews/${id}/questions/${question!.id}/answer`, {
        answer_text: text,
        answer_mode: voiceUsed ? 'voice' : 'text',
        duration_seconds: Math.round((Date.now() - questionShownAt.current) / 1000),
        code_language: isCode ? codeLang : null,
      })
    },
    onSuccess: (r) => {
      setError(null)
      setEvaluation(r.evaluation)
      setPhase('evaluated')
      qc.invalidateQueries({ queryKey: ['interview', id] })
    },
    onError: (e) => setError(`${errorMessage(e)} Your answer was kept — you can submit again.`),
  })

  if (detail.isPending) return <PageLoader label="Loading interview" />
  if (detail.isError) return <Alert tone="error">{errorMessage(detail.error)}</Alert>
  if (!session) return null
  if (session.status === 'completed' || session.status === 'abandoned') return <Navigate to={`/interview/${id}/results`} replace />

  const mainAsked = detail.data.questions.filter((q) => !q.is_follow_up).length + (question && !question.is_follow_up && !detail.data.questions.some((q) => q.id === question.id) ? 1 : 0)
  const progress = Math.min(100, (mainAsked / session.target_question_count) * 100)
  const isCoding = question?.kind === 'coding'
  const canSubmit = isCoding ? code.trim().length > 0 || answer.trim().length > 0 : answer.trim().length > 0

  const toggleMic = async () => {
    if (speech.listening) {
      speech.stop()
      return
    }
    stopSpeaking()
    setSpeaking(false)
    if (mic !== 'granted') {
      const p = await requestMicPermission()
      setMic(p)
      if (p !== 'granted') {
        setError('Microphone access is needed for voice answers. You can type your answer instead.')
        return
      }
    }
    setVoiceUsed(true)
    speech.start(answer)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{session.role_title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <Badge tone="brand">{INTERVIEW_TYPE_LABELS[session.interview_type]}</Badge>
            {detail.data.company && <Badge>{detail.data.company.name}</Badge>}
            <Badge tone={session.is_company_specific ? 'success' : 'neutral'}>{session.is_company_specific ? 'Uses a verified job listing' : 'General role-based practice'}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-sm tabular-nums', countdown.expired ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-line bg-white')} aria-label="Time remaining" role="timer">
            <Clock className="size-4" aria-hidden /> {session.started_at ? fmt(countdown.remaining) : `${session.duration_minutes}:00`}
          </div>
          {session.status === 'in_progress' && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="secondary">
                  <Square /> End interview
                </Button>
              </DialogTrigger>
              <DialogContent title="End this interview?" description="Your answered questions will be scored and a report generated. Unanswered questions are not counted.">
                <div className="flex justify-end gap-2">
                  <DialogClose asChild>
                    <Button variant="secondary">Keep going</Button>
                  </DialogClose>
                  <Button
                    variant="danger"
                    loading={finish.isPending}
                    onClick={() => {
                      speech.stop()
                      finish.mutate()
                    }}
                  >
                    End and see report
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-xs text-ink-500">
          <span>
            Question {Math.max(mainAsked, 0)} of {session.target_question_count}
          </span>
          <span>Current difficulty {session.current_difficulty}/5</span>
        </div>
        <Progress value={progress} label="Interview progress" />
      </div>

      {countdown.expired && phase !== 'ready' && (
        <Alert tone="warning" title="Time is up">
          Finish your current answer, then end the interview to see your report.
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}

      {/* Pre-start */}
      {phase === 'ready' && (
        <Card>
          <CardContent className="space-y-6 pt-6">
            <div>
              <h2 className="text-lg font-semibold">Before you start</h2>
              <p className="mt-1 text-sm text-ink-500">
                The AI interviewer asks one question at a time. After each answer you’ll see feedback, and the next question adapts to how you did. About {session.target_question_count} questions in {session.duration_minutes} minutes.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Answer mode</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(['voice', 'text'] as const).map((m) => (
                    <button key={m} type="button" disabled={m === 'voice' && !speech.supported} onClick={() => setMode(m)} aria-pressed={mode === m} className={cn('flex items-center justify-center gap-1.5 rounded-lg border p-2 text-sm font-medium disabled:opacity-50', mode === m ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-line')}>
                      {m === 'voice' ? <Mic className="size-4" /> : <Keyboard className="size-4" />} {m === 'voice' ? 'Voice' : 'Text'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lang">Speech language</Label>
                <Select id="lang" value={lang} onChange={(e) => setLang(e.target.value)}>
                  <option value="en-IN">English (India)</option>
                  <option value="en-US">English (US)</option>
                  <option value="en-GB">English (UK)</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Microphone</Label>
                <div className="flex items-center gap-2">
                  <Badge tone={mic === 'granted' ? 'success' : mic === 'denied' ? 'danger' : 'neutral'}>{MIC_LABEL[mic]}</Badge>
                  {mode === 'voice' && mic !== 'granted' && mic !== 'unsupported' && (
                    <Button size="sm" variant="secondary" onClick={async () => setMic(await requestMicPermission())}>
                      Allow microphone
                    </Button>
                  )}
                </div>
              </div>
            </div>
            {mode === 'voice' && (
              <Alert tone="info" title="How voice answers work">
                Questions are read aloud by your browser. Recording only starts when you press <strong>Start speaking</strong> and stops when you press <strong>Stop</strong>. Your browser converts speech to text (in Chrome and Edge this uses the browser’s online speech service); you can review and edit the transcript before submitting. Only the text is sent to InterviewOS.
              </Alert>
            )}
            {mode === 'voice' && mic === 'denied' && (
              <Alert tone="warning">Microphone access is blocked for this site. Allow it in your browser’s site settings, or use text mode.</Alert>
            )}
            <Button size="lg" onClick={() => next.mutate()} loading={next.isPending}>
              {session.status === 'in_progress' ? 'Continue interview' : 'Start interview'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Question + answer */}
      {question && phase !== 'ready' && (
        <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-4">
            <QuestionCard q={question} speaking={speaking} canSpeak={ttsSupported()} onRepeat={() => say(question.question_text)} />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (!muted) stopSpeaking()
                  setSpeaking(false)
                  setMuted(!muted)
                }}
                aria-pressed={muted}
              >
                {muted ? <VolumeX /> : <Volume2 />} {muted ? 'Interviewer muted' : 'Mute interviewer'}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setMode(mode === 'voice' ? 'text' : 'voice')} disabled={!speech.supported && mode === 'text'}>
                {mode === 'voice' ? <Keyboard /> : <Mic />} Switch to {mode === 'voice' ? 'typing' : 'voice'}
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            {phase === 'answering' && (
              <Card>
                <CardContent className="space-y-4 pt-5">
                  {isCoding && <CodeEditor value={code} onChange={setCode} language={codeLang} onLanguage={setCodeLang} />}

                  {mode === 'voice' && speech.supported && (
                    <div className="flex flex-wrap items-center gap-3">
                      <Button type="button" variant={speech.listening ? 'danger' : 'primary'} onClick={toggleMic}>
                        {speech.listening ? <MicOff /> : <Mic />} {speech.listening ? 'Stop speaking' : 'Start speaking'}
                      </Button>
                      {speech.listening && (
                        <span className="inline-flex items-center gap-2 text-sm text-rose-600" role="status">
                          <span className="size-2 animate-pulse rounded-full bg-rose-600" /> Listening…
                        </span>
                      )}
                    </div>
                  )}
                  {speech.error && <Alert tone="warning">{speech.error}</Alert>}

                  <div className="space-y-1.5">
                    <Label htmlFor="answer">{isCoding ? 'Explain your approach (optional)' : mode === 'voice' ? 'Transcript — review and edit before submitting' : 'Your answer'}</Label>
                    <Textarea id="answer" value={answer} onChange={(e) => setAnswer(e.target.value)} rows={isCoding ? 4 : 9} maxLength={15000} readOnly={speech.listening} placeholder={mode === 'voice' ? 'Press “Start speaking” and your words will appear here.' : 'Type your answer. Structure it as you would out loud.'} />
                    {speech.listening && speech.interim && <p className="text-sm italic text-ink-400">{speech.interim}</p>}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-ink-400">{answer.trim() ? `${answer.trim().split(/\s+/).length} words` : ''}</span>
                    <Button
                      onClick={() => {
                        speech.stop()
                        stopSpeaking()
                        submit.mutate()
                      }}
                      loading={submit.isPending}
                      disabled={!canSubmit || speech.listening}
                    >
                      {submit.isPending ? 'Evaluating…' : 'Submit answer'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {phase === 'evaluated' && evaluation && (
              <>
                <EvaluationCard ev={evaluation} />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <AIDisclaimer />
                  {countdown.expired ? (
                    <Button onClick={() => finish.mutate()} loading={finish.isPending}>
                      Finish and see report
                    </Button>
                  ) : (
                    <Button onClick={() => next.mutate()} loading={next.isPending || finish.isPending}>
                      {evaluation.needs_follow_up ? 'Answer follow-up' : 'Next question'}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
