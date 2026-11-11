'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseClient, isSupabaseConfigured } from './supabase'

type VoiceState = 'idle' | 'calling' | 'incoming' | 'connected'

type VoiceSignal =
  | { type: 'offer'; from: string; offer: RTCSessionDescriptionInit }
  | { type: 'answer'; from: string; answer: RTCSessionDescriptionInit }
  | { type: 'ice'; from: string; candidate: RTCIceCandidateInit }
  | { type: 'hangup'; from: string }

function pairChannel(a: string, b: string) {
  return `mpd-voice-${[a, b].sort().join('-')}`
}

export function useVoiceChat(userId: string, targetUserId: string | null) {
  const [state, setState] = useState<VoiceState>('idle')
  const [error, setError] = useState('')
  const [remoteName, setRemoteName] = useState('')
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([])
  const pendingOffer = useRef<RTCSessionDescriptionInit | null>(null)
  const supabaseRef = useRef<SupabaseClient | null>(null)

  const closePeer = useCallback(() => {
    pcRef.current?.getSenders().forEach((sender) => sender.track?.stop())
    pcRef.current?.close()
    pcRef.current = null
    localStreamRef.current?.getTracks().forEach((track) => track.stop())
    localStreamRef.current = null
    pendingCandidates.current = []
    pendingOffer.current = null
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null
  }, [])

  const broadcast = useCallback(async (payload: VoiceSignal) => {
    if (!channelRef.current) return
    await channelRef.current.send({ type: 'broadcast', event: 'voice', payload })
  }, [])

  const setupPeer = useCallback(async () => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    })
    pcRef.current = pc
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        void broadcast({ type: 'ice', from: userId, candidate: event.candidate.toJSON() })
      }
    }
    pc.ontrack = (event) => {
      if (!remoteAudioRef.current) {
        const audio = document.createElement('audio')
        audio.autoplay = true
        audio.style.display = 'none'
        document.body.appendChild(audio)
        remoteAudioRef.current = audio
      }
      remoteAudioRef.current.srcObject = event.streams[0]
      void remoteAudioRef.current.play().catch(() => undefined)
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setState('connected')
      if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) setState('idle')
    }
    return pc
  }, [broadcast, userId])

  const ensureLocalAudio = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })
    localStreamRef.current = stream
    return stream
  }, [])

  useEffect(() => {
    if (!userId || !targetUserId || !isSupabaseConfigured()) {
      closePeer()
      setState('idle')
      return
    }
    const supabase = getSupabaseClient()
    if (!supabase) return
    supabaseRef.current = supabase
    let active = true
    const channel = supabase.channel(pairChannel(userId, targetUserId))
    channelRef.current = channel
    channel.on('broadcast', { event: 'voice' }, async ({ payload }) => {
      const signal = payload as VoiceSignal
      if (!active || signal.from === userId) return
      try {
        if (signal.type === 'offer') {
          pendingOffer.current = signal.offer
          setRemoteName('상대방')
          setState('incoming')
          return
        }
        if (signal.type === 'answer' && pcRef.current) {
          await pcRef.current.setRemoteDescription(signal.answer)
          for (const candidate of pendingCandidates.current.splice(0)) await pcRef.current.addIceCandidate(candidate)
          return
        }
        if (signal.type === 'ice') {
          if (pcRef.current?.remoteDescription) await pcRef.current.addIceCandidate(signal.candidate)
          else pendingCandidates.current.push(signal.candidate)
          return
        }
        if (signal.type === 'hangup') {
          closePeer()
          setState('idle')
        }
      } catch (voiceError) {
        console.error('[MPD Voice] signaling error', voiceError)
        setError('음성 연결 과정에서 문제가 발생했습니다.')
      }
    })
    channel.subscribe()
    return () => {
      active = false
      void channel.unsubscribe()
      channelRef.current = null
      closePeer()
    }
  }, [closePeer, targetUserId, userId])

  const startCall = useCallback(async () => {
    setError('')
    if (!targetUserId || !userId || !isSupabaseConfigured()) {
      setError('Supabase 실시간 연결이 필요합니다.')
      return
    }
    try {
      const stream = await ensureLocalAudio()
      const pc = await setupPeer()
      stream.getTracks().forEach((track) => pc.addTrack(track, stream))
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      await broadcast({ type: 'offer', from: userId, offer })
      setState('calling')
    } catch (voiceError) {
      console.error('[MPD Voice] start failed', voiceError)
      setError('마이크 권한을 허용해야 음성통화를 시작할 수 있습니다.')
      closePeer()
      setState('idle')
    }
  }, [broadcast, closePeer, ensureLocalAudio, setupPeer, targetUserId, userId])

  const acceptCall = useCallback(async () => {
    if (!pendingOffer.current) return
    setError('')
    try {
      const stream = await ensureLocalAudio()
      const pc = await setupPeer()
      stream.getTracks().forEach((track) => pc.addTrack(track, stream))
      await pc.setRemoteDescription(pendingOffer.current)
      pendingOffer.current = null
      for (const candidate of pendingCandidates.current.splice(0)) await pc.addIceCandidate(candidate)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await broadcast({ type: 'answer', from: userId, answer })
      setState('calling')
    } catch (voiceError) {
      console.error('[MPD Voice] accept failed', voiceError)
      setError('음성통화를 연결하지 못했습니다.')
      closePeer()
      setState('idle')
    }
  }, [broadcast, closePeer, ensureLocalAudio, setupPeer, userId])

  const endCall = useCallback(() => {
    void broadcast({ type: 'hangup', from: userId })
    closePeer()
    setState('idle')
    setError('')
  }, [broadcast, closePeer, userId])

  useEffect(() => () => {
    if (remoteAudioRef.current) remoteAudioRef.current.remove()
    closePeer()
  }, [closePeer])

  return { state, error, remoteName, startCall, acceptCall, endCall }
}
