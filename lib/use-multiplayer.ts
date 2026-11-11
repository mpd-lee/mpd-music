'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabaseClient, isSupabaseConfigured } from './supabase'

export type StudioPlayer = {
  userId: string
  name: string
  position: [number, number, number]
  rotationY: number
}

export type VoiceSignal = {
  type: 'offer' | 'answer' | 'ice' | 'hangup'
  fromId: string
  fromName: string
  toId: string
  sdp?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
  sentAt?: number
}

type PresencePayload = Record<string, unknown> & {
  userId?: string
  name?: string
  position?: unknown
  rotationY?: number
  onlineAt?: string
}

function voiceTopicForPair(firstUserId: string, secondUserId: string) {
  return `mpd-studio-voice:${[firstUserId, secondUserId].sort().join(':')}`
}

function makeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `guest-${Math.random().toString(36).slice(2)}-${Date.now()}`
}

function makeGuestName(userId: string) {
  // Short, easy-to-read visitor code. The Supabase UUID remains the real
  // private identity; this six-digit code is only the public display name.
  let hash = 2166136261
  for (let index = 0; index < userId.length; index += 1) {
    hash ^= userId.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  const suffix = (hash >>> 0) % 1_000_000
  return `MPD-${String(suffix).padStart(6, '0')}`
}

function resolveDisplayName(userId: string) {
  try {
    const url = new URL(window.location.href)
    if (url.searchParams.get('mpd-owner') === '1') {
      localStorage.setItem('mpd-studio-display-owner', '1')
      localStorage.setItem('mpd-studio-user-name', 'MPD-Lee')
      url.searchParams.delete('mpd-owner')
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    }

    if (localStorage.getItem('mpd-studio-display-owner') === '1' || localStorage.getItem('mpd-studio-owner') === '1') {
      localStorage.setItem('mpd-studio-user-name', 'MPD-Lee')
      return 'MPD-Lee'
    }

    const saved = localStorage.getItem('mpd-studio-user-name')
    if (saved === 'mpd-lee' || saved === 'MPD-Lee') {
      localStorage.setItem('mpd-studio-display-owner', '1')
      localStorage.setItem('mpd-studio-user-name', 'MPD-Lee')
      return 'MPD-Lee'
    }
    if (saved && /^MPD-\d{6}$/.test(saved)) return saved

    const name = makeGuestName(userId)
    localStorage.setItem('mpd-studio-user-name', name)
    return name
  } catch {
    return makeGuestName(userId)
  }
}

function getLocalIdentity() {
  let userId = makeId()
  try {
    userId = sessionStorage.getItem('mpd-studio-user-id') || userId
    sessionStorage.setItem('mpd-studio-user-id', userId)
  } catch {
    // Continue with a page-session identity if storage is blocked.
  }
  return { userId, userName: resolveDisplayName(userId) }
}

function readPosition(value: unknown): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) return [0, 0, 4.2]
  return [Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0]
}

