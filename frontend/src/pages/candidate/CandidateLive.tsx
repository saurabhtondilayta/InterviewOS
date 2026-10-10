import { useQuery } from '@tanstack/react-query'
import { Mic, MicOff, PhoneOff, Video, VideoOff } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ProctorBadge, VideoTile } from '@/components/hiring/media'
import { Button } from '@/components/ui/button'
import { Alert, Badge, PageLoader } from '@/components/ui/misc'
import { api, errorMessage } from '@/lib/api'
import { setTrackEnabled, useLiveCall, useLocalMedia } from '@/lib/live'
import { useProctoring } from '@/lib/proctor'
import { formatDateTime } from '@/lib/utils'

interface LiveInfo {
  room_token: string
  ice_servers: RTCIceServer[]
  company: string
  assessment: { title: string; proctoring_enabled: boolean }
  scheduled_at: string | null
}

const STATE_LABEL: Record<string, string> = {
  idle: 'Starting…',
  waiting: 'Waiting for the interviewer to join',
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  ended: 'You left the call',
  failed: 'Connection failed',
}

export default function CandidateLive() {
  const { id } = useParams()
  const navigate = useNavigate()
  const info = useQuery({ queryKey: ['candidate-live', id], queryFn: () => api.get<LiveInfo>(`/api/invitations/${id}/live`), retry: false })
  const media = useLocalMedia(info.isSuccess)
  const ice = useMemo(() => info.data?.ice_servers ?? [], [info.data])
  const call = useLiveCall({ roomToken: info.data?.room_token ?? null, role: 'candidate', iceServers: ice, localStream: media.stream })
  const proctor = useProctoring({ invitationId: id, enabled: Boolean(info.data?.assessment.proctoring_enabled && media.stream), stream: media.stream })
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)

  if (info.isPending) return <PageLoader label="Opening the interview room" />
  if (info.isError) return <Alert tone="error">{errorMessage(info.error)}</Alert>

  return (
    <div className="mx-auto max-w-5xl space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{info.data.assessment.title}</h1>
          <p className="text-sm text-ink-500">
            {info.data.company}
            {info.data.scheduled_at ? ` · scheduled ${formatDateTime(info.data.scheduled_at)}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ProctorBadge status={proctor.status} hint={proctor.hint} error={proctor.error} />
          <Badge tone={call.state === 'connected' ? 'success' : call.state === 'failed' ? 'danger' : 'neutral'}>{STATE_LABEL[call.state]}</Badge>
        </div>
      </div>
      {media.error && <Alert tone="error">{media.error}</Alert>}
      {call.state === 'failed' && <Alert tone="warning">The video connection could not be established. Try a different network (mobile hotspot often works) and rejoin.</Alert>}
      {call.peerLeft && <Alert tone="info">The interviewer left the call.</Alert>}

      <div className="relative">
        <VideoTile stream={call.remoteStream} label="the interviewer" className="aspect-video" />
        <VideoTile stream={media.stream} label="You" muted mirrored className="absolute bottom-3 right-3 aspect-video w-1/4 min-w-32 border-2 border-white shadow-pop" />
      </div>
      {/* Hidden element the proctoring checks read frames from. */}
      <video ref={proctor.videoRef} className="hidden" playsInline muted />
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant={micOn ? 'secondary' : 'danger'} onClick={() => (setTrackEnabled(media.stream, 'audio', !micOn), setMicOn(!micOn))} aria-pressed={!micOn}>
          {micOn ? <Mic /> : <MicOff />} {micOn ? 'Mute' : 'Unmute'}
        </Button>
        <Button variant={camOn ? 'secondary' : 'danger'} onClick={() => (setTrackEnabled(media.stream, 'video', !camOn), setCamOn(!camOn))} aria-pressed={!camOn}>
          {camOn ? <Video /> : <VideoOff />} {camOn ? 'Stop video' : 'Start video'}
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            call.hangUp()
            navigate(`/assessment/${id}`)
          }}
        >
          <PhoneOff /> Leave
        </Button>
      </div>
    </div>
  )
}
