import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Circle, Loader2, Maximize, Mic, ScanFace, Video } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, Badge, PageLoader } from '@/components/ui/misc'
import { api, errorMessage } from '@/lib/api'
import { Proctor } from '@/lib/proctor'
import { cn, formatDateTime, INTERVIEW_TYPE_LABELS } from '@/lib/utils'
import type { CandidateInvitation } from '@/types'

/** Camera + microphone + face check before an assessment. Nothing is recorded or uploaded here. */
function useSystemCheck(enabled: boolean, needFace: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [camera, setCamera] = useState<'pending' | 'ok' | 'error'>('pending')
  const [mic, setMic] = useState<'pending' | 'ok' | 'error'>('pending')
  const [face, setFace] = useState<'pending' | 'ok' | 'problem'>('pending')
  const [faceHint, setFaceHint] = useState<string | null>(null)
  const [level, setLevel] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let stream: MediaStream | null = null
    let proctor: Proctor | null = null
    let raf = 0
    let ctx: AudioContext | null = null
    let cancelled = false
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: true })
      } catch {
        setCamera('error')
        setMic('error')
        return
      }
      if (cancelled) return
      setCamera('ok')
      const v = videoRef.current
      if (v) {
        v.srcObject = stream
        v.muted = true
        await v.play().catch(() => undefined)
      }
      ctx = new AudioContext()
      const analyser = ctx.createAnalyser()
      ctx.createMediaStreamSource(stream).connect(analyser)
      const buf = new Float32Array(analyser.fftSize)
      let heard = false
      const loop = () => {
        analyser.getFloatTimeDomainData(buf)
        const rms = Math.sqrt(buf.reduce((s, x) => s + x * x, 0) / buf.length)
        setLevel(Math.min(1, rms * 8))
        if (rms > 0.03 && !heard) {
          heard = true
          setMic('ok')
        }
        raf = requestAnimationFrame(loop)
      }
      loop()
      if (needFace && v) {
        proctor = new Proctor(v, () => undefined, (h) => {
          setFaceHint(h)
          setFace(h ? 'problem' : 'ok')
        })
        try {
          await proctor.init()
          if (!cancelled) proctor.start()
        } catch {
          setFace('ok') // detector unavailable: don't block the candidate
        }
      } else setFace('ok')
    })()
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      proctor?.stop()
      ctx?.close().catch(() => undefined)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [enabled, needFace])

  return { videoRef, camera, mic, face, faceHint, level }
}

function Check({ state, label, hint }: { state: 'pending' | 'ok' | 'error' | 'problem'; label: string; hint?: string | null }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {state === 'ok' ? <CheckCircle2 className="mt-0.5 size-4 text-emerald-600" /> : state === 'pending' ? <Loader2 className="mt-0.5 size-4 animate-spin text-ink-400" /> : <Circle className="mt-0.5 size-4 text-rose-500" />}
      <span>
        {label}
        {hint && <span className="block text-xs text-amber-700">{hint}</span>}
      </span>
    </li>
  )
}

