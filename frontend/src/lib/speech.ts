/**
 * Browser speech helpers.
 *
 * - Text-to-speech uses the Web Speech API's speechSynthesis (widely supported).
 * - Speech-to-text uses SpeechRecognition where available (Chrome, Edge, Safari). In Chrome and
 *   Edge the audio is processed by the browser vendor's online speech service. Interim results
 *   give a near-live transcript while the user speaks; final accuracy depends on the browser.
 * - Nothing is recorded unless the user presses "Start speaking", and recognition stops when they
 *   press "Stop" or leave the page.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

interface SpeechRecognitionAlternativeLike {
  transcript: string
}
interface SpeechRecognitionResultLike {
  readonly isFinal: boolean
  readonly length: number
  [index: number]: SpeechRecognitionAlternativeLike
}
interface SpeechRecognitionEventLike {
  readonly resultIndex: number
  readonly results: { readonly length: number; [index: number]: SpeechRecognitionResultLike }
}
interface SpeechRecognitionErrorEventLike {
  readonly error: string
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

export function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window

export function speak(text: string, opts: { lang?: string; onEnd?: () => void } = {}) {
  if (!ttsSupported()) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = opts.lang ?? 'en-US'
  u.rate = 0.98
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang === u.lang && /natural|google|microsoft/i.test(v.name))
  if (voice) u.voice = voice
  u.onend = () => opts.onEnd?.()
  u.onerror = () => opts.onEnd?.()
  window.speechSynthesis.speak(u)
}

export function stopSpeaking() {
  if (ttsSupported()) window.speechSynthesis.cancel()
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

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'Microphone access was blocked. Allow it in your browser settings or switch to typing.',
  'service-not-allowed': 'Speech recognition is not allowed in this browser. Switch to typing.',
  'no-speech': "We didn't hear anything. Check your microphone and try again.",
  'audio-capture': 'No microphone was found. Connect one or switch to typing.',
  network: 'Speech recognition needs an internet connection to your browser’s speech service. Try again or type your answer.',
  aborted: '',
}

export function useSpeechRecognition(lang: string) {
  const Ctor = getRecognitionCtor()
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const finalRef = useRef('')
  const [listening, setListening] = useState(false)
  const [finalText, setFinalText] = useState('')
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)

  const stop = useCallback(() => {
    recRef.current?.stop()
  }, [])

  const start = useCallback(
    (initial = '') => {
      if (!Ctor) return
      setError(null)
      finalRef.current = initial ? initial.trimEnd() + ' ' : ''
      setFinalText(finalRef.current)
      setInterim('')
      const rec = new Ctor()
      rec.lang = lang
      rec.continuous = true
      rec.interimResults = true
      rec.onresult = (e) => {
        let interimText = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i]
          if (r.isFinal) finalRef.current += r[0].transcript.trim() + ' '
          else interimText += r[0].transcript
        }
        setFinalText(finalRef.current)
        setInterim(interimText)
      }
      rec.onerror = (e) => {
        const msg = ERROR_MESSAGES[e.error] ?? 'Speech recognition stopped unexpectedly. You can keep typing instead.'
        if (msg) setError(msg)
      }
      rec.onend = () => {
        setListening(false)
        setInterim('')
        recRef.current = null
      }
      recRef.current = rec
      try {
        rec.start()
        setListening(true)
      } catch {
        setError('Could not start speech recognition. Try again or type your answer.')
      }
    },
    [Ctor, lang],
  )

  useEffect(() => () => recRef.current?.abort(), [])

  return { supported: Boolean(Ctor), listening, finalText, interim, error, start, stop, setFinalText }
}
