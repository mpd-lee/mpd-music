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

function makeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `guest-${Math.random().toString(36).slice(2)}-${Date.now()}`
}

function makeName() {
  return `Guest-${Math.floor(1000 + Math.random() * 9000)}`
}

function getLocalIdentity() {
  let userId = makeId()
  let userName = makeName()
  try {
    userId = sessionStorage.getItem('mpd-studio-user-id') || userId
    userName = localStorage.getItem('mpd-studio-user-name') || userName
    sessionStorage.setItem('mpd-studio-user-id', userId)
    localStorage.setItem('mpd-studio-user-name', userName)
  } catch {
    // Private browsing or restrictive browser settings can block web storage.
    // The local preview still works for this page session.
  }
  return { userId, userName }
}

export function useMultiplayer() {
  const [userId, setUserId] = useState('')
  const [userName, setUserName] = useState('')
  const [players, setPlayers] = useState<StudioPlayer[]>([])
  const [connection, setConnection] = useState<'connecting' | 'online' | 'preview' | 'error'>('connecting')
  const channelRef = useRef<RealtimeChannel | null>(null)
  const lastPublishedAt = useRef(0)
  const latestPosition = useRef<StudioPlayer['position']>([0, 0, 4.2])
  const latestRotation = useRef(0)

  useEffect(() => {
    let cancelled = false
    let channel: RealtimeChannel | null = null

    const start = async () => {
      if (!isSupabaseConfigured()) {
        const identity = getLocalIdentity()
        if (!cancelled) {
          setUserId(identity.userId)
          setUserName(identity.userName)
          setConnection('preview')
        }
        return
      }

      try {
        const supabase = getSupabaseClient()
        if (!supabase) {
          const identity = getLocalIdentity()
          if (!cancelled) {
            setUserId(identity.userId)
            setUserName(identity.userName)
            setConnection('preview')
          }
          return
        }
        const { data: sessionData } = await supabase.auth.getSession()
        let activeUserId = sessionData.session?.user.id
        if (!activeUserId) {
          const { data, error } = await supabase.auth.signInAnonymously()
          if (error) throw error
          activeUserId = data.user?.id
        }
        if (!activeUserId) throw new Error('Supabase 사용자 인증을 확인할 수 없습니다.')

        const localName = localStorage.getItem('mpd-studio-user-name') || makeName()
        localStorage.setItem('mpd-studio-user-name', localName)
        if (cancelled) return
        setUserId(activeUserId)
        setUserName(localName)

        channel = supabase.channel('mpd-studio-presence', {
          config: { presence: { key: activeUserId } },
        })
        channelRef.current = channel
        channel.on('presence', { event: 'sync' }, () => {
          const presence = channel?.presenceState<Record<string, unknown>>() || {}
          const next: StudioPlayer[] = []
          Object.entries(presence).forEach(([key, values]) => {
            ;(values as Array<Record<string, unknown>>).forEach((value) => {
              if (value.userId === activeUserId) return
              const rawPosition = value.position
              const position = Array.isArray(rawPosition) && rawPosition.length === 3
                ? rawPosition.map((v) => Number(v) || 0) as [number, number, number]
                : [0, 0, 4.2] as [number, number, number]
              next.push({
                userId: String(value.userId || key),
                name: String(value.name || 'Guest'),
                position,
                rotationY: Number(value.rotationY) || 0,
              })
            })
          })
          setPlayers(next)
        })
        channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            try {
              await channel?.track({
                userId: activeUserId,
                name: localName,
                position: latestPosition.current,
                rotationY: latestRotation.current,
                onlineAt: new Date().toISOString(),
              })
              if (!cancelled) setConnection('online')
            } catch (error) {
              console.warn('[MPD Studio] Presence tracking unavailable; staying in preview mode:', error)
              if (!cancelled) setConnection('preview')
            }
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            if (!cancelled) setConnection('preview')
          }
        })
      } catch (error) {
        // A Supabase fetch failure must never prevent the 3D studio from opening.
        // Realtime chat, calls and uploads stay disabled until the connection returns.
        console.warn('[MPD Studio] Supabase is unavailable; opening local preview mode:', error)
        const identity = getLocalIdentity()
        if (!cancelled) {
          setUserId(identity.userId)
          setUserName(identity.userName)
          setPlayers([])
          setConnection('preview')
        }
      }
    }

    void start()
    return () => {
      cancelled = true
      if (channel) void channel.unsubscribe()
      channelRef.current = null
    }
  }, [])

  const publishPosition = useCallback((position: [number, number, number], rotationY: number) => {
    latestPosition.current = position
    latestRotation.current = rotationY
    const now = Date.now()
    if (now - lastPublishedAt.current < 140) return
    lastPublishedAt.current = now
    const channel = channelRef.current
    if (channel && connection === 'online') {
      void channel.track({ userId, name: userName, position, rotationY, onlineAt: new Date().toISOString() }).catch((error) => {
        console.warn('[MPD Studio] Position sync interrupted; switching to preview mode:', error)
        setConnection('preview')
      })
    }
  }, [connection, userId, userName])

  return { userId, userName, players, connection, publishPosition }
}
