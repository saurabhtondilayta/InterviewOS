/**
 * Live 1-on-1 video interview: browser-to-browser WebRTC.
 *
 * Signalling (offer/answer/ICE candidates) travels over a Supabase Realtime broadcast channel
 * named after the invitation's secret room token, which only the invited candidate and the
 * company's members receive from the backend. Media flows directly between the two browsers
 * (STUN for NAT traversal; an optional TURN relay can be configured on the backend).
 *
 * The interviewer always makes the offer, so it doesn't matter who joins first:
 *   candidate joins -> "hello"  -> interviewer offers
 *   interviewer joins -> "hello" -> candidate replies "ready" -> interviewer offers
 */
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

export type CallRole = 'interviewer' | 'candidate'
export type CallState = 'idle' | 'waiting' | 'connecting' | 'connected' | 'reconnecting' | 'ended' | 'failed'

type Signal =
  | { kind: 'hello'; from: CallRole }
  | { kind: 'ready'; from: CallRole }
  | { kind: 'description'; from: CallRole; description: RTCSessionDescriptionInit }
  | { kind: 'candidate'; from: CallRole; candidate: RTCIceCandidateInit }
  | { kind: 'bye'; from: CallRole }

export function useLocalMedia(enabled: boolean) {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled) return
    let s: MediaStream | null = null
    let cancelled = false
    navigator.mediaDevices
      .getUserMedia({ video: { width: 1280, height: 720 }, audio: { echoCancellation: true, noiseSuppression: true } })
      .then((media) => {
        if (cancelled) return media.getTracks().forEach((t) => t.stop())
        s = media
        setStream(media)
      })
      .catch((e: DOMException) =>
        setError(e?.name === 'NotAllowedError' ? 'Camera and microphone access are required. Allow them in your browser settings.' : 'No camera or microphone was found.'),
      )
    return () => {
      cancelled = true
      s?.getTracks().forEach((t) => t.stop())
    }
  }, [enabled])
  return { stream, error }
}

export function useLiveCall(opts: { roomToken: string | null; role: CallRole; iceServers: RTCIceServer[]; localStream: MediaStream | null }) {
  const { roomToken, role, iceServers, localStream } = opts
  const [state, setState] = useState<CallState>('idle')
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [peerLeft, setPeerLeft] = useState(false)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const chRef = useRef<RealtimeChannel | null>(null)

  const send = useCallback((msg: Signal) => {
    void chRef.current?.send({ type: 'broadcast', event: 'signal', payload: msg })
  }, [])

  useEffect(() => {
    if (!roomToken || !localStream) return
    const pc = new RTCPeerConnection({ iceServers })
    pcRef.current = pc
    localStream.getTracks().forEach((t) => pc.addTrack(t, localStream))
    setState('waiting')

    const offer = async () => {
      if (role !== 'interviewer') return
      setState((s) => (s === 'connected' ? s : 'connecting'))
      const desc = await pc.createOffer({ iceRestart: pc.connectionState === 'failed' || pc.connectionState === 'disconnected' })
      await pc.setLocalDescription(desc)
      send({ kind: 'description', from: role, description: pc.localDescription!.toJSON() })
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) send({ kind: 'candidate', from: role, candidate: e.candidate.toJSON() })
    }
    pc.ontrack = (e) => setRemoteStream(e.streams[0] ?? new MediaStream([e.track]))
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState
      if (s === 'connected') {
        setState('connected')
        setPeerLeft(false)
      } else if (s === 'disconnected') setState('reconnecting')
      else if (s === 'failed') {
        setState('reconnecting')
        void offer() // ICE restart (interviewer side)
      }
    }

    const pendingCandidates: RTCIceCandidateInit[] = []
    const ch = supabase.channel(`live:${roomToken}`, { config: { broadcast: { self: false } } })
    chRef.current = ch
    ch.on('broadcast', { event: 'signal' }, async ({ payload }: { payload: Signal }) => {
      if (payload.from === role) return
      try {
        if (payload.kind === 'hello') {
          setPeerLeft(false)
          if (role === 'interviewer') await offer()
          else send({ kind: 'ready', from: role })
        } else if (payload.kind === 'ready') {
          if (role === 'interviewer') await offer()
        } else if (payload.kind === 'description') {
          await pc.setRemoteDescription(payload.description)
          for (const c of pendingCandidates.splice(0)) await pc.addIceCandidate(c).catch(() => undefined)
          if (payload.description.type === 'offer') {
            setState((s) => (s === 'connected' ? s : 'connecting'))
            await pc.setLocalDescription(await pc.createAnswer())
            send({ kind: 'description', from: role, description: pc.localDescription!.toJSON() })
          }
        } else if (payload.kind === 'candidate') {
          if (pc.remoteDescription) await pc.addIceCandidate(payload.candidate).catch(() => undefined)
          else pendingCandidates.push(payload.candidate)
        } else if (payload.kind === 'bye') {
          setPeerLeft(true)
          setRemoteStream(null)
          setState('waiting')
        }
      } catch {
        setState('failed')
      }
    })
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') send({ kind: 'hello', from: role })
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setState('failed')
    })

    return () => {
      send({ kind: 'bye', from: role })
      void supabase.removeChannel(ch)
      pc.close()
      pcRef.current = null
      chRef.current = null
    }
  }, [roomToken, role, iceServers, localStream, send])

  const hangUp = useCallback(() => {
    send({ kind: 'bye', from: role })
    pcRef.current?.close()
    setState('ended')
  }, [role, send])

  return { state, remoteStream, peerLeft, hangUp }
}

export function setTrackEnabled(stream: MediaStream | null, kind: 'audio' | 'video', enabled: boolean) {
  stream?.getTracks().filter((t) => t.kind === kind).forEach((t) => (t.enabled = enabled))
}
