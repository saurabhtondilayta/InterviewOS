import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const postForBlob = vi.fn()
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, api: { ...actual.api, postForBlob: (...a: unknown[]) => postForBlob(...a) } }
})

class FakeUtterance {
  text: string
  lang = ''
  voice: unknown = null
  rate = 1
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(text: string) {
    this.text = text
  }
}

function installSpeechSynthesis() {
  const spoken: string[] = []
  const synth = {
    speaking: false,
    pending: false,
    paused: false,
    getVoices: () => [{ lang: 'en-US', name: 'Google US English' }],
    addEventListener: vi.fn(),
    cancel: vi.fn(),
    resume: vi.fn(),
    speak: (u: FakeUtterance) => {
      spoken.push(u.text)
      setTimeout(() => u.onend?.(), 0)
    },
  }
  vi.stubGlobal('speechSynthesis', synth)
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
  return spoken
}

describe('interviewer voice', () => {
  beforeEach(() => {
    vi.resetModules()
    postForBlob.mockReset()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('falls back to the browser voice when the server voice model is not enabled', async () => {
    const { ApiError } = await import('@/lib/api')
    postForBlob.mockRejectedValue(new ApiError(502, 'ai_model_unavailable', 'terms not accepted'))
    const spoken = installSpeechSynthesis()
    const { speak, voiceIsServer } = await import('@/lib/speech')
    await speak('Question 1. What is a process? And what is a thread?')
    expect(spoken).toEqual(['Question 1.', 'What is a process?', 'And what is a thread?'])
    expect(voiceIsServer()).toBe(false)
    // Subsequent calls don't retry the server for this session.
    await speak('Next.')
    expect(postForBlob).toHaveBeenCalledTimes(1)
  })

  it('does not race cancel() and speak(): waits when something is already speaking', async () => {
    const spoken = installSpeechSynthesis()
    ;(window.speechSynthesis as unknown as { speaking: boolean }).speaking = true
    const { speak } = await import('@/lib/speech')
    await speak('Hello there.', { preferServer: false })
    expect(window.speechSynthesis.cancel).toHaveBeenCalled()
    expect(spoken).toEqual(['Hello there.'])
  })

  it('strips markdown before speaking', async () => {
    const spoken = installSpeechSynthesis()
    const { speak } = await import('@/lib/speech')
    await speak('**Bold** `code` tip.', { preferServer: false })
    expect(spoken).toEqual(['Bold code tip.'])
  })
})

describe('recording support', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('picks a supported recording format', async () => {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: (m: string) => m === 'audio/webm' })
    const { pickRecordingMime } = await import('@/lib/speech')
    expect(pickRecordingMime()).toBe('audio/webm')
  })
})
