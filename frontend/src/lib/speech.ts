/**
 * Voice for the AI interviewer and microphone recording for spoken answers.
 *
 * Speaking: the backend's text-to-speech (natural voice) is used when available; otherwise the
 * browser's built-in speechSynthesis voice. Listening: the answer is recorded with MediaRecorder
 * and transcribed on the server (Whisper). Recording only happens while the microphone indicator
 * is shown — after the user presses "Start speaking" or turns on hands-free mode — and stops on
 * "Stop", after a pause in hands-free mode, on submit, or when leaving the page. Audio is not stored.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, api } from './api'

// ---------------------------------------------------------------------------
// Capability checks
// ---------------------------------------------------------------------------
export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window

export function recordingSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
}

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4']
export function pickRecordingMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported?.(m))
}

export type MicPermission = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unsupported'

export async function queryMicPermission(): Promise<MicPermission> {
  if (!navigator.mediaDevices?.getUserMedia) return 'unsupported'
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName })
    return status.state as MicPermission
  } catch {
    return 'unknown'
  }
}

/** Ask for microphone access explicitly; the stream is released immediately (no recording). */
export async function requestMicPermission(): Promise<MicPermission> {
  if (!navigator.mediaDevices?.getUserMedia) return 'unsupported'
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach((t) => t.stop())
    return 'granted'
  } catch (e) {
    return (e as DOMException)?.name === 'NotAllowedError' ? 'denied' : 'unknown'
  }
}

// ---------------------------------------------------------------------------
// Speaking
// ---------------------------------------------------------------------------
let serverVoiceAvailable = true // flips to false for this page session if the server can't speak
let currentAudio: HTMLAudioElement | null = null
let currentUtterances: SpeechSynthesisUtterance[] = [] // kept referenced: Chrome drops events of GC'd utterances
let speakToken = 0

export function stopSpeaking() {
  speakToken++
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.src = ''
    currentAudio = null
  }
  if (ttsSupported()) window.speechSynthesis.cancel()
  currentUtterances = []
}

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const voices = window.speechSynthesis.getVoices()
  if (voices.length) return Promise.resolve(voices)
  return new Promise((resolve) => {
    const done = () => resolve(window.speechSynthesis.getVoices())
    window.speechSynthesis.addEventListener('voiceschanged', done, { once: true })
    setTimeout(done, 1200)
  })
}

function pickVoice(voices: SpeechSynthesisVoice[], lang: string) {
  const exact = voices.filter((v) => v.lang === lang)
  const english = voices.filter((v) => v.lang.startsWith('en'))
  const pool = exact.length ? exact : english
  return pool.find((v) => /natural|neural|google|online/i.test(v.name)) ?? pool[0]
}

/** Browser speech, made reliable: no cancel/speak race, sentence chunks (Chrome stops long utterances). */
async function speakWithBrowser(text: string, lang: string, token: number): Promise<void> {
  if (!ttsSupported()) return
  const synth = window.speechSynthesis
  if (synth.speaking || synth.pending) {
    synth.cancel()
    await new Promise((r) => setTimeout(r, 80))
  }
  const voice = pickVoice(await loadVoices(), lang)
  const chunks = text.match(/[^.!?]+[.!?]*\s*/g)?.map((c) => c.trim()).filter(Boolean) ?? [text]
  for (const chunk of chunks) {
    if (token !== speakToken) return
    await new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(chunk)
      u.lang = voice?.lang ?? lang
      if (voice) u.voice = voice
      u.rate = 1
      u.onend = () => resolve()
      u.onerror = () => resolve()
      currentUtterances.push(u)
      synth.speak(u)
      if (synth.paused) synth.resume()
      // Safety net: some browsers never fire onend.
      setTimeout(resolve, 2000 + chunk.length * 90)
    })
  }
}

async function speakWithServer(text: string, token: number): Promise<boolean> {
  if (!serverVoiceAvailable) return false
  let blob: Blob
  try {
    blob = await api.postForBlob('/api/voice/speak', { text: text.slice(0, 900) })
  } catch (e) {
    // Model not enabled / not configured: stop trying for this session. Rate limits: fall back this time only.
    if (e instanceof ApiError && ['ai_model_unavailable', 'not_configured', 'ai_bad_request'].includes(e.code)) serverVoiceAvailable = false
    return false
  }
  if (token !== speakToken) return true
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  currentAudio = audio
  try {
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve()
      audio.onerror = () => reject(new Error('audio playback failed'))
      audio.play().catch(reject)
    })
    return true
  } catch {
    return false
  } finally {
    URL.revokeObjectURL(url)
    if (currentAudio === audio) currentAudio = null
  }
}

/**
 * Speak text as the AI interviewer. Resolves when speech finishes (or is stopped).
 * Uses the server's natural voice when possible, otherwise the browser voice.
 */
