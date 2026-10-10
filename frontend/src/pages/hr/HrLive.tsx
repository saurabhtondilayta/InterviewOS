import { useMutation, useQuery } from '@tanstack/react-query'
import { Mic, MicOff, PhoneOff, Sparkles, Video, VideoOff } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { VideoTile } from '@/components/hiring/media'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Select, Textarea } from '@/components/ui/form'
import { Alert, Badge, PageLoader } from '@/components/ui/misc'
import { api, errorMessage } from '@/lib/api'
import { setTrackEnabled, useLiveCall, useLocalMedia } from '@/lib/live'
import { cn, titleCase } from '@/lib/utils'
import type { LiveFeedback } from '@/types'

interface LiveInfo {
  room_token: string
  ice_servers: RTCIceServer[]
  candidate_name: string
  assessment: { title: string; role_title: string }
  invitation: { status: string; scheduled_at: string | null; hr_feedback: LiveFeedback; share_resume: boolean }
}

const CRITERIA = ['Technical knowledge', 'Problem solving', 'Communication', 'Role fit']
const STATE_LABEL: Record<string, string> = {
  idle: 'Starting…',
  waiting: 'Waiting for the candidate to join',
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  ended: 'Call ended',
  failed: 'Connection failed',
}

export default function HrLive() {
  const { id } = useParams()
  const navigate = useNavigate()
  const info = useQuery({ queryKey: ['hr-live', id], queryFn: () => api.get<LiveInfo>(`/api/org/invitations/${id}/live`) })
  const media = useLocalMedia(info.isSuccess)
  const ice = useMemo(() => info.data?.ice_servers ?? [], [info.data])
  const call = useLiveCall({ roomToken: info.data?.room_token ?? null, role: 'interviewer', iceServers: ice, localStream: media.stream })
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [ratings, setRatings] = useState<Record<string, number>>({})
  const [notes, setNotes] = useState('')
  const [rec, setRec] = useState<NonNullable<LiveFeedback['recommendation']>>('undecided')

  useEffect(() => {
    if (info.data && media.stream) void api.post(`/api/org/invitations/${id}/live/start`).catch(() => undefined)
  }, [info.data, media.stream, id])

  const suggest = useMutation({
    mutationFn: () => api.post<{ questions: { question: string; topic: string }[]; focus_areas: string[] }>(`/api/org/invitations/${id}/suggested-questions`),
    onError: (e) => toast.error(errorMessage(e)),
  })
  const end = useMutation({
    mutationFn: () => api.post(`/api/org/invitations/${id}/live/end`, { ratings, notes, recommendation: rec }),
    onSuccess: () => {
      call.hangUp()
      toast.success('Interview saved')
      navigate(`/hr/candidates/${id}`)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  if (info.isPending) return <PageLoader label="Preparing the interview room" />
  if (info.isError) return <Alert tone="error">{errorMessage(info.error)}</Alert>

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Live interview · {info.data.candidate_name}</h1>
          <p className="text-sm text-ink-500">{info.data.assessment.title}</p>
        </div>
        <Badge tone={call.state === 'connected' ? 'success' : call.state === 'failed' ? 'danger' : 'neutral'}>{STATE_LABEL[call.state]}</Badge>
      </div>
      {media.error && <Alert tone="error">{media.error}</Alert>}
      {call.state === 'failed' && <Alert tone="warning">The video connection could not be established. Strict office or college networks can block direct video; ask the administrator to configure a TURN relay, or try another network.</Alert>}
      {call.peerLeft && <Alert tone="info">The candidate left the call. They can rejoin from their invitation.</Alert>}

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-3">
          <div className="relative">
            <VideoTile stream={call.remoteStream} label={info.data.candidate_name} className="aspect-video" />
            <VideoTile stream={media.stream} label="You" muted mirrored className="absolute bottom-3 right-3 aspect-video w-1/4 min-w-32 border-2 border-white shadow-pop" />
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant={micOn ? 'secondary' : 'danger'} onClick={() => (setTrackEnabled(media.stream, 'audio', !micOn), setMicOn(!micOn))} aria-pressed={!micOn}>
              {micOn ? <Mic /> : <MicOff />} {micOn ? 'Mute' : 'Unmute'}
            </Button>
            <Button variant={camOn ? 'secondary' : 'danger'} onClick={() => (setTrackEnabled(media.stream, 'video', !camOn), setCamOn(!camOn))} aria-pressed={!camOn}>
              {camOn ? <Video /> : <VideoOff />} {camOn ? 'Stop video' : 'Start video'}
            </Button>
            <Button variant="danger" onClick={() => end.mutate()} loading={end.isPending}>
              <PhoneOff /> End and save
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-accent-500" aria-hidden /> Suggested questions
              </CardTitle>
              <Button size="sm" variant="subtle" onClick={() => suggest.mutate()} loading={suggest.isPending}>
                {suggest.data ? 'Refresh' : 'Generate'}
              </Button>
            </CardHeader>
            <CardContent>
              {suggest.data ? (
                <ol className="max-h-64 list-decimal space-y-1.5 overflow-y-auto pl-5 text-sm">
                  {suggest.data.questions.map((q) => (
                    <li key={q.question}>
                      {q.question} <span className="text-xs text-ink-400">({q.topic})</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-ink-500">Tailored to the role{info.data.invitation.share_resume ? ' and the candidate’s resume' : ''}.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Scorecard</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {CRITERIA.map((c) => (
                <div key={c} className="flex items-center justify-between gap-2 text-sm">
                  <span>{c}</span>
                  <div className="flex gap-1" role="radiogroup" aria-label={c}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} role="radio" aria-checked={ratings[c] === n} onClick={() => setRatings({ ...ratings, [c]: n })} className={cn('size-7 rounded-md border text-xs font-medium', ratings[c] === n ? 'border-brand-500 bg-brand-600 text-white' : 'border-line hover:bg-slate-50')}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <Field label="Recommendation" htmlFor="rec">
                <Select value={rec} onChange={(e) => setRec(e.target.value as typeof rec)}>
                  {(['undecided', 'strong_hire', 'hire', 'no_hire', 'strong_no_hire'] as const).map((r) => (
                    <option key={r} value={r}>
                      {titleCase(r)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Notes" htmlFor="notes">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} maxLength={8000} />
              </Field>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
