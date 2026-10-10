import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock, Headphones, Keyboard, Loader2, Mic, Square, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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
import { type MicPermission, queryMicPermission, recordingSupported, requestMicPermission, speak, stopSpeaking, useAnswerRecorder } from '@/lib/speech'
import { useProctoring } from '@/lib/proctor'
import { cn, INTERVIEW_TYPE_LABELS } from '@/lib/utils'
import { ProctorBadge } from '@/components/hiring/media'
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

/** What the AI interviewer says after evaluating an answer. */
function spokenReply(ev: Evaluation): string {
  const s = ev.question_score
  const opener = s >= 7.5 ? 'Good answer.' : s >= 5 ? 'Thanks, that was partly there.' : s >= 3 ? 'Okay, thanks.' : "Alright, let's work on that one."
  const feedback = (ev.feedback.match(/[^.!?]+[.!?]/g) ?? [ev.feedback]).slice(0, 2).join(' ').trim()
  const close = ev.needs_follow_up ? 'I have a quick follow-up question.' : "Let's move on."
  return `${opener} ${feedback} ${close}`
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
  const [handsFree, setHandsFree] = useState(true)
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
  const recorder = useAnswerRecorder()

  // Latest values for async voice callbacks (avoid stale closures).
  const live = useRef({ mode, handsFree, muted, lang, question, phase, answer })
  live.current = { mode, handsFree, muted, lang, question, phase, answer }

  const session = detail.data?.session
  const countdown = useCountdown(session?.started_at ?? null, session?.duration_minutes ?? 0)
  const assessment = detail.data?.assessment ?? null
  const hidden = Boolean(detail.data?.results_hidden)
  // Company assessments: camera checks run in the browser while the interview is in progress.
  const proctor = useProctoring({ invitationId: assessment?.invitation_id, enabled: Boolean(assessment?.proctoring_enabled && session?.status === 'in_progress') })

  // Restore state when resuming an interview in progress.
  useEffect(() => {
    if (!detail.data || initialised.current) return
    initialised.current = true
    const s = detail.data.session
    setMode(s.answer_mode === 'voice' && recordingSupported() ? 'voice' : 'text')
    const last = detail.data.questions.at(-1)
    if (s.status === 'in_progress' && last) {
      setQuestion(last)
      if (!last.response || (!last.evaluation && !detail.data.results_hidden)) {
        setPhase('answering')
        if (last.response) setAnswer(last.response.answer_text)
      } else {
        setEvaluation(last.evaluation)
        setPhase('evaluated')
      }
    }
    queryMicPermission().then(setMic)
  }, [detail.data])

  // Stop audio and microphone when leaving the page.
  useEffect(() => () => stopSpeaking(), [])

  /** The interviewer speaks, then runs `after` (unless muted, in which case `after` runs immediately). */
  const say = async (text: string, after?: () => void) => {
    if (live.current.mode !== 'voice' || live.current.muted) {
      after?.()
      return
    }
    setSpeaking(true)
    await speak(text, { lang: live.current.lang })
    setSpeaking(false)
    after?.()
  }

  /** Record the spoken answer, transcribe it, and (hands-free) submit it. */
  const listen = async () => {
    const q = live.current.question
    if (!q) return
    stopSpeaking()
    setSpeaking(false)
    setError(null)
    if (mic !== 'granted') {
      const p = await requestMicPermission()
      setMic(p)
      if (p !== 'granted') {
        setError('Microphone access is needed for voice answers. Allow it in your browser, or type your answer.')
        return
      }
    }
    const blob = await recorder.start({ silenceMs: live.current.handsFree ? 2200 : undefined, maxSeconds: 240 })
    if (!blob) {
      if (live.current.handsFree) setError("I didn't catch anything. Press “Start speaking” to try again, or type your answer.")
      return
    }
    const text = await recorder.transcribe(blob, q.id)
    if (!text) return
    setVoiceUsed(true)
    const prev = live.current.answer.trim()
    const full = prev ? `${prev} ${text}` : text
    setAnswer(full)
    if (live.current.handsFree && q.kind !== 'coding' && live.current.question?.id === q.id) submit.mutate({ text: full })
  }

  const showQuestion = (q: PublicQuestion) => {
    setQuestion(q)
    live.current.question = q
    setEvaluation(null)
    setAnswer('')
    setCode('')
    setVoiceUsed(false)
    setPhase('answering')
    setError(null)
    questionShownAt.current = Date.now()
    const intro = q.is_follow_up ? 'Follow-up question.' : `Question ${q.sequence_no}.`
    void say(`${intro} ${q.question_text}`, () => {
      const cur = live.current
      if (cur.mode === 'voice' && cur.handsFree && q.kind !== 'coding' && cur.question?.id === q.id) void listen()
    })
  }

  const finish = useMutation({
    mutationFn: () => api.post(`/api/interviews/${id}/end`),
    onSettled: () => {
      stopSpeaking()
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['interview', id] })
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
      navigate(`/interview/${id}/results`)
    },
  })

  const next = useMutation({
    mutationFn: () => api.post<{ done: boolean; question: PublicQuestion | null }>(`/api/interviews/${id}/next`),
    onSuccess: (r) => {
      setError(null)
      if (r.done || !r.question) {
        void say('That completes the interview. Let me prepare your report.', () => finish.mutate())
      } else {
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
    mutationFn: (vars?: { text?: string }) => {
      const isCode = question?.kind === 'coding'
      const spoken = (vars?.text ?? answer).trim()
      const text = isCode ? [code.trim(), spoken ? `\n\n/* Explanation:\n${spoken}\n*/` : ''].join('') : spoken
      return api.post<{ evaluation: Evaluation | null; results_hidden?: boolean }>(`/api/interviews/${id}/questions/${question!.id}/answer`, {
        answer_text: text,
        answer_mode: voiceUsed || vars?.text ? 'voice' : 'text',
        duration_seconds: Math.round((Date.now() - questionShownAt.current) / 1000),
        code_language: isCode ? codeLang : null,
      })
    },
    onSuccess: (r) => {
      setError(null)
      setEvaluation(r.evaluation)
      setPhase('evaluated')
      qc.invalidateQueries({ queryKey: ['interview', id] })
      // The interviewer responds out loud, then (hands-free) moves on automatically.
      // In a company assessment the score is for the company, so the reply stays neutral.
      void say(r.evaluation ? spokenReply(r.evaluation) : "Thank you, I've recorded your answer. Let's move on.", () => {
        const cur = live.current
        if (cur.mode === 'voice' && cur.handsFree && cur.phase === 'evaluated') next.mutate()
      })
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
  const recording = recorder.state === 'recording'
  const transcribing = recorder.state === 'transcribing'
  const busy = recording || transcribing || submit.isPending

  let status: { text: string; tone: string } | null = null
  if (speaking) status = { text: 'Interviewer is speaking…', tone: 'text-brand-700' }
  else if (recording) status = { text: `Listening… ${recorder.seconds}s${handsFree ? ' · pause for 2 seconds when you’re done' : ''}`, tone: 'text-rose-600' }
  else if (transcribing) status = { text: 'Transcribing your answer…', tone: 'text-ink-500' }
  else if (submit.isPending) status = { text: 'Evaluating your answer…', tone: 'text-ink-500' }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{session.role_title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <Badge tone="brand">{INTERVIEW_TYPE_LABELS[session.interview_type]}</Badge>
            {detail.data.company && <Badge>{detail.data.company.name}</Badge>}
            {assessment && <Badge tone="violet">Assessment for {assessment.company}</Badge>}
            <Badge tone={session.is_company_specific ? 'success' : 'neutral'}>{session.is_company_specific ? 'Uses a verified job listing' : 'General role-based practice'}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {assessment?.proctoring_enabled && (
            <>
              <video ref={proctor.videoRef} playsInline muted className="h-12 w-16 -scale-x-100 rounded-md bg-slate-900 object-cover" aria-label="Your camera" />
              <ProctorBadge status={proctor.status} hint={proctor.hint} error={proctor.error} />
            </>
          )}
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
                      recorder.stop()
                      stopSpeaking()
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
      {(error || recorder.error) && <Alert tone="error">{error ?? recorder.error}</Alert>}

      {/* Pre-start */}
      {phase === 'ready' && (
        <Card>
          <CardContent className="space-y-6 pt-6">
            <div>
              <h2 className="text-lg font-semibold">Before you start</h2>
              <p className="mt-1 text-sm text-ink-500">
                The AI interviewer asks one question at a time and adapts to your answers. About {session.target_question_count} questions in {session.duration_minutes} minutes.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Answer mode</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(['voice', 'text'] as const).map((m) => (
                    <button key={m} type="button" disabled={m === 'voice' && !recordingSupported()} onClick={() => setMode(m)} aria-pressed={mode === m} className={cn('flex items-center justify-center gap-1.5 rounded-lg border p-2 text-sm font-medium disabled:opacity-50', mode === m ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-line')}>
                      {m === 'voice' ? <Mic className="size-4" /> : <Keyboard className="size-4" />} {m === 'voice' ? 'Voice' : 'Text'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lang">Interviewer accent (browser voice)</Label>
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
              <>
                <label className="flex items-start gap-3 rounded-lg border border-line p-3">
                  <input type="checkbox" className="mt-1" checked={handsFree} onChange={(e) => setHandsFree(e.target.checked)} />
                  <span className="text-sm">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Headphones className="size-4" aria-hidden /> Hands-free conversation
                    </span>
                    <span className="text-ink-500">
                      After the interviewer finishes speaking, the microphone turns on automatically. Pause for about 2 seconds when you’re done and your answer is transcribed and submitted. The interviewer then gives spoken feedback and asks the next question.
                    </span>
                  </span>
                </label>
                <Alert tone="info" title="How voice works">
                  The interviewer’s questions and feedback are spoken aloud. Your microphone records only while the red “Listening” indicator is shown. The recording is sent to InterviewOS to be transcribed and is not stored; only the text of your answer is saved. You can always edit the transcript or type instead.
                </Alert>
              </>
            )}
            {mode === 'voice' && mic === 'denied' && <Alert tone="warning">Microphone access is blocked for this site. Allow it in your browser’s site settings, or use text mode.</Alert>}
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
            <QuestionCard q={question} speaking={speaking} canSpeak={mode === 'voice'} onRepeat={() => void say(question.question_text)} />
            <div className="flex flex-wrap items-center gap-2">
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
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  recorder.stop()
                  stopSpeaking()
                  setSpeaking(false)
                  setMode(mode === 'voice' ? 'text' : 'voice')
                }}
                disabled={!recordingSupported() && mode === 'text'}
              >
                {mode === 'voice' ? <Keyboard /> : <Mic />} Switch to {mode === 'voice' ? 'typing' : 'voice'}
              </Button>
              {mode === 'voice' && (
                <label className="ml-1 flex items-center gap-1.5 text-xs text-ink-500">
                  <input type="checkbox" checked={handsFree} onChange={(e) => setHandsFree(e.target.checked)} /> Hands-free
                </label>
              )}
            </div>
            {status && (
              <p className={cn('flex items-center gap-2 text-sm font-medium', status.tone)} role="status" aria-live="polite">
                {recording ? <span className="size-2.5 animate-pulse rounded-full bg-rose-600" /> : <Loader2 className="size-4 animate-spin" />}
                {status.text}
              </p>
            )}
          </div>

          <div className="space-y-4">
            {phase === 'answering' && (
              <Card>
                <CardContent className="space-y-4 pt-5">
                  {isCoding && <CodeEditor value={code} onChange={setCode} language={codeLang} onLanguage={setCodeLang} />}

                  {mode === 'voice' && (
                    <div className="flex flex-wrap items-center gap-3">
                      {recording ? (
                        <Button type="button" variant="danger" onClick={() => recorder.stop()}>
                          <Square /> Stop and transcribe
                        </Button>
                      ) : (
                        <Button type="button" onClick={() => void listen()} disabled={transcribing || submit.isPending}>
                          <Mic /> {answer.trim() ? 'Add more by speaking' : 'Start speaking'}
                        </Button>
                      )}
                      {recording && (
                        <div className="flex h-8 flex-1 items-center gap-0.5" aria-hidden>
                          {Array.from({ length: 24 }).map((_, i) => (
                            <span key={i} className="w-1 rounded-full bg-rose-500 transition-all" style={{ height: `${Math.max(8, Math.min(100, recorder.level * 100 * (0.5 + Math.abs(Math.sin(i * 1.7 + recorder.seconds)))))}%` }} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="answer">{isCoding ? 'Explain your approach (optional)' : mode === 'voice' ? 'Your answer (transcribed — you can edit it)' : 'Your answer'}</Label>
                    <Textarea
                      id="answer"
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      rows={isCoding ? 4 : 8}
                      maxLength={15000}
                      readOnly={recording || transcribing}
                      placeholder={mode === 'voice' ? 'Press “Start speaking” — your words will appear here after you stop.' : 'Type your answer. Structure it as you would out loud.'}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-ink-400">{answer.trim() ? `${answer.trim().split(/\s+/).length} words` : ''}</span>
                    <Button
                      onClick={() => {
                        recorder.stop()
                        stopSpeaking()
                        submit.mutate(undefined)
                      }}
                      loading={submit.isPending}
                      disabled={!canSubmit || busy}
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
                    <Button
                      onClick={() => {
                        stopSpeaking()
                        setSpeaking(false)
                        next.mutate()
                      }}
                      loading={next.isPending || finish.isPending}
                    >
                      {evaluation.needs_follow_up ? 'Answer follow-up' : 'Next question'}
                    </Button>
                  )}
                </div>
              </>
            )}

            {phase === 'evaluated' && !evaluation && hidden && (
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
                  <p className="text-sm text-ink-700">Answer recorded. {assessment?.company ?? 'The company'} reviews the scores; they are not shown during the interview.</p>
                  {countdown.expired ? (
                    <Button onClick={() => finish.mutate()} loading={finish.isPending}>
                      Finish and submit
                    </Button>
                  ) : (
                    <Button
                      onClick={() => {
                        stopSpeaking()
                        setSpeaking(false)
                        next.mutate()
                      }}
                      loading={next.isPending || finish.isPending}
                    >
                      Next question
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
