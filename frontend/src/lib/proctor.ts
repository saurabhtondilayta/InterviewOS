/**
 * AI proctoring that runs entirely in the candidate's browser.
 *
 * - Face analysis (MediaPipe Face Landmarker): no face, more than one face, looking away.
 * - Object detection (MediaPipe EfficientDet-Lite0, COCO classes): a phone in view.
 * - Browser signals: tab hidden, window lost focus, fullscreen exited, copy/paste.
 *
 * Video never leaves the device. Only events (and a small JPEG at visual flags) are sent to the
 * backend, where they are visible to the hiring company only. Signals are for human review.
 */
import type { FaceLandmarker, ObjectDetector } from '@mediapipe/tasks-vision'
import { useEffect, useRef, useState } from 'react'
import { api } from './api'

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm'
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const OBJECT_MODEL = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite'

export type ProctorKind =
  | 'session_start'
  | 'session_end'
  | 'no_face'
  | 'multiple_faces'
  | 'looking_away'
  | 'phone_detected'
  | 'tab_hidden'
  | 'window_blur'
  | 'fullscreen_exit'
  | 'copy_paste'
  | 'camera_off'

export interface ProctorEvent {
  kind: ProctorKind
  severity: 0 | 1 | 2 | 3
  occurred_at: string
  detail: Record<string, number | string | boolean>
  snapshot?: string
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------
interface Point {
  x: number
  y: number
}

/** Head orientation from face landmarks: yaw ~0 when facing the camera, |yaw| > 0.35 turned away;
 *  pitch ~0.45 level, > 0.7 looking down, < 0.2 looking up. */
export function headPose(lm: Point[]): { yaw: number; pitch: number } {
  const nose = lm[1]
  const left = lm[33]
  const right = lm[263]
  const chin = lm[152]
  const eyeMid = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 }
  const eyeDist = Math.max(1e-6, Math.abs(right.x - left.x))
  const yaw = (nose.x - eyeMid.x) / eyeDist
  const pitch = (nose.y - eyeMid.y) / Math.max(1e-6, chin.y - eyeMid.y)
  return { yaw, pitch }
}

export function isLookingAway(p: { yaw: number; pitch: number }): boolean {
  return Math.abs(p.yaw) > 0.35 || p.pitch > 0.72 || p.pitch < 0.18
}

/** Fires once when a condition has been continuously true for `ms`; re-arms when it clears. */
export class Sustained {
  private since: number | null = null
  private fired = false
  private readonly ms: number
  constructor(ms: number) {
    this.ms = ms
  }
  update(active: boolean, now: number): boolean {
    if (!active) {
      this.since = null
      this.fired = false
      return false
    }
    if (this.since === null) this.since = now
    if (!this.fired && now - this.since >= this.ms) {
      this.fired = true
      return true
    }
    return false
  }
}

/** Per-kind cooldown so a lasting problem is reported a few times, not hundreds. */
export class Cooldown {
  private last = new Map<string, number>()
  private readonly ms: number
  constructor(ms: number) {
    this.ms = ms
  }
  allow(kind: string, now: number): boolean {
    const prev = this.last.get(kind)
    if (prev !== undefined && now - prev < this.ms) return false
    this.last.set(kind, now)
    return true
  }
}

const VISUAL: ProctorKind[] = ['no_face', 'multiple_faces', 'looking_away', 'phone_detected']

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------
type Vision = typeof import('@mediapipe/tasks-vision')

export class Proctor {
  private face?: FaceLandmarker
  private objects?: ObjectDetector
  private timer?: number
  private lastObjectCheck = 0
  private noFace = new Sustained(4000)
  private many = new Sustained(1500)
  private away = new Sustained(5000)
  private phone = new Sustained(1000)
  private cooldown = new Cooldown(20000)
  private canvas = document.createElement('canvas')
  private listeners: (() => void)[] = []
  private readonly video: HTMLVideoElement
  private readonly emit: (e: ProctorEvent) => void
  private readonly hint: (text: string | null) => void

  constructor(video: HTMLVideoElement, emit: (e: ProctorEvent) => void, hint: (text: string | null) => void) {
    this.video = video
    this.emit = emit
    this.hint = hint
  }