export default function AssessmentGate() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: inv, isPending, isError, error } = useQuery({ queryKey: ['my-invitation', id], queryFn: () => api.get<CandidateInvitation>(`/api/invitations/${id}`) })
  const [agree, setAgree] = useState(false)
  const [shareResume, setShareResume] = useState(true)
  const accepted = inv && ['accepted', 'in_progress'].includes(inv.status)
  const check = useSystemCheck(Boolean(accepted), Boolean(inv?.assessment.proctoring_enabled))

  const accept = useMutation({
    mutationFn: () => api.post<CandidateInvitation>(`/api/invitations/${id}/accept`, { consent: true, share_resume: shareResume }),
    onSuccess: (d) => qc.setQueryData(['my-invitation', id], d),
  })
  const decline = useMutation({
    mutationFn: () => api.post<CandidateInvitation>(`/api/invitations/${id}/decline`),
    onSuccess: (d) => qc.setQueryData(['my-invitation', id], d),
  })
  const start = useMutation({
    mutationFn: () => api.post<{ session_id: string }>(`/api/invitations/${id}/start`),
    onSuccess: (r) => navigate(`/interview/${r.session_id}`),
  })

  if (isPending) return <PageLoader />
  if (isError) return <Alert tone="error">{errorMessage(error)}</Alert>
  const a = inv.assessment
  const live = a.mode === 'live'
  const ready = check.camera === 'ok' && (check.face === 'ok' || !a.proctoring_enabled)

  const begin = async () => {
    // Fullscreen must be requested from the click itself.
    if (a.proctoring_enabled && !live) await document.documentElement.requestFullscreen?.().catch(() => undefined)
    if (live) navigate(`/live/${inv.id}`)
    else start.mutate()
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-fade-in">
      <div>
        <p className="text-sm text-ink-500">{inv.company.name}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{a.title}</h1>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <Badge tone="brand">{live ? 'Live video interview' : `AI interview · ${INTERVIEW_TYPE_LABELS[a.interview_type]}`}</Badge>
          <Badge>{a.role_title}</Badge>
          <Badge>{a.duration_minutes} minutes</Badge>
          {a.proctoring_enabled && <Badge tone="violet">Camera proctoring</Badge>}
        </div>
        {inv.scheduled_at && <p className="mt-2 text-sm font-medium text-brand-700">Scheduled: {formatDateTime(inv.scheduled_at)}</p>}
        {a.description && <p className="mt-3 whitespace-pre-wrap text-sm text-ink-700">{a.description}</p>}
      </div>

      {inv.status === 'completed' && (
        <Alert tone="success" title="Interview submitted">
          {inv.company.name} will review your interview and contact you.{' '}
          {inv.results_visible && inv.session_id && (
            <Link to={`/interview/${inv.session_id}/results`} className="font-medium underline">
              See your results
            </Link>
          )}
        </Alert>
      )}
      {['declined', 'cancelled'].includes(inv.status) && <Alert tone="info">This invitation is {inv.status}.</Alert>}
      {a.status === 'closed' && inv.status !== 'completed' && <Alert tone="warning">The company has closed this assessment.</Alert>}

      {inv.status === 'invited' && (
        <Card>
          <CardHeader>
            <CardTitle>Before you begin</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <ul className="list-disc space-y-1 pl-5 text-ink-700">
              {live ? <li>You’ll meet a recruiter from {inv.company.name} over live video in your browser at the scheduled time.</li> : <li>An AI interviewer will ask you questions one at a time; you answer by voice or text.</li>}
              {a.proctoring_enabled && (
                <>
                  <li>Your camera stays on. AI checks run in your browser for: your face being visible, other people in view, looking away for long periods, a phone in view, and switching tabs or windows.</li>
                  <li>Only {inv.company.name} sees these checks, together with a few small snapshots taken at flagged moments. No video is recorded.</li>
                </>
              )}
              <li>Use a quiet room, good lighting and a laptop or desktop with a camera and microphone.</li>
            </ul>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={shareResume} onChange={(e) => setShareResume(e.target.checked)} />
              <span>Share my latest resume and profile with {inv.company.name}</span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>I agree to {a.proctoring_enabled ? 'camera monitoring and ' : ''}the conditions above.</span>
            </label>
            {(accept.isError || decline.isError) && <Alert tone="error">{errorMessage(accept.error ?? decline.error)}</Alert>}
            <div className="flex gap-2">
              <Button onClick={() => accept.mutate()} disabled={!agree} loading={accept.isPending}>
                Accept invitation
              </Button>
              <Button variant="ghost" onClick={() => decline.mutate()} loading={decline.isPending}>
                Decline
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {accepted && a.status === 'open' && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>System check</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <video ref={check.videoRef} playsInline muted className="aspect-video w-full -scale-x-100 rounded-lg bg-slate-900 object-cover" />
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" aria-label="Microphone level">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.round(check.level * 100)}%` }} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-5 pt-5">
              <ul className="space-y-2">
                <Check state={check.camera} label="Camera working" />
                <Check state={check.mic} label="Microphone picks up your voice (say something)" />
                {a.proctoring_enabled && <Check state={check.face} label="Exactly one face visible" hint={check.faceHint} />}
                {a.proctoring_enabled && !live && <Check state="ok" label="The interview opens in fullscreen" />}
              </ul>
              {check.camera === 'error' && <Alert tone="error">Allow camera and microphone access in your browser’s site settings, then reload this page.</Alert>}
              {start.isError && <Alert tone="error">{errorMessage(start.error)}</Alert>}
              <Button size="lg" className="w-full" disabled={!ready} loading={start.isPending} onClick={() => void begin()}>
                {live ? <Video /> : a.proctoring_enabled ? <Maximize /> : <Mic />} {live ? 'Join interview room' : inv.status === 'in_progress' ? 'Resume interview' : 'Start interview'}
              </Button>
              {a.proctoring_enabled && (
                <p className={cn('flex items-start gap-1.5 text-xs text-ink-500')}>
                  <ScanFace className="mt-0.5 size-3.5 shrink-0" /> Camera monitoring starts when the interview begins.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