export function useMultiplayer(enabled = true) {
  const [userId, setUserId] = useState('')
  const [isOwner, setIsOwner] = useState(false)
  const [userName, setUserName] = useState('')
  const [players, setPlayers] = useState<StudioPlayer[]>([])
  const [connection, setConnection] = useState<'connecting' | 'online' | 'preview' | 'error'>('connecting')
  const channelRef = useRef<RealtimeChannel | null>(null)
  const voiceChannelsRef = useRef(new Map<string, RealtimeChannel>())
  const voiceChannelReadyRef = useRef(new Map<string, Promise<boolean>>())
  const lastPublishedAt = useRef(0)
  const latestPosition = useRef<StudioPlayer['position']>([0, 0, 4.2])
  const latestRotation = useRef(Math.PI)
  const positionPublishInterval = useRef(150)

  useEffect(() => {
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string } }
    const mobileClient = window.matchMedia('(pointer: coarse)').matches
      || window.innerWidth < 820
      || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
      || (nav.deviceMemory ?? 8) <= 4
      || Boolean(nav.connection?.saveData)
    positionPublishInterval.current = mobileClient ? 220 : 150
  }, [])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let channel: RealtimeChannel | null = null
    let heartbeat: ReturnType<typeof setInterval> | null = null

    const usePreviewIdentity = () => {
      const identity = getLocalIdentity()
      if (!cancelled) {
        setUserId(identity.userId)
        setUserName(identity.userName)
        setIsOwner(false)
        setPlayers([])
        setConnection('preview')
      }
    }

    const start = async () => {
      if (!isSupabaseConfigured()) {
        usePreviewIdentity()
        return
      }

      try {
        const supabase = getSupabaseClient()
        if (!supabase) {
          usePreviewIdentity()
          return
        }

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        let activeUserId = sessionData.session?.user.id
        if (!activeUserId) {
          const { data, error } = await supabase.auth.signInAnonymously()
          if (error) throw error
          activeUserId = data.user?.id
        }
        if (!activeUserId) throw new Error('Supabase 사용자 인증을 확인할 수 없습니다.')

        const ownerId = process.env.NEXT_PUBLIC_MPD_OWNER_USER_ID || ''
        const ownerMatch = Boolean(ownerId && activeUserId === ownerId)
        const localName = ownerMatch ? 'MPD-Lee' : resolveDisplayName(activeUserId)
        if (cancelled) return
        setUserId(activeUserId)
        setUserName(localName)
        setIsOwner(ownerMatch)

        channel = supabase.channel('mpd-studio-presence', {
          config: {
            private: true,
            presence: { key: activeUserId },
            broadcast: { ack: false, self: false },
          },
        })
        channelRef.current = channel

        const announceCurrentPosition = () => {
          if (!channel || cancelled) return
          void channel.send({
            type: 'broadcast',
            event: 'player-move',
            payload: {
              userId: activeUserId,
              name: localName,
              position: latestPosition.current,
              rotationY: latestRotation.current,
              sentAt: Date.now(),
            },
          }).catch((broadcastError) => console.warn('[MPD Studio] Initial avatar announcement failed:', broadcastError))
        }

        const syncPresence = () => {
          if (!channel) return
          const presence = channel.presenceState<PresencePayload>()
          const next = new Map<string, StudioPlayer>()
          Object.entries(presence).forEach(([key, values]) => {
            values.forEach((value) => {
              const id = String(value.userId || key)
              if (!id || id === activeUserId) return
              next.set(id, {
                userId: id,
                name: String(value.name || makeGuestName(id)),
                position: readPosition(value.position),
                rotationY: Number(value.rotationY) || 0,
              })
            })
          })
          setPlayers((current) => {
            const currentById = new Map(current.map((player) => [player.userId, player]))
            return [...next.values()].map((player) => {
              const latest = currentById.get(player.userId)
              return latest ? { ...player, position: latest.position, rotationY: latest.rotationY } : player
            })
          })
          // Presence stores only online identity. Every sync (including a new visitor joining)
          // triggers a one-time position announcement so late arrivals see everyone where they are.
          announceCurrentPosition()
        }

        channel
          .on('presence', { event: 'sync' }, syncPresence)
          .on('presence', { event: 'join' }, syncPresence)
          .on('presence', { event: 'leave' }, syncPresence)
          .on('broadcast', { event: 'player-move' }, ({ payload }) => {
            const value = payload as PresencePayload
            const id = String(value.userId || '')
            if (!id || id === activeUserId) return
            const player: StudioPlayer = {
              userId: id,
              name: String(value.name || makeGuestName(id)),
              position: readPosition(value.position),
              rotationY: Number(value.rotationY) || 0,
            }
            setPlayers((current) => {
              const index = current.findIndex((entry) => entry.userId === id)
              if (index < 0) return [...current, player]
              const next = current.slice()
              next[index] = player
              return next
            })
          })

        channel.subscribe(async (status, error) => {
          if (cancelled) return
          if (status === 'SUBSCRIBED') {
            try {
              const trackStatus = await channel?.track({
                userId: activeUserId,
                name: localName,
                position: latestPosition.current,
                rotationY: latestRotation.current,
                onlineAt: new Date().toISOString(),
              })
              if (trackStatus !== 'ok') throw new Error(`Presence track status: ${trackStatus || 'unknown'}`)
              announceCurrentPosition()
              if (!cancelled) setConnection('online')
              if (heartbeat) clearInterval(heartbeat)
              heartbeat = setInterval(() => {
                void channel?.track({
                  userId: activeUserId,
                  name: localName,
                  position: latestPosition.current,
                  rotationY: latestRotation.current,
                  onlineAt: new Date().toISOString(),
                })
              }, 25000)
            } catch (trackError) {
              console.warn('[MPD Studio] Presence tracking failed:', trackError)
              if (!cancelled) setConnection('preview')
            }
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.warn('[MPD Studio] Realtime presence status:', status, error)
            if (!cancelled) {
              setPlayers([])
              setConnection('preview')
            }
          }
        })
      } catch (error) {
        console.warn('[MPD Studio] Supabase unavailable; local preview only:', error)
        usePreviewIdentity()
      }
    }

    void start()
    return () => {
      cancelled = true
      if (heartbeat) clearInterval(heartbeat)
      if (channel) {
        void channel.untrack()
        void channel.unsubscribe()
      }
      channelRef.current = null
    }
  }, [enabled])

  const peerSignature = players.map((player) => player.userId).sort().join('|')

  // WebRTC negotiation stays in a private pair channel, not in the public-to-all
  // presence room. Channels are diffed as visitors join/leave so an active call
  // is not unnecessarily torn down when a third visitor enters the studio.
  useEffect(() => {
    if (!userId || connection !== 'online') {
      for (const channel of voiceChannelsRef.current.values()) void channel.unsubscribe()
      voiceChannelsRef.current.clear()
      voiceChannelReadyRef.current.clear()
      return
    }

    const supabase = getSupabaseClient()
    if (!supabase) return
    const peerIds = peerSignature.split('|').filter((id) => id && id !== userId)
    const desired = new Set(peerIds)

    for (const [peerId, channel] of voiceChannelsRef.current.entries()) {
      if (desired.has(peerId)) continue
      void channel.unsubscribe()
      voiceChannelsRef.current.delete(peerId)
      voiceChannelReadyRef.current.delete(peerId)
    }

    peerIds.forEach((peerId) => {
      if (voiceChannelsRef.current.has(peerId)) return
      let resolveReady: (ready: boolean) => void = () => undefined
      const ready = new Promise<boolean>((resolve) => { resolveReady = resolve })
      const channel = supabase.channel(voiceTopicForPair(userId, peerId), {
        config: { private: true, broadcast: { ack: true, self: false } },
      })
      channel.on('broadcast', { event: 'voice-signal' }, ({ payload }) => {
        const signal = payload as VoiceSignal
        if (!signal || signal.toId !== userId || signal.fromId !== peerId) return
        window.dispatchEvent(new CustomEvent<VoiceSignal>('mpd-studio-voice-signal', { detail: signal }))
      })
      voiceChannelsRef.current.set(peerId, channel)
      voiceChannelReadyRef.current.set(peerId, ready)
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolveReady(true)
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') resolveReady(false)
      })
    })
  }, [userId, connection, peerSignature])

  useEffect(() => () => {
    for (const channel of voiceChannelsRef.current.values()) void channel.unsubscribe()
    voiceChannelsRef.current.clear()
    voiceChannelReadyRef.current.clear()
  }, [])

  const publishPosition = useCallback((position: [number, number, number], rotationY: number) => {
    latestPosition.current = position
    latestRotation.current = rotationY
    const now = Date.now()
    if (now - lastPublishedAt.current < positionPublishInterval.current) return
    lastPublishedAt.current = now
    const channel = channelRef.current
    if (channel && connection === 'online') {
      // Presence is reserved for join/leave. Broadcast is designed for frequent movement updates.
      void channel.send({
        type: 'broadcast',
        event: 'player-move',
        payload: { userId, name: userName, position, rotationY, sentAt: now },
      }).then((status) => {
        if (status !== 'ok') console.warn('[MPD Studio] Player movement broadcast:', status)
      }).catch((error) => console.warn('[MPD Studio] Movement sync failed:', error))
    }
  }, [connection, userId, userName])

  const sendVoiceSignal = useCallback(async (toId: string, signal: Pick<VoiceSignal, 'type' | 'sdp' | 'candidate'>) => {
    if (connection !== 'online') throw new Error('실시간 채팅이 연결되어야 음성통화를 시작할 수 있습니다.')
    const channel = voiceChannelsRef.current.get(toId)
    const ready = voiceChannelReadyRef.current.get(toId)
    if (!channel || !ready || !(await ready)) throw new Error('상대방과의 보안 음성 채널이 아직 연결되지 않았습니다. 접속자 목록을 새로 확인해 주세요.')
    const status = await channel.send({
      type: 'broadcast',
      event: 'voice-signal',
      payload: { ...signal, fromId: userId, fromName: userName || 'MPD 방문자', toId, sentAt: Date.now() },
    })
    if (status !== 'ok') throw new Error(`음성 신호 전송 실패: ${status}`)
  }, [connection, userId, userName])

  return { userId, userName, players, connection, isOwner, publishPosition, sendVoiceSignal }
}
