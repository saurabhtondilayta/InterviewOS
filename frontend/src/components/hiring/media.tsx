import { ScanFace, ShieldAlert } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { ProctorStatus } from '@/lib/proctor'

/** A <video> bound to a MediaStream. Local previews are mirrored and muted. */
export function VideoTile({ stream, label, muted = false, mirrored = false, className }: { stream: MediaStream | null; label?: string; muted?: boolean; mirrored?: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream
  }, [stream])
  return (
    <div className={cn('relative overflow-hidden rounded-xl bg-slate-900', className)}>
      {stream ? (
        <video ref={ref} autoPlay playsInline muted={muted} className={cn('h-full w-full object-cover', mirrored && '-scale-x-100')} />
      ) : (
        <div className="grid h-full min-h-40 place-items-center text-sm text-slate-400">{label ? `Waiting for ${label}…` : 'No video'}</div>
      )}
      {label && stream && <span className="absolute bottom-2 left-2 rounded-md bg-black/55 px-2 py-0.5 text-xs font-medium text-white">{label}</span>}
    </div>
  )
}

/** Candidate-facing proctoring indicator: says monitoring is on, never shows flags. */
export function ProctorBadge({ status, hint, error }: { status: ProctorStatus; hint: string | null; error: string | null }) {
  if (status === 'off') return null
  return (
    <div className="space-y-1.5">
      <div className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', status === 'running' ? 'bg-emerald-50 text-emerald-700' : status === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-ink-500')}>
        {status === 'error' ? <ShieldAlert className="size-3.5" /> : <ScanFace className="size-3.5" />}
        {status === 'running' ? 'Camera monitoring on' : status === 'starting' ? 'Starting camera check…' : 'Camera check unavailable'}
      </div>
      {error && <p className="text-xs text-rose-700">{error}</p>}
      {!error && hint && <p className="text-xs font-medium text-amber-700">{hint}</p>}
    </div>
  )
}

export const PROCTOR_LABELS: Record<string, string> = {
  session_start: 'Session started',
  session_end: 'Session ended',
  no_face: 'Face not visible',
  multiple_faces: 'More than one person in view',
  looking_away: 'Looking away for a long time',
  phone_detected: 'Phone visible',
  tab_hidden: 'Switched tab or app',
  window_blur: 'Window lost focus',
  fullscreen_exit: 'Left fullscreen',
  copy_paste: 'Copy or paste',
  camera_off: 'Camera off or blocked',
}