export async function speak(text: string, opts: { lang?: string; preferServer?: boolean } = {}): Promise<void> {
  stopSpeaking()
  const token = speakToken
  const clean = text.replace(/[`*_#>]/g, '').trim()
  if (!clean) return
  if (opts.preferServer !== false && (await speakWithServer(clean, token))) return
  if (token !== speakToken) return
  await speakWithBrowser(clean, opts.lang ?? 'en-US', token)
}

export const voiceIsServer = () => serverVoiceAvailable

// ---------------------------------------------------------------------------
// Recording + transcription
// ---------------------------------------------------------------------------
export type RecorderState = 'idle' | 'recording' | 'transcribing'

interface RecorderOptions {
  /** Stop automatically after this much silence once the user has started speaking (hands-free). */
  silenceMs?: number
  maxSeconds?: number
}

const SPEECH_THRESHOLD = 0.035 // RMS level counted as speech

export function useAnswerRecorder() {
  const [state, setState] = useState<RecorderState>('idle')
  const [level, setLevel] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const refs = useRef<{
    stream?: MediaStream
    recorder?: MediaRecorder
    ctx?: AudioContext
    raf?: number
    timer?: number
    chunks: Blob[]
    resolve?: (b: Blob | null) => void
  }>({ chunks: [] })

  const cleanup = useCallback(() => {
    const r = refs.current
    if (r.raf) cancelAnimationFrame(r.raf)
    if (r.timer) clearInterval(r.timer)
    r.stream?.getTracks().forEach((t) => t.stop())
    r.ctx?.close().catch(() => undefined)
    r.stream = undefined
    r.ctx = undefined
    setLevel(0)
  }, [])

  const stop = useCallback(() => {
    const rec = refs.current.recorder
    if (rec && rec.state !== 'inactive') rec.stop()
  }, [])

  /** Start recording; resolves with the audio when recording stops (null if nothing was captured). */
  const start = useCallback(
    async (opts: RecorderOptions = {}): Promise<Blob | null> => {
      setError(null)
      if (!recordingSupported()) {
        setError('Audio recording is not supported in this browser. Please type your answer.')
        return null
      }
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      } catch (e) {
        setError(
          (e as DOMException)?.name === 'NotAllowedError'
            ? 'Microphone access was blocked. Allow it in your browser’s site settings, or type your answer.'
            : 'No microphone was found. Connect one or type your answer.',
        )
        return null
      }
      const mimeType = pickRecordingMime()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const r = refs.current
      r.stream = stream
      r.recorder = recorder
      r.chunks = []

      // Level meter + silence detection
      const ctx = new AudioContext()
      r.ctx = ctx
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      ctx.createMediaStreamSource(stream).connect(analyser)
      const buf = new Float32Array(analyser.fftSize)
      let spoke = false
      let lastLoud = performance.now()
      const startedAt = performance.now()
      const tick = () => {
        analyser.getFloatTimeDomainData(buf)
        let sum = 0
        for (const v of buf) sum += v * v
        const rms = Math.sqrt(sum / buf.length)
        setLevel(Math.min(1, rms * 8))
        const now = performance.now()
        if (rms > SPEECH_THRESHOLD) {
          spoke = true
          lastLoud = now
        }
        if (opts.silenceMs && spoke && now - lastLoud > opts.silenceMs) return stop()
        if (opts.silenceMs && !spoke && now - startedAt > 15000) return stop() // nothing said for 15 s
        r.raf = requestAnimationFrame(tick)
      }
      r.raf = requestAnimationFrame(tick)

      setSeconds(0)
      r.timer = window.setInterval(() => {
        setSeconds((s) => {
          if (opts.maxSeconds && s + 1 >= opts.maxSeconds) stop()
          return s + 1
        })
      }, 1000)

      return new Promise<Blob | null>((resolve) => {
        recorder.ondataavailable = (e) => e.data.size && r.chunks.push(e.data)
        recorder.onstop = () => {
          cleanup()
          setState('idle')
          const blob = new Blob(r.chunks, { type: recorder.mimeType || mimeType || 'audio/webm' })
          resolve(blob.size > 1500 ? blob : null)
        }
        recorder.start(250)
        setState('recording')
      })
    },
    [cleanup, stop],
  )

  const transcribe = useCallback(async (blob: Blob, questionId?: string): Promise<string | null> => {
    setState('transcribing')
    try {
      const form = new FormData()
      const type = blob.type.split(';')[0] || 'audio/webm'
      const ext = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm'
      form.append('audio', new File([blob], `answer.${ext}`, { type }))
      if (questionId) form.append('question_id', questionId)
      const { text } = await api.upload<{ text: string }>('/api/voice/transcribe', form)
      return text
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Transcription failed. You can type your answer instead.')
      return null
    } finally {
      setState('idle')
    }
  }, [])

  // Release the microphone when the component unmounts.
  useEffect(
    () => () => {
      const rec = refs.current.recorder
      if (rec && rec.state !== 'inactive') {
        rec.onstop = null
        rec.stop()
      }
      cleanup()
    },
    [cleanup],
  )

  return { state, level, seconds, error, setError, start, stop, transcribe }
}