  async init(): Promise<void> {
    const vision: Vision = await import('@mediapipe/tasks-vision')
    const files = await vision.FilesetResolver.forVisionTasks(WASM_BASE)
    this.face = await vision.FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: 3,
    })
    try {
      this.objects = await vision.ObjectDetector.createFromOptions(files, {
        baseOptions: { modelAssetPath: OBJECT_MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        scoreThreshold: 0.45,
        categoryAllowlist: ['cell phone'],
      })
    } catch {
      this.objects = undefined // phone detection is best-effort
    }
  }

  start() {
    this.report('session_start', 0, {})
    this.timer = window.setInterval(() => this.tick(), 500)
    const on = <K extends keyof DocumentEventMap>(target: Document | Window, type: K | string, fn: () => void) => {
      target.addEventListener(type, fn)
      this.listeners.push(() => target.removeEventListener(type, fn))
    }
    on(document, 'visibilitychange', () => {
      if (document.hidden) this.report('tab_hidden', 2, {})
    })
    on(window, 'blur', () => {
      if (!document.hidden) this.report('window_blur', 1, {})
    })
    on(document, 'fullscreenchange', () => {
      if (!document.fullscreenElement) this.report('fullscreen_exit', 1, {})
    })
    for (const t of ['copy', 'paste', 'cut']) on(document, t, () => this.report('copy_paste', 2, { action: t }))
    const track = (this.video.srcObject as MediaStream | null)?.getVideoTracks()[0]
    if (track) {
      const off = () => this.report('camera_off', 3, {})
      track.addEventListener('ended', off)
      track.addEventListener('mute', off)
      this.listeners.push(() => {
        track.removeEventListener('ended', off)
        track.removeEventListener('mute', off)
      })
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.listeners.forEach((f) => f())
    this.listeners = []
    this.report('session_end', 0, {})
    this.face?.close()
    this.objects?.close()
  }

  private tick() {
    const v = this.video
    if (!this.face || v.readyState < 2 || v.videoWidth === 0) return
    const now = performance.now()
    const res = this.face.detectForVideo(v, now)
    const faces = res.faceLandmarks?.length ?? 0

    if (this.noFace.update(faces === 0, now)) this.report('no_face', 2, {})
    if (this.many.update(faces > 1, now)) this.report('multiple_faces', 3, { faces })
    let away = false
    if (faces === 1) {
      const pose = headPose(res.faceLandmarks[0])
      away = isLookingAway(pose)
      if (this.away.update(away, now)) this.report('looking_away', 1, { yaw: Math.round(pose.yaw * 100) / 100, pitch: Math.round(pose.pitch * 100) / 100 })
    } else {
      this.away.update(false, now)
    }

    if (this.objects && now - this.lastObjectCheck > 2500) {
      this.lastObjectCheck = now
      const det = this.objects.detectForVideo(v, now)
      const phone = det.detections.find((d) => d.categories[0]?.categoryName === 'cell phone')
      if (this.phone.update(Boolean(phone), now)) this.report('phone_detected', 3, { confidence: Math.round((phone?.categories[0]?.score ?? 0) * 100) / 100 })
    }

    this.hint(faces === 0 ? 'We can’t see your face — please face the camera.' : faces > 1 ? 'Only you should be in view of the camera.' : away ? 'Please look at the screen.' : null)
  }

  private snapshot(): string | undefined {
    const v = this.video
    if (!v.videoWidth) return undefined
    const w = 320
    this.canvas.width = w
    this.canvas.height = Math.round((v.videoHeight / v.videoWidth) * w)
    const ctx = this.canvas.getContext('2d')
    if (!ctx) return undefined
    ctx.drawImage(v, 0, 0, this.canvas.width, this.canvas.height)
    return this.canvas.toDataURL('image/jpeg', 0.6)
  }

  private report(kind: ProctorKind, severity: ProctorEvent['severity'], detail: ProctorEvent['detail']) {
    const now = performance.now()
    if (severity > 0 && !this.cooldown.allow(kind, now)) return
    this.emit({ kind, severity, occurred_at: new Date().toISOString(), detail, snapshot: VISUAL.includes(kind) ? this.snapshot() : undefined })
  }
}

// ---------------------------------------------------------------------------
// React hook: camera + detector + batched upload
// ---------------------------------------------------------------------------
export type ProctorStatus = 'off' | 'starting' | 'running' | 'error'

export function useProctoring(opts: { invitationId: string | null | undefined; enabled: boolean; stream?: MediaStream | null }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<ProctorStatus>('off')
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const queue = useRef<ProctorEvent[]>([])
  const { invitationId, enabled, stream } = opts

  useEffect(() => {
    if (!enabled || !invitationId) return
    let cancelled = false
    let proctor: Proctor | null = null
    let own: MediaStream | null = null
    let flushTimer: number | undefined

    const flush = async () => {
      if (!queue.current.length) return
      const events = queue.current.splice(0, 50)
      try {
        await api.post(`/api/proctoring/${invitationId}/events`, { events })
      } catch {
        queue.current.unshift(...events.filter((e) => e.severity > 0).map((e) => ({ ...e, snapshot: undefined })))
      }
    }

    ;(async () => {
      setStatus('starting')
      try {
        const media = stream ?? (own = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false }))
        const video = videoRef.current
        if (!video || cancelled) return
        video.srcObject = media
        video.muted = true
        await video.play().catch(() => undefined)
        proctor = new Proctor(
          video,
          (e) => {
            queue.current.push(e)
            if (e.severity >= 2) void flush()
          },
          setHint,
        )
        await proctor.init()
        if (cancelled) return
        proctor.start()
        setStatus('running')
        flushTimer = window.setInterval(() => void flush(), 5000)
      } catch (e) {
        setStatus('error')
        setError((e as DOMException)?.name === 'NotAllowedError' ? 'Camera access is required for this interview. Allow it in your browser settings.' : 'Could not start the camera check. Reload the page and try again.')
      }
    })()

    return () => {
      cancelled = true
      proctor?.stop()
      void flush()
      if (flushTimer) clearInterval(flushTimer)
      own?.getTracks().forEach((t) => t.stop())
    }
  }, [enabled, invitationId, stream])

  return { videoRef, status, error, hint }
}
